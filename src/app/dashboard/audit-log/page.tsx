import { History } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { formatDateTime } from "@/lib/utils";
import type { ActorType, Json } from "@/types/database";

interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_type: ActorType;
  metadata: Json;
  created_at: string;
  profiles: { full_name: string } | null;
}

export default async function AuditLogPage() {
  const ctx = await requireSession();
  const service = getServiceSupabase();

  const { data } = await service
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, actor_type, metadata, created_at, profiles(full_name)")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const logs = (data ?? []) as AuditRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground">
          Every staff and system action is logged here, scoped to your firm.
        </p>
      </div>
      {logs.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{log.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.entity_type}
                      {log.entity_id ? ` · ${log.entity_id.slice(0, 8)}…` : ""}
                      {" · "}
                      {log.profiles?.full_name ?? log.actor_type}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {log.actor_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          Icon={History}
          title="No activity yet"
          description="Actions show up here as your team uses the platform."
        />
      )}
    </div>
  );
}
