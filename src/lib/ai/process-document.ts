import "server-only";

import { createHash } from "crypto";

import { PDFDocument } from "pdf-lib";

import { getAIProvider, getOCRProvider } from "@/lib/ai";
import { heicToJpeg } from "@/lib/ai/preprocess/heic";
import { makeThumbnail, normaliseImage, type ImageMetricsResult } from "@/lib/ai/preprocess/image-prep";
import { mockAIProvider, runMockQualityCheck } from "@/lib/ai/providers/mock-provider";
import { classifyByRules } from "@/lib/ai/rules/document-classifier";
import { runLocalQualityChecks } from "@/lib/ai/rules/quality-checks";
import type {
  DocumentClassificationResult,
  OCRResult,
  QualityCheckResult,
  VisionReviewResult,
} from "@/lib/ai/types";
import { recordAudit } from "@/lib/audit";
import { env, integrations } from "@/lib/env";
import { redactPII } from "@/lib/security/redact";
import { scanForViruses } from "@/lib/security/virus-scan";
import { getServiceSupabase } from "@/lib/supabase/service";
import { buildStorageKey } from "@/lib/tokens";
import { fingerprintFileName } from "@/lib/uploads/file-name-fingerprint";
import type {
  AIProviderName,
  Json,
  OcrEngineName,
  RequestItemStatus,
  UploadedFileStatus,
} from "@/types/database";

const RULES_CONFIDENCE_THRESHOLD = 0.7;
const SEVERE_FLAGS = new Set([
  "blur_detected",
  "cut_off_edges_detected",
  "screenshot_detected",
  "ocr_text_too_short",
]);

interface ProcessDocumentArgs {
  uploadedFileId: string;
  organizationId: string;
}

interface ProcessDocumentResult {
  uploadedFileId: string;
  provider: string;
  ocrEngine: OcrEngineName;
  status: UploadedFileStatus;
  detectedDocumentType: string | null;
  classificationSource: string;
  hfModelUsed: string | null;
  latencyMs: number;
}

/**
 * The single orchestrator for the budget AI pipeline. Steps:
 *   1. Load file metadata and the org's AI preference.
 *   2. Convert HEIC -> JPEG, normalise via sharp, generate thumbnail.
 *   3. Upload processed + thumbnail to Supabase Storage.
 *   4. Run OCR (tesseract.js / mock) with a graceful fallback.
 *   5. Run local quality checks; if severe, short-circuit to needs_reupload.
 *   6. Classify by rules; if confidence < threshold and HF allowed, ask HF.
 *   7. Persist quality_checks, update uploaded_files, insert review_tasks.
 *   8. Record audit log entries.
 */
