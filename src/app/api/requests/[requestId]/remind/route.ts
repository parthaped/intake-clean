import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { sendRequestEmailAndSms } from "@/lib/messaging/send-request";

interface Context {
  params: Promise<{ requestId: string }>;
}

export async function POST(_request: Request, context: Context) {
  const ctx = await requireSession();
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
