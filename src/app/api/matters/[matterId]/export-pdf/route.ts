import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { buildPdfPacket } from "@/lib/exports/pdf-packet";
import { loadExportContext } from "@/lib/exports/shared";
import { buildStorageKey } from "@/lib/tokens";
import { getServiceSupabase } from "@/lib/supabase/service";

interface Context {
  params: Promise<{ matterId: string }>;
}

export async function POST(_req: Request, context: Context) {
  const ctx = await requireSession();
  const { matterId } = await context.params;
  const service = getServiceSupabase();

  try {
    const exportCtx = await loadExportContext(matterId, ctx.organization.id);
    const buffer = await buildPdfPacket(exportCtx);

    const path = buildStorageKey({
      organizationId: ctx.organization.id,
      matterId,
      scope: "export",
      filename: `${exportCtx.matter.matter_name}-packet.pdf`,
    });
    const upload = await service.storage.from("exports").upload(path, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);

    const { data, error } = await service
      .from("exports")
      .insert({
        organization_id: ctx.organization.id,
        matter_id: matterId,
        export_type: "pdf_packet",
        storage_path: path,
        summary: `${exportCtx.acceptedFiles.length} accepted documents`,
        created_by: ctx.profile.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await service
      .from("uploaded_files")
      .update({ status: "exported" })
      .eq("matter_id", matterId)
      .eq("status", "accepted");

    await recordAudit({
      organizationId: ctx.organization.id,
      actorProfileId: ctx.profile.id,
      action: "export.pdf_packet_created",
      entityType: "export",
      entityId: data.id,
    });

    return NextResponse.json({ ok: true, exportId: data.id });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Export failed", { status: 500 });
  }
}
