-- ─── Billing tiers v1 ────────────────────────────────────────────────────────
-- Adds plan_tier, shipment_count, billing_period_start
-- to organization_billing; backfills existing orgs; updates create_org_for_user();
-- adds increment_shipment_count() RPC.
-- Starter overage is reported via Stripe Billing Meters (event_name:
-- 'cargopulse_starter_shipment') — no item ID stored in DB.

-- 1) Schema changes

alter table public.organization_billing
  add column if not exists plan_tier text not null default 'free'
    check (plan_tier in ('free', 'starter', 'pro')),
  add column if not exists shipment_count int not null default 0,
  add column if not exists billing_period_start timestamptz not null default now();

-- 2) Backfill: existing paid/trialing orgs → pro

update public.organization_billing
  set plan_tier = 'pro'
  where status in ('active', 'trialing');

-- 3) Seed free-tier rows for orgs that have no billing row yet

insert into public.organization_billing (org_id, plan_tier, status, billing_period_start)
select o.id, 'free', 'active', now()
from public.organizations o
where not exists (
  select 1 from public.organization_billing ob where ob.org_id = o.id
);

-- 4) Update create_org_for_user() to seed a free-tier billing row for new orgs

create or replace function public.create_org_for_user(p_org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_org_name is null or length(trim(p_org_name)) < 2 then
    raise exception 'Organization name too short';
  end if;

  insert into public.organizations (name)
  values (trim(p_org_name))
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'admin')
  on conflict do nothing;

  insert into public.organization_billing (org_id, plan_tier, status, billing_period_start)
  values (v_org_id, 'free', 'active', now())
  on conflict (org_id) do nothing;

  return v_org_id;
end;
$$;

revoke all on function public.create_org_for_user(text) from public;
grant execute on function public.create_org_for_user(text) to authenticated;

-- 5) Atomic shipment count increment — returns new count

create or replace function public.increment_shipment_count(p_org_id uuid)
returns int
language sql
security definer
set search_path = public
as $$
  update public.organization_billing
  set shipment_count = shipment_count + 1
  where org_id = p_org_id
  returning shipment_count;
$$;

revoke all on function public.increment_shipment_count(uuid) from public;
grant execute on function public.increment_shipment_count(uuid) to authenticated;

notify pgrst, 'reload schema';
