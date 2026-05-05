import "server-only";

import { PDFDocument, PDFDict, PDFName, PDFRef } from "pdf-lib";

/**
 * Walks every object in a PDF and strips entries that can execute code on
 * open. PDF spec quirks make a fully-defensive sanitiser hard, but the
 * common attack-surface entries — `/JS`, `/JavaScript`, `/AA` (additional
 * actions, e.g. open / print / focus), `/OpenAction`, and `/Names ->
 * /JavaScript` — are removable in place.
 *
 * We intentionally do NOT remove `/AcroForm` or `/Annots` outright (forms
 * and annotations are part of legitimate legal docs); we only strip the
 * action / scripting children inside them.
 */
const ACTION_KEYS = ["JS", "JavaScript", "AA", "OpenAction"] as const;

export function stripPdfActions(doc: PDFDocument): void {
  const catalog = doc.catalog;
  for (const key of ACTION_KEYS) {
    catalog.delete(PDFName.of(key));
  }

  const names = catalog.lookup(PDFName.of("Names"));
  if (names instanceof PDFDict) {
    names.delete(PDFName.of("JavaScript"));
  }

  // Walk every indirect object. Anything that looks like a Dict (forms,
  // annotations, fields, pages...) gets the same actions stripped. This
  // covers per-annotation `/AA` entries and per-form-field action chains.
  const indirect = doc.context.enumerateIndirectObjects();
  for (const [, obj] of indirect) {
    if (!(obj instanceof PDFDict)) continue;
    for (const key of ACTION_KEYS) {
      obj.delete(PDFName.of(key));
    }
  }
}

/**
 * Convenience helper: load a PDF buffer, strip actions, return the cleaned
 * buffer. Used both when re-emitting a packet and when copying pages from
 * an uploaded PDF.
 */
export async function loadAndSanitizePdf(buffer: Buffer): Promise<PDFDocument> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  stripPdfActions(doc);
  return doc;
}

// Re-exported so consumers don't need to depend on pdf-lib directly.
export { PDFDocument, PDFRef };
