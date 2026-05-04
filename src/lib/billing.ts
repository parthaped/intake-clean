import "server-only";

import { env } from "@/lib/env";
import { PLAN_BY_TIER } from "@/lib/constants";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PlanTier, SubscriptionStatusT } from "@/types/database";

export interface OrganizationUsage {
  matters: number;
  storageMb: number;
}

export interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  matters: { used: number; limit: number };
  storage: { usedMb: number; limitMb: number };
  plan: PlanTier;
  status: SubscriptionStatusT;
}

const ACTIVE_STATUSES: SubscriptionStatusT[] = ["trialing", "active"];

export async function loadOrganizationUsage(organizationId: string): Promise<OrganizationUsage> {
  const service = getServiceSupabase();
  const [mattersRes, filesRes] = await Promise.all([
    service
      .from("matters")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "archived"),
    service
      .from("uploaded_files")
      .select("file_size_bytes")
      .eq("organization_id", organizationId),
  ]);

  const totalBytes = (filesRes.data ?? []).reduce(
    (acc: number, row: { file_size_bytes: number }) => acc + (row.file_size_bytes || 0),
    0,
  );
  return {
    matters: mattersRes.count ?? 0,
    // Ceil so a few KB doesn't render as "0 MB" and so usage never
    // under-reports against the plan cap.
    storageMb: totalBytes > 0 ? Math.ceil(totalBytes / (1024 * 1024)) : 0,
  };
}

export async function checkMatterQuota(args: {
  organizationId: string;
  plan: PlanTier;
  status: SubscriptionStatusT;
}): Promise<QuotaCheck> {
  const usage = await loadOrganizationUsage(args.organizationId);
  const planDef = PLAN_BY_TIER[args.plan];
  const limit = planDef.matterLimit;
  const billingActive = env.devBypassBilling || ACTIVE_STATUSES.includes(args.status);

  let allowed = true;
  let reason: string | undefined;

  if (!billingActive) {
    allowed = false;
    reason = "Subscription is inactive. Choose a plan to continue creating matters.";
  } else if (usage.matters >= limit) {
    allowed = false;
    reason = `You have reached the ${planDef.name} plan limit of ${limit} active matters. Upgrade or archive a matter to add another.`;
  }

  return {
    allowed,
    reason,
    matters: { used: usage.matters, limit },
    storage: { usedMb: usage.storageMb, limitMb: planDef.storageMb },
    plan: args.plan,
    status: args.status,
  };
}
