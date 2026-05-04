import { NextResponse } from "next/server";

import { sendRequestEmailAndSms } from "@/lib/messaging/send-request";
import { requireSession } from "@/lib/auth";

interface Context {
  params: Promise<{ requestId: string }>;
}

export async function POST(_request: Request, context: Context) {
  const ctx = await requireSession();
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
