import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { sendCompletionMessage } from "@/lib/messaging/send-completion";

interface Context {
  params: Promise<{ matterId: string }>;
}

export async function POST(_request: Request, context: Context) {
  const ctx = await requireSession();
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
