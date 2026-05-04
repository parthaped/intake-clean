import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { priceIdForTier } from "@/lib/stripe/plans";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PlanTier } from "@/types/database";

export async function POST(request: Request) {
  const ctx = await requireSession();
  const body = await request.json().catch(() => ({}));
  const tier = body.tier as PlanTier | undefined;
  if (!tier || !["starter", "solo", "firm"].includes(tier)) {
    return new NextResponse("Invalid plan tier", { status: 400 });
  }

  if (!integrations.hasStripe) {
    return new NextResponse(
      "Stripe is not configured. Set STRIPE_SECRET_KEY and price IDs in .env.local, or set DEV_BYPASS_BILLING=true to skip billing in development.",
      { status: 503 },
    );
  }

  const priceId = priceIdForTier(tier);
  if (!priceId) {
    return new NextResponse(`No Stripe price ID configured for ${tier} plan`, { status: 503 });
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
    subscription_data: {
      metadata: { organization_id: ctx.organization.id, tier },
    },
  });

  return NextResponse.json({ url: session.url });
}
