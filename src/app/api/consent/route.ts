import { NextResponse, type NextRequest } from "next/server";

import {
  buildRecord,
  serializeSetCookie,
} from "@/lib/consent/cookie";
import { regionFromHeaders } from "@/lib/consent/region";
import type { ConsentSource } from "@/lib/consent/types";
import { enforceRateLimit } from "@/lib/security/guards";
import { clientIp, limits } from "@/lib/security/rate-limit";
import { safeNextPath } from "@/lib/security/safe-redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * No-JS fallback that records a consent decision posted as
 * `application/x-www-form-urlencoded` from the cookie-preferences page.
 * The JS path writes the cookie via `document.cookie` directly and never
 * hits this route.
 *
 * Form fields:
 *   - `intent`: "accept_all" | "essential_only" | "save"
 *   - `functional`: "on" when checked (HTML form checkbox convention)
 *   - `analytics`: "on" when checked
 *   - `next`: optional same-origin redirect target after the cookie is set
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(limits.authForm, `consent:${clientIp(request)}`);
  if (limited) return limited;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  const intent = String(form.get("intent") ?? "save");
  const functional = form.get("functional") === "on";
  const analytics = form.get("analytics") === "on";
  const nextRaw = form.get("next");

  const region = regionFromHeaders(request.headers);

  const decision =
    intent === "accept_all"
      ? { categories: { necessary: true as const, functional: true, analytics: true }, source: "banner_accept_all" as ConsentSource }
      : intent === "essential_only"
        ? { categories: { necessary: true as const, functional: false, analytics: false }, source: "banner_essential_only" as ConsentSource }
        : { categories: { necessary: true as const, functional, analytics }, source: "modal_save" as ConsentSource };

  const record = buildRecord({
    region,
    gpc: request.headers.get("sec-gpc") === "1",
    source: decision.source,
    categories: decision.categories,
  });

  // Delegate to the shared `safeNextPath` validator instead of re-rolling
  // the rules here. The previous local implementation accepted strings
  // starting with `/` and rejected only `//` — but `/\evil` (parsed by
  // some URL libs as `//evil`) and `javascript:` payloads round-tripped
  // through, opening the cookie-preferences POST as a soft open-redirect.
  const candidate = typeof nextRaw === "string" ? nextRaw : null;
  const redirectTarget = safeNextPath(candidate) ?? "/legal/cookie-preferences?saved=1";

  const response = NextResponse.redirect(new URL(redirectTarget, request.url), {
    status: 303,
  });
  response.headers.append("Set-Cookie", serializeSetCookie(record));
  return response;
}
