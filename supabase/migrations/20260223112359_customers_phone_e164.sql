alter table public.customers
  add column if not exists phone_e164 text,
  add column if not exists country_code text;

-- Best-effort backfill for common patterns
update public.customers
set phone_e164 = nullif(trim(phone), '')
where phone_e164 is null;

-- Strip whatsapp: prefix if present
update public.customers
set phone_e164 = regexp_replace(phone_e164, '^whatsapp:', '')
where phone_e164 like 'whatsapp:%';

-- 00... -> +...
update public.customers
set phone_e164 = '+' || substr(phone_e164, 3)
where phone_e164 like '00%';

-- If digits start with 44... treat as +44...
update public.customers
set phone_e164 = '+' || regexp_replace(phone_e164, '[^0-9]', '', 'g')
where phone_e164 is not null
  and phone_e164 !~ '^\+'
  and regexp_replace(phone_e164, '[^0-9]', '', 'g') ~ '^44[0-9]{7,}$';

-- UK heuristic: 07xxxxxxxxx -> +44...
update public.customers
set phone_e164 = '+44' || substr(regexp_replace(phone, '[^0-9]', '', 'g'), 2)
where phone_e164 is null
  and regexp_replace(phone, '[^0-9]', '', 'g') ~ '^07[0-9]{9}$';

create index if not exists customers_org_phone_e164_idx
  on public.customers (org_id, phone_e164);

notify pgrst, 'reload schema';