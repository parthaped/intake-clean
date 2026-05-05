import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { sendReuploadMessage } from "@/lib/messaging/send-reupload";
import { enforceRateLimit } from "@/lib/security/guards";
import { limits } from "@/lib/security/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/service";

const schema = z.object({ reason: z.string().min(5) });

interface Context {
  params: Promise<{ fileId: string }>;
}

export async function POST(request: Request, context: Context) {
  // Re-upload triggers an outbound email/SMS to the client. Restricted to
  // staff roles so a hypothetical viewer/client-portal session can't
  // weaponise this endpoint as a spam vector.
  const ctx = await requireRole(["admin", "attorney", "paralegal"]);
  const limited = await enforceRateLimit(limits.fileAction, `${ctx.userId}:reupload`);
  if (limited) return limited;
  const { fileId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Reason is required", { status: 400 });

  const service = getServiceSupabase();
  const { data: file } = await service
    .from("uploaded_files")
    .select("id, organization_id, matter_id, request_id, request_item_id, original_file_name")
    .eq("id", fileId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!file) return new NextResponse("File not found", { status: 404 });

  // Surface DB write failures as 500s instead of silently 200-OK-ing the
  // staff member. Previously we discarded the error from each `.update()`
  // and the user thought a re-upload had been requested even when none of
  // the rows actually moved (file still showed `needs_review`, no
  // review_task got created, no message was queued).
  const fileUpdate = await service
    .from("uploaded_files")
    .update({ status: "needs_reupload" })
    .eq("id", file.id);
  if (fileUpdate.error) {
    console.error("[request-reupload] could not update file status", fileUpdate.error);
    return new NextResponse("Could not update file status", { status: 500 });
  }

  if (file.request_item_id) {
    const itemUpdate = await service
      .from("document_request_items")
      .update({ status: "needs_reupload" })
      .eq("id", file.request_item_id);
    if (itemUpdate.error) {
      console.error("[request-reupload] could not update request item", itemUpdate.error);
      return new NextResponse("Could not update request item", { status: 500 });
    }
  }

  const reviewUpsert = await service
    .from("review_tasks")
    .upsert(
      {
        organization_id: ctx.organization.id,
        matter_id: file.matter_id,
        uploaded_file_id: file.id,
        status: "requested_reupload",
        assigned_to: ctx.profile.id,
        reviewer_notes: parsed.data.reason,
      },
      { onConflict: "uploaded_file_id" },
    );
  if (reviewUpsert.error) {
    console.error("[request-reupload] could not upsert review task", reviewUpsert.error);
    return new NextResponse("Could not record review task", { status: 500 });
  }

  if (file.request_id && file.request_item_id) {
    try {
      await sendReuploadMessage({
        organizationId: ctx.organization.id,
        actorProfileId: ctx.profile.id,
        requestId: file.request_id,
        requestItemId: file.request_item_id,
        reason: parsed.data.reason,
      });
    } catch (err) {
      console.error("[request-reupload] send failed", err);
    }
  }

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    action: "file.reupload_requested",
    entityType: "uploaded_file",
    entityId: file.id,
    metadata: { reason: parsed.data.reason },
  });

  return NextResponse.json({ ok: true });
}
