import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { createSignedUrl } from "@/lib/files";
import { getServiceSupabase } from "@/lib/supabase/service";

interface Context {
  params: Promise<{ fileId: string }>;
}

export async function GET(request: Request, context: Context) {
  const ctx = await requireSession();
  const { fileId } = await context.params;
  const url = new URL(request.url);
  const variant = url.searchParams.get("variant") ?? "processed";

  const service = getServiceSupabase();
  const { data: file } = await service
    .from("uploaded_files")
    .select("original_storage_path, processed_storage_path, thumbnail_storage_path")
    .eq("id", fileId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });

  const path =
    variant === "original"
      ? file.original_storage_path
      : variant === "thumbnail"
        ? file.thumbnail_storage_path
        : file.processed_storage_path ?? file.original_storage_path;

  if (!path) return new NextResponse("Variant not available", { status: 404 });

  const bucket =
    variant === "thumbnail"
      ? "thumbnails"
      : variant === "original" || !file.processed_storage_path
        ? "original-documents"
        : "processed-documents";

  const signed = await createSignedUrl(bucket, path);
  if (!signed) return new NextResponse("Could not sign URL", { status: 500 });

  if (url.searchParams.get("redirect") === "1") {
    return NextResponse.redirect(signed);
  }
  return NextResponse.json({ url: signed });
}
