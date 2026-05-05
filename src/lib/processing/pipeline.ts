import "server-only";

import { processDocument } from "@/lib/ai/process-document";
import { recordAudit } from "@/lib/audit";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { UploadedFileStatus } from "@/types/database";

interface DrainArgs {
  maxJobs?: number;
}

interface DrainResult {
  processed: number;
  failed: number;
  retried: number;
  recovered: number;
  jobs: Array<{
    id: string;
    status: "completed" | "failed" | "retry_scheduled";
    uploadedFileId: string;
  }>;
}

/** Hard ceiling so a buggy caller can't spin the loop forever. */
const ABSOLUTE_MAX_JOBS = 100;
/** A `running` job older than this is treated as a crashed worker and re-queued. */
const STALE_RUNNING_MS = 5 * 60 * 1000;
/** Cap stored error messages so a giant stack trace can't blow up the row. */
const ERROR_MESSAGE_MAX_LEN = 2000;
/** Statuses where it's still safe for the failure handler to flip the file
 * to `needs_review`. Any other status (`needs_review`, `needs_reupload`,
 * `accepted`, `rejected`, `exported`) is owned by either a successful
 * processing decision or a manual staff action and must not be overwritten. */
const FAILURE_TRANSITIONABLE_STATUSES: UploadedFileStatus[] = ["uploaded", "processing"];

function clampMaxJobs(maxJobs: number | undefined): number {
  if (typeof maxJobs !== "number" || !Number.isFinite(maxJobs)) return 10;
  return Math.max(1, Math.min(Math.floor(maxJobs), ABSOLUTE_MAX_JOBS));
}

function truncateMessage(input: string): string {
  if (input.length <= ERROR_MESSAGE_MAX_LEN) return input;
  return `${input.slice(0, ERROR_MESSAGE_MAX_LEN - 1)}…`;
}

/**
 * Re-queues `running` jobs whose `started_at` is older than STALE_RUNNING_MS.
 * These are almost certainly crashed workers (process kill, container
 * eviction, lost network during the final update). Without this sweep they'd
 * sit in `running` forever and never be retried.
 *
 * We also recover `running` rows whose `started_at` is NULL but whose
 * `created_at` is past the cutoff: PostgreSQL excludes NULL from `<`
 * comparisons, so without this fallback any row that ever ended up in
 * `running` without `started_at` set (rows from before migration 0005, or
 * from manual ops) would be stuck forever.
 *
 * We deliberately do NOT clobber any existing `error_message` on the row —
 * if the previous attempt failed and recorded a useful message, that's
 * exactly the breadcrumb operators want preserved. We only stamp a recovery
 * note when no prior message exists.
 */
async function recoverStaleJobs(): Promise<number> {
  const service = getServiceSupabase();
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  // Capture both `started_at < cutoff` AND `started_at IS NULL AND
  // created_at < cutoff`. PostgREST `or()` takes a comma-separated filter
  // list with `and(...)` for grouped conjunctions.
  const staleFilter = `started_at.lt.${cutoff},and(started_at.is.null,created_at.lt.${cutoff})`;

  // Two passes so we can write the recovery note only when error_message
  // is null — Supabase's update builder doesn't expose COALESCE, and a
  // single upsert would either always overwrite or always preserve.
  const { data: noMessage, error: noMessageError } = await service
    .from("processing_jobs")
    .update({
      status: "queued",
      started_at: null,
      error_message: "Recovered from stale 'running' state.",
    })
    .eq("status", "running")
    .or(staleFilter)
    .is("error_message", null)
    .select("id");
  if (noMessageError) {
    console.error("[pipeline] stale-job sweep (no-message branch) failed", noMessageError);
  }

  const { data: withMessage, error: withMessageError } = await service
    .from("processing_jobs")
    .update({
      status: "queued",
      started_at: null,
    })
    .eq("status", "running")
    .or(staleFilter)
    .not("error_message", "is", null)
    .select("id");
  if (withMessageError) {
    console.error("[pipeline] stale-job sweep (with-message branch) failed", withMessageError);
  }

  return (noMessage?.length ?? 0) + (withMessage?.length ?? 0);
}

/**
 * Drains the processing_jobs queue. Each iteration:
 *   1. Pulls the oldest `queued` job.
 *   2. Atomically claims it (UPDATE ... WHERE status='queued') so concurrent
 *      drainers don't double-process.
 *   3. Runs the AI orchestrator.
 *   4. On success: marks completed and records latency/provider.
 *      On failure: re-queues if attempts < max_attempts, otherwise marks
 *      failed and flips the file to needs_review (only if it wasn't already
 *      moved by a partial-success in processDocument).
 */
