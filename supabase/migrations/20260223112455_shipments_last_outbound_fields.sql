alter table public.shipments
  add column if not exists last_outbound_message_at timestamptz,
  add column if not exists last_outbound_message_status text,
  add column if not exists last_outbound_send_status text,
  add column if not exists last_outbound_preview text;

create index if not exists shipments_org_last_outbound_idx
  on public.shipments (org_id, last_outbound_message_at desc);

notify pgrst, 'reload schema';