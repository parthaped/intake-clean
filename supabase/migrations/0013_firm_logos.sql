-- IntakeClean: firm-logos storage bucket
--
-- Public bucket so any email client / browser can render the firm's logo
-- without a signed URL. Writes are gated behind RLS policies that only let
-- a firm admin upload to (or delete from) `{organization_id}/...` paths.
--
-- The image dimensions / size cap below are deliberately tight: 2 MB is
-- plenty for a wordmark or icon, and the mime allow-list keeps us off the
-- hook for HEIC / TIFF / PSD edge cases that browsers would refuse anyway.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('firm-logos', 'firm-logos', true, 2097152,
   array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read: SELECT on a public bucket is already allowed via the storage
-- API (`getPublicUrl`), no policy needed. The `public = true` flag above is
-- what makes the served URL work without auth.

-- Admin-only writes: only firm admins can upload / replace / remove their
-- own org's logo. The first folder segment of the object name MUST equal
-- the caller's `organization_id`, mirroring the path scheme we use for
-- document buckets in 0002_storage_buckets.sql.

create policy "firm-admins can insert their org logo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'firm-logos'
    and exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
        and (storage.foldername(name))[1] = p.organization_id::text
    )
  );

create policy "firm-admins can update their org logo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'firm-logos'
    and exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
        and (storage.foldername(name))[1] = p.organization_id::text
    )
  )
  with check (
    bucket_id = 'firm-logos'
    and exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
        and (storage.foldername(name))[1] = p.organization_id::text
    )
  );

create policy "firm-admins can delete their org logo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'firm-logos'
    and exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
        and (storage.foldername(name))[1] = p.organization_id::text
    )
  );
