create unique index if not exists message_logs_one_delivered_per_shipment
on public.message_logs (org_id, shipment_id)
where lower(status) = 'delivered';
