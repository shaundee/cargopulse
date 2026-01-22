-- Ensure one customer per org+phone
create unique index if not exists customers_org_phone_unique
on public.customers (org_id, phone);
