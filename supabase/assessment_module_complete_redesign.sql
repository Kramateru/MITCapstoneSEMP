-- ========================================================================
-- COMPREHENSIVE ASSESSMENT MODULE REDESIGN
-- Complete schema with all necessary tables, fields, functions, and RLS
-- ========================================================================

-- Extension support
create extension if not exists pgcrypto;

-- ========================================================================
-- UTILITY FUNCTIONS
-- ========================================================================

-- UUID/Text generation
create or replace function public.gen_text_uuid()
returns text
language sql
as $$
  select (gen_random_uuid())::text;
$$;

-- Timestamp trigger for updated_at
create or replace function public.update_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ========================================================================
-- ASSESSMENT CATEGORIES TABLE
-- ========================================================================

create table if not exists public.assessment_categories (
  id uuid primary key default gen_random_uuid(),
  trainer_id text not null references public."user"(id) on delete cascade,
  category_name varchar(255) not null,
  description text,
  passing_score integer not null default 90 check (passing_score between 0 and 100),
  status varchar(20) not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (trainer_id, category_name)
);

create index if not exists idx_assessment_categories_trainer on public.assessment_categories (
    trainer_id,
    status,
    created_at desc
);

create trigger trg_assessment_categories_updated_at
before update on public.assessment_categories
for each row execute function public.update_timestamp();

-- ========================================================================
-- ASSESSMENT QUESTIONS TABLE
-- ========================================================================

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.assessment_categories(id) on delete cascade,
  question_number integer not null,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_answer varchar(1) not null check (correct_answer in ('A', 'B', 'C', 'D')),
  explanation text,
  created_by text not null references public."user"(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (category_id, question_number)
);

create index if not exists idx_assessment_questions_category on public.assessment_questions (
    category_id,
    question_number asc
);

create index if not exists idx_assessment_questions_created_by on public.assessment_questions (created_by, created_at desc);

create trigger trg_assessment_questions_updated_at
before update on public.assessment_questions
for each row execute function public.update_timestamp();

-- ========================================================================
-- ASSESSMENT ASSIGNMENTS TABLE
-- ========================================================================

create table if not exists public.assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  trainer_id text not null references public."user"(id) on delete cascade,
  category_id uuid not null references public.assessment_categories(id) on delete cascade,
  assignment_title varchar(255) not null,
  assignment_description text,
  passing_score integer not null default 90 check (passing_score between 0 and 100),
  target_scope varchar(20) not null check (target_scope in ('batch', 'wave', 'trainee')),
  batch_id text references public.batch(id) on delete cascade,
  wave_number integer,
  trainee_id text references public."user"(id) on delete cascade,
  maximum_attempts integer check (maximum_attempts is null or maximum_attempts > 0),
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes > 0),
  shuffle_choices boolean not null default true,
  shuffle_questions boolean not null default false,
  due_date timestamptz,
  status varchar(20) not null default 'active' check (status in ('active', 'archived')),
  assigned_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_assignment_target on public.assessment_assignments (
    target_scope,
    batch_id,
    wave_number,
    trainee_id
);

create index if not exists idx_assignment_trainer_category on public.assessment_assignments (
    trainer_id,
    category_id,
    status
);

create trigger trg_assessment_assignments_updated_at
before update on public.assessment_assignments
for each row execute function public.update_timestamp();

-- ========================================================================
-- ASSIGNMENT QUESTIONS MAPPING
-- ========================================================================

create table if not exists public.assignment_question_selections (
    id uuid primary key default gen_random_uuid (),
    assignment_id uuid not null references public.assessment_assignments (id) on delete cascade,
    question_id uuid not null references public.assessment_questions (id) on delete cascade,
    question_order integer not null default 0,
    created_at timestamptz not null default timezone ('utc', now()),
    unique (assignment_id, question_id)
);

create index if not exists idx_assignment_questions_by_assignment on public.assignment_question_selections (
    assignment_id,
    question_order asc
);

-- ========================================================================
-- ASSESSMENT ATTEMPTS TABLE (submissions)
-- ========================================================================

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.assessment_assignments(id) on delete set null,
  category_id uuid not null references public.assessment_categories(id) on delete cascade,
  trainee_id text not null references public."user"(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),

-- Attempt metadata
started_at timestamptz not null default timezone ('utc', now()),
submitted_at timestamptz,
time_spent_seconds integer not null default 0 check (time_spent_seconds >= 0),

-- Scoring
total_questions integer not null default 0 check (total_questions >= 0),
correct_answers integer not null default 0 check (correct_answers >= 0),
incorrect_answers integer not null default 0 check (incorrect_answers >= 0),
score_percentage numeric(5, 2) not null default 0 check (
    score_percentage between 0 and 100
),
passing_score integer not null default 90 check (
    passing_score between 0 and 100
),

