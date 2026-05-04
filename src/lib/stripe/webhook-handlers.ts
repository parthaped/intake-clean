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
    .select("id, stripe_customer_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data;
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

  const priceId = subscription.items.data[0]?.price.id;
  let tier: PlanTier | undefined;
  if (subscription.metadata?.tier && ["starter", "solo", "firm"].includes(subscription.metadata.tier)) {
    tier = subscription.metadata.tier as PlanTier;
  } else if (priceId) {
    tier = tierForPriceId(priceId);
  }

  const status = mapStatus(subscription.status);
  const plan = tier ?? "starter";
  const planDef = PLAN_BY_TIER[plan];

  await service
    .from("organizations")
    .update({
      plan,
      subscription_status: status,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      storage_limit_mb: planDef.storageMb,
    })
    .eq("id", organizationId);

  await recordAudit({
    organizationId,
    actorProfileId: null,
    action: "billing.subscription_updated",
    entityType: "organization",
    entityId: organizationId,
    actorType: "system",
    metadata: { plan, status, subscription_id: subscription.id },
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

export async function dispatchStripeEvent(event: Stripe.Event) {
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
}
