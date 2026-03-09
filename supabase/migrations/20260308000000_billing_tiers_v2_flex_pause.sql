-- Expand billing tiers to support Flex + Pause and convert Pro to a capped tier.
-- Flex: low-volume plan with metered shipments.
-- Pause: account retained, new shipment creation disabled.

alter table public.organization_billing
  drop constraint if exists organization_billing_plan_tier_check;

alter table public.organization_billing
  add constraint organization_billing_plan_tier_check
  check (plan_tier in ('free', 'flex', 'starter', 'pro', 'pause'));

notify pgrst, 'reload schema';
