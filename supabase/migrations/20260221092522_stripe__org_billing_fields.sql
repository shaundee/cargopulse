alter table public.organization_billing
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text;

create index if not exists organization_billing_stripe_customer_id_idx
  on public.organization_billing (stripe_customer_id);

create index if not exists organization_billing_stripe_subscription_id_idx
  on public.organization_billing (stripe_subscription_id);