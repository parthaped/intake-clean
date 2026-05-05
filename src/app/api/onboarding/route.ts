import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/security/guards";
import { clientIp, limits } from "@/lib/security/rate-limit";
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

  // Bucket by user id with a fallback to IP. Prevents an attacker from
  // bouncing a compromised session through onboarding repeatedly to spin
  // up phantom organizations.
  const limited = await enforceRateLimit(limits.onboarding, `${data.user.id}:${clientIp(request)}`);
  if (limited) return limited;

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
