alter table public.message_logs
  add column if not exists template_id uuid references public.message_templates(id) on delete set null,
  add column if not exists status text,
  add column if not exists body text;

-- optional: index for filtering logs
create index if not exists message_logs_org_created_idx
  on public.message_logs (org_id, created_at desc);

create index if not exists message_logs_shipment_created_idx
  on public.message_logs (shipment_id, created_at desc);

-- refresh PostgREST schema cache (helps avoid "schema cache" errors)
notify pgrst, 'reload schema';
