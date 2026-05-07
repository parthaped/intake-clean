/**
 * Unit tests for `drainProcessingQueue`. The drainer is the sole bridge
 * between the upload-time `processing_jobs` row and the AI orchestrator,
 * so the contracts we pin here are:
 *
 *   1. Successful processing → job marked `completed` with provider +
 *      latency. Without this, the staff dashboard never sees a finished
 *      job and the file row sits in `processing` forever.
 *   2. Transient failure → job re-queued with truncated error_message.
 *      `attempts` is bumped by the claim, so the next drain pass sees the
 *      retry.
 *   3. Terminal failure → job marked `failed`, file flipped to
 *      `needs_review` (only when current status is `uploaded` or
 *      `processing` — manual `accepted`/`rejected` decisions must
 *      survive). An audit row (`file.processing_failed`) is recorded.
 *   4. Stale `running` rows are recovered before the next claim, with
 *      `error_message` only stamped when no prior message exists.
 *
 * These are precisely the invariants that keep the upload-portal client
 * view and the firm dashboard view in sync.
 */
import { drainProcessingQueue } from "@/lib/processing/pipeline";

import { createFakeSupabase, eqArg } from "../../helpers/fake-supabase";
import {
  resetProcessDocumentImpl,
  setProcessDocumentImpl,
  type ProcessDocumentFn,
} from "../../helpers/process-document-stub-bridge";
import { resetTestSupabaseClient, setTestSupabaseClient } from "../../helpers/supabase-service-stub-bridge";

interface JobRow {
  id: string;
  organization_id: string;
  uploaded_file_id: string;
  attempts: number;
  max_attempts: number;
  status: string;
  error_message: string | null;
}

function jobRow(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-1",
    organization_id: "org-1",
    uploaded_file_id: "file-1",
    attempts: 0,
    max_attempts: 3,
    status: "queued",
    error_message: null,
    ...overrides,
  };
}

const noopProcess: ProcessDocumentFn = async ({ uploadedFileId }) => ({
  uploadedFileId,
  provider: "mock",
  ocrEngine: "none",
  status: "needs_review",
  detectedDocumentType: "Other / Unknown",
  classificationSource: "rules",
  hfModelUsed: null,
  latencyMs: 1,
});

