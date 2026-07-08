create extension if not exists pgcrypto;

alter table public.training_assessment_categories
  add column if not exists active_status boolean not null default true;

update public.training_assessment_categories
set active_status = not coalesce(is_archived, false)
where active_status is distinct from not coalesce(is_archived, false);

alter table public.training_assessments
  add column if not exists is_primary boolean not null default false,
  add column if not exists active_status boolean not null default true;

insert into public.training_assessments (
  category_id,
  title,
  description,
  type,
  is_published,
  instant_feedback,
  sort_order,
  is_primary,
  active_status
)
select
  categories.id,
  categories.title,
  categories.description,
  'multiple_choice',
  true,
  false,
  0,
  true,
  true
from public.training_assessment_categories as categories
where not exists (
  select 1
  from public.training_assessments as assessments
  where assessments.category_id = categories.id
    and assessments.is_primary = true
);

with first_assessments as (
  select distinct on (category_id)
    id,
    category_id
  from public.training_assessments
  order by category_id, sort_order asc, created_at asc, id asc
)
update public.training_assessments as assessments
set is_primary = true
from first_assessments
where assessments.id = first_assessments.id
  and not exists (
    select 1
    from public.training_assessments as existing
    where existing.category_id = first_assessments.category_id
      and existing.is_primary = true
  );

alter table public.training_assessment_questions
  add column if not exists category_id uuid references public.training_assessment_categories(id) on delete cascade,
  add column if not exists question_number integer,
  add column if not exists difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  add column if not exists active_status boolean not null default true,
  add column if not exists created_by text references public."user"(id) on delete set null;

update public.training_assessment_questions as questions
set
  category_id = assessments.category_id,
  created_by = categories.created_by
from public.training_assessments as assessments
join public.training_assessment_categories as categories
  on categories.id = assessments.category_id
where assessments.id = questions.assessment_id
  and (questions.category_id is null or questions.created_by is null);

with numbered_questions as (
  select
    questions.id,
    row_number() over (
      partition by questions.category_id
      order by questions.order_index asc, questions.created_at asc, questions.id asc
    ) as next_number
  from public.training_assessment_questions as questions
  where questions.category_id is not null
)
update public.training_assessment_questions as questions
set question_number = numbered_questions.next_number
from numbered_questions
where numbered_questions.id = questions.id
  and (
    questions.question_number is null
    or questions.question_number <> numbered_questions.next_number
  );

alter table public.training_assessment_questions
  alter column category_id set not null,
  alter column question_number set not null;

create unique index if not exists idx_training_assessment_questions_category_number
  on public.training_assessment_questions (category_id, question_number);

create index if not exists idx_training_assessment_questions_category_active
  on public.training_assessment_questions (category_id, active_status, created_at desc);

alter table public.training_assessment_assignments
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists assignment_mode text not null default 'entire_category'
    check (assignment_mode in ('selected_questions', 'entire_category', 'random_subset')),
  add column if not exists question_count integer,
  add column if not exists passing_score integer not null default 90
    check (passing_score between 0 and 100),
  add column if not exists maximum_attempts integer check (maximum_attempts is null or maximum_attempts > 0),
  add column if not exists time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes > 0),
  add column if not exists shuffle_choices boolean not null default true,
  add column if not exists shuffle_questions boolean not null default false,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.training_assessment_assignments as assignments
set
  title = coalesce(assignments.title, categories.title || ' Assessment'),
  passing_score = coalesce(assignments.passing_score, categories.passing_score, 90)
from public.training_assessment_categories as categories
where categories.id = assignments.category_id;

create table if not exists public.training_assessment_assignment_questions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.training_assessment_assignments(id) on delete cascade,
  question_id uuid not null references public.training_assessment_questions(id) on delete cascade,
  question_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (assignment_id, question_id)
);

create index if not exists idx_training_assessment_assignment_questions_assignment
  on public.training_assessment_assignment_questions (assignment_id, question_order asc, created_at asc);

alter table public.training_assessment_attempts
  add column if not exists question_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists choice_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists analysis_summary jsonb not null default '{}'::jsonb,
  add column if not exists category_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists time_spent_seconds integer not null default 0 check (time_spent_seconds >= 0),
  add column if not exists incorrect_answers integer not null default 0 check (incorrect_answers >= 0),
  add column if not exists passing_score integer check (passing_score between 0 and 100),
  add column if not exists assignment_title text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists certificate_status text not null default 'not_issued'
    check (certificate_status in ('not_issued', 'issued'));

update public.training_assessment_attempts as attempts
set
  incorrect_answers = greatest(coalesce(attempts.total_questions, 0) - coalesce(attempts.correct_answers, 0), 0),
  passing_score = coalesce(
    attempts.passing_score,
    (
      select assignment.passing_score
      from public.training_assessment_assignments as assignment
      where assignment.id = attempts.assignment_id
    ),
    categories.passing_score,
    90
  ),
  assignment_title = coalesce(
    attempts.assignment_title,
    (
      select assignment.title
      from public.training_assessment_assignments as assignment
      where assignment.id = attempts.assignment_id
    ),
    categories.title || ' Assessment'
  ),
  started_at = coalesce(attempts.started_at, attempts.created_at, attempts.submitted_at),
  completed_at = coalesce(attempts.completed_at, attempts.submitted_at),
  certificate_status = case
    when exists (
      select 1
      from public.training_assessment_certificates as cert
      where cert.attempt_id = attempts.id
    ) then 'issued'
    else coalesce(attempts.certificate_status, 'not_issued')
  end
