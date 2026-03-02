-- Seed misc templates for every org (idempotent)

insert into public.message_templates_misc (org_id, key, body, enabled)
select o.id,
       'tracking_link',
       'Hi {{name}}, track your shipment {{code}} here: {{tracking_url}}',
       true
from public.organizations o
where not exists (
  select 1
  from public.message_templates_misc mt
  where mt.org_id = o.id and mt.key = 'tracking_link'
);

insert into public.message_templates_misc (org_id, key, body, enabled)
select o.id,
       'nudge',
       'Hi {{name}}, quick update on shipment {{code}}. Track here: {{tracking_url}}',
       true
from public.organizations o
where not exists (
  select 1
  from public.message_templates_misc mt
  where mt.org_id = o.id and mt.key = 'nudge'
);

notify pgrst, 'reload schema';