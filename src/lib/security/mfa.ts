import "server-only";

import { getServerSupabase } from "@/lib/supabase/server";
import type { ProfileRole } from "@/types/database";

/**
 * Maximum age (seconds) of the most recent MFA challenge that we'll accept
 * for "step-up"-flagged operations like deleting an org, changing the
 * billing plan, or exporting a full packet. Sessions older than this still
 * pass `aal2` (so day-to-day reading is uninterrupted), but operations
 * that ask for `freshness` will redirect the user back through the MFA
 * challenge form before letting the action proceed.
 *
 * 15 minutes is the OWASP-recommended ceiling for re-auth on sensitive
 * operations in long-lived sessions.
 */
export const STEP_UP_FRESHNESS_SECONDS = 15 * 60;

/**
 * Roles that MUST have MFA enrolled and present an `aal2` session in order
 * to access privileged surfaces (settings, exports, billing, audit log).
 *
 * `paralegal` is intentionally NOT required to use MFA so day-one demos and
 * lower-trust accounts can still sign in. Firms can override this for their
 * org by enforcing MFA on the Supabase project itself (Auth -> Multi-Factor
 * Authentication -> "Required for all users").
 */
export const MFA_REQUIRED_ROLES: ReadonlySet<ProfileRole> = new Set(["admin", "attorney"]);

export type MfaState =
  | { ok: true }
  | { ok: false; reason: "needs_enrollment"; message: string }
  | { ok: false; reason: "needs_challenge"; message: string }
  | { ok: false; reason: "needs_freshness"; message: string };

/**
 * Inspects the current Supabase session's Authentication Assurance Level
 * (AAL) and the user's enrolled factors. Returns `ok: true` when:
 *   - the user has at least one verified factor AND
 *   - the active session was minted with `aal2` (i.e. they actually answered
 *     a TOTP challenge during this sign-in).
 *
 * When the role does NOT require MFA, this short-circuits to `ok: true`.
 *
 * Docs: https://supabase.com/docs/guides/auth/auth-mfa
 */
interface CheckMfaOptions {
  /**
   * If set, also requires that the most recent MFA assertion happened within
   * `STEP_UP_FRESHNESS_SECONDS`. Use for destructive ops (org delete, plan
   * change, packet export). Without this, any session that already
   * satisfied AAL2 passes — even if MFA was completed days ago.
   */
  requireFreshness?: boolean;
}

export async function checkMfaForRole(
  role: ProfileRole,
  options: CheckMfaOptions = {},
): Promise<MfaState> {
  if (!MFA_REQUIRED_ROLES.has(role)) return { ok: true };

  const supabase = await getServerSupabase();

  // Returns the assurance levels for the current session. `currentLevel` is
  // what the user has *right now*; `nextLevel` is what they could escalate to
  // by completing an outstanding challenge.
  const { data: aal, error: aalErr } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalErr) {
    // Fail closed when we cannot determine the AAL — privileged routes
    // should never silently downgrade.
    return {
      ok: false,
      reason: "needs_challenge",
      message: "Could not verify MFA state. Sign out and sign in again.",
    };
  }

  if (aal?.currentLevel !== "aal2") {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerifiedFactor = (factors?.totp ?? []).some((f) => f.status === "verified");

    if (!hasVerifiedFactor) {
      return {
        ok: false,
        reason: "needs_enrollment",
        message: "MFA is required for your role. Enroll an authenticator app to continue.",
      };
    }
    return {
      ok: false,
      reason: "needs_challenge",
      message: "MFA is required for your role. Complete the verification step to continue.",
    };
  }

  if (!options.requireFreshness) return { ok: true };

  // Step-up freshness: the JWT's `amr` (Authentication Methods References)
  // claim records each factor used to mint the session along with the unix
  // timestamp at which it happened. We accept the session only when an
  // `mfa/totp` (or any non-`pwd`/`oauth`) entry is recent enough.
  const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
  const accessToken = sessionRes?.session?.access_token;
  if (sessionErr || !accessToken) {
    return {
      ok: false,
      reason: "needs_challenge",
      message: "Could not verify session freshness. Re-verify with your authenticator to continue.",
    };
  }

  if (!isAmrFresh(accessToken, Math.floor(Date.now() / 1000))) {
    return {
      ok: false,
      reason: "needs_freshness",
      message: "This action needs a fresh MFA confirmation. Verify a new code and try again.",
    };
  }

  return { ok: true };
}

/**
 * Pure freshness check, exported so the pen-test suite can exercise it
 * against synthetic JWTs without spinning up a Supabase session.
 *
 * Returns `true` iff the token's `amr` array contains at least one entry
 * whose `method` is something other than `pwd`/`oauth` (i.e. an actual MFA
 * factor) AND whose `timestamp` is within `STEP_UP_FRESHNESS_SECONDS` of
 * `nowSeconds`. Missing claims, malformed JWTs, only-password sessions, and
 * stale MFA all return `false`.
 */
export function isAmrFresh(jwt: string, nowSeconds: number): boolean {
  const claims = decodeJwtPayload(jwt);
  if (!claims) return false;
  const amr = Array.isArray(claims.amr)
    ? (claims.amr as Array<{ method?: unknown; timestamp?: unknown }>)
    : [];
  const lastMfaAt = amr
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.method === "string" &&
        entry.method !== "pwd" &&
        entry.method !== "oauth",
    )
    .reduce<number>(
      (latest, entry) =>
        typeof entry.timestamp === "number" && entry.timestamp > latest ? entry.timestamp : latest,
      0,
    );
  if (lastMfaAt === 0) return false;
  return nowSeconds - lastMfaAt <= STEP_UP_FRESHNESS_SECONDS;
}

/**
 * Exported for the security pen-test suite — see
 * `tests/jasmine/spec/security/mfa-jwt.spec.ts`. The payload-only decode is
 * used for the `amr` freshness check and explicitly does NOT verify the
 * signature (Supabase already did that when minting the session).
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  // Sentry-safe payload decode. We don't verify the signature here because
  // Supabase already validated it when minting the session; we only need
  // the `amr` claim for freshness arithmetic.
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
