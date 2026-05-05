# IntakeClean — Legal & IP Document Package

> **READ THIS FIRST.** These documents are **templates**, not legal advice. They were drafted to give a sole founder a defensible starting point for forming a New Jersey single-member LLC, protecting the IntakeClean software/process IP, and operating a B2B SaaS that handles attorney–client and end-client data. Before you sign, file, or publish any of them, have a licensed New Jersey attorney (and a registered patent agent / patent attorney for `ip/02-provisional-patent-application.md`) review and edit them. A bad clause here can cost you your invention or pierce your liability shield.

---

## What's in this package

| # | File | Purpose |
| --- | --- | --- |
| 1 | [`formation/01-articles-of-organization-nj.md`](formation/01-articles-of-organization-nj.md) | Public Records Filing for New Business Entity (NJ Form NJ-LLC equivalent). |
| 2 | [`formation/02-operating-agreement-single-member-nj.md`](formation/02-operating-agreement-single-member-nj.md) | Operating Agreement under N.J.S.A. 42:2C-1 et seq. (NJ RULLCA). |
| 3 | [`ip/01-invention-disclosure-memo.md`](ip/01-invention-disclosure-memo.md) | Internal record of the invention, dated and signed, before any patent filing. |
| 4 | [`ip/02-provisional-patent-application.md`](ip/02-provisional-patent-application.md) | USPTO Provisional Patent Application draft (Specification + drawings). |
| 5 | [`ip/03-ip-assignment-founder-to-llc.md`](ip/03-ip-assignment-founder-to-llc.md) | Assigns all IntakeClean IP from you personally to the LLC. **File this BEFORE the patent application.** |
| 6 | [`ip/04-contractor-agreement.md`](ip/04-contractor-agreement.md) | Independent Contractor / Work-for-Hire with present assignment of IP. |
| 7 | [`ip/05-mutual-nda.md`](ip/05-mutual-nda.md) | Mutual NDA for investors, prospects, contractors. |
| 8 | [`policies/01-terms-of-service.md`](policies/01-terms-of-service.md) | B2B SaaS Terms of Service, AI-assistive language, NJ governing law. |
| 9 | [`policies/02-privacy-policy.md`](policies/02-privacy-policy.md) | CCPA/CPRA + GDPR-aware privacy policy with end-client carve-out. |
| 10 | [`policies/03-data-processing-addendum.md`](policies/03-data-processing-addendum.md) | DPA: customer = Controller, IntakeClean = Processor. |
| 11 | [`policies/04-acceptable-use-policy.md`](policies/04-acceptable-use-policy.md) | Prohibited content, security violations, abuse. |
| 12 | [`policies/05-cookie-notice.md`](policies/05-cookie-notice.md) | Cookies and similar technologies notice. |
| 13 | [`policies/06-ai-disclaimer.md`](policies/06-ai-disclaimer.md) | In-product AI assistive-output disclaimer (paste into the upload + review screens). |
| 14 | [`policies/07-subprocessor-list.md`](policies/07-subprocessor-list.md) | Public list of subprocessors (Supabase, Hugging Face, Stripe, Resend, Twilio). |

---

## Recommended order of operations

The order matters. Filing the patent before the IP assignment, or signing the Operating Agreement before the LLC exists, will create real problems.

### Step 1 — Form the LLC

