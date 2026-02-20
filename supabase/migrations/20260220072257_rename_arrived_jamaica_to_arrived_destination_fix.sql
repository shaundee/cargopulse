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
    execute $cmd$
      alter type public.shipment_status
      rename value 'arrived_jamaica' to 'arrived_destination'
    $cmd$;
  end if;
end $$;