-- Status
status varchar(20) not null check (
    status in (
        'in_progress',
        'submitted',
        'graded'
    )
),
pass_fail varchar(10) check (pass_fail in ('pass', 'fail')),

-- Question snapshots and answers
question_snapshot jsonb not null default '[]'::jsonb,
  choice_snapshot jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,

-- Analysis
analysis_summary jsonb not null default '{}'::jsonb,
  category_breakdown jsonb not null default '[]'::jsonb,

-- Certificate
certificate_status varchar(20) not null default 'not_issued' check (certificate_status in ('not_issued', 'issued')),
  
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_attempts_trainee on public.assessment_attempts (
    trainee_id,
    category_id,
    submitted_at desc
);

create index if not exists idx_attempts_assignment on public.assessment_attempts (
    assignment_id,
    submitted_at desc
);

create index if not exists idx_attempts_category on public.assessment_attempts (
    category_id,
    submitted_at desc
);

create trigger trg_assessment_attempts_updated_at
before update on public.assessment_attempts
for each row execute function public.update_timestamp();

-- ========================================================================
-- ASSESSMENT CERTIFICATES TABLE
-- ========================================================================


create table if not exists public.assessment_certificates (
  id uuid primary key default gen_random_uuid(),
  trainee_id text not null references public."user"(id) on delete cascade,
  category_id uuid not null references public.assessment_categories(id) on delete cascade,
  assignment_id uuid references public.assessment_assignments(id) on delete set null,
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  
  certificate_code text not null unique default gen_text_uuid(),
  certificate_status varchar(20) not null default 'issued' check (certificate_status in ('issued', 'revoked')),
  certificate_url text,
  
  earned_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  
  unique (trainee_id, category_id)
);

create index if not exists idx_certificates_trainee on public.assessment_certificates (trainee_id, earned_at desc);

create index if not exists idx_certificates_category on public.assessment_certificates (category_id, earned_at desc);

create trigger trg_assessment_certificates_updated_at
before update on public.assessment_certificates
for each row execute function public.update_timestamp();

-- ========================================================================
-- BULK UPLOAD TRACKING TABLE
-- ========================================================================


