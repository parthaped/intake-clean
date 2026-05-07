/**
 * Unit tests for `runLocalQualityChecks`. This is the rule-based,
 * sharp-metrics-driven quality layer that decides whether an upload should
 * be `accept`ed (the rare clean PDF case), sent to staff `review`, or
 * bounced back to the client as `request_reupload`.
 *
 * The downstream `processDocument` orchestrator translates that
 * recommendation into the visible `uploaded_files.status` and
 * `document_request_items.status` rows that the client and the firm see —
 * so any drift in the severity-flag table is exactly what desyncs the two
 * sides of the system. We pin every branch.
 */
import type { ImageMetricsResult } from "@/lib/ai/preprocess/image-prep";
import { runLocalQualityChecks } from "@/lib/ai/rules/quality-checks";

function metrics(overrides: Partial<ImageMetricsResult> = {}): ImageMetricsResult {
  // A "well-photographed document" baseline: high contrast, normal
  // brightness, large enough to read, not screenshot-shaped, not rotated.
  return {
    buffer: Buffer.alloc(0),
    contentType: "image/jpeg",
    width: 2000,
    height: 2400,
    brightness: 0.55,
    contrast: 0.25,
    rotated: false,
    likelyScreenshot: false,
    aspectRatio: 2000 / 2400,
    ...overrides,
  };
}

