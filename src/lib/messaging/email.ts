import "server-only";

import { env, integrations } from "@/lib/env";

export interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  status: "sent" | "sent_mock" | "failed";
  providerMessageId?: string | null;
  error?: string;
}

/**
 * Send an email via Resend, or fall back to a console-logged mock when no
 * `RESEND_API_KEY` is configured. Returns a structured result so callers can
 * persist `client_messages.status='sent'|'sent_mock'|'failed'`.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  if (!integrations.hasResend || !env.resendApiKey) {
    console.info("[mock-email]", {
      to: args.to,
      subject: args.subject,
      preview: args.text.slice(0, 200),
    });
    return { ok: true, status: "sent_mock", providerMessageId: null };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const result = await resend.emails.send({
      from: env.resendFromEmail,
      to: args.to,
      subject: args.subject,
      text: args.text,
      replyTo: args.replyTo,
    });
    if (result.error) {
      return { ok: false, status: "failed", error: result.error.message };
    }
    return {
      ok: true,
      status: "sent",
      providerMessageId: result.data?.id ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}
