import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { ExportContext } from "@/lib/exports/shared";

const PAGE_HEIGHT = 792;
const PAGE_WIDTH = 612;
/** Leave room for the disclaimer at the bottom of every page. */
const FOOTER_RESERVE = 70;
/** First-line cursor on a fresh page. Title sits above this. */
const TOP_CURSOR = 720;

export async function buildMissingDocumentsReport(ctx: ExportContext): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Mutable layout state. `cursor` is the y-coordinate where the next line
  // will be drawn. Whenever it falls below FOOTER_RESERVE we add a fresh
  // page and reset — previously the function reset the cursor to 720 on
  // the SAME page, which drew new content on top of the existing rows.
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursor = drawHeader(page, helv, helvBold, ctx);

  const ensureSpace = (lineHeight: number): void => {
    if (cursor - lineHeight < FOOTER_RESERVE) {
      drawFooter(page, helv);
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursor = TOP_CURSOR;
    }
  };

  const sectionTitle = (label: string) => {
    ensureSpace(20);
    page.drawText(label, { x: 50, y: cursor, size: 13, font: helvBold, color: rgb(0.06, 0.12, 0.24) });
    cursor -= 18;
  };
  const drawItem = (line: string, color = rgb(0.1, 0.1, 0.1)) => {
    ensureSpace(16);
    page.drawText(`• ${line}`, { x: 60, y: cursor, size: 11, font: helv, color });
    cursor -= 16;
  };

  for (const request of ctx.requests) {
    sectionTitle(`Request: ${request.title}`);
    const missing = request.items.filter((i) => i.status === "missing" && i.required);
    const reupload = request.items.filter((i) => i.status === "needs_reupload");
    const optionalMissing = request.items.filter((i) => i.status === "missing" && !i.required);

    if (missing.length === 0 && reupload.length === 0 && optionalMissing.length === 0) {
      drawItem("All required documents received.", rgb(0.05, 0.5, 0.4));
      cursor -= 6;
      continue;
    }

    if (missing.length > 0) {
      drawItem("Required, still missing:", rgb(0.6, 0.1, 0.1));
      missing.forEach((i) => drawItem(`${i.title}${i.description ? ` — ${i.description}` : ""}`));
    }
    if (reupload.length > 0) {
      drawItem("Needs re-upload:", rgb(0.7, 0.45, 0));
      reupload.forEach((i) => drawItem(i.title));
    }
    if (optionalMissing.length > 0) {
      drawItem("Optional, not yet provided:", rgb(0.4, 0.4, 0.4));
      optionalMissing.forEach((i) => drawItem(i.title));
    }
    cursor -= 6;
  }

  if (ctx.rejectedFiles.length > 0) {
    sectionTitle("Files needing follow-up");
    for (const file of ctx.rejectedFiles) {
      const label =
        file.status === "needs_reupload"
          ? `Re-upload: ${file.original_file_name}`
          : `Rejected: ${file.original_file_name}`;
      drawItem(label, file.status === "rejected" ? rgb(0.6, 0.1, 0.1) : rgb(0.7, 0.45, 0));
      if (file.reason) {
        drawItem(`  Reason: ${file.reason}`, rgb(0.35, 0.35, 0.35));
      }
    }
  }

  // Final page footer.
  drawFooter(page, helv);

  return Buffer.from(await doc.save());
}

function drawHeader(page: PDFPage, helv: PDFFont, helvBold: PDFFont, ctx: ExportContext): number {
  page.drawText("Missing Documents Report", {
    x: 50,
    y: 720,
    size: 22,
    font: helvBold,
    color: rgb(0.06, 0.12, 0.24),
  });
  page.drawText(`${ctx.organization.name} · ${ctx.matter.matter_name}`, {
    x: 50,
    y: 695,
    size: 11,
    font: helv,
    color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText(`Client: ${ctx.client.full_name}`, { x: 50, y: 678, size: 11, font: helv });
  page.drawText(`Generated: ${new Date().toLocaleString()}`, { x: 50, y: 661, size: 10, font: helv });
  return 620;
}

function drawFooter(page: PDFPage, helv: PDFFont): void {
  page.drawText(
    "AI checks are assistive only. Firm staff must review every document before use.",
    { x: 50, y: 50, size: 9, font: helv, color: rgb(0.5, 0.5, 0.5) },
  );
  page.drawText(
    "IntakeClean helps organize documents and does not provide legal advice.",
    { x: 50, y: 36, size: 9, font: helv, color: rgb(0.5, 0.5, 0.5) },
  );
}
