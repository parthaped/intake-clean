import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClipboardCheck,
  FileSearch,
  FileSpreadsheet,
  History,
  Inbox,
  MessageSquare,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";

import { ChecklistItemCard } from "@/components/checklist-item-card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MATTER_TYPE_LABEL } from "@/lib/constants";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { formatDateTime, formatBytes, relativeTime } from "@/lib/utils";

import { ArchiveMatterButton } from "@/app/dashboard/matters/[matterId]/archive-matter-button";
import { CopyLinkButton } from "@/app/dashboard/matters/[matterId]/copy-link-button";
import { DeleteMatterDialog } from "@/app/dashboard/matters/[matterId]/delete-matter-dialog";
import { SendRequestButton } from "@/app/dashboard/matters/[matterId]/send-request-button";
import { SendCompletionButton } from "@/app/dashboard/matters/[matterId]/send-completion-button";
import { ExportCard } from "@/components/export-card";
import type { MatterStatus, MatterTypeT, RequestStatus, UploadedFileStatus } from "@/types/database";

type MatterDetail = {
  id: string;
  matter_name: string;
  matter_type: MatterTypeT;
  status: MatterStatus;
  internal_reference: string | null;
  created_at: string;
  updated_at: string;
  clients: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    preferred_contact: "email" | "sms" | "both";
  } | null;
};

type RequestRow = {
  id: string;
  title: string;
  status: RequestStatus;
  token: string;
  sent_at: string | null;
  created_at: string;
  message_to_client: string | null;
  document_request_items: Array<{
    id: string;
    title: string;
    description: string | null;
    status: import("@/types/database").RequestItemStatus;
    required: boolean;
    sort_order: number;
  }>;
};

type FileRow = {
  id: string;
  original_file_name: string;
  original_mime_type: string;
  file_size_bytes: number;
  status: UploadedFileStatus;
  detected_document_type: string | null;
  created_at: string;
  request_item_id: string | null;
};

type MessageRow = {
  id: string;
  channel: import("@/types/database").MessageChannel;
  direction: import("@/types/database").MessageDirection;
  subject: string | null;
  body: string;
  status: import("@/types/database").MessageStatus;
  error_message: string | null;
  created_at: string;
};

type ExportRow = {
  id: string;
  export_type: import("@/types/database").ExportType;
  summary: string | null;
  storage_path: string;
  created_at: string;
};

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_type: import("@/types/database").ActorType;
  metadata: import("@/types/database").Json;
  created_at: string;
};

interface PageProps {
  params: Promise<{ matterId: string }>;
  searchParams: Promise<{ tab?: string; request?: string }>;
}

