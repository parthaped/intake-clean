import "server-only";

import type { LocalQualityFlags, ReuploadReasonResult } from "@/lib/ai/types";

/**
 * Deterministic, client-friendly templates for re-upload requests. Order in
 * this map controls priority — the highest-priority fired flag wins.
 */
export const REUPLOAD_REASON_TEMPLATES: Record<string, string> = {
  blur_detected:
    "The document is too blurry to review. Please retake the photo with the text in focus.",
  low_contrast_detected:
    "The text is too faint or low contrast. Please retake the photo in better lighting or upload the original PDF.",
  cut_off_edges_detected:
    "Part of the page appears to be cut off. Please retake the photo with all four corners visible.",
  screenshot_detected:
    "This looks like a screenshot. If possible, please upload the original PDF document instead.",
  rotated_detected:
    "The document appears sideways or rotated. Please re-upload a correctly oriented copy.",
  ocr_text_too_short:
    "We could not read enough text from this upload. Please upload a clearer scan or PDF.",
  low_resolution_detected:
    "This image is low resolution. Please upload a higher-quality scan or photo.",
};

const PRIORITY_ORDER: string[] = [
  "blur_detected",
  "cut_off_edges_detected",
  "screenshot_detected",
  "ocr_text_too_short",
  "low_contrast_detected",
  "rotated_detected",
  "low_resolution_detected",
];

/**
 * Picks the highest-priority flag and returns the matching template. Always
 * returns *something* so the staff UI never has an empty reason field.
 */
export function flagsToReason(flags: LocalQualityFlags | null | undefined): ReuploadReasonResult {
  const fired = new Set(flags?.firedFlags ?? []);
  for (const flag of PRIORITY_ORDER) {
    if (fired.has(flag)) {
      const template = REUPLOAD_REASON_TEMPLATES[flag]!;
      return { text: template, source: "template", template: flag };
    }
  }
  return {
    text: "We need a clearer copy of this document. Please upload a fresh scan or photo.",
    source: "template",
    template: "generic",
  };
}

/** Friendly labels for the staff-facing reason picker UI. */
export const REUPLOAD_REASON_PRESETS: Array<{ id: string; label: string; text: string }> = PRIORITY_ORDER
  .map((id) => ({ id, label: humanLabel(id), text: REUPLOAD_REASON_TEMPLATES[id]! }))
  .concat([
    {
      id: "wrong_document",
      label: "Wrong document",
      text: "This is not the document we asked for. Please upload the correct file.",
    },
    {
      id: "missing_page",
      label: "Missing page",
      text: "We need every page of this document. Please re-upload all pages.",
    },
  ]);

function humanLabel(flag: string): string {
  switch (flag) {
    case "blur_detected": return "Too blurry";
    case "cut_off_edges_detected": return "Page cut off";
    case "screenshot_detected": return "Looks like a screenshot";
    case "ocr_text_too_short": return "Couldn't read text";
    case "low_contrast_detected": return "Too dark / low contrast";
    case "rotated_detected": return "Sideways / rotated";
    case "low_resolution_detected": return "Low resolution";
    default: return flag;
  }
}
