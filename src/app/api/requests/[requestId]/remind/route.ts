import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { sendRequestEmailAndSms } from "@/lib/messaging/send-request";
import { enforceRateLimit } from "@/lib/security/guards";
import { limits } from "@/lib/security/rate-limit";

interface Context {
  params: Promise<{ requestId: string }>;
}

export async function POST(_request: Request, context: Context) {
  const ctx = await requireRole(["admin", "attorney", "paralegal"]);
  const limited = await enforceRateLimit(limits.fileAction, `${ctx.userId}:request-remind`);
  if (limited) return limited;
  const { requestId } = await context.params;
  try {
    const result = await sendRequestEmailAndSms({
      requestId,
      organizationId: ctx.organization.id,
      actorProfileId: ctx.profile.id,
      kind: "reminder",
    });
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Failed to send", { status: 500 });
  }
}
