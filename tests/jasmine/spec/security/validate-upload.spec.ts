import { Buffer } from "node:buffer";

import { MAX_FILE_SIZE_BYTES } from "@/lib/constants";
import { validateUploadedFile } from "@/lib/uploads/validate";

/**
 * Pen-test the server-side magic-byte validator. The threat model:
 *
 *   "An attacker uploads a file whose claimed MIME type (and extension)
 *   look like an accepted format (PDF, PNG, ...) but whose content is
 *   actually something dangerous — an HTML file that triggers an XSS when
 *   served back, an executable that targets a downstream tool, or a
 *   polyglot that confuses our PDF renderer."
 *
 * The validator must:
 *   1. Reject empty files.
 *   2. Reject files larger than `MAX_FILE_SIZE_BYTES`.
 *   3. Reject files whose claimed MIME isn't on the allow-list (no .exe,
 *      .html, .svg, etc.) regardless of the leading bytes.
 *   4. Reject files whose detected MIME doesn't match the claimed one.
 *   5. Accept genuine PDFs and images.
 */

// Real magic-byte sequences. These are short on purpose — the validator
// only sniffs the leading 4 KB.
const PDF_HEADER = Buffer.concat([
  Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary"),
  Buffer.alloc(64), // pad to look like a real-ish PDF
]);

const PNG_HEADER = Buffer.concat([
  // PNG signature
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  // IHDR chunk header (length + type)
  Buffer.from([0x00, 0x00, 0x00, 0x0d]),
  Buffer.from("IHDR"),
  // IHDR data: 1x1, 8-bit, RGBA
  Buffer.from([
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
  ]),
  // CRC placeholder
  Buffer.from([0x1f, 0x15, 0xc4, 0x89]),
]);

const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
]);

// Adversarial payloads.
const HTML_DISGUISED_AS_PDF = Buffer.from(
  "<html><body><script>alert('xss')</script></body></html>\n",
);
const SHELL_SCRIPT_DISGUISED_AS_PDF = Buffer.from("#!/bin/sh\nrm -rf /\n");
// Windows PE header (`MZ`) disguised as a PNG.
const PE_DISGUISED_AS_PNG = Buffer.concat([
  Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
  Buffer.alloc(64),
]);
// Polyglot: PDF header with embedded HTML payload — should still be
// detected as a PDF by file-type AND match the claimed application/pdf.
const PDF_WITH_HTML_BODY = Buffer.concat([
  PDF_HEADER,
  Buffer.from("<script>alert('xss')</script>"),
]);

function makeFile(name: string, type: string, body: Buffer): File {
  // Wrap in a Uint8Array view so the BlobPart shape lines up with the
  // strict ArrayBufferView<ArrayBuffer> the lib.dom typings expect (Node's
  // `Buffer<ArrayBufferLike>` isn't assignable directly).
  return new File([new Uint8Array(body)], name, { type });
}

describe("security: validateUploadedFile", () => {
  describe("size guards", () => {
    it("rejects an empty file", async () => {
      const f = makeFile("empty.pdf", "application/pdf", Buffer.alloc(0));
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeFalse();
      expect(r.status).toBe(400);
    });

    it("rejects a file over MAX_FILE_SIZE_BYTES without sniffing it", async () => {
      // Create a large File without actually allocating ~50 MB of memory:
      // we forge the size by passing a Buffer of length (MAX + 1) but
      // only construct it lazily via a Uint8Array view — the validator
      // checks `file.size` first and bails before sniffing.
      const big = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1, 0);
      const f = makeFile("big.pdf", "application/pdf", big);
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeFalse();
      expect(r.status).toBe(413);
    });
  });

  describe("MIME allow-list", () => {
    const banned: Array<[string, string]> = [
      ["application/x-msdownload", "evil.exe"],
      ["text/html", "evil.html"],
      ["image/svg+xml", "evil.svg"],
      ["application/javascript", "evil.js"],
      ["application/zip", "archive.zip"],
      ["text/plain", "notes.txt"],
    ];
    for (const [mime, name] of banned) {
      it(`rejects claimed MIME ${mime}`, async () => {
        const f = makeFile(name, mime, Buffer.from("anything"));
        const r = await validateUploadedFile(f);
        expect(r.ok).toBeFalse();
        expect(r.status).toBe(415);
      });
    }
  });

  describe("polyglot / mismatch attacks", () => {
    it("rejects HTML disguised as a PDF (claimed mime: application/pdf, content: HTML)", async () => {
      const f = makeFile("invoice.pdf", "application/pdf", HTML_DISGUISED_AS_PDF);
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeFalse();
      expect(r.status).toBe(415);
    });

    it("rejects a shell script disguised as a PDF", async () => {
      const f = makeFile("invoice.pdf", "application/pdf", SHELL_SCRIPT_DISGUISED_AS_PDF);
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeFalse();
      expect(r.status).toBe(415);
    });

    it("rejects a Windows PE executable disguised as a PNG", async () => {
      const f = makeFile("photo.png", "image/png", PE_DISGUISED_AS_PNG);
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeFalse();
      expect(r.status).toBe(415);
    });

    it("rejects a JPEG renamed with a .png extension and image/png MIME", async () => {
      // Magic bytes say JPEG; the client claims PNG.
      const f = makeFile("photo.png", "image/png", JPEG_HEADER);
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeFalse();
      expect(r.status).toBe(415);
      expect(r.detectedMime).toBe("image/jpeg");
    });
  });

  describe("happy path: genuine files are accepted", () => {
    it("accepts a real PDF", async () => {
      const f = makeFile("scan.pdf", "application/pdf", PDF_HEADER);
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeTrue();
      expect(r.detectedMime).toBe("application/pdf");
    });

    it("accepts a PDF that contains HTML in its body (defence-in-depth: PDF sanitiser handles the body separately)", async () => {
      // The validator only attests that this IS a PDF; the action
      // stripping (tested elsewhere) handles the embedded payload.
      const f = makeFile("invoice.pdf", "application/pdf", PDF_WITH_HTML_BODY);
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeTrue();
      expect(r.detectedMime).toBe("application/pdf");
    });

    it("accepts a real PNG", async () => {
      const f = makeFile("scan.png", "image/png", PNG_HEADER);
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeTrue();
      expect(r.detectedMime).toBe("image/png");
    });

    it("accepts a real JPEG", async () => {
      const f = makeFile("scan.jpg", "image/jpeg", JPEG_HEADER);
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeTrue();
      expect(r.detectedMime).toBe("image/jpeg");
    });

    it("accepts image/jpg (legacy alias) when the bytes are JPEG", async () => {
      const f = makeFile("scan.jpg", "image/jpg", JPEG_HEADER);
      const r = await validateUploadedFile(f);
      expect(r.ok).toBeTrue();
    });
  });
});
