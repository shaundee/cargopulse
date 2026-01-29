-- POD v2 (safe): assume shipment_id is already PRIMARY KEY

-- Add created_at if missing
alter table public.pod
  add column if not exists created_at timestamptz not null default now();

-- Ensure delivered_at exists (your table has it already, but keep safe)
alter table public.pod
  add column if not exists delivered_at timestamptz;

-- Ensure receiver_name / photo_url exist (safe)
alter table public.pod
  add column if not exists receiver_name text,
  add column if not exists photo_url text;

-- Helpful index for org filtering
create index if not exists pod_org_id_idx
  on public.pod (org_id);

-- Optional foreign keys (only if not present)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pod_shipment_id_fkey') then
    alter table public.pod
      add constraint pod_shipment_id_fkey
      foreign key (shipment_id) references public.shipments(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'pod_org_id_fkey') then
    alter table public.pod
      add constraint pod_org_id_fkey
      foreign key (org_id) references public.organizations(id) on delete cascade;
  end if;
end $$;

notify pgrst, 'reload schema';
