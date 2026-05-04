import { NextResponse } from "next/server";

import { env, integrations } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { dispatchStripeEvent } from "@/lib/stripe/webhook-handlers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!integrations.hasStripe || !env.stripeWebhookSecret) {
    return new NextResponse("Stripe webhook is not configured", { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Missing signature", { status: 400 });
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
  } catch (err) {
    return new NextResponse(
      `Webhook signature verification failed: ${err instanceof Error ? err.message : "unknown"}`,
      { status: 400 },
    );
  }

  try {
    await dispatchStripeEvent(event);
  } catch (err) {
    console.error("[stripe-webhook] handler error", err);
    return new NextResponse("Webhook handler error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
