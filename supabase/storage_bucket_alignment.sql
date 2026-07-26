-- Aligns storage bucket names with the live application defaults.
-- Apply this in Supabase SQL Editor after the existing schema files.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'microlearning-audio',
    'microlearning-audio',
    true,
    52428800,
    array[
      'audio/*',
      'text/*',
      'application/octet-stream'
    ]
  ),
  (
    'profile-pictures',
    'profile-pictures',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'recordings',
    'recordings',
    true,
    52428800,
    array['audio/*', 'video/webm']
  ),
  (
    'call-simulation-audio',
    'call-simulation-audio',
    true,
    52428800,
    array['audio/*']
  ),
  (
    'attachments',
    'attachments',
    true,
    52428800,
    array[
      'audio/*',
      'video/*',
      'image/*',
      'application/pdf',
      'application/octet-stream',
      'text/*'
    ]
  )
on conflict (id)
do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "microlearning_audio_read_authenticated" on storage.objects;
create policy "microlearning_audio_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'microlearning-audio');

drop policy if exists "microlearning_audio_manage_trainers" on storage.objects;
create policy "microlearning_audio_manage_trainers"
on storage.objects
for all
to authenticated
using (bucket_id = 'microlearning-audio' and public.is_trainer_or_admin())
with check (bucket_id = 'microlearning-audio' and public.is_trainer_or_admin());

drop policy if exists "profile_pictures_read_authenticated" on storage.objects;
create policy "profile_pictures_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'profile-pictures');

drop policy if exists "recordings_read_authenticated" on storage.objects;
create policy "recordings_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'recordings');

drop policy if exists "recordings_manage_authenticated" on storage.objects;
create policy "recordings_manage_authenticated"
on storage.objects
for all
to authenticated
using (bucket_id = 'recordings')
with check (bucket_id = 'recordings');

drop policy if exists "call_simulation_audio_read_authenticated" on storage.objects;
create policy "call_simulation_audio_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'call-simulation-audio');

drop policy if exists "call_simulation_audio_manage_trainers" on storage.objects;
create policy "call_simulation_audio_manage_trainers"
on storage.objects
for all
to authenticated
using (bucket_id = 'call-simulation-audio' and public.is_trainer_or_admin())
with check (bucket_id = 'call-simulation-audio' and public.is_trainer_or_admin());

drop policy if exists "attachments_read_authenticated" on storage.objects;
create policy "attachments_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'attachments');
