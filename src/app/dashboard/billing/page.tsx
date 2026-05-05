import { CalendarClock, CreditCard, Database, Folder } from "lucide-react";

import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessionWithMfa } from "@/lib/auth";
import { checkMatterQuota } from "@/lib/billing";
import { PLAN_BY_TIER, PLANS } from "@/lib/constants";
import { env, integrations } from "@/lib/env";
import { priceIdForTier } from "@/lib/stripe/plans";

import { BillingGrid } from "@/app/dashboard/billing/billing-grid";
import { BillingSessionToast } from "@/app/dashboard/billing/billing-session-toast";

function humanStatus(status: string) {
  return status.replaceAll("_", " ");
}

function maskedSubscriptionId(id: string | null) {
  if (!id) return "Not linked yet";
  return `Linked · …${id.slice(-6)}`;
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

export default async function BillingPage() {
  const ctx = await requireSessionWithMfa();
  const quota = await checkMatterQuota({
    organizationId: ctx.organization.id,
    plan: ctx.organization.plan,
    status: ctx.organization.subscription_status,
  });
  // Defensive fallback: if the DB ever drifts from the PlanTier union we'd
  // crash on `.name`/`.storageGb` below. Default to the lowest tier so the
  // page still renders and the user can pick a plan.
  const planDef = PLAN_BY_TIER[ctx.organization.plan] ?? PLAN_BY_TIER.starter;

  const configuredTiers = integrations.hasStripe
    ? PLANS.filter((p) => Boolean(priceIdForTier(p.tier))).map((p) => p.tier)
    : [];

  const mattersOverLimit = quota.matters.used >= quota.matters.limit;
  const storageOverLimit = quota.storage.usedMb >= quota.storage.limitMb;
  // When DEV_BYPASS_BILLING is on the badge promises checks pass, so don't
  // contradict it with a warning intent on the matters card.
  const showMattersWarning = mattersOverLimit && !env.devBypassBilling;

  const subscriptionStatus = humanStatus(ctx.organization.subscription_status);
  const subscriptionActive =
    ctx.organization.subscription_status === "active" ||
    ctx.organization.subscription_status === "trialing";
  const cancelAtPeriodEnd = ctx.organization.cancel_at_period_end ?? false;
  const accessEndsAtIso = ctx.organization.current_period_end ?? null;
  const accessEndsAtLabel = formatAccessEndsAt(accessEndsAtIso);

  const storageUsedLabel = `${quota.storage.usedMb} MB`;

  return (
    <div className="space-y-6">
      <BillingSessionToast />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Billing & plan</h1>
          <p className="text-muted-foreground">
            You are on the <span className="font-medium text-foreground">{planDef.name}</span> plan ·{" "}
            <span className="capitalize">{subscriptionStatus}</span>
          </p>
        </div>
        {env.devBypassBilling && (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
            DEV_BYPASS_BILLING is on — all entitlement checks pass
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          Icon={Folder}
          label="Active matters"
          value={`${quota.matters.used} / ${quota.matters.limit}`}
          trend={
            mattersOverLimit
              ? "At plan limit — archive or upgrade"
              : `Up to ${quota.matters.limit} included`
          }
          intent={showMattersWarning ? "warning" : "default"}
        />
        <StatCard
          Icon={Database}
          label="Storage used"
          value={storageUsedLabel}
          trend={
            storageOverLimit
              ? "Over plan limit — archive matters or upgrade"
              : `Limit ${planDef.storageGb} GB`
          }
          intent={storageOverLimit && !env.devBypassBilling ? "warning" : "default"}
        />
        {cancelAtPeriodEnd ? (
          <StatCard
            Icon={CalendarClock}
            label="Access ends"
            value={accessEndsAtLabel ?? "End of period"}
            trend="No further charges. Resume below to continue."
            intent="warning"
          />
        ) : (
          <StatCard
            Icon={CreditCard}
            label="Subscription"
            value={subscriptionStatus}
            trend={maskedSubscriptionId(ctx.organization.stripe_subscription_id)}
            intent={subscriptionActive ? "success" : "default"}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose a plan</CardTitle>
        </CardHeader>
        <CardContent>
          <BillingGrid
            currentPlan={ctx.organization.plan}
            hasStripeCustomer={Boolean(ctx.organization.stripe_customer_id)}
            hasActiveSubscription={subscriptionActive}
            cancelAtPeriodEnd={cancelAtPeriodEnd}
            accessEndsAt={accessEndsAtIso}
            stripeConfigured={integrations.hasStripe}
            configuredTiers={configuredTiers}
          />
        </CardContent>
      </Card>
    </div>
  );
}