describe("ai/rules: runLocalQualityChecks", () => {
  describe("PDF inputs", () => {
    it("accepts a clean PDF with confident OCR", () => {
      const result = runLocalQualityChecks({
        metrics: null,
        mime: "application/pdf",
        ocrText: "Form 1040 — adjusted gross income line 11 amount $54,000 ...",
        ocrConfidence: 0.92,
      });

      expect(result.recommendation).toBe("accept");
      expect(result.localFlags.firedFlags).toEqual([]);
      expect(result.blurScore).toBeLessThan(0.15);
      expect(result.glareDetected).toBeFalse();
    });

    it("falls back to `review` when OCR confidence is below the accept threshold", () => {
      // Confidence 0.65 is below 0.7 but no severe flags fire, so the
      // recommendation must be `review`, not `accept` — staff still need
      // to look at low-confidence OCR even when the document type is
      // probably fine.
      const result = runLocalQualityChecks({
        metrics: null,
        mime: "application/pdf",
        ocrText: "Form 1040 income line 11 $54,000 reasonable amount of text",
        ocrConfidence: 0.65,
      });

      expect(result.recommendation).toBe("review");
    });

    it("does not flag PDFs as ocr_text_too_short even when text is empty (PDFs aren't OCR'd in tesseract)", () => {
      // process-document.ts deliberately skips OCR for PDFs and passes
      // empty ocrText. Without the `!isPdf` guard we'd bounce every PDF.
      const result = runLocalQualityChecks({
        metrics: null,
        mime: "application/pdf",
        ocrText: "",
        ocrConfidence: 0.85,
      });

      expect(result.localFlags.firedFlags).not.toContain("ocr_text_too_short");
    });
  });

  describe("severe image flags drive request_reupload", () => {
    // These four flags are also the SEVERE_FLAGS set used by
    // processDocument's short-circuit. Losing any one moves the file into
    // the wrong status (needs_review instead of needs_reupload), which is
    // the exact desync we test for.
    it("flags ocr_text_too_short on an image with no readable text", () => {
      const result = runLocalQualityChecks({
        metrics: metrics(),
        mime: "image/jpeg",
        ocrText: "abc",
        ocrConfidence: 0.4,
      });

      expect(result.localFlags.firedFlags).toContain("ocr_text_too_short");
      expect(result.recommendation).toBe("request_reupload");
    });

    it("flags blur_detected when contrast is very low (proxy for blur)", () => {
      // Implementation note: tesseract.js doesn't expose a real Laplacian
      // variance, so the rules engine derives a blur estimate from
      // contrast. We assert the *behavioural* contract: flat images are
      // bounced.
      const result = runLocalQualityChecks({
        metrics: metrics({ contrast: 0.1, brightness: 0.5 }),
        mime: "image/jpeg",
        ocrText: "STATE OF CALIFORNIA — official certified copy of marriage certificate",
        ocrConfidence: 0.78,
      });

      expect(result.localFlags.firedFlags).toContain("blur_detected");
      expect(result.recommendation).toBe("request_reupload");
    });

    it("flags screenshot_detected when sharp says the image looks like a phone screenshot", () => {
      const result = runLocalQualityChecks({
        metrics: metrics({ likelyScreenshot: true }),
        mime: "image/png",
        ocrText: "STATE OF CALIFORNIA — official certified copy of marriage certificate",
        ocrConfidence: 0.78,
      });

      expect(result.localFlags.firedFlags).toContain("screenshot_detected");
      expect(result.recommendation).toBe("request_reupload");
    });
  });

  describe("non-severe issues route to staff `review`", () => {
    it("flags low_contrast_detected when the image is dark", () => {
      const result = runLocalQualityChecks({
        metrics: metrics({ brightness: 0.1, contrast: 0.2 }),
        mime: "image/jpeg",
        ocrText: "STATE OF CALIFORNIA — official certified copy of marriage certificate",
        ocrConfidence: 0.78,
      });

      expect(result.localFlags.firedFlags).toContain("low_contrast_detected");
      // Dark images are recoverable by staff; no severe flag → `review`.
      expect(result.recommendation).toBe("review");
    });

    it("flags rotated_detected", () => {
      // `rotated_detected` is a fired flag the dashboard surfaces but it
      // doesn't on its own generate an `issues[]` entry, so the
      // recommendation can still be permissive — the staff-facing audit
      // trail still shows the rotation. We test the flag, not the
      // recommendation, because that's the durable contract.
      const result = runLocalQualityChecks({
        metrics: metrics({ rotated: true }),
        mime: "image/jpeg",
        ocrText: "STATE OF CALIFORNIA — official certified copy of marriage certificate",
        ocrConfidence: 0.78,
      });

      expect(result.localFlags.firedFlags).toContain("rotated_detected");
      expect(result.recommendation).not.toBe("request_reupload");
    });

    it("flags low_resolution_detected for tiny images and routes to `review`", () => {
      // Low-res adds an `issues[]` entry, which is enough to keep the
      // recommendation off the `accept` fast-path.
      const result = runLocalQualityChecks({
        metrics: metrics({ width: 600, height: 400 }),
        mime: "image/jpeg",
        ocrText: "STATE OF CALIFORNIA — official certified copy of marriage certificate",
        ocrConfidence: 0.78,
      });

      expect(result.localFlags.firedFlags).toContain("low_resolution_detected");
      expect(result.recommendation).toBe("review");
    });

    it("can return `accept` for a clean image with high OCR confidence and no fired flags", () => {
      // The "never auto-accept" promise lives in `process-document.ts` at
      // the file-status level (which always becomes `needs_review` for
      // staff). The rules layer is allowed to say `accept` when nothing
      // looks wrong; this spec pins the contract so a future change to
      // the rules layer doesn't quietly add a different verdict.
      const result = runLocalQualityChecks({
        metrics: metrics(),
        mime: "image/jpeg",
        ocrText: "STATE OF CALIFORNIA — official certified copy of marriage certificate with sufficient text",
        ocrConfidence: 0.85,
      });

      expect(result.localFlags.firedFlags).toEqual([]);
      expect(result.recommendation).toBe("accept");
    });
  });

  describe("issueSummary + raw output", () => {
    it("never returns an empty summary string", () => {
      const result = runLocalQualityChecks({
        metrics: metrics(),
        mime: "image/jpeg",
        ocrText: "STATE OF CALIFORNIA — official certified copy of marriage certificate",
        ocrConfidence: 0.85,
      });

      expect(result.issueSummary.length).toBeGreaterThan(0);
    });

    it("falls back to a conservative blur estimate when metrics are null", () => {
      // A null metrics input means image preprocessing failed (sharp blew
      // up). The fallback blurScore is 0.4 — below the 0.65 severe
      // threshold, so the recommendation must NOT be `request_reupload`.
      const result = runLocalQualityChecks({
        metrics: null,
        mime: "image/jpeg",
        ocrText: "STATE OF CALIFORNIA — official certified copy of marriage certificate",
        ocrConfidence: 0.78,
      });

      expect(result.blurScore).toBeCloseTo(0.4, 1);
      expect(result.recommendation).not.toBe("request_reupload");
    });
  });
});
