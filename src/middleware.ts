import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// `@supabase/ssr` writes the session as `sb-<ref>-auth-token` and, when the
// payload exceeds the per-cookie size limit, splits it across chunks named
// `sb-<ref>-auth-token.0`, `sb-<ref>-auth-token.1`, ... We accept either form
// here. The `-code-verifier` cookie used during the OAuth/PKCE exchange must
// NOT be treated as a session indicator.
const SUPABASE_AUTH_COOKIE = /^sb-[^.]+-auth-token(\.\d+)?$/;

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isProtected = pathname.startsWith("/dashboard") || pathname.startsWith("/admin");

  if (!isProtected) return response;

  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => SUPABASE_AUTH_COOKIE.test(c.name));

  if (!hasAuthCookie) {
    const signInUrl = new URL("/login", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
