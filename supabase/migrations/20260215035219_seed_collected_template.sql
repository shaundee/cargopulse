insert into public.message_templates (org_id, status, body, enabled)
select o.id, 'collected',
  'Hi {{name}}, we collected your shipment ({{code}}) in the UK.',
  true
from public.organizations o
where not exists (
  select 1 from public.message_templates t
  where t.org_id = o.id and t.status = 'collected'
);
