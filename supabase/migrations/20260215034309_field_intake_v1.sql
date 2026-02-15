-- 1) Add new status value (safe)
do $$
begin
  alter type public.shipment_status add value 'collected';
exception when duplicate_object then null;
end $$;

-- 2) Cargo fields (minimal, sellable)
alter table public.shipments
  add column if not exists cargo_type text not null default 'general',
  add column if not exists cargo_meta jsonb not null default '{}'::jsonb;

alter table public.shipments
  drop constraint if exists shipments_cargo_type_check;

alter table public.shipments
  add constraint shipments_cargo_type_check
  check (cargo_type in ('general','barrel','box','vehicle','machinery','mixed','other'));

-- 3) Server-side idempotency table for offline sync
create table if not exists public.client_sync_events (
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_event_id uuid not null,
  kind text not null,
  shipment_id uuid references public.shipments(id) on delete set null,
  tracking_code text,
  payload jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  primary key (org_id, client_event_id)
);

alter table public.client_sync_events enable row level security;

create policy "org members can read client sync events"
on public.client_sync_events
for select
using (public.is_org_member(org_id));

create policy "org members can insert client sync events"
on public.client_sync_events
for insert
with check (public.is_org_member(org_id));

create policy "org members can update client sync events"
on public.client_sync_events
for update
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

-- 4) Shipment assets (pickup photos/signature)
create table if not exists public.shipment_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  kind text not null check (kind in ('pickup_photo','pickup_signature')),
  path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists shipment_assets_shipment_id_idx
on public.shipment_assets (shipment_id);

alter table public.shipment_assets enable row level security;

create policy "org members can read shipment assets"
on public.shipment_assets
for select
using (public.is_org_member(org_id));

create policy "org members can insert shipment assets"
on public.shipment_assets
for insert
with check (public.is_org_member(org_id));

