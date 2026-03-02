alter table public.shipments
  add column if not exists internal_notes text,
  add column if not exists reference_no text;

create index if not exists shipments_org_reference_no_idx
  on public.shipments (org_id, reference_no);

notify pgrst, 'reload schema';