-- Canonical cleanup for the trainer/trainee MCQ assessment navigation.
-- Run this only after backing up data and after confirming the live app uses:
--   public.mcq_category
--   public.mcq_question
--   public.mcq_assessment
--   public.mcq_submission
--
-- Purpose:
-- 1. Keep the active MCQ assessment tables used by the live backend.
-- 2. Remove deprecated parallel assessment schemas that create confusion.
--
-- The live trainer and trainee assessment flow already uses the singular mcq_* tables.
-- These deprecated tables are not needed for the active navigation:
--   public.training_assessment_*
--   public.mcq_categories / public.mcq_questions / public.mcq_assessments / public.mcq_submissions
--   public.assessment / public.assessment_question / public.assignment_batch / public.assessment_submission

drop view if exists public.training_assessment_question_report cascade;
drop view if exists public.training_assessment_category_report cascade;
drop view if exists public.training_assessment_attempt_feed cascade;

drop table if exists public.training_assessment_certificates cascade;
drop table if exists public.training_assessment_coaching_notes cascade;
drop table if exists public.training_assessment_attempts cascade;
drop table if exists public.training_assessment_assignments cascade;
drop table if exists public.training_assessment_questions cascade;
drop table if exists public.training_assessments cascade;
drop table if exists public.training_assessment_categories cascade;

drop table if exists public.mcq_submissions cascade;
drop table if exists public.mcq_assessments cascade;
drop table if exists public.mcq_questions cascade;
drop table if exists public.mcq_categories cascade;

drop table if exists public.assessment_submission cascade;
drop table if exists public.assignment_batch cascade;
drop table if exists public.assessment_question cascade;
drop table if exists public.assessment cascade;

-- Re-run the canonical migration after cleanup if needed:
--   supabase/mcq_assessment_navigation_migration.sql
