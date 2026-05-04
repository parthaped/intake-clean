"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PricingCard } from "@/components/pricing-card";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/constants";
import { startCheckoutAction, openPortalAction } from "@/app/dashboard/billing/billing-actions";
import type { PlanTier } from "@/types/database";

interface BillingGridProps {
  currentPlan: PlanTier;
  hasStripeCustomer: boolean;
  stripeConfigured: boolean;
  /**
   * Tiers that have a Stripe price ID wired up. Tiers not in this list will
   * have their CTA disabled even when Stripe itself is configured, since
   * checkout would otherwise fail with "No Stripe price ID configured".
   */
  configuredTiers?: PlanTier[];
}

export function BillingGrid({
  currentPlan,
  hasStripeCustomer,
  stripeConfigured,
  configuredTiers,
}: BillingGridProps) {
  const [pending, startTransition] = useTransition();
  const enabledTiers = new Set<PlanTier>(configuredTiers ?? []);

  function handleManage() {
    startTransition(async () => {
      const result = await openPortalAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.url) window.location.href = result.url;
    });
  }

  async function handleCheckout(tier: PlanTier) {
    return startCheckoutAction(tier);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {stripeConfigured
            ? "Switch plans or update payment details from the Stripe customer portal."
            : "Stripe is not configured. Plans render here for demo purposes; checkout will return a friendly error until STRIPE_SECRET_KEY is set."}
        </p>
        {hasStripeCustomer && (
          <Button variant="outline" onClick={handleManage} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Manage in Stripe
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const tierConfigured = configuredTiers === undefined || enabledTiers.has(plan.tier);
          return (
            <PricingCard
              key={plan.tier}
              plan={plan}
              current={plan.tier === currentPlan}
              onCheckout={handleCheckout}
              disabled={!stripeConfigured || !tierConfigured}
              ctaLabel={
                stripeConfigured && !tierConfigured ? "Price not configured" : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
