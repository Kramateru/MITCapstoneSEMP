-- Aligns storage bucket names with the live application defaults.
-- Apply this in Supabase SQL Editor after the existing schema files.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'microlearning-videos',
    'microlearning-videos',
    true,
    52428800,
    array[
      'video/*',
      'audio/*',
      'image/*',
      'text/*',
      'application/pdf',
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
    'call-recordings',
    'call-recordings',
    true,
    52428800,
    array['audio/*', 'video/webm']
  ),
  (
    'call-ringers',
    'call-ringers',
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

drop policy if exists "microlearning_videos_read_authenticated" on storage.objects;
create policy "microlearning_videos_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'microlearning-videos');

drop policy if exists "profile_pictures_read_authenticated" on storage.objects;
create policy "profile_pictures_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'profile-pictures');

drop policy if exists "call_recordings_read_authenticated" on storage.objects;
create policy "call_recordings_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'call-recordings');

drop policy if exists "call_ringers_read_authenticated" on storage.objects;
create policy "call_ringers_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'call-ringers');

drop policy if exists "attachments_read_authenticated" on storage.objects;
create policy "attachments_read_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'attachments');
