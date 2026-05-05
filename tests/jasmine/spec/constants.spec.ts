import {
  ACCEPTED_FILE_EXTENSIONS,
  ACCEPTED_FILE_TYPES,
  CANCELLATION_REASONS,
  CANCELLATION_REASON_IDS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_FOLDERS,
  MAX_FILE_SIZE_BYTES,
  PLANS,
  PLAN_BY_TIER,
} from "@/lib/constants";

describe("lib/constants", () => {
  describe("file-type allow lists", () => {
    it("MIME and extension allow-lists are aligned in length", () => {
      // Both lists intentionally include the JPEG variants (image/jpeg +
      // image/jpg, jpg + jpeg) so they should currently match length-wise.
      // If a future change drifts them apart, this assertion is here to
      // make that very visible during review.
      expect(ACCEPTED_FILE_TYPES.length).toBe(ACCEPTED_FILE_EXTENSIONS.length);
    });

    it("includes both jpeg and jpg variants for browser compatibility", () => {
      expect(ACCEPTED_FILE_TYPES).toContain("image/jpeg");
      expect(ACCEPTED_FILE_TYPES).toContain("image/jpg");
      expect(ACCEPTED_FILE_EXTENSIONS).toContain("jpeg");
      expect(ACCEPTED_FILE_EXTENSIONS).toContain("jpg");
    });

    it("max upload size is 50 MB", () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(50 * 1024 * 1024);
    });

    it("includes PDF and HEIC", () => {
      expect(ACCEPTED_FILE_TYPES).toContain("application/pdf");
      expect(ACCEPTED_FILE_TYPES).toContain("image/heic");
      expect(ACCEPTED_FILE_EXTENSIONS).toContain("pdf");
      expect(ACCEPTED_FILE_EXTENSIONS).toContain("heic");
    });
  });

  describe("DOCUMENT_TYPE_FOLDERS", () => {
    it("maps each folder key to a non-empty folder name", () => {
      for (const [doc, folder] of Object.entries(DOCUMENT_TYPE_FOLDERS)) {
        expect(folder).withContext(doc).toMatch(/^\d{2} /);
      }
    });

    it("only references known DOCUMENT_TYPES", () => {
      const allowed = new Set<string>(DOCUMENT_TYPES);
      for (const docType of Object.keys(DOCUMENT_TYPE_FOLDERS)) {
        expect(allowed.has(docType)).withContext(docType).toBeTrue();
      }
    });
  });

  describe("PLANS", () => {
    it("declares exactly three tiers in price-ascending order", () => {
      expect(PLANS.map((p) => p.tier)).toEqual(["starter", "solo", "firm"]);
      const cents = PLANS.map((p) => p.monthlyPriceCents);
      expect(cents).toEqual([...cents].sort((a, b) => a - b));
    });

    it("storageMb is consistent with storageGb for every plan", () => {
      for (const plan of PLANS) {
        expect(plan.storageMb).withContext(plan.tier).toBe(plan.storageGb * 1024);
      }
    });

    it("highlights exactly one plan", () => {
      expect(PLANS.filter((p) => p.highlight === true).length).toBe(1);
    });

    it("PLAN_BY_TIER is a fully populated lookup", () => {
      expect(PLAN_BY_TIER.starter.tier).toBe("starter");
      expect(PLAN_BY_TIER.solo.tier).toBe("solo");
      expect(PLAN_BY_TIER.firm.tier).toBe("firm");
    });

    it("matter limits strictly increase across tiers", () => {
      expect(PLAN_BY_TIER.starter.matterLimit).toBeLessThan(PLAN_BY_TIER.solo.matterLimit);
      expect(PLAN_BY_TIER.solo.matterLimit).toBeLessThan(PLAN_BY_TIER.firm.matterLimit);
    });
  });

  describe("CANCELLATION_REASONS", () => {
    it("uses unique, snake_case ids (analytics queries depend on them)", () => {
      const seen = new Set<string>();
      for (const reason of CANCELLATION_REASONS) {
        expect(reason.id).withContext(reason.label).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(seen.has(reason.id)).withContext(`duplicate ${reason.id}`).toBeFalse();
        seen.add(reason.id);
      }
    });

    it("includes an 'other' fallback so users always have an answer they can pick", () => {
      expect(CANCELLATION_REASON_IDS).toContain("other");
    });

    it("CANCELLATION_REASON_IDS mirrors CANCELLATION_REASONS exactly", () => {
      expect(CANCELLATION_REASON_IDS).toEqual(CANCELLATION_REASONS.map((r) => r.id));
    });

    it("every reason has a non-trivial label", () => {
      for (const reason of CANCELLATION_REASONS) {
        expect(reason.label.trim().length).withContext(reason.id).toBeGreaterThan(3);
      }
    });
  });
});
