import type { DocumentType } from "@/lib/constants";
import type {
  AIProviderName,
  ClassificationSource,
  Json,
  OcrEngineName,
  RecommendationT,
} from "@/types/database";

/** Output of an OCR provider (tesseract.js, PaddleOCR, mock). */
export interface OCRResult {
  text: string;
  confidence: number;
  engine: OcrEngineName;
  pages: number;
  rawJson: Json;
  durationMs: number;
}

/** Local quality flags computed from sharp metrics + OCR. Persisted as `local_flags`. */
export interface LocalQualityFlags {
  blurScore: number;
  brightness: number | null;
  contrast: number | null;
  width: number | null;
  height: number | null;
  glareDetected: boolean;
  lowContrastDetected: boolean;
  cutOffEdgesDetected: boolean;
  rotatedDetected: boolean;
  screenshotDetected: boolean;
  lowResolutionDetected: boolean;
  ocrTextTooShort: boolean;
  /** Stable list of fired flag names, used for templating reupload reasons. */
  firedFlags: string[];
}

/** Output of the rule-based / HF / mock quality check layer. */
export interface QualityCheckResult {
  blurScore: number;
  glareDetected: boolean;
  lowContrastDetected: boolean;
  cutOffEdgesDetected: boolean;
  rotatedDetected: boolean;
  screenshotDetected: boolean;
  handwritingDetected: boolean | null;
  textExtractionConfidence: number;
  issueSummary: string;
  recommendation: RecommendationT;
  rawAiJson: Record<string, unknown>;
  localFlags: LocalQualityFlags;
}

/** Output of a document type classifier. */
export interface DocumentClassificationResult {
  type: DocumentType;
  confidence: number;
  source: ClassificationSource;
  reason: string | null;
  /** Optional model identifier when the source is `huggingface`. */
  model?: string | null;
}

/**
 * Output of a multimodal vision document review.
 *
 * The vision pass is allowed to return a quality verdict in addition to the
 * document type so we can short-circuit blurry / cut-off photos without
 * needing OCR text. We deliberately keep the shape compact and forbid the
 * model from echoing PII (see the system prompt in `huggingface-provider`).
 */
export interface VisionReviewResult {
  type: DocumentType;
  /** Vision-model confidence in the document type (0..1). */
  confidence: number;
  /**
   * `accept` — looks fine to the vision model.
   * `review` — staff should look closely.
   * `request_reupload` — visibly unusable (blur, glare, cut-off, screenshot).
   */
  recommendation: RecommendationT;
  /** One short, plain-English sentence. Never quotes PII from the document. */
  reason: string | null;
  /** Whether the model thinks the document is blurry. */
  blurry: boolean;
  /** Whether one or more edges of the page are clipped. */
  cutOff: boolean;
  /** Whether the upload looks like a phone screenshot rather than a scan/photo. */
  screenshot: boolean;
  /** Model identifier we billed against (so audit logs can attribute cost). */
  model: string;
}

/** Output of the reupload-reason layer (rule template, optionally HF rewritten). */
export interface ReuploadReasonResult {
  text: string;
  source: "template" | "huggingface" | "manual";
  template?: string;
  model?: string | null;
}

/** Final orchestrator decision used by the pipeline + UI. */
export interface ProcessingDecision {
  status: "needs_review" | "needs_reupload";
  recommendation: RecommendationT;
  documentType: DocumentType;
  classificationSource: ClassificationSource;
  classificationConfidence: number;
}

/** Provider abstraction for higher-level (HF) document understanding. */
export interface AIProvider {
  readonly name: AIProviderName;
  /** Optional: classify a document from OCR text + metadata. Returns null if unable. */
  classifyDocument(args: {
    fileName: string;
    ocrText: string | null;
    mime: string;
    matterType: string;
    itemTitle: string | null;
  }): Promise<DocumentClassificationResult | null>;
  /** Optional: rewrite a re-upload reason in client-friendly language. */
  rewriteReuploadReason?(args: {
    template: string;
    flags: LocalQualityFlags;
    matterType: string;
  }): Promise<ReuploadReasonResult | null>;
  /**
   * Optional: ask a multimodal model to review the document image directly.
   * Returns null if the provider can't or won't run vision (no token, model
   * unavailable, image too large, etc.). Callers MUST treat the result as
   * advisory and still record it through the staff review queue.
   *
   * `imageBase64` is expected to be a downscaled thumbnail (data
   * minimization) and `imageMime` should be `image/jpeg` or `image/png`.
   */
  classifyDocumentVision?(args: {
    imageBase64: string;
    imageMime: "image/jpeg" | "image/png";
    matterType: string;
    itemTitle: string | null;
  }): Promise<VisionReviewResult | null>;
}

/** Provider abstraction for OCR engines. */
export interface OCRProvider {
  readonly engine: OcrEngineName;
  ocr(args: { buffer: Buffer; mime: string; lang?: string }): Promise<OCRResult>;
}
