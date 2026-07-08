-- Migration: Drop tutorial/onboarding columns from user table
-- Run this against your Postgres database when ready (backup recommended)

ALTER TABLE public."user" DROP COLUMN IF EXISTS has_completed_tutorial;

ALTER TABLE public."user" DROP COLUMN IF EXISTS tutorial_completed_date;

ALTER TABLE public."user" DROP COLUMN IF EXISTS tutorial_skipped;

ALTER TABLE public."user" DROP COLUMN IF EXISTS tutorial_replay_count;

ALTER TABLE public."user" DROP COLUMN IF EXISTS last_tutorial_replay_date;

-- Also drop from public.profiles if you previously mirrored values there
ALTER TABLE IF EXISTS public.profiles
DROP COLUMN IF EXISTS has_completed_tutorial;

ALTER TABLE IF EXISTS public.profiles
DROP COLUMN IF EXISTS tutorial_completed_date;

ALTER TABLE IF EXISTS public.profiles
DROP COLUMN IF EXISTS tutorial_skipped;

ALTER TABLE IF EXISTS public.profiles
DROP COLUMN IF EXISTS tutorial_replay_count;

ALTER TABLE IF EXISTS public.profiles
DROP COLUMN IF EXISTS last_tutorial_replay_date;