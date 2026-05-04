import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { buildZipFolder } from "@/lib/exports/zip-folder";
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
    const buffer = await buildZipFolder(exportCtx);

    const path = buildStorageKey({
      organizationId: ctx.organization.id,
      matterId,
      scope: "export",
      filename: `${exportCtx.matter.matter_name}-folder.zip`,
    });
    const upload = await service.storage.from("exports").upload(path, buffer, {
      contentType: "application/zip",
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);

    const { data, error } = await service
      .from("exports")
      .insert({
        organization_id: ctx.organization.id,
        matter_id: matterId,
        export_type: "zip_folder",
        storage_path: path,
        summary: `${exportCtx.acceptedFiles.length} files in organized folders`,
        created_by: ctx.profile.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await recordAudit({
      organizationId: ctx.organization.id,
      actorProfileId: ctx.profile.id,
      action: "export.zip_folder_created",
      entityType: "export",
      entityId: data.id,
    });

    return NextResponse.json({ ok: true, exportId: data.id });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Export failed", { status: 500 });
  }
}
