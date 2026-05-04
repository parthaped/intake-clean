-- IntakeClean: core schema
-- All tables use UUID primary keys, created_at/updated_at where appropriate,
-- and reference auth.users via profiles.user_id.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- =================================================================
-- Enums
-- =================================================================
create type plan_tier              as enum ('starter', 'solo', 'firm');
create type subscription_status_t  as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'inactive');
create type profile_role           as enum ('admin', 'paralegal', 'attorney');
create type contact_pref           as enum ('email', 'sms', 'both');
create type matter_type_t          as enum ('immigration', 'family_law', 'personal_injury', 'probate_estate', 'real_estate', 'other');
create type matter_status          as enum ('active', 'waiting_on_client', 'in_review', 'ready_to_export', 'completed', 'archived');
create type request_status         as enum ('draft', 'sent', 'partially_complete', 'submitted', 'closed', 'expired');
create type request_item_status    as enum ('missing', 'uploaded', 'needs_reupload', 'accepted', 'waived');
create type uploaded_file_status   as enum ('uploaded', 'processing', 'needs_review', 'needs_reupload', 'accepted', 'rejected', 'exported');
create type uploader_type          as enum ('client', 'staff');
create type recommendation_t       as enum ('accept', 'review', 'request_reupload');
create type review_status          as enum ('open', 'accepted', 'rejected', 'requested_reupload');
create type message_channel        as enum ('email', 'sms', 'system');
create type message_direction      as enum ('outbound', 'inbound');
create type message_status         as enum ('queued', 'sent', 'sent_mock', 'failed', 'received');
create type export_type            as enum ('pdf_packet', 'zip_folder', 'missing_docs_report');
create type job_type               as enum ('convert', 'ocr_quality', 'classify', 'export');
create type job_status             as enum ('queued', 'running', 'completed', 'failed');
create type actor_type             as enum ('staff', 'client', 'system');

