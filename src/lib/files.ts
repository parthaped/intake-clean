import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";

export async function createSignedUrl(
  bucket: "original-documents" | "processed-documents" | "thumbnails" | "exports",
  path: string,
  expiresInSeconds = 60 * 10,
): Promise<string | null> {
  const service = getServiceSupabase();
  const { data, error } = await service.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.error("[files] could not create signed URL", { bucket, path, error });
    return null;
  }
  return data.signedUrl;
}

export function bucketForScope(
  scope: "original" | "processed" | "thumbnail" | "export",
): "original-documents" | "processed-documents" | "thumbnails" | "exports" {
  switch (scope) {
    case "original":
      return "original-documents";
    case "processed":
      return "processed-documents";
    case "thumbnail":
      return "thumbnails";
    case "export":
      return "exports";
  }
}