export async function drainProcessingQueue(args: DrainArgs = {}): Promise<DrainResult> {
  const maxJobs = clampMaxJobs(args.maxJobs);
  const service = getServiceSupabase();
  const result: DrainResult = { processed: 0, failed: 0, retried: 0, recovered: 0, jobs: [] };

  result.recovered = await recoverStaleJobs();

  // We loop on *successful claims* rather than raw iterations so that
  // contention (another worker grabbing our row between SELECT and UPDATE)
  // doesn't cut the drain short. A bounded `attempts` counter prevents an
  // infinite spin if the queue is being drained by many workers at once.
  let claimed = 0;
  let claimAttempts = 0;
  const maxClaimAttempts = maxJobs * 3;

  while (claimed < maxJobs && claimAttempts < maxClaimAttempts) {
    claimAttempts += 1;

    const { data: queued } = await service
      .from("processing_jobs")
      .select("id, organization_id, uploaded_file_id, attempts, max_attempts")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!queued) break;

    const startedAt = new Date();
    const startedAtPerf = performance.now();
    const claim = await service
      .from("processing_jobs")
      .update({
        status: "running",
        attempts: queued.attempts + 1,
        started_at: startedAt.toISOString(),
      })
      .eq("id", queued.id)
      .eq("status", "queued")
      .select("id")
      .single();
    if (claim.error || !claim.data) {
      // PostgREST returns code "PGRST116" / a not-found-shape error when the
      // row no longer matches the filter — that's the benign "another worker
      // won the race" case. Anything else is a real DB problem worth logging
      // so we don't silently spin claimAttempts.
      if (claim.error && claim.error.code && claim.error.code !== "PGRST116") {
        console.error("[pipeline] claim failed with unexpected error", {
          jobId: queued.id,
          code: claim.error.code,
          message: claim.error.message,
        });
      }
      continue;
    }

    claimed += 1;

    try {
      const outcome = await processDocument({
        uploadedFileId: queued.uploaded_file_id,
        organizationId: queued.organization_id,
      });
      const latencyMs = Math.round(performance.now() - startedAtPerf);
      const update = await service
        .from("processing_jobs")
        .update({
          status: "completed",
          error_message: null,
          provider: outcome.provider,
          completed_at: new Date().toISOString(),
          latency_ms: latencyMs,
        })
        .eq("id", queued.id);
      if (update.error) {
        // The work is done but we couldn't record it. The next stale-sweep
        // will eventually flip the row, but log loudly so this doesn't go
        // unnoticed.
        console.error("[pipeline] could not mark job completed", {
          jobId: queued.id,
          message: update.error.message,
        });
      }
      result.processed += 1;
      result.jobs.push({
        id: queued.id,
        status: "completed",
        uploadedFileId: queued.uploaded_file_id,
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Unknown error";
      const message = truncateMessage(rawMessage);
      const nextAttempts = queued.attempts + 1;
      const canRetry = nextAttempts < queued.max_attempts;
      const latencyMs = Math.round(performance.now() - startedAtPerf);

      console.error("[pipeline] job failed", {
        jobId: queued.id,
        attempt: nextAttempts,
        maxAttempts: queued.max_attempts,
        willRetry: canRetry,
        message,
      });

      if (canRetry) {
        // Re-queue for another drain pass. We don't backoff here; the cron
        // cadence is the de facto backoff. attempts is already incremented
        // by the claim, so the next try will see nextAttempts.
        const requeue = await service
          .from("processing_jobs")
          .update({
            status: "queued",
            error_message: message,
            started_at: null,
            completed_at: null,
            latency_ms: latencyMs,
          })
          .eq("id", queued.id);
        if (requeue.error) {
          // The row is still in `running` state — the next stale-job sweep
          // (≥ STALE_RUNNING_MS later) will recover it. We deliberately do
          // NOT bump `result.retried` here so the caller's metrics reflect
          // reality: this drain didn't actually reschedule the work.
          console.error("[pipeline] could not re-queue failed job", {
            jobId: queued.id,
            message: requeue.error.message,
          });
          result.failed += 1;
          result.jobs.push({
            id: queued.id,
            status: "failed",
            uploadedFileId: queued.uploaded_file_id,
          });
          continue;
        }
        result.retried += 1;
        result.jobs.push({
          id: queued.id,
          status: "retry_scheduled",
          uploadedFileId: queued.uploaded_file_id,
        });
        continue;
      }

      const fail = await service
        .from("processing_jobs")
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
          latency_ms: latencyMs,
        })
        .eq("id", queued.id);
      if (fail.error) {
        console.error("[pipeline] could not mark job failed", {
          jobId: queued.id,
          message: fail.error.message,
        });
      }

      // Only nudge the file to needs_review if processing didn't already
      // make a more-specific decision (e.g. needs_reupload via a successful
      // persist that then errored on a downstream insert) AND nothing has
      // changed under us in the meantime. Single conditional UPDATE so we
      // don't lose a concurrent staff decision (accepted / rejected /
      // requested re-upload) that landed after the file was first uploaded.
      const fileUpdate = await service
        .from("uploaded_files")
        .update({ status: "needs_review" satisfies UploadedFileStatus })
        .eq("id", queued.uploaded_file_id)
        .in("status", FAILURE_TRANSITIONABLE_STATUSES);
      if (fileUpdate.error) {
        // Surface this — silent failures here are how staff end up with files
        // sitting indefinitely in `processing` after a permanent failure.
        console.error("[pipeline] could not flip file to needs_review", {
          jobId: queued.id,
          uploadedFileId: queued.uploaded_file_id,
          message: fileUpdate.error.message,
        });
      }

      // Record a structured audit event so failures are visible in the
      // dashboard activity feed instead of only in console logs.
      await recordAudit({
        organizationId: queued.organization_id,
        actorType: "system",
        action: "file.processing_failed",
        entityType: "uploaded_file",
        entityId: queued.uploaded_file_id,
        metadata: {
          job_id: queued.id,
          attempts: nextAttempts,
          max_attempts: queued.max_attempts,
          error_message: message,
          latency_ms: latencyMs,
        },
      });

      result.failed += 1;
      result.jobs.push({
        id: queued.id,
        status: "failed",
        uploadedFileId: queued.uploaded_file_id,
      });
    }
  }

  return result;
}
