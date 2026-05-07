/**
 * Build static, branded PDFs of every public-facing legal document.
 *
 * Output: `public/legal/<slug>.pdf` for every entry in `LEGAL_DOCUMENTS`.
 *
 * Usage:
 *   npm run build:legal
 *
 * Run this once after editing any of the policy markdown files. The output
 * PDFs are static assets served by Next.js from `public/legal/...`, so the
 * URLs `/legal/<slug>.pdf` work in dev and production without any runtime
 * PDF generation.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { marked } from "marked";
import puppeteer from "puppeteer";

import {
  LEGAL_DOCUMENTS,
  applyLegalSubstitutions,
  type LegalDocument,
} from "../src/lib/legal-documents";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "public", "legal");

const BRAND = {
  name: "IntakeClean",
  tagline: "Document intake for small law firms",
};

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(doc: LegalDocument, body: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${htmlEscape(doc.title)} — ${htmlEscape(BRAND.name)}</title>
    <style>
      @page {
        size: Letter;
        margin: 0.85in 0.75in 0.95in 0.75in;
      }
      :root {
        --ink: #0f172a;
        --muted: #475569;
        --rule: #cbd5e1;
        --accent: #1d4ed8;
        --bg-soft: #f8fafc;
      }
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: var(--ink);
        font-family: "Source Serif 4", "Source Serif Pro", "Iowan Old Style",
          "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
        font-size: 10.5pt;
        line-height: 1.55;
      }
      header.cover {
        border-bottom: 1.5pt solid var(--accent);
        padding-bottom: 14pt;
        margin-bottom: 22pt;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 24pt;
      }
      header.cover .brand {
        font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-weight: 700;
        font-size: 16pt;
        letter-spacing: -0.01em;
        color: var(--ink);
      }
      header.cover .brand span.accent {
        color: var(--accent);
      }
      header.cover .meta {
        font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 8pt;
        color: var(--muted);
        text-align: right;
        line-height: 1.4;
      }
      h1 {
        font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 22pt;
        line-height: 1.2;
        margin: 4pt 0 2pt 0;
        letter-spacing: -0.015em;
      }
      .doc-subtitle {
        font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 10pt;
        color: var(--muted);
        margin-bottom: 18pt;
      }
      h2 {
        font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 13pt;
        margin: 18pt 0 6pt 0;
        page-break-after: avoid;
      }
      h3 {
        font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 11pt;
        margin: 12pt 0 4pt 0;
        page-break-after: avoid;
      }
      h4, h5, h6 {
        font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 10.5pt;
        margin: 10pt 0 3pt 0;
        page-break-after: avoid;
      }
      p {
        margin: 6pt 0;
        orphans: 3;
        widows: 3;
      }
      ul, ol {
        margin: 6pt 0 6pt 18pt;
        padding: 0;
      }
      li {
        margin: 2pt 0;
      }
      a {
        color: var(--accent);
        text-decoration: none;
        word-break: break-word;
      }
      blockquote {
        margin: 10pt 0;
        padding: 8pt 12pt;
        background: var(--bg-soft);
        border-left: 2.5pt solid var(--accent);
        color: var(--ink);
        font-size: 10pt;
        page-break-inside: avoid;
      }
      blockquote p { margin: 4pt 0; }
      code {
        font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas,
          "Liberation Mono", monospace;
        font-size: 9pt;
        background: var(--bg-soft);
        padding: 1pt 4pt;
        border-radius: 2pt;
        color: var(--ink);
      }
      pre {
        background: var(--bg-soft);
        border: 0.5pt solid var(--rule);
        padding: 8pt 10pt;
        border-radius: 3pt;
        font-size: 9pt;
        overflow: hidden;
        page-break-inside: avoid;
      }
      pre code { background: transparent; padding: 0; }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 10pt 0;
        font-size: 9.5pt;
        page-break-inside: avoid;
      }
      th, td {
        border: 0.5pt solid var(--rule);
        padding: 5pt 7pt;
        vertical-align: top;
        text-align: left;
      }
      th {
        background: var(--bg-soft);
        font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-weight: 600;
      }
      hr {
        border: none;
        border-top: 0.5pt solid var(--rule);
        margin: 16pt 0;
      }
      strong { color: var(--ink); }
      .doc-body { color: var(--ink); }
      footer.note {
        margin-top: 24pt;
        padding-top: 10pt;
        border-top: 0.5pt solid var(--rule);
        font-family: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 8pt;
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <header class="cover">
      <div class="brand">Intake<span class="accent">Clean</span></div>
      <div class="meta">
        ${htmlEscape(BRAND.tagline)}<br />
        Generated ${today}
      </div>
    </header>
    <h1>${htmlEscape(doc.title)}</h1>
    <p class="doc-subtitle">${htmlEscape(doc.description)}</p>
    <article class="doc-body">${body}</article>
    <footer class="note">
      This document is a public statement of IntakeClean's terms or practices and
      is not legal advice. The current canonical version is published at
      <a href="https://www.intakeclean.com/legal/${doc.slug}">www.intakeclean.com/legal/${doc.slug}</a>.
    </footer>
  </body>
</html>`;
}

const headerTemplate = `
  <div style="font-size:8pt; color:#475569; font-family:Inter, Helvetica, Arial, sans-serif; width:100%; padding: 0 0.75in;">
    <span class="title"></span>
  </div>
`;

const footerTemplate = `
  <div style="font-size:8pt; color:#475569; font-family:Inter, Helvetica, Arial, sans-serif; width:100%; padding: 0 0.75in; display:flex; justify-content:space-between;">
    <span>IntakeClean &middot; <span class="title"></span></span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>
`;

async function generatePdf(doc: LegalDocument, browser: import("puppeteer").Browser): Promise<void> {
  const markdownPath = join(ROOT, doc.markdownPath);
  const rawMarkdown = await readFile(markdownPath, "utf8");
  const markdown = applyLegalSubstitutions(rawMarkdown, doc);

  const renderer = new marked.Renderer();
  marked.setOptions({ gfm: true, breaks: false });
  const bodyHtml = marked.parse(markdown, { renderer, async: false }) as string;
  const fullHtml = buildHtml(doc, bodyHtml);

  const page = await browser.newPage();
  await page.setContent(fullHtml, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({
    format: "Letter",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: headerTemplate.replace('<span class="title"></span>', htmlEscape(doc.title)),
    footerTemplate: footerTemplate.replace('<span class="title"></span>', htmlEscape(doc.title)),
    margin: { top: "0.85in", bottom: "0.95in", left: "0.75in", right: "0.75in" },
  });
  await page.close();

  const outPath = join(OUT_DIR, `${doc.slug}.pdf`);
  await writeFile(outPath, pdfBuffer);
  const sizeKb = (pdfBuffer.length / 1024).toFixed(1);
  console.log(`  ${doc.slug.padEnd(28)} ${sizeKb.padStart(7)} KB  →  public/legal/${doc.slug}.pdf`);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Building ${LEGAL_DOCUMENTS.length} legal PDFs into ${OUT_DIR}`);
  console.log("");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    for (const doc of LEGAL_DOCUMENTS) {
      await generatePdf(doc, browser);
    }
  } finally {
    await browser.close();
  }

  console.log("");
  console.log("Done. Commit the generated PDFs and they will be served from /legal/<slug>.pdf.");
}

main().catch((err) => {
  console.error("[build-legal-pdfs] failed", err);
  process.exit(1);
});
