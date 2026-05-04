import "server-only";

import { env } from "@/lib/env";
import { PLANS, PLAN_BY_TIER, type PlanDefinition } from "@/lib/constants";
import type { PlanTier } from "@/types/database";

export { PLANS, PLAN_BY_TIER };
export type { PlanDefinition };

export function priceIdForTier(tier: PlanTier): string | undefined {
  const plan = PLAN_BY_TIER[tier];
  return env[plan.envPriceKey];
}

export function tierForPriceId(priceId: string): PlanTier | undefined {
  for (const plan of PLANS) {
    if (env[plan.envPriceKey] === priceId) return plan.tier;
  }
  return undefined;
}
