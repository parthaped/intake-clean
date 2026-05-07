import "server-only";

import { env, integrations } from "@/lib/env";

export interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  /**
   * Optional HTML body delivered alongside `text` as a multipart/alternative
   * message. Inboxes that can't render HTML still see the plain-text version,
   * so callers should always provide a sensible `text` even when `html` is
   * set.
   */
  html?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  status: "sent" | "sent_mock" | "failed";
  providerMessageId?: string | null;
  /**
   * Diagnostic reason persisted to `client_messages.error_message`.
   * Populated for both `failed` (provider rejection / network error) and
   * `sent_mock` (no provider configured) — staff need both to tell apart
   * "Resend rejected the recipient" from "Resend isn't wired up at all".
   */
  error?: string;
}

const MOCK_REASON = "RESEND_API_KEY not configured in this environment";

/**
 * Best-effort Sentry capture so a Resend failure shows up in the same
 * dashboard as our other production errors. Loaded dynamically so the
 * email module still works in environments (tests, scripts) where Sentry
 * isn't initialised. We pass scrubbed extras only — never the raw email
 * body — because PII redaction in `sentry.server.config.ts.beforeSend`
 * runs against `event.message` / `event.exception`, not arbitrary
 * extra-data fields.
 */
async function captureSendFailure(args: {
  to: string;
  subject: string;
  reason: string;
}): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureMessage("email.send.failed", {
      level: "error",
      tags: { component: "messaging.email" },
      extra: {
        // Domain only — never the local-part — so Sentry doesn't store
        // raw client email addresses against every event.
        toDomain: args.to.split("@")[1] ?? "unknown",
        subject: args.subject,
        reason: args.reason,
      },
    });
  } catch {
    // Sentry not installed / failed to init — fall through. The
    // console.error above is still our breadcrumb.
  }
}

/**
 * Send an email via Resend, or fall back to a console-logged mock when no
 * `RESEND_API_KEY` is configured. Returns a structured result so callers can
 * persist `client_messages.status='sent'|'sent_mock'|'failed'` and
 * `client_messages.error_message`.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  if (!integrations.hasResend || !env.resendApiKey) {
    console.info("[mock-email]", {
      to: args.to,
      subject: args.subject,
      preview: args.text.slice(0, 200),
      hasHtml: typeof args.html === "string" && args.html.length > 0,
    });
    return {
      ok: true,
      status: "sent_mock",
      providerMessageId: null,
      // Surface why the email is mocked so the dashboard's Messages tab
      // can render "Mock mode — RESEND_API_KEY not configured…" instead
      // of leaving staff guessing why mail isn't arriving.
      error: MOCK_REASON,
    };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const result = await resend.emails.send({
      from: env.resendFromEmail,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      replyTo: args.replyTo,
    });
    if (result.error) {
      const reason = result.error.message;
      console.error("[email] Resend rejected message", {
        toDomain: args.to.split("@")[1] ?? "unknown",
        subject: args.subject,
        reason,
      });
      await captureSendFailure({ to: args.to, subject: args.subject, reason });
      return { ok: false, status: "failed", error: reason };
    }
    return {
      ok: true,
      status: "sent",
      providerMessageId: result.data?.id ?? null,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown email error";
    console.error("[email] Resend client threw", {
      toDomain: args.to.split("@")[1] ?? "unknown",
      subject: args.subject,
      reason,
    });
    await captureSendFailure({ to: args.to, subject: args.subject, reason });
    return {
      ok: false,
      status: "failed",
      error: reason,
    };
  }
}
