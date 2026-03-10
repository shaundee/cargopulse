-- ─── Multi-destination expansion ─────────────────────────────────────────────
-- Adds Trinidad & Tobago, Barbados, and Guyana to every existing org that
-- does not already have them.  Jamaica rows are untouched (preserves any
-- org-specific enabled_statuses config).
-- Also updates create_org_for_user() so new orgs get all four destinations.

-- 1) Seed missing destinations for existing orgs --------------------------

insert into public.org_destinations (org_id, name, sort_order)
select o.id, 'Jamaica', 0
from public.organizations o
on conflict (org_id, name) do nothing;

insert into public.org_destinations (org_id, name, sort_order)
select o.id, 'Trinidad & Tobago', 1
from public.organizations o
on conflict (org_id, name) do nothing;

insert into public.org_destinations (org_id, name, sort_order)
select o.id, 'Barbados', 2
from public.organizations o
on conflict (org_id, name) do nothing;

insert into public.org_destinations (org_id, name, sort_order)
select o.id, 'Guyana', 3
from public.organizations o
on conflict (org_id, name) do nothing;

-- 2) Update create_org_for_user() to seed all four destinations -----------

create or replace function public.create_org_for_user(
  p_org_name      text,
  p_referral_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id          uuid;
  v_referrer_org_id uuid;
  v_new_code        text;
  chars             text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i                 int;
  attempts          int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_org_name is null or length(trim(p_org_name)) < 2 then
    raise exception 'Organization name too short';
  end if;

  -- Generate a unique referral code for the new org
  loop
    v_new_code := '';
    for i in 1..6 loop
      v_new_code := v_new_code || substr(chars, (floor(random() * length(chars)) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.organizations where referral_code = v_new_code);
    attempts := attempts + 1;
    if attempts > 1000 then
      v_new_code := null;
      exit;
    end if;
  end loop;

  insert into public.organizations (name, referral_code)
  values (trim(p_org_name), v_new_code)
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'admin')
  on conflict do nothing;

  insert into public.organization_billing (org_id, plan_tier, status, billing_period_start)
  values (v_org_id, 'free', 'active', now())
  on conflict (org_id) do nothing;

  -- Seed all four active destinations for the new org
  insert into public.org_destinations (org_id, name, sort_order)
  values
    (v_org_id, 'Jamaica',          0),
    (v_org_id, 'Trinidad & Tobago',1),
    (v_org_id, 'Barbados',         2),
    (v_org_id, 'Guyana',           3)
  on conflict (org_id, name) do nothing;

  -- If a valid referral code was provided, create a pending referral row
  if p_referral_code is not null and length(trim(p_referral_code)) > 0 then
    select id into v_referrer_org_id
    from public.organizations
    where referral_code = upper(trim(p_referral_code));

    if v_referrer_org_id is not null and v_referrer_org_id <> v_org_id then
      insert into public.referrals (referrer_org_id, referred_org_id, code_used)
      values (v_referrer_org_id, v_org_id, upper(trim(p_referral_code)));
    end if;
  end if;

  return v_org_id;
end;
$$;

-- Preserve both call signatures
revoke all on function public.create_org_for_user(text)       from public;
revoke all on function public.create_org_for_user(text, text) from public;
grant execute on function public.create_org_for_user(text)       to authenticated;
grant execute on function public.create_org_for_user(text, text) to authenticated;

notify pgrst, 'reload schema';
