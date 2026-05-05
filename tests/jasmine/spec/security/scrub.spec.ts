import { scrubEvent } from "@/lib/observability/scrub";

/**
 * Pen-test the Sentry / Vercel-Observability scrubber. We process passport
 * scans, SSNs, and signed upload tokens; if any of those ever hit Sentry
 * (or another external log aggregator) we have a privacy and arguably a
 * regulatory incident. The scrubber is a `beforeSend`-style hook that
 * MUST mutate the event in-place to remove or replace these values BEFORE
 * the SDK ships the payload.
 *
 * Threat model: an exception fires inside a route that processes
 * `Authorization: Bearer xyz`, a query string with `?code=...`, or a
 * breadcrumb URL containing the upload token. The scrubber must:
 *   1. Replace secret HEADERS with `[redacted]`.
 *   2. Replace the upload-token PATH SEGMENT with `[token]`.
 *   3. Replace secret QUERY PARAMS (`code`, `token`, ...) with `[redacted]`.
 *   4. Strip the request body wholesale.
 *   5. Run the standard PII redactor over `message` and breadcrumb messages.
 */
describe("security: scrubEvent", () => {
  it("redacts secret headers", () => {
    const event = scrubEvent({
      request: {
        headers: {
          Authorization: "Bearer 1234567890abcdef",
          Cookie: "sb:token=hunter2; intake-session=abcdef",
          "Stripe-Signature": "t=123,v1=abc",
          "X-Twilio-Signature": "abc",
          "User-Agent": "Mozilla/5.0",
        },
      },
    })!;
    expect(event.request!.headers!.Authorization).toBe("[redacted]");
    expect(event.request!.headers!.Cookie).toBe("[redacted]");
    expect(event.request!.headers!["Stripe-Signature"]).toBe("[redacted]");
    expect(event.request!.headers!["X-Twilio-Signature"]).toBe("[redacted]");
    // Non-secret headers are preserved (after PII pass).
    expect(event.request!.headers!["User-Agent"]).toBe("Mozilla/5.0");
  });

  it("redacts upload tokens from /upload/<token> path segments", () => {
    const event = scrubEvent({
      request: {
        url: "https://app.example.com/upload/Z3MTM5MzAtNTAyZS00ZTY",
      },
    })!;
    expect(event.request!.url).toContain("/upload/[token]");
    expect(event.request!.url).not.toContain("Z3MTM5MzAtNTAyZS00ZTY");
  });

  it("redacts upload tokens from /api/upload/<token> path segments", () => {
    const event = scrubEvent({
      request: {
        url: "https://app.example.com/api/upload/abc123def456?ts=1",
      },
    })!;
    expect(event.request!.url).toContain("/api/upload/[token]");
    expect(event.request!.url).not.toContain("abc123def456");
    // Non-secret query params survive.
    expect(event.request!.url).toContain("ts=1");
  });

  it("redacts secret query parameters", () => {
    const event = scrubEvent({
      request: {
        url: "https://app.example.com/auth/callback?code=very-secret&token=also-secret&next=/dashboard",
      },
    })!;
    expect(event.request!.url).toContain("code=%5Bredacted%5D");
    expect(event.request!.url).toContain("token=%5Bredacted%5D");
    expect(event.request!.url).toContain("next=%2Fdashboard");
    expect(event.request!.url).not.toContain("very-secret");
    expect(event.request!.url).not.toContain("also-secret");
  });

  it("blanket-replaces request bodies", () => {
    const event = scrubEvent({
      request: { data: { ssn: "123-45-6789", file: "binary..." } as unknown },
    })!;
    expect(event.request!.data as unknown).toBe("[scrubbed]");
  });

  it("runs PII redaction over event.message", () => {
    const event = scrubEvent({
      message: "Failed to process SSN 123-45-6789 for jane@example.com",
    })!;
    expect(event.message).not.toContain("123-45-6789");
    expect(event.message).not.toContain("jane@example.com");
  });

  it("runs PII redaction over breadcrumb messages and URLs", () => {
    const event = scrubEvent({
      breadcrumbs: [
        { message: "fetch /upload/abc123 with phone (415) 555-0123" },
        { data: { url: "https://app.example.com/upload/secret-token-1234?code=abc" } },
      ],
    })!;
    expect(event.breadcrumbs![0].message).not.toContain("415) 555-0123");
    expect(event.breadcrumbs![1].data!.url).toContain("/upload/[token]");
    expect(event.breadcrumbs![1].data!.url).not.toContain("secret-token-1234");
    expect(event.breadcrumbs![1].data!.url).toContain("code=%5Bredacted%5D");
  });

  it("returns the event (never null) so Sentry still records the trace", () => {
    expect(scrubEvent({ message: "ok" })).not.toBeNull();
  });

  it("does not throw on malformed URLs", () => {
    const event = scrubEvent({ request: { url: "not-a-url" } })!;
    expect(event.request!.url).toBe("[invalid-url]");
  });

  it("is case-insensitive on header allow-list", () => {
    const event = scrubEvent({
      request: {
        headers: {
          AUTHORIZATION: "Bearer x",
          cookie: "sb:token=x",
          "x-API-Key": "x",
        },
      },
    })!;
    expect(event.request!.headers!.AUTHORIZATION).toBe("[redacted]");
    expect(event.request!.headers!.cookie).toBe("[redacted]");
    expect(event.request!.headers!["x-API-Key"]).toBe("[redacted]");
  });
});
