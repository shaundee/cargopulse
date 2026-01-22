-- Fix org_members SELECT policy: avoid recursion via is_org_member()

-- Remove the recursive select policy if it exists
drop policy if exists "org_members_select_member" on public.org_members;

-- Allow a user to see THEIR OWN membership row(s)
create policy "org_members_select_self"
on public.org_members
for select
using (user_id = auth.uid());

-- Allow admins to see all members in their org
create policy "org_members_select_admin_all"
on public.org_members
for select
using (
  exists (
    select 1
    from public.org_members m
    where m.org_id = org_members.org_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);
