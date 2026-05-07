# IntakeClean — Cookie Notice

**Last updated:** `[YYYY-MM-DD]`

This Cookie Notice explains how [LLC NAME] ("**IntakeClean**," "**we**," "**us**") uses cookies and similar technologies on the IntakeClean website and Service. It supplements our [Privacy Policy](/legal/privacy-policy).

## 1. What are cookies?

Cookies are small text files stored on your device by your browser. They are widely used to make websites work, remember preferences, and provide usage analytics. We also use related technologies such as **localStorage**, **sessionStorage**, **pixels**, and **server-side first-party identifiers**, which we refer to collectively as "cookies" in this notice.

## 2. Categories of cookies we use

| Category | Required? | Purpose | Examples |
| --- | --- | --- | --- |
| **Strictly necessary** | Yes — cannot be disabled | Authentication, session integrity, security (CSRF), load balancing, and storing your cookie-preferences decision itself | `sb-*` (Supabase Auth), `__Host-*` session cookies, `ic-consent` |
| **Functional** | Optional | Remember your preferences (e.g., theme, sidebar state) and your firm settings | `ic-theme`, `ic-sidebar` |
| **Analytics** | Optional, consent-based where required by law | Aggregated, privacy-preserving usage analytics so we can prioritize improvements. **Off by default.** No analytics provider is enabled today; if we add one we will list it here, update this notice, and re-prompt you for consent. | _none enabled today_ |

> We deliberately do not list a "Marketing" category. We do not run cross-context behavioral advertising or third-party advertising cookies. If we ever introduce that capability, we will add the category, update this notice, bump the consent-record version, and re-prompt every visitor before any such cookie is set.

### 2.1 Retention

| Cookie | Lifetime | Notes |
| --- | --- | --- |
| `ic-consent` | 12 months from your most recent decision | First-party. Holds the schema version, your category choices, the region we detected, the source of the decision (banner, modal, GPC), and a timestamp. Re-issued whenever you change your selections. |
| `ic-theme`, `ic-sidebar` | 12 months | First-party. Set only when you have allowed the **Functional** category. Cleared automatically if you later switch that category off. |
| `sb-*` (Supabase Auth) | Session + refresh-token rotation | First-party. Strictly necessary; cannot be disabled. Cleared when you sign out. |
| `__Host-*` session cookies | Session | First-party, `Secure`, `HttpOnly`, `SameSite=Lax`. Strictly necessary. |

## 3. Third-party cookies

Some cookies are set by third parties we use to provide the Service (e.g., the payment processor's hosted checkout page may set its own cookies during a checkout session). Those third parties' privacy and cookie practices are governed by their own policies; we link to them in our [Subprocessor List](/legal/subprocessor-list).

## 4. Your choices

- **Browser controls.** Most browsers let you block or delete cookies. Disabling strictly necessary cookies will break sign-in and other core features.
- **Consent banner.** On your first visit to a marketing page (e.g., the homepage, pricing, or this legal section), we display a banner with two equally-weighted buttons — *Only essential* and *Accept all* — plus a *Customize* link that opens a per-category settings dialog. We do not pre-tick optional categories, do not infer consent from continued browsing, and do not rely on a "by-continuing-you-accept" pattern.
- **Changing your choice.** You can change your selections at any time via the **Cookie preferences** link in the page footer. The same controls are available without JavaScript at [`/legal/cookie-preferences`](/legal/cookie-preferences); that page posts to `/api/consent`, which sets the `ic-consent` cookie via a `Set-Cookie` header and 303-redirects you back to confirm.
- **Where the banner appears.** The banner only appears on our public marketing surface (e.g., `/`, `/pricing`, `/legal/*`). It is not shown inside the authenticated product (`/dashboard/*`) or on private upload links, where the only cookies in use are strictly-necessary session cookies that do not require consent.
- **Re-prompting on material changes.** Your decision is recorded in a first-party `ic-consent` cookie that includes a schema version. If we make a material change to which categories of cookies we use — including adding any new third-party provider — we bump that version, which causes the banner to re-appear on your next visit so you can make a fresh decision.
- **Do Not Track.** Web browsers may send a "Do Not Track" signal. There is no industry consensus on how to interpret it; the Service does not currently respond to DNT.
- **Global Privacy Control.** We honor the Global Privacy Control (GPC) signal. When your browser sends GPC, we record an automatic opt-out from all optional categories (Functional, Analytics) and we do not show the banner. A manual decision you make later overrides the GPC default for that browser. We do not "sell" or "share" personal information for cross-context behavioral advertising in any case.

## 5. Changes

We will update this notice from time to time. The "Last updated" date at the top reflects the most recent change. If a change is material — for example, adding a new optional category or a new third-party provider — we will bump the consent-record version, which causes the banner to re-appear on your next visit so you can make a fresh decision.

## 6. Contact

Questions about this notice: [privacy@CONTACT EMAIL]. We typically respond within five business days.
