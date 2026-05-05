import { NextResponse } from "next/server";

import { requireStepUpReauth } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { priceIdForTier } from "@/lib/stripe/plans";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PlanTier } from "@/types/database";

export async function POST(request: Request) {
  const ctx = await requireStepUpReauth();
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
    // Only persist the customer id if the org row STILL has no customer.
    // Two concurrent admins clicking "Upgrade" both pass the `!customerId`
    // check, both create a Stripe customer, and the second update used to
    // overwrite the first — leaking one orphan customer into Stripe.
    // The conditional `.is("stripe_customer_id", null)` filter ensures
    // only the first writer wins. If the second writer's update returns
    // zero rows, we discard the customer we just created.
    const { data: claimed, error: claimError } = await service
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", ctx.organization.id)
      .is("stripe_customer_id", null)
      .select("stripe_customer_id");
    if (claimError) {
      console.error("[stripe-checkout] could not persist customer", claimError);
      return new NextResponse("Could not persist Stripe customer", { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
      // Another writer beat us. Throw away our orphan and re-read whichever
      // customer id won. We deliberately don't fail the checkout — we hand
      // the user over to the existing customer.
      try {
        await stripe.customers.del(customer.id);
      } catch (deleteError) {
        console.warn("[stripe-checkout] could not delete orphan customer", {
          customerId: customer.id,
          deleteError,
        });
      }
      const { data: refetched } = await service
        .from("organizations")
        .select("stripe_customer_id")
        .eq("id", ctx.organization.id)
        .maybeSingle();
      customerId = refetched?.stripe_customer_id ?? null;
      if (!customerId) {
        return new NextResponse("Could not resolve Stripe customer", { status: 500 });
      }
    }
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
