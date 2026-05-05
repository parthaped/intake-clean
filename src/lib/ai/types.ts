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
}

/** Provider abstraction for OCR engines. */
export interface OCRProvider {
  readonly engine: OcrEngineName;
  ocr(args: { buffer: Buffer; mime: string; lang?: string }): Promise<OCRResult>;
}
