-- Update any "arrived_destination" templates that still mention Jamaica
update public.message_templates
set body = 'Update: shipment {{code}} has arrived at its destination ({{destination}}). Track: {{tracking_url}}'
where status::text = 'arrived_destination'
  and body ilike '%jamaica%';

-- Optional: also fix old message logs so your demo history looks clean
-- (This edits stored history; if you prefer to keep history untouched, delete this block.)
update public.message_logs
set body = regexp_replace(body, '(?i)arrived in jamaica', 'arrived at its destination ({{destination}})', 'g')
where status::text = 'arrived_destination'
  and body ilike '%jamaica%';