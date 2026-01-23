-- Fix: ambiguous org_id in add_shipment_event by qualifying all references

create or replace function public.add_shipment_event(
  p_shipment_id uuid,
  p_status public.shipment_status,
  p_note text default null
)
returns table (
  shipment_id uuid,
  org_id uuid,
  current_status public.shipment_status,
  last_event_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Explicit alias avoids ambiguity
  select s.org_id
    into v_org_id
  from public.shipments s
  where s.id = p_shipment_id;

  if v_org_id is null then
    raise exception 'Shipment not found';
  end if;

  -- Explicit alias avoids ambiguity
  if not exists (
    select 1
    from public.org_members m
    where m.org_id = v_org_id
      and m.user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  insert into public.shipment_events (
    shipment_id,
    org_id,
    status,
    note,
    occurred_at,
    created_by
  ) values (
    p_shipment_id,
    v_org_id,
    p_status,
    p_note,
    v_now,
    auth.uid()
  );

  update public.shipments s
  set current_status = p_status,
      last_event_at = v_now
  where s.id = p_shipment_id
    and s.org_id = v_org_id;

  return query
  select s.id, s.org_id, s.current_status, s.last_event_at
  from public.shipments s
  where s.id = p_shipment_id;
end;
$$;

revoke all on function public.add_shipment_event(uuid, public.shipment_status, text) from public;
grant execute on function public.add_shipment_event(uuid, public.shipment_status, text) to authenticated;
