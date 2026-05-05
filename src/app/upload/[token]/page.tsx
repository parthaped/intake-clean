import { BotIdClient } from "botid/client";
import { notFound } from "next/navigation";
import { FileWarning, ShieldCheck } from "lucide-react";

import { ClientUploadPortal } from "@/app/upload/[token]/upload-portal";
import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent } from "@/components/ui/card";
import { DISCLAIMER_LINES } from "@/lib/constants";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * BotID protected paths. The client component below registers the upload
 * route with BotID's challenge runtime; the matching `checkBotId()` call on
 * the server side rejects requests that fail classification. Without the
 * client component, `checkBotId()` reports every request as a bot.
 */
const BOTID_PROTECTED = [
  { path: "/api/upload/*", method: "POST" as const },
];

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ item?: string; reason?: string }>;
}

export default async function ClientUploadPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { item: focusItemId, reason } = await searchParams;
  const service = getServiceSupabase();

  type RequestRow = {
    id: string;
    title: string;
    message_to_client: string | null;
    status: import("@/types/database").RequestStatus;
    expires_at: string | null;
    organization_id: string;
    matter_id: string;
    organizations: { name: string; logo_url: string | null } | null;
    matters: { matter_name: string } | null;
    document_request_items: Array<{
      id: string;
      title: string;
      description: string | null;
      required: boolean;
      status: import("@/types/database").RequestItemStatus;
      sort_order: number;
    }>;
  };

  const requestRes = await service
    .from("document_requests")
    .select(
      "id, title, message_to_client, status, expires_at, organization_id, matter_id, organizations(name, logo_url), matters(matter_name), document_request_items(id, title, description, required, status, sort_order)",
    )
    .eq("token", token)
    .maybeSingle();
  const request = requestRes.data as RequestRow | null;
  if (!request) notFound();

  const expired =
    request.status === "expired" ||
    (request.expires_at ? new Date(request.expires_at).getTime() < Date.now() : false);

  const items = request.document_request_items.slice().sort((a, b) => a.sort_order - b.sort_order);
  const firmName = request.organizations?.name ?? "Your firm";
  const matterName = request.matters?.matter_name ?? request.title;

  if (expired) {
    return (
      <div className="min-h-screen bg-background">
        <Header firmName={firmName} />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <FileWarning className="mx-auto h-8 w-8 text-warning" />
              <h1 className="text-2xl font-semibold">This upload link has expired</h1>
              <p className="text-muted-foreground">
                Please contact {firmName} for a new upload link.
              </p>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <BotIdClient protect={BOTID_PROTECTED} />
      <Header firmName={firmName} />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{firmName}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{request.title}</h1>
          <p className="text-sm text-muted-foreground">For {matterName}</p>
        </div>

        {request.message_to_client && (
          <Card className="mt-6">
            <CardContent className="p-5 text-sm text-foreground">{request.message_to_client}</CardContent>
          </Card>
        )}

        <Card className="mt-6 border-accent/30 bg-accent/5">
          <CardContent className="space-y-2 p-5 text-sm">
            <div className="flex items-center gap-2 text-accent">
              <ShieldCheck className="h-4 w-4" />
              <p className="font-medium">How to upload clearly</p>
            </div>
            <p className="text-foreground">
              Upload clear photos, PDFs, or scans. Make sure all four corners are visible and text is readable.
            </p>
            <ul className="ml-4 list-disc text-xs text-muted-foreground">
              <li>Hold the camera flat over the document with good lighting.</li>
              <li>Avoid screenshots when you have the original PDF.</li>
              <li>HEIC, JPG, PNG, WebP, and PDF up to 50&nbsp;MB are accepted.</li>
            </ul>
          </CardContent>
        </Card>

        {focusItemId && reason && (
          <Card className="mt-6 border-warning/40 bg-warning/10">
            <CardContent className="space-y-1 p-5 text-sm">
              <p className="font-medium text-warning">Re-upload requested</p>
              <p className="text-foreground">{reason}</p>
            </CardContent>
          </Card>
        )}

        <ClientUploadPortal
          token={token}
          focusItemId={focusItemId}
          items={items.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            required: item.required,
            status: item.status,
          }))}
        />

        <p className="mt-10 text-center text-xs text-muted-foreground">{DISCLAIMER_LINES[0]}</p>
      </main>
      <Footer />
    </div>
  );
}

function Header({ firmName }: { firmName: string }) {
  return (
    <header className="border-b border-border bg-card/60">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
        <BrandMark withWordmark />
        <span className="text-xs text-muted-foreground">{firmName}</span>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-card/60 py-6 text-center text-xs text-muted-foreground">
      <div className="mx-auto max-w-2xl space-y-1 px-4">
        {DISCLAIMER_LINES.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </footer>
  );
}
