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
    await sendRequestEmailAndSms({
      requestId,
      organizationId: ctx.organization.id,
      actorProfileId: ctx.profile.id,
      kind: "initial",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Failed to send", { status: 500 });
  }
}
