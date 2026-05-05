import { NextResponse } from "next/server";

import { requireStepUpReauth } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";

export async function POST() {
  const ctx = await requireStepUpReauth();
  if (!integrations.hasStripe) {
    return new NextResponse("Stripe is not configured", { status: 503 });
  }
  if (!ctx.organization.stripe_customer_id) {
    return new NextResponse("No Stripe customer for this org yet", { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: ctx.organization.stripe_customer_id,
    return_url: `${env.appUrl}/dashboard/billing`,
  });

  return NextResponse.json({ url: session.url });
}
