-- IntakeClean: row-level security
-- Pattern: every tenant row is keyed by organization_id. Authenticated users
-- can only see rows where organization_id matches their profile's
-- organization_id. The service role (used by server actions) bypasses RLS.

-- Helper to read the caller's organization id once per query.
create or replace function public.current_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_role()
returns profile_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid() limit 1
$$;

-- =================================================================
-- Enable RLS on every public table
-- =================================================================
alter table public.organizations             enable row level security;
alter table public.profiles                  enable row level security;
alter table public.clients                   enable row level security;
alter table public.matters                   enable row level security;
alter table public.checklist_templates       enable row level security;
alter table public.checklist_template_items  enable row level security;
alter table public.document_requests         enable row level security;
alter table public.document_request_items    enable row level security;
alter table public.uploaded_files            enable row level security;
alter table public.quality_checks            enable row level security;
alter table public.review_tasks              enable row level security;
alter table public.client_messages           enable row level security;
alter table public.exports                   enable row level security;
alter table public.processing_jobs           enable row level security;
alter table public.audit_logs                enable row level security;

-- =================================================================
-- organizations: members can read, only admins can update.
-- =================================================================
create policy "org members can read their org"
  on public.organizations for select
  to authenticated
  using (id = public.current_org_id());

create policy "org admins can update their org"
  on public.organizations for update
  to authenticated
  using (id = public.current_org_id() and public.current_role() = 'admin')
  with check (id = public.current_org_id());

-- =================================================================
-- profiles: read members of own org, manage own row, admins manage org.
-- =================================================================
create policy "members can read profiles in their org"
  on public.profiles for select
  to authenticated
  using (organization_id = public.current_org_id());

create policy "users can update own profile"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "admins can manage profiles in their org"
  on public.profiles for all
  to authenticated
  using (organization_id = public.current_org_id() and public.current_role() = 'admin')
  with check (organization_id = public.current_org_id());

-- =================================================================
-- Generic org-scoped policy template for the rest of the tables.
-- Every member can read; staff can mutate within their org.
-- =================================================================
do $$
declare
  t text;
  org_tables text[] := array[
    'clients',
    'matters',
    'checklist_templates',
    'document_requests',
    'document_request_items',
    'uploaded_files',
    'review_tasks',
    'client_messages',
    'exports',
    'processing_jobs',
    'audit_logs'
  ];
begin
  foreach t in array org_tables loop
    -- The two child tables need a join to their parent for org check.
    if t = 'checklist_template_items' then
      continue;
    end if;
    if t = 'document_request_items' then
      execute format($f$
        create policy "org members read %1$s"
          on public.%1$s for select
          to authenticated
          using (
            exists (
              select 1 from public.document_requests dr
              where dr.id = %1$s.request_id
                and dr.organization_id = public.current_org_id()
            )
          );
        create policy "org staff write %1$s"
          on public.%1$s for all
          to authenticated
          using (
            exists (
              select 1 from public.document_requests dr
              where dr.id = %1$s.request_id
                and dr.organization_id = public.current_org_id()
            )
          )
          with check (
            exists (
              select 1 from public.document_requests dr
              where dr.id = %1$s.request_id
                and dr.organization_id = public.current_org_id()
            )
          );
      $f$, t);
    else
      execute format($f$
        create policy "org members read %1$s"
          on public.%1$s for select
          to authenticated
          using (organization_id = public.current_org_id());
        create policy "org staff write %1$s"
          on public.%1$s for all
          to authenticated
          using (organization_id = public.current_org_id())
          with check (organization_id = public.current_org_id());
      $f$, t);
    end if;
  end loop;
end $$;

-- checklist_template_items: scope to parent template's org or global
create policy "members can read template items"
  on public.checklist_template_items for select
  to authenticated
  using (
    exists (
      select 1 from public.checklist_templates t
      where t.id = checklist_template_items.template_id
        and (t.is_global = true or t.organization_id = public.current_org_id())
    )
  );

create policy "staff can write template items in their org"
  on public.checklist_template_items for all
  to authenticated
  using (
    exists (
      select 1 from public.checklist_templates t
      where t.id = checklist_template_items.template_id
        and t.organization_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.checklist_templates t
      where t.id = checklist_template_items.template_id
        and t.organization_id = public.current_org_id()
    )
  );

-- Allow read of global templates (organization_id is null).
create policy "members can read global templates"
  on public.checklist_templates for select
  to authenticated
  using (is_global = true);

-- quality_checks: scope to parent file's org
create policy "org members read quality_checks"
  on public.quality_checks for select
  to authenticated
  using (
    exists (
      select 1 from public.uploaded_files f
      where f.id = quality_checks.uploaded_file_id
        and f.organization_id = public.current_org_id()
    )
  );

create policy "org staff write quality_checks"
  on public.quality_checks for all
  to authenticated
  using (
    exists (
      select 1 from public.uploaded_files f
      where f.id = quality_checks.uploaded_file_id
        and f.organization_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.uploaded_files f
      where f.id = quality_checks.uploaded_file_id
        and f.organization_id = public.current_org_id()
    )
  );
