-- Add 'valid' status to import_rows (for pre-validated rows awaiting import)
-- Add 'validating' + 'validated' to import_jobs

alter table public.import_rows
  drop constraint if exists import_rows_status_check;

alter table public.import_rows
  add constraint import_rows_status_check
  check (status in ('pending', 'valid', 'imported', 'error', 'skipped'));

alter table public.import_jobs
  drop constraint if exists import_jobs_status_check;

alter table public.import_jobs
  add constraint import_jobs_status_check
  check (status in ('created', 'parsed', 'validating', 'validated', 'importing', 'complete', 'failed'));

notify pgrst, 'reload schema';