export async function processDocument({ uploadedFileId, organizationId }: ProcessDocumentArgs): Promise<ProcessDocumentResult> {
  const startedAt = Date.now();
  const service = getServiceSupabase();

  const { data: file, error } = await service
    .from("uploaded_files")
    .select(
      "id, organization_id, matter_id, request_item_id, original_file_name, original_mime_type, original_storage_path, file_size_bytes",
    )
    .eq("id", uploadedFileId)
    .maybeSingle();
  if (error || !file) throw new Error(error?.message ?? "Uploaded file not found");

  await service.from("uploaded_files").update({ status: "processing" }).eq("id", uploadedFileId);

  // Load org-level AI preference (falls back to env when missing).
  const { data: org } = await service
    .from("organizations")
    .select("ai_provider, ai_settings")
    .eq("id", organizationId)
    .maybeSingle();
  const orgProvider = (org?.ai_provider ?? null) as AIProviderName | null;
  const orgAISettings = (org?.ai_settings ?? null) as Record<string, unknown> | null;
  // Per-firm vision opt-in. We deliberately require BOTH the env-level flag
  // (`USE_HF_VISION`) and the per-firm `use_hf_vision` setting before any
  // image is sent to a third-party multimodal model. Either one being false
  // is enough to skip the vision pass entirely.
  const orgVisionOptIn =
    typeof orgAISettings?.use_hf_vision === "boolean"
      ? (orgAISettings.use_hf_vision as boolean)
      : false;
  const visionAllowed =
    env.useHfVision && orgVisionOptIn && integrations.hasHuggingFace;

  // ---------- Layer 1: deterministic preprocessing ----------
  const original = await service.storage.from("original-documents").download(file.original_storage_path);
  if (original.error || !original.data) throw new Error(original.error?.message ?? "Could not download original");
  const originalBuffer = Buffer.from(await original.data.arrayBuffer());

  // ---------- Layer 0: malware scan ----------
  // Run BEFORE any code that opens, decodes, transcodes or renders the
  // bytes. If the scanner says "infected" we mark the row rejected, audit
  // the event with the scanner findings, and return early so the file is
  // never previewed in the staff UI and never embedded in an export.
  const scan = await scanForViruses(originalBuffer, file.original_mime_type, file.original_file_name);
  await service
    .from("uploaded_files")
    .update({
      virus_scan_status: scan.status,
      virus_scan_engine: scan.engine,
      virus_scan_findings: (scan.findings ?? null) as Json | null,
      virus_scanned_at: new Date().toISOString(),
    })
    .eq("id", uploadedFileId);

  if (scan.status === "infected") {
    await service
      .from("uploaded_files")
      .update({ status: "rejected" satisfies UploadedFileStatus })
      .eq("id", uploadedFileId);

    // Defense-in-depth: the upload route now scans pre-write, but if a row
    // ever reaches here with `infected` (older row, rescan after engine
    // updated, scanner caught a polyglot the upload-time pass missed) we
    // remove the bucket object so staff can't be tricked into previewing
    // it via a stale signed URL and so the bytes don't sit in storage
    // indefinitely. Errors are logged, not thrown — the row is already
    // marked rejected, that's the user-visible source of truth.
    const bucketCleanup = await service.storage
      .from("original-documents")
      .remove([file.original_storage_path]);
    if (bucketCleanup.error) {
      console.error("[ai/process] could not delete infected original from bucket", {
        path: file.original_storage_path,
        message: bucketCleanup.error.message,
      });
    }

    await recordAudit({
      organizationId,
      actorType: "system",
      action: "file.virus_detected",
      entityType: "uploaded_file",
      entityId: uploadedFileId,
      metadata: {
        scan_engine: scan.engine,
        file_name_sha256: fingerprintFileName(file.original_file_name).sha256,
        findings: (scan.findings ?? null) as Json | null,
      },
    });

    return {
      uploadedFileId: file.id,
      provider: "scanner-block",
      ocrEngine: "none",
      status: "rejected",
      detectedDocumentType: null,
      classificationSource: "fallback",
      hfModelUsed: null,
      latencyMs: Date.now() - startedAt,
    };
  }

  let workingBuffer: Buffer = originalBuffer;
  let workingMime = file.original_mime_type;
  let processedKey: string | null = null;
  let thumbnailKey: string | null = null;
  let thumbnailBuffer: Buffer | null = null;
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
      console.warn("[ai/process] could not read pdf metadata", err);
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
      thumbnailBuffer = thumb;
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
      console.warn("[ai/process] thumbnail failed", err);
      thumbnailKey = null;
      thumbnailBuffer = null;
    }
  }

  // ---------- Pure mock short-circuit ----------
  // When the org or env says AI_PROVIDER=mock or MOCK_AI=true we use the mock
  // quality + classification directly so demos work without any external
  // services (or any installed OCR engine).
  const providerName: AIProviderName = orgProvider ?? env.aiProvider;
  const isMockMode = integrations.useMockAi || providerName === "mock";

  // Look up checklist + matter context for downstream classification.
  const { data: matter } = await service.from("matters").select("matter_type").eq("id", file.matter_id).maybeSingle();
  const matterType = matter?.matter_type ?? "other";
  let itemTitle: string | null = null;
  if (file.request_item_id) {
    const { data: item } = await service
      .from("document_request_items")
      .select("title")
      .eq("id", file.request_item_id)
      .maybeSingle();
    itemTitle = item?.title ?? null;
  }

  if (isMockMode) {
    const quality = runMockQualityCheck({ metrics, mime: workingMime, matterType });
    const ocrText = pickMockText(matterType, workingMime);
    const classification = await mockAIProvider.classifyDocument({
      fileName: file.original_file_name,
      ocrText,
      mime: workingMime,
      matterType,
      itemTitle,
    });
    const decisionStatus: UploadedFileStatus =
      quality.recommendation === "request_reupload" ? "needs_reupload" : "needs_review";

    return persistAndReturn({
      file,
      organizationId,
      processedKey,
      thumbnailKey,
      pageCount,
      workingMime,
      quality,
      ocrResult: {
        text: ocrText ?? "",
        confidence: quality.textExtractionConfidence,
        engine: "mock",
        pages: pageCount ?? 1,
        rawJson: { mock: true },
        durationMs: 1,
      },
      classification: classification ?? {
        type: "Other / Unknown",
        confidence: 0.2,
        source: "fallback",
        reason: "Mock classifier returned no answer.",
      },
      providerName: "mock",
      hfModelUsed: null,
      hfLatencyMs: null,
      visionResult: null,
      visionLatencyMs: null,
      status: decisionStatus,
      startedAt,
    });
  }

  // ---------- Layer 2: local OCR ----------
  let ocrResult: OCRResult;
  if (workingMime.startsWith("image/") && env.useLocalOcr) {
    const ocrProvider = await getOCRProvider();
    try {
      ocrResult = await ocrProvider.ocr({ buffer: workingBuffer, mime: workingMime, lang: env.tesseractLang });
    } catch (err) {
      console.error("[ai/process] OCR failed; using empty fallback", err);
      ocrResult = { text: "", confidence: 0, engine: "none", pages: 1, rawJson: { error: String(err) }, durationMs: 0 };
    }
  } else {
    // PDFs aren't OCR'd in tesseract.js (Phase 4 limitation). We still
    // populate a minimal OCRResult so downstream code is uniform.
    ocrResult = {
      text: "",
      confidence: workingMime === "application/pdf" ? 0.85 : 0,
      engine: "none",
      pages: pageCount ?? 1,
      rawJson: { skipped: true, mime: workingMime },
      durationMs: 0,
    };
  }

  // ---------- Layer 3: rules first ----------
  const quality = runLocalQualityChecks({
    metrics,
    mime: workingMime,
    ocrText: ocrResult.text,
    ocrConfidence: ocrResult.confidence,
  });

  const severeFlag = quality.localFlags.firedFlags.some((f) => SEVERE_FLAGS.has(f));

  let classification: DocumentClassificationResult = await classifyByRules({
    fileName: file.original_file_name,
    ocrText: ocrResult.text,
    mime: workingMime,
    matterType,
    itemTitle,
  });

  let hfModelUsed: string | null = null;
  let hfLatencyMs: number | null = null;

  // ---------- Layer 4: optional Hugging Face escalation ----------
  // Only call HF when rules can't decide AND the org/env opted in AND we don't
  // already have a severe local flag (no point spending tokens on a doc we're
  // going to bounce anyway).
  if (
    !severeFlag &&
    env.useHfClassification &&
    classification.confidence < RULES_CONFIDENCE_THRESHOLD &&
    integrations.hasHuggingFace
  ) {
    try {
      // Strip SSN / passport / DOB / card / email / phone shapes before
      // shipping the OCR text off-platform. The classifier only needs
      // structural cues (document type), not the actual identifier values.
      // We also redact the filename — clients send things like
      // "passport_smith_ssn_1234.pdf" and we don't want that in the prompt.
      const redactedText = redactPII(ocrResult.text);
      const redactedFileName = redactPII(file.original_file_name);

      const provider = await getAIProvider(orgProvider);
      const hfStart = Date.now();
      const hfResult = await provider.classifyDocument({
        fileName: redactedFileName.text,
        ocrText: redactedText.text,
        mime: workingMime,
        matterType,
        itemTitle,
      });
      hfLatencyMs = Date.now() - hfStart;
      if (hfResult && hfResult.confidence > classification.confidence) {
        classification = hfResult;
        hfModelUsed = hfResult.model ?? env.hfDocumentModel;
      }
      if (redactedText.totalRedactions + redactedFileName.totalRedactions > 0) {
        await recordAudit({
          organizationId,
          actorType: "system",
          action: "ai.hf_classification_redacted",
          entityType: "uploaded_file",
          entityId: file.id,
          metadata: {
            text_redactions: redactedText.counts,
            filename_redactions: redactedFileName.counts,
            model: hfResult?.model ?? null,
          },
        });
      }
    } catch (err) {
      console.error("[ai/process] HF classification failed", err);
    }
  }

  // ---------- Layer 5: optional multimodal vision review ----------
  // For image uploads we additionally ask a vision-capable model to look at
  // the *thumbnail* (data minimization) and return a structured verdict on
  // {document type, capture quality, plain-English reason}. Skip when:
  //   - the file isn't an image (PDFs are handled by OCR + rules above),
  //   - the firm hasn't opted into vision (env + per-org flag both required),
  //   - we already have a severe local quality flag (no point spending
  //     tokens / leaking pixels on a doc we're going to bounce anyway), OR
  //   - the rules layer is already highly confident (vision can't strictly
  //     beat 0.9+ rules confidence and would only add latency + egress).
  let visionResult: VisionReviewResult | null = null;
  let visionLatencyMs: number | null = null;
  let visionPiiInReason = false;
  if (
    visionAllowed &&
    workingMime.startsWith("image/") &&
    thumbnailBuffer &&
    !severeFlag &&
    classification.confidence < 0.9
  ) {
    try {
      const provider = await getAIProvider(orgProvider);
      if (typeof provider.classifyDocumentVision === "function") {
        const visionStart = Date.now();
        const result = await provider.classifyDocumentVision({
          imageBase64: thumbnailBuffer.toString("base64"),
          // Thumbnails are always JPEG (see image-prep.ts).
          imageMime: "image/jpeg",
          matterType,
          itemTitle,
        });
        visionLatencyMs = Date.now() - visionStart;

        if (result) {
          // Defence in depth: even though the system prompt forbids
          // transcribing PII into `reason`, models occasionally leak. We
          // re-run the same redactor we use for OCR text and persist the
          // sanitised version. We also flag the event so admins can review
          // model adherence in the audit feed.
          const redactedReason = result.reason ? redactPII(result.reason) : null;
          if (redactedReason && redactedReason.totalRedactions > 0) {
            visionPiiInReason = true;
          }
          const sanitised: VisionReviewResult = {
            ...result,
            reason: redactedReason ? redactedReason.text : result.reason,
          };
          visionResult = sanitised;

          // Vision gets to override classification only when strictly more
          // confident than what the rules + text-HF pass produced. Mirrors
          // the merge rule in Layer 4.
          if (sanitised.confidence > classification.confidence) {
            classification = {
              type: sanitised.type,
              confidence: sanitised.confidence,
              source: "huggingface",
              reason: sanitised.reason,
              model: sanitised.model,
            };
            hfModelUsed = sanitised.model;
          }

          // Vision can also escalate to needs_reupload when it can clearly
          // see the photo is unusable (blur, cut-off, screenshot) even when
          // OCR happened to extract enough text to pass the rule-based
          // quality checks.
          if (sanitised.recommendation === "request_reupload") {
            quality.recommendation = "request_reupload";
            if (sanitised.blurry && !quality.localFlags.firedFlags.includes("blur_detected")) {
              quality.localFlags.firedFlags.push("blur_detected");
            }
            if (sanitised.cutOff && !quality.localFlags.firedFlags.includes("cut_off_edges_detected")) {
              quality.localFlags.firedFlags.push("cut_off_edges_detected");
              quality.cutOffEdgesDetected = true;
            }
            if (
              sanitised.screenshot &&
              !quality.localFlags.firedFlags.includes("screenshot_detected")
            ) {
              quality.localFlags.firedFlags.push("screenshot_detected");
              quality.screenshotDetected = true;
            }
          }
        }

        // Audit every call, success or not. We log the SHA-256 of the
        // thumbnail bytes (so multiple uploads of the same image can be
        // joined post-hoc) and the byte count (cost / capacity tracking).
        // We deliberately do NOT log the image itself, the base64 payload,
        // or the model's full text output beyond the recommendation +
        // boolean flags.
        const imageSha = createHash("sha256").update(thumbnailBuffer).digest("hex");
        await recordAudit({
          organizationId,
          actorType: "system",
          action: "ai.hf_vision_classified",
          entityType: "uploaded_file",
          entityId: file.id,
          metadata: {
            model: env.hfVisionModel,
            image_sha256: imageSha,
            image_bytes: thumbnailBuffer.byteLength,
            latency_ms: visionLatencyMs,
            type: visionResult?.type ?? null,
            confidence: visionResult?.confidence ?? null,
            recommendation: visionResult?.recommendation ?? null,
            blurry: visionResult?.blurry ?? null,
            cut_off: visionResult?.cutOff ?? null,
            screenshot: visionResult?.screenshot ?? null,
            // Audit-flag if the model leaked PII shapes into the reason and
            // we had to redact server-side. Useful for monitoring prompt
            // adherence.
            redacted_pii_in_reason: visionPiiInReason,
          },
        });
      }
    } catch (err) {
      console.error("[ai/process] HF vision classification failed", err);
    }
  }

  // Final status: never auto-accept; staff must approve.
  const status: UploadedFileStatus =
    quality.recommendation === "request_reupload" || severeFlag ? "needs_reupload" : "needs_review";

  return persistAndReturn({
    file,
    organizationId,
    processedKey,
    thumbnailKey,
    pageCount,
    workingMime,
    quality,
    ocrResult,
    classification,
    providerName,
    hfModelUsed,
    visionResult,
    visionLatencyMs,
    hfLatencyMs,
    status,
    startedAt,
  });
}

