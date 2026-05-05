"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

import { cn } from "@/lib/utils";

interface AnimatedStatProps {
  value: number;
  /** Number of decimal places to display. */
  decimals?: number;
  /** Prefix shown before the number (e.g., "$"). */
  prefix?: string;
  /** Suffix shown after the number (e.g., "%", "×", " sec"). */
  suffix?: string;
  /** Label rendered under the value. */
  label: string;
  /** Optional small caption rendered below the label. */
  caption?: string;
  /** Animation duration in ms. */
  durationMs?: number;
  className?: string;
}

export function AnimatedStat({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  label,
  caption,
  durationMs = 1400,
  className,
}: AnimatedStatProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, durationMs]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-6 text-center shadow-soft",
        className,
      )}
    >
      <p className="font-sans text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        {prefix}
        {formatted}
        {suffix}
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">{label}</p>
      {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
    </motion.div>
  );
}

export function AnimatedStatBand() {
  return (
    <section className="border-y border-border/60 bg-secondary/20 py-16">
      <div className="container space-y-8">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            By the numbers
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            What firms get back, on day one.
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <AnimatedStat
            value={4.2}
            decimals={1}
            suffix=" hrs"
            label="Saved per matter"
            caption="vs. manual cleanup, based on a 25-document immigration packet"
          />
          <AnimatedStat
            value={98}
            suffix="%"
            label="Auto-classified"
            caption="across 18 supported document types"
          />
          <AnimatedStat
            value={0}
            suffix=" logins"
            label="Required from clients"
            caption="One private upload link, no portal accounts"
          />
          <AnimatedStat
            value={50}
            prefix="$"
            label="Per month, all in"
            caption="Starter plan, cancel any time"
          />
        </div>
      </div>
    </section>
  );
}
