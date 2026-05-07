import { NextResponse } from "next/server";

import { sendRequestEmailAndSms } from "@/lib/messaging/send-request";
import { requireRole } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/security/guards";
import { limits } from "@/lib/security/rate-limit";

interface Context {
  params: Promise<{ requestId: string }>;
}

export async function POST(_request: Request, context: Context) {
  // Sends an outbound email + SMS to the firm's client. Restricted to
  // staff roles so a future viewer/client-portal role can't trigger spam.
  // Rate-limited per-user as a second line of defence against a compromised
  // staff account fanning out reminders.
  const ctx = await requireRole(["admin", "attorney", "paralegal"]);
  const limited = await enforceRateLimit(limits.fileAction, `${ctx.userId}:request-send`);
  if (limited) return limited;
  const { requestId } = await context.params;
  try {
    const result = await sendRequestEmailAndSms({
      requestId,
      organizationId: ctx.organization.id,
      actorProfileId: ctx.profile.id,
      kind: "initial",
    });
    // Return the per-channel status so the SendRequestButton can show a
    // truthful toast: a green "sent" only when at least one provider
    // accepted the message, yellow on `sent_mock` (mock-mode fallback),
    // red on `failed`. Previously this always returned `{ ok: true }`,
    // which made the misconfigured-Resend-key bug invisible.
    return NextResponse.json({
      ok: true,
      status: result.status,
      emailError: result.emailError,
      smsError: result.smsError,
    });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Failed to send", { status: 500 });
  }
}
