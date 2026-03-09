-- 3. Replace add_shipment_event() with updated rank map
-- (runs after enum values are committed in the previous migration)
CREATE OR REPLACE FUNCTION public.add_shipment_event(
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
  v_current public.shipment_status;
  v_current_rank int;
  v_new_rank int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select s.org_id, s.current_status
    into v_org_id, v_current
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

  v_current_rank := case v_current
    when 'received'              then 10
    when 'collected'             then 20
    when 'loaded'                then 30
    when 'departed_uk'           then 40
    when 'arrived_destination'   then 50
    when 'customs_processing'    then 51
    when 'customs_cleared'       then 52
    when 'awaiting_collection'   then 53
    when 'collected_by_customer' then 55
    when 'out_for_delivery'      then 60
    when 'delivered'             then 70
    else 999
  end;

  v_new_rank := case p_status
    when 'received'              then 10
    when 'collected'             then 20
    when 'loaded'                then 30
    when 'departed_uk'           then 40
    when 'arrived_destination'   then 50
    when 'customs_processing'    then 51
    when 'customs_cleared'       then 52
    when 'awaiting_collection'   then 53
    when 'collected_by_customer' then 55
    when 'out_for_delivery'      then 60
    when 'delivered'             then 70
    else 999
  end;

  if v_new_rank < v_current_rank then
    raise exception 'Invalid status transition: cannot move backwards (% -> %)', v_current, p_status;
  end if;

  insert into public.shipment_events (
    shipment_id, org_id, status, note, occurred_at, created_by
  ) values (
    p_shipment_id, v_org_id, p_status, p_note, p_occurred_at, auth.uid()
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

-- 4. Seed message templates for the 3 new statuses for all existing orgs
INSERT INTO public.message_templates (org_id, status, body, enabled)
SELECT id, 'customs_processing',
  'Update: your shipment {{tracking_code}} is going through customs clearance.',
  true
FROM public.organizations
ON CONFLICT (org_id, status) DO NOTHING;

INSERT INTO public.message_templates (org_id, status, body, enabled)
SELECT id, 'customs_cleared',
  'Update: your shipment {{tracking_code}} has cleared customs.',
  true
FROM public.organizations
ON CONFLICT (org_id, status) DO NOTHING;

INSERT INTO public.message_templates (org_id, status, body, enabled)
SELECT id, 'awaiting_collection',
  'Your shipment {{tracking_code}} is ready for collection at the depot.',
  true
FROM public.organizations
ON CONFLICT (org_id, status) DO NOTHING;

notify pgrst, 'reload schema';
