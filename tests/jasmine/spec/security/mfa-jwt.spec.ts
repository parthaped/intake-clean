import {
  decodeJwtPayload,
  isAmrFresh,
  STEP_UP_FRESHNESS_SECONDS,
} from "@/lib/security/mfa";

/**
 * Pen-test the MFA freshness arithmetic that gates step-up-required
 * actions (org delete, plan change, packet export, role changes).
 *
 * Threat model: an attacker steals a long-lived `aal2` session cookie via
 * XSS or a stolen device. Without the freshness check they could drain
 * every export endpoint immediately. With it, every privileged action
 * requires a fresh TOTP within `STEP_UP_FRESHNESS_SECONDS` (15 min).
 *
 * `isAmrFresh` is the pure-functional core of that check; here we verify:
 *   - Sessions where the only credential is `pwd`/`oauth` are NOT fresh.
 *   - Recent `mfa/totp` makes the session fresh.
 *   - Anything older than the ceiling makes it stale.
 *   - Forged or malformed tokens are rejected.
 */

function b64url(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  // Signature is irrelevant — Supabase already verified it. We use a
  // plausible-looking value so consumers that *do* split into 3 parts
  // succeed.
  const sig = "ZmFrZS1zaWduYXR1cmU";
  return `${header}.${body}.${sig}`;
}

describe("security: MFA JWT freshness checks", () => {
  const NOW = 1_750_000_000;
  const FRESH = NOW - 60; // 1 minute ago
  const STALE = NOW - STEP_UP_FRESHNESS_SECONDS - 60; // just over the ceiling
  const ANCIENT = NOW - 24 * 60 * 60; // a day ago

  describe("isAmrFresh", () => {
    it("treats a recent mfa/totp assertion as fresh", () => {
      const jwt = makeJwt({
        amr: [
          { method: "pwd", timestamp: NOW - 1000 },
          { method: "mfa/totp", timestamp: FRESH },
        ],
      });
      expect(isAmrFresh(jwt, NOW)).toBeTrue();
    });

    it("treats a stale mfa/totp as not fresh", () => {
      const jwt = makeJwt({
        amr: [
          { method: "pwd", timestamp: NOW - 1000 },
          { method: "mfa/totp", timestamp: STALE },
        ],
      });
      expect(isAmrFresh(jwt, NOW)).toBeFalse();
    });

    it("treats a session with ONLY pwd/oauth methods as not fresh (no MFA at all)", () => {
      const jwt = makeJwt({
        amr: [
          { method: "pwd", timestamp: FRESH },
          { method: "oauth", timestamp: FRESH },
        ],
      });
      expect(isAmrFresh(jwt, NOW)).toBeFalse();
    });

    it("treats a missing amr claim as not fresh", () => {
      const jwt = makeJwt({ sub: "user-1" });
      expect(isAmrFresh(jwt, NOW)).toBeFalse();
    });

    it("treats an ancient mfa assertion as not fresh", () => {
      const jwt = makeJwt({
        amr: [{ method: "mfa/totp", timestamp: ANCIENT }],
      });
      expect(isAmrFresh(jwt, NOW)).toBeFalse();
    });

    it("uses the MOST-RECENT mfa entry when multiple are present", () => {
      const jwt = makeJwt({
        amr: [
          { method: "mfa/totp", timestamp: STALE },
          { method: "mfa/totp", timestamp: FRESH },
        ],
      });
      expect(isAmrFresh(jwt, NOW)).toBeTrue();
    });

    it("ignores entries that omit timestamp", () => {
      const jwt = makeJwt({
        amr: [{ method: "mfa/totp" }, { method: "mfa/totp", timestamp: STALE }],
      });
      expect(isAmrFresh(jwt, NOW)).toBeFalse();
    });

    it("ignores entries that aren't real objects", () => {
      const jwt = makeJwt({
        amr: ["mfa/totp", null, 42, { method: "mfa/totp", timestamp: FRESH }],
      });
      // The fresh genuine object still wins.
      expect(isAmrFresh(jwt, NOW)).toBeTrue();
    });
  });

  describe("decodeJwtPayload (private helper, exposed for tests)", () => {
    it("decodes a well-formed JWT", () => {
      const jwt = makeJwt({ sub: "user-1", role: "admin" });
      const claims = decodeJwtPayload(jwt);
      expect(claims).not.toBeNull();
      expect(claims!.sub).toBe("user-1");
      expect(claims!.role).toBe("admin");
    });

    it("returns null for tokens that do not have three parts", () => {
      expect(decodeJwtPayload("not.a.jwt.at.all")).toBeNull();
      expect(decodeJwtPayload("only-one-part")).toBeNull();
      expect(decodeJwtPayload("two.parts")).toBeNull();
      expect(decodeJwtPayload("")).toBeNull();
    });

    it("returns null when the payload is not valid JSON", () => {
      const header = b64url(JSON.stringify({ alg: "none" }));
      const broken = `${header}.${b64url("{not-json")}.sig`;
      expect(decodeJwtPayload(broken)).toBeNull();
    });

    it("does not throw on adversarial input", () => {
      const inputs = ["", ".", "...", "a".repeat(10_000), "💥.💥.💥"];
      for (const v of inputs) {
        expect(() => decodeJwtPayload(v)).not.toThrow();
      }
    });
  });
});
