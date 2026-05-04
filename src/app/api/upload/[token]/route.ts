import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/constants";
import { enqueueProcessingJob } from "@/lib/processing/queue";
import { getServiceSupabase } from "@/lib/supabase/service";
import { buildStorageKey } from "@/lib/tokens";

interface Context {
  params: Promise<{ token: string }>;
}

export async function POST(request: Request, context: Context) {
  const { token } = await context.params;
  const service = getServiceSupabase();

  const requestRow = await service
    .from("document_requests")
    .select("id, status, expires_at, organization_id, matter_id, client_id")
    .eq("token", token)
    .maybeSingle();

  if (!requestRow.data) {
    return new NextResponse("Invalid upload link", { status: 404 });
  }
  const docRequest = requestRow.data;
  if (docRequest.status === "expired" || docRequest.status === "closed") {
    return new NextResponse("This upload link has been closed", { status: 410 });
  }
  if (docRequest.expires_at && new Date(docRequest.expires_at).getTime() < Date.now()) {
    return new NextResponse("This upload link has expired", { status: 410 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return new NextResponse("File is required", { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return new NextResponse("File is over 50 MB", { status: 413 });
  }
  if (!ACCEPTED_FILE_TYPES.includes(file.type as (typeof ACCEPTED_FILE_TYPES)[number])) {
    return new NextResponse("File type not accepted", { status: 415 });
  }

  const requestItemId = formData.get("request_item_id");
  let validItemId: string | null = null;
  if (typeof requestItemId === "string" && requestItemId.length > 0) {
    const { data: item } = await service
      .from("document_request_items")
      .select("id")
      .eq("id", requestItemId)
      .eq("request_id", docRequest.id)
      .maybeSingle();
    if (item) validItemId = item.id;
  }

  const storageKey = buildStorageKey({
    organizationId: docRequest.organization_id,
    matterId: docRequest.matter_id,
    scope: "original",
    filename: file.name,
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await service.storage.from("original-documents").upload(storageKey, buffer, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (upload.error) {
    return new NextResponse(`Storage upload failed: ${upload.error.message}`, { status: 500 });
  }

  const { data: uploadedFile, error: insertErr } = await service
    .from("uploaded_files")
    .insert({
      organization_id: docRequest.organization_id,
      matter_id: docRequest.matter_id,
      request_id: docRequest.id,
      request_item_id: validItemId,
      client_id: docRequest.client_id,
      original_file_name: file.name,
      original_mime_type: file.type,
      original_storage_path: storageKey,
      file_size_bytes: file.size,
      uploaded_by_type: "client",
      status: "uploaded",
    })
    .select("id")
    .single();
  if (insertErr || !uploadedFile) {
    return new NextResponse(insertErr?.message ?? "Could not record upload", { status: 500 });
  }

  if (validItemId) {
    await service
      .from("document_request_items")
      .update({ status: "uploaded" })
      .eq("id", validItemId);
  }

  await service
    .from("matters")
    .update({ status: "in_review" })
    .eq("id", docRequest.matter_id)
    .in("status", ["active", "waiting_on_client"]);

  await service
    .from("document_requests")
    .update({ status: "partially_complete" })
    .eq("id", docRequest.id)
    .neq("status", "submitted");

  await enqueueProcessingJob({
    organizationId: docRequest.organization_id,
    uploadedFileId: uploadedFile.id,
    jobType: "convert",
  });

  await recordAudit({
    organizationId: docRequest.organization_id,
    actorType: "client",
    action: "file.uploaded",
    entityType: "uploaded_file",
    entityId: uploadedFile.id,
    metadata: { file_name: file.name, mime: file.type, size: file.size, request_id: docRequest.id },
  });

  // Trigger the processor synchronously (best-effort, fire and forget). In
  // production a cron or Edge Function would also drain the queue.
  try {
    await fetch(`${request.headers.get("origin") ?? ""}/api/process/run`, { method: "POST" }).catch(() => {});
  } catch {
    // ignored
  }

  return NextResponse.json({ ok: true, fileId: uploadedFile.id });
}
