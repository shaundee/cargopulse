-- 1) Rename enum value if needed: arrived_jamaica -> arrived_destination
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'shipment_status'
      and e.enumlabel = 'arrived_jamaica'
  ) and not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'shipment_status'
      and e.enumlabel = 'arrived_destination'
  ) then
    execute 'alter type public.shipment_status rename value ''arrived_jamaica'' to ''arrived_destination''';
  end if;
end $$;

-- 2) If both exist (someone added arrived_destination earlier), migrate rows onto arrived_destination
do $$
begin
  if exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid=t.oid
    where t.typname='shipment_status' and e.enumlabel='arrived_destination'
  ) and exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid=t.oid
    where t.typname='shipment_status' and e.enumlabel='arrived_jamaica'
  ) then
    update public.shipments
      set current_status = 'arrived_destination'
      where current_status = 'arrived_jamaica';

    update public.shipment_events
      set status = 'arrived_destination'
      where status = 'arrived_jamaica';

    update public.message_templates
      set status = 'arrived_destination'
      where status = 'arrived_jamaica';
  end if;
end $$;

-- 3) Fix the template BODY so it stops saying Jamaica
update public.message_templates
set body =
  'Update: shipment {{code}} has arrived at its destination ({{destination}}).' || E'\n' ||
  'Track: {{tracking_url}}'
where status = 'arrived_destination'
  and body ilike '%jamaica%';