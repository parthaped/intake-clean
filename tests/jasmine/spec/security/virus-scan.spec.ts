/**
 * Unit tests for `scanForViruses`. The real implementation talks to
 * Cloudmersive's `/virus/scan/file/advanced` endpoint via `fetch`. We don't
 * actually want to hit the network from a unit test — we want to verify the
 * verdict-mapping logic, the strict-policy headers, and the
 * fail-closed-in-production behaviour we depend on for client uploads.
 *
 * Strategy:
 *   - Stub `globalThis.fetch` per spec to return a canned Cloudmersive
 *     response body. The internal `setTimeout(controller.abort, 30s)` won't
 *     fire because every stub resolves synchronously.
 *   - Toggle `CLOUDMERSIVE_API_KEY` and `NODE_ENV` to exercise the no-key
 *     branches (skipped in dev, error in production).
 *   - Use the `AbortError` shape to assert the timeout path.
 */
import { Buffer } from "node:buffer";

import { scanForViruses } from "@/lib/security/virus-scan";

interface CloudmersiveBody {
  CleanResult?: boolean;
  ContainsExecutable?: boolean;
  ContainsInvalidFile?: boolean;
  ContainsScript?: boolean;
  ContainsPasswordProtectedFile?: boolean;
  ContainsMacros?: boolean;
  ContainsXmlExternalEntities?: boolean;
  ContainsInsecureDeserialization?: boolean;
  ContainsHtml?: boolean;
  ContainsUnsafeArchive?: boolean;
  VerifiedFileFormat?: string | null;
  FoundViruses?: Array<{ FileName?: string; VirusName?: string }> | null;
}

