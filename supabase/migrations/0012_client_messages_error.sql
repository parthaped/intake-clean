-- IntakeClean: persist outbound message failure reasons.
--
-- Resend / Twilio occasionally reject a send (unverified domain, recipient
-- on a suppression list, sandbox-sender-vs-non-owner-recipient, throttling,
-- etc). Until now we only stored the rolled-up `status` enum, so when staff
-- reported "the email never arrived" we had no way to tell from the DB
-- whether it was:
--   - mock-mode (RESEND_API_KEY not configured in this environment),
--   - a 4xx from Resend (domain not verified, suppressed recipient),
--   - a 5xx from Resend / Twilio (provider outage),
--   - a "no contact info" client row,
-- without crawling Vercel function logs.
--
-- Adding a nullable `error_message` column lets the orchestrators in
-- `src/lib/messaging/send-{request,reupload,completion}.ts` write the
-- structured reason at insert-time. The Messages tab in the matter detail
-- page renders it inline below failed messages so staff can act on it
-- without paging an engineer.
--
-- Nullable + no default keeps every existing row unchanged and stays
-- backwards-compatible with the Insert types in `src/types/database.ts`.
alter table public.client_messages
  add column if not exists error_message text;

comment on column public.client_messages.error_message is
  'Provider error (Resend/Twilio) or internal reason ("no_contact_info", "RESEND_API_KEY missing") explaining why this message status is failed/sent_mock. Null when the send succeeded.';
