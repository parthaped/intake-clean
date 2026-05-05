import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

/**
 * Edge-friendly rate limiter.
 *
 * - In production we expect `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
 *   to be set (or the equivalent Vercel-Marketplace `KV_*` aliases). When
 *   they're present the limiter is backed by Upstash Redis and shared across
 *   all serverless instances.
 * - In dev / when those vars are missing we fall back to an in-memory map.
 *   That fallback is *intentionally not safe for production* — multiple
 *   serverless instances will each keep their own counter — but it keeps
 *   the local dev loop fast and dependency-free.
 */

interface RateLimitConfig {
  /** Stable name for this bucket; appears in the Upstash analytics tab. */
  name: string;
  /** Number of requests allowed in `window` per identifier. */
  limit: number;
  /** Window duration in the format Upstash accepts, e.g. "10 s", "1 m". */
  window: `${number} ${"s" | "m" | "h" | "d"}`;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? null;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? null;

let cachedRedis: Redis | null = null;

function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  cachedRedis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
  return cachedRedis;
}

const limiterCache = new Map<string, Ratelimit>();
const memoryStore = new Map<string, { resetAt: number; count: number }>();

/**
 * Hard ceiling on the number of in-memory buckets we keep around. The
 * memory fallback is dev-only, but a long-running `next dev` session can
 * easily pin every IP that's hit a rate-limited endpoint into the map and
 * never release the entries (entries with `resetAt <= now` were previously
 * only cleared opportunistically when the same key was hit again). This
 * leaks RAM until the process restarts.
 */
const MEMORY_STORE_MAX = 5000;

function getLimiter(config: RateLimitConfig): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const cacheKey = `${config.name}:${config.limit}:${config.window}`;
  const existing = limiterCache.get(cacheKey);
  if (existing) return existing;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    analytics: true,
    prefix: `intake:${config.name}`,
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

function windowToMs(window: RateLimitConfig["window"]): number {
  const [n, unit] = window.split(" ") as [string, "s" | "m" | "h" | "d"];
  const value = Number(n);
  const factor = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return value * factor;
}

function evictExpiredMemoryEntries(now: number): void {
  // Opportunistic eviction: walk the map once when we're about to create a
  // new bucket and the map is at capacity. We deliberately don't iterate
  // every call (would O(n) the limiter on every request); only when adding
  // would push us past MEMORY_STORE_MAX.
  for (const [k, v] of memoryStore) {
    if (v.resetAt <= now) memoryStore.delete(k);
  }
  // If still over capacity, drop the oldest entries (insertion order in a
  // Map). This is a dev-only fallback so being approximate is fine.
  if (memoryStore.size >= MEMORY_STORE_MAX) {
    const overflow = memoryStore.size - MEMORY_STORE_MAX + 1;
    let drained = 0;
    for (const k of memoryStore.keys()) {
      if (drained >= overflow) break;
      memoryStore.delete(k);
      drained += 1;
    }
  }
}

function memoryFallback(config: RateLimitConfig, key: string): RateLimitResult {
  const now = Date.now();
  const bucket = `${config.name}:${key}`;
  const existing = memoryStore.get(bucket);
  const windowMs = windowToMs(config.window);
  if (!existing || existing.resetAt <= now) {
    if (memoryStore.size >= MEMORY_STORE_MAX) evictExpiredMemoryEntries(now);
    memoryStore.set(bucket, { resetAt: now + windowMs, count: 1 });
    return { success: true, remaining: config.limit - 1, reset: now + windowMs };
  }
  existing.count += 1;
  if (existing.count > config.limit) {
    return { success: false, remaining: 0, reset: existing.resetAt };
  }
  return { success: true, remaining: config.limit - existing.count, reset: existing.resetAt };
}

export async function rateLimit(
  config: RateLimitConfig,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(config);
  if (!limiter) return memoryFallback(config, identifier);
  const result = await limiter.limit(identifier);
  return { success: result.success, remaining: result.remaining, reset: result.reset };
}

/**
 * Best-effort client identifier for unauthenticated routes. Prefer the
 * Vercel-injected `x-real-ip` / `x-forwarded-for`; fall back to a fixed
 * string so we still bucket per-route in dev without spreading risk.
 */
export function clientIp(request: NextRequest | Request): string {
  const headers = request instanceof Request ? request.headers : (request as NextRequest).headers;
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "anonymous";
}

/**
 * Standard headers to attach to a 200 OK response so clients can self-throttle.
 */
export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(Math.floor(result.reset / 1000)),
  };
}

/** Pre-defined buckets used across the app. Keep them centralised so they
 * appear in a single place in the Upstash analytics tab. */
export const limits = {
  publicUpload: { name: "public-upload", limit: 30, window: "10 m" },
  publicUploadBurst: { name: "public-upload-burst", limit: 5, window: "10 s" },
  twilioInbound: { name: "twilio-inbound", limit: 60, window: "1 m" },
  onboarding: { name: "onboarding", limit: 5, window: "10 m" },
  fileAction: { name: "file-action", limit: 60, window: "1 m" },
  hfRewrite: { name: "hf-rewrite", limit: 10, window: "1 m" },
  signedUrl: { name: "signed-url", limit: 120, window: "1 m" },
  authForm: { name: "auth-form", limit: 10, window: "5 m" },
} as const satisfies Record<string, RateLimitConfig>;
