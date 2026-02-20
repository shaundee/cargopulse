do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'shipment_status'
      and e.enumlabel = 'arrived_destination'
  ) and not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'shipment_status'
      and e.enumlabel = 'arrived_destination'
  ) then
    execute $$ alter type public.shipment_status rename value 'arrived_destination' to 'arrived_destination' $$;
  end if;
end $$;