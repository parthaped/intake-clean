import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DOMPurify from "isomorphic-dompurify";
import { ArrowLeft, Download } from "lucide-react";
import { marked } from "marked";

import { MarketingShell } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import {
  LEGAL_DOCUMENTS,
  applyLegalSubstitutions,
  findLegalDocument,
  type LegalDocument,
} from "@/lib/legal-documents";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = findLegalDocument(slug);
  if (!doc) return {};
  return {
    title: `${doc.title} — IntakeClean`,
    description: doc.description,
    alternates: { canonical: `/legal/${doc.slug}` },
  };
}

/**
 * Module-scope cache keyed by slug. The markdown is shipped with the
 * function bundle (see `outputFileTracingIncludes` in `next.config.ts`)
 * and never changes between deploys, so we read each file at most once
 * per cold start and reuse the rendered, sanitised HTML on every hit.
 */
const htmlCache = new Map<string, string>();

async function loadDocumentHtml(doc: LegalDocument): Promise<string> {
  const cached = htmlCache.get(doc.slug);
  if (cached) return cached;

  const absolutePath = join(process.cwd(), doc.markdownPath);
  let source: string;
  try {
    source = await readFile(absolutePath, "utf8");
  } catch (err) {
    // Surface a precise error in the function logs so a future
    // regression (e.g. someone removes the file-tracing include) is
    // immediately diagnosable instead of showing as a blank 500.
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to read legal document markdown for "${doc.slug}" at ${absolutePath}: ${cause}`,
      { cause: err },
    );
  }

  const filled = applyLegalSubstitutions(source, doc);
  marked.setOptions({ gfm: true, breaks: false });
  const rawHtml = marked.parse(filled, { async: false }) as string;
  // The markdown source is first-party today, but `dangerouslySetInnerHTML`
  // is exactly the kind of code path that turns into an XSS sink the moment
  // anyone pipes user content through it. Sanitise unconditionally so a
  // future edit (e.g. allowing per-firm legal addenda from the dashboard)
  // can't accidentally bypass this.
  const safe = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
  });

  htmlCache.set(doc.slug, safe);
  return safe;
}

export default async function LegalDocumentPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = findLegalDocument(slug);
  if (!doc) notFound();

  const html = await loadDocumentHtml(doc);

  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-secondary/20">
        <div className="container flex flex-wrap items-end justify-between gap-4 py-10">
          <div className="space-y-2">
            <Link
              href="/legal"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> All legal documents
            </Link>
            <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              {doc.title}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">{doc.description}</p>
          </div>
          <Button asChild variant="outline">
            <a href={`/legal/${doc.slug}.pdf`} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" /> Download PDF
            </a>
          </Button>
        </div>
      </section>

      <section className="container py-12">
        <article
          className="legal-prose mx-auto max-w-3xl"
          // The `html` value is rendered server-side from first-party
          // markdown and is sanitised via DOMPurify in `loadDocumentHtml`
          // above (script/style/iframe/event-handler attrs are stripped).
          // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </section>
    </MarketingShell>
  );
}
