import "server-only";

import { cookies, headers } from "next/headers";

import { decodeConsent } from "./cookie";
import { regionFromHeaders } from "./region";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_PROMPT_REQUIRED_REGIONS,
  type ConsentRecord,
  type ConsentRegion,
} from "./types";

/** Result of `loadConsentForRequest()`; everything the marketing shell needs. */
export interface ConsentBootstrap {
  record: ConsentRecord | null;
  region: ConsentRegion;
  /** True when the banner should be visible on first paint. */
  requiresPrompt: boolean;
}

/**
 * Read the consent cookie + region header for the current RSC render.
 *
 * This runs on every marketing page load. Keep it cheap — no I/O beyond
 * the request-scoped `cookies()` and `headers()` helpers.
 */
export async function loadConsentForRequest(): Promise<ConsentBootstrap> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const raw = cookieStore.get(CONSENT_COOKIE_NAME)?.value;
  const record = decodeConsent(raw);
  const region = regionFromHeaders(headerStore);
  return {
    record,
    region,
    requiresPrompt: shouldPromptOnFirstPaint(record, region),
  };
}

/**
 * Decide whether the banner should be visible on first paint.
 *
 * Pre-render this on the server so the banner ships its initial state in
 * the HTML — no hydration flash either way.
 */
export function shouldPromptOnFirstPaint(
  record: ConsentRecord | null,
  region: ConsentRegion,
): boolean {
  // A valid recorded decision overrides everything else, regardless of
  // region. (GPC-driven `auto_gpc` records also count as a decision.)
  if (record) return false;
  // EEA/UK: legally required to prompt before any non-essential cookie.
  if (CONSENT_PROMPT_REQUIRED_REGIONS.has(region)) return true;
  // U.S. and OTHER: show a softer banner so users can revisit settings,
  // but the GPC client-side check will silently auto-record before the
  // banner ever paints if the browser sends the signal.
  return true;
}
