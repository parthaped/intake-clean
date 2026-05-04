import "server-only";

import { PDFDocument } from "pdf-lib";

import { recordAudit } from "@/lib/audit";
import { buildStorageKey } from "@/lib/tokens";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { Json, RequestItemStatus, UploadedFileStatus } from "@/types/database";

import { classifyDocument } from "./classify";
import { runDocumentAiQualityCheck } from "./google-docai";
import { heicToJpeg } from "./heic";
import { makeThumbnail, normaliseImage, type ImageMetricsResult } from "./image-prep";
import { runMockQualityCheck, type QualityResult } from "./mock";

interface DrainArgs {
  maxJobs?: number;
}

interface DrainResult {
  processed: number;
  failed: number;
  jobs: Array<{ id: string; status: "completed" | "failed"; uploadedFileId: string }>;
}

/**
 * Drains the processing_jobs queue. Each job claims itself by flipping to
 * 'running', runs the pipeline for that uploaded file, and records the
 * resulting quality_checks row + uploaded_files status.
 */
export async function drainProcessingQueue({ maxJobs = 10 }: DrainArgs = {}): Promise<DrainResult> {
  const service = getServiceSupabase();
  const result: DrainResult = { processed: 0, failed: 0, jobs: [] };

  for (let i = 0; i < maxJobs; i++) {
    const { data: queued } = await service
      .from("processing_jobs")
      .select("id, organization_id, uploaded_file_id, attempts")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!queued) break;

    const claim = await service
      .from("processing_jobs")
      .update({ status: "running", attempts: queued.attempts + 1 })
      .eq("id", queued.id)
      .eq("status", "queued")
      .select("id")
      .single();
    if (claim.error || !claim.data) continue;

    try {
      await processFile(queued.uploaded_file_id, queued.organization_id);
      await service.from("processing_jobs").update({ status: "completed", error_message: null }).eq("id", queued.id);
      result.processed += 1;
      result.jobs.push({ id: queued.id, status: "completed", uploadedFileId: queued.uploaded_file_id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[pipeline] job failed", { jobId: queued.id, message });
      await service
        .from("processing_jobs")
        .update({ status: "failed", error_message: message })
        .eq("id", queued.id);
      await service
        .from("uploaded_files")
        .update({ status: "needs_review" satisfies UploadedFileStatus })
        .eq("id", queued.uploaded_file_id);
      result.failed += 1;
      result.jobs.push({ id: queued.id, status: "failed", uploadedFileId: queued.uploaded_file_id });
    }
  }

  return result;
}

async function processFile(uploadedFileId: string, organizationId: string) {
  const service = getServiceSupabase();

  const { data: file, error } = await service
    .from("uploaded_files")
    .select(
      "id, organization_id, matter_id, request_item_id, original_file_name, original_mime_type, original_storage_path, file_size_bytes",
    )
    .eq("id", uploadedFileId)
    .maybeSingle();
  if (error || !file) throw new Error(error?.message ?? "Uploaded file not found");

  await service
    .from("uploaded_files")
    .update({ status: "processing" })
    .eq("id", uploadedFileId);

  const original = await service.storage.from("original-documents").download(file.original_storage_path);
  if (original.error || !original.data) throw new Error(original.error?.message ?? "Could not download original");
  const originalBuffer = Buffer.from(await original.data.arrayBuffer());

  let workingBuffer: Buffer = originalBuffer;
  let workingMime = file.original_mime_type;
  let processedKey: string | null = null;
  let thumbnailKey: string | null = null;
  let metrics: ImageMetricsResult | null = null;
  let pageCount: number | null = null;

  if (workingMime === "image/heic" || workingMime === "image/heif") {
    const converted = await heicToJpeg(workingBuffer);
    if (converted) {
      workingBuffer = converted;
      workingMime = "image/jpeg";
    }
  }

  if (workingMime.startsWith("image/")) {
    metrics = await normaliseImage(workingBuffer, workingMime);
    workingBuffer = metrics.buffer;
    workingMime = metrics.contentType;
  }

  if (workingMime === "application/pdf") {
    try {
      const pdf = await PDFDocument.load(workingBuffer, { ignoreEncryption: true });
      pageCount = pdf.getPageCount();
    } catch (err) {
      console.warn("[pipeline] could not read pdf metadata", err);
    }
  } else {
    pageCount = 1;
  }

  if (workingBuffer !== originalBuffer || workingMime !== file.original_mime_type) {
    processedKey = buildStorageKey({
      organizationId: file.organization_id,
      matterId: file.matter_id,
      scope: "processed",
      filename: rewriteExtension(file.original_file_name, workingMime),
    });
    const upload = await service.storage.from("processed-documents").upload(processedKey, workingBuffer, {
      contentType: workingMime,
      upsert: false,
    });
    if (upload.error) throw new Error(`Could not upload processed: ${upload.error.message}`);
  }

  if (workingMime.startsWith("image/")) {
    try {
      const thumb = await makeThumbnail(workingBuffer);
      thumbnailKey = buildStorageKey({
        organizationId: file.organization_id,
        matterId: file.matter_id,
        scope: "thumbnail",
        filename: rewriteExtension(file.original_file_name, "image/jpeg", "thumb"),
      });
      await service.storage.from("thumbnails").upload(thumbnailKey, thumb, {
        contentType: "image/jpeg",
        upsert: false,
      });
    } catch (err) {
      console.warn("[pipeline] thumbnail failed", err);
      thumbnailKey = null;
    }
  }

  const quality: QualityResult =
    (await runDocumentAiQualityCheck(workingBuffer, workingMime)) ?? runMockQualityCheck(metrics, workingMime);

  let itemTitle: string | null = null;
  let matterType = "other";
  if (file.request_item_id) {
    const { data: item } = await service
      .from("document_request_items")
      .select("title")
      .eq("id", file.request_item_id)
      .maybeSingle();
    itemTitle = item?.title ?? null;
  }
  const { data: matter } = await service.from("matters").select("matter_type").eq("id", file.matter_id).maybeSingle();
  if (matter?.matter_type) matterType = matter.matter_type;

  const classification = await classifyDocument({
    fileName: file.original_file_name,
    ocrText: quality.ocrText,
    mime: workingMime,
    matterType,
    itemTitle,
  });

  await service.from("quality_checks").insert({
    uploaded_file_id: file.id,
    blur_score: quality.blurScore,
    glare_detected: quality.glareDetected,
    low_contrast_detected: quality.lowContrastDetected,
    cut_off_edges_detected: quality.cutOffEdgesDetected,
    rotated_detected: quality.rotatedDetected,
    screenshot_detected: quality.screenshotDetected,
    handwriting_detected: quality.handwritingDetected,
    text_extraction_confidence: quality.textExtractionConfidence,
    issue_summary: quality.issueSummary,
    recommendation: quality.recommendation,
    raw_ai_json: {
      ...quality.rawAiJson,
      classification: { type: classification.type, confidence: classification.confidence, source: classification.source, reason: classification.reason },
    } as Json,
  });

  let nextFileStatus: UploadedFileStatus;
  if (quality.recommendation === "request_reupload") nextFileStatus = "needs_reupload";
  else nextFileStatus = "needs_review";

  await service
    .from("uploaded_files")
    .update({
      processed_storage_path: processedKey,
      thumbnail_storage_path: thumbnailKey,
      page_count: pageCount,
      detected_document_type: classification.type,
      status: nextFileStatus,
    })
    .eq("id", file.id);

  if (file.request_item_id) {
    const itemStatus: RequestItemStatus =
      quality.recommendation === "request_reupload" ? "needs_reupload" : "uploaded";
    await service.from("document_request_items").update({ status: itemStatus }).eq("id", file.request_item_id);
  }

  await service.from("review_tasks").insert({
    organization_id: organizationId,
    matter_id: file.matter_id,
    uploaded_file_id: file.id,
    status: "open",
  });

  await recordAudit({
    organizationId,
    actorType: "system",
    action: "file.processed",
    entityType: "uploaded_file",
    entityId: file.id,
    metadata: {
      recommendation: quality.recommendation,
      detected_document_type: classification.type,
      blur_score: quality.blurScore,
      mock: !!(quality.rawAiJson as { mock?: boolean }).mock,
    },
  });
}

function rewriteExtension(filename: string, mime: string, suffix?: string) {
  const base = filename.replace(/\.[^.]+$/, "");
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : "bin";
  return suffix ? `${base}-${suffix}.${ext}` : `${base}.${ext}`;
}
