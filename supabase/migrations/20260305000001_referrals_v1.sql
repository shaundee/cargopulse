-- ─── Referrals v1 ────────────────────────────────────────────────────────────
-- Adds referral_code to organizations, creates referrals table,
-- updates create_org_for_user() to auto-generate codes + link referrals.

-- 1) Add referral_code column
alter table public.organizations
  add column if not exists referral_code text unique;

-- 2) Backfill existing orgs
-- We generate unique 6-char codes inline using a DO block.
do $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  rec   record;
  code  text;
  i     int;
  ok    bool;
begin
  for rec in select id from public.organizations where referral_code is null loop
    ok := false;
    while not ok loop
      code := '';
      for i in 1..6 loop
        code := code || substr(chars, (floor(random() * length(chars)) + 1)::int, 1);
      end loop;
      if not exists (select 1 from public.organizations where referral_code = code) then
        update public.organizations set referral_code = code where id = rec.id;
        ok := true;
      end if;
    end loop;
  end loop;
end;
$$;

-- 3) Referrals table
create table if not exists public.referrals (
  id                   uuid        primary key default gen_random_uuid(),
  referrer_org_id      uuid        not null references public.organizations(id) on delete cascade,
  referred_org_id      uuid        references public.organizations(id) on delete set null,
  code_used            text        not null,
  status               text        not null default 'pending'
    check (status in ('pending', 'completed')),
  referrer_credit_applied  boolean not null default false,
  referred_coupon_applied  boolean not null default false,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);

-- 4) RLS — referrer org members can view their own referrals
alter table public.referrals enable row level security;

create policy "org can view own referrals"
  on public.referrals for select
  using (is_org_member(referrer_org_id));

-- 5) Updated create_org_for_user — now accepts optional referral code
--    and auto-generates a referral code for the new org.
create or replace function public.create_org_for_user(
  p_org_name     text,
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

-- Grant both signatures (old callers without p_referral_code still work)
revoke all on function public.create_org_for_user(text)       from public;
revoke all on function public.create_org_for_user(text, text) from public;
grant execute on function public.create_org_for_user(text)       to authenticated;
grant execute on function public.create_org_for_user(text, text) to authenticated;

notify pgrst, 'reload schema';
