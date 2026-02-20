-- Fix template copy to be destination-agnostic (templates only, not logs)

update public.message_templates
set body = 'Update: shipment {{code}} has arrived at its destination ({{destination}}).
Track: {{tracking_url}}'
where status::text = 'arrived_destination'
  and body ilike '%jamaica%';