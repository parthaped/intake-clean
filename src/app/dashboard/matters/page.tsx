import Link from "next/link";
import { FolderKanban } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { MatterCard } from "@/components/matter-card";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

export default async function MattersListPage() {
  const ctx = await requireSession();
  const service = getServiceSupabase();
  type MatterListRow = {
    id: string;
    matter_name: string;
    matter_type: import("@/types/database").MatterTypeT;
    status: import("@/types/database").MatterStatus;
    internal_reference: string | null;
    updated_at: string;
    clients: { full_name: string } | null;
  };
  const mattersRes = await service
    .from("matters")
    .select("id, matter_name, matter_type, status, internal_reference, updated_at, clients(full_name)")
    .eq("organization_id", ctx.organization.id)
    .order("updated_at", { ascending: false });
  const matters = (mattersRes.data ?? []) as MatterListRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Matters</h1>
          <p className="text-muted-foreground">All open and historical matters in your firm.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/matters/new">Create matter</Link>
        </Button>
      </div>

      {matters.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {matters.map((m) => {
            const clientRel = m.clients;
            return (
              <MatterCard
                key={m.id}
                id={m.id}
                matterName={m.matter_name}
                clientName={clientRel?.full_name ?? "—"}
                matterType={m.matter_type}
                status={m.status}
                internalReference={m.internal_reference}
                updatedAt={m.updated_at}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState
          Icon={FolderKanban}
          title="No matters yet"
          description="Create your first matter to start collecting client documents."
          action={
            <Button asChild>
              <Link href="/dashboard/matters/new">Create matter</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
