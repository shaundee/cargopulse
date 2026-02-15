create table if not exists public.message_templates_misc (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  body text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

alter table public.message_templates_misc enable row level security;

create policy "message_templates_misc_crud_member"
on public.message_templates_misc
for all
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

-- Seed default payment reminder for orgs missing it
insert into public.message_templates_misc (org_id, key, body, enabled)
select o.id, 'payment_reminder',
  'Hi {{name}}, your balance for shipment {{code}} is {{balance}}. Paid: {{paid}} / Charged: {{charged}}. Please settle and reply with proof of payment. Thank you.',
  true
from public.organizations o
where not exists (
  select 1 from public.message_templates_misc mt
  where mt.org_id = o.id and mt.key = 'payment_reminder'
);

notify pgrst, 'reload schema';
