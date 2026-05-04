import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerSupabase } from "@/lib/supabase/server";
import { bootstrapOrganization } from "@/lib/onboarding";

const schema = z.object({
  fullName: z.string().min(2),
  firmName: z.string().min(2),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const result = await bootstrapOrganization({
      userId: data.user.id,
      fullName: parsed.data.fullName,
      firmName: parsed.data.firmName,
      email: data.user.email ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Failed", { status: 500 });
  }
}
