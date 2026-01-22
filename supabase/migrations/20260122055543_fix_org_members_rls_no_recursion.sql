-- Remove any org_members policies that can recurse
drop policy if exists "org_members_select_member" on public.org_members;
drop policy if exists "org_members_select_self" on public.org_members;
drop policy if exists "org_members_select_admin_all" on public.org_members;
drop policy if exists "org_members_admin_write" on public.org_members;
drop policy if exists "org_members_select_member" on public.org_members;

-- Keep org_members RLS enabled
alter table public.org_members enable row level security;

-- Minimal policy: user can read their own membership row(s)
create policy "org_members_select_self"
on public.org_members
for select
using (user_id = auth.uid());
