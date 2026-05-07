/**
 * Unit tests for the rule-based re-upload reason picker. Whenever
 * `processDocument` decides a file needs re-upload, the staff
 * `request-reupload` route asks `flagsToReason` for the client-facing copy.
 * The priority order in `PRIORITY_ORDER` is the contract that decides
 * which message wins when multiple flags fire — the highest-priority
 * fired flag is shown to the client.
 *
 * If a future change reshuffles the array, clients would suddenly start
 * seeing a different (potentially worse) re-upload prompt for the same
 * upload — exactly the kind of UX desync we want to catch.
 */
import { flagsToReason, REUPLOAD_REASON_PRESETS, REUPLOAD_REASON_TEMPLATES } from "@/lib/ai/rules/reupload-reasons";
import type { LocalQualityFlags } from "@/lib/ai/types";

function flags(fired: string[], overrides: Partial<LocalQualityFlags> = {}): LocalQualityFlags {
  return {
    blurScore: 0.4,
    brightness: 0.5,
    contrast: 0.2,
    width: 1200,
    height: 1500,
    glareDetected: false,
    lowContrastDetected: false,
    cutOffEdgesDetected: false,
    rotatedDetected: false,
    screenshotDetected: false,
    lowResolutionDetected: false,
    ocrTextTooShort: false,
    firedFlags: fired,
    ...overrides,
  };
}

describe("ai/rules: flagsToReason", () => {
  it("returns the blur template when only blur is fired", () => {
    const r = flagsToReason(flags(["blur_detected"]));
    expect(r.text).toBe(REUPLOAD_REASON_TEMPLATES.blur_detected);
    expect(r.source).toBe("template");
    expect(r.template).toBe("blur_detected");
  });

  describe("priority order is stable", () => {
    // Each pair documents: "given these flags, the higher-priority flag's
    // template must win". A regression here changes which message clients
    // actually see, so we check every adjacent pair in PRIORITY_ORDER.
    const pairs: Array<[string, string]> = [
      ["blur_detected", "cut_off_edges_detected"],
      ["cut_off_edges_detected", "screenshot_detected"],
      ["screenshot_detected", "ocr_text_too_short"],
      ["ocr_text_too_short", "low_contrast_detected"],
      ["low_contrast_detected", "rotated_detected"],
      ["rotated_detected", "low_resolution_detected"],
    ];
    for (const [higher, lower] of pairs) {
      it(`${higher} wins over ${lower}`, () => {
        const r = flagsToReason(flags([lower, higher]));
        expect(r.template).toBe(higher);
        expect(r.text).toBe(REUPLOAD_REASON_TEMPLATES[higher]);
      });
    }
  });

  it("falls back to a generic template when nothing in the priority list fired", () => {
    // Edge case: a flag we don't have a template for (e.g. a new flag
    // added without a template) should still produce a valid reason.
    const r = flagsToReason(flags(["unknown_flag"]));
    expect(r.template).toBe("generic");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("falls back to a generic template when no flags fired", () => {
    const r = flagsToReason(flags([]));
    expect(r.template).toBe("generic");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("handles null / undefined input without throwing", () => {
    expect(() => flagsToReason(null)).not.toThrow();
    expect(() => flagsToReason(undefined)).not.toThrow();
    expect(flagsToReason(null).template).toBe("generic");
  });

  it("every priority-list flag has a non-empty template", () => {
    // The dashboard staff picker (REUPLOAD_REASON_PRESETS) renders these
    // templates verbatim. An empty string would silently render an empty
    // option in the UI.
    for (const [flag, template] of Object.entries(REUPLOAD_REASON_TEMPLATES)) {
      expect(typeof template).toBe("string");
      expect(template.length).withContext(`template for ${flag}`).toBeGreaterThan(0);
    }
  });

  it("REUPLOAD_REASON_PRESETS exposes labels for the staff picker", () => {
    // The dashboard renders these in the "Why re-upload?" picker. We
    // assert the standard flags are all present plus the two manual
    // additions (`wrong_document`, `missing_page`) the staff UI relies on.
    const ids = REUPLOAD_REASON_PRESETS.map((p) => p.id);
    expect(ids).toContain("blur_detected");
    expect(ids).toContain("cut_off_edges_detected");
    expect(ids).toContain("screenshot_detected");
    expect(ids).toContain("ocr_text_too_short");
    expect(ids).toContain("wrong_document");
    expect(ids).toContain("missing_page");
  });
});
