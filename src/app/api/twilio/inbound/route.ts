import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { limits, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { resolveSignedTwilioUrl, verifyTwilioWebhook } from "@/lib/security/twilio-verify";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Twilio inbound webhook. Twilio posts URL-encoded form data with `From`,
 * `Body`, `MessageSid`, etc. We try to match the sender to a known client
 * phone number and append the inbound SMS to that thread.
 *
 * Security:
 *   - When `TWILIO_AUTH_TOKEN` is configured, every request must carry a
 *     valid `X-Twilio-Signature` header signed with that token. Without this
 *     check, anyone could POST to this endpoint and inject fake "from a
 *     client" messages tied to any phone number.
 *   - We read the body as raw text first so the signature can be computed
 *     against the exact bytes Twilio sent.
 *   - In dev (no `TWILIO_AUTH_TOKEN`), the check is skipped so the endpoint
 *     can still be exercised by local tooling. Production deployments MUST
 *     set the token.
 */
export async function POST(request: Request) {
  // We have to read the body BEFORE the rate-limit check because the limiter
  // buckets on the `From` number (so Twilio's shared-IP fan-out doesn't
  // cause one chatty client to 429 everyone else's messages). The signature
  // check still happens before any DB write.
  const rawBody = await request.text();
  const params = parseFormUrlEncoded(rawBody);

  if (env.twilioAuthToken) {
    const verification = verifyTwilioWebhook({
      authToken: env.twilioAuthToken,
      signature: request.headers.get("x-twilio-signature"),
      url: resolveSignedTwilioUrl(request),
      params,
    });
    if (!verification.ok) {
      const body =
        verification.reason === "missing_signature"
          ? "Missing Twilio signature"
          : "Invalid Twilio signature";
      return new NextResponse(body, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Production must have a token. Reject loudly rather than silently
    // accepting unauthenticated webhooks.
    return new NextResponse("Twilio webhook not configured", { status: 503 });
  }

  const from = (params["From"] ?? "").trim();
  const body = (params["Body"] ?? "").trim();
  const messageSid = (params["MessageSid"] ?? "").trim() || null;

  // Bucket the rate limit by `From` rather than the connecting IP. Twilio
  // hits this endpoint from a small NAT pool shared across all customers,
  // so an IP-based bucket would let one noisy phone number 429 a different
  // firm's clients. The signature check above already proves the request
  // came from Twilio, so trusting `From` for bucketing is safe.
  const limitKey = from || messageSid || "anonymous";
  const limit = await rateLimit(limits.twilioInbound, limitKey);
  if (!limit.success) {
    return new NextResponse("Rate limit exceeded", {
      status: 429,
      headers: {
        ...rateLimitHeaders(limit, limits.twilioInbound.limit),
        "Retry-After": String(Math.max(1, Math.floor((limit.reset - Date.now()) / 1000))),
      },
    });
  }

  if (!from || !body) {
    return new NextResponse("Missing From/Body", { status: 400 });
  }

  const service = getServiceSupabase();
  const { data: client } = await service
    .from("clients")
    .select("id, organization_id")
    .eq("phone", from)
    .maybeSingle();

  if (!client) {
    return new NextResponse("OK", { status: 200 });
  }

  const { data: matter } = await service
    .from("matters")
    .select("id")
    .eq("client_id", client.id)
    .eq("organization_id", client.organization_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!matter) {
    return new NextResponse("OK", { status: 200 });
  }

  // Twilio retries inbound webhooks on any non-2xx; without dedupe each
  // retry would land another row on the matter timeline. The partial
  // unique index from migration 0010 enforces uniqueness at the DB level
  // for (channel='sms', direction='inbound', provider_message_id).
  // We swallow 23505 silently and 200 OK so Twilio stops retrying.
  const insert = await service.from("client_messages").insert({
    organization_id: client.organization_id,
    matter_id: matter.id,
    client_id: client.id,
    channel: "sms",
    direction: "inbound",
    subject: null,
    body,
    status: "received",
    provider_message_id: messageSid,
  });
  if (insert.error && insert.error.code !== "23505") {
    console.error("[twilio-inbound] could not record message", {
      message: insert.error.message,
      sid: messageSid,
    });
    // Return 500 so Twilio retries — better duplicate-attempt-than-data-loss.
    return new NextResponse("Could not record message", { status: 500 });
  }

  return new NextResponse("OK", { status: 200 });
}

function parseFormUrlEncoded(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const usp = new URLSearchParams(raw);
  for (const [k, v] of usp.entries()) {
    out[k] = v;
  }
  return out;
}