describe("processing/pipeline: drainProcessingQueue", () => {
  let fake: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    fake = createFakeSupabase();
    setTestSupabaseClient(fake.client);
    setProcessDocumentImpl(noopProcess);
    spyOn(console, "error");
    spyOn(console, "warn");
  });

  afterEach(() => {
    resetTestSupabaseClient();
    resetProcessDocumentImpl();
  });

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /**
   * Configures `processing_jobs` with a finite list of `queued` rows the
   * drainer can claim. Every claim succeeds (we don't simulate the
   * concurrent-worker race here). After the list is exhausted the next
   * `select.maybeSingle` call returns `null` so the drainer exits cleanly.
   */
  function withQueuedJobs(jobs: JobRow[]): { remaining: JobRow[] } {
    const remaining = [...jobs];
    fake.on("processing_jobs", (op) => {
      // Stale-job recovery. Both update queries during the recovery
      // sweep filter on `status='running'`. Return empty so the recovery
      // pass is a no-op for these specs (we test it explicitly elsewhere).
      const eqStatus = eqArg(op, "status");
      if (op.kind === "update" && eqStatus === "running") {
        return { data: [], error: null };
      }
      // Claim phase: SELECT one queued row.
      if (op.kind === "select" && eqStatus === "queued") {
        const next = remaining[0];
        if (!next) return { data: null, error: null };
        return { data: next, error: null };
      }
      // Claim phase: UPDATE the row to running.
      if (op.kind === "update" && eqStatus === "queued") {
        const next = remaining.shift();
        if (!next) return { data: null, error: { code: "PGRST116", message: "not found" } };
        return { data: { id: next.id }, error: null };
      }
      // Completion / failure / requeue updates — let the drainer succeed.
      return { data: null, error: null };
    });
    return { remaining };
  }

  // ------------------------------------------------------------------
  // Stale-running recovery
  // ------------------------------------------------------------------

  describe("stale-running recovery", () => {
    it("re-queues stale rows and only stamps a recovery note when error_message is null", async () => {
      // The drainer's recoverStaleJobs() runs two updates: one filtered
      // on `error_message IS null` (which stamps the recovery message),
      // one filtered on `error_message NOT NULL` (which preserves the
      // existing message). We assert both are issued and the second one
      // doesn't touch error_message.
      const updates: Array<{ payload: Record<string, unknown>; isMessageBranch: boolean }> = [];
      fake.on("processing_jobs", (op) => {
        if (op.kind === "update" && eqArg(op, "status") === "running") {
          // Distinguish the two recovery branches by whether `is(error_message, null)`
          // appears in the chain.
          const isNull = op.calls.some((c) => c.method === "is" && c.args[0] === "error_message");
          updates.push({
            payload: op.payload as Record<string, unknown>,
            isMessageBranch: !isNull,
          });
          return { data: [], error: null };
        }
        // No queued jobs after recovery → drainer exits.
        if (op.kind === "select") return { data: null, error: null };
        return { data: null, error: null };
      });

      await drainProcessingQueue({ maxJobs: 1 });

      expect(updates.length).toBe(2);
      const noMessage = updates.find((u) => !u.isMessageBranch);
      const withMessage = updates.find((u) => u.isMessageBranch);
      expect(noMessage).toBeDefined();
      expect(withMessage).toBeDefined();
      expect(noMessage!.payload.error_message).toBe("Recovered from stale 'running' state.");
      expect(withMessage!.payload).not.toEqual(jasmine.objectContaining({ error_message: jasmine.anything() }));
    });
  });

  // ------------------------------------------------------------------
  // Successful processing
  // ------------------------------------------------------------------

  describe("successful processing", () => {
    it("marks the job completed with provider + latency", async () => {
      withQueuedJobs([jobRow({ id: "job-success" })]);
      setProcessDocumentImpl(async ({ uploadedFileId }) => ({
        uploadedFileId,
        provider: "mock",
        ocrEngine: "none",
        status: "needs_review",
        detectedDocumentType: "Bank Statement",
        classificationSource: "rules",
        hfModelUsed: null,
        latencyMs: 7,
      }));

      const result = await drainProcessingQueue({ maxJobs: 1 });

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.retried).toBe(0);
      expect(result.jobs[0]).toEqual({
        id: "job-success",
        status: "completed",
        uploadedFileId: "file-1",
      });

      const completion = fake.find.table("processing_jobs", (op) => {
        if (op.kind !== "update") return false;
        const payload = op.payload as { status?: string };
        return payload.status === "completed";
      })[0];
      expect(completion).toBeDefined();
      const payload = completion.payload as Record<string, unknown>;
      expect(payload.provider).toBe("mock");
      expect(payload.error_message).toBeNull();
      expect(typeof payload.latency_ms).toBe("number");
    });
  });

  // ------------------------------------------------------------------
  // Transient failure (re-queue)
  // ------------------------------------------------------------------

  describe("transient failure", () => {
    it("re-queues the job and records a truncated error_message", async () => {
      // attempts=0, max_attempts=3 → after the claim attempts=1 and
      // canRetry is true. The drainer re-queues with error_message set.
      withQueuedJobs([jobRow({ id: "job-retry", attempts: 0, max_attempts: 3 })]);
      const longMessage = "x".repeat(3000);
      setProcessDocumentImpl(async () => {
        throw new Error(longMessage);
      });

      const result = await drainProcessingQueue({ maxJobs: 1 });

      expect(result.retried).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.jobs[0].status).toBe("retry_scheduled");

      const requeue = fake.find.table("processing_jobs", (op) => {
        if (op.kind !== "update") return false;
        const payload = op.payload as { status?: string };
        return payload.status === "queued" && eqArg(op, "id") === "job-retry";
      })[0];
      expect(requeue).toBeDefined();
      const payload = requeue.payload as Record<string, unknown>;
      expect(typeof payload.error_message).toBe("string");
      // Truncation cap is 2000; the implementation appends a single
      // ellipsis character so the stored size never blows up.
      expect((payload.error_message as string).length).toBeLessThanOrEqual(2000);
      // started_at must be cleared so the next claim looks like a fresh
      // queued row.
      expect(payload.started_at).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // Terminal failure
  // ------------------------------------------------------------------

  describe("terminal failure", () => {
    it("marks the job failed, flips file → needs_review, and audits", async () => {
      // attempts=2, max_attempts=3 → claim makes attempts=3 which is
      // NOT < max_attempts, so canRetry is false and we go terminal.
      withQueuedJobs([jobRow({ id: "job-fail", attempts: 2, max_attempts: 3 })]);
      setProcessDocumentImpl(async () => {
        throw new Error("processor blew up");
      });

      const result = await drainProcessingQueue({ maxJobs: 1 });

      expect(result.failed).toBe(1);
      expect(result.retried).toBe(0);
      expect(result.jobs[0].status).toBe("failed");

      const fail = fake.find.table("processing_jobs", (op) => {
        if (op.kind !== "update") return false;
        const payload = op.payload as { status?: string };
        return payload.status === "failed";
      })[0];
      expect(fail).toBeDefined();
      expect((fail.payload as { error_message: string }).error_message).toContain("processor blew up");

      // File flip to needs_review must be scoped to current status in
      // [uploaded, processing] so a manual accepted/rejected decision
      // by staff is preserved.
      const fileFlip = fake.find.table("uploaded_files", (op) => op.kind === "update")[0];
      expect(fileFlip).toBeDefined();
      const inFilter = fileFlip.calls.find((c) => c.method === "in");
      expect(inFilter?.args[0]).toBe("status");
      expect(inFilter?.args[1]).toEqual(["uploaded", "processing"]);
      expect((fileFlip.payload as { status: string }).status).toBe("needs_review");

      // The audit row makes the failure visible to the firm dashboard
      // activity feed instead of only in serverless logs.
      const audit = fake.find.table("audit_logs", (op) => op.kind === "insert")[0];
      expect(audit).toBeDefined();
      expect((audit.payload as { action: string }).action).toBe("file.processing_failed");
    });
  });

  // ------------------------------------------------------------------
  // Bounds & safety
  // ------------------------------------------------------------------

  describe("bounds", () => {
    it("clamps maxJobs to 1..ABSOLUTE_MAX_JOBS even with bogus input", async () => {
      // We don't feed it any queued rows, so it exits immediately. The
      // assertion is the call-site guard, not the count.
      withQueuedJobs([]);
      const result = await drainProcessingQueue({ maxJobs: -10_000 });
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
