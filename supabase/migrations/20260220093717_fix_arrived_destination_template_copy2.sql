update public.message_templates
set body =
  'Update: shipment {{code}} has arrived at its destination ({{destination}}).' || E'\n' ||
  'Track: {{tracking_url}}'
where status::text = 'arrived_destination'
  and body ilike '%jamaica%';