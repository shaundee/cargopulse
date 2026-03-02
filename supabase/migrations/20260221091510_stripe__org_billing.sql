alter table public.organizations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_status text not null default 'inactive',
  add column if not exists stripe_current_period_end timestamptz;

create index if not exists organizations_stripe_customer_id_idx
  on public.organizations (stripe_customer_id);

create index if not exists organizations_stripe_subscription_id_idx
  on public.organizations (stripe_subscription_id);