export default async function MatterDetailPage({ params, searchParams }: PageProps) {
  const { matterId } = await params;
  const { tab } = await searchParams;
  const ctx = await requireSession();
  const service = getServiceSupabase();

  const matterResult = await service
    .from("matters")
    .select(
      "id, matter_name, matter_type, status, internal_reference, created_at, updated_at, clients(id, full_name, email, phone, preferred_contact)",
    )
    .eq("id", matterId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  const matter = matterResult.data as MatterDetail | null;
  if (!matter) notFound();

  const client = matter.clients;

  const [requestsRes, filesRes, messagesRes, exportsRes, auditLogsRes] = await Promise.all([
    service
      .from("document_requests")
      .select(
        "id, title, status, token, sent_at, created_at, message_to_client, document_request_items(id, title, description, status, required, sort_order)",
      )
      .eq("matter_id", matter.id)
      .order("created_at", { ascending: false }),
    service
      .from("uploaded_files")
      .select(
        "id, original_file_name, original_mime_type, file_size_bytes, status, detected_document_type, created_at, request_item_id",
      )
      .eq("matter_id", matter.id)
      .order("created_at", { ascending: false }),
    service
      .from("client_messages")
      .select("id, channel, direction, subject, body, status, error_message, created_at")
      .eq("matter_id", matter.id)
      .order("created_at", { ascending: false }),
    service
      .from("exports")
      .select("id, export_type, summary, storage_path, created_at")
      .eq("matter_id", matter.id)
      .order("created_at", { ascending: false }),
    service
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, actor_type, metadata, created_at")
      .eq("organization_id", ctx.organization.id)
      .eq("entity_id", matter.id)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const requests = (requestsRes.data ?? []) as RequestRow[];
  const files = (filesRes.data ?? []) as FileRow[];
  const messages = (messagesRes.data ?? []) as MessageRow[];
  const exports = (exportsRes.data ?? []) as ExportRow[];
  const auditLogs = (auditLogsRes.data ?? []) as AuditRow[];

  const activeRequest = requests.find((r) => r.status !== "closed" && r.status !== "expired") ?? requests[0];
  const reviewQueue = files.filter(
    (f) => f.status === "needs_review" || f.status === "processing" || f.status === "uploaded",
  );
  const acceptedFiles = files.filter((f) => f.status === "accepted");

  const tabs = [
    { id: "overview", label: "Overview", icon: Sparkles },
    { id: "checklist", label: "Checklist", icon: ClipboardCheck },
    { id: "uploads", label: "Uploads", icon: Upload },
    { id: "review", label: "Review", icon: FileSearch },
    { id: "messages", label: "Messages", icon: MessageSquare },
    { id: "exports", label: "Exports", icon: FileSpreadsheet },
    { id: "audit", label: "Audit log", icon: History },
  ];
  const initialTab = tabs.find((t) => t.id === tab)?.id ?? "overview";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {MATTER_TYPE_LABEL[matter.matter_type]}
            {matter.internal_reference ? ` · #${matter.internal_reference}` : ""}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{matter.matter_name}</h1>
          <p className="text-sm text-muted-foreground">Client: {client?.full_name ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge kind="matter" status={matter.status} />
          <Button asChild variant="outline">
            <Link href={`/dashboard/matters/${matter.id}/requests/new`}>New request</Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <Tabs defaultValue={initialTab} className="space-y-4">
          <TabsList className="flex w-full overflow-x-auto">
            {tabs.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="gap-2">
                <Icon className="h-4 w-4" /> {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>At a glance</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat label="Open requests" value={requests.filter((r) => r.status === "sent" || r.status === "partially_complete").length} />
                <Stat label="Files awaiting review" value={reviewQueue.length} />
                <Stat label="Accepted into packet" value={acceptedFiles.length} />
                <Stat label="Recent uploads" value={files.length} />
                <Stat label="Created" value={formatDateTime(matter.created_at)} small />
                <Stat label="Updated" value={formatDateTime(matter.updated_at)} small />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="checklist" className="space-y-4">
            {requests.length > 0 ? (
              requests.map((req) => (
                <Card key={req.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {req.title}
                        <StatusBadge kind="request" status={req.status} />
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Created {relativeTime(req.created_at)}
                        {req.sent_at ? ` · Sent ${relativeTime(req.sent_at)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyLinkButton url={`${env.appUrl}/upload/${req.token}`} />
                      <SendRequestButton requestId={req.id} status={req.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {req.document_request_items
                      ?.slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((item) => (
                        <ChecklistItemCard
                          key={item.id}
                          title={item.title}
                          description={item.description}
                          status={item.status}
                          required={item.required}
                        />
                      ))}
                  </CardContent>
                </Card>
              ))
            ) : (
              <EmptyState
                Icon={ClipboardCheck}
                title="No document request yet"
                description="Send the client a checklist to start collecting documents."
                action={
                  <Button asChild>
                    <Link href={`/dashboard/matters/${matter.id}/requests/new`}>Create request</Link>
                  </Button>
                }
              />
            )}
          </TabsContent>

          <TabsContent value="uploads" className="space-y-3">
            {files.length > 0 ? (
              files.map((f) => (
                <Card key={f.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{f.original_file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.original_mime_type} · {formatBytes(f.file_size_bytes)} · {relativeTime(f.created_at)}
                      </p>
                      {f.detected_document_type && (
                        <Badge variant="outline" className="mt-1">
                          {f.detected_document_type}
                        </Badge>
                      )}
                    </div>
                    <StatusBadge kind="file" status={f.status} />
                  </div>
                </Card>
              ))
            ) : (
              <EmptyState
                Icon={Upload}
                title="No uploads yet"
                description="Send a request, then your client's uploads will land here."
              />
            )}
          </TabsContent>

          <TabsContent value="review" className="space-y-3">
            {reviewQueue.length > 0 ? (
              reviewQueue.map((f) => (
                <Card key={f.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{f.original_file_name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(f.file_size_bytes)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge kind="file" status={f.status} />
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/review?file=${f.id}`}>Open in review</Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <EmptyState Icon={FileSearch} title="Review queue is clear" description="No files waiting on staff." />
            )}
          </TabsContent>

          <TabsContent value="messages" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Outbound and inbound messages with the client appear here in chronological order.
              </p>
              <SendCompletionButton matterId={matter.id} />
            </div>
            {messages.length > 0 ? (
              <div className="space-y-2">
                {messages
                  .slice()
                  .reverse()
                  .map((m) => (
                    <Card
                      key={m.id}
                      className={
                        m.direction === "inbound"
                          ? "ml-0 mr-12 border-l-4 border-l-primary/40 p-4"
                          : "ml-12 mr-0 p-4"
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {m.direction === "inbound" ? "From client" : "From firm"} · {m.channel}
                          </p>
                          {m.subject && <p className="text-sm font-medium">{m.subject}</p>}
                          <p className="whitespace-pre-wrap text-sm text-foreground/90">{m.body}</p>
                          {m.status === "failed" && m.error_message && (
                            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                              Delivery failed: {m.error_message}
                            </p>
                          )}
                          {m.status === "sent_mock" && (
                            <p className="rounded-md border border-amber-300/40 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                              Mock mode — this message was logged but not actually delivered.
                              {m.error_message ? ` (${m.error_message})` : ""}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant={m.status === "failed" ? "destructive" : "outline"}
                          className="capitalize"
                        >
                          {m.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(m.created_at)}</p>
                    </Card>
                  ))}
              </div>
            ) : (
              <EmptyState
                Icon={MessageSquare}
                title="No messages yet"
                description="Send a request and the email/SMS will appear here."
              />
            )}
          </TabsContent>

          <TabsContent value="exports" className="space-y-3">
            {exports.length > 0 ? (
              exports.map((ex) => (
                <Card key={ex.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium capitalize">{ex.export_type.replaceAll("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(ex.created_at)}</p>
                      {ex.summary && <p className="mt-1 text-xs text-muted-foreground">{ex.summary}</p>}
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/api/exports/${ex.id}/signed-url`} target="_blank">
                        Download
                      </Link>
                    </Button>
                  </div>
                </Card>
              ))
            ) : (
              <EmptyState Icon={FileSpreadsheet} title="No exports yet" description="Generate a packet from the right-side panel once files are accepted." />
            )}
          </TabsContent>

          <TabsContent value="audit" className="space-y-2">
            {auditLogs.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <ul className="divide-y divide-border">
                    {auditLogs.map((log) => (
                      <li key={log.id} className="flex items-center justify-between gap-3 p-4">
                        <div>
                          <p className="text-sm font-medium">{log.action}</p>
                          <p className="text-xs text-muted-foreground">
                            {log.entity_type} · {log.actor_type}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{relativeTime(log.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : (
              <EmptyState Icon={History} title="Nothing logged yet" description="Activity will appear here as you work." />
            )}
          </TabsContent>
        </Tabs>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium text-foreground">{client?.full_name ?? "—"}</p>
              {client?.email && <p className="text-muted-foreground">{client.email}</p>}
              {client?.phone && <p className="text-muted-foreground">{client.phone}</p>}
              {client && (
                <Badge variant="outline" className="capitalize">
                  Prefers {client.preferred_contact}
                </Badge>
              )}
            </CardContent>
          </Card>

          {activeRequest && (
            <Card>
              <CardHeader>
                <CardTitle>Upload link</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground break-all">
                  {`${env.appUrl}/upload/${activeRequest.token}`}
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyLinkButton url={`${env.appUrl}/upload/${activeRequest.token}`} />
                  <SendRequestButton requestId={activeRequest.id} status={activeRequest.status} variant="default" label="Send to client" />
                </div>
              </CardContent>
            </Card>
          )}

          <ExportCard
            matterId={matter.id}
            recent={exports.slice(0, 3).map((e) => ({
              id: e.id,
              export_type: e.export_type,
              summary: e.summary,
              created_at: e.created_at,
            }))}
            acceptedCount={acceptedFiles.length}
          />

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href={`/dashboard/matters/${matter.id}/requests/new`}>
                  <Send className="h-4 w-4" /> New request
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href={`/dashboard/review?matter=${matter.id}`}>
                  <Inbox className="h-4 w-4" /> Open review queue
                </Link>
              </Button>
              <ArchiveMatterButton matterId={matter.id} status={matter.status} />
              {ctx.profile.role === "admin" && (
                <DeleteMatterDialog
                  matterId={matter.id}
                  matterName={matter.matter_name}
                  fileCount={files.length}
                  exportCount={exports.length}
                />
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, small = false }: { label: string; value: number | string; small?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={small ? "text-sm text-foreground" : "text-2xl font-semibold tracking-tight text-foreground"}>{value}</p>
    </div>
  );
}
