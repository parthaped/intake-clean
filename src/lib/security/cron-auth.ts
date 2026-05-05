import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of an `Authorization: Bearer <token>` header
 * against the expected value derived from `CRON_SECRET`. Used by every
 * Vercel-Cron-triggered route in the app.
 *
 * Why constant-time:
 *   - `===` short-circuits on the first differing byte, so the wall-clock
 *     latency leaks how many leading characters of the secret an attacker
 *     guessed correctly. Over enough samples this is enough to recover the
 *     secret one byte at a time.
 *   - `timingSafeEqual` always reads every byte of both buffers.
 *
 * Why pad on length mismatch:
 *   - `timingSafeEqual` THROWS when the two buffers have different lengths,
 *     and the throw itself is observable. We pad the comparison against a
 *     same-length zero buffer so that:
 *       1. We always perform exactly one constant-time compare regardless of
 *          the attacker's input length.
 *       2. The function never throws based on user input.
 *     The result for any length mismatch is `false`, full stop.
 */
export function verifyCronToken(
  headerValue: string | null | undefined,
  expectedSecret: string | null | undefined,
): boolean {
  if (!expectedSecret) {
    // No secret configured. Caller is responsible for deciding whether
    // to allow unauthenticated traffic in dev (typical) vs reject it in
    // production. We return `false` here so the default-deny path is the
    // one a forgetful operator falls into.
    return false;
  }
  if (typeof headerValue !== "string" || headerValue.length === 0) return false;

  const a = Buffer.from(headerValue);
  const b = Buffer.from(`Bearer ${expectedSecret}`);

  if (a.length !== b.length) {
    // Constant-time noise: still perform an equal-length compare so the
    // attacker can't distinguish "wrong length" from "wrong content" by
    // measuring response latency.
    const filler = Buffer.alloc(a.length);
    timingSafeEqual(a, filler);
    return false;
  }
  return timingSafeEqual(a, b);
}
