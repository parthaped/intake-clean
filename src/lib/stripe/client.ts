import "server-only";

import Stripe from "stripe";

import { env, integrations } from "@/lib/env";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (!integrations.hasStripe || !env.stripeSecretKey) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY in .env.local.");
  }
  if (!cached) {
    cached = new Stripe(env.stripeSecretKey, {
      apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    });
  }
  return cached;
}

export function isStripeConfigured(): boolean {
  return integrations.hasStripe;
}
