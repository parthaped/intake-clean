/**
 * Coarse region detection for the consent banner.
 *
 * Vercel injects `x-vercel-ip-country` (an ISO 3166-1 alpha-2 code) into
 * every request that hits a Function or RSC render. We treat that header
 * as authoritative in production and fall back to `OTHER` when it is
 * absent — that bucket gets the soft U.S.-style banner, which is the
 * least-friction option that still respects regulators we don't have a
 * specific signal for.
 *
 * Local development never sees the Vercel header. To exercise the EEA
 * code paths during dev, set `NEXT_PUBLIC_CONSENT_REGION_OVERRIDE=EEA`.
 */

import type { ConsentRegion } from "./types";

/** ISO 3166 codes for the European Economic Area (27 EU + IS, LI, NO). */
const EEA_COUNTRIES: ReadonlySet<string> = new Set([
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
  // Non-EU EEA members:
  "IS",
  "LI",
  "NO",
]);

/** Switzerland is GDPR-adjacent (revFADP) — bucket it with EEA for prompt purposes. */
const EEA_ADJACENT: ReadonlySet<string> = new Set(["CH"]);

const OVERRIDE_ENV = "NEXT_PUBLIC_CONSENT_REGION_OVERRIDE";
const VALID_OVERRIDES: ReadonlySet<ConsentRegion> = new Set(["EEA", "UK", "US", "OTHER"]);

/** Tiny `Headers`-shaped subset so this file stays runtime-agnostic. */
export interface HeaderLike {
  get(name: string): string | null;
}

/**
 * Map a request's headers to a region bucket. Falls back to the override
 * env var (dev only) and finally to `"OTHER"`.
 */
export function regionFromHeaders(headers: HeaderLike | null | undefined): ConsentRegion {
  const override = readOverride();
  if (override) return override;

  const country = headers?.get("x-vercel-ip-country");
  return regionFromCountryCode(country);
}

/** Pure version exposed for unit tests and direct callers. */
export function regionFromCountryCode(code: string | null | undefined): ConsentRegion {
  if (!code) return "OTHER";
  const upper = code.trim().toUpperCase();
  if (upper === "") return "OTHER";
  if (upper === "GB" || upper === "UK") return "UK";
  if (upper === "US") return "US";
  if (EEA_COUNTRIES.has(upper)) return "EEA";
  if (EEA_ADJACENT.has(upper)) return "EEA";
  return "OTHER";
}

function readOverride(): ConsentRegion | null {
  // Literal access so Next.js inlines `NEXT_PUBLIC_*` in the client bundle.
  const raw = process.env.NEXT_PUBLIC_CONSENT_REGION_OVERRIDE;
  if (!raw) return null;
  const upper = raw.trim().toUpperCase() as ConsentRegion;
  return VALID_OVERRIDES.has(upper) ? upper : null;
}

/** Exported only for tests; allows them to assert the env name hasn't drifted. */
export const CONSENT_REGION_OVERRIDE_ENV = OVERRIDE_ENV;
