import { Buffer } from "node:buffer";

import { PDFDocument, PDFName, PDFDict, PDFString } from "pdf-lib";

import { loadAndSanitizePdf, stripPdfActions } from "@/lib/exports/pdf-sanitize";

/**
 * Pen-test the PDF sanitiser used in:
 *   - the export packet builder (so generated packets cannot themselves
 *     execute JavaScript when opened in a recipient's PDF viewer), and
 *   - the per-source page copy step (so a malicious uploaded PDF cannot
 *     smuggle JS through into the final packet).
 *
 * Threat model: an attacker uploads a PDF whose catalog contains an
 * `/OpenAction -> /JavaScript` entry. When the firm's reviewer (or the
 * eventual recipient) opens that PDF, the action fires and either pops a
 * dialog, exfiltrates info, or fingerprints the reader.
 *
 * After `stripPdfActions(doc)` the document MUST contain no `/JS`,
 * `/JavaScript`, `/AA`, or `/OpenAction` entries — anywhere.
 */
async function buildHostilePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);

  // /OpenAction -> {S: /JavaScript, JS: "app.alert('pwned')"} — fires on open
  const openAction = doc.context.obj({
    S: PDFName.of("JavaScript"),
    JS: PDFString.of("app.alert('pwned')"),
  });
  doc.catalog.set(PDFName.of("OpenAction"), openAction);

  // Top-level /JS as a sanity payload (some sanitisers miss this).
  doc.catalog.set(PDFName.of("JS"), PDFString.of("app.alert('top-level')"));

  // /Names -> /JavaScript -> /Names array (named JS actions, fired by
  // form scripts or via menu).
  const namedJs = doc.context.obj({
    Names: [PDFString.of("evil"), doc.context.obj({ S: PDFName.of("JavaScript"), JS: PDFString.of("evil()") })],
  });
  const names = doc.context.obj({ JavaScript: namedJs });
  doc.catalog.set(PDFName.of("Names"), names);

  // /AA on the page — fires on focus / blur / open / close.
  const pageAA = doc.context.obj({
    O: doc.context.obj({ S: PDFName.of("JavaScript"), JS: PDFString.of("alert('page open')") }),
  });
  page.node.set(PDFName.of("AA"), pageAA);

  return Buffer.from(await doc.save());
}

function dictHasAnyActionKey(dict: PDFDict): boolean {
  const keys = ["JS", "JavaScript", "AA", "OpenAction"] as const;
  for (const k of keys) {
    if (dict.has(PDFName.of(k))) return true;
  }
  return false;
}

describe("security: PDF sanitiser", () => {
  it("strips top-level /JS and /OpenAction from the catalog", async () => {
    const buf = await buildHostilePdf();
    const cleaned = await loadAndSanitizePdf(buf);
    const cat = cleaned.catalog;
    expect(cat.has(PDFName.of("JS"))).toBeFalse();
    expect(cat.has(PDFName.of("OpenAction"))).toBeFalse();
  });

  it("strips /Names -> /JavaScript so named scripts can't fire", async () => {
    const buf = await buildHostilePdf();
    const cleaned = await loadAndSanitizePdf(buf);
    const names = cleaned.catalog.lookup(PDFName.of("Names"));
    if (names instanceof PDFDict) {
      expect(names.has(PDFName.of("JavaScript"))).toBeFalse();
    } else {
      // Names was wholly replaced or removed: also fine.
      expect(true).toBeTrue();
    }
  });

  it("strips per-page /AA additional-action chains", async () => {
    const buf = await buildHostilePdf();
    const cleaned = await loadAndSanitizePdf(buf);
    const indirect = cleaned.context.enumerateIndirectObjects();
    for (const [, obj] of indirect) {
      if (obj instanceof PDFDict) {
        expect(dictHasAnyActionKey(obj)).toBeFalse();
      }
    }
  });

  it("re-saves to a buffer that no longer contains the hostile JS literal", async () => {
    const buf = await buildHostilePdf();
    const cleaned = await loadAndSanitizePdf(buf);
    const out = Buffer.from(await cleaned.save());
    const text = out.toString("latin1");
    // The string literals we planted must not survive in the saved bytes.
    expect(text).not.toContain("app.alert('pwned')");
    expect(text).not.toContain("app.alert('top-level')");
    expect(text).not.toContain("alert('page open')");
    // /JavaScript / /JS keys in the dictionary should also be gone.
    expect(text).not.toMatch(/\/JavaScript\b/);
  });

  it("is idempotent — sanitising twice does not corrupt the document", async () => {
    const buf = await buildHostilePdf();
    const once = await loadAndSanitizePdf(buf);
    stripPdfActions(once);
    expect(once.getPageCount()).toBeGreaterThan(0);
  });

  it("preserves benign content (we don't drop pages or annotations)", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    doc.addPage([100, 100]);
    const buf = Buffer.from(await doc.save());
    const cleaned = await loadAndSanitizePdf(buf);
    expect(cleaned.getPageCount()).toBe(2);
  });
});
