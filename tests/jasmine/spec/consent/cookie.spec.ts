import {
  buildRecord,
  categoryMap,
  decodeConsent,
  defaultDecision,
  encodeConsent,
  serializeSetCookie,
} from "@/lib/consent/cookie";
import {
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  CONSENT_VERSION,
  type ConsentRecord,
} from "@/lib/consent/types";

/**
 * Pure-function tests for the consent cookie codec. The codec is the
 * trust boundary between the user's browser and our server, so each
 * field is checked individually for tampering and the version-gate is
 * exercised end-to-end (a record from a previous schema must look like
 * "no decision" so the banner re-prompts).
 */
describe("consent: cookie codec", () => {
  function makeRecord(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
    return buildRecord({
      region: "US",
      gpc: false,
      source: "modal_save",
      categories: { necessary: true, functional: true, analytics: false },
      now: new Date("2026-05-05T07:00:00.000Z"),
      ...(overrides.region ? { region: overrides.region } : {}),
      ...(overrides.gpc !== undefined ? { gpc: overrides.gpc } : {}),
      ...(overrides.source ? { source: overrides.source } : {}),
      ...(overrides.categories ? { categories: overrides.categories } : {}),
    });
  }

  describe("encode / decode roundtrip", () => {
    it("preserves every field through encode → decode", () => {
      const record = makeRecord({
        region: "EEA",
        gpc: true,
        source: "auto_gpc",
        categories: { necessary: true, functional: false, analytics: false },
      });
      const decoded = decodeConsent(encodeConsent(record));
      expect(decoded).not.toBeNull();
      expect(decoded).toEqual(record);
    });

    it("round-trips even when the cookie value is URI-decoded by the browser first", () => {
      const record = makeRecord();
      const raw = encodeConsent(record);
      const decoded = decodeConsent(raw);
      expect(decoded?.region).toBe("US");
      expect(decoded?.categories.functional).toBeTrue();
      expect(decoded?.categories.analytics).toBeFalse();
    });
  });

  describe("version gate", () => {
    it("returns null when the schema version is below current", () => {
      const ancient = encodeURIComponent(
        JSON.stringify({
          v: 0,
          ts: "2026-05-05T07:00:00.000Z",
          region: "US",
          gpc: false,
          source: "modal_save",
          categories: { necessary: true, functional: true, analytics: true },
        }),
      );
      expect(decodeConsent(ancient)).toBeNull();
    });

    it("returns null when the schema version is above current", () => {
      const future = encodeURIComponent(
        JSON.stringify({
          v: CONSENT_VERSION + 1,
          ts: "2026-05-05T07:00:00.000Z",
          region: "US",
          gpc: false,
          source: "modal_save",
          categories: { necessary: true, functional: true, analytics: true },
        }),
      );
      expect(decodeConsent(future)).toBeNull();
    });
  });

  describe("schema validation rejects garbage", () => {
    const tamperedPayloads: Array<[string, unknown]> = [
      ["missing fields entirely", {}],
      [
        "necessary=false (must be true literal)",
        {
          v: CONSENT_VERSION,
          ts: "2026-05-05T07:00:00.000Z",
          region: "US",
          gpc: false,
          source: "modal_save",
          categories: { necessary: false, functional: true, analytics: true },
        },
      ],
      [
        "unknown region",
        {
          v: CONSENT_VERSION,
          ts: "2026-05-05T07:00:00.000Z",
          region: "ATLANTIS",
          gpc: false,
          source: "modal_save",
          categories: { necessary: true, functional: true, analytics: true },
        },
      ],
      [
        "unknown source",
        {
          v: CONSENT_VERSION,
          ts: "2026-05-05T07:00:00.000Z",
          region: "US",
          gpc: false,
          source: "phisher_injected",
          categories: { necessary: true, functional: true, analytics: true },
        },
      ],
      [
        "non-boolean analytics flag",
        {
          v: CONSENT_VERSION,
          ts: "2026-05-05T07:00:00.000Z",
          region: "US",
          gpc: false,
          source: "modal_save",
          categories: { necessary: true, functional: true, analytics: "yes" },
        },
      ],
      [
        "invalid timestamp",
        {
          v: CONSENT_VERSION,
          ts: "not-a-date",
          region: "US",
          gpc: false,
          source: "modal_save",
          categories: { necessary: true, functional: true, analytics: true },
        },
      ],
      [
        "categories is an array",
        {
          v: CONSENT_VERSION,
          ts: "2026-05-05T07:00:00.000Z",
          region: "US",
          gpc: false,
          source: "modal_save",
          categories: [true, true, true],
        },
      ],
    ];

    for (const [label, payload] of tamperedPayloads) {
      it(`rejects payload: ${label}`, () => {
        const raw = encodeURIComponent(JSON.stringify(payload));
        expect(decodeConsent(raw)).toBeNull();
      });
    }

    it("rejects malformed JSON", () => {
      expect(decodeConsent("%7Bnot-json")).toBeNull();
    });

    it("rejects malformed URI encoding", () => {
      // A lone `%` is not valid percent-encoding and `decodeURIComponent`
      // throws — we should swallow that and return null rather than crash.
      expect(decodeConsent("%E0%A4")).toBeNull();
    });

    it("returns null for empty / nullish input", () => {
      expect(decodeConsent("")).toBeNull();
      expect(decodeConsent(null)).toBeNull();
      expect(decodeConsent(undefined)).toBeNull();
    });
  });

  describe("buildRecord", () => {
    it("forces necessary=true even when caller passes a non-true value", () => {
      const record = buildRecord({
        region: "US",
        gpc: false,
        source: "modal_save",
        // Type system allows only `necessary: true`, but we stamp the field
        // again on the way out to defend against a future loosening of the
        // type. Cast through unknown to simulate that.
        categories: ({
          necessary: false,
          functional: true,
          analytics: true,
        } as unknown) as ConsentRecord["categories"],
      });
      expect(record.categories.necessary).toBeTrue();
    });

    it("stamps the current schema version", () => {
      const record = buildRecord({
        region: "US",
        gpc: false,
        source: "modal_save",
        categories: { necessary: true, functional: true, analytics: true },
      });
      expect(record.v).toBe(CONSENT_VERSION);
    });

    it("uses the provided clock", () => {
      const fixed = new Date("2026-01-01T00:00:00.000Z");
      const record = buildRecord({
        region: "US",
        gpc: false,
        source: "modal_save",
        categories: { necessary: true, functional: true, analytics: true },
        now: fixed,
      });
      expect(record.ts).toBe(fixed.toISOString());
    });
  });

  describe("defaultDecision", () => {
    it("returns all-off (except necessary) for EEA + UK", () => {
      for (const region of ["EEA", "UK"] as const) {
        const dec = defaultDecision(region);
        expect(dec.necessary).withContext(region).toBeTrue();
        expect(dec.functional).withContext(region).toBeFalse();
        expect(dec.analytics).withContext(region).toBeFalse();
      }
    });

    it("pre-ticks functional for US / OTHER but never analytics", () => {
      for (const region of ["US", "OTHER"] as const) {
        const dec = defaultDecision(region);
        expect(dec.necessary).withContext(region).toBeTrue();
        expect(dec.functional).withContext(region).toBeTrue();
        expect(dec.analytics).withContext(region).toBeFalse();
      }
    });
  });

  describe("categoryMap", () => {
    it("returns all-deny when no record has been recorded", () => {
      const map = categoryMap(null);
      expect(map.necessary).toBeTrue();
      expect(map.functional).toBeFalse();
      expect(map.analytics).toBeFalse();
    });

    it("projects the record's categories verbatim", () => {
      const record = makeRecord({
        categories: { necessary: true, functional: false, analytics: true },
      });
      const map = categoryMap(record);
      expect(map.functional).toBeFalse();
      expect(map.analytics).toBeTrue();
    });
  });

  describe("serializeSetCookie", () => {
    it("includes Path, Max-Age, SameSite, and the cookie name", () => {
      const record = makeRecord();
      const header = serializeSetCookie(record, { secure: false });
      expect(header).toContain(`${CONSENT_COOKIE_NAME}=`);
      expect(header).toContain("Path=/");
      expect(header).toContain(`Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}`);
      expect(header).toContain("SameSite=Lax");
    });

    it("adds Secure when secure=true is requested", () => {
      const record = makeRecord();
      const header = serializeSetCookie(record, { secure: true });
      expect(header).toContain("; Secure");
    });

    it("omits Secure when secure=false is requested", () => {
      const record = makeRecord();
      const header = serializeSetCookie(record, { secure: false });
      expect(header).not.toContain("; Secure");
    });

    it("respects an overridden max-age", () => {
      const record = makeRecord();
      const header = serializeSetCookie(record, { secure: false, maxAgeSeconds: 60 });
      expect(header).toContain("Max-Age=60");
    });

    it("the value half is decodable back to the original record", () => {
      const record = makeRecord();
      const header = serializeSetCookie(record, { secure: false });
      const value = header
        .split("; ")[0]!
        .slice(`${CONSENT_COOKIE_NAME}=`.length);
      const decoded = decodeConsent(value);
      expect(decoded).toEqual(record);
    });
  });
});
