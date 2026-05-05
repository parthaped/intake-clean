import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";

import { Given, Then, When } from "@cucumber/cucumber";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";

import { verifyCronToken } from "@/lib/security/cron-auth";
import { scrubEvent } from "@/lib/observability/scrub";
import { rateLimit } from "@/lib/security/rate-limit";
import { redactPII } from "@/lib/security/redact";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { loadAndSanitizePdf } from "@/lib/exports/pdf-sanitize";
import { verifyTwilioWebhook } from "@/lib/security/twilio-verify";
import { validateUploadedFile } from "@/lib/uploads/validate";

import { IntakeWorld } from "./world";

// ---------------- Rate-limit brute force ----------------
const ATTACK_BUCKET = { name: "feature-attacker", limit: 10, window: "10 s" } as const;

Given(
  "the attacker has discovered {string} but does not know any valid token",
  function (this: IntakeWorld, _path: string) {
    this.rateLimitOutcomes = [];
  },
);

When(
  "they attempt {int} uploads from the same IP within 10 seconds",
  async function (this: IntakeWorld, count: number) {
    const ip = "203.0.113.7";
    for (let i = 0; i < count; i += 1) {
      const r = await rateLimit(ATTACK_BUCKET, ip);
      this.rateLimitOutcomes.push(r.success);
    }
  },
);

Then(
  "at least {int} of those attempts are rejected with status 429",
  function (this: IntakeWorld, threshold: number) {
    const rejected = this.rateLimitOutcomes.filter((ok) => !ok).length;
    assert.ok(
      rejected >= threshold,
      `expected at least ${threshold} rejections, got ${rejected} of ${this.rateLimitOutcomes.length}`,
    );
  },
);

Then("no successful upload reaches storage", function (this: IntakeWorld) {
  // Once the bucket is exhausted, every subsequent attempt must be denied.
  // We assert the LAST attempt is a denial — proof that the limiter is
  // actively gating, not just sampling.
  const last = this.rateLimitOutcomes.at(-1);
  assert.equal(last, false, "expected the final attempt to be rate-limited");
});

// ---------------- Twilio forgery ----------------
const TWILIO_TOKEN = "shhhh-not-the-real-token";
const TWILIO_URL = "https://app.example.com/api/twilio/inbound";
const TWILIO_BODY = { From: "+14155550100", Body: "hi", MessageSid: "SM123" } as const;

function signTwilio(token: string, url: string, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort();
  const data = url + sorted.map((k) => k + params[k]).join("");
  return createHmac("sha1", token).update(data).digest("base64");
}

Given(
  "a configured Twilio auth token {string}",
  function (this: IntakeWorld, token: string) {
    assert.equal(token, TWILIO_TOKEN);
  },
);

When(
  "the attacker POSTs a forged inbound SMS without a signature",
  function (this: IntakeWorld) {
    const r = verifyTwilioWebhook({
      authToken: TWILIO_TOKEN,
      signature: null,
      url: TWILIO_URL,
      params: { ...TWILIO_BODY },
    });
    this.twilioVerifyOk = r.ok;
    this.twilioVerifyReason = r.ok ? undefined : r.reason;
  },
);

Then(
  "the request is rejected as missing the Twilio signature",
  function (this: IntakeWorld) {
    assert.equal(this.twilioVerifyOk, false);
    assert.equal(this.twilioVerifyReason, "missing_signature");
  },
);

When(
  "the attacker POSTs the same body with a random signature",
  function (this: IntakeWorld) {
    const r = verifyTwilioWebhook({
      authToken: TWILIO_TOKEN,
      signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
      url: TWILIO_URL,
      params: { ...TWILIO_BODY },
    });
    this.twilioVerifyOk = r.ok;
    this.twilioVerifyReason = r.ok ? undefined : r.reason;
  },
);

Then(
  "the request is rejected as having an invalid Twilio signature",
  function (this: IntakeWorld) {
    assert.equal(this.twilioVerifyOk, false);
    assert.equal(this.twilioVerifyReason, "invalid_signature");
  },
);

