create policy "org members can read imports"
on storage.objects
for select
using (
  bucket_id = 'imports'
  and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid)
);

create policy "org members can upload imports"
on storage.objects
for insert
with check (
  bucket_id = 'imports'
  and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid)
);

create policy "org members can update imports"
on storage.objects
for update
using (
  bucket_id = 'imports'
  and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid)
)
with check (
  bucket_id = 'imports'
  and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid)
);