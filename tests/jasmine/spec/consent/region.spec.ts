import {
  CONSENT_REGION_OVERRIDE_ENV,
  regionFromCountryCode,
  regionFromHeaders,
} from "@/lib/consent/region";

/**
 * Region detection drives the legal posture of the banner ("required
 * prompt" vs. "soft prompt"). The mapping needs to be conservative
 * (UK and Switzerland end up in the strict bucket; unknown countries
 * fall through to "OTHER" so we still show the soft banner) and stable
 * — these tests pin the mapping so a future edit makes the change
 * intentional.
 */
describe("consent: region detection", () => {
  describe("regionFromCountryCode", () => {
    it("maps the EEA-27 to EEA", () => {
      const eea = [
        "AT",
        "BE",
        "BG",
        "HR",
        "CY",
        "CZ",
        "DK",
        "EE",
        "FI",
        "FR",
        "DE",
        "GR",
        "HU",
        "IE",
        "IT",
        "LV",
        "LT",
        "LU",
        "MT",
        "NL",
        "PL",
        "PT",
        "RO",
        "SK",
        "SI",
        "ES",
        "SE",
      ];
      for (const c of eea) {
        expect(regionFromCountryCode(c)).withContext(c).toBe("EEA");
      }
    });

    it("includes IS / LI / NO in EEA (non-EU EEA members)", () => {
      expect(regionFromCountryCode("IS")).toBe("EEA");
      expect(regionFromCountryCode("LI")).toBe("EEA");
      expect(regionFromCountryCode("NO")).toBe("EEA");
    });

    it("buckets Switzerland with EEA (revFADP)", () => {
      expect(regionFromCountryCode("CH")).toBe("EEA");
    });

    it("maps GB and UK to UK", () => {
      expect(regionFromCountryCode("GB")).toBe("UK");
      expect(regionFromCountryCode("UK")).toBe("UK");
    });

    it("maps US to US", () => {
      expect(regionFromCountryCode("US")).toBe("US");
    });

    it("everything else falls through to OTHER", () => {
      const other = ["CA", "JP", "AU", "BR", "IN", "NZ", "ZZ", "XX"];
      for (const c of other) {
        expect(regionFromCountryCode(c)).withContext(c).toBe("OTHER");
      }
    });

    it("normalises lowercase and surrounding whitespace", () => {
      expect(regionFromCountryCode(" fr ")).toBe("EEA");
      expect(regionFromCountryCode("us")).toBe("US");
      expect(regionFromCountryCode("\tgb\n")).toBe("UK");
    });

    it("returns OTHER for empty / null / undefined input", () => {
      expect(regionFromCountryCode(null)).toBe("OTHER");
      expect(regionFromCountryCode(undefined)).toBe("OTHER");
      expect(regionFromCountryCode("")).toBe("OTHER");
      expect(regionFromCountryCode("   ")).toBe("OTHER");
    });
  });

  describe("regionFromHeaders", () => {
    function fakeHeaders(map: Record<string, string>): Headers {
      return new Headers(map);
    }

    it("reads x-vercel-ip-country", () => {
      expect(regionFromHeaders(fakeHeaders({ "x-vercel-ip-country": "FR" }))).toBe("EEA");
      expect(regionFromHeaders(fakeHeaders({ "x-vercel-ip-country": "GB" }))).toBe("UK");
      expect(regionFromHeaders(fakeHeaders({ "x-vercel-ip-country": "US" }))).toBe("US");
      expect(regionFromHeaders(fakeHeaders({ "x-vercel-ip-country": "JP" }))).toBe("OTHER");
    });

    it("falls back to OTHER when the header is missing", () => {
      expect(regionFromHeaders(fakeHeaders({}))).toBe("OTHER");
      expect(regionFromHeaders(null)).toBe("OTHER");
      expect(regionFromHeaders(undefined)).toBe("OTHER");
    });

    describe("dev override env var", () => {
      const envName = CONSENT_REGION_OVERRIDE_ENV;
      let original: string | undefined;

      beforeEach(() => {
        original = process.env[envName];
      });
      afterEach(() => {
        if (original === undefined) delete process.env[envName];
        else process.env[envName] = original;
      });

      it("exposes the canonical env name (so a rename is caught here)", () => {
        expect(envName).toBe("NEXT_PUBLIC_CONSENT_REGION_OVERRIDE");
      });

      it("override wins over the Vercel header", () => {
        process.env[envName] = "EEA";
        expect(regionFromHeaders(fakeHeaders({ "x-vercel-ip-country": "US" }))).toBe("EEA");
      });

      it("accepts UK / US / OTHER override values", () => {
        process.env[envName] = "UK";
        expect(regionFromHeaders(fakeHeaders({}))).toBe("UK");
        process.env[envName] = "US";
        expect(regionFromHeaders(fakeHeaders({}))).toBe("US");
        process.env[envName] = "OTHER";
        expect(regionFromHeaders(fakeHeaders({}))).toBe("OTHER");
      });

      it("ignores an invalid override value", () => {
        process.env[envName] = "MARS";
        expect(regionFromHeaders(fakeHeaders({ "x-vercel-ip-country": "FR" }))).toBe("EEA");
      });

      it("ignores an empty override value", () => {
        process.env[envName] = "";
        expect(regionFromHeaders(fakeHeaders({ "x-vercel-ip-country": "FR" }))).toBe("EEA");
      });
    });
  });
});
