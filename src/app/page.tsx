import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileScan,
  FileSpreadsheet,
  ImageDown,
  MessageSquareText,
  Scale,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import { MarketingShell } from "@/components/marketing-shell";
import { PricingCard } from "@/components/pricing-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PLANS } from "@/lib/constants";

export default function HomePage() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden">
        <div className="container grid gap-10 py-20 md:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary">
              Built for small law firms
            </Badge>
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
              Stop cleaning up client screenshots and blurry document photos.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              IntakeClean gives clients one private upload link. Their documents arrive labeled,
              checked for quality, and packaged as a clean PDF or organized folder — ready for your
              case file.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Start cleaning documents <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {[
                "No account needed for clients",
                "HEIC and screenshot friendly",
                "Quality checks before review",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 rounded-[3rem] bg-primary/5 blur-2xl" aria-hidden />
            <Card className="relative overflow-hidden border-border/70 shadow-soft">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileScan className="h-4 w-4 text-primary" /> Garcia v. USCIS · Immigration packet
                </div>
                <div className="grid gap-2 text-sm">
                  {[
                    { label: "Government ID — passport", status: "Accepted" },
                    { label: "Marriage certificate", status: "Needs re-upload" },
                    { label: "Bank statements (3 months)", status: "Processing" },
                    { label: "Birth certificate (translated)", status: "Accepted" },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-card/60 px-3 py-2"
                    >
                      <span>{row.label}</span>
                      <Badge variant="outline" className="text-xs">
                        {row.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Section
        eyebrow="The problem"
        title="Client documents arrive as a chaotic mess."
        description="Photos taken at angles, screenshots of screenshots, HEIC files Outlook refuses to open, and emails with twelve attachments. Paralegals spend hours just untangling intake before real work begins."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "Blurry photos with cut-off corners",
            "iPhone HEIC files no one can preview",
            "Screenshots of screenshots — pixelated",
            "Renamed files like IMG_4837.JPG",
            "Documents missing a page",
            "Wrong document, ten times in a row",
          ].map((item) => (
            <Card key={item} className="border-dashed bg-card/50">
              <CardContent className="p-4 text-sm text-muted-foreground">{item}</CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="How it works"
        title="One link in. A clean packet out."
        description="A guided client portal collects what's needed, runs every file through automated cleanup, and your team only sees what genuinely needs attention."
      >
        <div className="grid gap-4 md:grid-cols-4">
          {[
            {
              icon: MessageSquareText,
              title: "Send a private link",
              body: "Email or SMS the client a checklist tailored to the matter — no logins required.",
            },
            {
              icon: ImageDown,
              title: "Auto-clean uploads",
              body: "Rotate, deskew, convert HEIC, generate thumbnails, count pages, flag screenshots.",
            },
            {
              icon: Sparkles,
              title: "Quality + classification",
              body: "AI checks for blur, glare, cut-off edges, and labels each document.",
            },
            {
              icon: FileSpreadsheet,
              title: "Export clean packet",
              body: "Download a PDF packet, organized ZIP folder, and a missing-docs report.",
            },
          ].map((step) => (
            <Card key={step.title}>
              <CardContent className="space-y-3 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <step.icon className="h-5 w-5" />
                </span>
                <p className="font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Built for"
        title="Small firms drowning in client intake."
        description="If your team is two paralegals and one attorney handling immigration, family law, personal injury, probate, or real estate matters — this is for you."
      >
        <div className="grid gap-3 md:grid-cols-5">
          {["Immigration", "Family law", "Personal injury", "Probate / estate", "Real estate"].map(
            (area) => (
              <Card key={area}>
                <CardContent className="flex items-center gap-2 p-4 text-sm font-medium">
                  <Scale className="h-4 w-4 text-primary" /> {area}
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </Section>

      <Section
        eyebrow="What you get"
        title="Three deliverables, every matter."
        description="Stop reassembling deliverables by hand. Every matter exports the same three artifacts in seconds."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: FileSpreadsheet,
              title: "Clean PDF packet",
              body: "Cover page, page numbers, dividers per document type, all processed images and PDFs combined.",
            },
            {
              icon: Workflow,
              title: "Organized ZIP folder",
              body: "Named folders like '01 Government ID' with files renamed LastName_DocType_YYYY-MM-DD.pdf.",
            },
            {
              icon: ShieldCheck,
              title: "Missing documents report",
              body: "Plain-English summary of items still needed and why earlier uploads need a retake.",
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardContent className="space-y-3 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </span>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Pricing"
        title="Start small. Grow with the firm."
        description="Every plan includes the full cleanup pipeline — only matter and storage caps differ."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <PricingCard key={plan.tier} plan={plan} ctaLabel="Start free trial" />
          ))}
        </div>
        <div className="mt-6 text-center">
          <Button asChild size="lg">
            <Link href="/signup">Create your firm account</Link>
          </Button>
        </div>
      </Section>
    </MarketingShell>
  );
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border/60 bg-background py-20">
      <div className="container space-y-8">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
          <p className="text-base text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
