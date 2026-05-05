import { checkBotId } from "botid/server";
import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { enqueueProcessingJob } from "@/lib/processing/queue";
import { clientIp, limits, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { scanForViruses } from "@/lib/security/virus-scan";
import { getServiceSupabase } from "@/lib/supabase/service";
import { buildStorageKey } from "@/lib/tokens";
import { fingerprintFileName } from "@/lib/uploads/file-name-fingerprint";
import { validateUploadedFile } from "@/lib/uploads/validate";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

interface Context {
  params: Promise<{ token: string }>;
}

export async function POST(request: Request, context: Context) {
  const { token } = await context.params;

  // Vercel BotID check. The matching client-side <BotIdClient/> on the
  // upload portal page registers this route so the runtime injects the
  // classification headers; without it, every request would be classified
  // as a bot. In local dev, BotID returns `isBot: false` automatically.
  const verification = await checkBotId();
  if (verification.isBot) {
    return new NextResponse("Automated traffic detected", { status: 403 });
  }

  // Two-tier rate limit: a burst guard so a single client can't spam in
  // the span of a few seconds, and a longer-window cap to bound abuse.
  // We bucket by the upload token itself so one compromised link doesn't
  // affect another firm's clients. The IP is added as a secondary key
  // strictly for analytics (different uploaders on the same link still
  // share the per-token bucket).
  const ipKey = clientIp(request);
  const burst = await rateLimit(limits.publicUploadBurst, `${token}:${ipKey}`);
  if (!burst.success) {
    // Include `Retry-After` so a polite client (or a curl-using attacker
    // implementing exponential backoff) gets a single source of truth for
    // when to retry. Without it the client has to parse `X-RateLimit-Reset`
    // (epoch seconds) and convert — most don't.
    return new NextResponse("Too many uploads, slow down", {
      status: 429,
      headers: {
        ...rateLimitHeaders(burst, limits.publicUploadBurst.limit),
        "Retry-After": String(Math.max(1, Math.floor((burst.reset - Date.now()) / 1000))),
      },
    });
  }
  const window = await rateLimit(limits.publicUpload, token);
  if (!window.success) {
    return new NextResponse("Upload limit reached for this link", {
      status: 429,
      headers: {
        ...rateLimitHeaders(window, limits.publicUpload.limit),
        "Retry-After": String(Math.max(1, Math.floor((window.reset - Date.now()) / 1000))),
      },
    });
  }

  const service = getServiceSupabase();

  const requestRow = await service
    .from("document_requests")
    .select("id, status, expires_at, organization_id, matter_id, client_id")
    .eq("token", token)
    .maybeSingle();

  if (!requestRow.data) {
    return new NextResponse("Invalid upload link", { status: 404 });
  }
  const docRequest = requestRow.data;
  if (docRequest.status === "expired" || docRequest.status === "closed") {
    return new NextResponse("This upload link has been closed", { status: 410 });
  }
  if (docRequest.expires_at && new Date(docRequest.expires_at).getTime() < Date.now()) {
    return new NextResponse("This upload link has expired", { status: 410 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return new NextResponse("File is required", { status: 400 });
  }

  // Magic-byte validation. Rejects polyglots, mismatched MIME claims, and
  // file types we don't accept. Done BEFORE we touch storage so a malicious
  // upload never even lands in a bucket.
  const validation = await validateUploadedFile(file);
  if (!validation.ok) {
    return new NextResponse(validation.message ?? "File validation failed", { status: validation.status });
  }
  // Use the detected MIME (not the client-claimed one) for everything
  // downstream so storage metadata reflects what was actually uploaded.
  const trustedMime = validation.detectedMime ?? file.type;

  const requestItemId = formData.get("request_item_id");
  let validItemId: string | null = null;
  if (typeof requestItemId === "string" && requestItemId.length > 0) {
    const { data: item } = await service
      .from("document_request_items")
      .select("id")
      .eq("id", requestItemId)
      .eq("request_id", docRequest.id)
      .maybeSingle();
    if (item) validItemId = item.id;
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Virus scan BEFORE the bucket write. A scanner verdict of `infected`
  // means the bytes never touch storage — previously the scan ran inside
  // processDocument so an infected file lived in `original-documents` until
  // the next drainer pass and was never deleted afterwards.
  // `error` is treated as fail-closed in production (no API key / scanner
  // outage) so a Cloudmersive incident can't silently disable AV; in dev
  // (`skipped`) we accept the upload and let processDocument re-attempt.
  const scan = await scanForViruses(buffer, trustedMime, file.name);
  if (scan.status === "infected") {
    await recordAudit({
      organizationId: docRequest.organization_id,
      actorType: "system",
      action: "file.virus_detected_pre_upload",
      entityType: "document_request",
      entityId: docRequest.id,
      metadata: {
        scan_engine: scan.engine,
        file_name_sha256: fingerprintFileName(file.name).sha256,
        mime: trustedMime,
        size: file.size,
        findings: scan.findings ?? null,
      },
    });
    return new NextResponse("This file failed our security scan and was not accepted.", {
      status: 422,
    });
  }
  if ((scan.status === "error" || scan.status === "unknown") && process.env.NODE_ENV === "production") {
    // Fail-closed on production scanner errors *and* indeterminate verdicts.
    // Treating `unknown` as "good enough" was the previous behaviour and is
    // exactly the gap a polyglot crafted to confuse the scanner could slip
    // through. Better to surface a retry prompt to the client than to
    // silently write unchecked bytes.
    await recordAudit({
      organizationId: docRequest.organization_id,
      actorType: "system",
      action: "file.virus_scan_unavailable",
      entityType: "document_request",
      entityId: docRequest.id,
      metadata: {
        scan_engine: scan.engine,
        scan_status: scan.status,
        findings: scan.findings ?? null,
      },
    });
    return new NextResponse("File security scan is temporarily unavailable. Please try again shortly.", {
      status: 503,
    });
  }

  const storageKey = buildStorageKey({
    organizationId: docRequest.organization_id,
    matterId: docRequest.matter_id,
    scope: "original",
    filename: file.name,
  });

  const upload = await service.storage.from("original-documents").upload(storageKey, buffer, {
    contentType: trustedMime,
    cacheControl: "3600",
    upsert: false,
  });
  if (upload.error) {
    return new NextResponse(`Storage upload failed: ${upload.error.message}`, { status: 500 });
  }

  const { data: uploadedFile, error: insertErr } = await service
    .from("uploaded_files")
    .insert({
      organization_id: docRequest.organization_id,
      matter_id: docRequest.matter_id,
      request_id: docRequest.id,
      request_item_id: validItemId,
      client_id: docRequest.client_id,
      original_file_name: file.name,
      original_mime_type: trustedMime,
      original_storage_path: storageKey,
      file_size_bytes: file.size,
      uploaded_by_type: "client",
      status: "uploaded",
      virus_scan_status: scan.status,
      virus_scan_engine: scan.engine,
      virus_scan_findings: (scan.findings ?? null) as Json | null,
      virus_scanned_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertErr || !uploadedFile) {
    // The bucket write succeeded but the row didn't land. Without this
    // cleanup the storage object would be permanently orphaned (no DB row
    // points at it, so it never appears in the dashboard, never gets
    // exported, and never gets purged by retention sweeps).
    const cleanup = await service.storage.from("original-documents").remove([storageKey]);
    if (cleanup.error) {
      console.error("[upload] could not clean up orphaned storage object", {
        storageKey,
        message: cleanup.error.message,
      });
    }
    return new NextResponse(insertErr?.message ?? "Could not record upload", { status: 500 });
  }

  if (validItemId) {
    await service
      .from("document_request_items")
      .update({ status: "uploaded" })
      .eq("id", validItemId);
  }

  await service
    .from("matters")
    .update({ status: "in_review" })
    .eq("id", docRequest.matter_id)
    .in("status", ["active", "waiting_on_client"]);

  await service
    .from("document_requests")
    .update({ status: "partially_complete" })
    .eq("id", docRequest.id)
    .neq("status", "submitted");

  await enqueueProcessingJob({
    organizationId: docRequest.organization_id,
    uploadedFileId: uploadedFile.id,
    jobType: "convert",
  });

  // Audit log: do NOT store the raw filename — names like
  // `passport_john_smith_ssn_1234.pdf` are themselves PII. We store a SHA-256
  // fingerprint (so events can be joined back to a specific upload) plus the
  // extension and the trusted MIME for triage.
  const fp = fingerprintFileName(file.name);
  await recordAudit({
    organizationId: docRequest.organization_id,
    actorType: "client",
    action: "file.uploaded",
    entityType: "uploaded_file",
    entityId: uploadedFile.id,
    metadata: {
      file_name_sha256: fp.sha256,
      file_ext: fp.ext,
      mime: trustedMime,
      claimed_mime: file.type,
      size: file.size,
      request_id: docRequest.id,
    },
  });

  // Trigger the processor (best-effort, fire and forget). In production a
  // Vercel Cron also drains the queue every minute, so a missed kick here is
  // not fatal. We resolve an absolute URL because Node's fetch rejects
  // relative URLs and the `origin` header isn't always present.
  void triggerDrain(request).catch((err) => {
    console.warn("[upload] failed to kick processor", err);
  });

  return NextResponse.json(
    { ok: true, fileId: uploadedFile.id },
    { headers: rateLimitHeaders(window, limits.publicUpload.limit) },
  );
}

async function triggerDrain(request: Request): Promise<void> {
  const origin =
    request.headers.get("origin") ??
    new URL(request.url).origin ??
    env.appUrl;
  const headers: HeadersInit = {};
  if (env.cronSecret) headers["authorization"] = `Bearer ${env.cronSecret}`;
  await fetch(`${origin}/api/process/run`, { method: "POST", headers });
}
