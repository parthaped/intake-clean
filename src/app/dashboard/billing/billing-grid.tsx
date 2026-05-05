"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { CancelSubscriptionDialog } from "@/components/cancel-subscription-dialog";
import { PricingCard } from "@/components/pricing-card";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/constants";
import {
  openPortalAction,
  resumeSubscriptionAction,
  startCheckoutAction,
} from "@/app/dashboard/billing/billing-actions";
import type { PlanTier } from "@/types/database";

interface BillingGridProps {
  currentPlan: PlanTier;
  hasStripeCustomer: boolean;
  hasActiveSubscription: boolean;
  cancelAtPeriodEnd: boolean;
  /** ISO timestamp of when access ends if cancelAtPeriodEnd is true. */
  accessEndsAt: string | null;
  stripeConfigured: boolean;
  /**
   * Tiers that have a Stripe price ID wired up. Tiers not in this list will
   * have their CTA disabled even when Stripe itself is configured, since
   * checkout would otherwise fail with "No Stripe price ID configured".
   */
  configuredTiers?: PlanTier[];
}

function formatAccessEndsAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function BillingGrid({
  currentPlan,
  hasStripeCustomer,
  hasActiveSubscription,
  cancelAtPeriodEnd,
  accessEndsAt,
  stripeConfigured,
  configuredTiers,
}: BillingGridProps) {
  const router = useRouter();
  const [pendingPortal, startPortalTransition] = useTransition();
  const [pendingResume, startResumeTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const enabledTiers = new Set<PlanTier>(configuredTiers ?? []);

  const accessEndsLabel = formatAccessEndsAt(accessEndsAt);

  function handleManage() {
    startPortalTransition(async () => {
      const result = await openPortalAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.url) window.location.href = result.url;
    });
  }

  function handleResume() {
    startResumeTransition(async () => {
      const result = await resumeSubscriptionAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Subscription resumed", {
        description:
          "Welcome back. Billing will continue on the next renewal date.",
      });
      router.refresh();
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
            ? "Switch plans, update payment details, or cancel below. Cancelling stops the next charge immediately and keeps access until the period ends."
            : "Stripe is not configured. Plans render here for demo purposes; checkout will return a friendly error until STRIPE_SECRET_KEY is set."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasStripeCustomer && (
            <Button
              variant="outline"
              onClick={handleManage}
              disabled={pendingPortal}
            >
              {pendingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Manage in Stripe
            </Button>
          )}
          {hasActiveSubscription && !cancelAtPeriodEnd && (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              Cancel subscription
            </Button>
          )}
        </div>
      </div>

      {cancelAtPeriodEnd && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div>
            <p className="font-medium">Subscription ending</p>
            <p className="text-amber-800/80">
              {accessEndsLabel
                ? `Your subscription is set to end on ${accessEndsLabel}. You have full access until then.`
                : "Your subscription is set to end at the end of the current period. You have full access until then."}
            </p>
          </div>
          <Button
            variant="outline"
            className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            onClick={handleResume}
            disabled={pendingResume}
          >
            {pendingResume ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Resume subscription
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const tierConfigured = configuredTiers === undefined || enabledTiers.has(plan.tier);
          return (
            <PricingCard
              key={plan.tier}
              plan={plan}
              current={plan.tier === currentPlan && hasActiveSubscription}
              onCheckout={handleCheckout}
              disabled={!stripeConfigured || !tierConfigured}
              ctaLabel={
                stripeConfigured && !tierConfigured ? "Price not configured" : undefined
              }
            />
          );
        })}
      </div>

      <CancelSubscriptionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onCancelled={() => router.refresh()}
      />
    </div>
  );
}
