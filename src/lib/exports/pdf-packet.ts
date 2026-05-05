import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { downloadFileBuffer, type ExportContext } from "@/lib/exports/shared";
import { loadAndSanitizePdf, stripPdfActions } from "@/lib/exports/pdf-sanitize";
import { fingerprintFileName } from "@/lib/uploads/file-name-fingerprint";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const COVER_FIRST_LINE_Y = 580;
const COVER_FOOTER_RESERVE = 130; // disclaimer block sits in the bottom ~130pt

/**
 * pdf-lib's `StandardFonts.Helvetica` uses WinAnsi encoding which only
 * covers Latin-1 characters. A filename with curly quotes, accented vowels,
 * or any non-Latin script (Cyrillic, CJK, Arabic) makes `drawText` throw
 * "WinAnsi cannot encode character ...". Previously such filenames silently
 * dropped the document from the cover list / per-page footer.
 *
 * We replace anything outside the safe ASCII subset with `?` so the cover
 * still renders. The sha256 fingerprint plus the file id stay accurate, so
 * staff can still trace each entry back to a specific upload.
 */
function asciiOnly(input: string): string {
  // Strip control bytes and anything beyond Latin-1 (0xFF). pdf-lib's
  // WinAnsi mapping covers most Latin-1 — but to keep this dependency-free
  // we be conservative and only allow printable ASCII.
  return input.replace(/[^\x20-\x7E]/g, "?");
}

export async function buildPdfPacket(ctx: ExportContext): Promise<Buffer> {
  const out = await PDFDocument.create();
  const helv = await out.embedFont(StandardFonts.Helvetica);
  const helvBold = await out.embedFont(StandardFonts.HelveticaBold);

  // ---------- Cover page(s) ----------
  // Paginate the document list so a packet with 30+ files doesn't draw
  // entries off the bottom of the page.
  let cover = out.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawCoverHeader(cover, helv, helvBold, ctx);

  cover.drawText("Documents included:", { x: 50, y: 600, size: 12, font: helvBold });
  let cursor = COVER_FIRST_LINE_Y;
  ctx.acceptedFiles.forEach((f, idx) => {
    if (cursor < COVER_FOOTER_RESERVE) {
      drawCoverDisclaimer(cover, helv);
      cover = out.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cover.drawText("Documents included (continued)", {
        x: 50,
        y: 720,
        size: 14,
        font: helvBold,
        color: rgb(0.06, 0.12, 0.24),
      });
      cursor = 690;
    }
    const docType = asciiOnly(f.detected_document_type ?? "Document");
    const fileName = asciiOnly(f.original_file_name);
    cover.drawText(`${idx + 1}. ${docType} — ${fileName}`, {
      x: 60,
      y: cursor,
      size: 10,
      font: helv,
    });
    cursor -= 16;
  });
  drawCoverDisclaimer(cover, helv);

  // ---------- Document pages ----------
  let groupedByType: string | null = null;

  for (const file of ctx.acceptedFiles) {
    const docType = file.detected_document_type ?? "Other";
    if (docType !== groupedByType) {
      groupedByType = docType;
      const divider = out.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      divider.drawText(asciiOnly(docType), {
        x: 50,
        y: 700,
        size: 22,
        font: helvBold,
        color: rgb(0.06, 0.12, 0.24),
      });
      divider.drawLine({
        start: { x: 50, y: 690 },
        end: { x: 562, y: 690 },
        thickness: 1,
        color: rgb(0.83, 0.83, 0.83),
      });
    }
    await embedFile(out, file, helv);
  }

  // Page numbers
  const pages = out.getPages();
  pages.forEach((p, idx) => {
    const { width } = p.getSize();
    const text = `Page ${idx + 1} of ${pages.length}`;
    const w = helv.widthOfTextAtSize(text, 9);
    p.drawText(text, { x: width - w - 30, y: 18, size: 9, font: helv, color: rgb(0.4, 0.4, 0.4) });
  });

  // Final defense-in-depth strip on the assembled packet so any action
  // entry that survived the per-source sanitisation (or that pdf-lib
  // synthesised during copyPages) is removed before it ships to the firm.
  stripPdfActions(out);

  return Buffer.from(await out.save());
}

