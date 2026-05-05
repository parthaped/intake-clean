"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Workflow,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "pdf", label: "PDF packet", Icon: FileSpreadsheet },
  { value: "zip", label: "ZIP folder", Icon: Workflow },
  { value: "report", label: "Missing-docs report", Icon: AlertTriangle },
] as const;

export function DeliverablesTabs() {
  const [value, setValue] = useState<(typeof TABS)[number]["value"]>("pdf");

  return (
    <Tabs value={value} onValueChange={(v) => setValue(v as typeof value)} className="space-y-6">
      <TabsList className="h-11 w-full max-w-xl">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="flex-1 gap-2">
            <t.Icon className="h-4 w-4" /> {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="pdf" className="mt-0">
        <PdfPreview />
      </TabsContent>
      <TabsContent value="zip" className="mt-0">
        <ZipPreview />
      </TabsContent>
      <TabsContent value="report" className="mt-0">
        <ReportPreview />
      </TabsContent>
    </Tabs>
  );
}

function PreviewShell({ children, footer }: { children: React.ReactNode; footer: string }) {
  return (
    <motion.div
      key={Math.random()}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft"
    >
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-secondary/40 px-4 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        <span className="ml-3 text-xs font-mono text-muted-foreground">{footer}</span>
      </div>
      <div className="p-6">{children}</div>
    </motion.div>
  );
}

function PdfPreview() {
  return (
    <PreviewShell footer="Garcia_v_USCIS_packet.pdf · 24 pages">
      <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3 rounded-xl border border-dashed border-border bg-secondary/30 p-5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cover page
          </p>
          <p className="text-lg font-semibold tracking-tight">
            Garcia v. USCIS — Immigration packet
          </p>
          <p className="text-muted-foreground">
            Prepared by Garcia Immigration Law · 2026-05-04
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>1. Government ID — passport</li>
            <li>2. Marriage certificate</li>
            <li>3. Birth certificate (translated)</li>
            <li>4. Bank statements (Mar 2026)</li>
          </ul>
        </div>
        <div className="space-y-2">
          {[
            "01 Government ID — passport (deskewed, HEIC → PDF)",
            "02 Marriage certificate — page 1 of 1",
            "03 Birth certificate (translated) — Spanish + English",
            "04 Bank statement — March 2026, redacted account #",
          ].map((row, i) => (
            <div
              key={row}
              className="flex items-center gap-3 rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-sm"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 font-mono text-xs text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{row}</span>
            </div>
          ))}
        </div>
      </div>
    </PreviewShell>
  );
}

function ZipPreview() {
  const tree: Array<{ folder: string; files: string[] }> = [
    {
      folder: "01 Government ID",
      files: [
        "Garcia_Passport_2026-05-04.pdf",
        "Garcia_BirthCertificate_2026-05-04.pdf",
        "Garcia_MarriageCert_2026-05-04.pdf",
      ],
    },
    {
      folder: "02 Financial Records",
      files: ["Garcia_BankStatement_2026-03.pdf", "Garcia_PayStub_2026-04.pdf"],
    },
    {
      folder: "04 Evidence",
      files: ["Garcia_Photos_2026-05-04.zip"],
    },
  ];
  return (
    <PreviewShell footer="Garcia_v_USCIS.zip · 6.4 MB">
      <div className="space-y-3 font-mono text-sm">
        {tree.map((group) => (
          <div key={group.folder} className="rounded-lg border border-border/70 bg-secondary/20 p-3">
            <div className="flex items-center gap-2 text-foreground">
              <FolderOpen className="h-4 w-4 text-accent" />
              <span className="font-semibold">{group.folder}/</span>
            </div>
            <ul className="mt-2 space-y-1 pl-6 text-xs text-muted-foreground">
              {group.files.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-card/60 p-3 text-xs text-muted-foreground">
          <Folder className="h-4 w-4" /> Files renamed{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5 text-foreground">
            LastName_DocType_YYYY-MM-DD.pdf
          </code>
        </div>
      </div>
    </PreviewShell>
  );
}

function ReportPreview() {
  return (
    <PreviewShell footer="Garcia_v_USCIS_missing_docs.md">
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border border-border/70 bg-secondary/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Still needed from client
          </p>
          <ul className="mt-2 space-y-2">
            <Item
              tone="warning"
              title="Marriage certificate — page 2"
              detail="The bottom of page 2 was cut off. Please retake the photo with the entire page in frame."
            />
            <Item
              tone="warning"
              title="Bank statement — January 2026"
              detail="Three months were requested; only February and March were received."
            />
          </ul>
        </div>
        <div className="rounded-lg border border-success/30 bg-success/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-success">
            Accepted ({4})
          </p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {[
              "Government ID — passport",
              "Birth certificate (translated)",
              "Bank statement — February 2026",
              "Bank statement — March 2026",
            ].map((line) => (
              <li key={line} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PreviewShell>
  );
}

function Item({
  tone,
  title,
  detail,
}: {
  tone: "warning";
  title: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <AlertTriangle
        className={
          "mt-0.5 h-4 w-4 shrink-0 " + (tone === "warning" ? "text-warning" : "text-destructive")
        }
      />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}
