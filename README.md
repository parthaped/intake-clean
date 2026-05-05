# IntakeClean

> Stop cleaning up client screenshots and blurry document photos.

IntakeClean is a client document cleanup platform for small law firms, paralegals, and legal assistants. It gives firm staff one clean upload link to send to the client. The client uploads whatever they have. The system converts, checks, labels, organizes, and flags unusable files before they hit the firm's case file.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS + shadcn/ui + lucide-react + Framer Motion
- Supabase (Auth, Postgres, Storage, RLS)
- pdf-lib · sharp · heic-convert · archiver
- **Document AI pipeline (budget tier):**
  - Layer 1 — sharp / heic-convert / pdf-lib for deterministic preprocessing
  - Layer 2 — `tesseract.js` for local OCR
  - Layer 3 — rule-based document type + quality detection
  - Layer 4 — optional `@huggingface/inference` (HF Inference Providers or a private Inference Endpoint) for ambiguous classification or client-friendly re-upload reasons
- Optional: Resend · Twilio · Stripe — all of which fall back to in-app mocks when their env vars are missing, so the demo runs with **only Supabase configured**.

## Quick start

```bash
npm install
cp .env.example .env.local
# fill in Supabase keys (see options below); leave AI keys blank for mock demo
npm run dev
```

Open http://localhost:3000.

### Supabase, option A — hosted project

1. Create a project at https://supabase.com.
2. Copy `Project URL`, `Publishable` (or `anon`) key, and `Secret` (or `service_role`) key into `.env.local`.
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
items, and **two seeded `uploaded_files`** with mock OCR text + quality flags so the review
queue has data the moment you sign in. Login with the email + password above, then click
into the only matter to see the full workflow.

## Document AI pipeline

The default mode is `AI_PROVIDER=mock` + `MOCK_AI=true`, which uses no external services and
is suitable for demos and CI. To turn on real AI:

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `mock` \| `local_ocr_only` \| `huggingface_provider` \| `huggingface_endpoint` |
| `OCR_ENGINE` | `tesseract` (default) \| `paddleocr` (future) \| `mock` \| `none` |
| `USE_LOCAL_OCR` | Run tesseract.js on uploaded images |
| `USE_HF_CLASSIFICATION` | Call HF when local rules can't classify confidently |
| `USE_HF_EXPLANATIONS` | Allow staff to ask HF to rewrite re-upload reasons |
| `HF_TOKEN` | Hugging Face Inference Providers token (required for HF) |
| `HF_INFERENCE_ENDPOINT_URL` | Optional private Inference Endpoint URL |
| `HF_DOCUMENT_MODEL` | Default: `docling-project/SmolDocling-256M-preview` |
| `HF_VISION_MODEL` | Default: `Qwen/Qwen2.5-VL-7B-Instruct` |
| `HF_TEXT_MODEL` | Default: `Qwen/Qwen2.5-3B-Instruct` |

Per-firm settings (set in `/dashboard/settings`) override env defaults.

> AI checks are assistive only. Firm staff must review every document before use.

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
| Hugging Face      | `HF_TOKEN` and/or `HF_INFERENCE_ENDPOINT_URL`   | Provider falls back to local rules; UI badges "Mock analysis"        |
| Tesseract.js OCR  | bundled with the app                            | First call downloads ~10 MB of `eng` traineddata and caches it       |
| Resend            | `RESEND_API_KEY`                                | Email logged to console; row stored with `status='sent_mock'`        |
| Twilio            | `TWILIO_*`                                      | SMS logged to console; row stored with `status='sent_mock'`          |
| Stripe            | `STRIPE_*` + `DEV_BYPASS_BILLING=true`          | Org is treated as `subscription_status='active'`                     |

## Acceptance disclaimer

AI checks are assistive only. Firm staff must review every document before use. IntakeClean
helps organize documents and does not provide legal advice. Do not rely on IntakeClean to
determine legal sufficiency of a filing.
