/**
 * Unit tests for `enqueueProcessingJob`. The function is a thin DB layer
 * but it has surprisingly subtle correctness properties: idempotent for
 * in-flight work, race-safe via the partial unique index in migration
 * 0006, and most importantly — it must never throw after a successful
 * upload-row write, because the upload route uses its return value as the
 * job-id breadcrumb and a thrown exception there would surface as a 500
 * on a *successful* upload (the user uploaded fine, but sees an error).
 *
 * We use the chainable fake from `fake-supabase.ts` and replace
 * `getServiceSupabase` per spec via `spyOn`.
 */
import { enqueueProcessingJob } from "@/lib/processing/queue";

import { createFakeSupabase, eqArg } from "../../helpers/fake-supabase";
import { resetTestSupabaseClient, setTestSupabaseClient } from "../../helpers/supabase-service-stub-bridge";

describe("processing/queue: enqueueProcessingJob", () => {
  let fake: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    fake = createFakeSupabase();
    setTestSupabaseClient(fake.client);
  });

  afterEach(() => {
    resetTestSupabaseClient();
  });

  describe("argument validation", () => {
    it("throws on empty organizationId", async () => {
      await expectAsync(
        enqueueProcessingJob({ organizationId: "", uploadedFileId: "file-1" }),
      ).toBeRejectedWithError(/organizationId is required/);
    });

    it("throws on whitespace-only uploadedFileId", async () => {
      await expectAsync(
        enqueueProcessingJob({ organizationId: "org-1", uploadedFileId: "   " }),
      ).toBeRejectedWithError(/uploadedFileId is required/);
    });
  });

  describe("idempotency", () => {
    it("returns the existing job id without inserting when one is already queued", async () => {
      fake.on("processing_jobs", (op) => {
        if (op.kind === "select") return { data: { id: "existing-1" }, error: null };
        return { data: null, error: null };
      });

      const id = await enqueueProcessingJob({
        organizationId: "org-1",
        uploadedFileId: "file-1",
      });

      expect(id).toBe("existing-1");
      // No insert was attempted.
      expect(fake.find.table("processing_jobs", (o) => o.kind === "insert")).toEqual([]);
      // The dedupe lookup must filter on `uploaded_file_id` AND
      // `status IN [queued, running]` — otherwise we'd reuse a `failed`
      // or `completed` job and silently skip work.
      const lookup = fake.find.table("processing_jobs", (o) => o.kind === "select")[0];
      expect(eqArg(lookup, "uploaded_file_id")).toBe("file-1");
      const inFilter = lookup.calls.find((c) => c.method === "in");
      expect(inFilter?.args[0]).toBe("status");
      expect(inFilter?.args[1]).toEqual(["queued", "running"]);
    });

    it("inserts a new row when no in-flight job exists", async () => {
      let selectCount = 0;
      fake.on("processing_jobs", (op) => {
        if (op.kind === "select") {
          selectCount += 1;
          // First select is the dedupe lookup; nothing exists yet.
          return { data: null, error: null };
        }
        if (op.kind === "insert") {
          return { data: { id: "new-1" }, error: null };
        }
        return { data: null, error: null };
      });

      const id = await enqueueProcessingJob({
        organizationId: "org-1",
        uploadedFileId: "file-1",
      });

      expect(id).toBe("new-1");
      expect(selectCount).toBe(1);
      const insert = fake.find.table("processing_jobs", (o) => o.kind === "insert")[0];
      expect(insert).toBeDefined();
      const payload = insert.payload as Record<string, unknown>;
      expect(payload.organization_id).toBe("org-1");
      expect(payload.uploaded_file_id).toBe("file-1");
      expect(payload.job_type).toBe("convert");
      expect(payload.status).toBe("queued");
    });

    it("uses a custom job_type when supplied", async () => {
      fake.on("processing_jobs", (op) => {
        if (op.kind === "select") return { data: null, error: null };
        if (op.kind === "insert") return { data: { id: "new-2" }, error: null };
        return { data: null, error: null };
      });

      await enqueueProcessingJob({
        organizationId: "org-1",
        uploadedFileId: "file-2",
        jobType: "classify",
      });

      const insert = fake.find.table("processing_jobs", (o) => o.kind === "insert")[0];
      expect((insert.payload as { job_type: string }).job_type).toBe("classify");
    });
  });

  describe("23505 unique-violation race recovery", () => {
    it("re-reads and returns the winner when a concurrent insert beats us to the punch", async () => {
      let selectCount = 0;
      fake.on("processing_jobs", (op) => {
        if (op.kind === "select") {
          selectCount += 1;
          // 1st: dedupe lookup → empty (we think we can insert)
          // 2nd: re-read after the 23505 → winner exists
          if (selectCount === 1) return { data: null, error: null };
          return { data: { id: "winner-1" }, error: null };
        }
        if (op.kind === "insert") {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        return { data: null, error: null };
      });

      const id = await enqueueProcessingJob({
        organizationId: "org-1",
        uploadedFileId: "file-3",
      });

      expect(id).toBe("winner-1");
    });

    it("falls back to the most-recent job for the file when the winner already moved out of (queued, running)", async () => {
      // Race timing: 23505 fires, but by the time we re-read the unique
      // index, the winner already finished and moved to `completed`. We
      // MUST still return a real id rather than throwing — the upload
      // route already wrote the bucket+row, and this is just a job-id
      // breadcrumb for the queued processor.
      let selectCount = 0;
      fake.on("processing_jobs", (op) => {
        if (op.kind === "select") {
          selectCount += 1;
          if (selectCount === 1) return { data: null, error: null }; // dedupe
          if (selectCount === 2) return { data: null, error: null }; // re-read winner: gone
          // 3rd select: most-recent fallback
          return { data: { id: "completed-1", status: "completed" }, error: null };
        }
        if (op.kind === "insert") {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        return { data: null, error: null };
      });

      const id = await enqueueProcessingJob({
        organizationId: "org-1",
        uploadedFileId: "file-4",
      });

      expect(id).toBe("completed-1");
    });

    it("propagates non-23505 insert errors", async () => {
      fake.on("processing_jobs", (op) => {
        if (op.kind === "select") return { data: null, error: null };
        if (op.kind === "insert") {
          return { data: null, error: { code: "23503", message: "foreign key violation" } };
        }
        return { data: null, error: null };
      });

      await expectAsync(
        enqueueProcessingJob({ organizationId: "org-1", uploadedFileId: "file-5" }),
      ).toBeRejectedWithError(/foreign key violation/);
    });
  });
});
