import "server-only";

import { NextResponse } from "next/server";

import { limits, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

/**
 * Convenience wrapper around `rateLimit` for authenticated routes. Returns
 * `null` when the request is allowed (caller proceeds) or a `NextResponse`
 * with status 429 when it should be rejected.
 */
export async function enforceRateLimit(
  bucket: (typeof limits)[keyof typeof limits],
  identifier: string,
  message = "Rate limit exceeded",
): Promise<NextResponse | null> {
  const result = await rateLimit(bucket, identifier);
  if (result.success) return null;
  return new NextResponse(message, {
    status: 429,
    headers: {
      ...rateLimitHeaders(result, bucket.limit),
      "Retry-After": String(Math.max(1, Math.floor((result.reset - Date.now()) / 1000))),
    },
  });
}
