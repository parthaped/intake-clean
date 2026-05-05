import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { sendCompletionMessage } from "@/lib/messaging/send-completion";
import { enforceRateLimit } from "@/lib/security/guards";
import { limits } from "@/lib/security/rate-limit";

interface Context {
  params: Promise<{ matterId: string }>;
}

export async function POST(_request: Request, context: Context) {
  const ctx = await requireRole(["admin", "attorney", "paralegal"]);
  const limited = await enforceRateLimit(limits.fileAction, `${ctx.userId}:completion-send`);
  if (limited) return limited;
  const { matterId } = await context.params;
  try {
    await sendCompletionMessage({
      matterId,
      organizationId: ctx.organization.id,
      actorProfileId: ctx.profile.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Failed to send", { status: 500 });
  }
}
