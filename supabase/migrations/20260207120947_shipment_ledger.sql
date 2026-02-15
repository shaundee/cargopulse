create table if not exists public.shipment_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,

  -- charge = money owed (+), payment = money received (-), adjustment = manual signed fix
  entry_type text not null check (entry_type in ('charge','payment','adjustment')),
  amount_pence integer not null check (amount_pence <> 0),
  currency text not null default 'GBP',

  method text null, -- cash, bank_transfer, card, etc
  note text null,

  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists shipment_ledger_org_id_idx on public.shipment_ledger (org_id);
create index if not exists shipment_ledger_shipment_id_created_at_idx
  on public.shipment_ledger (shipment_id, created_at desc);

alter table public.shipment_ledger enable row level security;

-- Read: org members can read
create policy "shipment_ledger_select_org"
on public.shipment_ledger
for select
to authenticated
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = shipment_ledger.org_id
      and m.user_id = auth.uid()
  )
);

-- Insert: org members can insert, and shipment must belong to org
create policy "shipment_ledger_insert_org"
on public.shipment_ledger
for insert
to authenticated
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = shipment_ledger.org_id
      and m.user_id = auth.uid()
  )
  and exists (
    select 1 from public.shipments s
    where s.id = shipment_ledger.shipment_id
      and s.org_id = shipment_ledger.org_id
  )
);

-- Update/Delete: org members only
create policy "shipment_ledger_update_org"
on public.shipment_ledger
for update
to authenticated
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = shipment_ledger.org_id
      and m.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = shipment_ledger.org_id
      and m.user_id = auth.uid()
  )
);

create policy "shipment_ledger_delete_org"
on public.shipment_ledger
for delete
to authenticated
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = shipment_ledger.org_id
      and m.user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
