/**
 * End-to-end (still in-process) tests for `POST /api/upload/[token]`.
 *
 * The upload route is the seam where a client sends bytes and the firm
 * dashboard sees a new row appear; if any of the writes the route makes
 * (uploaded_files, document_request_items, matters, document_requests,
 * processing_jobs, audit_logs) drift, the two views drift with it. This
 * file pins each branch.
 *
 * Mocking strategy:
 *   - `@/lib/supabase/service` redirected to a CJS stub (see
 *     `tests/shims/supabase-service-stub.cjs`). Tests install a
 *     `createFakeSupabase()` per spec.
 *   - `botid/server` redirected → controllable verdict per spec.
 *   - `@/lib/security/virus-scan` redirected → controllable scan verdict.
 *   - `globalThis.fetch` spied to capture the trigger-drain call.
 *   - `rateLimit` runs unmocked against the in-memory fallback; each
 *     spec uses a unique token so the bucket is fresh.
 */
import { Buffer } from "node:buffer";

import { POST } from "@/app/api/upload/[token]/route";

import { createFakeSupabase, eqArg, type ChainOpRecord } from "../../helpers/fake-supabase";
import {
  resetTestSupabaseClient,
  setTestSupabaseClient,
} from "../../helpers/supabase-service-stub-bridge";
import {
  resetBotIdVerdict,
  resetScanVerdict,
  setBotIdVerdict,
  setScanVerdict,
} from "../../helpers/upload-stub-bridges";

// Real PDF magic bytes so `validateUploadedFile` accepts the upload as
// `application/pdf`. The validator only needs the first ~4 KB.
const PDF_BYTES = Buffer.concat([
  Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary"),
  Buffer.alloc(64),
]);

interface DocRequestRow {
  id: string;
  status: string;
  expires_at: string | null;
  organization_id: string;
  matter_id: string;
  client_id: string;
}

function freshToken(): string {
  // Each spec gets its own token so the in-memory rate-limit buckets
  // don't bleed between specs.
  return `token-${Math.random().toString(36).slice(2, 10)}`;
}

function makeRequest(token: string, file?: { name: string; type: string; body: Buffer } | null, extra?: Record<string, string>): Request {
  const fd = new FormData();
  if (file) {
    fd.append("file", new File([new Uint8Array(file.body)], file.name, { type: file.type }));
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  }
  return new Request(`http://test.local/api/upload/${token}`, { method: "POST", body: fd });
}

function ctx(token: string) {
  return { params: Promise.resolve({ token }) };
}

function defaultDocRequest(overrides: Partial<DocRequestRow> = {}): DocRequestRow {
  return {
    id: "req-1",
    status: "sent",
    expires_at: null,
    organization_id: "org-1",
    matter_id: "matter-1",
    client_id: "client-1",
    ...overrides,
  };
}

/**
 * Composes a happy-path supabase responder. Tests can layer additional
 * behaviour on top by passing `overrides`.
 */
function happyPathSupabase(
  fake: ReturnType<typeof createFakeSupabase>,
  doc: DocRequestRow,
  insertedFileId = "file-1",
  matterCurrentStatus: "active" | "waiting_on_client" | "in_review" = "active",
) {
  fake.on("document_requests", (op) => {
    if (op.kind === "select") return { data: doc, error: null };
    return { data: null, error: null };
  });
  fake.on("document_request_items", (op) => {
    if (op.kind === "select") return { data: { id: "item-1" }, error: null };
    return { data: null, error: null };
  });
  fake.on("uploaded_files", (op) => {
    if (op.kind === "insert") return { data: { id: insertedFileId }, error: null };
    return { data: null, error: null };
  });
  fake.on("matters", () => ({ data: null, error: null }));
  fake.on("processing_jobs", (op) => {
    if (op.kind === "select") return { data: null, error: null };
    if (op.kind === "insert") return { data: { id: "job-1" }, error: null };
    return { data: null, error: null };
  });
  fake.on("audit_logs", () => ({ data: null, error: null }));
  // Storage upload should succeed.
  fake.onStorage("original-documents", (op) => {
    if (op.method === "upload") return { data: { path: op.args[0] }, error: null };
    if (op.method === "remove") return { data: [], error: null };
    return { data: null, error: null };
  });
  void matterCurrentStatus; // documented but unused — happy path doesn't read matter status
}

