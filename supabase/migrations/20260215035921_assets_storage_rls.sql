-- Mirror your pod bucket policy, but for bucket_id = 'assets'
create policy "org members can read assets"
on storage.objects
for select
using (
  bucket_id = 'assets'
  and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid)
);

create policy "org members can upload assets"
on storage.objects
for insert
with check (
  bucket_id = 'assets'
  and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid)
);

create policy "org members can update assets"
on storage.objects
for update
using (
  bucket_id = 'assets'
  and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid)
)
with check (
  bucket_id = 'assets'
  and public.is_org_member(nullif(split_part(name, '/', 2), '')::uuid)
);
