-- Remove duplicate delivered message logs (keep the newest)
-- This is required before adding the UNIQUE partial index.

with ranked as (
  select
    id,
    org_id,
    shipment_id,
    row_number() over (
      partition by org_id, shipment_id
      order by sent_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.message_logs
  where lower(status) = 'delivered'
)
delete from public.message_logs ml
using ranked r
where ml.id = r.id
  and r.rn > 1;
