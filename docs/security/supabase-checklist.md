# Supabase production hardening checklist

Items below MUST be verified in the Supabase Dashboard for every project that
hosts real customer data. Code-side guards exist for everything in this list,
but they are no substitute for the project-level controls.

Re-run this checklist:

- before launching to a new firm,
- after restoring from backup,
- quarterly during the access review.

Treat anything missing as a P0 launch blocker.

## Auth

- [ ] **Confirm email** is required. _Auth -> Providers -> Email -> "Confirm email" = ON_.
- [ ] **Multi-Factor Authentication** is enabled with TOTP. _Auth -> Multi-Factor Authentication -> "TOTP factor" = ON_. (The app enforces MFA for `admin` + `attorney` roles in `src/lib/security/mfa.ts`; the project-level toggle is what makes the API call usable.)
- [ ] **Password policy**: min length 12, "Leaked password protection" (HIBP) = ON. _Auth -> Password_.
- [ ] **Session lifetime**: access token TTL `3600s` (1h), refresh tokens rotate. _Auth -> Sessions_.
- [ ] **Rate limits**: signup, sign-in, magic link, OTP all configured. _Auth -> Rate Limits_.
- [ ] **OAuth providers**: only the providers your firm actually uses are enabled (default = email + password only).
- [ ] **Site URL** matches the production domain. _Auth -> URL Configuration_.
- [ ] **Redirect allow-list** includes only the production domain (and Vercel preview if you grant preview access — usually you should not).

## Database

- [ ] **Point-In-Time Recovery (PITR)** is on. _Database -> Backups -> "Point-In-Time Recovery"_. PITR is a Pro-tier feature; the cost is the cheapest insurance you can buy for legal data.
- [ ] **Daily backups** retention >= 14 days.
- [ ] Run a **restore drill** before launch. Spin up a temp project, restore, verify data integrity, then delete.
- [ ] **Database Advisor** has zero RLS warnings. _Database -> Advisor_. Re-check weekly.
- [ ] **Query Performance** shows no obvious sequential scans on large tables. Add indexes from advisor's suggestions.

## Storage

- [ ] All four buckets (`original-documents`, `processed-documents`, `thumbnails`, `exports`) are `public = false`. (The migration enforces this; verify in _Storage_ tab.)
- [ ] Object-level RLS policies exist (the org-prefix policies in `0002_storage_buckets.sql`).
- [ ] Storage usage alerting is on (`Settings -> Usage -> Notifications`).

## Network

- [ ] **Network restrictions** on the database — production-domain CIDR only when you do not need direct connections from anywhere else. _Database -> Network Restrictions_.
- [ ] **PgBouncer connection pooling** mode is `transaction` (not `session`) for serverless workloads.
- [ ] **SSL enforcement** = required on all DB connections.

## Logs & monitoring

- [ ] Log Drains configured to your aggregation tool (Datadog / Vercel Observability / Better Stack). _Project Settings -> Log Drains_.
- [ ] Auth log retention >= 90 days for incident response.
- [ ] Anomaly alerts on: failed-sign-in spikes, MFA-disable events, role-change events.

## Secrets

- [ ] No `SUPABASE_SECRET_KEY` (or legacy `SERVICE_ROLE_KEY`) is exposed under any `NEXT_PUBLIC_*` env var on Vercel.
- [ ] Service-role key has been rotated within the last 90 days.

## Vendor agreements

- [ ] DPA signed with Supabase (<https://supabase.com/legal/dpa>).
- [ ] Region documented in `legal/policies/07-subprocessor-list.md` matches the actual Supabase project region.
