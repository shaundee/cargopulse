-- Enable useful extensions
create extension if not exists "pgcrypto";

-- 1) Orgs + membership
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  support_phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','staff')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Helper: membership check
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
  );
$$;

-- 2) Customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists customers_org_id_idx on public.customers(org_id);
create index if not exists customers_phone_idx on public.customers(phone);

-- 3) Shipments
create type public.shipment_status as enum (
  'received',
  'loaded',
  'departed_uk',
  'arrived_destination',
  'out_for_delivery',
  'delivered'
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  tracking_code text not null,
  destination text not null,
  service_type text not null default 'depot' check (service_type in ('depot','door_to_door')),
  current_status public.shipment_status not null default 'received',
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists shipments_org_tracking_unique on public.shipments(org_id, tracking_code);
create index if not exists shipments_org_status_idx on public.shipments(org_id, current_status);

-- 4) Shipment events (timeline)
create table if not exists public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  status public.shipment_status not null,
  note text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists shipment_events_shipment_idx on public.shipment_events(shipment_id);
create index if not exists shipment_events_org_idx on public.shipment_events(org_id);

-- 5) POD
create table if not exists public.pod (
  shipment_id uuid primary key references public.shipments(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  photo_url text not null,
  receiver_name text,
  delivered_at timestamptz not null default now()
);

-- 6) WhatsApp templates + logs
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  status public.shipment_status not null,
  body text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, status)
);

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  shipment_id uuid references public.shipments(id) on delete set null,
  to_phone text not null,
  provider text not null default 'whatsapp',
  provider_message_id text,
  send_status text not null default 'queued',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- -------------------
-- RLS
-- -------------------
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.customers enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_events enable row level security;
alter table public.pod enable row level security;
alter table public.message_templates enable row level security;
alter table public.message_logs enable row level security;

-- Organizations: members can read
create policy "org_select_member"
on public.organizations
for select
using (public.is_org_member(id));

-- org_members: members can read; admins can manage
create policy "org_members_select_member"
on public.org_members
for select
using (public.is_org_member(org_id));

create policy "org_members_admin_write"
on public.org_members
for all
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = org_members.org_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = org_members.org_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

-- Customers
create policy "customers_crud_member"
on public.customers
for all
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

-- Shipments
create policy "shipments_crud_member"
on public.shipments
for all
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

-- Shipment events
create policy "shipment_events_crud_member"
on public.shipment_events
for all
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

-- POD
create policy "pod_crud_member"
on public.pod
for all
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

-- Templates
create policy "templates_crud_member"
on public.message_templates
for all
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

-- Logs
create policy "logs_crud_member"
on public.message_logs
for all
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));
