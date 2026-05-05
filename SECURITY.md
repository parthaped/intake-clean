# Security Policy

IntakeClean handles sensitive client documents on behalf of law firms — passports, government IDs, financial records, medical records, and similar PII. We treat security reports as urgent and respond promptly.

## Reporting a vulnerability

**Email:** `security@CONTACT-EMAIL` (replace with your published address before launch)
**PGP key:** _publish a PGP key fingerprint here once one is generated_
**Response window:**

| Step | Target |
| --- | --- |
| Acknowledge receipt | within **2 business days** |
| Initial triage + severity assessment | within **5 business days** |
| Status update cadence while in progress | every **7 calendar days** |
| Coordinated disclosure window | **90 days** from acknowledgement (extendable by mutual agreement) |

If the issue involves an active compromise, an exposed credential, or a vulnerability under public exploitation, write `URGENT` in the subject line.

### What to include

- A clear description of the issue and the impact.
- Step-by-step reproduction (URLs, payloads, browsers, accounts).
- Whether you accessed any data that wasn't yours; if so, stop, do not download or retain it, and tell us.
- Your name / handle for credit (optional).

### Safe-harbor

We support good-faith security research. Subject to the rules below, we will not pursue or support legal action against researchers who:

- Make a good-faith effort to comply with this policy.
- Avoid privacy violations, data destruction, and service disruption.
- Use only test accounts they themselves created (or that we provided).
- Stop testing and notify us immediately upon discovering customer data.
- Do not publicly disclose details of the issue before the coordinated date.

This authorization does not waive the rights of any third party, and you must still comply with their terms.

### Out of scope

The following are not eligible for safe-harbor protection or, in most cases, for any reward:

- Denial-of-service attacks.
- Social engineering of employees, customers, or vendors.
- Physical attacks against our offices, employees, or hardware.
- Reports relying on outdated browsers (more than 1 year past their vendor's end-of-life) or on missing CSP/headers when the headers are in fact set.
- Issues in third-party services we use (report those to the vendor — Supabase, Vercel, Stripe, Twilio, Resend, Hugging Face).
- Any technique that requires already-compromised user credentials or already-installed malware.

## In-scope assets

- Production: `https://YOUR-PRODUCTION-DOMAIN`
- Vercel preview deployments matching `https://intake-clean-*-YOUR-VERCEL-TEAM.vercel.app`
- Source code in this repository

Out of scope: any other domain, any other repository, any third-party SaaS we use.

## Severity rubric

We use the OWASP Risk Rating methodology (likelihood x impact). Approximate response targets:

| Severity | Acknowledgement | Patch target |
| --- | --- | --- |
| Critical (auth bypass, RCE, data exfiltration) | 1 business day | 7 days |
| High (broken access control, stored XSS in privileged surfaces, sensitive PII leak) | 2 business days | 14 days |
| Medium (CSRF, SSRF on internal-only endpoints, privilege bumps requiring chain) | 5 business days | 30 days |
| Low (informational, hardening) | 5 business days | best-effort |

## Existing controls (for context)

This is a non-exhaustive summary of what's in place; see `docs/security/` for the launch checklist.

- Supabase Auth + TOTP MFA (required for `admin` / `attorney`); HIBP leaked-password check on signup.
- Postgres Row-Level Security on every public table; service-role key is server-only and never inlined to the client bundle.
- Storage buckets are private; access is exclusively via short-lived signed URLs minted server-side.
- File uploads validated by magic-byte sniffing (`file-type`), then size-/MIME-checked; declared MIME and detected MIME must match.
- Rate limiting via Upstash on the public upload portal, file action routes, onboarding, signed-URL minting, Twilio inbound, and the auth callback.
- Strict security headers: HSTS preload, CSP, X-Frame-Options DENY, X-Content-Type-Options, Permissions-Policy, Referrer-Policy.
- PDFs preview inside a sandboxed iframe (`sandbox=""`, no `allow-scripts`).
- Stripe + Twilio webhooks verify signatures; cron endpoint requires constant-time comparison of `CRON_SECRET`.
- Audit log on every privileged mutation; raw filenames are SHA-256-fingerprinted before logging to avoid PII leakage in the log itself.
- DPA, Privacy Policy, ToS, Acceptable Use, and Subprocessor List published under `legal/policies/`.

## Customer-facing security questions

Firms evaluating IntakeClean for use with their clients can request:

- The current Subprocessor List (`legal/policies/07-subprocessor-list.md`).
- Our Data Processing Addendum (`legal/policies/03-data-processing-addendum.md`).
- A summary of our internal Supabase / Vercel hardening checklist (`docs/security/supabase-checklist.md`).
- SOC 2 readiness status (in progress; see roadmap).

Send vendor security questionnaires to `security@CONTACT-EMAIL` and we'll respond within 10 business days.

## Acknowledgements

We thank the following researchers for responsibly disclosed reports:

_(none yet — be the first)_
