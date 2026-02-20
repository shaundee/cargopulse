begin;

-- Seed default message templates for every org (idempotent)
-- message_templates.status is an enum: public.shipment_status

with enum_labels as (
  select e.enumlabel
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  where t.typname = 'shipment_status'
),
seeds as (
  select *
  from (values
    ('received_uk_depot',      'Update: shipment {{code}} has been received at our UK depot.'),
    ('collected',             'Update: shipment {{code}} has been collected in the UK.'),
    ('departed_uk',           'Update: shipment {{code}} has departed the UK.'),
    ('arrived_destination',   'Update: shipment {{code}} has been arrived at the destination depot.'),
    ('collected_by_customer', 'Update: shipment {{code}} has been collected by the recipient.'),
    ('delivered',             'Delivered: shipment {{code}} has been delivered. Thank you.'),
    ('payment_reminder',      'Reminder: balance due for shipment {{code}}. Please contact us to settle payment.')
  ) as v(status, body)
  -- only keep statuses that actually exist in the enum
  where exists (select 1 from enum_labels el where el.enumlabel = v.status)
)

insert into public.message_templates (id, org_id, status, body, enabled, created_at)
select
  gen_random_uuid(),
  o.id,
  s.status::public.shipment_status,
  s.body,
  true,
  now()
from public.organizations o
cross join seeds s
where not exists (
  select 1
  from public.message_templates t
  where t.org_id = o.id
    and t.status = s.status::public.shipment_status
);

commit;