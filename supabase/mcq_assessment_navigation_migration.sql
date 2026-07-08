-- Active trainer assessment navigation schema for the SQLAlchemy-backed backend.
-- Run this in Supabase SQL Editor for the live MCQ workflow used by:
--   /api/certification/mcq/*
--   /trainer/assessments
--   /trainee/assessment
--
-- This migration keeps the active singular table names used by the backend:
--   mcq_category
--   mcq_question
--   mcq_assessment
--   mcq_submission
--
-- Legacy plural tables such as mcq_categories / mcq_questions / mcq_assessments /
-- mcq_submissions are not touched here because they do not block the active backend.

create extension if not exists pgcrypto;

create table if not exists public.mcq_category (
  id text primary key default gen_random_uuid()::text,
  name varchar(150) not null,
  description text,
  difficulty varchar(20) not null default 'basic',
  lob varchar(100),
  passing_threshold double precision not null default 90,
  is_global boolean not null default false,
  is_active boolean not null default true,
  selected_question_ids jsonb not null default '[]'::jsonb,
  created_by text not null references public."user"(id),
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.mcq_question (
  id text primary key default gen_random_uuid()::text,
  category_id text not null references public.mcq_category(id) on delete cascade,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option varchar(1) not null,
  explanation text,
  media_url varchar(500),
  kip_weight double precision not null default 1.0,
  is_active boolean not null default true,
  created_by text not null references public."user"(id),
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.mcq_assessment (
  id text primary key default gen_random_uuid()::text,
  title varchar(255) not null,
  description text,
  category_id text not null references public.mcq_category(id),
  question_ids jsonb not null default '[]'::jsonb,
  question_snapshot jsonb not null default '[]'::jsonb,
  assigned_by text not null references public."user"(id),
  assigned_user_id text references public."user"(id),
  assigned_batch_id text references public.batch(id),
  due_date timestamp,
  time_limit_minutes integer not null default 30,
  is_active boolean not null default true,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.mcq_submission (
  id text primary key default gen_random_uuid()::text,
  assessment_id text not null references public.mcq_assessment(id) on delete cascade,
  trainee_id text not null references public."user"(id),
  answers jsonb not null default '{}'::jsonb,
  review jsonb not null default '[]'::jsonb,
  score_percentage double precision not null default 0,
  is_passed boolean not null default false,
  attempt_count integer not null default 1,
  submitted_at timestamp default current_timestamp,
  constraint uq_mcq_assessment_trainee unique (assessment_id, trainee_id)
);

create index if not exists idx_mcq_category_created_by
  on public.mcq_category(created_by, is_active, created_at desc);

create index if not exists idx_mcq_question_category
  on public.mcq_question(category_id, is_active, created_at desc);

create index if not exists idx_mcq_assessment_category
  on public.mcq_assessment(category_id, is_active, created_at desc);

create index if not exists idx_mcq_assessment_batch
  on public.mcq_assessment(assigned_batch_id, is_active);

create index if not exists idx_mcq_assessment_user
  on public.mcq_assessment(assigned_user_id, is_active);

create index if not exists idx_mcq_submission_trainee
  on public.mcq_submission(trainee_id, submitted_at desc);

alter table if exists public.mcq_category
  add column if not exists selected_question_ids jsonb not null default '[]'::jsonb;

alter table if exists public.mcq_assessment
  add column if not exists time_limit_minutes integer not null default 30;

alter table if exists public.mcq_assessment
  add column if not exists question_snapshot jsonb not null default '[]'::jsonb;

alter table if exists public.mcq_submission
  add column if not exists review jsonb not null default '[]'::jsonb;

alter table if exists public.mcq_submission
  add column if not exists attempt_count integer not null default 1;

update public.mcq_category
set
  selected_question_ids = coalesce(selected_question_ids, '[]'::jsonb),
  passing_threshold = greatest(coalesce(passing_threshold, 90), 90);

update public.mcq_assessment
set
  time_limit_minutes = coalesce(time_limit_minutes, 30),
  question_snapshot = coalesce(question_snapshot, '[]'::jsonb);

update public.mcq_submission
set
  review = coalesce(review, '[]'::jsonb),
  attempt_count = greatest(coalesce(attempt_count, 1), 1);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'certification_settings'
      and column_name = 'mcq_passing_threshold'
  ) then
    execute $sql$
      update public.certification_settings
      set mcq_passing_threshold = greatest(coalesce(mcq_passing_threshold, 90), 90)
    $sql$;
  end if;
end
$$;

update public.mcq_submission as submissions
set is_passed = case
  when coalesce(submissions.score_percentage, 0) >= coalesce((
    select greatest(coalesce(categories.passing_threshold, 90), 90)
    from public.mcq_assessment as assessments
    join public.mcq_category as categories
      on categories.id = assessments.category_id
    where assessments.id = submissions.assessment_id
  ), 90)
  then true
  else false
end;
