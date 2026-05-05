-- IntakeClean: subscription cancellation tracking.
--
-- We let users self-serve cancellation (Stripe `cancel_at_period_end = true`)
-- so that:
--   - the next invoice is not charged,
--   - the firm keeps full access until the current period ends,
--   - if they change their mind they can resume before the period ends.
--
-- For our own analytics we also persist a structured cancellation feedback
-- row each time a user cancels: a checkbox-list of reasons + an optional
-- free-form comment. This is the kind of data we look at to figure out
-- which features to ship next.

-- =================================================================
-- organizations: track Stripe period boundary + cancel-at-period-end
-- =================================================================
-- `current_period_end` lets the billing UI render "Access ends Mar 31" in
-- the same units we're given by Stripe, instead of approximating from the
-- last invoice. `cancel_at_period_end` mirrors the Stripe subscription flag
-- so we can show the "Subscription ending — Resume" CTA without having to
-- hit Stripe on every page render.
alter table public.organizations
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists current_period_end timestamptz;

-- =================================================================
-- subscription_cancellation_feedback
-- =================================================================
create table if not exists public.subscription_cancellation_feedback (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  profile_id               uuid references public.profiles(id) on delete set null,
  stripe_subscription_id   text,
  plan                     plan_tier,
  -- Multi-select reason codes (e.g. `too_expensive`, `missing_features`).
  -- Stored as text[] so analytics can `unnest()` cleanly without JSON
  -- gymnastics and so the column is searchable with GIN if we ever need it.
  reasons                  text[] not null default '{}',
  comment                  text,
  created_at               timestamptz not null default now()
);

create index if not exists subscription_cancellation_feedback_org_idx
  on public.subscription_cancellation_feedback(organization_id);

create index if not exists subscription_cancellation_feedback_created_at_idx
  on public.subscription_cancellation_feedback(created_at desc);

-- =================================================================
-- RLS: feedback is org-scoped. Members of the org can read their own
-- firm's feedback (so an admin viewing their own audit trail works).
-- All writes go through the service role from the cancel server action.
-- =================================================================
alter table public.subscription_cancellation_feedback enable row level security;

create policy "org members can read their cancellation feedback"
  on public.subscription_cancellation_feedback for select
  to authenticated
  using (organization_id = public.current_org_id());
