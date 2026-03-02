-- 1) Agent invites (one-time links)
create table if not exists public.org_agent_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  destination_id uuid not null references public.org_destinations(id) on delete cascade,

  agent_name text not null,
  agent_phone_e164 text not null,
  agent_email text not null,

  token_hash text not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  created_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),

  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null
);

create index if not exists org_agent_invites_org_idx on public.org_agent_invites(org_id);
create index if not exists org_agent_invites_token_idx on public.org_agent_invites(token_hash);

-- 2) Destination scopes (what an agent is allowed to see)
create table if not exists public.org_agent_scopes (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.org_destinations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id, destination_id)
);

create index if not exists org_agent_scopes_user_idx on public.org_agent_scopes(user_id);

-- 3) RLS: keep it simple
alter table public.org_agent_invites enable row level security;
alter table public.org_agent_scopes enable row level security;

create or replace function public.org_member_role(p_org_id uuid)
returns text
language sql
stable
as $$
  select m.role
  from public.org_members m
  where m.org_id = p_org_id and m.user_id = auth.uid()
  limit 1
$$;

-- Admin/staff can view invites inside their org (writes happen via service role routes)
create policy "agent_invites_select_admin_staff"
on public.org_agent_invites
for select
using (
  public.is_org_member(org_id)
  and public.org_member_role(org_id) in ('admin','staff')
);

-- Agents can view their own scopes
create policy "agent_scopes_select_self"
on public.org_agent_scopes
for select
using (user_id = auth.uid());

notify pgrst, 'reload schema';