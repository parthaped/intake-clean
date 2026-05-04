"use server";

import { requireSession } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { priceIdForTier } from "@/lib/stripe/plans";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PlanTier } from "@/types/database";

export async function startCheckoutAction(
  tier: PlanTier,
): Promise<{ url?: string; error?: string }> {
  const ctx = await requireSession();
  if (!integrations.hasStripe) {
    return {
      error:
        "Stripe is not configured. Set STRIPE_SECRET_KEY + price IDs in .env.local, or set DEV_BYPASS_BILLING=true to skip billing in development.",
    };
  }
  const priceId = priceIdForTier(tier);
  if (!priceId) {
    return { error: `No Stripe price ID configured for ${tier}.` };
  }

  const stripe = getStripe();
  const service = getServiceSupabase();
  let customerId = ctx.organization.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: ctx.organization.name,
      metadata: { organization_id: ctx.organization.id },
    });
    customerId = customer.id;
    await service
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", ctx.organization.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.appUrl}/dashboard/billing?session=success`,
    cancel_url: `${env.appUrl}/dashboard/billing?session=cancelled`,
    metadata: { organization_id: ctx.organization.id, tier },
    subscription_data: { metadata: { organization_id: ctx.organization.id, tier } },
  });
  return { url: session.url ?? undefined };
}

export async function openPortalAction(): Promise<{ url?: string; error?: string }> {
  const ctx = await requireSession();
  if (!integrations.hasStripe) return { error: "Stripe is not configured" };
  if (!ctx.organization.stripe_customer_id) {
    return { error: "No Stripe customer for this org yet. Start checkout first." };
  }
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: ctx.organization.stripe_customer_id,
    return_url: `${env.appUrl}/dashboard/billing`,
  });
  return { url: session.url };
}
