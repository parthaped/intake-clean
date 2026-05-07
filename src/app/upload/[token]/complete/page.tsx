import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent } from "@/components/ui/card";
import { DISCLAIMER_LINES } from "@/lib/constants";
import { getServiceSupabase } from "@/lib/supabase/service";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function UploadCompletePage({ params }: PageProps) {
  const { token } = await params;

  // Look up the firm name + logo so the completion page matches the visual
  // language of the upload page the client just came from. We deliberately
  // don't 404 if the token is missing — anyone who already finished an
  // upload should still see the success screen, just without branding.
  const service = getServiceSupabase();
  type OrgRow = { organizations: { name: string; logo_url: string | null } | null } | null;
  const { data: rawData } = await service
    .from("document_requests")
    .select("organizations(name, logo_url)")
    .eq("token", token)
    .maybeSingle();
  const data = rawData as OrgRow;
  const org = data?.organizations ?? null;
  const firmName = org?.name ?? null;
  const firmLogoUrl = org?.logo_url ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {firmLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={firmLogoUrl}
                alt={firmName ?? "Firm logo"}
                className="h-9 w-auto max-w-[180px] rounded-md bg-white object-contain p-0.5"
              />
            ) : firmName ? (
              <span className="truncate text-base font-semibold tracking-tight text-foreground">{firmName}</span>
            ) : (
              <BrandMark withWordmark />
            )}
            {firmLogoUrl && firmName && (
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">{firmName}</span>
            )}
          </div>
          {(firmLogoUrl || firmName) && (
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden sm:inline">In partnership with</span>
              <BrandMark size="sm" withWordmark />
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h1 className="text-2xl font-semibold">Thanks. Files received.</h1>
            <p className="text-muted-foreground">
              {firmName ? `${firmName} will review these and contact you if anything needs to be re-uploaded.` : "The firm will review these and contact you if anything needs to be re-uploaded."}
            </p>
            <div className="pt-2">
              <Link href={`/upload/${token}`} className="text-sm font-medium text-accent hover:underline">
                Upload more files
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
      <footer className="border-t border-border bg-card/60 py-6 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-2xl space-y-2 px-4">
          <p className="flex items-center justify-center gap-1.5 text-foreground">
            <span>Securely powered by</span>
            <BrandMark size="sm" withWordmark />
          </p>
          {DISCLAIMER_LINES.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </footer>
    </div>
  );
}
