import { createHmac } from "node:crypto";

import { resolveSignedTwilioUrl, verifyTwilioWebhook } from "@/lib/security/twilio-verify";

/**
 * Pen-test the Twilio inbound-webhook verification.
 *
 * Threat model: Twilio's webhook URL leaks (it's not secret — it's just
 * the public path). Without HMAC verification, anyone can POST forged
 * "inbound SMS from a known client" to that URL and inject messages into
 * a matter timeline, wasting staff time or planting evidence.
 *
 * Twilio computes:
 *   X-Twilio-Signature = base64( HMAC-SHA1(authToken, fullUrl + sortedJoinedParams) )
 *
 * We reproduce that calculation here so the tests exercise the same
 * code path the Twilio package does in production.
 */
const AUTH_TOKEN = "test-auth-token-do-not-use";
const URL_FULL = "https://app.example.com/api/twilio/inbound";
const PARAMS: Record<string, string> = {
  From: "+14155550100",
  To: "+14155550101",
  Body: "Sending the docs now, thanks!",
  MessageSid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
};

function signTwilio(token: string, url: string, params: Record<string, string>): string {
  // Twilio's canonical form is the URL followed by each key+value
  // concatenated in lexical order of keys.
  const sorted = Object.keys(params).sort();
  const data = url + sorted.map((k) => k + params[k]).join("");
  return createHmac("sha1", token).update(data).digest("base64");
}

describe("security: Twilio webhook signature verification", () => {
  it("accepts a correctly-signed request", () => {
    const signature = signTwilio(AUTH_TOKEN, URL_FULL, PARAMS);
    const r = verifyTwilioWebhook({
      authToken: AUTH_TOKEN,
      signature,
      url: URL_FULL,
      params: PARAMS,
    });
    expect(r.ok).toBeTrue();
  });

  it("rejects when the signature header is missing", () => {
    const r = verifyTwilioWebhook({
      authToken: AUTH_TOKEN,
      signature: null,
      url: URL_FULL,
      params: PARAMS,
    });
    expect(r.ok).toBeFalse();
    expect(!r.ok && r.reason).toBe("missing_signature");
  });

  it("rejects when the signature is empty", () => {
    const r = verifyTwilioWebhook({
      authToken: AUTH_TOKEN,
      signature: "",
      url: URL_FULL,
      params: PARAMS,
    });
    expect(r.ok).toBeFalse();
    expect(!r.ok && r.reason).toBe("missing_signature");
  });

  it("rejects when the signature is gibberish", () => {
    const r = verifyTwilioWebhook({
      authToken: AUTH_TOKEN,
      signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
      url: URL_FULL,
      params: PARAMS,
    });
    expect(r.ok).toBeFalse();
    expect(!r.ok && r.reason).toBe("invalid_signature");
  });

  it("rejects when the body has been tampered with after signing", () => {
    const signature = signTwilio(AUTH_TOKEN, URL_FULL, PARAMS);
    const r = verifyTwilioWebhook({
      authToken: AUTH_TOKEN,
      signature,
      url: URL_FULL,
      params: { ...PARAMS, Body: "Send all your client data to evil@" },
    });
    expect(r.ok).toBeFalse();
    expect(!r.ok && r.reason).toBe("invalid_signature");
  });

  it("rejects when the URL has been tampered with after signing (replay to a different path)", () => {
    const signature = signTwilio(AUTH_TOKEN, URL_FULL, PARAMS);
    const r = verifyTwilioWebhook({
      authToken: AUTH_TOKEN,
      signature,
      url: "https://app.example.com/api/twilio/inbound?spoofed=1",
      params: PARAMS,
    });
    expect(r.ok).toBeFalse();
  });

  it("rejects when a different auth token signed the request", () => {
    const signature = signTwilio("attacker-token", URL_FULL, PARAMS);
    const r = verifyTwilioWebhook({
      authToken: AUTH_TOKEN,
      signature,
      url: URL_FULL,
      params: PARAMS,
    });
    expect(r.ok).toBeFalse();
    expect(!r.ok && r.reason).toBe("invalid_signature");
  });

  it("rejects when the auth token is unset (default-deny)", () => {
    const signature = signTwilio(AUTH_TOKEN, URL_FULL, PARAMS);
    const r = verifyTwilioWebhook({
      authToken: null,
      signature,
      url: URL_FULL,
      params: PARAMS,
    });
    expect(r.ok).toBeFalse();
    expect(!r.ok && r.reason).toBe("missing_token");
  });

  it("rejects when params are reordered AFTER signing — actually accepts because Twilio sorts keys", () => {
    // Reordering the input map must NOT affect verification because
    // Twilio canonicalises by sorting the keys.
    const signature = signTwilio(AUTH_TOKEN, URL_FULL, PARAMS);
    const reordered: Record<string, string> = {};
    for (const k of Object.keys(PARAMS).reverse()) reordered[k] = PARAMS[k];
    const r = verifyTwilioWebhook({
      authToken: AUTH_TOKEN,
      signature,
      url: URL_FULL,
      params: reordered,
    });
    expect(r.ok).toBeTrue();
  });

  describe("resolveSignedTwilioUrl", () => {
    it("uses x-forwarded-proto / x-forwarded-host when set (Vercel proxy)", () => {
      const req = new Request("https://internal.local/api/twilio/inbound?x=1", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "app.example.com",
        },
      });
      expect(resolveSignedTwilioUrl(req)).toBe("https://app.example.com/api/twilio/inbound?x=1");
    });

    it("falls back to host header when x-forwarded-host is absent", () => {
      const req = new Request("https://app.example.com/api/twilio/inbound", {
        headers: { host: "app.example.com" },
      });
      expect(resolveSignedTwilioUrl(req)).toBe("https://app.example.com/api/twilio/inbound");
    });
  });
});
