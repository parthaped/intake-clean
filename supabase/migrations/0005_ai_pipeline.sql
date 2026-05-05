-- IntakeClean: budget AI pipeline columns + indexes.
-- Adds organization-level AI provider settings, processing/audit columns on
-- uploaded_files / quality_checks / processing_jobs, and supporting indexes.

alter table public.organizations
  add column if not exists ai_provider text not null default 'mock',
  add column if not exists ai_settings jsonb not null default '{}'::jsonb;

alter table public.uploaded_files
  add column if not exists processing_provider       text,
  add column if not exists ocr_text                  text,
  add column if not exists ocr_confidence            numeric,
  add column if not exists classification_confidence numeric,
  add column if not exists classification_source     text,
  add column if not exists ai_cost_estimate_cents    numeric not null default 0;

alter table public.quality_checks
  add column if not exists local_flags   jsonb not null default '{}'::jsonb,
  add column if not exists ocr_engine    text,
  add column if not exists hf_model_used text,
  add column if not exists hf_latency_ms integer,
  add column if not exists raw_ocr_json  jsonb;

alter table public.processing_jobs
  add column if not exists provider     text,
  add column if not exists started_at   timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists latency_ms   integer;

create index if not exists uploaded_files_status_only_idx  on public.uploaded_files(status);
create index if not exists uploaded_files_matter_only_idx  on public.uploaded_files(matter_id);
create index if not exists review_tasks_status_only_idx    on public.review_tasks(status);
create index if not exists processing_jobs_status_only_idx on public.processing_jobs(status);