from public.training_assessment_categories as categories
where categories.id = attempts.category_id;

alter table public.training_assessment_certificates
  add column if not exists assignment_id uuid references public.training_assessment_assignments(id) on delete set null,
  add column if not exists assignment_title text,
  add column if not exists certificate_status text not null default 'issued'
    check (certificate_status in ('issued', 'revoked')),
  add column if not exists certificate_url text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.training_assessment_certificates as certs
set
  assignment_id = coalesce(certs.assignment_id, attempts.assignment_id),
  assignment_title = coalesce(certs.assignment_title, attempts.assignment_title),
  certificate_status = coalesce(certs.certificate_status, 'issued')
from public.training_assessment_attempts as attempts
where attempts.id = certs.attempt_id;

drop trigger if exists trg_training_assessment_assignments_touch on public.training_assessment_assignments;
create trigger trg_training_assessment_assignments_touch
before update on public.training_assessment_assignments
for each row execute function public.touch_updated_at();

drop trigger if exists trg_training_assessment_certificates_touch on public.training_assessment_certificates;
create trigger trg_training_assessment_certificates_touch
before update on public.training_assessment_certificates
for each row execute function public.touch_updated_at();

drop view if exists public.training_assessment_attempt_feed;
create view public.training_assessment_attempt_feed as
select
  attempts.id,
  attempts.assignment_id,
  attempts.assessment_id,
  attempts.category_id,
  attempts.trainee_id,
  attempts.batch_id,
  attempts.attempt_no,
  attempts.score,
  attempts.status,
  attempts.feedback,
  attempts.trainer_note,
  attempts.submitted_at,
  attempts.started_at,
  attempts.completed_at,
  attempts.time_spent_seconds,
  attempts.total_questions,
  attempts.correct_answers,
  attempts.incorrect_answers,
  attempts.question_results,
  attempts.question_snapshot,
  attempts.choice_snapshot,
  attempts.analysis_summary,
  attempts.category_breakdown,
  attempts.assignment_title,
  categories.created_by as trainer_id,
  categories.title as category_title,
  coalesce(attempts.passing_score, assignments.passing_score, categories.passing_score) as passing_score,
  coalesce(assignments.title, attempts.assignment_title, assessments.title, categories.title || ' Assessment') as assessment_title,
  trainee.full_name as trainee_name,
  trainee.email as trainee_email,
  batch.name as batch_name,
  batch.wave_number,
  cert.id as certificate_id,
  cert.certificate_code,
  coalesce(cert.certificate_status, attempts.certificate_status) as certificate_status,
  cert.certificate_url
from public.training_assessment_attempts as attempts
join public.training_assessment_categories as categories
  on categories.id = attempts.category_id
join public.training_assessments as assessments
  on assessments.id = attempts.assessment_id
join public."user" as trainee
  on trainee.id = attempts.trainee_id
left join public.training_assessment_assignments as assignments
  on assignments.id = attempts.assignment_id
left join public.batch as batch
  on batch.id = attempts.batch_id
left join public.training_assessment_certificates as cert
  on cert.attempt_id = attempts.id;

drop view if exists public.training_assessment_category_report;
create view public.training_assessment_category_report as
with assigned_targets as (
  select
    assignments.category_id,
    coalesce(assignments.trainee_id, batch_user.user_id) as trainee_id
  from public.training_assessment_assignments as assignments
  left join public.batch_user as batch_user
    on batch_user.batch_id = assignments.batch_id
  where assignments.is_active = true
)
select
  categories.id as category_id,
  categories.created_by as trainer_id,
  categories.title as category_title,
  categories.passing_score,
  count(attempts.id) as attempt_count,
  count(*) filter (where attempts.status = 'pass') as pass_count,
  count(*) filter (where attempts.status = 'fail') as fail_count,
  count(*) filter (where attempts.attempt_no > 1) as retake_count,
  coalesce(round(avg(attempts.score)::numeric, 2), 0) as average_score,
  coalesce(round(max(attempts.score)::numeric, 2), 0) as highest_score,
  coalesce(round(min(attempts.score)::numeric, 2), 0) as lowest_score,
  count(distinct assignments.id) filter (where assignments.is_active = true) as assignment_count,
  count(distinct assigned_targets.trainee_id) as assigned_trainee_count,
  count(distinct attempts.trainee_id) as completed_trainee_count,
  coalesce(
    round(
      (
        count(*) filter (where attempts.status = 'pass')::numeric
        / nullif(count(attempts.id), 0)
      ) * 100,
      2
    ),
    0
  ) as pass_rate,
  coalesce(
    round(
      (
        count(distinct attempts.trainee_id)::numeric
        / nullif(count(distinct assigned_targets.trainee_id), 0)
      ) * 100,
      2
    ),
    0
  ) as completion_rate
