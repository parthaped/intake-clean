import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { ExportContext } from "@/lib/exports/shared";

export async function buildMissingDocumentsReport(ctx: ExportContext): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([612, 792]);
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

  let cursor = 620;
  const sectionTitle = (label: string) => {
    page.drawText(label, { x: 50, y: cursor, size: 13, font: helvBold, color: rgb(0.06, 0.12, 0.24) });
    cursor -= 18;
  };
  const drawItem = (line: string, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(`• ${line}`, { x: 60, y: cursor, size: 11, font: helv, color });
    cursor -= 16;
    if (cursor < 80) cursor = 720;
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

  page.drawText(
    "IntakeClean helps organize documents and does not provide legal advice.",
    { x: 50, y: 36, size: 9, font: helv, color: rgb(0.5, 0.5, 0.5) },
  );

  return Buffer.from(await doc.save());
}
