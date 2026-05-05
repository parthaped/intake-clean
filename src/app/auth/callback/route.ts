import { NextResponse, type NextRequest } from "next/server";

import { clientIp, limits, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Handles the redirect that Supabase sends users to after they click an email
 * link (confirmation, magic link, password recovery, OAuth). The link arrives
 * with a `?code=...` query parameter; we trade that code for a session, which
 * sets the auth cookies on the response.
 *
 * The optional `next` query parameter lets callers control where the user
 * lands after the exchange (defaults to /dashboard).
 *
 * Recovery links additionally carry `type=recovery`, in which case we send
 * the user to the in-app "change password" surface so they can finish the
 * reset.
 */
export async function GET(request: NextRequest) {
  // Rate-limit code exchanges per IP. Supabase enforces its own auth-side
  // limits, but capping here too prevents an attacker from grinding through
  // forged `code` values to time-attack the exchange endpoint.
  const limit = await rateLimit(limits.authForm, clientIp(request));
  if (!limit.success) {
    return new NextResponse("Too many auth attempts", {
      status: 429,
      headers: rateLimitHeaders(limit, limits.authForm.limit),
    });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const errorDescription = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const requestedNext = url.searchParams.get("next");

  // Only honour same-origin in-app paths so an attacker can't redirect the
  // user to a phishing page by tampering with the email link. `safeNextPath`
  // also blocks protocol-relative (`//evil`) and `javascript:` payloads
  // that the previous `startsWith("/")` check would have let through.
  const safeNext = safeNextPath(requestedNext);
  const fallback = type === "recovery" ? "/dashboard/settings" : "/dashboard";
  const next = safeNext ?? fallback;

  if (errorDescription) {
    const failure = new URL("/login", url.origin);
    failure.searchParams.set("error", errorDescription);
    return NextResponse.redirect(failure);
  }

  if (!code) {
    const failure = new URL("/login", url.origin);
    failure.searchParams.set("error", "Missing confirmation code");
    return NextResponse.redirect(failure);
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const failure = new URL("/login", url.origin);
    failure.searchParams.set("error", error.message);
    return NextResponse.redirect(failure);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