from public.training_assessment_categories as categories
left join public.training_assessment_assignments as assignments
  on assignments.category_id = categories.id
left join assigned_targets
  on assigned_targets.category_id = categories.id
left join public.training_assessment_attempts as attempts
  on attempts.category_id = categories.id
group by categories.id, categories.created_by, categories.title, categories.passing_score;

create or replace view public.training_assessment_batch_report as
with batch_targets as (
  select
    assignments.id as assignment_id,
    assignments.category_id,
    assignments.batch_id,
    batch_user.user_id as trainee_id
  from public.training_assessment_assignments as assignments
  join public.batch_user as batch_user
    on batch_user.batch_id = assignments.batch_id
  where assignments.batch_id is not null
)
select
  batch.id as batch_id,
  batch.name as batch_name,
  batch.wave_number,
  categories.id as category_id,
  categories.title as category_title,
  count(distinct batch_targets.assignment_id) as assignment_count,
  count(distinct batch_targets.trainee_id) as assigned_trainee_count,
  count(attempts.id) as attempt_count,
  count(distinct attempts.trainee_id) as completed_trainee_count,
  coalesce(round(avg(attempts.score)::numeric, 2), 0) as average_score,
  coalesce(round(max(attempts.score)::numeric, 2), 0) as highest_score,
  coalesce(round(min(attempts.score)::numeric, 2), 0) as lowest_score,
  coalesce(
    round(
      (
        count(*) filter (where attempts.status = 'pass')::numeric
        / nullif(count(attempts.id), 0)
      ) * 100,
      2
    ),
    0
  ) as pass_rate,
  coalesce(
    round(
      (
        count(distinct attempts.trainee_id)::numeric
        / nullif(count(distinct batch_targets.trainee_id), 0)
      ) * 100,
      2
    ),
    0
  ) as completion_rate
from public.batch
join batch_targets
  on batch_targets.batch_id = batch.id
join public.training_assessment_categories as categories
  on categories.id = batch_targets.category_id
left join public.training_assessment_attempts as attempts
  on attempts.batch_id = batch.id
 and attempts.category_id = categories.id
group by batch.id, batch.name, batch.wave_number, categories.id, categories.title;

drop view if exists public.training_assessment_question_report;
create view public.training_assessment_question_report as
select
  categories.created_by as trainer_id,
  questions.id as question_id,
  questions.category_id,
  categories.title as category_title,
  questions.question_text,
  questions.question_number,
  questions.difficulty,
  count(*) as answer_count,
  count(*) filter (where (result ->> 'is_correct')::boolean is true) as correct_count,
  count(*) filter (where (result ->> 'is_correct')::boolean is false) as incorrect_count,
  coalesce(
    round(
      (
        count(*) filter (where (result ->> 'is_correct')::boolean is false)::numeric
        / nullif(count(*), 0)
      ) * 100,
      2
    ),
    0
  ) as miss_rate
from public.training_assessment_attempts as attempts
join public.training_assessment_categories as categories
  on categories.id = attempts.category_id
cross join lateral jsonb_array_elements(attempts.question_results) as result
join public.training_assessment_questions as questions
  on questions.id = (result ->> 'question_id')::uuid
group by
  categories.created_by,
  questions.id,
  questions.category_id,
  categories.title,
  questions.question_text,
  questions.question_number,
  questions.difficulty;

alter table public.training_assessment_assignment_questions enable row level security;

drop policy if exists training_assessment_assignment_questions_select on public.training_assessment_assignment_questions;
create policy training_assessment_assignment_questions_select
on public.training_assessment_assignment_questions
for select
using (
  exists (
    select 1
    from public.training_assessment_assignments as assignments
    join public.training_assessment_categories as categories
      on categories.id = assignments.category_id
    left join public.batch_user as batch_user
      on batch_user.batch_id = assignments.batch_id
    where assignments.id = training_assessment_assignment_questions.assignment_id
      and (
        categories.created_by = auth.uid()::text
        or assignments.trainee_id = auth.uid()::text
        or batch_user.user_id = auth.uid()::text
      )
  )
);

drop policy if exists training_assessment_assignment_questions_manage on public.training_assessment_assignment_questions;
create policy training_assessment_assignment_questions_manage
on public.training_assessment_assignment_questions
for all
using (
  exists (
    select 1
    from public.training_assessment_assignments as assignments
    join public.training_assessment_categories as categories
      on categories.id = assignments.category_id
    where assignments.id = training_assessment_assignment_questions.assignment_id
      and categories.created_by = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.training_assessment_assignments as assignments
    join public.training_assessment_categories as categories
      on categories.id = assignments.category_id
    where assignments.id = training_assessment_assignment_questions.assignment_id
      and categories.created_by = auth.uid()::text
  )
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.training_assessment_assignment_questions;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;
