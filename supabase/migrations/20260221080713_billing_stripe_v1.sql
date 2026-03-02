create table if not exists public.organization_billing (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_billing enable row level security;

create policy "org_billing_select_member"
on public.organization_billing
for select
using (public.is_org_member(org_id));

create policy "org_billing_write_admin_staff"
on public.organization_billing
for insert
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = organization_billing.org_id
      and m.user_id = auth.uid()
      and m.role in ('admin','staff')
  )
);

create policy "org_billing_update_admin_staff"
on public.organization_billing
for update
using (
  exists (
    select 1 from public.org_members m
    where m.org_id = organization_billing.org_id
      and m.user_id = auth.uid()
      and m.role in ('admin','staff')
  )
)
with check (
  exists (
    select 1 from public.org_members m
    where m.org_id = organization_billing.org_id
      and m.user_id = auth.uid()
      and m.role in ('admin','staff')
  )
);