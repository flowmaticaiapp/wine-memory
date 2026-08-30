-- Wine Memory: make bottle photos private without deleting existing objects.
-- Apply only after a Supabase backup and a successful preview deployment.

update storage.buckets
set public = false
where id = 'bottle-photos';

drop policy if exists "photos public read" on storage.objects;
drop policy if exists "photos own read" on storage.objects;

create policy "photos own read" on storage.objects for select
  using (
    bucket_id = 'bottle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
