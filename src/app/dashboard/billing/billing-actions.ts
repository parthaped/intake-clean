"use server";

import { recordAudit } from "@/lib/audit";
import { requireStepUpReauth } from "@/lib/auth";
import { CANCELLATION_REASON_IDS } from "@/lib/constants";
import { env, integrations } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { priceIdForTier } from "@/lib/stripe/plans";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PlanTier } from "@/types/database";

export async function startCheckoutAction(
  tier: PlanTier,
): Promise<{ url?: string; error?: string }> {
  const ctx = await requireStepUpReauth();
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
  const ctx = await requireStepUpReauth();
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

export interface CancelSubscriptionInput {
  reasons?: string[];
  comment?: string;
}

export interface CancelSubscriptionResult {
  ok?: true;
  /**
   * ISO timestamp of the date access will end. We round-trip it to the UI so
   * the success toast can say "Access ends Mar 31" without another DB read.
   */
  accessEndsAt?: string | null;
  error?: string;
}

/**
 * Cancels the firm's subscription at the end of the current billing period.
 * Stripe is told to NOT issue another invoice (`cancel_at_period_end: true`),
 * so the next charge is blocked immediately, but the subscription stays
 * `active` and the firm keeps full access until `current_period_end`.
 *
 * The user-facing exit-survey answers (multi-select reasons + optional
 * comment) are persisted to `subscription_cancellation_feedback`. Both the
 * checkbox list and the free-text field are optional — the cancellation
 * proceeds even if the user submits nothing.
 */
export async function cancelSubscriptionAction(
  input: CancelSubscriptionInput,
): Promise<CancelSubscriptionResult> {
  const ctx = await requireStepUpReauth();

  if (!integrations.hasStripe) {
    return {
      error:
        "Stripe is not configured. Set STRIPE_SECRET_KEY in .env.local before cancelling.",
    };
  }
  const subscriptionId = ctx.organization.stripe_subscription_id;
  if (!subscriptionId) {
    return {
      error:
        "There is no active subscription on file. Refresh the page or contact support if this looks wrong.",
    };
  }

  // Defensive validation: reasons must come from the published catalog so
  // analytics aren't polluted by client-side tampering. Unknown ids are
  // dropped silently rather than rejected so a stale tab doesn't get a
  // confusing error after we ship a new reason list.
  const allowed = new Set(CANCELLATION_REASON_IDS);
  const reasons = (input.reasons ?? [])
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && allowed.has(id));
  // Cap free-text at 2_000 chars so an accidental paste doesn't blow past
  // any reasonable analytics view; trim whitespace and treat empty strings
  // as null so analytics queries don't have to special-case them.
  const rawComment = (input.comment ?? "").trim();
  const comment = rawComment.length === 0 ? null : rawComment.slice(0, 2_000);

  const stripe = getStripe();
  let updated;
  try {
    updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
      cancellation_details: {
        comment: comment ?? undefined,
        feedback: mapToStripeFeedback(reasons),
      },
    });
  } catch (err) {
    console.error("[billing] stripe cancel failed", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Could not cancel the subscription with Stripe. Please try again or use Manage in Stripe.",
    };
  }

  const currentPeriodEndIso = updated.current_period_end
    ? new Date(updated.current_period_end * 1000).toISOString()
    : null;

  // Mirror the Stripe-side state immediately so the UI doesn't have to wait
  // for the webhook round-trip before showing "Subscription ending Mar 31".
  // The webhook will overwrite these fields with the same values when it
  // arrives, which is fine — both writes are idempotent.
  const service = getServiceSupabase();
  await service
    .from("organizations")
    .update({
      cancel_at_period_end: true,
      current_period_end: currentPeriodEndIso,
    })
    .eq("id", ctx.organization.id);

  await service.from("subscription_cancellation_feedback").insert({
    organization_id: ctx.organization.id,
    profile_id: ctx.profile.id,
    stripe_subscription_id: subscriptionId,
    plan: ctx.organization.plan,
    reasons,
    comment,
  });

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    actorType: "staff",
    action: "billing.subscription_cancel_requested",
    entityType: "organization",
    entityId: ctx.organization.id,
    metadata: {
      subscription_id: subscriptionId,
      reasons,
      // Don't log the raw comment to audit (it's already on the feedback
      // row). We log only its length so audit queries can spot patterns
      // without holding a second copy of free-text PII.
      comment_length: comment?.length ?? 0,
      current_period_end: currentPeriodEndIso,
    },
  });

  return { ok: true, accessEndsAt: currentPeriodEndIso };
}

/**
 * Stripe's `cancellation_details.feedback` is a closed enum that doesn't
 * line up with our product-specific reason ids. We map a couple of clear
 * matches so the data shows up nicely in Stripe's own dashboard, and let
 * the rest fall through to "other". Our analytics still uses our richer
 * id list from `subscription_cancellation_feedback.reasons`.
 */
function mapToStripeFeedback(
  reasons: string[],
): "too_expensive" | "missing_features" | "switched_service" | "low_quality" | "other" | undefined {
  if (reasons.length === 0) return undefined;
  if (reasons.includes("too_expensive")) return "too_expensive";
  if (reasons.includes("missing_features")) return "missing_features";
  if (reasons.includes("switched_tool")) return "switched_service";
  if (reasons.includes("ai_quality")) return "low_quality";
  return "other";
}

/**
 * Reverses `cancelSubscriptionAction` while the period is still running.
 * Once the period ends and Stripe transitions the subscription to
 * `canceled`, this becomes a no-op and the firm has to start a fresh
 * checkout instead.
 */
export async function resumeSubscriptionAction(): Promise<CancelSubscriptionResult> {
  const ctx = await requireStepUpReauth();

  if (!integrations.hasStripe) {
    return { error: "Stripe is not configured." };
  }
  const subscriptionId = ctx.organization.stripe_subscription_id;
  if (!subscriptionId) {
    return {
      error:
        "Your subscription has fully ended. Pick a plan above to re-subscribe.",
    };
  }

  const stripe = getStripe();
  let updated;
  try {
    updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  } catch (err) {
    console.error("[billing] stripe resume failed", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Could not resume the subscription with Stripe. Please try again or use Manage in Stripe.",
    };
  }

  const currentPeriodEndIso = updated.current_period_end
    ? new Date(updated.current_period_end * 1000).toISOString()
    : null;

  const service = getServiceSupabase();
  await service
    .from("organizations")
    .update({
      cancel_at_period_end: false,
      current_period_end: currentPeriodEndIso,
    })
    .eq("id", ctx.organization.id);

  await recordAudit({
    organizationId: ctx.organization.id,
    actorProfileId: ctx.profile.id,
    actorType: "staff",
    action: "billing.subscription_resumed",
    entityType: "organization",
    entityId: ctx.organization.id,
    metadata: {
      subscription_id: subscriptionId,
      current_period_end: currentPeriodEndIso,
    },
  });

  return { ok: true, accessEndsAt: currentPeriodEndIso };
}
