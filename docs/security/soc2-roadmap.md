# SOC 2 readiness roadmap

This is the recommended path from "we have a working app" to "we hand the
firm a SOC 2 Type II report when they ask." It is intentionally
opinionated — small teams shipping legal-tech rarely benefit from
inventing their own cert path.

## Why SOC 2 (and which type)

Law firms over a certain size will ask for a SOC 2 report before they let
us touch client documents. Type I attests that controls are *designed*
properly; Type II attests they have *operated* over a 6-12 month window.

- **Type I** is the realistic short-term target: ~6-10 weeks of paperwork
  + a one-day audit. Useful for unblocking sales conversations.
- **Type II** requires running the controls for 6 months minimum and is
  what enterprise firms expect. Plan to start the observation window 3
  months after Type I attestation.

CSA STAR Level 2 is a less expensive alternative for some firms but
rarely satisfies AmLaw 200 procurement.

## Pick a compliance automation vendor

You do not want to build evidence collection in-house. Pick one of:

| Vendor | Best for | Notes |
| --- | --- | --- |
| Vanta | Default choice, broadest integrations | https://www.vanta.com |
| Drata | Strong continuous-monitoring UX | https://drata.com |
| Secureframe | Good legal-industry templates | https://secureframe.com |
| Oneleet | Cheaper, security-first not just compliance | https://www.oneleet.com |

All four offer 6-week onboarding programs that map our existing controls
into the AICPA Trust Services Criteria. Pick by demo-ing two and choosing
the team you'll be happiest emailing weekly.

## Pre-engagement readiness checklist

Run this **before** signing the compliance vendor contract so you can hit
the ground running. Almost everything below is already in this
repository or can be turned on with a flip:

- [ ] **In-repo SECURITY.md** with disclosure terms — done.
- [ ] **Supabase production checklist** worked through — see
      `docs/security/supabase-checklist.md`.
- [ ] **Email domain authenticated** (SPF/DKIM/DMARC) — see
      `docs/security/email-domain-auth.md`.
- [ ] **Column-level encryption** scaffolding in place — see
      `docs/security/column-encryption.md`.
- [ ] **Vercel Cron** configured for retention sweeper — see
      `vercel.json`.
- [ ] **Dependabot + Semgrep + Gitleaks + CodeQL** enabled in CI — see
      `.github/workflows/security.yml`.
- [ ] **MFA required for admin / attorney** — enforced in
      `src/lib/security/mfa.ts`.
- [ ] **Audit log + retention** wired up.
- [ ] **Quarterly access review** surface — see
      `/dashboard/security/access-review`.
- [ ] **Subprocessor list** published with DPA links —
      `legal/policies/07-subprocessor-list.md` (replace the placeholder
      DPA URLs with signed copies).

## Policies to draft (vendor will template most of these)

The compliance vendor provides templates for almost all of these; we just
need the named owners.

- [ ] Information Security Policy (ISP)
- [ ] Acceptable Use Policy (AUP) — already in `legal/policies/04-acceptable-use-policy.md`
- [ ] Code of Conduct
- [ ] Access Control Policy
- [ ] Asset Management Policy
- [ ] Backup Policy
- [ ] Business Continuity Plan / Disaster Recovery Plan
- [ ] Change Management Policy
- [ ] Cryptography Policy
- [ ] Data Classification Policy
- [ ] Data Retention & Destruction Policy
- [ ] Incident Response Plan
- [ ] Risk Assessment / Risk Management Policy
- [ ] Vendor / Third-party Management Policy
- [ ] Vulnerability Management Policy

## Penetration test

Required for nearly every Type II audit; firms also routinely ask for the
report attached to the SOC 2.

- Schedule the pen-test **before** announcing GA. Cobalt, NetSPI,
  Bishop Fox, Doyensec, and Trail of Bits all run web-app pen-tests in
  the $15k-$40k range for a SaaS the size of IntakeClean.
- Scope must include: auth flows, multi-tenant isolation, Supabase
  Storage signed-URL handling, Stripe webhook + Twilio webhook spoofing,
  the public upload portal (worst-case attack surface), and the
  processing pipeline.
- Re-test after each major refactor and at least annually.

## Estimated timeline

| Week | Milestone |
| --- | --- |
| 0 | Sign vendor contract; nominate security owner |
| 1 | Templated policies signed by named owners |
| 2-3 | Vendor scans / agents installed across all assets |
| 4-5 | Evidence collection complete; gap remediation |
| 6 | Type I audit (1-2 days) |
| 7 | Type I report issued |
| 8 | Begin Type II observation window |
| 8 + ~26 | Type II audit |
| 8 + ~32 | Type II report issued |

## Recurring obligations

- Quarterly access review (use `/dashboard/security/access-review`)
- Annual penetration test
- Annual policy review + employee acknowledgement
- Continuous evidence collection via the compliance platform
- Subprocessor list update on every vendor add/change
- Tabletop incident response exercise once a year
- Security awareness training for every employee (vendor offers this)
