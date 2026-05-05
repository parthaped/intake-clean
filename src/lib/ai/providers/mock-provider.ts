import "server-only";

import type {
  AIProvider,
  DocumentClassificationResult,
  LocalQualityFlags,
  OCRProvider,
  OCRResult,
  QualityCheckResult,
  ReuploadReasonResult,
} from "@/lib/ai/types";
import type { ImageMetricsResult } from "@/lib/ai/preprocess/image-prep";
import type { DocumentType } from "@/lib/constants";
import type { RecommendationT } from "@/types/database";

const MOCK_OCR_SAMPLES: Record<string, string> = {
  immigration:
    "DEPARTMENT OF STATE\nUNITED STATES OF AMERICA\nPASSPORT\nSurname: HERNANDEZ\nGiven Names: LUIS MIGUEL\nNationality: MEXICO\nDate of Birth: 12 MAY 1988\nSex: M\nPlace of Birth: GUADALAJARA\nDate of Issue: 04 JAN 2024",
  family_law:
    "MARRIAGE CERTIFICATE\nState of California, County of Los Angeles\nThis is to certify that LUIS HERNANDEZ and MARIA SANTOS\nwere united in marriage on the 14th day of February, 2018\nat the County Clerk's Office.",
  personal_injury:
    "ANYTOWN POLICE DEPARTMENT\nINCIDENT REPORT\nCase Number: 24-018-7732\nDate: 03/14/2024\nLocation: Main Street and 5th Avenue\nReporting Officer: J. Daniels #4421\nSummary: Two-vehicle collision. Driver A reported neck pain. Ambulance dispatched at 14:32.",
  probate_estate:
    "LAST WILL AND TESTAMENT\nI, MARGARET ELLEN PARKER, of Springfield, Illinois,\nbeing of sound mind, do hereby declare this to be my Last\nWill and Testament, revoking all prior wills.",
  real_estate:
    "WARRANTY DEED\nGRANTOR: ROBERT P. JONES\nGRANTEE: SARAH M. KIM\nProperty Address: 422 Elm Street, Austin, TX 78704\nLegal Description: Lot 14, Block 3, of OAK HILL ADDITION,\nrecorded in Volume 2118, Page 233.",
  other:
    "CHASE BANK\nAccount Statement\nStatement Period: 03/01/2024 to 03/31/2024\nAccount Number: ****8821\nBeginning Balance: $4,128.42\nEnding Balance: $3,902.18\nDeposits and Other Credits: 6\nWithdrawals and Other Debits: 18",
};

function pickMockOcr(matterType: string | null | undefined, mime: string): string | null {
  if (mime === "application/pdf") {
    return MOCK_OCR_SAMPLES[matterType ?? "other"] ?? MOCK_OCR_SAMPLES.other;
  }
  return MOCK_OCR_SAMPLES[matterType ?? "other"] ?? MOCK_OCR_SAMPLES.other;
}

export interface MockQualityArgs {
  metrics: ImageMetricsResult | null;
  mime: string;
  matterType?: string | null;
}

/**
 * Generates pseudo-deterministic but realistic quality flags for the demo
 * pipeline. Used when AI_PROVIDER='mock' or MOCK_AI=true.
 */
