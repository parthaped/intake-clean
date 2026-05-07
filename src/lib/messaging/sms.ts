import "server-only";

import { env, integrations } from "@/lib/env";

export interface SendSmsArgs {
  to: string;
  body: string;
}

export interface SendSmsResult {
  ok: boolean;
  status: "sent" | "sent_mock" | "failed";
  providerMessageId?: string | null;
  /**
   * Diagnostic reason persisted to `client_messages.error_message`.
   * Populated for both `failed` and `sent_mock` so staff can tell apart
   * "Twilio rejected" from "Twilio not wired up".
   */
  error?: string;
}

const MOCK_REASON = "TWILIO_* env vars not configured in this environment";

async function captureSendFailure(args: { to: string; reason: string }): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureMessage("sms.send.failed", {
      level: "error",
      tags: { component: "messaging.sms" },
      extra: {
        // Last 4 digits only so Sentry can correlate without storing
        // full phone numbers (which Resend / Twilio treat as PII under
        // GDPR + CCPA).
        toLast4: args.to.slice(-4),
        reason: args.reason,
      },
    });
  } catch {
    // Sentry not installed / failed to init.
  }
}

/**
 * Send an SMS via Twilio, or fall back to a console-logged mock when Twilio
 * env vars are missing.
 */
export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  if (!integrations.hasTwilio || !env.twilioAccountSid || !env.twilioAuthToken || !env.twilioPhoneNumber) {
    console.info("[mock-sms]", { to: args.to, preview: args.body.slice(0, 160) });
    return {
      ok: true,
      status: "sent_mock",
      providerMessageId: null,
      error: MOCK_REASON,
    };
  }

  try {
    const twilioModule = await import("twilio");
    const client = twilioModule.default(env.twilioAccountSid, env.twilioAuthToken);
    const message = await client.messages.create({
      from: env.twilioPhoneNumber,
      to: args.to,
      body: args.body,
    });
    return { ok: true, status: "sent", providerMessageId: message.sid };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown SMS error";
    console.error("[sms] Twilio client threw", { toLast4: args.to.slice(-4), reason });
    await captureSendFailure({ to: args.to, reason });
    return {
      ok: false,
      status: "failed",
      error: reason,
    };
  }
}
