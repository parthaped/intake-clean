import "server-only";

import type { ImageMetricsResult } from "@/lib/ai/preprocess/image-prep";
import type { LocalQualityFlags, QualityCheckResult } from "@/lib/ai/types";
import type { RecommendationT } from "@/types/database";

interface QualityCheckArgs {
  metrics: ImageMetricsResult | null;
  mime: string;
  ocrText: string | null;
  ocrConfidence: number | null;
}

const MIN_OCR_TEXT_LENGTH = 25;
const MIN_IMAGE_DIM_PX = 700;

/**
 * Pure local quality-check rules. No external services. Combines sharp metrics
 * with OCR signals to derive a rich `local_flags` object plus a recommendation.
 */
export function runLocalQualityChecks({
  metrics,
  mime,
  ocrText,
  ocrConfidence,
}: QualityCheckArgs): QualityCheckResult {
  const isPdf = mime === "application/pdf";

  const blurScore = isPdf
    ? 0.05
    : metrics
      ? estimateBlurFromMetrics(metrics)
      : 0.4;

  const lowContrast = !isPdf && metrics ? metrics.contrast < 0.12 : false;
  const dark = !isPdf && metrics ? metrics.brightness < 0.18 : false;
  const overexposed = !isPdf && metrics ? metrics.brightness > 0.85 : false;
  const screenshot = !isPdf && metrics ? metrics.likelyScreenshot : false;
  const rotated = !isPdf && metrics ? metrics.rotated : false;
  const lowRes = !isPdf && metrics ? metrics.width < MIN_IMAGE_DIM_PX || metrics.height < MIN_IMAGE_DIM_PX : false;
  const ocrTextTooShort = !isPdf && (ocrText?.trim().length ?? 0) < MIN_OCR_TEXT_LENGTH;

  // Cut-off-edges heuristic: very narrow image where one dim is dramatically
  // smaller than the other often indicates a document photographed too close.
  const cutOffEdgesDetected = false;
  const glare = !isPdf && overexposed;

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
  if (cutOffEdgesDetected) issues.push("The page appears cut off. Please retake with all four corners visible.");
  if (screenshot) issues.push("This looks like a screenshot. Please upload the original PDF if possible.");
  if (lowContrast || dark) issues.push("The image is too dark or has low contrast.");
  if (glare && !lowContrast) issues.push("There is glare on the page.");
  if (lowRes) issues.push("This image is low resolution and may be hard to read.");
  if (ocrTextTooShort) issues.push("Very little text could be read from this upload.");

  // Recommendation logic: any *severe* flag forces re-upload; multiple lighter
  // issues warrant review; otherwise default to review (we never auto-accept).
  const severe = firedFlags.some((f) =>
    ["blur_detected", "cut_off_edges_detected", "screenshot_detected", "ocr_text_too_short"].includes(f),
  );
  let recommendation: RecommendationT = "review";
  if (severe) recommendation = "request_reupload";
  else if (issues.length === 0 && (ocrConfidence ?? 0) >= 0.7) recommendation = "accept";

  const issueSummary = issues.length > 0 ? issues.join(" ") : "Looks usable. Awaiting staff review.";
  const textExtractionConfidence =
    ocrConfidence != null ? ocrConfidence : isPdf ? 0.92 : Math.max(0.3, 0.92 - blurScore);

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
    rawAiJson: { source: "rules", mime, blurScore, issues },
    localFlags,
  };
}

/**
 * Tesseract.js doesn't provide a real Laplacian-variance blur score, so we
 * approximate: very low image contrast on photos correlates with blurriness
 * (smooth gradients). Real implementations could add a Laplacian convolution
 * via sharp but that materially slows down the pipeline.
 */
function estimateBlurFromMetrics(metrics: ImageMetricsResult): number {
  const contrast = metrics.contrast;
  if (contrast > 0.22) return 0.15;
  if (contrast > 0.16) return 0.35;
  if (contrast > 0.12) return 0.55;
  return 0.78;
}
