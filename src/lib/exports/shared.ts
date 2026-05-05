import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import type {
  MatterStatus,
  MatterTypeT,
  RequestItemStatus,
  RequestStatus,
  UploadedFileStatus,
} from "@/types/database";

export interface ExportContext {
  organization: { id: string; name: string };
  matter: {
    id: string;
    matter_name: string;
    matter_type: MatterTypeT;
    status: MatterStatus;
    internal_reference: string | null;
  };
  client: { full_name: string; email: string | null; phone: string | null };
  acceptedFiles: AcceptedFileRow[];
  rejectedFiles: RejectedFileRow[];
  requests: RequestSummary[];
}

export interface RejectedFileRow {
  id: string;
  original_file_name: string;
  detected_document_type: string | null;
  status: UploadedFileStatus;
  /** Human-readable reason (from quality_checks.issue_summary or reviewer_notes). */
  reason: string | null;
  created_at: string;
}

export interface AcceptedFileRow {
  id: string;
  original_file_name: string;
  original_mime_type: string;
  original_storage_path: string;
  processed_storage_path: string | null;
  detected_document_type: string | null;
  packet_order: number | null;
  status: UploadedFileStatus;
  created_at: string;
}

export interface RequestSummary {
  id: string;
  title: string;
  status: RequestStatus;
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    required: boolean;
    status: RequestItemStatus;
  }>;
}

export async function loadExportContext(matterId: string, organizationId: string): Promise<ExportContext> {
  const service = getServiceSupabase();

  type MatterRow = {
    id: string;
    matter_name: string;
    matter_type: MatterTypeT;
    status: MatterStatus;
    internal_reference: string | null;
    organization_id: string;
    organizations: { id: string; name: string } | null;
    clients: { full_name: string; email: string | null; phone: string | null } | null;
  };

  const matterRes = await service
    .from("matters")
    .select(
      "id, matter_name, matter_type, status, internal_reference, organization_id, organizations(id, name), clients(full_name, email, phone)",
    )
    .eq("id", matterId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const matter = matterRes.data as MatterRow | null;
  if (!matter || !matter.organizations || !matter.clients) {
    throw new Error("Matter not found");
  }

  const filesRes = await service
    .from("uploaded_files")
    .select(
      "id, original_file_name, original_mime_type, original_storage_path, processed_storage_path, detected_document_type, packet_order, status, created_at",
    )
    .eq("matter_id", matter.id)
    .in("status", ["accepted", "exported"])
    .order("packet_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const acceptedFiles = (filesRes.data ?? []) as AcceptedFileRow[];

  type RejectedRow = {
    id: string;
    original_file_name: string;
    detected_document_type: string | null;
    status: UploadedFileStatus;
    created_at: string;
    quality_checks: Array<{ issue_summary: string | null }> | null;
    review_tasks: Array<{ reviewer_notes: string | null }> | null;
  };
  const rejectedRes = await service
    .from("uploaded_files")
    .select(
      "id, original_file_name, detected_document_type, status, created_at, quality_checks(issue_summary), review_tasks(reviewer_notes)",
    )
    .eq("matter_id", matter.id)
    .in("status", ["needs_reupload", "rejected"])
    .order("created_at", { ascending: false });
  const rejectedRaw = (rejectedRes.data ?? []) as unknown as RejectedRow[];
  const rejectedFiles: RejectedFileRow[] = rejectedRaw.map((row) => ({
    id: row.id,
    original_file_name: row.original_file_name,
    detected_document_type: row.detected_document_type,
    status: row.status,
    reason:
      row.review_tasks?.[0]?.reviewer_notes ??
      row.quality_checks?.[0]?.issue_summary ??
      null,
    created_at: row.created_at,
  }));

  type RequestRow = {
    id: string;
    title: string;
    status: RequestStatus;
    document_request_items: Array<{
      id: string;
      title: string;
      description: string | null;
      required: boolean;
      status: RequestItemStatus;
      sort_order: number;
    }>;
  };

  const requestsRes = await service
    .from("document_requests")
    .select(
      "id, title, status, document_request_items(id, title, description, required, status, sort_order)",
    )
    .eq("matter_id", matter.id)
    .order("created_at", { ascending: false });
  const requestsRaw = (requestsRes.data ?? []) as RequestRow[];
  const requests: RequestSummary[] = requestsRaw.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    items: r.document_request_items
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        required: item.required,
        status: item.status,
      })),
  }));

  return {
    organization: matter.organizations,
    matter: {
      id: matter.id,
      matter_name: matter.matter_name,
      matter_type: matter.matter_type,
      status: matter.status,
      internal_reference: matter.internal_reference,
    },
    client: matter.clients,
    acceptedFiles,
    rejectedFiles,
    requests,
  };
}

export async function downloadFileBuffer(path: string, bucket: "original-documents" | "processed-documents"): Promise<Buffer | null> {
  const service = getServiceSupabase();
  const result = await service.storage.from(bucket).download(path);
  if (result.error || !result.data) return null;
  return Buffer.from(await result.data.arrayBuffer());
}

export function sanitiseFileNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_ .]/g, "").trim().replace(/\s+/g, "_");
}
