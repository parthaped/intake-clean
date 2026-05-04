import Link from "next/link";
import { FileWarning, FolderKanban, Inbox, ShieldCheck, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { relativeTime } from "@/lib/utils";

export default async function DashboardOverviewPage() {
  const ctx = await requireSession();
  const service = getServiceSupabase();
  const orgId = ctx.organization.id;

  const [
    { count: activeMatters },
    { count: waitingOnClient },
    { count: filesNeedingReview },
    { count: reuploadCount },
    { data: recentActivity },
    { data: openReviews },
  ] = await Promise.all([
    service.from("matters").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active"),
    service
      .from("matters")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "waiting_on_client"),
    service
      .from("uploaded_files")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "needs_review"),
    service
      .from("document_request_items")
      .select("id, request_id, document_requests!inner(organization_id)", { count: "exact", head: true })
      .eq("status", "needs_reupload")
      .eq("document_requests.organization_id", orgId),
    service
      .from("audit_logs")
      .select("id, action, entity_type, created_at, metadata")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(8),
      service
      .from("uploaded_files")
      .select("id, original_file_name, status, matter_id, matters(matter_name)")
      .eq("organization_id", orgId)
      .in("status", ["needs_review", "processing"])
      .order("updated_at", { ascending: false })
      .limit(5),
  ] as const);

  type OpenReviewRow = {
    id: string;
    original_file_name: string;
    status: import("@/types/database").UploadedFileStatus;
    matter_id: string;
    matters: { matter_name: string } | null;
  };
  const openReviewRows = (openReviews ?? []) as unknown as OpenReviewRow[];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back, {ctx.profile.full_name.split(" ")[0]}</h1>
          <p className="text-muted-foreground">A quick read of what your firm is working on.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/dashboard/matters/new">Create matter</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/matters">All matters</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active matters" value={activeMatters ?? 0} Icon={FolderKanban} intent="info" />
        <StatCard label="Waiting on client" value={waitingOnClient ?? 0} Icon={Sparkles} intent="warning" />
        <StatCard label="Files needing review" value={filesNeedingReview ?? 0} Icon={Inbox} intent="default" />
        <StatCard label="Re-upload requests" value={reuploadCount ?? 0} Icon={FileWarning} intent="destructive" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity && recentActivity.length > 0 ? (
              <ul className="divide-y divide-border">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{humanizeAction(entry.action)}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.entity_type}
                        {entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata) && "label" in entry.metadata
                          ? ` · ${(entry.metadata as { label?: string }).label}`
                          : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{relativeTime(entry.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState Icon={Sparkles} title="Nothing yet" description="Create your first matter to get started." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" /> Files awaiting you
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {openReviewRows.length > 0 ? (
              openReviewRows.map((file) => {
                const matterName = file.matters?.matter_name;
                return (
                  <Link
                    key={file.id}
                    href={`/dashboard/matters/${file.matter_id}?tab=review`}
                    className="block rounded-xl border border-border bg-background/40 p-3 transition hover:border-accent"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{file.original_file_name}</p>
                      <StatusBadge kind="file" status={file.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{matterName ?? "—"}</p>
                  </Link>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No files waiting for review.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function humanizeAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\./g, " · ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
