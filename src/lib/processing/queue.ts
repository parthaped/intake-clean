import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";

interface EnqueueArgs {
  organizationId: string;
  uploadedFileId: string;
  jobType?: import("@/types/database").JobType;
}

/**
 * Enqueues a processing job for an uploaded file. Idempotent for in-flight
 * work: if a `queued` or `running` job already exists for the same file we
 * return its id instead of inserting a duplicate. The DB also enforces this
 * via a partial unique index (see 0006_processing_jobs_hardening.sql) so a
 * concurrent insert race can't smuggle a second row through.
 */
export async function enqueueProcessingJob({
  organizationId,
  uploadedFileId,
  jobType = "convert",
}: EnqueueArgs): Promise<string> {
  // Empty/whitespace IDs would silently match no rows on SELECT and then fail
  // the INSERT with a misleading FK error. Reject at the boundary so callers
  // get a precise message.
  if (typeof organizationId !== "string" || organizationId.trim() === "") {
    throw new Error("enqueueProcessingJob: organizationId is required.");
  }
  if (typeof uploadedFileId !== "string" || uploadedFileId.trim() === "") {
    throw new Error("enqueueProcessingJob: uploadedFileId is required.");
  }

  const service = getServiceSupabase();

  const { data: existing } = await service
    .from("processing_jobs")
    .select("id")
    .eq("uploaded_file_id", uploadedFileId)
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await service
    .from("processing_jobs")
    .insert({
      organization_id: organizationId,
      uploaded_file_id: uploadedFileId,
      job_type: jobType,
      status: "queued",
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation. The partial unique index fired because a
    // concurrent caller inserted between our SELECT and INSERT. Re-read and
    // return the winner instead of throwing.
    if (error.code === "23505") {
      const { data: winner } = await service
        .from("processing_jobs")
        .select("id")
        .eq("uploaded_file_id", uploadedFileId)
        .in("status", ["queued", "running"])
        .maybeSingle();
      if (winner?.id) return winner.id;
      // Race finished while we were re-reading: the winning job already
      // moved out of (queued, running) state. Look up the most recent job
      // for this file so the caller still gets a real id back. Previously
      // we threw here, which surfaced as a 500 in the upload route AFTER
      // the bucket+row had already been created — i.e. the user saw an
      // error for a successful upload.
      const { data: latest } = await service
        .from("processing_jobs")
        .select("id, status")
        .eq("uploaded_file_id", uploadedFileId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest?.id) return latest.id;
      // Truly nothing matches — this should be impossible given the unique
      // index just fired, but handle it explicitly rather than silently.
      throw new Error(
        `enqueueProcessingJob: unique-violation on file ${uploadedFileId} but no matching job row could be re-read.`,
      );
    }
    throw new Error(error.message);
  }
  return data.id;
}