interface PersistArgs {
  file: {
    id: string;
    organization_id: string;
    matter_id: string;
    request_item_id: string | null;
    original_file_name: string;
    original_mime_type: string;
    original_storage_path: string;
    file_size_bytes: number;
  };
  organizationId: string;
  processedKey: string | null;
  thumbnailKey: string | null;
  pageCount: number | null;
  workingMime: string;
  quality: QualityCheckResult;
  ocrResult: OCRResult;
  classification: DocumentClassificationResult;
  providerName: AIProviderName;
  hfModelUsed: string | null;
  hfLatencyMs: number | null;
  visionResult: VisionReviewResult | null;
  visionLatencyMs: number | null;
  status: UploadedFileStatus;
  startedAt: number;
}

async function persistAndReturn(args: PersistArgs): Promise<ProcessDocumentResult> {
  const service = getServiceSupabase();
  const {
    file,
    organizationId,
    classification,
    ocrResult,
    quality,
    status,
    providerName,
    hfModelUsed,
    hfLatencyMs,
    visionResult,
    visionLatencyMs,
  } = args;

  // Vision findings are persisted alongside the quality + classification
  // metadata so reviewers see them in the dashboard. We never include the
  // image bytes or base64 payload — only the structured verdict.
  const visionForStorage =
    visionResult === null
      ? null
      : {
          type: visionResult.type,
          confidence: visionResult.confidence,
          recommendation: visionResult.recommendation,
          reason: visionResult.reason,
          blurry: visionResult.blurry,
          cut_off: visionResult.cutOff,
          screenshot: visionResult.screenshot,
          model: visionResult.model,
          latency_ms: visionLatencyMs,
        };

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
      classification: {
        type: classification.type,
        confidence: classification.confidence,
        source: classification.source,
        reason: classification.reason,
        model: classification.model ?? null,
      },
      vision: visionForStorage,
    } as Json,
    local_flags: quality.localFlags as unknown as Json,
    ocr_engine: ocrResult.engine,
    hf_model_used: hfModelUsed,
    hf_latency_ms: hfLatencyMs,
    raw_ocr_json: ocrResult.rawJson,
  });

  await service
    .from("uploaded_files")
    .update({
      processed_storage_path: args.processedKey,
      thumbnail_storage_path: args.thumbnailKey,
      page_count: args.pageCount,
      detected_document_type: classification.type,
      status,
      processing_provider: providerName,
      ocr_text: ocrResult.text || null,
      ocr_confidence: ocrResult.confidence,
      classification_confidence: classification.confidence,
      classification_source: classification.source,
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
      provider: providerName,
      ocr_engine: ocrResult.engine,
      hf_model_used: hfModelUsed,
      hf_latency_ms: hfLatencyMs,
      recommendation: quality.recommendation,
      classification_source: classification.source,
      classification_confidence: classification.confidence,
      detected_document_type: classification.type,
      blur_score: quality.blurScore,
      fired_flags: quality.localFlags.firedFlags,
    },
  });

  return {
    uploadedFileId: file.id,
    provider: providerName,
    ocrEngine: ocrResult.engine,
    status,
    detectedDocumentType: classification.type,
    classificationSource: classification.source,
    hfModelUsed,
    latencyMs: Date.now() - args.startedAt,
  };
}

function pickMockText(matterType: string, _mime: string): string | null {
  const samples: Record<string, string> = {
    immigration: "PASSPORT — Surname HERNANDEZ, Nationality MEXICO, DOB 12 MAY 1988.",
    family_law: "MARRIAGE CERTIFICATE — Luis Hernandez and Maria Santos, 14 February 2018.",
    personal_injury: "POLICE INCIDENT REPORT — Case 24-018-7732, two-vehicle collision.",
    real_estate: "WARRANTY DEED — Robert P. Jones to Sarah M. Kim, 422 Elm Street.",
    probate_estate: "LAST WILL AND TESTAMENT — Margaret Ellen Parker.",
    other: "Statement period 03/01/2024 to 03/31/2024, account number ****8821, beginning balance $4,128.42.",
  };
  return samples[matterType] ?? samples.other;
}

function rewriteExtension(filename: string, mime: string, suffix?: string) {
  const base = filename.replace(/\.[^.]+$/, "");
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : "bin";
  return suffix ? `${base}-${suffix}.${ext}` : `${base}.${ext}`;
}
