-- IntakeClean: column-level encryption scaffolding for the highest-PII fields.
--
-- This migration prepares the database for transparent column encryption
-- (pgsodium) WITHOUT flipping the app over to it. The actual cutover requires
-- a backfill window — see docs/security/column-encryption.md for the
-- play-by-play.
--
-- Why three separate columns instead of overwriting the originals in place:
--   - Backfill needs to read plaintext + write ciphertext atomically without
--     blocking online traffic.
--   - The app continues to read/write the plaintext columns until a feature
--     flag is flipped, which keeps this migration zero-downtime.
--   - Once the cutover lands, the plaintext columns can be dropped in a
--     follow-up migration after a verification window.
--
-- Fields chosen:
--   - clients.email                 — directly identifying
--   - clients.phone                 — directly identifying, also a 2FA target
--   - uploaded_files.original_file_name — frequently encodes PII
--                                        ("passport_smith_ssn_1234.pdf")

create extension if not exists pgsodium with schema pgsodium;

-- Server-managed key. Supabase manages the underlying key material in its
-- HSM-backed Vault; we only ever reference the key id from SQL. See:
--   https://supabase.com/docs/guides/database/extensions/pgsodium
do $$
begin
  if not exists (
    select 1 from pgsodium.key where name = 'intake_clean_pii_v1'
  ) then
    perform pgsodium.create_key(name => 'intake_clean_pii_v1');
  end if;
end
$$;

-- Shadow columns. `bytea` because pgsodium AEAD output is binary. The
-- nonces are 24 bytes; storing them inline keeps the schema simple at the
-- cost of slightly fatter rows.
alter table public.clients
  add column if not exists email_enc bytea,
  add column if not exists email_nonce bytea,
  add column if not exists phone_enc bytea,
  add column if not exists phone_nonce bytea;

alter table public.uploaded_files
  add column if not exists original_file_name_enc bytea,
  add column if not exists original_file_name_nonce bytea;

-- Helper functions wrapped in SECURITY DEFINER so they can read the key
-- from `pgsodium.key`. Called by the application service role only.
create or replace function public.encrypt_pii(plaintext text, key_name text default 'intake_clean_pii_v1')
returns table(ciphertext bytea, nonce bytea)
language plpgsql
security definer
set search_path = public, pgsodium
as $$
declare
  key_id uuid;
  v_nonce bytea;
begin
  if plaintext is null then
    return query select null::bytea, null::bytea;
    return;
  end if;
  select id into key_id from pgsodium.key where name = key_name limit 1;
  if key_id is null then
    raise exception 'pgsodium key % not found', key_name;
  end if;
  v_nonce := pgsodium.crypto_aead_det_noncegen();
  return query
  select
    pgsodium.crypto_aead_det_encrypt(
      message := plaintext::bytea,
      additional := ''::bytea,
      key_uuid := key_id,
      nonce := v_nonce
    ),
    v_nonce;
end;
$$;

create or replace function public.decrypt_pii(ciphertext bytea, nonce bytea, key_name text default 'intake_clean_pii_v1')
returns text
language plpgsql
security definer
set search_path = public, pgsodium
as $$
declare
  key_id uuid;
begin
  if ciphertext is null or nonce is null then
    return null;
  end if;
  select id into key_id from pgsodium.key where name = key_name limit 1;
  if key_id is null then
    raise exception 'pgsodium key % not found', key_name;
  end if;
  return convert_from(
    pgsodium.crypto_aead_det_decrypt(
      ciphertext := ciphertext,
      additional := ''::bytea,
      key_uuid := key_id,
      nonce := nonce
    ),
    'utf8'
  );
end;
$$;

revoke all on function public.encrypt_pii(text, text) from public;
revoke all on function public.decrypt_pii(bytea, bytea, text) from public;
grant execute on function public.encrypt_pii(text, text) to service_role;
grant execute on function public.decrypt_pii(bytea, bytea, text) to service_role;

-- BACKFILL HELPER (manual trigger). Run from the Supabase SQL editor as a
-- service-role superuser during a quiet window:
--
--   select public.backfill_pii_encryption();
--
-- The function processes 1,000 rows per call. Run repeatedly until it
-- reports `done := true` so a single transaction never blocks tables for
-- minutes.
create or replace function public.backfill_pii_encryption(batch_size int default 1000)
returns table(done boolean, clients_updated int, files_updated int)
language plpgsql
security definer
as $$
declare
  v_clients int := 0;
  v_files int := 0;
begin
  with batch as (
    select id, email, phone
    from public.clients
    where (email is not null and email_enc is null)
       or (phone is not null and phone_enc is null)
    order by created_at
    limit batch_size
    for update skip locked
  )
  update public.clients c
  set
    email_enc = case when batch.email is not null then (public.encrypt_pii(batch.email)).ciphertext else c.email_enc end,
    email_nonce = case when batch.email is not null then (public.encrypt_pii(batch.email)).nonce else c.email_nonce end,
    phone_enc = case when batch.phone is not null then (public.encrypt_pii(batch.phone)).ciphertext else c.phone_enc end,
    phone_nonce = case when batch.phone is not null then (public.encrypt_pii(batch.phone)).nonce else c.phone_nonce end
  from batch
  where c.id = batch.id;
  get diagnostics v_clients = row_count;

  with batch as (
    select id, original_file_name
    from public.uploaded_files
    where original_file_name is not null and original_file_name_enc is null
    order by created_at
    limit batch_size
    for update skip locked
  )
  update public.uploaded_files f
  set
    original_file_name_enc = (public.encrypt_pii(batch.original_file_name)).ciphertext,
    original_file_name_nonce = (public.encrypt_pii(batch.original_file_name)).nonce
  from batch
  where f.id = batch.id;
  get diagnostics v_files = row_count;

  return query select (v_clients = 0 and v_files = 0), v_clients, v_files;
end;
$$;

revoke all on function public.backfill_pii_encryption(int) from public;
grant execute on function public.backfill_pii_encryption(int) to service_role;
