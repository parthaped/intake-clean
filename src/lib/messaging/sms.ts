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
  error?: string;
}

/**
 * Send an SMS via Twilio, or fall back to a console-logged mock when Twilio
 * env vars are missing.
 */
export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  if (!integrations.hasTwilio || !env.twilioAccountSid || !env.twilioAuthToken || !env.twilioPhoneNumber) {
    console.info("[mock-sms]", { to: args.to, preview: args.body.slice(0, 160) });
    return { ok: true, status: "sent_mock", providerMessageId: null };
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
    return {
      ok: false,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown SMS error",
    };
  }
}
