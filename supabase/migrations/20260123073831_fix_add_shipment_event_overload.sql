-- Fix PostgREST RPC ambiguity: remove overloaded add_shipment_event signatures

-- Drop the 3-arg overload (keep only one function name)
drop function if exists public.add_shipment_event(uuid, public.shipment_status, text);

-- Create/replace the single canonical function (4 args with defaults)
create or replace function public.add_shipment_event(
  p_shipment_id uuid,
  p_status public.shipment_status,
  p_note text default null,
  p_occurred_at timestamptz default now()
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select s.org_id
    into v_org_id
  from public.shipments s
  where s.id = p_shipment_id;

  if v_org_id is null then
    raise exception 'Shipment not found';
  end if;

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
    p_occurred_at,
    auth.uid()
  );

  update public.shipments s
  set current_status = p_status,
      last_event_at = p_occurred_at
  where s.id = p_shipment_id
    and s.org_id = v_org_id;

  return query
  select s.id, s.org_id, s.current_status, s.last_event_at
  from public.shipments s
  where s.id = p_shipment_id;
end;
$$;

revoke all on function public.add_shipment_event(uuid, public.shipment_status, text, timestamptz) from public;
grant execute on function public.add_shipment_event(uuid, public.shipment_status, text, timestamptz) to authenticated;
