-- 1) Drop old role constraint (it blocks the new roles)
alter table public.org_members
  drop constraint if exists org_members_role_check;

-- 2) Normalize any existing values into the new role set
-- (handles old schemas like owner/member, plus nulls)
update public.org_members
set role = case
  when role in ('owner') then 'admin'
  when role in ('member', 'user') then 'staff'
  when role is null then 'staff'
  when role in ('admin','staff','field','agent') then role
  else 'staff'
end;

-- 3) Make role consistent going forward
alter table public.org_members
  alter column role set default 'staff';

-- optional but recommended if you want strictness:
-- ensure no null roles remain, then enforce NOT NULL
update public.org_members set role = 'staff' where role is null;
alter table public.org_members alter column role set not null;

-- 4) Re-add constraint with the new allowed roles
alter table public.org_members
  add constraint org_members_role_check
  check (role in ('admin','staff','field','agent'));
