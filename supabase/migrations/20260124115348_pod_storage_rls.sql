-- =========================
-- STORAGE: bucket "pod" RLS
-- =========================
-- Allow org members to read/write objects in:
--   pod / org/<org_id>/...

-- READ (SELECT)
create policy "pod_objects_select_org"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pod'
  and split_part(name, '/', 1) = 'org'
  and split_part(name, '/', 2) in (
    select org_id::text
    from public.org_members
    where user_id = auth.uid()
  )
);

-- INSERT (UPLOAD)
create policy "pod_objects_insert_org"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pod'
  and split_part(name, '/', 1) = 'org'
  and split_part(name, '/', 2) in (
    select org_id::text
    from public.org_members
    where user_id = auth.uid()
  )
);

-- UPDATE (needed because you used upsert: true on upload)
create policy "pod_objects_update_org"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pod'
  and split_part(name, '/', 1) = 'org'
  and split_part(name, '/', 2) in (
    select org_id::text
    from public.org_members
    where user_id = auth.uid()
  )
)
with check (
  bucket_id = 'pod'
  and split_part(name, '/', 1) = 'org'
  and split_part(name, '/', 2) in (
    select org_id::text
    from public.org_members
    where user_id = auth.uid()
  )
);

-- Optional: DELETE (handy for future)
create policy "pod_objects_delete_org"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pod'
  and split_part(name, '/', 1) = 'org'
  and split_part(name, '/', 2) in (
    select org_id::text
    from public.org_members
    where user_id = auth.uid()
  )
);

-- =========================
-- POD TABLE RLS
-- =========================
alter table public.pod enable row level security;

create policy "pod_select_org"
on public.pod
for select
to authenticated
using (
  org_id in (select org_id from public.org_members where user_id = auth.uid())
);

create policy "pod_insert_org"
on public.pod
for insert
to authenticated
with check (
  org_id in (select org_id from public.org_members where user_id = auth.uid())
);

create policy "pod_update_org"
on public.pod
for update
to authenticated
using (
  org_id in (select org_id from public.org_members where user_id = auth.uid())
)
with check (
  org_id in (select org_id from public.org_members where user_id = auth.uid())
);

notify pgrst, 'reload schema';
