"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  Cpu,
  ImageDown,
  ScanText,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Stage {
  key: string;
  label: string;
  blurb: string;
  icon: typeof ImageDown;
  cost: string;
  external: boolean;
}

const STAGES: Stage[] = [
  {
    key: "preprocess",
    label: "Layer 1 · Preprocess",
    blurb: "HEIC → JPEG, deskew, exposure, orientation",
    icon: ImageDown,
    cost: "$0",
    external: false,
  },
  {
    key: "ocr",
    label: "Layer 2 · Local OCR",
    blurb: "Tesseract on the application server",
    icon: ScanText,
    cost: "$0",
    external: false,
  },
  {
    key: "rules",
    label: "Layer 3 · Rule-based",
    blurb: "Document type + quality score + reason codes",
    icon: Cpu,
    cost: "$0",
    external: false,
  },
  {
    key: "ai",
    label: "Layer 4 · AI escalation",
    blurb: "Optional, only when confidence < threshold",
    icon: Brain,
    cost: "≈ $0.0004",
    external: true,
  },
];

const DECISIONS = [
  {
    name: "passport.heic",
    finalLayer: 2,
    label: "Government ID",
    confidence: 0.97,
  },
  {
    name: "marriage.jpg",
    finalLayer: 3,
    label: "Marriage Certificate",
    confidence: 0.62,
  },
  {
    name: "birth.png",
    finalLayer: 2,
    label: "Birth Certificate",
    confidence: 0.94,
  },
  {
    name: "statement.pdf",
    finalLayer: 2,
    label: "Bank Statement",
    confidence: 0.91,
  },
];

const CYCLE_MS = 700;

export function PipelineDemo() {
  const [activeStage, setActiveStage] = useState(0);
  const [decisionIdx, setDecisionIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveStage((prev) => {
        const decision = DECISIONS[decisionIdx]!;
        if (prev >= decision.finalLayer) {
          setDecisionIdx((d) => (d + 1) % DECISIONS.length);
          return 0;
        }
        return prev + 1;
      });
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [decisionIdx]);

  const decision = DECISIONS[decisionIdx]!;
  const finished = activeStage >= decision.finalLayer;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-6 p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              The pipeline
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
              Cost-aware AI escalation, layer by layer
            </h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Every uploaded document moves through deterministic stages first.
              We only escalate to a paid AI provider when local rules can't
              decide — and never if the firm has it disabled.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5 self-start">
            <Sparkles className="h-3.5 w-3.5 text-accent" /> Patent pending
          </Badge>
        </div>

        <div className="rounded-2xl border border-border/70 bg-secondary/30 p-4">
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Now processing{" "}
              <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {decision.name}
              </code>
            </span>
            <AnimatePresence mode="wait">
              {finished ? (
                <motion.span
                  key="done"
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-1 text-success"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Classified as{" "}
                  <strong className="font-medium">{decision.label}</strong> ·{" "}
                  {(decision.confidence * 100).toFixed(0)}% confidence
                </motion.span>
              ) : (
                <motion.span
                  key="working"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  Working…
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {STAGES.map((stage, i) => {
              const isActive = activeStage === i && !finished;
              const isPast = activeStage > i || (finished && i <= decision.finalLayer);
              const isSkipped = finished && i > decision.finalLayer;
              return (
                <StageCard
                  key={stage.key}
                  stage={stage}
                  isActive={isActive}
                  isPast={isPast}
                  isSkipped={isSkipped}
                />
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              icon: Cpu,
              title: "Tenant-configurable",
              body: "Each firm sets its own provider, escalation threshold, and document vocabulary.",
            },
            {
              icon: Brain,
              title: "Threshold-gated",
              body: "Layer 4 fires only when confidence is below the firm's threshold — never by default.",
            },
            {
              icon: Sparkles,
              title: "Mock-mode parity",
              body: "Every external integration has an in-process mock so you can demo with zero subprocessors.",
            },
          ].map((b) => (
            <div
              key={b.title}
              className="rounded-xl border border-border/70 bg-card/60 p-4"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <b.icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-medium">{b.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{b.body}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StageCard({
  stage,
  isActive,
  isPast,
  isSkipped,
}: {
  stage: Stage;
  isActive: boolean;
  isPast: boolean;
  isSkipped: boolean;
}) {
  const Icon = stage.icon;
  return (
    <motion.div
      animate={{
        opacity: isSkipped ? 0.45 : 1,
        scale: isActive ? 1.02 : 1,
      }}
      transition={{ duration: 0.3 }}
      className={
        "relative overflow-hidden rounded-xl border bg-card p-4 " +
        (isActive
          ? "border-accent shadow-[0_0_0_3px_hsl(var(--accent)/0.15)]"
          : isPast
            ? "border-border/80"
            : "border-border/60")
      }
    >
      <AnimatePresence>
        {isActive && (
          <motion.div
            key="sweep"
            className="pointer-events-none absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-transparent via-accent/15 to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 1.2,
              ease: "linear",
              repeat: Infinity,
            }}
          />
        )}
      </AnimatePresence>

      <div className="relative flex items-start justify-between gap-2">
        <span
          className={
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors " +
            (isPast || isActive
              ? "bg-accent/15 text-accent"
              : isSkipped
                ? "bg-secondary text-muted-foreground"
                : "bg-primary/10 text-primary")
          }
        >
          {isPast && !isActive ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {stage.cost}
        </span>
      </div>
      <p className="relative mt-3 text-xs font-semibold">{stage.label}</p>
      <p className="relative mt-1 text-xs text-muted-foreground">{stage.blurb}</p>
      <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={false}
          animate={{ width: isPast ? "100%" : isActive ? "70%" : "0%" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      {isSkipped && (
        <p className="relative mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Skipped — confidence already met
        </p>
      )}
    </motion.div>
  );
}
