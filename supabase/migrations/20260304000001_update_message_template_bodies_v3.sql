-- Standardise all message template bodies across every org.
-- Variables: {{name}}, {{code}}, {{destination}}, {{tracking_url}}

-- ── 1. Update existing templates ─────────────────────────────────────────────

update public.message_templates set body =
  'Hi {{name}} 👋 We''ve received your shipment ({{code}}) at our UK depot. We''ll keep you updated as it moves. Track it here: {{tracking_url}}'
where status = 'received';

update public.message_templates set body =
  'Hi {{name}} 👋 We''ve collected your shipment ({{code}}) and it''s safely with us. Track it here: {{tracking_url}}'
where status = 'collected';

update public.message_templates set body =
  'Hi {{name}}, your shipment ({{code}}) has been packed and is getting ready to leave the UK. Track: {{tracking_url}}'
where status = 'loaded';

update public.message_templates set body =
  'Good news {{name}} — your shipment ({{code}}) has left the UK and is on its way to {{destination}}! Track: {{tracking_url}}'
where status = 'departed_uk';

update public.message_templates set body =
  '{{name}}, your shipment ({{code}}) has arrived in {{destination}}! Next step is clearance and then it''ll be ready. Track: {{tracking_url}}'
where status = 'arrived_destination';

update public.message_templates set body =
  'Hi {{name}}, your shipment ({{code}}) is going through customs in {{destination}}. We''ll let you know as soon as it clears. Track: {{tracking_url}}'
where status = 'customs_processing';

update public.message_templates set body =
  'Great news {{name}} — your shipment ({{code}}) has cleared customs in {{destination}}. Nearly there! Track: {{tracking_url}}'
where status = 'customs_cleared';

update public.message_templates set body =
  '{{name}}, your shipment ({{code}}) is ready for collection at the depot. Track: {{tracking_url}}'
where status = 'awaiting_collection';

update public.message_templates set body =
  '{{name}}, your shipment ({{code}}) is out for delivery today! Track: {{tracking_url}}'
where status = 'out_for_delivery';

update public.message_templates set body =
  'Hi {{name}}, your shipment ({{code}}) has been delivered. Thank you for shipping with us! 🙏 Track: {{tracking_url}}'
where status = 'delivered';

update public.message_templates set body =
  'Hi {{name}}, your shipment ({{code}}) has been collected. Thank you for shipping with us! 🙏'
where status = 'collected_by_customer';

-- ── 2. Insert missing templates for orgs that don't have them ────────────────
-- Covers statuses that were added after the initial seed migrations.

insert into public.message_templates (id, org_id, status, body, enabled, created_at)
select
  gen_random_uuid(),
  o.id,
  v.status::public.shipment_status,
  v.body,
  true,
  now()
from public.organizations o
cross join (values
  ('received',
   'Hi {{name}} 👋 We''ve received your shipment ({{code}}) at our UK depot. We''ll keep you updated as it moves. Track it here: {{tracking_url}}'),
  ('collected',
   'Hi {{name}} 👋 We''ve collected your shipment ({{code}}) and it''s safely with us. Track it here: {{tracking_url}}'),
  ('loaded',
   'Hi {{name}}, your shipment ({{code}}) has been packed and is getting ready to leave the UK. Track: {{tracking_url}}'),
  ('departed_uk',
   'Good news {{name}} — your shipment ({{code}}) has left the UK and is on its way to {{destination}}! Track: {{tracking_url}}'),
  ('arrived_destination',
   '{{name}}, your shipment ({{code}}) has arrived in {{destination}}! Next step is clearance and then it''ll be ready. Track: {{tracking_url}}'),
  ('customs_processing',
   'Hi {{name}}, your shipment ({{code}}) is going through customs in {{destination}}. We''ll let you know as soon as it clears. Track: {{tracking_url}}'),
  ('customs_cleared',
   'Great news {{name}} — your shipment ({{code}}) has cleared customs in {{destination}}. Nearly there! Track: {{tracking_url}}'),
  ('awaiting_collection',
   '{{name}}, your shipment ({{code}}) is ready for collection at the depot. Track: {{tracking_url}}'),
  ('out_for_delivery',
   '{{name}}, your shipment ({{code}}) is out for delivery today! Track: {{tracking_url}}'),
  ('delivered',
   'Hi {{name}}, your shipment ({{code}}) has been delivered. Thank you for shipping with us! 🙏 Track: {{tracking_url}}'),
  ('collected_by_customer',
   'Hi {{name}}, your shipment ({{code}}) has been collected. Thank you for shipping with us! 🙏')
) as v(status, body)
where not exists (
  select 1
  from public.message_templates t
  where t.org_id = o.id
    and t.status = v.status::public.shipment_status
);
