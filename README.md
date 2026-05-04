# IntakeClean

> Stop cleaning up client screenshots and blurry document photos.

IntakeClean is a client document cleanup platform for small law firms, paralegals, and legal assistants. It gives firm staff one clean upload link to send to the client. The client uploads whatever they have. The system converts, checks, labels, organizes, and flags unusable files before they hit the firm's case file.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS + shadcn/ui + lucide-react + Framer Motion
- Supabase (Auth, Postgres, Storage, RLS)
- pdf-lib · sharp · heic-convert · archiver
- Optional: Google Document AI · OpenAI · Resend · Twilio · Stripe — all of which fall back to in-app mocks when their env vars are missing, so the demo runs with **only Supabase configured**.

## Quick start

```bash
npm install
cp .env.example .env.local
# fill in Supabase keys (see options below)
npm run dev
```

Open http://localhost:3000.

### Supabase, option A — hosted project

1. Create a project at https://supabase.com.
2. Copy `Project URL`, `anon` key, and `service_role` key into `.env.local`.
3. Run the migrations from `supabase/migrations/` in order using either:
   - The Supabase SQL editor (paste each file), or
   - The Supabase CLI: `supabase link --project-ref <ref> && supabase db push`.

### Supabase, option B — local Docker via the CLI

```bash
brew install supabase/tap/supabase   # or see supabase.com/docs for other OSes
supabase start                       # boots Postgres + Auth + Storage + Studio in Docker
```

The CLI prints the local URL + anon + service_role keys; copy them into `.env.local`. Migrations in `supabase/migrations/` are applied automatically by `supabase start` and `supabase db reset`.

## Demo data

```bash
SEED_USER_EMAIL=demo@intakeclean.test SEED_USER_PASSWORD=intakecleanDEMO!42 npm run seed
```

Reads `.env.local`, creates the seed auth user (idempotent), then provisions a sample firm
("Garcia Immigration Law"), a profile, a client, a sent document request, four checklist
items in varying states, and a couple of audit log entries. Login with the email + password
above, then click into the only matter to see the full workflow.

## Working offline / without integrations

- `DEV_BYPASS_BILLING=true` — Stripe checkout is short-circuited and every org behaves as if
  it has an active subscription, so you can create and edit matters freely.
- `ADMIN_DEBUG=true` — adds a "Dev tools" entry in the sidebar (admin role only) that surfaces
  integration mock state and a button to drain the processing queue.
- All external integrations log to the console with a `[mock-…]` prefix when their keys are
  missing.

## Mock fallbacks

| Integration       | Required env                                    | What happens when missing                                            |
| ----------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Google Document AI| `GOOGLE_DOCUMENT_AI_*`, `GOOGLE_APPLICATION_…`  | Mock processor returns realistic flags, badged "Mock analysis"       |
| OpenAI            | `OPENAI_API_KEY`                                | Rule-based document type classification + canned reasons             |
| Resend            | `RESEND_API_KEY`                                | Email logged to console; row stored with `status='sent_mock'`        |
| Twilio            | `TWILIO_*`                                      | SMS logged to console; row stored with `status='sent_mock'`          |
| Stripe            | `STRIPE_*` + `DEV_BYPASS_BILLING=true`          | Org is treated as `subscription_status='active'`                     |

## Acceptance disclaimer

IntakeClean helps organize documents and does not provide legal advice. All AI classifications and quality checks must be reviewed by firm staff. Do not rely on IntakeClean to determine legal sufficiency of a filing.
