-- 1) Extend message_logs to support inbound
alter table public.message_logs
  add column if not exists direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  add column if not exists from_phone text,
  add column if not exists media jsonb,
  add column if not exists raw_payload jsonb;

create index if not exists message_logs_org_direction_created_idx
  on public.message_logs (org_id, direction, created_at desc);

create index if not exists message_logs_org_from_phone_idx
  on public.message_logs (org_id, from_phone);

-- 2) Store inbound messages we can't match to a shipment
create table if not exists public.inbound_messages_unmatched (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'twilio_whatsapp',
  provider_message_id text,
  from_phone text,
  to_phone text,
  body text,
  media jsonb,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

-- Lock unmatched table down (service role will still be able to write)
alter table public.inbound_messages_unmatched enable row level security;

notify pgrst, 'reload schema';
