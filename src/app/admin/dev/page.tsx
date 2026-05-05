import { notFound } from "next/navigation";
import { ListChecks, Wrench } from "lucide-react";

export const dynamic = "force-dynamic";

import { AppShell } from "@/components/app-shell";
import { RunJobsButton } from "@/app/admin/dev/run-jobs-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { env, integrations } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/service";
import { formatDateTime } from "@/lib/utils";
import type { JobStatus, JobType } from "@/types/database";

interface JobRow {
  id: string;
  job_type: JobType;
  status: JobStatus;
  attempts: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export default async function AdminDevPage() {
  const ctx = await requireSession();
  if (!env.adminDebug || ctx.profile.role !== "admin") {
    notFound();
  }
  const service = getServiceSupabase();

  const { data: jobsData } = await service
    .from("processing_jobs")
    .select("id, job_type, status, attempts, error_message, created_at, updated_at")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .limit(40);
  const jobs = (jobsData ?? []) as JobRow[];

  return (
    <AppShell
      user={{ fullName: ctx.profile.full_name, email: ctx.email, role: ctx.profile.role }}
      organization={{
        name: ctx.organization.name,
        plan: ctx.organization.plan,
        subscriptionStatus: ctx.organization.subscription_status,
      }}
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Admin · Dev tools</p>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <Wrench className="h-6 w-6" /> Developer console
          </h1>
          <p className="text-muted-foreground">
            Visible to firm admins when <code>ADMIN_DEBUG=true</code>. Use this to verify mock fallbacks
            and re-run pending processing jobs during development.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Integration status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {[
              { label: "Supabase", on: integrations.hasSupabase },
              { label: "Resend (email)", on: integrations.hasResend },
              { label: "Twilio (SMS)", on: integrations.hasTwilio },
              { label: "Stripe", on: integrations.hasStripe },
              { label: `Hugging Face (model: ${env.hfDocumentModel})`, on: integrations.hasHuggingFace },
              { label: `OCR engine: ${env.ocrEngine}`, on: env.useLocalOcr },
              { label: `AI provider: ${env.aiProvider}`, on: !integrations.useMockAi },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-xl border border-border bg-card/40 px-3 py-2"
              >
                <span className="text-sm font-medium">{row.label}</span>
                <Badge variant={row.on ? "default" : "outline"} className={row.on ? "" : "text-muted-foreground"}>
                  {row.on ? "Live" : "Mock fallback"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" /> Processing jobs (latest 40)
            </CardTitle>
            <RunJobsButton />
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No processing jobs yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {jobs.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium capitalize">{job.job_type.replace("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        Updated {formatDateTime(job.updated_at)} · {job.attempts} attempt{job.attempts === 1 ? "" : "s"}
                      </p>
                      {job.error_message && (
                        <p className="text-xs text-destructive">{job.error_message}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {job.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
