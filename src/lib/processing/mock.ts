import "server-only";

import type { RecommendationT } from "@/types/database";

import type { ImageMetricsResult } from "@/lib/processing/image-prep";

export interface QualityResult {
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
  ocrText: string | null;
}

/**
 * Mock processor that generates realistic quality flags from local image
 * heuristics. Used when GOOGLE_DOCUMENT_AI_* env vars are missing.
 */
export function runMockQualityCheck(metrics: ImageMetricsResult | null, mime: string): QualityResult {
  const isPdf = mime === "application/pdf";
  // Force pseudo-random but deterministic-ish behaviour by combining metrics.
  const seed = metrics ? Math.abs(metrics.brightness * 1000 + metrics.contrast * 1000) : Math.random() * 1000;
  const rand = (i: number) => (Math.sin(seed + i) + 1) / 2;

  const lowContrast = !isPdf && metrics ? metrics.contrast < 0.12 : false;
  const screenshot = !isPdf && metrics ? metrics.likelyScreenshot : false;
  const rotated = !isPdf && metrics ? metrics.rotated : false;
  const dark = !isPdf && metrics ? metrics.brightness < 0.18 : false;
  const overexposed = !isPdf && metrics ? metrics.brightness > 0.85 : false;

  // Blur score in [0, 1] where higher = blurrier.
  const blurScore = Math.min(0.95, Math.max(0.05, isPdf ? 0.05 + rand(1) * 0.1 : 0.2 + rand(2) * 0.6));

  const cutOffEdgesDetected = !isPdf && rand(3) < 0.18;
  const glare = !isPdf && (overexposed || rand(4) < 0.12);

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
    ocrText: null,
  };
}
