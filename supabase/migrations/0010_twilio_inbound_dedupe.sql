-- IntakeClean: Twilio inbound dedupe.
--
-- Twilio retries inbound webhook deliveries on transient receiver failure
-- (any non-2xx response, network drop). Our handler inserts a fresh
-- client_messages row each time, so a single client text could appear two
-- or three times on the matter timeline.
--
-- We add a partial unique index on `provider_message_id` for the SMS inbound
-- direction. NULL values (system messages, outbound rows whose provider
-- failed before returning a sid) remain duplicated-allowed; only inbound
-- SMS with a real Twilio MessageSid get the dedupe.

create unique index if not exists client_messages_inbound_sms_sid_idx
  on public.client_messages(provider_message_id)
  where channel = 'sms'
    and direction = 'inbound'
    and provider_message_id is not null;
