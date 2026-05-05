import "server-only";

import type Stripe from "stripe";

import { recordAudit } from "@/lib/audit";
import { PLAN_BY_TIER } from "@/lib/constants";
import { tierForPriceId } from "@/lib/stripe/plans";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PlanTier, SubscriptionStatusT } from "@/types/database";

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatusT {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "canceled";
    case "unpaid":
      return "past_due";
    case "paused":
      return "inactive";
    default:
      return "inactive";
  }
}

async function findOrgByCustomer(customerId: string) {
  const service = getServiceSupabase();
  const { data } = await service
    .from("organizations")
    .select("id, stripe_customer_id, storage_limit_mb")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data;
}

/**
 * Resolves the plan tier from a Stripe subscription. Returns `null` when
 * neither the explicit metadata nor the price-id lookup can place the
 * subscription into a known tier — callers MUST treat this as "do not change
 * the org's plan" rather than silently downgrading the customer.
 *
 * The `?? "starter"` fallback we used to rely on bit us when an operator
 * rotated the `STRIPE_PRICE_*` env vars: every paying customer's plan got
 * reset to starter on the next webhook.
 */
function resolveTier(subscription: Stripe.Subscription): PlanTier | null {
  const metadataTier = subscription.metadata?.tier;
  if (metadataTier && ["starter", "solo", "firm"].includes(metadataTier)) {
    return metadataTier as PlanTier;
  }
  const priceId = subscription.items.data[0]?.price.id;
  if (priceId) {
    const fromPrice = tierForPriceId(priceId);
    if (fromPrice) return fromPrice;
  }
  return null;
}

async function applySubscription(subscription: Stripe.Subscription) {
  const service = getServiceSupabase();
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  let organizationId = subscription.metadata?.organization_id ?? null;
  if (!organizationId) {
    const org = await findOrgByCustomer(customerId);
    if (org) organizationId = org.id;
  }
  if (!organizationId) {
    console.warn("[stripe-webhook] No organization found for customer", customerId);
    return;
  }

  const tier = resolveTier(subscription);
  const status = mapStatus(subscription.status);

  // Stripe gives us `current_period_end` as a unix timestamp (seconds).
  // We store it as ISO so the billing UI can render "Access ends Mar 31"
  // without a round-trip to Stripe and so cancel_at_period_end + the
  // matching end date stay in sync from the same webhook payload.
  const currentPeriodEndIso = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  // Build the update set explicitly. We only touch `plan` / `storage_limit_mb`
  // when we actually resolved a tier — otherwise we'd silently downgrade a
  // paying customer to "starter" because the price-id catalog drifted.
  const update: {
    subscription_status: SubscriptionStatusT;
    stripe_subscription_id: string;
    stripe_customer_id: string;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
    plan?: PlanTier;
    storage_limit_mb?: number;
  } = {
    subscription_status: status,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: currentPeriodEndIso,
  };
  if (tier) {
    update.plan = tier;
    update.storage_limit_mb = PLAN_BY_TIER[tier].storageMb;
  } else {
    console.warn(
      "[stripe-webhook] Could not resolve tier for subscription; leaving plan/storage untouched",
      { organizationId, subscriptionId: subscription.id, priceId: subscription.items.data[0]?.price.id ?? null },
    );
  }

  await service.from("organizations").update(update).eq("id", organizationId);

  await recordAudit({
    organizationId,
    actorProfileId: null,
    action: "billing.subscription_updated",
    entityType: "organization",
    entityId: organizationId,
    actorType: "system",
    metadata: {
      plan: tier ?? "unchanged",
      status,
      subscription_id: subscription.id,
      tier_resolved: Boolean(tier),
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_end: currentPeriodEndIso,
    },
  });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const service = getServiceSupabase();
  const organizationId =
    session.metadata?.organization_id ??
    (await findOrgByCustomer(typeof session.customer === "string" ? session.customer : session.customer?.id ?? ""))?.id;
  if (!organizationId) return;

  if (typeof session.customer === "string") {
    await service
      .from("organizations")
      .update({ stripe_customer_id: session.customer })
      .eq("id", organizationId);
  }
  if (session.subscription && typeof session.subscription === "string") {
    await service
      .from("organizations")
      .update({ stripe_subscription_id: session.subscription })
      .eq("id", organizationId);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const service = getServiceSupabase();
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const org = await findOrgByCustomer(customerId);
  if (!org) return;

  await service
    .from("organizations")
    .update({
      subscription_status: "canceled",
      stripe_subscription_id: null,
      // Period has fully ended — clear both flags so the UI doesn't keep
      // saying "Subscription ending Mar 31" indefinitely after the actual
      // end date passed.
      cancel_at_period_end: false,
      current_period_end: null,
    })
    .eq("id", org.id);

  await recordAudit({
    organizationId: org.id,
    actorProfileId: null,
    action: "billing.subscription_canceled",
    entityType: "organization",
    entityId: org.id,
    actorType: "system",
  });
}

/**
 * Idempotent dispatch. Stripe re-delivers events on transient receiver
 * failure; without dedupe we'd:
 *   - rewrite organizations.plan/storage_limit_mb (clobbering manual overrides),
 *   - emit duplicate audit rows,
 *   - re-run customer-id writes for checkout.session.completed.
 *
 * We INSERT into `stripe_processed_events` first. PG's unique constraint on
 * `event_id` is what makes this race-safe across concurrent deliveries —
 * only the first writer's INSERT succeeds, all later attempts hit 23505 and
 * short-circuit.
 */
export async function dispatchStripeEvent(event: Stripe.Event): Promise<void> {
  const service = getServiceSupabase();
  const { error } = await service
    .from("stripe_processed_events")
    .insert({ event_id: event.id, event_type: event.type });
  if (error) {
    if (error.code === "23505") {
      // Duplicate delivery — already handled.
      return;
    }
    // Anything else (table missing, permission denied) we want to know
    // about. Log and re-throw so the webhook returns 500 and Stripe retries.
    console.error("[stripe-webhook] could not record event for dedupe", {
      eventId: event.id,
      message: error.message,
    });
    throw new Error(error.message);
  }

  // If the handler throws, we must roll the dedupe row back so Stripe's
  // retry can re-process the event. Otherwise a transient handler failure
  // (e.g. Supabase blip during applySubscription) would silently drop the
  // event forever.
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        return;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await applySubscription(event.data.object as Stripe.Subscription);
        return;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        return;
      default:
        return;
    }
  } catch (handlerError) {
    const rollback = await service
      .from("stripe_processed_events")
      .delete()
      .eq("event_id", event.id);
    if (rollback.error) {
      console.error("[stripe-webhook] could not roll back dedupe row after handler failure", {
        eventId: event.id,
        message: rollback.error.message,
      });
    }
    throw handlerError;
  }
}
