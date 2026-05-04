"use client";

import { useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlanDefinition } from "@/lib/constants";
import type { PlanTier } from "@/types/database";

interface PricingCardProps {
  plan: PlanDefinition;
  current?: boolean;
  ctaLabel?: string;
  onCheckout?: (tier: PlanTier) => Promise<{ url?: string; error?: string }>;
  disabled?: boolean;
}

export function PricingCard({
  plan,
  current = false,
  ctaLabel,
  onCheckout,
  disabled,
}: PricingCardProps) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!onCheckout) return;
    startTransition(async () => {
      const result = await onCheckout(plan.tier);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.url) {
        window.location.href = result.url;
      }
    });
  }

  return (
    <Card
      className={
        plan.highlight
          ? "relative border-primary/40 shadow-soft ring-1 ring-primary/20"
          : "relative"
      }
    >
      {plan.highlight && (
        <Badge className="absolute -top-3 left-6 bg-primary text-primary-foreground">Most popular</Badge>
      )}
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl">{plan.name}</CardTitle>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold tracking-tight">{plan.priceLabel}</span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Up to {plan.matterLimit} active matters · {plan.storageGb} GB storage
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        {onCheckout ? (
          <Button
            type="button"
            className="w-full"
            variant={plan.highlight ? "default" : "outline"}
            disabled={pending || disabled || current}
            onClick={handleClick}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {current ? "Current plan" : (ctaLabel ?? `Choose ${plan.name}`)}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
