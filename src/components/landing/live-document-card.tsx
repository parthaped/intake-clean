"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  FileScan,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type DocStatus = "uploaded" | "processing" | "needs_reupload" | "accepted";

interface DocState {
  label: string;
  type: string;
  status: DocStatus;
  reason?: string;
}

const SCRIPT: DocState[][] = [
  [
    { label: "Government ID — passport.heic", type: "Government ID", status: "uploaded" },
    { label: "Marriage certificate.jpg", type: "Marriage Certificate", status: "uploaded" },
    { label: "Bank statement Mar 2026.pdf", type: "Bank Statement", status: "uploaded" },
    { label: "Birth certificate.png", type: "Birth Certificate", status: "uploaded" },
  ],
  [
    { label: "Government ID — passport.heic", type: "Government ID", status: "processing" },
    { label: "Marriage certificate.jpg", type: "Marriage Certificate", status: "processing" },
    { label: "Bank statement Mar 2026.pdf", type: "Bank Statement", status: "processing" },
    { label: "Birth certificate.png", type: "Birth Certificate", status: "processing" },
  ],
  [
    { label: "Government ID — passport.heic", type: "Government ID", status: "accepted" },
    {
      label: "Marriage certificate.jpg",
      type: "Marriage Certificate",
      status: "needs_reupload",
      reason: "Page 2 cut off",
    },
    { label: "Bank statement Mar 2026.pdf", type: "Bank Statement", status: "processing" },
    { label: "Birth certificate.png", type: "Birth Certificate", status: "accepted" },
  ],
  [
    { label: "Government ID — passport.heic", type: "Government ID", status: "accepted" },
    {
      label: "Marriage certificate.jpg",
      type: "Marriage Certificate",
      status: "needs_reupload",
      reason: "Page 2 cut off",
    },
    { label: "Bank statement Mar 2026.pdf", type: "Bank Statement", status: "accepted" },
    { label: "Birth certificate.png", type: "Birth Certificate", status: "accepted" },
  ],
];

const STEP_LABELS = ["Uploaded", "Processing", "Quality check", "Ready for review"];

export function LiveDocumentCard() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (paused) return;
    intervalRef.current = setInterval(() => {
      setStep((s) => (s + 1) % SCRIPT.length);
    }, 2400);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused]);

  const docs = SCRIPT[step] ?? SCRIPT[0]!;
  const accepted = docs.filter((d) => d.status === "accepted").length;
  const total = docs.length;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute -inset-6 rounded-[3rem] bg-primary/5 blur-2xl" aria-hidden />
      <Card className="relative overflow-hidden border-border/70 shadow-soft">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileScan className="h-4 w-4 text-primary" /> Garcia v. USCIS · Immigration packet
            </div>
            <Badge variant="primary" className="gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              Live
            </Badge>
          </div>

          <StepIndicator currentStep={step} />

          <div className="grid gap-2 text-sm">
            <AnimatePresence initial={false} mode="popLayout">
              {docs.map((doc) => (
                <motion.div
                  key={doc.label}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-card/60 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{doc.label}</span>
                  </div>
                  <StatusPill status={doc.status} reason={doc.reason} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              {accepted} of {total} accepted into packet
            </span>
            <button
              type="button"
              onClick={() => setStep(0)}
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
              aria-label="Restart preview"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Replay
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {STEP_LABELS.map((label, i) => {
        const isDone = i < currentStep;
        const isActive = i === currentStep;
        return (
          <div key={label} className="space-y-1.5">
            <div className="relative h-1 overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                initial={false}
                animate={{ width: isDone ? "100%" : isActive ? "60%" : "0%" }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <p
              className={
                "text-[10px] font-medium uppercase tracking-wider " +
                (isActive
                  ? "text-foreground"
                  : isDone
                    ? "text-accent"
                    : "text-muted-foreground")
              }
            >
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status, reason }: { status: DocStatus; reason?: string }) {
  if (status === "uploaded") {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <FileText className="h-3 w-3" /> Uploaded
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge variant="info" className="gap-1 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" /> Processing
      </Badge>
    );
  }
  if (status === "needs_reupload") {
    return (
      <Badge variant="warning" className="gap-1 text-xs" title={reason}>
        <RefreshCw className="h-3 w-3" /> {reason ?? "Re-upload"}
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="gap-1 text-xs">
      <CheckCircle2 className="h-3 w-3" /> Accepted
    </Badge>
  );
}
