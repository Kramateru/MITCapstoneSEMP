-- Supabase schema for the Microlearning media pipeline.
-- Creates the lesson-media bucket used for uploaded audio/video/image assets
-- plus the metadata table that stores transcript and caption data returned by Gemini.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio-modules',
  'audio-modules',
  false,
  52428800,
  array[
    'audio/*',
    'video/*',
    'image/*',
    'text/*',
    'application/pdf',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.audio_content (
  id uuid primary key default gen_random_uuid(),
  module_id text not null unique references public.microlearning_module(id) on delete cascade,
  title text not null,
  trainer_id text not null references public."user"(id) on delete cascade,
  url text not null,
  storage_path text not null,
  mime_type text not null default 'audio/mpeg',
  transcript text,
  transcript_text text,
  summary_text text,
  duration_seconds integer,
  bucket_name text,
  original_filename text,
  caption_data jsonb,
  gemini_model text,
  gemini_file_uri text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.audio_content
  add column if not exists transcript_text text;

alter table public.audio_content
  add column if not exists summary_text text;

alter table public.audio_content
  add column if not exists bucket_name text;

alter table public.audio_content
  add column if not exists original_filename text;

alter table public.audio_content
  add column if not exists caption_data jsonb;

create index if not exists idx_audio_content_trainer_id
  on public.audio_content (trainer_id);

create index if not exists idx_audio_content_module_id
  on public.audio_content (module_id);

create or replace function public.set_audio_content_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_audio_content_updated_at on public.audio_content;
create trigger trg_audio_content_updated_at
before update on public.audio_content
for each row
execute function public.set_audio_content_updated_at();

alter table public.audio_content enable row level security;

drop policy if exists audio_content_select on public.audio_content;
create policy audio_content_select
on public.audio_content
for select
using (
  trainer_id = auth.uid()::text
  or exists (
    select 1
    from public.microlearning_assignment as assignment
    where assignment.module_id = audio_content.module_id
      and assignment.trainee_id = auth.uid()::text
  )
);

drop policy if exists audio_content_manage on public.audio_content;
create policy audio_content_manage
on public.audio_content
for all
using (trainer_id = auth.uid()::text)
with check (trainer_id = auth.uid()::text);
