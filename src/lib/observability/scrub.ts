/**
 * Hooks for Sentry / Vercel Observability that strip PII before any event
 * leaves the process. The IntakeClean app handles passport scans and SSNs;
 * we cannot let raw URL paths, query strings, request bodies, or breadcrumb
 * messages flow to a third-party log aggregator without redaction.
 *
 * This module is structured so it works both with and without Sentry
 * installed: if `@sentry/nextjs` isn't initialised, the helpers no-op.
 */

import { redactPII } from "@/lib/security/redact";

const SECRET_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "stripe-signature",
  "x-twilio-signature",
  "x-vercel-signature",
  "x-vercel-internal-bot-check",
]);

const SECRET_QUERY_KEYS = new Set([
  "code", // OAuth code
  "token", // upload-link token
  "access_token",
  "refresh_token",
  "session",
]);

/**
 * Drop secret headers and redact obvious tokens out of the URL path /
 * query string. Used as Sentry's `beforeSend` hook.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T | null {
  // Headers
  if (event.request?.headers) {
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries(event.request.headers)) {
      if (SECRET_HEADERS.has(k.toLowerCase())) {
        h[k] = "[redacted]";
      } else if (typeof v === "string") {
        h[k] = redactPII(v).text;
      }
    }
    event.request.headers = h;
  }

  // URL: scrub the upload token from /upload/<token> and /api/upload/<token>,
  // and strip secret query string params entirely.
  if (event.request?.url) {
    event.request.url = redactUrl(event.request.url);
  }

  // Body: never ship the raw upload payload. We can't enumerate every
  // route's body shape so we just blanket-replace.
  if (event.request?.data !== undefined) {
    event.request.data = "[scrubbed]";
  }

  // Breadcrumbs (recent log lines, fetches, etc.)
  if (Array.isArray(event.breadcrumbs)) {
    for (const b of event.breadcrumbs) {
      if (typeof b.message === "string") {
        b.message = redactPII(b.message).text;
      }
      if (b.data && typeof b.data.url === "string") {
        b.data.url = redactUrl(b.data.url);
      }
    }
  }

  // Top-level message + exception strings.
  if (typeof event.message === "string") {
    event.message = redactPII(event.message).text;
  }
  return event;
}

function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    // Replace the upload token path segment with a placeholder so Sentry
    // groups events instead of fanning out per-token.
    u.pathname = u.pathname.replace(/\/upload\/[^/]+/, "/upload/[token]");
    u.pathname = u.pathname.replace(/\/api\/upload\/[^/]+/, "/api/upload/[token]");
    for (const key of Array.from(u.searchParams.keys())) {
      if (SECRET_QUERY_KEYS.has(key.toLowerCase())) {
        u.searchParams.set(key, "[redacted]");
      }
    }
    return u.toString();
  } catch {
    return "[invalid-url]";
  }
}

interface ScrubbableEvent {
  request?: {
    url?: string;
    headers?: Record<string, string>;
    data?: unknown;
  };
  breadcrumbs?: Array<{
    message?: string;
    data?: Record<string, unknown> & { url?: string };
  }>;
  message?: string;
}
