create table if not exists public.org_destinations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table public.org_destinations enable row level security;

create policy "org_destinations_crud_member"
on public.org_destinations
for all
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

-- Seed: make sure every org has at least one destination
insert into public.org_destinations (org_id, name, sort_order)
select o.id, 'Jamaica', 0
from public.organizations o
where not exists (
  select 1 from public.org_destinations d where d.org_id = o.id
);

-- Seed from existing shipment.destination text (best effort)
insert into public.org_destinations (org_id, name, sort_order)
select s.org_id, trim(s.destination), 10
from public.shipments s
where trim(coalesce(s.destination,'')) <> ''
on conflict do nothing;

notify pgrst, 'reload schema';