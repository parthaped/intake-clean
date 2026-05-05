import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { verifyCronToken } from "@/lib/security/cron-auth";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Privacy policy commits to retaining security/audit logs "up to two (2)
 * years". This cron deletes audit_log rows older than that ceiling so we
 * stay aligned with what we promised end-clients.
 *
 * Schedule via Vercel Cron in `vercel.json`:
 *   { "path": "/api/cron/audit-retention", "schedule": "0 5 * * *" }
 *
 * Authorisation reuses the same `CRON_SECRET` bearer pattern as the
 * processing drainer. The comparison is constant-time (`timingSafeEqual`)
 * so a length-based timing attack can't probe the secret.
 */
const RETENTION_DAYS = 730;
const BATCH_SIZE = 5_000;

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return run();
}

export async function GET(request: NextRequest) {
  // Vercel Cron sends GETs by default; accept both.
  if (!authorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return run();
}

async function run(): Promise<NextResponse> {
  const service = getServiceSupabase();
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Soft cap: paginate so a single invocation never opens a transaction
  // large enough to bloat WAL or block readers. We stop after `maxBatches`
  // and rely on the next cron tick to finish if there's more.
  const maxBatches = 20;
  let totalDeleted = 0;
  for (let i = 0; i < maxBatches; i += 1) {
    type DeletedRow = { id: string; organization_id: string };
    const { data: deleted, error } = (await service
      .from("audit_logs")
      .delete()
      .lt("created_at", cutoffIso)
      .limit(BATCH_SIZE)
      .select("id, organization_id")) as { data: DeletedRow[] | null; error: { message: string } | null };
    if (error) {
      console.error("[audit-retention] delete failed", { message: error.message });
      return NextResponse.json({ ok: false, error: error.message, totalDeleted }, { status: 500 });
    }
    const count = deleted?.length ?? 0;
    totalDeleted += count;
    if (count < BATCH_SIZE) break;
  }

  // The audit_logs table is org-scoped (organization_id is NOT NULL), so
  // this sweeper job — which acts across orgs — has nowhere to write its
  // own audit row. We log to the console (which feeds Vercel Observability
  // / Sentry) and return JSON so the cron run shows the count.
  console.info("[audit-retention] swept", { cutoff: cutoffIso, totalDeleted, retentionDays: RETENTION_DAYS });

  return NextResponse.json({ ok: true, totalDeleted, cutoff: cutoffIso });
}

function authorized(request: NextRequest): boolean {
  if (!env.cronSecret) return process.env.NODE_ENV !== "production";
  return verifyCronToken(request.headers.get("authorization"), env.cronSecret);
}
