import { safeNextPath } from "@/lib/security/safe-redirect";

/**
 * Pen-test the open-redirect protection on the auth callback.
 *
 * Threat model: an attacker crafts a Supabase recovery / magic-link URL
 * with a `?next=` parameter that, after the code exchange succeeds, sends
 * the now-authenticated user to a phishing or token-stealing site. The
 * helper must reject anything that would leave our origin while still
 * allowing legitimate in-app paths.
 */
describe("security: safeNextPath open-redirect protection", () => {
  describe("legitimate in-app paths pass through", () => {
    const goods = [
      "/",
      "/dashboard",
      "/dashboard/settings",
      "/dashboard/clients/abc-123",
      "/dashboard?tab=billing",
      "/dashboard/clients/abc-123?modal=delete",
      "/dashboard#section",
    ];
    for (const value of goods) {
      it(`accepts ${JSON.stringify(value)}`, () => {
        expect(safeNextPath(value)).not.toBeNull();
      });
    }
  });

  describe("attacker payloads are rejected", () => {
    const evils: Array<[string, string | null]> = [
      // Protocol-relative — the original `startsWith("/")` check let these
      // through, then `new URL("//evil", origin)` resolves to evil's origin.
      ["//evil.example.com", null],
      ["//evil.example.com/path?q=1", null],
      ["///evil.example.com", null],
      // Back-slash variant — some browsers/proxies normalise `/\` to `//`.
      ["/\\evil.example.com", null],
      ["/\\\\evil.example.com", null],
      // Absolute URLs.
      ["https://evil.example.com", null],
      ["http://evil.example.com", null],
      ["HTTPS://EVIL.EXAMPLE.COM", null],
      // Inline scheme payloads.
      ["javascript:alert(1)", null],
      ["JAVASCRIPT:alert(1)", null],
      ["data:text/html,<script>alert(1)</script>", null],
      ["vbscript:msgbox(1)", null],
      // Misc.
      ["", null],
      [" ", null],
      ["dashboard", null], // missing leading slash
      ["./relative", null],
      ["../escape", null],
      ["?next=phishing", null],
      ["#fragment-only", null],
    ];
    for (const [value, expected] of evils) {
      it(`rejects ${JSON.stringify(value)}`, () => {
        expect(safeNextPath(value)).toBe(expected);
      });
    }
  });

  describe("nullish input", () => {
    it("returns null for null", () => {
      expect(safeNextPath(null)).toBeNull();
    });
    it("returns null for undefined", () => {
      expect(safeNextPath(undefined)).toBeNull();
    });
  });

  describe("origin invariant — defence-in-depth", () => {
    /**
     * For every input we accept, resolving it against ANY origin must
     * produce that same origin. This catches any future regression where
     * a sneaky escape (e.g. a unicode confusable, an embedded URL) bypasses
     * the leading-character checks.
     */
    const probes = [
      "/",
      "/dashboard",
      "/dashboard?next=//evil.com",
      "/dashboard#https://evil.com",
      "/dashboard?return=https%3A%2F%2Fevil.com",
    ];
    for (const value of probes) {
      it(`stays within sentinel origin for ${JSON.stringify(value)}`, () => {
        const safe = safeNextPath(value);
        if (safe === null) return; // rejected outright is also fine
        const origin = "https://my-app.example";
        const url = new URL(safe, origin);
        expect(url.origin).toBe(origin);
      });
    }
  });
});
