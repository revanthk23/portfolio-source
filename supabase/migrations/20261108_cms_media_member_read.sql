-- Allow authenticated CMS members to read private draft media in the admin dashboard.
-- Public/anonymous access remains restricted to published media by the existing policy.
create policy cms_media_objects_read_member on storage.objects
for select to authenticated
using (
  bucket_id = 'cms-media'
  and exists (
    select 1
    from public.cms_site_members m
    where m.site_id::text = split_part(storage.objects.name, '/', 1)
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'editor')
  )
);