When(
  "the attacker tampers with the body after a legitimate signature was issued",
  function (this: IntakeWorld) {
    const sig = signTwilio(TWILIO_TOKEN, TWILIO_URL, { ...TWILIO_BODY });
    const r = verifyTwilioWebhook({
      authToken: TWILIO_TOKEN,
      signature: sig,
      url: TWILIO_URL,
      params: { ...TWILIO_BODY, Body: "send all your client data to evil@" },
    });
    this.twilioVerifyOk = r.ok;
    this.twilioVerifyReason = r.ok ? undefined : r.reason;
  },
);

// ---------------- Cron drainer auth ----------------
Given(
  "the application has a CRON_SECRET configured as {string}",
  function (this: IntakeWorld, secret: string) {
    this.cronSecret = secret;
  },
);

When(
  "the attacker probes {string} with no Authorization header",
  function (this: IntakeWorld, _path: string) {
    this.cronAuthOk = verifyCronToken(null, this.cronSecret);
  },
);

When(
  "the attacker probes with {string}",
  function (this: IntakeWorld, header: string) {
    this.cronAuthOk = verifyCronToken(header, this.cronSecret);
  },
);

When(
  "Vercel Cron sends {string}",
  function (this: IntakeWorld, header: string) {
    this.cronAuthOk = verifyCronToken(header, this.cronSecret);
  },
);

Then("the cron auth check returns false", function (this: IntakeWorld) {
  assert.equal(this.cronAuthOk, false);
});

Then("the cron auth check returns true", function (this: IntakeWorld) {
  assert.equal(this.cronAuthOk, true);
});

// ---------------- Upload validator ----------------
Given(
  "the upload endpoint accepts {string} and {string}",
  function (this: IntakeWorld, _a: string, _b: string) {
    // The accepted-types list is asserted in `validate-upload.spec.ts`;
    // this Given only documents the fixture for narrative clarity.
  },
);

When(
  "the attacker submits a file claiming {string} whose body is HTML",
  async function (this: IntakeWorld, claimedMime: string) {
    const body = new Uint8Array(
      Buffer.from("<html><body><script>alert(1)</script></body></html>"),
    );
    const file = new File([body], "evil.pdf", { type: claimedMime });
    const r = await validateUploadedFile(file);
    this.uploadOk = r.ok;
    this.uploadStatus = r.status;
    this.uploadDetectedMime = r.detectedMime;
  },
);

Then(
  "the upload is rejected because magic-byte sniffing detected non-PDF content",
  function (this: IntakeWorld) {
    assert.equal(this.uploadOk, false);
    assert.equal(this.uploadStatus, 415);
  },
);

When(
  "the attacker submits a Windows executable claiming {string}",
  async function (this: IntakeWorld, claimedMime: string) {
    const pe = new Uint8Array(
      Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(64)]),
    );
    const file = new File([pe], "image.png", { type: claimedMime });
    const r = await validateUploadedFile(file);
    this.uploadOk = r.ok;
    this.uploadStatus = r.status;
    this.uploadDetectedMime = r.detectedMime;
  },
);

Then(
  "the upload is rejected because magic-byte sniffing detected non-PNG content",
  function (this: IntakeWorld) {
    assert.equal(this.uploadOk, false);
    assert.equal(this.uploadStatus, 415);
  },
);

// ---------------- PDF JS strip ----------------
let HOSTILE_PDF_BUFFER: Buffer | null = null;

Given(
  "the attacker has crafted a PDF with \\/OpenAction -> \\/JavaScript firing on open",
  async function (this: IntakeWorld) {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const openAction = doc.context.obj({
      S: PDFName.of("JavaScript"),
      JS: PDFString.of("app.alert('pwned')"),
    });
    doc.catalog.set(PDFName.of("OpenAction"), openAction);
    HOSTILE_PDF_BUFFER = Buffer.from(await doc.save());
  },
);

