# Pen-test playbook

This playbook documents the **automated pen-test suite** that ships with the
repo plus the **manual probes** a hired pen-test firm (or an internal red-team
day) should run before each major release.

The goal is the same as a customer signing a SOC 2 CSA: **prove that the
control claims in `SECURITY.md` actually hold under hostile traffic**.

---

## 1. Automated suite

Every pen-test is wired into the regular `npm test` run so a regression
that weakens a control fails CI.

```bash
npm test              # jasmine + cucumber
npm run test:jasmine  # unit-level pen-tests only
npm run test:cucumber # end-to-end attacker scenarios
```

### Jasmine specs (`tests/jasmine/spec/security/*.spec.ts`)

| Spec | Threat covered |
| --- | --- |
| `redact.spec.ts` | OCR text containing SSN / passport / EIN / DL / card / email / phone / DOB leaks to a third-party model. |
| `validate-upload.spec.ts` | Polyglot uploads: HTML / PE / shell scripts disguised as PDF or PNG; wrong-MIME claims; oversized / empty bodies. |
| `pdf-sanitize.spec.ts` | `/JS`, `/JavaScript`, `/AA`, `/OpenAction`, `/Names → /JavaScript` survive into exported packets. |
| `rate-limit.spec.ts` | Brute-force on tokens, signed-URL grinding, auth-form credential stuffing; per-identifier and per-route bucket isolation. |
| `cron-auth.spec.ts` | `Authorization` header missing, wrong, length-mismatched, padded; secret unset (default-deny). |
| `safe-redirect.spec.ts` | Open redirect via `?next=//evil`, `/\evil`, `javascript:`, `data:`, absolute URL. |
| `twilio-verify.spec.ts` | Missing / random / replayed / body-tampered / URL-tampered / wrong-token signatures. |
| `headers.spec.ts` | HSTS, CSP (`default-src`, `object-src none`, `frame-ancestors none`, `form-action`, `base-uri`, `upgrade-insecure-requests`), X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, COOP, Permissions-Policy. |
| `scrub.spec.ts` | Sentry `beforeSend` strips Authorization / Cookie / Stripe / Twilio headers; replaces upload-token path segments and `code`/`token` query params; blanket-replaces request bodies. |
| `mfa-jwt.spec.ts` | Step-up freshness (`amr` claim) accepts only sessions with a recent non-`pwd`/`oauth` factor; ignores forged / malformed JWTs. |
| `file-name-fingerprint.spec.ts` | Audit log never receives raw client-supplied filename. |
| `storage-key.spec.ts` | Path traversal payloads (`../`, `..\\`, NULL byte, percent-encoded, very long) are neutralised before reaching the bucket. |

### Cucumber attacker scenarios (`tests/cucumber/features/security-attacks.feature`)

End-to-end Gherkin narratives written from the attacker's point of view.
Cucumber wires each step to the same library code the production routes
call, so a passing scenario means the actual gate fires when an attacker
tries that path.

Scenarios cover: token brute-force, Twilio forgery, cron secret grinding,
disguised-MIME upload, malicious-PDF JavaScript, open-redirect via
`?next=`, OCR PII redaction, and Sentry leak prevention.

---

## 2. Manual probes (red-team day / pre-launch)

These cover surfaces that are too environmental to assert in a unit test
(real Supabase RLS, real Vercel headers in production, real Stripe webhook
flow, real network hops). Run each one against a **non-production
environment** with realistic data.

### 2.1 AuthN / AuthZ

- [ ] **Cross-tenant read** — sign in as Firm A, attempt to fetch
      `/api/files/<file-belonging-to-Firm-B>/signed-url`. Expect 404 or 403.
- [ ] **Cross-tenant write** — POST to `/api/files/<other-org-file>/review`
      with valid CSRF / session cookies. Expect 403.
- [ ] **Service-role bypass** — confirm `SUPABASE_SECRET_KEY` is never
      sent to the client bundle (`grep -r SUPABASE_SECRET_KEY .next/`).
- [ ] **Privilege escalation** — sign in as `paralegal`, attempt the
      `updateUserRoleAction` server action. Expect rejection.
- [ ] **Step-up reauth bypass** — with a session whose last MFA assertion
      is > 15 min old, attempt `/api/matters/.../export-pdf`. Expect
      redirect to MFA challenge with `reason=stepup`.
- [ ] **Session fixation** — attempt to set the Supabase session cookie
      via response from a different origin; confirm `SameSite=Lax` and
      `Secure` flags hold.
- [ ] **Logout effectiveness** — capture the access-token JWT, sign out,
      replay the JWT against `/dashboard`. Expect redirect to `/login`.

### 2.2 Input handling

- [ ] **XSS in document name** — upload a file named
      `<img src=x onerror=alert(1)>.pdf`. Verify the dashboard renders
      the literal string and never executes the script. Verify the
      audit log stores only the SHA-256 fingerprint.
