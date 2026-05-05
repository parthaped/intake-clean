-- IntakeClean: Stripe webhook idempotency.
--
-- Stripe explicitly delivers each event "at least once" — the same event id
-- can arrive multiple times after a transient receiver failure, after a
-- replay, or when an operator resends from the dashboard. Without a record
-- of which events we've already processed, every redelivery would:
--
--   - re-write organizations.plan / storage_limit_mb (idempotent for the
--     state, but stomps any manual override that landed between deliveries),
--   - emit duplicate audit_logs rows (`billing.subscription_updated`),
--   - run the side-effects for `checkout.session.completed` (customer-id
--     write) more than once.
--
-- We persist a row per event id with the time we first processed it. The
-- webhook handler does an INSERT ... ON CONFLICT DO NOTHING and short-circuits
-- when the row already exists.
--
-- Rows older than 60 days can be pruned by an external job; the timestamp is
-- there so we can do that without losing recent dedupe coverage.

create table if not exists public.stripe_processed_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists stripe_processed_events_processed_at_idx
  on public.stripe_processed_events(processed_at);
