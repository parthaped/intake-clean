import { verifyCronToken } from "@/lib/security/cron-auth";

/**
 * Pen-test the constant-time CRON_SECRET comparison used by every
 * Vercel-Cron-triggered route.
 *
 * Threat model:
 *   - An external scanner discovers `/api/process/run` and `/api/cron/audit-retention`.
 *   - They probe with rotating bearer tokens hoping a leak in our compare
 *     routine (`==` short-circuit, length-based throw) lets them recover
 *     the secret one byte at a time, or that an empty / malformed header
 *     is accepted.
 *
 * We assert each likely attack returns `false`, never throws, and that the
 * one happy-path input returns `true`.
 */
describe("security: verifyCronToken", () => {
  const SECRET = "s3cret-token-with-padding";
  const VALID = `Bearer ${SECRET}`;

  it("accepts the exact valid bearer token", () => {
    expect(verifyCronToken(VALID, SECRET)).toBeTrue();
  });

  it("rejects a missing/empty header", () => {
    expect(verifyCronToken(null, SECRET)).toBeFalse();
    expect(verifyCronToken(undefined, SECRET)).toBeFalse();
    expect(verifyCronToken("", SECRET)).toBeFalse();
  });

  it("rejects when the secret is unset (default-deny)", () => {
    expect(verifyCronToken(VALID, null)).toBeFalse();
    expect(verifyCronToken(VALID, undefined)).toBeFalse();
    expect(verifyCronToken(VALID, "")).toBeFalse();
  });

  it("rejects a header missing the Bearer prefix", () => {
    expect(verifyCronToken(SECRET, SECRET)).toBeFalse();
    expect(verifyCronToken(`Token ${SECRET}`, SECRET)).toBeFalse();
  });

  it("rejects a wrong secret of the same length", () => {
    const wrong = "x".repeat(SECRET.length);
    expect(verifyCronToken(`Bearer ${wrong}`, SECRET)).toBeFalse();
  });

  it("rejects a one-character truncated header", () => {
    expect(verifyCronToken(VALID.slice(0, -1), SECRET)).toBeFalse();
  });

  it("rejects a header padded by extra characters", () => {
    expect(verifyCronToken(`${VALID}!`, SECRET)).toBeFalse();
    expect(verifyCronToken(` ${VALID}`, SECRET)).toBeFalse();
    expect(verifyCronToken(`${VALID} `, SECRET)).toBeFalse();
  });

  it("never throws for adversarial inputs", () => {
    const adversarial: Array<string> = [
      "\0",
      "\u0000Bearer ",
      "Bearer \nBearer ",
      `Bearer ${SECRET}\r\nBearer ${SECRET}`,
      "💥".repeat(100),
      "%00".repeat(100),
    ];
    for (const value of adversarial) {
      expect(() => verifyCronToken(value, SECRET)).not.toThrow();
      expect(verifyCronToken(value, SECRET)).toBeFalse();
    }
  });

  it("does not leak length information by throwing", () => {
    // The implementation pads to `a.length` and runs a single
    // constant-time compare, so passing a value of any length must
    // produce `false` without an exception.
    for (const length of [0, 1, 5, 10, 1000, 10_000]) {
      const probe = "x".repeat(length);
      expect(() => verifyCronToken(probe, SECRET)).not.toThrow();
      expect(verifyCronToken(probe, SECRET)).toBeFalse();
    }
  });
});
