/**
 * Unit tests for the mock AI provider. The mock provider runs the demo and
 * test pipelines (`AI_PROVIDER=mock` / `MOCK_AI=true`) so the upload flow
 * works without any external service. If the mock output drifts, the
 * `processDocument` integration tests in this same suite — and demo
 * environments — break with hard-to-diagnose symptoms (missing
 * classification, no recommendation, etc.).
 */
import { mockAIProvider, runMockQualityCheck } from "@/lib/ai/providers/mock-provider";

describe("ai/providers: runMockQualityCheck", () => {
  it("never throws when metrics are null (image preprocessing failed)", () => {
    expect(() =>
      runMockQualityCheck({
        metrics: null,
        mime: "image/jpeg",
        matterType: "immigration",
      }),
    ).not.toThrow();
  });

  it("returns a recommendation that is one of the three RecommendationT values", () => {
    const result = runMockQualityCheck({
      metrics: null,
      mime: "image/jpeg",
      matterType: "family_law",
    });
    expect(["accept", "review", "request_reupload"]).toContain(result.recommendation);
  });

  it("treats PDFs as low-blur, mid-confidence regardless of metrics", () => {
    const r = runMockQualityCheck({ metrics: null, mime: "application/pdf", matterType: "other" });
    expect(r.blurScore).toBeLessThan(0.3);
    expect(r.textExtractionConfidence).toBeGreaterThanOrEqual(0.9);
  });

  it("populates `localFlags` with every shape field even on a clean PDF", () => {
    // Downstream code (the staff dashboard, reupload-reason picker) reads
    // these fields directly. A regression that drops a field would surface
    // as `undefined` in the UI.
    const r = runMockQualityCheck({ metrics: null, mime: "application/pdf", matterType: "other" });
    const f = r.localFlags;
    expect(f.firedFlags).toBeDefined();
    expect(typeof f.glareDetected).toBe("boolean");
    expect(typeof f.lowContrastDetected).toBe("boolean");
    expect(typeof f.cutOffEdgesDetected).toBe("boolean");
    expect(typeof f.rotatedDetected).toBe("boolean");
    expect(typeof f.screenshotDetected).toBe("boolean");
    expect(typeof f.lowResolutionDetected).toBe("boolean");
    expect(typeof f.ocrTextTooShort).toBe("boolean");
  });
});

describe("ai/providers: mockAIProvider.classifyDocument", () => {
  // The matter-type → document-type mapping lets the demo dashboard show
  // varied, plausible labels without external services. These tests pin
  // the mapping so a future tweak doesn't accidentally show "Bank
  // Statement" on every immigration upload.
  const cases: Array<[string, string]> = [
    ["immigration", "Passport"],
    ["family_law", "Marriage Certificate"],
    ["personal_injury", "Police Report"],
    ["real_estate", "Lease / Property Document"],
    ["probate_estate", "Court Order"],
    ["other", "Bank Statement"],
  ];

  for (const [matterType, expectedType] of cases) {
    it(`maps matterType=${matterType} to ${expectedType}`, async () => {
      const r = await mockAIProvider.classifyDocument({
        fileName: "scan.pdf",
        ocrText: null,
        mime: "application/pdf",
        matterType,
        itemTitle: null,
      });
      expect(r).not.toBeNull();
      expect(r!.type).toBe(expectedType);
      expect(r!.source).toBe("rules");
      expect(r!.confidence).toBeGreaterThanOrEqual(0.5);
    });
  }
});

describe("ai/providers: mockAIProvider.classifyDocumentVision", () => {
  it("returns a deterministic vision verdict mirroring the text classifier", async () => {
    // Demo flows depend on OCR + vision agreeing for the same matter type
    // so the dashboard doesn't render contradictory signals. Pinning the
    // mapping here catches any regression of that contract.
    expect(mockAIProvider.classifyDocumentVision).toBeDefined();
    const r = await mockAIProvider.classifyDocumentVision!({
      imageBase64: "abc",
      imageMime: "image/jpeg",
      matterType: "immigration",
      itemTitle: null,
    });
    expect(r).not.toBeNull();
    expect(r!.type).toBe("Passport");
    // Mock vision never short-circuits to request_reupload; it sends
    // results to staff review so demos always have a non-empty queue.
    expect(r!.recommendation).toBe("review");
    expect(r!.blurry).toBeFalse();
    expect(r!.cutOff).toBeFalse();
    expect(r!.screenshot).toBeFalse();
    expect(r!.model).toBe("mock-vision");
  });

  it("mentions the requested item title in the reason text when provided", async () => {
    const r = await mockAIProvider.classifyDocumentVision!({
      imageBase64: "abc",
      imageMime: "image/jpeg",
      matterType: "family_law",
      itemTitle: "Marriage Certificate",
    });
    expect(r!.reason).toContain("Marriage Certificate");
  });
});
