import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import type { ActorType, Json } from "@/types/database";

interface LogParams {
  organizationId: string;
  actorProfileId?: string | null;
  actorType?: ActorType;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Records a row in audit_logs. Failures are swallowed so that the calling
 * action never fails because of an audit issue.
 */
export async function recordAudit(params: LogParams): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("audit_logs").insert({
      organization_id: params.organizationId,
      actor_profile_id: params.actorProfileId ?? null,
      actor_type: params.actorType ?? "staff",
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      metadata: (params.metadata ?? {}) as Json,
    });
  } catch (error) {
    console.error("[audit] failed to write log", error);
  }
}
