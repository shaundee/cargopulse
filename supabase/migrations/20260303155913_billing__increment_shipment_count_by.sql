create or replace function public.increment_shipment_count_by(p_org_id uuid, p_delta int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.organization_billing
  set shipment_count = shipment_count + greatest(p_delta, 0)
  where org_id = p_org_id
  returning shipment_count;
$$;

revoke all on function public.increment_shipment_count_by(uuid, int) from public;
grant execute on function public.increment_shipment_count_by(uuid, int) to authenticated;

notify pgrst, 'reload schema';