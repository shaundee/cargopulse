-- Create an organization + make the current user an admin member.
-- Uses SECURITY DEFINER so it can insert even when RLS is enabled.
create or replace function public.create_org_for_user(p_org_name text)
returns uuid
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

  if p_org_name is null or length(trim(p_org_name)) < 2 then
    raise exception 'Organization name too short';
  end if;

  insert into public.organizations (name)
  values (trim(p_org_name))
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'admin')
  on conflict do nothing;

  return v_org_id;
end;
$$;

-- Allow authenticated users to call it
revoke all on function public.create_org_for_user(text) from public;
grant execute on function public.create_org_for_user(text) to authenticated;