function drawCoverHeader(cover: PDFPage, helv: PDFFont, helvBold: PDFFont, ctx: ExportContext): void {
  cover.drawText("IntakeClean Document Packet", {
    x: 50,
    y: 720,
    size: 22,
    font: helvBold,
    color: rgb(0.06, 0.12, 0.24),
  });
  cover.drawText(asciiOnly(ctx.organization.name), {
    x: 50,
    y: 690,
    size: 12,
    font: helv,
    color: rgb(0.4, 0.4, 0.4),
  });
  cover.drawText(`Matter: ${asciiOnly(ctx.matter.matter_name)}`, {
    x: 50,
    y: 660,
    size: 14,
    font: helvBold,
  });
  cover.drawText(`Client: ${asciiOnly(ctx.client.full_name)}`, {
    x: 50,
    y: 640,
    size: 12,
    font: helv,
  });
  cover.drawText(`Exported: ${new Date().toLocaleString()}`, { x: 50, y: 620, size: 10, font: helv });
}

function drawCoverDisclaimer(cover: PDFPage, helv: PDFFont): void {
  const disclaimer = [
    "Prepared for firm review. Not a legal sufficiency determination.",
    "AI checks are assistive only. Firm staff must review every document before use.",
    "IntakeClean helps organize documents and does not provide legal advice.",
  ];
  let footerY = 110;
  disclaimer.forEach((line) => {
    cover.drawText(line, { x: 50, y: footerY, size: 9, font: helv, color: rgb(0.5, 0.5, 0.5) });
    footerY -= 12;
  });
}

async function embedFile(
  doc: PDFDocument,
  file: ExportContext["acceptedFiles"][number],
  helv: PDFFont,
) {
  const path = file.processed_storage_path ?? file.original_storage_path;
  const bucket = file.processed_storage_path ? "processed-documents" : "original-documents";
  const buffer = await downloadFileBuffer(path, bucket);
  if (!buffer) return;

  if (file.original_mime_type === "application/pdf" || file.processed_storage_path?.endsWith(".pdf")) {
    try {
      // Sanitise the source BEFORE we copy any pages. pdf-lib's `copyPages`
      // pulls in linked indirect objects, which is exactly how /AA and
      // /JS entries hidden on annotations get carried into the packet.
      const src = await loadAndSanitizePdf(buffer);
      const copies = await doc.copyPages(src, src.getPageIndices());
      copies.forEach((page) => doc.addPage(page));
      return;
    } catch (error) {
      console.error("[pdf-packet] could not embed pdf", {
        file_id: file.id,
        file_name_sha256: fingerprintFileName(file.original_file_name).sha256,
        error,
      });
    }
  }

  try {
    const isPng = file.processed_storage_path?.endsWith(".png") || file.original_mime_type === "image/png";
    const image = isPng ? await doc.embedPng(buffer) : await doc.embedJpg(buffer);
    const { width: imgW, height: imgH } = image.scale(1);
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const margin = 36;
    const maxW = PAGE_WIDTH - margin * 2;
    const maxH = PAGE_HEIGHT - margin * 2 - 24;
    const scale = Math.min(maxW / imgW, maxH / imgH, 1);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    page.drawImage(image, {
      x: (PAGE_WIDTH - drawW) / 2,
      y: PAGE_HEIGHT - margin - drawH,
      width: drawW,
      height: drawH,
    });
    page.drawText(asciiOnly(file.original_file_name), {
      x: margin,
      y: 24,
      size: 9,
      font: helv,
      color: rgb(0.4, 0.4, 0.4),
    });
  } catch (error) {
    console.error("[pdf-packet] could not embed image", {
      file_id: file.id,
      file_name_sha256: fingerprintFileName(file.original_file_name).sha256,
      error,
    });
  }
}
