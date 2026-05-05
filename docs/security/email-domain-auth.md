# Resend domain authentication (SPF / DKIM / DMARC)

Production sending MUST be done from a verified, authenticated domain. Using
the default `onboarding@resend.dev` sandbox address is fine for local dev,
but in production every transactional email IntakeClean sends to a firm's
end-client (re-upload reminders, document-request notifications, completion
notices) needs SPF, DKIM, and DMARC alignment, otherwise:

- Gmail and Outlook will mark messages as spam (often silently).
- The end-client's law firm risks losing the upload-link email entirely.
- Phishing attackers can spoof your domain unchallenged.

## One-time setup

1. **Pick a sending domain.** Resend's onboarding flow uses `send.YOURDOMAIN.com`
   so the apex / `www` records aren't muddied. Example: `send.intakeclean.com`.
   (Older docs may reference `mail.` — Resend switched the convention to `send.`
   in 2025; either subdomain works as long as the records line up.)
2. **Add the domain in Resend.** _Resend dashboard -> Domains -> Add Domain_.
   Resend will display the exact DNS records you need.
3. **Publish the records on your DNS provider.** Resend currently issues four
   records, all anchored on the sending domain:
   - **DKIM (TXT)** at `resend._domainkey.YOURDOMAIN.com` containing the
     `p=MIGfMA0...` public key Resend generated for you. This is what proves
     each message was actually signed by Resend's keypair on your behalf.
   - **MX** at `send.YOURDOMAIN.com` -> `feedback-smtp.us-east-1.amazonses.com`
     with priority 10. Resend sends through Amazon SES, and this is where
     bounce notifications and DMARC failure reports come back.
   - **SPF (TXT)** at `send.YOURDOMAIN.com`:
     `v=spf1 include:amazonses.com ~all`
     (If your apex already publishes SPF, do NOT merge — keep the SES
     authorisation scoped to the `send.` subdomain. The SPF spec disallows
     multiple `v=spf1` records on the same name, so a subdomain record is
     the safe way to add a new authorised sender without breaking your
     existing apex SPF.)
   - **DMARC (TXT)** at `_dmarc.YOURDOMAIN.com`:
     start with `v=DMARC1; p=none;` while you observe reports, then ramp
     to `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@YOURDOMAIN.com; pct=100; sp=quarantine; aspf=s; adkim=s`
     after ~30 days of clean traffic, and finally `p=reject` once you're
     confident no legitimate sender is being missed.
4. **Wait for verification.** Resend will mark the domain "Verified" once the
   DNS records propagate (5-30 min usually).
5. **Update env.** Set `RESEND_FROM_EMAIL` to the new authenticated address,
   e.g. `IntakeClean <noreply@send.intakeclean.com>`.

## Verification

Run:

```bash
dig +short TXT  resend._domainkey.YOURDOMAIN.com   # DKIM public key
dig +short MX   send.YOURDOMAIN.com                # bounces -> SES
dig +short TXT  send.YOURDOMAIN.com                # SPF
dig +short TXT  _dmarc.YOURDOMAIN.com              # DMARC policy
```

Then send a test email from the IntakeClean dashboard and inspect headers
in Gmail (`Show original`). You should see all three pass:

```
spf=pass smtp.mailfrom=mail.YOURDOMAIN.com
dkim=pass header.i=@mail.YOURDOMAIN.com
dmarc=pass action=none header.from=YOURDOMAIN.com
```

## DMARC report mailbox

Set up a forwarding mailbox at `dmarc-reports@YOURDOMAIN.com` and feed the
XML reports into a parser (Postmark DMARC, dmarcian, Valimail) so you can
spot:

- Unauthorised senders attempting to spoof the domain.
- Legitimate but mis-configured senders (e.g. a marketing tool you forgot
  to authenticate).
- Volume drops indicating delivery problems.

## Twilio messaging

The same hardening cadence applies to SMS:

- Use a **Messaging Service** with a single dedicated long code or short
  code. Don't send from arbitrary numbers — most carriers will throttle or
  block.
- Enable **A2P 10DLC** registration (US carriers refuse most A2P traffic
  from unregistered campaigns now).
- Configure **opt-out keywords** (STOP / UNSUBSCRIBE) in the Messaging
  Service so we don't fall foul of TCPA. Twilio handles this automatically
  when the Messaging Service has it enabled.
- Set the **inbound webhook URL** to the production `/api/twilio/inbound`
  endpoint and verify in the Twilio console that the request signature is
  reaching us — the route now rejects requests without a valid signature.
