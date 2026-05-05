# Cron schedules

Vercel Cron entries live in `vercel.json`. Two are configured:

| Path | Purpose | Hobby schedule | Pro schedule (recommended) |
| --- | --- | --- | --- |
| `/api/process/run` | Drains the document-processing queue. Long-tail safety net only — the upload route already calls this inline (`src/app/api/upload/[token]/route.ts`) so newly uploaded files are normally processed within seconds, not on the cron interval. | `0 6 * * *` (daily 06:00 UTC) | `*/2 * * * *` (every 2 minutes) |
| `/api/cron/audit-retention` | Deletes `audit_logs` rows older than 730 days to honour the privacy policy. | `0 5 * * *` (daily 05:00 UTC) | `0 5 * * *` (no change — daily is sufficient) |

## Why the Hobby compromise is safe

The processing cron is a *fallback*. The fast path is:

1. Client POSTs to `/api/upload/[token]/route.ts`.
2. That route enqueues a `processing_jobs` row.
3. Before responding, it fires `fetch('/api/process/run', { method: 'POST' })`
   with the `Authorization: Bearer ${CRON_SECRET}` header (best-effort,
   does not block the response).
4. The drain runs the job and persists the result.

The cron only matters if step 3 failed — e.g. an in-flight serverless
function got recycled, the inline drain timed out, or a transient error
left jobs `queued`. A daily sweep is sufficient to catch these
edge-cases.

If we observe production lag (jobs sitting in `queued` for > 1h), the
right escalation order is:

1. Inspect the most recent `processing_jobs.failed` rows for a common
   error (the inline path may be hitting a real bug).
2. Manually invoke `/api/process/run` with the bearer token to drain
   immediately.
3. Move to Pro and restore `*/2 * * * *`.

## How to flip back to per-2-minute cadence on Pro

1. Upgrade the Vercel project to the Pro plan.
2. Edit `vercel.json` so the `/api/process/run` schedule reads
   `"*/2 * * * *"`.
3. Re-deploy. Vercel applies the new schedule on the next deployment.

There is no app-side change required — both routes already accept any
cadence; the schedule lives entirely in `vercel.json`.

## Schedule cheat-sheet (cron syntax)

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, 0 = Sunday)
│ │ │ │ │
* * * * *
```

Common patterns:

- `*/2 * * * *` — every 2 minutes (Pro only)
- `0 * * * *` — every hour on the hour
- `0 6 * * *` — once a day at 06:00 UTC
- `0 0 * * 0` — once a week on Sunday at 00:00 UTC

## Related

- `src/app/api/process/run/route.ts` — the processor route (auth gated by `verifyCronToken`).
- `src/app/api/cron/audit-retention/route.ts` — retention sweeper.
- `src/lib/security/cron-auth.ts` — constant-time bearer comparison.
- `tests/jasmine/spec/security/cron-auth.spec.ts` — pen-tests for the comparison.
