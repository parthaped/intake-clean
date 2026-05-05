import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Download, FileText, ShieldCheck } from "lucide-react";

import { MarketingShell } from "@/components/marketing-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "Legal — IntakeClean",
  description:
    "Public terms, policies, and disclosures for IntakeClean: Terms of Service, Privacy Policy, Data Processing Addendum, Acceptable Use, Subprocessors, AI Disclaimer, and Cookie Notice.",
  alternates: { canonical: "/legal" },
};

const orderedDocs = [...LEGAL_DOCUMENTS].sort((a, b) => a.order - b.order);

export default function LegalIndexPage() {
  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-secondary/20">
        <div className="container py-16 md:py-20">
          <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Public legal documents
          </Badge>
          <h1 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            Our terms, in plain text and as downloadable PDFs.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
            Every document below is published in two formats: a readable web page
            and a stable, downloadable PDF you can save, send to your privacy
            officer, or attach to a procurement review. The PDFs at
            {" "}
            <code className="rounded bg-card px-1.5 py-0.5 text-xs">/legal/&lt;slug&gt;.pdf</code>
            {" "}
            are durable URLs — feel free to link to them.
          </p>
        </div>
      </section>

      <section className="container py-12 md:py-16">
        <div className="grid gap-4 md:grid-cols-2">
          {orderedDocs.map((doc) => (
            <Card key={doc.slug} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </span>
                  <Badge variant="outline" className="text-xs">
                    Public
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-semibold tracking-tight">{doc.title}</h2>
                  <p className="text-sm text-muted-foreground">{doc.description}</p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  <Button asChild size="sm">
                    <Link href={`/legal/${doc.slug}`}>
                      Read <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/legal/${doc.slug}.pdf`} target="_blank" rel="noreferrer">
                      <Download className="h-4 w-4" /> Download PDF
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-10 border-dashed bg-card/50">
          <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">A note on these documents.</p>
            <p>
              These documents describe how IntakeClean operates and what we and
              our customers agree to. They are not legal advice for the firms
              and clients who use IntakeClean. If you have a question about how
              a specific clause applies to your matter, please contact your
              counsel.
            </p>
            <p>
              Spot something out of date or have a security or privacy concern?
              Email <Link className="underline" href="mailto:legal@intakeclean.com">legal@intakeclean.com</Link>.
            </p>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
