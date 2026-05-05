# Column-level encryption playbook

The plaintext PII fields in `clients.email`, `clients.phone`, and
`uploaded_files.original_file_name` are the most attractive targets for an
attacker who gets read access to the database (compromised service-role
key, restored backup left in a public bucket, contractor with the wrong
permissions). Migration `0008_column_encryption.sql` lays the groundwork
for moving them off plaintext using `pgsodium` AEAD encryption with a
Supabase-managed key.

The migration is intentionally dormant — it adds `*_enc` shadow columns
and helper functions but does NOT switch the application to read or write
them. That cutover is a separate, multi-step operation that needs a
maintenance window or feature-flagged rollout.

## When to run the cutover

- After SOC 2 readiness work begins (auditors will ask).
- If a customer security review explicitly asks for column-level encryption.
- Before any non-employee gets read-only DB access.

## Cutover procedure

1. **Provision a Supabase Vault key** and confirm the migration created
   the `intake_clean_pii_v1` key:

   ```sql
   select id, name, created from pgsodium.key where name = 'intake_clean_pii_v1';
   ```

2. **Backfill in batches.** From the Supabase SQL editor (service-role):

   ```sql
   select * from public.backfill_pii_encryption();  -- repeat until done = true
   ```

   Each call processes 1,000 rows per table with `FOR UPDATE SKIP LOCKED`,
   so concurrent inserts/updates aren't blocked. Verify after each pass:

   ```sql
   select count(*)
   from public.clients
   where (email is not null and email_enc is null)
      or (phone is not null and phone_enc is null);
   -- expect 0 when done
   ```

3. **Add a write-through trigger** so new inserts populate both columns:

   ```sql
   create or replace function public.clients_pii_writethrough()
   returns trigger language plpgsql security definer as $$
   begin
     if new.email is not null and new.email_enc is null then
       select ciphertext, nonce into new.email_enc, new.email_nonce from public.encrypt_pii(new.email);
     end if;
     if new.phone is not null and new.phone_enc is null then
       select ciphertext, nonce into new.phone_enc, new.phone_nonce from public.encrypt_pii(new.phone);
     end if;
     return new;
   end;
   $$;
   create trigger clients_pii_writethrough_t
     before insert or update on public.clients
     for each row execute function public.clients_pii_writethrough();
   -- repeat for uploaded_files
   ```

4. **Deploy app code that prefers `*_enc`** (decrypt via service-role
   helper or in-app pgsodium binding). Suggested helper at
   `src/lib/security/encrypt.ts`. Keep the plaintext columns as fallback
   for one release.

5. **Verify telemetry** for at least 7 days: every read path returns the
   same value with and without encryption; no decryption failures in
   Sentry.

6. **Drop the plaintext columns** in a follow-up migration:

   ```sql
   alter table public.clients drop column email, drop column phone;
   alter table public.uploaded_files drop column original_file_name;
   ```

7. **Update audit/exports**. The PDF packet and CSV exports currently
   render the raw filename. After the cutover, `loadExportContext()` must
   decrypt before formatting.

## Key rotation

`pgsodium` supports per-row key references; rotation is a re-encrypt loop:

```sql
select pgsodium.create_key(name => 'intake_clean_pii_v2');
-- write a re-encrypt batch function that calls decrypt_pii(... 'v1') then
-- encrypt_pii(... 'v2') and updates the row, in 1000-row batches.
```

Schedule rotation **annually** at minimum (NIST SP 800-57 part 1 rev 5,
Table 1, "data encryption keys"). Rotate immediately on any suspected
exposure of the previous key id (very rare with Vault).

## What this does NOT protect against

- A compromised service role key still has the helper functions available,
  so it can call `decrypt_pii` for any row. Column-level encryption
  defends against data-at-rest disclosure (backups, restore-to-staging,
  read-replicas), not against application-layer compromise.
- It does NOT replace the audit log requirements. Every read of decrypted
  PII should still flow through `recordAudit`.
- It does NOT replace storage-layer encryption. Supabase Storage already
  encrypts objects with AES-256 at rest.
