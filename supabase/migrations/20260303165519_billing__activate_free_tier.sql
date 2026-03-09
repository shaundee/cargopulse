-- Ensure every org has a billing row
insert into public.organization_billing (org_id, plan_tier, status, billing_period_start)
select o.id, 'free', 'active', now()
from public.organizations o
where not exists (
  select 1 from public.organization_billing ob where ob.org_id = o.id
);

-- Fix legacy rows: free tier should not be blocked by 'inactive'
update public.organization_billing
set status = 'active',
    updated_at = now()
where (plan_tier is null or plan_tier = 'free')
  and (status is null or lower(status) = 'inactive')
  and stripe_subscription_id is null;

notify pgrst, 'reload schema';