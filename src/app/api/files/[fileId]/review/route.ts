import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { DOCUMENT_TYPES } from "@/lib/constants";
import { enforceRateLimit } from "@/lib/security/guards";
import { limits } from "@/lib/security/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/service";

const schema = z.object({
  action: z.enum(["accept", "reject", "override"]),
  notes: z.string().optional(),
  manualDocumentType: z.string().optional(),
});

interface Context {
  params: Promise<{ fileId: string }>;
}

export async function POST(request: Request, context: Context) {
  // Accept/reject/override is a privileged staff decision (it changes a
  // file's status and is what eventually allows a packet to be exported).
  // Restrict to the three role-bearing seats so a future read-only or
  // client-portal role can't accept files. `requireRole` also enforces MFA
  // for admin/attorney; paralegal is intentionally exempted there.
  const ctx = await requireRole(["admin", "attorney", "paralegal"]);
  const limited = await enforceRateLimit(limits.fileAction, `${ctx.userId}:review`);
  if (limited) return limited;
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

  // ----- Manual document-type override -----
  if (parsed.data.action === "override") {
    const desired = parsed.data.manualDocumentType;
    if (!desired || !DOCUMENT_TYPES.includes(desired as (typeof DOCUMENT_TYPES)[number])) {
      return new NextResponse("Unknown document type", { status: 400 });
    }
    const overrideUpdate = await service
      .from("uploaded_files")
      .update({
        detected_document_type: desired,
        classification_source: "manual",
        classification_confidence: 1,
      })
      .eq("id", file.id);
    if (overrideUpdate.error) {
      console.error("[file-review] override update failed", overrideUpdate.error);
      return new NextResponse("Could not override classification", { status: 500 });
    }

    await recordAudit({
      organizationId: ctx.organization.id,
      actorProfileId: ctx.profile.id,
      action: "file.classification_overridden",
      entityType: "uploaded_file",
      entityId: file.id,
      metadata: { manual_document_type: desired },
    });
    return NextResponse.json({ ok: true });
  }

  // ----- Accept / reject -----
  const fileStatus = parsed.data.action === "accept" ? "accepted" : "rejected";
  const reviewStatus = parsed.data.action === "accept" ? "accepted" : "rejected";

  const fileUpdate = await service.from("uploaded_files").update({ status: fileStatus }).eq("id", file.id);
  if (fileUpdate.error) {
    console.error("[file-review] file status update failed", fileUpdate.error);
    return new NextResponse("Could not update file status", { status: 500 });
  }

  if (file.request_item_id && parsed.data.action === "accept") {
    const itemUpdate = await service
      .from("document_request_items")
      .update({ status: "accepted" })
      .eq("id", file.request_item_id);
    if (itemUpdate.error) {
      console.error("[file-review] request item update failed", itemUpdate.error);
      return new NextResponse("Could not update request item", { status: 500 });
    }
  }

  const review = await service
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
  if (review.error) {
    console.error("[file-review] review_tasks upsert failed", review.error);
    return new NextResponse("Could not record review task", { status: 500 });
  }

  // The review action is one of `accept` | `reject` here (override returned
  // earlier). Canonicalise the audit action string instead of the previous
  // `file.${action}ed` template, which would have produced "file.overrideed"
  // if the override branch ever fell through to this fallthrough later.
  const auditAction = parsed.data.action === "accept" ? "file.accepted" : "file.rejected";
  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: auditAction,
    entityType: "uploaded_file",
    entityId: file.id,
  });

  return NextResponse.json({ ok: true });
}