export function runMockQualityCheck({
  metrics,
  mime,
  matterType,
}: MockQualityArgs): QualityCheckResult {
  const isPdf = mime === "application/pdf";
  const seed = metrics
    ? Math.abs(metrics.brightness * 1000 + metrics.contrast * 1000)
    : Math.random() * 1000;
  const rand = (i: number) => (Math.sin(seed + i) + 1) / 2;

  const lowContrast = !isPdf && metrics ? metrics.contrast < 0.12 : false;
  const screenshot = !isPdf && metrics ? metrics.likelyScreenshot : false;
  const rotated = !isPdf && metrics ? metrics.rotated : false;
  const dark = !isPdf && metrics ? metrics.brightness < 0.18 : false;
  const overexposed = !isPdf && metrics ? metrics.brightness > 0.85 : false;
  const lowRes = !isPdf && metrics ? metrics.width < 700 || metrics.height < 700 : false;

  const blurScore = Math.min(0.95, Math.max(0.05, isPdf ? 0.05 + rand(1) * 0.1 : 0.2 + rand(2) * 0.6));
  const cutOffEdgesDetected = !isPdf && rand(3) < 0.18;
  const glare = !isPdf && (overexposed || rand(4) < 0.12);

  const ocrText = pickMockOcr(matterType, mime);
  const ocrTextTooShort = (ocrText?.length ?? 0) < 25;

  const firedFlags: string[] = [];
  if (blurScore > 0.65) firedFlags.push("blur_detected");
  if (lowContrast || dark) firedFlags.push("low_contrast_detected");
  if (cutOffEdgesDetected) firedFlags.push("cut_off_edges_detected");
  if (rotated) firedFlags.push("rotated_detected");
  if (screenshot) firedFlags.push("screenshot_detected");
  if (lowRes) firedFlags.push("low_resolution_detected");
  if (ocrTextTooShort) firedFlags.push("ocr_text_too_short");

  const localFlags: LocalQualityFlags = {
    blurScore: Number(blurScore.toFixed(2)),
    brightness: metrics?.brightness ?? null,
    contrast: metrics?.contrast ?? null,
    width: metrics?.width ?? null,
    height: metrics?.height ?? null,
    glareDetected: glare,
    lowContrastDetected: lowContrast || dark,
    cutOffEdgesDetected,
    rotatedDetected: rotated,
    screenshotDetected: screenshot,
    lowResolutionDetected: lowRes,
    ocrTextTooShort,
    firedFlags,
  };

  const issues: string[] = [];
  if (blurScore > 0.65) issues.push("This photo is too blurry to review.");
  if (cutOffEdgesDetected) issues.push("The page appears cut off. Please retake the photo with all four corners visible.");
  if (screenshot) issues.push("This looks like a screenshot. Please upload the original PDF if possible.");
  if (lowContrast || dark) issues.push("The image is too dark or has too much glare.");
  if (glare && !lowContrast) issues.push("There is glare on the page.");

  let recommendation: RecommendationT = "accept";
  if (issues.length >= 2 || blurScore > 0.7 || cutOffEdgesDetected || screenshot) {
    recommendation = "request_reupload";
  } else if (issues.length === 1 || rotated || blurScore > 0.45) {
    recommendation = "review";
  }

  const issueSummary = issues.length > 0 ? issues.join(" ") : "Looks usable. Awaiting staff review.";
  const textExtractionConfidence = isPdf ? 0.92 : Math.max(0.4, 0.92 - blurScore);

  return {
    blurScore: Number(blurScore.toFixed(2)),
    glareDetected: glare,
    lowContrastDetected: lowContrast || dark,
    cutOffEdgesDetected,
    rotatedDetected: rotated,
    screenshotDetected: screenshot,
    handwritingDetected: null,
    textExtractionConfidence: Number(textExtractionConfidence.toFixed(2)),
    issueSummary,
    recommendation,
    rawAiJson: { mock: true, mime, metrics: metrics ?? null, blurScore, issues },
    localFlags,
  };
}

/**
 * Picks a believable detected document type from the mock OCR sample so demos
 * show varied classifications without external services.
 */
function pickMockClassification(matterType: string | null | undefined): DocumentType {
  switch (matterType) {
    case "immigration":
      return "Passport";
    case "family_law":
      return "Marriage Certificate";
    case "personal_injury":
      return "Police Report";
    case "real_estate":
      return "Lease / Property Document";
    case "probate_estate":
      return "Court Order";
    default:
      return "Bank Statement";
  }
}

/** Mock OCR provider — returns a canned, matter-typed sample. */
export const mockOCRProvider: OCRProvider = {
  engine: "mock",
  async ocr({ mime }): Promise<OCRResult> {
    const text = pickMockOcr("other", mime) ?? "";
    return {
      text,
      confidence: 0.88,
      engine: "mock",
      pages: 1,
      rawJson: { mock: true },
      durationMs: 1,
    };
  },
};

/** Mock AI provider — used when AI_PROVIDER='mock' or MOCK_AI=true. */
export const mockAIProvider: AIProvider = {
  name: "mock",
  async classifyDocument({ matterType }): Promise<DocumentClassificationResult> {
    return {
      type: pickMockClassification(matterType),
      confidence: 0.78,
      source: "rules",
      reason: "Mock classifier (no external AI). Staff must review.",
    };
  },
  async rewriteReuploadReason({ template }): Promise<ReuploadReasonResult> {
    return { text: template, source: "template", template };
  },
};