- [ ] **XSS in legal markdown** — submit a legal markdown page (via the
      build pipeline) containing inline `<script>`; confirm DOMPurify
      strips it before render.
- [ ] **SQL injection** — try `'; DROP TABLE matters; --` in every text
      input. Confirm RLS policies + parameterised queries reject without
      executing.
- [ ] **NoSQL / JSON injection** — POST `{"$ne": null}`-style payloads to
      filter parameters. Confirm Supabase rejects.
- [ ] **SSRF via webhook URL** — set Stripe / Resend webhook URLs to
      `http://169.254.169.254/latest/meta-data/`. Confirm we never
      follow attacker-controlled URLs.
- [ ] **HTTP request smuggling** — send `Transfer-Encoding: chunked` +
      `Content-Length` mismatched. Confirm Vercel's edge rejects.

### 2.3 File-system / storage

- [ ] **Storage object enumeration** — given a known bucket, attempt to
      list / fetch `org_x/matter_y/original/0000-...` via the public
      Supabase URL. Expect 404 (RLS + bucket private).
- [ ] **Signed-URL grinding** — request signed URLs for the same file in
      a tight loop. Expect 429 after `limits.signedUrl` per minute.
- [ ] **ZIP slip** — upload a file whose name is `../../escape.pdf`,
      run an export, and inspect the resulting `.zip` for path
      traversal. Expect sanitised entries (`buildStorageKey` already
      neutralises this).
- [ ] **PDF JavaScript** — upload a PDF generated by `evilpdf.js`
      (https://github.com/yelhamer/EvilPDF) and verify the export
      packet is action-free.

### 2.4 Network / transport

- [ ] **HSTS preload** — once added, verify
      https://hstspreload.org/?domain=app.intakeclean.com.
- [ ] **TLS configuration** — run `nmap --script ssl-enum-ciphers -p 443
      app.intakeclean.com`. Reject anything below TLS 1.2; prefer 1.3.
- [ ] **CSP report-uri** — temporarily switch CSP to report-only and
      confirm no third-party domain is being unintentionally loaded.
- [ ] **Origin isolation** — verify
      `Cross-Origin-Opener-Policy: same-origin` is enforced via
      `window.opener === null` after a popup.

### 2.5 Third-party integration

- [ ] **Stripe webhook replay** — capture a real webhook, replay it 24h
      later. Expect rejection (Stripe signature includes a timestamp;
      stripe-node enforces 5 min by default).
- [ ] **Twilio replay** — capture a real inbound webhook, replay it
      against staging. Expect 401 (URL mismatch flips the signature).
- [ ] **Hugging Face data egress** — set
      `USE_HF_CLASSIFICATION=true` with a HF token, upload a doc with
      SSN / passport / phone, and inspect the outbound request body
      (HF SDK debug log / mitmproxy). Expect every regex match to be
      replaced with `[REDACTED:label]`.
- [ ] **Cloudmersive AV** — upload an EICAR test string. Expect the
      file to land in `status=rejected` and an audit row with
      `event=file.virus_detected`.

### 2.6 Observability / ops

- [ ] **Sentry leak audit** — trigger a synthetic 500 in a route that
      handles an upload token. Confirm the captured event in the Sentry
      UI contains no token, no Authorization, no body, and no PII in
      breadcrumb messages.
- [ ] **Vercel log scrub** — run `vercel logs --since=1h` and grep for
      bearer tokens, SSN patterns, emails. Expect nothing.
- [ ] **Audit-log retention cron** — manually invoke
      `/api/cron/audit-retention` with the bearer token; confirm rows
      older than 730 days are deleted and the cron run shows up in
      Vercel Observability.
- [ ] **Backup restore drill** — request a Supabase point-in-time
      restore for a recent timestamp; verify schema + data integrity in
      the restored project.

### 2.7 Out-of-scope (paid pen-test)

These require a hired firm because they involve adversarial techniques
(active session hijacking, social engineering, kernel-level fuzzing) that
are inappropriate for unit tests and that we don't run from CI:

- Web-app pen test against staging (OWASP Top 10, with manual
  authentication flows).
- Phishing simulation against firm staff (post-launch).
- Network / infrastructure scan (Vercel + Supabase boundary; usually
  point-in-time and out-of-scope for both providers' shared-responsibility
  models).
- Mobile / desktop client test (N/A — we are web-only today).

Recommended cadence: **annual** general pen-test, with a delta-test
after any major architectural change (auth provider swap, storage
provider swap, new third-party data egress).

---

## 3. Reporting

Every finding from the manual probes should be filed as a private
GitHub issue with the `security` label and a CVSS-like severity
(critical / high / medium / low / informational), then triaged on the
weekly engineering call. Critical and high findings block release.

For external researcher disclosures, see `SECURITY.md` for the
responsible-disclosure terms and the safe-harbor statement.