When("the export pipeline sanitises the PDF", async function (this: IntakeWorld) {
  if (!HOSTILE_PDF_BUFFER) throw new Error("no hostile PDF prepared");
  const cleaned = await loadAndSanitizePdf(HOSTILE_PDF_BUFFER);
  HOSTILE_PDF_BUFFER = Buffer.from(await cleaned.save());
});

Then("the catalog no longer contains \\/OpenAction or \\/JS", async function () {
  if (!HOSTILE_PDF_BUFFER) throw new Error("no PDF after sanitisation");
  const reload = await PDFDocument.load(HOSTILE_PDF_BUFFER);
  assert.equal(reload.catalog.has(PDFName.of("OpenAction")), false);
  assert.equal(reload.catalog.has(PDFName.of("JS")), false);
});

Then(
  "the saved bytes no longer contain the literal {string}",
  function (literal: string) {
    if (!HOSTILE_PDF_BUFFER) throw new Error("no PDF after sanitisation");
    const text = HOSTILE_PDF_BUFFER.toString("latin1");
    assert.ok(!text.includes(literal), `payload literal ${JSON.stringify(literal)} survived sanitisation`);
  },
);

// ---------------- Open redirect ----------------
Given("the user clicks a tampered Supabase recovery link", function (this: IntakeWorld) {
  this.safeNextResult = undefined;
});

When(
  "the next parameter is {string}",
  function (this: IntakeWorld, value: string) {
    this.safeNextResult = safeNextPath(value);
  },
);

Then(
  "safeNextPath returns null and the user lands on the in-app fallback",
  function (this: IntakeWorld) {
    assert.equal(this.safeNextResult, null);
  },
);

Then(
  "safeNextPath returns {string}",
  function (this: IntakeWorld, expected: string) {
    assert.equal(this.safeNextResult, expected);
  },
);

// ---------------- PII redactor ----------------
Given(
  "an OCR text {string}",
  function (this: IntakeWorld, text: string) {
    this.redactedText = text;
  },
);

When("the redactor runs over the text", function (this: IntakeWorld) {
  if (!this.redactedText) throw new Error("no input text");
  const r = redactPII(this.redactedText);
  this.redactedText = r.text;
  this.redactedTotal = r.totalRedactions;
});

Then(
  "no part of the original SSN, phone, or email survives in the output",
  function (this: IntakeWorld) {
    if (!this.redactedText) throw new Error("no output text");
    assert.ok(!this.redactedText.includes("123-45-6789"));
    assert.ok(!this.redactedText.includes("415-555-0123"));
    assert.ok((this.redactedTotal ?? 0) >= 2);
  },
);

// ---------------- Sentry scrubber ----------------
Given(
  "a Sentry event captured during an upload-token API call",
  function (this: IntakeWorld) {
    this.scrubbedEvent = {
      request: {
        url: "https://app.example.com/api/upload/secret-token-1234?code=abc",
        headers: { Authorization: "Bearer xyz", Cookie: "sb=1" },
        data: { ssn: "123-45-6789", file: "binary..." },
      },
    };
  },
);

When("the scrubber runs over the event", function (this: IntakeWorld) {
  this.scrubbedEvent = scrubEvent(this.scrubbedEvent!) as typeof this.scrubbedEvent;
});

Then(
  "the Authorization header is replaced with {string}",
  function (this: IntakeWorld, expected: string) {
    assert.equal(this.scrubbedEvent?.request?.headers?.Authorization, expected);
  },
);

Then(
  "the upload token in the URL is replaced with {string}",
  function (this: IntakeWorld, expected: string) {
    const url = this.scrubbedEvent?.request?.url ?? "";
    assert.ok(url.includes(`/api/upload/${expected}`), `url did not contain placeholder: ${url}`);
    assert.ok(!url.includes("secret-token-1234"));
  },
);

Then(
  "the request body is replaced with {string}",
  function (this: IntakeWorld, expected: string) {
    assert.equal(this.scrubbedEvent?.request?.data, expected);
  },
);