create table if not exists public.assessment_bulk_uploads (
  id uuid primary key default gen_random_uuid(),
  trainer_id text not null references public."user"(id) on delete cascade,
  category_id uuid not null references public.assessment_categories(id) on delete cascade,
  
  filename text not null,
  total_rows integer not null default 0,
  successful_count integer not null default 0,
  failed_count integer not null default 0,
  
  upload_status varchar(20) not null default 'processing' check (upload_status in ('processing', 'completed', 'failed')),
  error_details jsonb not null default '{}'::jsonb,
  
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists idx_bulk_uploads_trainer_category on public.assessment_bulk_uploads (
    trainer_id,
    category_id,
    created_at desc
);

-- ========================================================================
-- ROW-LEVEL SECURITY (RLS)
-- ========================================================================

alter table public.assessment_categories enable row level security;

alter table public.assessment_questions enable row level security;

alter table public.assessment_assignments enable row level security;

alter table public.assignment_question_selections enable row level security;

alter table public.assessment_attempts enable row level security;

alter table public.assessment_certificates enable row level security;

alter table public.assessment_bulk_uploads enable row level security;

-- ASSESSMENT CATEGORIES RLS

drop policy if exists assessment_categories_trainer_select on public.assessment_categories;

create policy assessment_categories_trainer_select on public.assessment_categories
for select
using (
  auth.uid()::text = trainer_id
  or exists (
    select 1 from public.assessment_assignments
    where assignment_id = assessment_categories.id
      and (batch_id in (select batch_id from public.batch_user where user_id = auth.uid()::text)
        or trainee_id = auth.uid()::text
        or trainer_id = auth.uid()::text)
  )
);

drop policy if exists assessment_categories_trainer_manage on public.assessment_categories;

create policy assessment_categories_trainer_manage on public.assessment_categories
for all
using (auth.uid()::text = trainer_id)
with check (auth.uid()::text = trainer_id);

-- ASSESSMENT QUESTIONS RLS

drop policy if exists assessment_questions_view on public.assessment_questions;

create policy assessment_questions_view on public.assessment_questions
for select
using (
  auth.uid()::text = created_by
  or auth.uid()::text = (select trainer_id from public.assessment_categories where id = category_id)
  or exists (
    select 1 from public.assessment_assignments
    where category_id = assessment_questions.category_id
      and (batch_id in (select batch_id from public.batch_user where user_id = auth.uid()::text)
        or trainee_id = auth.uid()::text
        or trainer_id = auth.uid()::text)
  )
);

drop policy if exists assessment_questions_manage on public.assessment_questions;

create policy assessment_questions_manage on public.assessment_questions
for all
using (
  auth.uid()::text = created_by
  or auth.uid()::text = (select trainer_id from public.assessment_categories where id = category_id)
)
with check (
  auth.uid()::text = created_by
  or auth.uid()::text = (select trainer_id from public.assessment_categories where id = category_id)
);

-- ASSIGNMENT RLS

drop policy if exists assignment_view on public.assessment_assignments;

create policy assignment_view on public.assessment_assignments
for select
using (
  auth.uid()::text = trainer_id
  or auth.uid()::text = trainee_id
  or (batch_id is not null and exists (
    select 1 from public.batch_user where batch_id = assessment_assignments.batch_id and user_id = auth.uid()::text
  ))
  or (wave_number is not null and exists (
    select 1 from public.batch
    where wave_number = assessment_assignments.wave_number
      and id in (select batch_id from public.batch_user where user_id = auth.uid()::text)
  ))
);

drop policy if exists assignment_manage on public.assessment_assignments;

create policy assignment_manage on public.assessment_assignments
for all
using (auth.uid()::text = trainer_id)
with check (auth.uid()::text = trainer_id);

-- ATTEMPTS RLS

drop policy if exists attempts_trainee_view on public.assessment_attempts;

create policy attempts_trainee_view on public.assessment_attempts
for select
using (
  auth.uid()::text = trainee_id
  or auth.uid()::text = (select trainer_id from public.assessment_categories where id = category_id)
);

drop policy if exists attempts_trainee_insert on public.assessment_attempts;

create policy attempts_trainee_insert on public.assessment_attempts
for insert
with check (auth.uid()::text = trainee_id);

drop policy if exists attempts_trainee_update on public.assessment_attempts;

create policy attempts_trainee_update on public.assessment_attempts
for update
using (auth.uid()::text = trainee_id)
with check (auth.uid()::text = trainee_id);

-- CERTIFICATES RLS

drop policy if exists certificates_trainee_view on public.assessment_certificates;

create policy certificates_trainee_view on public.assessment_certificates
for select
using (
  auth.uid()::text = trainee_id
  or auth.uid()::text = (select trainer_id from public.assessment_categories where id = category_id)
);

-- BULK UPLOADS RLS

drop policy if exists bulk_uploads_trainer on public.assessment_bulk_uploads;

create policy bulk_uploads_trainer on public.assessment_bulk_uploads
for all
using (auth.uid()::text = trainer_id)
with check (auth.uid()::text = trainer_id);

-- ========================================================================
-- VIEWS FOR ANALYTICS AND REPORTING
-- ========================================================================

drop view if exists public.assessment_progress_summary;

create view public.assessment_progress_summary as
select
    categories.id as category_id,
    categories.category_name,
    categories.trainer_id,
    assignments.id as assignment_id,
    assignments.assignment_title,
    assignments.target_scope,
    count(distinct attempts.trainee_id) as total_trainees,
    count(
        distinct case
            when attempts.pass_fail = 'pass' then attempts.trainee_id
        end
    ) as passed_trainees,
    count(
        distinct case
            when attempts.pass_fail = 'fail' then attempts.trainee_id
        end
    ) as failed_trainees,
    avg(attempts.score_percentage) as avg_score,
    max(attempts.score_percentage) as max_score,
    min(attempts.score_percentage) as min_score,
    count(
        distinct attempts.attempt_number
    ) as total_attempts
from
    public.assessment_categories as categories
    left join public.assessment_assignments as assignments on assignments.category_id = categories.id
    left join public.assessment_attempts as attempts on attempts.assignment_id = assignments.id
group by
    categories.id,
    categories.category_name,
    categories.trainer_id,
    assignments.id,
    assignments.assignment_title,
    assignments.target_scope;

drop view if exists public.assessment_trainee_progress;

create view public.assessment_trainee_progress as
select
    attempts.trainee_id,
    categories.category_name,
    categories.id as category_id,
    max(attempts.attempt_number) as attempt_count,
    max(
        case
            when attempts.pass_fail = 'pass' then 1
            else 0
        end
    ) as has_passed,
    max(attempts.score_percentage) as best_score,
    max(attempts.submitted_at) as last_attempt_date,
    max(
        case
            when exists (
                select 1
                from public.assessment_certificates
                where
                    attempt_id = attempts.id
            ) then 1
            else 0
        end
    ) as has_certificate
from public.assessment_attempts as attempts
    join public.assessment_categories as categories on categories.id = attempts.category_id
group by
    attempts.trainee_id,
    categories.category_name,
    categories.id;

-- ========================================================================
-- END OF SCHEMA
-- ========================================================================