import { NextResponse } from "next/server";

import { requireSessionWithMfa, requireStepUpReauth } from "@/lib/auth";
import { createSignedUrl } from "@/lib/files";
import { enforceRateLimit } from "@/lib/security/guards";
import { limits } from "@/lib/security/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/service";

interface Context {
  params: Promise<{ fileId: string }>;
}

export async function GET(request: Request, context: Context) {
  const url = new URL(request.url);
  const variant = url.searchParams.get("variant") ?? "processed";
  // The `original` variant streams unredacted client uploads (passport/SSN
  // scans). Anything coarser than `processed`/`thumbnail` requires a fresh
  // step-up MFA assertion so a stolen session cookie alone can't exfiltrate
  // raw PII. Other variants still require MFA-required roles to satisfy
  // AAL2 — a previous version only called `requireSession()` here, which
  // contradicted the dashboard pages that gated the same data behind MFA.
  const ctx = variant === "original" ? await requireStepUpReauth() : await requireSessionWithMfa();
  const limited = await enforceRateLimit(limits.signedUrl, `${ctx.userId}:signed-url`);
  if (limited) return limited;
  const { fileId } = await context.params;

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
