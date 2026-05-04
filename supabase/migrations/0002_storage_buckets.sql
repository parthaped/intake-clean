-- IntakeClean: storage buckets
-- All four buckets are private. Access is granted exclusively through
-- short-lived signed URLs minted server-side.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('original-documents',  'original-documents',  false, 52428800, null),
  ('processed-documents', 'processed-documents', false, 52428800, null),
  ('thumbnails',          'thumbnails',          false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('exports',             'exports',             false, 209715200, array['application/pdf','application/zip'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object-level policies: by default the service role bypasses RLS, which is
-- exactly what we want here. We do NOT grant any direct authenticated read
-- access; the application mints signed URLs through `createSignedUrl`.
-- The two policies below allow members of an organization to LIST objects
-- whose path starts with that organization's id, which the dashboard uses to
-- show the file list (the file *bytes* still require a signed URL).

create policy "org-members can list original docs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'original-documents'
    and exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and (storage.foldername(name))[1] = p.organization_id::text
    )
  );

create policy "org-members can list processed docs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'processed-documents'
    and exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and (storage.foldername(name))[1] = p.organization_id::text
    )
  );

create policy "org-members can list thumbnails"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'thumbnails'
    and exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and (storage.foldername(name))[1] = p.organization_id::text
    )
  );

create policy "org-members can list exports"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'exports'
    and exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and (storage.foldername(name))[1] = p.organization_id::text
    )
  );
