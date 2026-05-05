/**
 * Pure cookie encode/decode helpers for the `ic-consent` cookie.
 *
 * Kept free of Next.js imports so it can be unit-tested in plain Jasmine
 * and reused from middleware, route handlers, and the client island.
 */

import {
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  CONSENT_VERSION,
  type ConsentCategory,
  type ConsentRecord,
  type ConsentRegion,
  type ConsentSource,
} from "./types";

const VALID_REGIONS: ReadonlySet<ConsentRegion> = new Set(["EEA", "UK", "US", "OTHER"]);
const VALID_SOURCES: ReadonlySet<ConsentSource> = new Set([
  "banner_accept_all",
  "banner_essential_only",
  "modal_save",
  "auto_gpc",
]);

/**
 * Default decision for a fresh visitor in the given region. Used both to
 * seed the modal's checkbox state and to fabricate the auto-GPC record.
 */
export function defaultDecision(region: ConsentRegion): ConsentRecord["categories"] {
  // EEA/UK require explicit opt-in for everything non-essential. The U.S.
  // baseline (with no GPC signal) lets us pre-tick `functional` for the
  // theme/sidebar experience, while keeping `analytics` opt-in everywhere
  // since we never ship the product with analytics enabled by default.
  if (region === "EEA" || region === "UK") {
    return { necessary: true, functional: false, analytics: false };
  }
  return { necessary: true, functional: true, analytics: false };
}

/** Build a fresh `ConsentRecord` from category choices + provenance. */
export function buildRecord(args: {
  region: ConsentRegion;
  gpc: boolean;
  source: ConsentSource;
  categories: ConsentRecord["categories"];
  now?: Date;
}): ConsentRecord {
  return {
    v: CONSENT_VERSION,
    ts: (args.now ?? new Date()).toISOString(),
    region: args.region,
    gpc: args.gpc,
    source: args.source,
    categories: {
      necessary: true,
      functional: args.categories.functional,
      analytics: args.categories.analytics,
    },
  };
}

/** Serialize a record to its cookie value (URI-encoded compact JSON). */
export function encodeConsent(record: ConsentRecord): string {
  return encodeURIComponent(JSON.stringify(record));
}

/**
 * Parse a raw cookie value back into a `ConsentRecord`.
 *
 * Returns `null` for any of:
 *   - missing input,
 *   - malformed JSON,
 *   - mismatched schema version (forces re-prompt on material change),
 *   - any field failing structural validation (defends against tampering).
 */
export function decodeConsent(raw: string | undefined | null): ConsentRecord | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) return null;
  if (parsed.v !== CONSENT_VERSION) return null;
  if (typeof parsed.ts !== "string" || Number.isNaN(Date.parse(parsed.ts))) return null;
  if (typeof parsed.gpc !== "boolean") return null;
  if (typeof parsed.region !== "string" || !VALID_REGIONS.has(parsed.region as ConsentRegion)) {
    return null;
  }
  if (typeof parsed.source !== "string" || !VALID_SOURCES.has(parsed.source as ConsentSource)) {
    return null;
  }
  if (!isPlainObject(parsed.categories)) return null;
  const cats = parsed.categories;
  if (cats.necessary !== true) return null;
  if (typeof cats.functional !== "boolean") return null;
  if (typeof cats.analytics !== "boolean") return null;

  return {
    v: CONSENT_VERSION,
    ts: parsed.ts,
    region: parsed.region as ConsentRegion,
    gpc: parsed.gpc,
    source: parsed.source as ConsentSource,
    categories: {
      necessary: true,
      functional: cats.functional,
      analytics: cats.analytics,
    },
  };
}

/**
 * Build a `Set-Cookie` header value for the consent record.
 *
 * `Secure` is added in production; we leave it off in development so the
 * cookie still works against `http://localhost:3000`. `SameSite=Lax` is
 * the right default — the cookie is purely first-party and never used in
 * cross-site contexts.
 */
export function serializeSetCookie(
  record: ConsentRecord,
  options: { secure?: boolean; maxAgeSeconds?: number } = {},
): string {
  const value = encodeConsent(record);
  const parts: string[] = [
    `${CONSENT_COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${options.maxAgeSeconds ?? CONSENT_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];
  if (options.secure ?? process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/** Project the record into the boolean map most callers actually care about. */
export function categoryMap(record: ConsentRecord | null): Record<ConsentCategory, boolean> {
  if (!record) {
    return { necessary: true, functional: false, analytics: false };
  }
  return {
    necessary: true,
    functional: record.categories.functional,
    analytics: record.categories.analytics,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
