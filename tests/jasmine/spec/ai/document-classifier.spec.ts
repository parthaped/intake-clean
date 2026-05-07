/**
 * Unit tests for the rule-based document classifier. The classifier is the
 * deterministic first pass; only when its confidence falls below 0.7 does
 * `processDocument` escalate to the optional Hugging Face provider. So the
 * tests pin two contracts:
 *   1. Recognised keywords return high confidence and the right
 *      `DocumentType` so the dashboard label is correct.
 *   2. Unrecognised inputs return `Other / Unknown` at low confidence, so
 *      the HF escalation path is reachable when configured.
 *
 * We also test the precedence order (OCR > filename > item title) because
 * a regression there would silently degrade label quality on every upload.
 */
import { classifyByRules } from "@/lib/ai/rules/document-classifier";

describe("ai/rules: classifyByRules", () => {
  describe("OCR text matching (highest priority)", () => {
    it("classifies a passport from OCR text alone", async () => {
      const result = await classifyByRules({
        fileName: "scan.pdf",
        ocrText:
          "DEPARTMENT OF STATE\nUNITED STATES OF AMERICA\nPASSPORT\nSurname: HERNANDEZ\nGiven Names: LUIS",
        mime: "application/pdf",
        matterType: "immigration",
      });

      expect(result.type).toBe("Passport");
      expect(result.source).toBe("ocr");
      expect(result.confidence).toBeGreaterThanOrEqual(0.82);
    });

    it("requires every keyword in a multi-keyword group (precision)", async () => {
      // The `Bank Statement` rule has a `["statement period", "account number"]`
      // group. A document containing only "statement period" without
      // "account number" must NOT match — that's how the rule keeps its
      // precision over short OCR fragments.
      const result = await classifyByRules({
        fileName: "doc.pdf",
        ocrText: "this document mentions statement period and not much else, sufficient text",
        mime: "application/pdf",
        matterType: "other",
      });

      expect(result.type).not.toBe("Bank Statement");
    });

    it("classifies a bank statement when both keywords in the group are present", async () => {
      const result = await classifyByRules({
        fileName: "march.pdf",
        ocrText:
          "CHASE BANK\nAccount Statement\nStatement Period: 03/01/2024 to 03/31/2024\nAccount Number: ****8821\nBeginning Balance: $4,128.42",
        mime: "application/pdf",
        matterType: "other",
      });

      expect(result.type).toBe("Bank Statement");
      expect(result.source).toBe("ocr");
      // Bank statement has weight 0.1 → base 0.82 + 0.1 = 0.92 capped.
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("classifies a marriage certificate from OCR keywords", async () => {
      const result = await classifyByRules({
        fileName: "scan.pdf",
        ocrText:
          "MARRIAGE CERTIFICATE\nState of California\nThis is to certify that the parties were united in marriage.",
        mime: "application/pdf",
        matterType: "family_law",
      });

      expect(result.type).toBe("Marriage Certificate");
    });

    it("ignores OCR text shorter than 25 chars (avoids matching noise)", async () => {
      // Otherwise a one-word stray OCR result like "passport" could trip
      // a match with low signal. The implementation enforces a 25-char
      // minimum before it even tries the OCR path.
      const result = await classifyByRules({
        fileName: "image.jpg",
        ocrText: "passport",
        mime: "image/jpeg",
        matterType: "immigration",
      });

      // OCR didn't win → classifier falls through to filename/item title
      // and ultimately fallback. Filename "image.jpg" doesn't match any
      // rule either, so we land on `Other / Unknown`.
      expect(result.source).not.toBe("ocr");
    });
  });

  describe("filename fallback (medium priority)", () => {
    it("classifies a passport from a passport-named file when OCR misses", async () => {
      const result = await classifyByRules({
        fileName: "client_passport.pdf",
        ocrText: "",
        mime: "application/pdf",
        matterType: "immigration",
      });

      expect(result.type).toBe("Passport");
      expect(result.source).toBe("rules");
      // Filename matches use a lower base confidence (0.55) than OCR (0.82).
      expect(result.confidence).toBeLessThan(0.82);
    });
  });

  describe("item-title fallback (lowest priority)", () => {
    it("uses the request-item title as a last resort", async () => {
      // No OCR, no filename match. The classifier looks at what the firm
      // asked for ("Birth Certificate" on the checklist) and guesses
      // accordingly.
      const result = await classifyByRules({
        fileName: "scan-008321.pdf",
        ocrText: "",
        mime: "application/pdf",
        matterType: "family_law",
        itemTitle: "Birth Certificate (long form)",
      });

      expect(result.type).toBe("Birth Certificate");
      expect(result.source).toBe("fallback");
      expect(result.confidence).toBeCloseTo(0.5, 2);
    });
  });

  describe("unmatched inputs", () => {
    it("returns Other / Unknown at low confidence so HF escalation can fire", async () => {
      // process-document.ts only escalates to Hugging Face when the rule
      // confidence is below 0.7. The 0.2 fallback confidence is what makes
      // that escalation reachable; if this regresses to 0.7+ we'd never
      // reach the multimodal classifier.
      const result = await classifyByRules({
        fileName: "untitled.pdf",
        ocrText:
          "Dear sir or madam, please find enclosed the matter at hand. We trust this finds you well. Sincerely yours.",
        mime: "application/pdf",
        matterType: "other",
      });

      expect(result.type).toBe("Other / Unknown");
      expect(result.source).toBe("fallback");
      expect(result.confidence).toBeLessThan(0.7);
    });
  });
});
