import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { drainProcessingQueue } from "@/lib/processing/pipeline";
import { verifyCronToken } from "@/lib/security/cron-auth";

export const runtime = "nodejs";

/**
 * Drains the processing queue. This route is called by:
 *   - Vercel Cron (every minute) — sends `Authorization: Bearer <CRON_SECRET>`.
 *   - The upload route (best-effort, fire-and-forget) — sends the same header
 *     when CRON_SECRET is set, otherwise relies on the unauthenticated path
 *     in dev where CRON_SECRET is unset.
 *
 * When CRON_SECRET is configured, requests without a matching header are
 * rejected so the endpoint can't be triggered by arbitrary external traffic.
 */
function isAuthorized(request: NextRequest): boolean {
  if (!env.cronSecret) return true; // Dev / local: allow unauthenticated runs.
  return verifyCronToken(request.headers.get("authorization"), env.cronSecret);
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await drainProcessingQueue({ maxJobs: 25 });
    return NextResponse.json(result);
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Processor error", { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
