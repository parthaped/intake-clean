import { NextResponse } from "next/server";

import { requireSessionWithMfa } from "@/lib/auth";
import { createSignedUrl } from "@/lib/files";
import { getServiceSupabase } from "@/lib/supabase/service";

interface Context {
  params: Promise<{ exportId: string }>;
}

export async function GET(request: Request, context: Context) {
  // Exports bundle every accepted document for the matter (passports, SSNs,
  // client correspondence). The export-creation routes already gate on
  // `requireStepUpReauth()`; the download route was only checking
  // `requireSession()`, which let any session — including ones that hadn't
  // satisfied AAL2 — bypass MFA. We at least require AAL2 here. We don't
  // require step-up reauth because the URL is short-lived (10 min) and
  // re-prompting on every download would be hostile UX.
  const ctx = await requireSessionWithMfa();
  const { exportId } = await context.params;
  const service = getServiceSupabase();

  const { data: row } = await service
    .from("exports")
    .select("id, storage_path, organization_id")
    .eq("id", exportId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!row) return new NextResponse("Not found", { status: 404 });

  const url = await createSignedUrl("exports", row.storage_path, 600);
  if (!url) return new NextResponse("Could not sign URL", { status: 500 });

  if (new URL(request.url).searchParams.get("redirect") !== "0") {
    return NextResponse.redirect(url);
  }
  return NextResponse.json({ url });
}
