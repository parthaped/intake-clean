import Link from "next/link";

import { MarketingShell } from "@/components/marketing-shell";
import { PricingCard } from "@/components/pricing-card";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/constants";

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="container space-y-10 py-20">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pricing</p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Simple plans for small firms.
          </h1>
          <p className="text-lg text-muted-foreground">
            Every plan includes the entire pipeline — quality checks, classification, packet
            generation, and the client portal. The differences are how many active matters and
            how much storage your firm needs.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <PricingCard key={plan.tier} plan={plan} ctaLabel="Start free trial" />
          ))}
        </div>
        <div className="text-center">
          <Button size="lg" asChild>
            <Link href="/signup">Create your firm account</Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
