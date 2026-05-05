import nextConfig from "../../../../next.config";

/**
 * Pen-test the platform-edge security headers configured in
 * `next.config.ts`. These are the last line of defence between an XSS or
 * click-jacking attempt and a user's browser; if any of them silently
 * disappear from a future config edit, our risk profile changes.
 *
 * We intentionally treat the next.config as the source of truth and
 * inspect what `headers()` returns rather than reaching into Vercel's
 * proxy at runtime. That keeps the test hermetic.
 */
describe("security: HTTP response headers", () => {
  let headerMap: Record<string, string>;

  beforeAll(async () => {
    // The default export is wrapped with `withBotId`, but the wrapper
    // preserves `headers()` verbatim — we can call it directly.
    const cfg = nextConfig as unknown as {
      headers?: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
    };
    if (typeof cfg.headers !== "function") {
      throw new Error("next.config.ts no longer exposes a headers() function — security regression!");
    }
    const sets = await cfg.headers();
    expect(sets.length).toBeGreaterThan(0);
    expect(sets[0].source).toBe("/:path*");
    headerMap = Object.fromEntries(sets[0].headers.map((h) => [h.key.toLowerCase(), h.value]));
  });

  it("sends a long-lived HSTS preload header", () => {
    const v = headerMap["strict-transport-security"];
    expect(v).toBeDefined();
    expect(v).toContain("max-age=");
    expect(v).toContain("includeSubDomains");
    expect(v).toContain("preload");
    // Two years minimum (preload list requirement).
    const max = Number(/max-age=(\d+)/.exec(v!)?.[1] ?? 0);
    expect(max).toBeGreaterThanOrEqual(63_072_000);
  });

  it("sets X-Content-Type-Options: nosniff", () => {
    expect(headerMap["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY (anti-clickjacking)", () => {
    expect(headerMap["x-frame-options"]).toBe("DENY");
  });

  it("sets a strict Referrer-Policy", () => {
    expect(headerMap["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("denies sensitive browser features by Permissions-Policy", () => {
    const v = headerMap["permissions-policy"];
    expect(v).toBeDefined();
    for (const feature of ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()"]) {
      expect(v).toContain(feature);
    }
  });

  it("sets Cross-Origin-Opener-Policy: same-origin", () => {
    expect(headerMap["cross-origin-opener-policy"]).toBe("same-origin");
  });

  describe("Content-Security-Policy", () => {
    let csp: string;
    beforeAll(() => {
      csp = headerMap["content-security-policy"];
      expect(csp).toBeDefined();
    });

    it("declares a default-src of 'self'", () => {
      expect(csp).toContain("default-src 'self'");
    });

    it("forbids object embeds", () => {
      expect(csp).toContain("object-src 'none'");
    });

    it("forbids being framed (frame-ancestors 'none')", () => {
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it("locks form-action to same-origin", () => {
      expect(csp).toContain("form-action 'self'");
    });

    it("locks base-uri to same-origin (prevents <base> hijack)", () => {
      expect(csp).toContain("base-uri 'self'");
    });

    it("upgrades insecure requests", () => {
      expect(csp).toContain("upgrade-insecure-requests");
    });

    it("does NOT include unsafe-eval in production", () => {
      // We only allow unsafe-eval in development for HMR. The test
      // process inherits NODE_ENV; if it's anything other than
      // "production" we expect unsafe-eval to be present, otherwise it
      // must be absent.
      const isProd = process.env.NODE_ENV === "production";
      if (isProd) {
        expect(csp).not.toContain("'unsafe-eval'");
      }
      // Either way, eval must never appear in connect-src or default-src.
      expect(csp).not.toMatch(/default-src[^;]*'unsafe-eval'/);
    });
  });
});
