import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";

interface EnqueueArgs {
  organizationId: string;
  uploadedFileId: string;
  jobType?: import("@/types/database").JobType;
}

export async function enqueueProcessingJob({ organizationId, uploadedFileId, jobType = "convert" }: EnqueueArgs) {
  const service = getServiceSupabase();
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
  if (error) throw new Error(error.message);
  return data.id;
}
