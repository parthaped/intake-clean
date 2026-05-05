-- IntakeClean: harden the processing queue.
--
-- 1. Add a `max_attempts` cap so the drainer can re-queue transient failures
--    instead of marking a job permanently `failed` on the first error.
-- 2. Prevent double-enqueue races (e.g. a client retrying an upload) by
--    enforcing at most one in-flight job per uploaded_file via a partial
--    unique index over (queued, running) statuses.
-- 3. Add an index that lets the stale-job sweep find `running` jobs by
--    `started_at` without a sequential scan.

alter table public.processing_jobs
  add column if not exists max_attempts integer not null default 3;

-- Partial unique index: only one queued/running job per uploaded_file.
-- Completed/failed rows can accumulate freely (history).
create unique index if not exists processing_jobs_one_in_flight_per_file_idx
  on public.processing_jobs(uploaded_file_id)
  where status in ('queued', 'running');

create index if not exists processing_jobs_running_started_at_idx
  on public.processing_jobs(started_at)
  where status = 'running';
