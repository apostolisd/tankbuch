-- Privater Bucket «belege»; Zugriff nur auf den eigenen Präfix <auth.uid()>/

insert into storage.buckets (id, name, public)
values ('belege', 'belege', false)
on conflict (id) do update set public = false;

create policy "belege lesen (eigener praefix)" on storage.objects
  for select to authenticated
  using (bucket_id = 'belege' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "belege hochladen (eigener praefix)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'belege' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "belege ändern (eigener praefix)" on storage.objects
  for update to authenticated
  using (bucket_id = 'belege' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'belege' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "belege löschen (eigener praefix)" on storage.objects
  for delete to authenticated
  using (bucket_id = 'belege' and (storage.foldername(name))[1] = auth.uid()::text);