function makeFetchResponse(body: CloudmersiveBody, init?: { ok?: boolean; status?: number }): Response {
  const ok = init?.ok ?? true;
  const status = init?.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("security: scanForViruses", () => {
  let originalFetch: typeof fetch;
  let originalApiKey: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalApiKey = process.env.CLOUDMERSIVE_API_KEY;
    originalNodeEnv = process.env.NODE_ENV;
    spyOn(console, "warn");
    spyOn(console, "error");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.CLOUDMERSIVE_API_KEY;
    else process.env.CLOUDMERSIVE_API_KEY = originalApiKey;
    if (originalNodeEnv === undefined) delete (process.env as Record<string, string>).NODE_ENV;
    else (process.env as Record<string, string>).NODE_ENV = originalNodeEnv;
  });

  describe("missing API key", () => {
    it("returns `skipped` in dev so local development isn't blocked", async () => {
      delete process.env.CLOUDMERSIVE_API_KEY;
      (process.env as Record<string, string>).NODE_ENV = "development";

      const result = await scanForViruses(Buffer.from("hello"), "application/pdf", "test.pdf");

      expect(result.status).toBe("skipped");
      expect(result.engine).toBeNull();
      expect(result.findings).toBeNull();
    });

    it("fails closed with `error` in production rather than silently skipping", async () => {
      // Without this branch a misconfigured production deploy would write
      // `skipped` rows for every upload — exactly the audit-trail gap that
      // makes "did we actually scan this file?" unanswerable later.
      delete process.env.CLOUDMERSIVE_API_KEY;
      (process.env as Record<string, string>).NODE_ENV = "production";

      const result = await scanForViruses(Buffer.from("hello"), "application/pdf", "test.pdf");

      expect(result.status).toBe("error");
      expect(result.engine).toBeNull();
      expect(result.findings).toEqual({ reason: "no_api_key" });
    });
  });

  describe("HTTP layer", () => {
    beforeEach(() => {
      process.env.CLOUDMERSIVE_API_KEY = "fake-key";
      (process.env as Record<string, string>).NODE_ENV = "test";
    });

    it("posts to Cloudmersive's advanced endpoint with the strict policy headers", async () => {
      const fetchSpy = jasmine.createSpy("fetch").and.resolveTo(
        makeFetchResponse({ CleanResult: true, VerifiedFileFormat: "PDF" }),
      );
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      await scanForViruses(Buffer.from("data"), "application/pdf", "scan.pdf");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
      expect(url).toContain("api.cloudmersive.com");
      expect(url).toContain("/virus/scan/file/advanced");
      expect(init.method).toBe("POST");

      const headers = init.headers as Record<string, string>;
      expect(headers.Apikey).toBe("fake-key");
      // Each of these flags hardens against a different active-content
      // class. Losing any of them would silently weaken the upload portal.
      expect(headers.allowExecutables).toBe("false");
      expect(headers.allowScripts).toBe("false");
      expect(headers.allowMacros).toBe("false");
      expect(headers.allowHtml).toBe("false");
      expect(headers.allowPasswordProtectedFiles).toBe("false");
      expect(headers.allowXmlExternalEntities).toBe("false");
      expect(headers.allowInsecureDeserialization).toBe("false");
      expect(headers.allowInvalidFiles).toBe("false");
      // Only document-shaped formats. Anything else is treated as a policy
      // violation by the scanner side, providing a second layer over our
      // own magic-byte validator.
      expect(headers.restrictFileTypes).toBe("pdf,jpg,jpeg,png,heic,heif,webp");
    });

    it("returns `error` (with HTTP status in findings) on a non-200 response", async () => {
      globalThis.fetch = (async () =>
        makeFetchResponse({}, { ok: false, status: 502 })) as unknown as typeof fetch;

      const result = await scanForViruses(Buffer.from("d"), "application/pdf", "x.pdf");

      expect(result.status).toBe("error");
      expect(result.engine).toBe("cloudmersive");
      expect(result.findings).toEqual({ http_status: 502 });
    });

    it("returns `error` with `reason: 'timeout'` when the request aborts", async () => {
      // The implementation wraps `fetch` with an AbortController that fires
      // after 30s. Simulate the abort path by throwing an `AbortError`.
      globalThis.fetch = (async () => {
        const err = new Error("aborted");
        (err as { name: string }).name = "AbortError";
        throw err;
      }) as unknown as typeof fetch;

      const result = await scanForViruses(Buffer.from("d"), "application/pdf", "x.pdf");

      expect(result.status).toBe("error");
      expect(result.engine).toBe("cloudmersive");
      expect(result.findings).toEqual({ reason: "timeout" });
    });

    it("returns `error` (with the message) on any other thrown error", async () => {
      globalThis.fetch = (async () => {
        throw new Error("dns lookup failed");
      }) as unknown as typeof fetch;

      const result = await scanForViruses(Buffer.from("d"), "application/pdf", "x.pdf");

      expect(result.status).toBe("error");
      expect(result.findings).toEqual({ reason: "dns lookup failed" });
    });
  });

  describe("verdict mapping", () => {
    beforeEach(() => {
      process.env.CLOUDMERSIVE_API_KEY = "fake-key";
      (process.env as Record<string, string>).NODE_ENV = "test";
    });

    function withScanBody(body: CloudmersiveBody) {
      globalThis.fetch = (async () => makeFetchResponse(body)) as unknown as typeof fetch;
    }

    it("returns `clean` when CleanResult is true and no flags fired", async () => {
      withScanBody({ CleanResult: true, VerifiedFileFormat: "PDF" });
      const r = await scanForViruses(Buffer.from("d"), "application/pdf", "x.pdf");
      expect(r.status).toBe("clean");
      expect(r.engine).toBe("cloudmersive");
      expect(r.findings).toEqual({ verified_format: "PDF" });
    });

    it("returns `clean` with null findings when the verified format is missing", async () => {
      withScanBody({ CleanResult: true });
      const r = await scanForViruses(Buffer.from("d"), "application/pdf", "x.pdf");
      expect(r.status).toBe("clean");
      expect(r.findings).toBeNull();
    });

    it("returns `infected` when CleanResult is explicitly false", async () => {
      withScanBody({ CleanResult: false });
      const r = await scanForViruses(Buffer.from("d"), "application/pdf", "x.pdf");
      expect(r.status).toBe("infected");
      expect(r.engine).toBe("cloudmersive");
      const findings = r.findings as { clean: boolean | undefined };
      expect(findings.clean).toBeFalse();
    });

    it("returns `infected` when FoundViruses contains entries", async () => {
      withScanBody({
        CleanResult: true,
        FoundViruses: [{ FileName: "x.pdf", VirusName: "EICAR-Test-Signature" }],
      });
      const r = await scanForViruses(Buffer.from("d"), "application/pdf", "x.pdf");
      expect(r.status).toBe("infected");
      const findings = r.findings as { viruses: Array<{ VirusName?: string }> };
      expect(findings.viruses[0]?.VirusName).toBe("EICAR-Test-Signature");
    });

    // Each blocking flag is its own attack class; if any one stops being
    // treated as `infected` an upload portal could regress silently. We
    // assert each one independently rather than the union.
    const blockingFlags: Array<keyof CloudmersiveBody> = [
      "ContainsExecutable",
      "ContainsInvalidFile",
      "ContainsScript",
      "ContainsPasswordProtectedFile",
      "ContainsMacros",
      "ContainsXmlExternalEntities",
      "ContainsInsecureDeserialization",
      "ContainsHtml",
      "ContainsUnsafeArchive",
    ];
    for (const flag of blockingFlags) {
      it(`returns \`infected\` when ${flag} is true (even if CleanResult is true)`, async () => {
        withScanBody({ CleanResult: true, [flag]: true } as CloudmersiveBody);
        const r = await scanForViruses(Buffer.from("d"), "application/pdf", "x.pdf");
        expect(r.status).toBe("infected");
      });
    }

    it("returns `unknown` when CleanResult is undefined (scanner couldn't decide)", async () => {
      // The route's production fail-closed logic depends on `unknown` being
      // a distinct status from `clean` — losing this branch would let
      // indeterminate verdicts bypass the upload-time scanner gate.
      withScanBody({ VerifiedFileFormat: "PDF" });
      const r = await scanForViruses(Buffer.from("d"), "application/pdf", "x.pdf");
      expect(r.status).toBe("unknown");
      expect(r.engine).toBe("cloudmersive");
    });
  });
});
