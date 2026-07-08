-- Optional microlearning media enhancement migration.
-- These columns are not required by the current app runtime because the
-- existing code stores media metadata in microlearning_module.content_data.
-- They are added here to support future reporting, direct SQL exports, and
-- easier inspection in Supabase.

alter table public.microlearning_module
  add column if not exists video_url text;

alter table public.microlearning_module
  add column if not exists video_type text;

alter table public.microlearning_module
  add column if not exists youtube_url text;

alter table public.microlearning_module
  add column if not exists transcript_text text;

alter table public.microlearning_module
  add column if not exists caption_data jsonb;

alter table public.microlearning_module
  add column if not exists asset_bucket text;

alter table public.microlearning_module
  add column if not exists asset_storage_path text;

alter table public.microlearning_module
  add column if not exists audio_bucket text;

comment on column public.microlearning_module.video_url is 'Stable saved video reference for trainer-authored modules.';
comment on column public.microlearning_module.video_type is 'Video source type or mime type for the saved lesson.';
comment on column public.microlearning_module.youtube_url is 'Original YouTube lesson link when a video module uses YouTube.';
comment on column public.microlearning_module.transcript_text is 'Flattened transcript copy for easier reporting queries.';
comment on column public.microlearning_module.caption_data is 'Structured speech-to-text caption cues for trainee playback and analytics.';
