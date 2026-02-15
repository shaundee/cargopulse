-- Restored migration file (may have been applied to remote already).
-- Purpose: allow 'agent' role + enforce role default.

alter table public.org_members
  drop constraint if exists org_members_role_check;

alter table public.org_members
  add constraint org_members_role_check
  check (role in ('admin','staff','field','agent'));

alter table public.org_members
  alter column role set default 'staff';

update public.org_members
set role = 'staff'
where role is null;

alter table public.org_members
  alter column role set not null;
