-- Seed default message templates for orgs that have NONE
-- message_templates.status is shipment_status enum, so we cast.

with orgs_missing as (
  select o.id as org_id
  from public.organizations o
  left join public.message_templates mt on mt.org_id = o.id
  group by o.id
  having count(mt.id) = 0
),
defaults as (
  select *
  from (values
    ('received'::public.shipment_status,         'Hi {{name}}, we received your shipment {{code}} at our UK depot.'),
    ('loaded'::public.shipment_status,           'Update: shipment {{code}} has been loaded and is preparing to depart.'),
    ('departed_uk'::public.shipment_status,      'Update: shipment {{code}} has departed the UK.'),
    ('arrived_jamaica'::public.shipment_status,  'Update: shipment {{code}} has arrived in Jamaica.'),
    ('out_for_delivery'::public.shipment_status, 'Update: shipment {{code}} is out for delivery.'),
    ('delivered'::public.shipment_status,        'Delivered: shipment {{code}} has been delivered. Thank you.')
  ) as v(status, body)
)
insert into public.message_templates (org_id, status, body, enabled)
select om.org_id, d.status, d.body, true
from orgs_missing om
cross join defaults d;
