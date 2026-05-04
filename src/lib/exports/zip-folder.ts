import "server-only";

import { PassThrough } from "node:stream";
import archiver from "archiver";

import { DOCUMENT_TYPE_FOLDERS } from "@/lib/constants";
import { downloadFileBuffer, sanitiseFileNamePart, type ExportContext } from "@/lib/exports/shared";

export async function buildZipFolder(ctx: ExportContext): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  archive.pipe(stream);

  const root = `${sanitiseFileNamePart(ctx.client.full_name)}-${sanitiseFileNamePart(ctx.matter.matter_name)}`;
  const lastName = sanitiseFileNamePart(ctx.client.full_name.split(" ").pop() ?? ctx.client.full_name);
  const today = new Date().toISOString().slice(0, 10);

  for (const file of ctx.acceptedFiles) {
    const docType = file.detected_document_type ?? "Other / Unknown";
    const folder = DOCUMENT_TYPE_FOLDERS[docType] ?? "05 Other";
    const path = file.processed_storage_path ?? file.original_storage_path;
    const bucket = file.processed_storage_path ? "processed-documents" : "original-documents";
    const buffer = await downloadFileBuffer(path, bucket);
    if (!buffer) continue;

    const ext =
      file.processed_storage_path?.endsWith(".pdf")
        ? "pdf"
        : file.original_mime_type === "application/pdf"
          ? "pdf"
          : file.processed_storage_path?.endsWith(".jpg")
            ? "jpg"
            : extensionFromMime(file.original_mime_type);

    const cleanName = `${lastName}_${sanitiseFileNamePart(docType)}_${today}.${ext}`;
    archive.append(buffer, { name: `${root}/${folder}/${cleanName}` });
  }

  // Always include a manifest
  const manifest = {
    matter: ctx.matter,
    client: ctx.client,
    organization: ctx.organization,
    files: ctx.acceptedFiles.map((f) => ({
      original_file_name: f.original_file_name,
      detected_document_type: f.detected_document_type,
      packet_order: f.packet_order,
    })),
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: `${root}/manifest.json` });

  await archive.finalize();
  await new Promise<void>((resolve) => stream.on("end", () => resolve()));

  return Buffer.concat(chunks);
}

function extensionFromMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  if (mime === "image/webp") return "webp";
  return "bin";
}
