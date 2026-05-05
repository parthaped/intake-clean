import "server-only";

import { PassThrough } from "node:stream";
import archiver from "archiver";

import { DOCUMENT_TYPE_FOLDERS } from "@/lib/constants";
import { downloadFileBuffer, sanitiseFileNamePart, type ExportContext } from "@/lib/exports/shared";
import { loadAndSanitizePdf } from "@/lib/exports/pdf-sanitize";

export async function buildZipFolder(ctx: ExportContext): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  // CRITICAL: attach the `data`/`end`/`error` listeners and resolution
  // promises BEFORE we start appending entries or call `finalize()`.
  //
  // The previous version awaited `archive.finalize()` first and only THEN
  // attached `stream.on("end", resolve)`. For very small archives the
  // entire pipeline can flush, end, and emit `'end'` synchronously inside
  // `pipe()` — by the time we attach the listener the event is gone and
  // the function hangs forever.
  //
  // We also explicitly wire archiver's `'error'` event. Without it a
  // mid-stream archiver failure (memory exhaustion, file source error)
  // crashes the function with an unhandled rejection.
  const done = new Promise<Buffer>((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    archive.on("error", reject);
    // archiver also emits per-entry warnings — surface only the truly
    // hard errors (`level: "warning"` is informational, e.g. file size
    // mismatch), but never silently swallow.
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });
  });

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

    const isPdf =
      file.processed_storage_path?.endsWith(".pdf") ||
      file.original_mime_type === "application/pdf";
    const ext = isPdf
      ? "pdf"
      : file.processed_storage_path?.endsWith(".jpg")
        ? "jpg"
        : extensionFromMime(file.original_mime_type);

    // Strip JS / actions from PDFs before they leave the platform. The
    // packet exporter does the same; we re-do it here because ZIP includes
    // the originals (including originals that may carry JS the firm hasn't
    // opened yet).
    let payload = buffer;
    if (isPdf) {
      try {
        const sanitised = await loadAndSanitizePdf(buffer);
        payload = Buffer.from(await sanitised.save());
      } catch (error) {
        console.warn("[zip-folder] could not sanitise pdf, using original bytes", {
          file_id: file.id,
          error,
        });
      }
    }

    const cleanName = `${lastName}_${sanitiseFileNamePart(docType)}_${today}.${ext}`;
    archive.append(payload, { name: `${root}/${folder}/${cleanName}` });
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
  return done;
}

function extensionFromMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  if (mime === "image/webp") return "webp";
  return "bin";
}
