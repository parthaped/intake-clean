import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

const schema = z.object({ action: z.enum(["accept", "reject"]), notes: z.string().optional() });

interface Context {
  params: Promise<{ fileId: string }>;
}

export async function POST(request: Request, context: Context) {
  const ctx = await requireSession();
  const { fileId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Invalid request", { status: 400 });

  const service = getServiceSupabase();

  const { data: file } = await service
    .from("uploaded_files")
    .select("id, organization_id, matter_id, request_item_id")
    .eq("id", fileId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!file) return new NextResponse("File not found", { status: 404 });

  const fileStatus = parsed.data.action === "accept" ? "accepted" : "rejected";
  const reviewStatus = parsed.data.action === "accept" ? "accepted" : "rejected";

  await service.from("uploaded_files").update({ status: fileStatus }).eq("id", file.id);

  if (file.request_item_id && parsed.data.action === "accept") {
    await service
      .from("document_request_items")
      .update({ status: "accepted" })
      .eq("id", file.request_item_id);
  }

  await service
    .from("review_tasks")
    .upsert(
      {
        organization_id: ctx.organization.id,
        matter_id: file.matter_id,
        uploaded_file_id: file.id,
        status: reviewStatus,
        assigned_to: ctx.profile.id,
        reviewer_notes: parsed.data.notes ?? null,
      },
      { onConflict: "uploaded_file_id" },
    );

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: `file.${parsed.data.action}ed`,
    entityType: "uploaded_file",
    entityId: file.id,
  });

  return NextResponse.json({ ok: true });
}
