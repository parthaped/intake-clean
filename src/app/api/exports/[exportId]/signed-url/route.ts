import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { createSignedUrl } from "@/lib/files";
import { getServiceSupabase } from "@/lib/supabase/service";

interface Context {
  params: Promise<{ exportId: string }>;
}

export async function GET(request: Request, context: Context) {
  const ctx = await requireSession();
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
