import { clientIp, limits, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

/**
 * Pen-test the in-memory fallback path of the rate limiter (Upstash REST
 * env vars are not set in the test environment, so `getLimiter()` returns
 * `null` and every call lands in `memoryFallback`). The fallback shares
 * the same contract as the production limiter — a unit test here is
 * sufficient to prove the route-level guards behave correctly.
 *
 * Threat model:
 *   - An attacker hammers `/api/upload/[token]` to brute-force tokens.
 *   - An attacker hammers `/api/twilio/inbound` to flood inboxes.
 *   - An attacker hammers `/api/files/.../signed-url` to generate hot
 *     URLs they can leak to a CDN.
 *
 * The limiter must:
 *   1. Allow exactly N requests per identifier per window, then deny.
 *   2. Bucket by identifier so one attacker doesn't deny service to a
 *      different real user.
 *   3. Reset after the window expires.
 *   4. Surface accurate `X-RateLimit-*` headers so honest clients can
 *      back off voluntarily.
 */
describe("security: rate limiter", () => {
  // Use a tiny custom bucket so the test runs deterministically and
  // doesn't pollute a shared "real" bucket key. The window is 1s so we
  // can prove the reset behaviour without sleeping for minutes.
  const SHORT_BUCKET = { name: "test-short", limit: 3, window: "1 s" } as const;
  const ISOLATED_BUCKET = { name: "test-isolated", limit: 2, window: "1 m" } as const;

  it("allows up to `limit` requests per identifier", async () => {
    const id = `attacker-${Math.random()}`;
    for (let i = 0; i < SHORT_BUCKET.limit; i += 1) {
      const r = await rateLimit(SHORT_BUCKET, id);
      expect(r.success).toBeTrue();
      expect(r.remaining).toBe(SHORT_BUCKET.limit - 1 - i);
    }
    const denied = await rateLimit(SHORT_BUCKET, id);
    expect(denied.success).toBeFalse();
    expect(denied.remaining).toBe(0);
  });

  it("denies further attempts until the window resets", async () => {
    const id = `attacker-${Math.random()}`;
    for (let i = 0; i < SHORT_BUCKET.limit; i += 1) {
      await rateLimit(SHORT_BUCKET, id);
    }
    expect((await rateLimit(SHORT_BUCKET, id)).success).toBeFalse();
    // Wait out the window; jasmine spec allows async/await.
    await new Promise((res) => setTimeout(res, 1100));
    const r = await rateLimit(SHORT_BUCKET, id);
    expect(r.success).toBeTrue();
  });

  it("isolates buckets per identifier (attacker can't deny service to a victim)", async () => {
    const attacker = `attacker-${Math.random()}`;
    const victim = `victim-${Math.random()}`;
    for (let i = 0; i < ISOLATED_BUCKET.limit; i += 1) {
      await rateLimit(ISOLATED_BUCKET, attacker);
    }
    expect((await rateLimit(ISOLATED_BUCKET, attacker)).success).toBeFalse();
    // Different identifier — must still pass.
    expect((await rateLimit(ISOLATED_BUCKET, victim)).success).toBeTrue();
  });

  it("isolates buckets per route name", async () => {
    const id = `same-${Math.random()}`;
    const a = { name: "test-route-a", limit: 1, window: "1 m" } as const;
    const b = { name: "test-route-b", limit: 1, window: "1 m" } as const;
    expect((await rateLimit(a, id)).success).toBeTrue();
    expect((await rateLimit(a, id)).success).toBeFalse();
    // Same identifier, different route — must pass independently.
    expect((await rateLimit(b, id)).success).toBeTrue();
    expect((await rateLimit(b, id)).success).toBeFalse();
  });

  it("returns sane rateLimitHeaders", () => {
    const h = rateLimitHeaders({ success: true, remaining: 5, reset: 1_700_000_000_000 }, 30);
    expect(h["X-RateLimit-Limit"]).toBe("30");
    expect(h["X-RateLimit-Remaining"]).toBe("5");
    expect(Number(h["X-RateLimit-Reset"])).toBe(1_700_000_000);
  });

  it("clamps negative remaining to zero", () => {
    const h = rateLimitHeaders({ success: false, remaining: -3, reset: 1_700_000_000_000 }, 10);
    expect(h["X-RateLimit-Remaining"]).toBe("0");
  });

  describe("clientIp helper", () => {
    function req(headers: Record<string, string>): Request {
      return new Request("https://example.com/", { headers });
    }
    it("uses x-forwarded-for first hop", () => {
      expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    });
    it("falls back to x-real-ip", () => {
      expect(clientIp(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    });
    it("returns 'anonymous' when no client headers are present", () => {
      expect(clientIp(req({}))).toBe("anonymous");
    });
  });

  describe("production-bucket limits sanity check", () => {
    /**
     * Burn-in: the values configured in `limits` must be SMALL ENOUGH that
     * a real attacker can't sustain damaging traffic past them. We assert
     * a few invariants rather than brittle exact numbers.
     */
    it("publicUpload bucket is tighter than 100/window", () => {
      expect(limits.publicUpload.limit).toBeLessThanOrEqual(100);
    });
    it("publicUploadBurst bucket caps short bursts", () => {
      expect(limits.publicUploadBurst.limit).toBeLessThanOrEqual(10);
    });
    it("authForm bucket is tight enough to prevent credential stuffing", () => {
      expect(limits.authForm.limit).toBeLessThanOrEqual(15);
    });
    it("onboarding bucket is tight enough to prevent org-spam", () => {
      expect(limits.onboarding.limit).toBeLessThanOrEqual(10);
    });
  });
});
