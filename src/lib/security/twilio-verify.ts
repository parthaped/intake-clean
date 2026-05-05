import twilio from "twilio";

/**
 * Pure helper that wraps Twilio's request-signature verification so we can
 * unit-test the inbound webhook without spinning up the full Next route
 * (which also touches Supabase).
 *
 * Twilio computes `X-Twilio-Signature` as:
 *
 *   base64( HMAC-SHA1( authToken, fullUrl + concat(sortedKey + value) ) )
 *
 * `twilio.validateRequest` reproduces that calculation against the raw
 * params we observed and the URL we believe Twilio called. Any tampering
 * — body changed, signed against a different URL, signature truncated,
 * different auth token — flips the boolean to `false`.
 */
export interface TwilioVerifyArgs {
  /** `TWILIO_AUTH_TOKEN` from the Twilio console. Required. */
  authToken: string | null | undefined;
  /** Value of the `X-Twilio-Signature` request header (base64 HMAC). */
  signature: string | null | undefined;
  /** The exact URL Twilio called (including query string), as Twilio saw it. */
  url: string;
  /** All form params from the POST body, decoded. Order doesn't matter. */
  params: Record<string, string>;
}

export type TwilioVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_token" | "missing_signature" | "invalid_signature" };

export function verifyTwilioWebhook(args: TwilioVerifyArgs): TwilioVerifyResult {
  if (!args.authToken) return { ok: false, reason: "missing_token" };
  if (typeof args.signature !== "string" || args.signature.length === 0) {
    return { ok: false, reason: "missing_signature" };
  }
  const valid = twilio.validateRequest(args.authToken, args.signature, args.url, args.params);
  return valid ? { ok: true } : { ok: false, reason: "invalid_signature" };
}

/**
 * Reconstructs the URL that Twilio would have signed. When the request is
 * proxied (Vercel sets `x-forwarded-*`), `request.url` may report an
 * internal hostname; prefer the forwarded headers when present so the
 * signature comparison matches what Twilio actually computed.
 */
export function resolveSignedTwilioUrl(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const url = new URL(request.url);
  return `${proto}://${host}${url.pathname}${url.search}`;
}