-- =================================================================
-- organizations
-- =================================================================
create table public.organizations (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  slug                     text not null unique,
  logo_url                 text,
  plan                     plan_tier not null default 'starter',
  stripe_customer_id       text unique,
  stripe_subscription_id   text unique,
  subscription_status      subscription_status_t not null default 'trialing',
  storage_limit_mb         integer not null default 5120,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- =================================================================
-- profiles
-- =================================================================
create table public.profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  full_name        text not null,
  role             profile_role not null default 'paralegal',
  avatar_url       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_org_idx on public.profiles(organization_id);

-- =================================================================
-- clients
-- =================================================================
create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  full_name         text not null,
  email             text,
  phone             text,
  preferred_contact contact_pref not null default 'email',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index clients_org_idx on public.clients(organization_id);

-- =================================================================
-- matters
-- =================================================================
create table public.matters (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  client_id           uuid not null references public.clients(id) on delete restrict,
  matter_name         text not null,
  matter_type         matter_type_t not null default 'other',
  internal_reference  text,
  status              matter_status not null default 'active',
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index matters_org_idx on public.matters(organization_id);
create index matters_client_idx on public.matters(client_id);
create index matters_status_idx on public.matters(organization_id, status);

-- =================================================================
-- checklist_templates
-- =================================================================
create table public.checklist_templates (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  name             text not null,
  matter_type      matter_type_t not null,
  description      text,
  is_global        boolean not null default false,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index checklist_templates_org_idx on public.checklist_templates(organization_id);
create index checklist_templates_global_idx on public.checklist_templates(is_global) where is_global = true;

create table public.checklist_template_items (
  id                  uuid primary key default gen_random_uuid(),
  template_id         uuid not null references public.checklist_templates(id) on delete cascade,
  title               text not null,
  description         text,
  required            boolean not null default true,
  accepted_file_types text[] not null default array['pdf','jpg','jpeg','png','heic','webp']::text[],
  sort_order          integer not null default 0
);
create index checklist_template_items_tpl_idx on public.checklist_template_items(template_id);

-- =================================================================
-- document_requests
-- =================================================================
create table public.document_requests (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  matter_id           uuid not null references public.matters(id) on delete cascade,
  client_id           uuid not null references public.clients(id) on delete restrict,
  title               text not null,
  message_to_client   text,
  token               text not null unique,
  status              request_status not null default 'draft',
  expires_at          timestamptz,
  sent_at             timestamptz,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index document_requests_org_idx on public.document_requests(organization_id);
create index document_requests_matter_idx on public.document_requests(matter_id);
create unique index document_requests_token_idx on public.document_requests(token);

create table public.document_request_items (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.document_requests(id) on delete cascade,
  title       text not null,
  description text,
  required    boolean not null default true,
  status      request_item_status not null default 'missing',
  sort_order  integer not null default 0
);
create index document_request_items_req_idx on public.document_request_items(request_id);

-- =================================================================
-- uploaded_files
-- =================================================================
create table public.uploaded_files (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  matter_id                uuid not null references public.matters(id) on delete cascade,
  request_id               uuid references public.document_requests(id) on delete set null,
  request_item_id          uuid references public.document_request_items(id) on delete set null,
  client_id                uuid not null references public.clients(id) on delete restrict,
  original_file_name       text not null,
  original_mime_type       text not null,
  original_storage_path    text not null,
  processed_storage_path   text,
  thumbnail_storage_path   text,
  file_size_bytes          bigint not null,
  page_count               integer,
  detected_document_type   text,
  status                   uploaded_file_status not null default 'uploaded',
  uploaded_by_type         uploader_type not null,
  packet_order             integer,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index uploaded_files_org_idx on public.uploaded_files(organization_id);
create index uploaded_files_matter_idx on public.uploaded_files(matter_id);
create index uploaded_files_request_idx on public.uploaded_files(request_id);
create index uploaded_files_status_idx on public.uploaded_files(organization_id, status);

-- =================================================================
-- quality_checks
-- =================================================================
create table public.quality_checks (
  id                          uuid primary key default gen_random_uuid(),
  uploaded_file_id            uuid not null references public.uploaded_files(id) on delete cascade,
  blur_score                  numeric,
  glare_detected              boolean not null default false,
  low_contrast_detected       boolean not null default false,
  cut_off_edges_detected      boolean not null default false,
  rotated_detected            boolean not null default false,
  screenshot_detected         boolean not null default false,
  handwriting_detected        boolean,
  text_extraction_confidence  numeric,
  issue_summary               text,
  recommendation              recommendation_t not null default 'review',
  raw_ai_json                 jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now()
);
create index quality_checks_file_idx on public.quality_checks(uploaded_file_id);

-- =================================================================
-- review_tasks
-- =================================================================
create table public.review_tasks (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  matter_id         uuid not null references public.matters(id) on delete cascade,
  uploaded_file_id  uuid not null references public.uploaded_files(id) on delete cascade,
  assigned_to       uuid references public.profiles(id) on delete set null,
  status            review_status not null default 'open',
  reviewer_notes    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index review_tasks_org_idx on public.review_tasks(organization_id);
create index review_tasks_matter_idx on public.review_tasks(matter_id);
create index review_tasks_status_idx on public.review_tasks(organization_id, status);

-- =================================================================
-- client_messages
-- =================================================================
create table public.client_messages (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  matter_id            uuid not null references public.matters(id) on delete cascade,
  client_id            uuid not null references public.clients(id) on delete restrict,
  request_id           uuid references public.document_requests(id) on delete set null,
  channel              message_channel not null,
  direction            message_direction not null default 'outbound',
  subject              text,
  body                 text not null,
  status               message_status not null default 'queued',
  provider_message_id  text,
  created_at           timestamptz not null default now()
);
create index client_messages_org_idx on public.client_messages(organization_id);
create index client_messages_matter_idx on public.client_messages(matter_id);

-- =================================================================
-- exports
-- =================================================================
create table public.exports (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  matter_id        uuid not null references public.matters(id) on delete cascade,
  created_by       uuid references public.profiles(id) on delete set null,
  export_type      export_type not null,
  storage_path     text not null,
  summary          text,
  created_at       timestamptz not null default now()
);
create index exports_matter_idx on public.exports(matter_id);

-- =================================================================
-- processing_jobs
-- =================================================================
create table public.processing_jobs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  uploaded_file_id  uuid not null references public.uploaded_files(id) on delete cascade,
  job_type          job_type not null,
  status            job_status not null default 'queued',
  error_message     text,
  attempts          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index processing_jobs_status_idx on public.processing_jobs(status, created_at);
create index processing_jobs_org_idx on public.processing_jobs(organization_id);

-- =================================================================
-- audit_logs
-- =================================================================
create table public.audit_logs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  actor_profile_id   uuid references public.profiles(id) on delete set null,
  actor_type         actor_type not null default 'staff',
  action             text not null,
  entity_type        text not null,
  entity_id          text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs(organization_id, created_at desc);

-- =================================================================
-- updated_at triggers
-- =================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  r record;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'updated_at'
      )
  loop
    execute format(
      'drop trigger if exists set_%I_updated_at on public.%I;
       create trigger set_%I_updated_at before update on public.%I
       for each row execute function public.set_updated_at();',
      r.table_name, r.table_name, r.table_name, r.table_name
    );
  end loop;
end $$;