1. **Pick and clear a name.** Search the [NJ Business Name Search](https://www.njportal.com/DOR/BusinessNameSearch). The name must contain "LLC", "L.L.C.", or "Limited Liability Company" (N.J.S.A. 42:2C-8).
2. **Appoint a Registered Agent** with a NJ street address. You can be your own RA if you have a NJ address, but a commercial RA (Northwest, Harbor Compliance, etc.) keeps your home address off the public record.
3. **File the Public Records Filing** for New Business Entity online at [`business.nj.gov`](https://business.nj.gov) (filing fee currently **$125**). Use [`formation/01-articles-of-organization-nj.md`](formation/01-articles-of-organization-nj.md) as your worksheet.
4. **Get an EIN** from the IRS — free, online, takes 10 minutes: <https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online>.
5. **Register for NJ taxes (Form NJ-REG)** within 60 days of the LLC's formation date.
6. **Sign the Operating Agreement** ([`formation/02-operating-agreement-single-member-nj.md`](formation/02-operating-agreement-single-member-nj.md)) the same day or within a few days. Even single-member NJ LLCs need a written operating agreement; courts and banks will ask for it.
7. **Open a dedicated business bank account.** Never commingle. Commingling is the #1 way single-member LLCs lose limited liability protection in NJ.
8. **Note the annual report.** $75, due by the end of your formation anniversary month, every year, at [`business.nj.gov`](https://business.nj.gov).

### Step 2 — Move the IP into the LLC (CRITICAL — do this BEFORE filing the patent)

1. Sign [`ip/03-ip-assignment-founder-to-llc.md`](ip/03-ip-assignment-founder-to-llc.md). This assigns everything you've built personally — code, designs, the AI pipeline, the brand — to the LLC.
2. Have **every contractor, designer, or engineer** who has ever touched IntakeClean sign [`ip/04-contractor-agreement.md`](ip/04-contractor-agreement.md) (or a retroactive IP assignment if work has already been performed). Without this, a future investor or acquirer's diligence will halt.
3. Keep a signed PDF in `legal/signed/` (do not commit it to a public git repo).

### Step 3 — Lock in the patent priority date

1. Complete [`ip/01-invention-disclosure-memo.md`](ip/01-invention-disclosure-memo.md) and date/sign it. Keep the original.
2. Have a patent attorney or registered patent agent review [`ip/02-provisional-patent-application.md`](ip/02-provisional-patent-application.md). Critically: a provisional only protects what is **described in detail**, so do not strip the technical specifics for "stealth" — that destroys the priority date for anything you remove.
3. File electronically via [USPTO Patent Center](https://patentcenter.uspto.gov). Filing fee for a micro-entity is **$65** (small entity $130, large $260) as of the most recent USPTO fee schedule — **verify the current fee** before filing.
4. **You have 12 months** from the provisional filing date to file the non-provisional (utility) application. Calendar it. Missing it is unrecoverable.
5. Add a "Patent Pending" notice to the marketing site and the in-product footer **only after** the provisional is filed.

### Step 4 — Publish the policies and operationalize

1. Replace the placeholders (`[LLC NAME]`, `[REGISTERED AGENT]`, dates, addresses, etc.) throughout. Search-and-replace will get you 90% of the way there.
2. Publish the public-facing documents under a stable URL, e.g. `/legal/terms`, `/legal/privacy`, `/legal/aup`, `/legal/subprocessors`, `/legal/cookies`. The DPA is typically linked from inside the ToS as Annex 1 and from the order form.
3. Wire the in-product AI disclaimer ([`policies/06-ai-disclaimer.md`](policies/06-ai-disclaimer.md)) into the upload page and the review queue.
4. Push the cookie notice through your consent banner (you'll need a CMP if you serve EU/UK/CA users).
5. Keep [`policies/07-subprocessor-list.md`](policies/07-subprocessor-list.md) up to date and notify customers (typically 30 days before) when you add a new subprocessor — most enterprise customers will require this contractually.

---

## Open items only a human can answer (placeholder dictionary)

Find-and-replace these tokens across the entire `legal/` folder before publishing or signing.

### Always required (every document)

| Token | What it is | Example |
| --- | --- | --- |
| `[LLC NAME]` | Final, name-cleared LLC name | `IntakeClean LLC` |
| `[FOUNDER NAME]` | Your full legal name | `Jane A. Smith` |
| `[FOUNDER ADDRESS]` | Your address (consider a commercial RA's address to keep your home off public records) | `123 Main St, Newark, NJ 07102` |
| `[FOUNDER CITIZENSHIP]` | Country of citizenship | `United States` |
| `[PRINCIPAL OFFICE ADDRESS]` | Main business address | `123 Main St, Newark, NJ 07102` |
| `[CONTACT EMAIL]` | A real, monitored mailbox at your domain | `legal@intakeclean.com` |
| `[COUNTY]` | NJ county for venue clauses | `Essex County` |
| `[YYYY-MM-DD]` | Date — vary by document; use ISO format throughout |  |

### Formation-only (`legal/formation/*`)

| Token | What it is |
| --- | --- |
| `[REGISTERED AGENT NAME]` | NJ-resident individual or commercial RA |
| `[REGISTERED AGENT ADDRESS]` | NJ street address (no PO boxes) |
| `[FORMATION DATE]` | Effective date of the NJ Public Records Filing |
| `[CITY]`, `[ZIP]` | RA city/ZIP in NJ |
| `[AMOUNT]` | Dollar values on Schedule A capital contributions |

### IP-only (`legal/ip/*`)

| Token | What it is |
| --- | --- |
| `[ASSIGNMENT DATE]` | Date the IP Assignment is signed (must be on or before provisional filing) |
| `[EFFECTIVE DATE]` | Effective date for the NDA / Contractor Agreement |
| `[GIT SHA AT FILING]` | Repository commit hash at provisional filing time, for "best mode" reference |
| `[WITNESS NAME]` | Witness on the Invention Disclosure (not a co-inventor) |
| `[ATTORNEY NAME]`, `[FIRM NAME]`, `[ADDRESS]` | Patent counsel correspondence address (USPTO cover sheet) |
| `[USPTO INVENTOR DECLARATION]` | Reminder placeholder — declaration is signed at the **non-provisional** filing, not the provisional |
| `[CONTRACTOR NAME]`, `[CONTRACTOR ADDRESS]`, `[CONTRACTOR EMAIL]` | Per contractor |
| `[Deliverable 1]` … `[Deliverable N]` | Contractor Agreement Exhibit A scope |
| `[COUNTERPARTY NAME]`, `[COUNTERPARTY ADDRESS]`, `[COUNTERPARTY SIGNATORY NAME]`, `[COUNTERPARTY EMAIL]`, `[TITLE]` | Per NDA counterparty |
| `[NAME]` | Disclosure-log columns (audience names) |

### Policy-only (`legal/policies/*`)

| Token | What it is |
| --- | --- |
| `[privacy@CONTACT EMAIL]` | Real privacy mailbox — set up `privacy@yourdomain.com` |
| `[security@CONTACT EMAIL]` | Set up `security@yourdomain.com` |
| `[support@CONTACT EMAIL]` | Set up `support@yourdomain.com` |
| `[abuse@CONTACT EMAIL]` | Set up `abuse@yourdomain.com` (or alias to `security@`) |
| `[HOSTING / CDN PROVIDER e.g., Vercel]` | Your real hosting provider in the Subprocessor List |
| `[ANALYTICS PROVIDER if any]`, `[MARKETING PROVIDER if any]` | Cookie Notice — list real providers or remove the row |
| `[STATE BAR / FIRM NAME]` | Any reviewing attorney's affiliation, on the printed signature draft |

### Quick sanity check

After your find-and-replace pass, run:

```bash
grep -RE '\[[A-Z][A-Za-z _/0-9-]+\]' legal/ | grep -vE '\[(YYYY-MM-DD|name|date|signature|county)' || echo "All placeholders replaced."
```

If anything still prints, finish replacing it before signing or publishing.

---

## What this package deliberately does NOT include

- **State filings as PDFs.** NJ filings are submitted online; the markdown file is a worksheet for the data you'll enter.
- **EIN application.** Use IRS Form SS-4 online — free, automated.
- **Sales tax / NJ-REG.** Specific to your nexus and revenue mix; do this after talking to an accountant.
- **Trademark application (USPTO TEAS).** Recommended once you've cleared the mark, but separate from this package.
- **Investor docs (SAFE, convertible note, term sheet).** Not needed pre-fundraise; YC's standard SAFE templates are the right starting point when you do raise.
- **Employee offer letters / employment agreements.** Not needed until you have W-2 employees.

---

## Final reminder

Every document in this folder ends with a signature block. **Do not sign anything until a New Jersey-licensed attorney has reviewed the final version with your specific facts.** A few hundred dollars of attorney review now is dramatically cheaper than a contract dispute, a denied patent, or a pierced corporate veil later.
