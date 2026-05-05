-- IntakeClean: virus-scan tracking on uploaded files.
--
-- We deliberately do NOT block the upload synchronously on a scan result —
-- the user-facing portal would feel broken any time the scanner had a slow
-- minute. Instead, the processing pipeline scans the bytes BEFORE running
-- OCR or quality checks. If the scan returns "infected" we mark the file
-- `rejected` and never mint a thumbnail, never extract OCR, and never let
-- staff preview the bytes.
--
-- `virus_scan_status` values:
--   - 'pending'   : scan not yet attempted
--   - 'clean'     : scanner returned no detections
--   - 'infected'  : scanner detected at least one signature
--   - 'unknown'   : scanner ran but couldn't determine (e.g. corrupted)
--   - 'skipped'   : scanner is not configured (dev mode)
--   - 'error'     : scan call failed; will retry on next pass

alter table public.uploaded_files
  add column if not exists virus_scan_status text not null default 'pending',
  add column if not exists virus_scan_engine text,
  add column if not exists virus_scan_findings jsonb,
  add column if not exists virus_scanned_at timestamptz;

create index if not exists uploaded_files_scan_status_idx
  on public.uploaded_files(organization_id, virus_scan_status);