describe("api/upload/[token] POST", () => {
  let fake: ReturnType<typeof createFakeSupabase>;
  let fetchSpy: jasmine.Spy;
  let originalFetch: typeof fetch;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    fake = createFakeSupabase();
    setTestSupabaseClient(fake.client);
    resetBotIdVerdict();
    resetScanVerdict();
    originalFetch = globalThis.fetch;
    fetchSpy = jasmine.createSpy("fetch").and.resolveTo(new Response(null, { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    originalNodeEnv = process.env.NODE_ENV;
    spyOn(console, "warn");
    spyOn(console, "error");
  });

  afterEach(() => {
    resetTestSupabaseClient();
    resetBotIdVerdict();
    resetScanVerdict();
    globalThis.fetch = originalFetch;
    if (originalNodeEnv === undefined) delete (process.env as Record<string, string>).NODE_ENV;
    else (process.env as Record<string, string>).NODE_ENV = originalNodeEnv;
  });

  // ------------------------------------------------------------------
  // Guard: BotID
  // ------------------------------------------------------------------

  describe("guards", () => {
    it("returns 403 when BotID flags the request", async () => {
      setBotIdVerdict({ isBot: true });
      const token = freshToken();
      const res = await POST(makeRequest(token, { name: "x.pdf", type: "application/pdf", body: PDF_BYTES }), ctx(token));
      expect(res.status).toBe(403);
    });

    it("returns 429 with Retry-After when the burst rate limit is exceeded", async () => {
      const token = freshToken();
      // The publicUploadBurst bucket is keyed by `${token}:${ipKey}` and
      // allows 5 hits in 10s. The 6th must fail. We send 6 requests
      // sequentially through the route to exhaust the in-memory bucket.
      const doc = defaultDocRequest();
      happyPathSupabase(fake, doc);
      let last: Response | null = null;
      for (let i = 0; i < 6; i++) {
        last = await POST(
          makeRequest(token, { name: `x${i}.pdf`, type: "application/pdf", body: PDF_BYTES }),
          ctx(token),
        );
      }
      expect(last!.status).toBe(429);
      expect(last!.headers.get("Retry-After")).not.toBeNull();
      expect(last!.headers.get("X-RateLimit-Limit")).toBe("5");
    });
  });

  // ------------------------------------------------------------------
  // Token + status guards
  // ------------------------------------------------------------------

  describe("token / status checks", () => {
    it("returns 404 when no document_request matches the token", async () => {
      fake.on("document_requests", (op) => {
        if (op.kind === "select") return { data: null, error: null };
        return { data: null, error: null };
      });
      const token = freshToken();
      const res = await POST(makeRequest(token, { name: "x.pdf", type: "application/pdf", body: PDF_BYTES }), ctx(token));
      expect(res.status).toBe(404);
    });

    it("returns 410 when the request status is closed", async () => {
      const doc = defaultDocRequest({ status: "closed" });
      happyPathSupabase(fake, doc);
      const token = freshToken();
      const res = await POST(makeRequest(token, { name: "x.pdf", type: "application/pdf", body: PDF_BYTES }), ctx(token));
      expect(res.status).toBe(410);
    });

    it("returns 410 when expires_at is past", async () => {
      const doc = defaultDocRequest({ expires_at: new Date(Date.now() - 60_000).toISOString() });
      happyPathSupabase(fake, doc);
      const token = freshToken();
      const res = await POST(makeRequest(token, { name: "x.pdf", type: "application/pdf", body: PDF_BYTES }), ctx(token));
      expect(res.status).toBe(410);
    });
  });

  // ------------------------------------------------------------------
  // File validation
  // ------------------------------------------------------------------

  describe("file validation", () => {
    it("returns 400 when no file part is present", async () => {
      happyPathSupabase(fake, defaultDocRequest());
      const token = freshToken();
      const res = await POST(makeRequest(token, null), ctx(token));
      expect(res.status).toBe(400);
    });

    it("returns 415 when the claimed MIME doesn't match the magic bytes", async () => {
      happyPathSupabase(fake, defaultDocRequest());
      const token = freshToken();
      // PDF bytes claimed as PNG → mismatch.
      const res = await POST(
        makeRequest(token, { name: "x.png", type: "image/png", body: PDF_BYTES }),
        ctx(token),
      );
      expect(res.status).toBe(415);
    });
  });

  // ------------------------------------------------------------------
  // Virus-scan branches
  // ------------------------------------------------------------------

  describe("virus scan", () => {
    it("returns 422 on infected verdict, never touches storage, and audits the rejection", async () => {
      setScanVerdict({
        status: "infected",
        engine: "cloudmersive",
        findings: { viruses: [{ VirusName: "EICAR" }] },
      });
      happyPathSupabase(fake, defaultDocRequest());
      const token = freshToken();
      const res = await POST(
        makeRequest(token, { name: "scan.pdf", type: "application/pdf", body: PDF_BYTES }),
        ctx(token),
      );
      expect(res.status).toBe(422);

      // The bucket must not have been touched — that's the entire point
      // of pre-write scanning.
      expect(fake.find.storage("original-documents", "upload")).toEqual([]);

      // Audit row must be `file.virus_detected_pre_upload` and must
      // include a SHA-256 fingerprint, never the raw filename.
      const audit = fake.find.table("audit_logs", (op) => op.kind === "insert")[0];
      expect(audit).toBeDefined();
      const payload = audit.payload as { action: string; metadata: Record<string, unknown> };
      expect(payload.action).toBe("file.virus_detected_pre_upload");
      expect(payload.metadata.file_name_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(payload.metadata)).not.toContain("scan.pdf");
    });

    it("fails closed with 503 when the scanner errors in production", async () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      setScanVerdict({ status: "error", engine: "cloudmersive", findings: { reason: "no_api_key" } });
      happyPathSupabase(fake, defaultDocRequest());
      const token = freshToken();
      const res = await POST(
        makeRequest(token, { name: "scan.pdf", type: "application/pdf", body: PDF_BYTES }),
        ctx(token),
      );
      expect(res.status).toBe(503);

      const audit = fake.find.table("audit_logs", (op) => op.kind === "insert")[0];
      expect(audit).toBeDefined();
      expect((audit.payload as { action: string }).action).toBe("file.virus_scan_unavailable");
    });

    it("accepts the upload in dev when the scanner returned `error`", async () => {
      (process.env as Record<string, string>).NODE_ENV = "development";
      setScanVerdict({ status: "error", engine: "cloudmersive", findings: { reason: "no_api_key" } });
      happyPathSupabase(fake, defaultDocRequest());
      const token = freshToken();
      const res = await POST(
        makeRequest(token, { name: "scan.pdf", type: "application/pdf", body: PDF_BYTES }),
        ctx(token),
      );
      // Storage write happened, file row inserted → 200.
      expect(res.status).toBe(200);
    });
  });

  // ------------------------------------------------------------------
  // Happy path — the cross-table sync matrix
  // ------------------------------------------------------------------

  describe("happy path", () => {
    it("syncs every downstream row so the firm dashboard reflects the upload", async () => {
      const doc = defaultDocRequest();
      happyPathSupabase(fake, doc, "file-42");
      const token = freshToken();
      // CRON_SECRET is seeded by `tests/register.mjs` so env.cronSecret
      // is "test-cron-secret" for the bearer-header assertion below.

      const res = await POST(
        makeRequest(
          token,
          { name: "passport.pdf", type: "application/pdf", body: PDF_BYTES },
          { request_item_id: "item-1" },
        ),
        ctx(token),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; fileId: string };
      expect(body).toEqual({ ok: true, fileId: "file-42" });

      // 1) original-documents bucket received the buffer with the
      //    DETECTED mime (not the client-claimed one).
      const upload = fake.find.storage("original-documents", "upload")[0];
      expect(upload).toBeDefined();
      const [storageKey, , uploadOptions] = upload.args as [string, unknown, Record<string, unknown>];
      expect(uploadOptions.contentType).toBe("application/pdf");
      // The key embeds the org + matter so an export job can find it.
      expect(storageKey.startsWith("org-1/matter-1/original/")).toBeTrue();

      // 2) uploaded_files row carries every field the dashboard renders.
      const fileInsert = fake.find.table("uploaded_files", (op) => op.kind === "insert")[0];
      expect(fileInsert).toBeDefined();
      const filePayload = fileInsert.payload as Record<string, unknown>;
      expect(filePayload.organization_id).toBe("org-1");
      expect(filePayload.matter_id).toBe("matter-1");
      expect(filePayload.request_id).toBe(doc.id);
      expect(filePayload.request_item_id).toBe("item-1");
      expect(filePayload.client_id).toBe(doc.client_id);
      expect(filePayload.original_file_name).toBe("passport.pdf");
      expect(filePayload.original_mime_type).toBe("application/pdf");
      expect(filePayload.original_storage_path).toBe(storageKey);
      expect(filePayload.uploaded_by_type).toBe("client");
      expect(filePayload.status).toBe("uploaded");
      expect(filePayload.virus_scan_status).toBe("clean");
      expect(filePayload.virus_scanned_at).toBeDefined();

      // 3) document_request_items.status flipped to `uploaded`.
      const itemUpdate = fake.find.table("document_request_items", (op) => op.kind === "update")[0];
      expect(itemUpdate).toBeDefined();
      expect((itemUpdate.payload as { status: string }).status).toBe("uploaded");
      expect(eqArg(itemUpdate, "id")).toBe("item-1");

      // 4) matters.status flipped to in_review, gated to active /
      //    waiting_on_client so a manual completed/archived isn't
      //    overwritten.
      const matterUpdate = fake.find.table("matters", (op) => op.kind === "update")[0];
      expect(matterUpdate).toBeDefined();
      expect((matterUpdate.payload as { status: string }).status).toBe("in_review");
      const matterIn = matterUpdate.calls.find((c) => c.method === "in");
      expect(matterIn?.args[0]).toBe("status");
      expect(matterIn?.args[1]).toEqual(["active", "waiting_on_client"]);

      // 5) document_requests.status flipped to partially_complete except
      //    when previously `submitted`.
      const reqUpdate = fake.find.table("document_requests", (op) => op.kind === "update")[0];
      expect(reqUpdate).toBeDefined();
      expect((reqUpdate.payload as { status: string }).status).toBe("partially_complete");
      const reqNeq = reqUpdate.calls.find((c) => c.method === "neq");
      expect(reqNeq?.args).toEqual(["status", "submitted"]);

      // 6) processing_jobs row enqueued (org + file + jobType=convert).
      const jobInsert = fake.find.table("processing_jobs", (op) => op.kind === "insert")[0];
      expect(jobInsert).toBeDefined();
      const jobPayload = jobInsert.payload as Record<string, unknown>;
      expect(jobPayload.organization_id).toBe("org-1");
      expect(jobPayload.uploaded_file_id).toBe("file-42");
      expect(jobPayload.job_type).toBe("convert");

      // 7) Audit row `file.uploaded` with sha256 fingerprint, ext, mime,
      //    claimed_mime, size, request_id. Critically: NO raw filename.
      const audits = fake.find.table("audit_logs", (op) => op.kind === "insert");
      const fileAudit = audits.find((a) => (a.payload as { action: string }).action === "file.uploaded");
      expect(fileAudit).toBeDefined();
      const auditMeta = (fileAudit!.payload as { metadata: Record<string, unknown> }).metadata;
      expect(auditMeta.file_name_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(auditMeta.file_ext).toBe("pdf");
      expect(auditMeta.mime).toBe("application/pdf");
      expect(auditMeta.claimed_mime).toBe("application/pdf");
      expect(auditMeta.request_id).toBe(doc.id);
      expect(JSON.stringify(auditMeta)).not.toContain("passport.pdf");

      // 8) triggerDrain hit /api/process/run with the cron bearer.
      // The fetch happens "void" (fire and forget) so we yield once to
      // let the microtask drain.
      await new Promise<void>((r) => setTimeout(r, 0));
      expect(fetchSpy).toHaveBeenCalled();
      const [, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["authorization"]).toBe("Bearer test-cron-secret");
    });

    it("ignores request_item_id when it doesn't belong to this request", async () => {
      const doc = defaultDocRequest();
      // Item lookup returns null (the supplied id doesn't match the
      // request). The route must NOT update document_request_items in
      // that case — otherwise a malicious client could mark another
      // matter's checklist item as uploaded.
      fake.on("document_requests", (op) => (op.kind === "select" ? { data: doc, error: null } : { data: null, error: null }));
      fake.on("document_request_items", (op) => (op.kind === "select" ? { data: null, error: null } : { data: null, error: null }));
      fake.on("uploaded_files", (op) => (op.kind === "insert" ? { data: { id: "file-1" }, error: null } : { data: null, error: null }));
      fake.on("matters", () => ({ data: null, error: null }));
      fake.on("processing_jobs", (op) => {
        if (op.kind === "select") return { data: null, error: null };
        if (op.kind === "insert") return { data: { id: "job-1" }, error: null };
        return { data: null, error: null };
      });
      fake.on("audit_logs", () => ({ data: null, error: null }));
      fake.onStorage("original-documents", () => ({ data: { path: "x" }, error: null }));

      const token = freshToken();
      const res = await POST(
        makeRequest(
          token,
          { name: "scan.pdf", type: "application/pdf", body: PDF_BYTES },
          { request_item_id: "item-foreign" },
        ),
        ctx(token),
      );

      expect(res.status).toBe(200);
      const itemUpdates = fake.find.table("document_request_items", (op) => op.kind === "update");
      expect(itemUpdates).toEqual([]);

      // The uploaded_files row must record request_item_id as null since
      // the supplied id was rejected.
      const fileInsert = fake.find.table("uploaded_files", (op) => op.kind === "insert")[0];
      expect((fileInsert.payload as Record<string, unknown>).request_item_id).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // Storage cleanup on DB insert failure
  // ------------------------------------------------------------------

  describe("rollback", () => {
    it("removes the bucket object when uploaded_files.insert fails so no orphan is left behind", async () => {
      fake.on("document_requests", (op) =>
        op.kind === "select" ? { data: defaultDocRequest(), error: null } : { data: null, error: null },
      );
      fake.on("document_request_items", () => ({ data: null, error: null }));
      // Insert fails — the route must clean up the just-uploaded object.
      fake.on("uploaded_files", (op) =>
        op.kind === "insert" ? { data: null, error: { message: "constraint violation" } } : { data: null, error: null },
      );
      fake.on("matters", () => ({ data: null, error: null }));
      fake.on("processing_jobs", () => ({ data: null, error: null }));
      fake.on("audit_logs", () => ({ data: null, error: null }));
      fake.onStorage("original-documents", (op) => {
        if (op.method === "upload") return { data: { path: op.args[0] }, error: null };
        if (op.method === "remove") return { data: [], error: null };
        return { data: null, error: null };
      });

      const token = freshToken();
      const res = await POST(
        makeRequest(token, { name: "scan.pdf", type: "application/pdf", body: PDF_BYTES }),
        ctx(token),
      );

      expect(res.status).toBe(500);
      // The same key that was uploaded must be the same key passed to
      // remove() — otherwise the orphan would still be in the bucket.
      const upload = fake.find.storage("original-documents", "upload")[0];
      const remove = fake.find.storage("original-documents", "remove")[0];
      expect(upload).toBeDefined();
      expect(remove).toBeDefined();
      expect(remove.args[0]).toEqual([upload.args[0]]);
    });
  });

  // ------------------------------------------------------------------
  // Sanity: fixtures referenced above stay in sync with chain shape.
  // ------------------------------------------------------------------

  it("[meta] eqArg helper finds the column filter as expected", () => {
    const op: ChainOpRecord = {
      table: "matters",
      kind: "update",
      payload: null,
      terminal: "await",
      calls: [
        { method: "eq", args: ["id", "matter-1"] },
        { method: "in", args: ["status", ["active", "waiting_on_client"]] },
      ],
    };
    expect(eqArg(op, "id")).toBe("matter-1");
    expect(eqArg(op, "status")).toBeUndefined();
  });
});
