create extension if not exists pgcrypto;

create or replace function public.normalize_training_assessment_answer(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(trim(coalesce(value, ''))), '\s+', ' ', 'g');
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.training_assessment_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  passing_score integer not null default 80 check (passing_score between 0 and 100),
  created_by text not null references public."user"(id) on delete cascade,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_training_assessment_categories_owner_title
  on public.training_assessment_categories (created_by, lower(title))
  where is_archived = false;

create table if not exists public.training_assessments (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.training_assessment_categories(id) on delete cascade,
  title text not null,
  description text,
  type text not null default 'multiple_choice'
    check (type in ('multiple_choice', 'fill_blank', 'mixed')),
  is_published boolean not null default true,
  instant_feedback boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_training_assessments_category_title
  on public.training_assessments (category_id, lower(title));

create table if not exists public.training_assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.training_assessments(id) on delete cascade,
  question_text text not null,
  question_type text not null check (question_type in ('multiple_choice', 'fill_blank')),
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  explanation text,
  order_index integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint training_assessment_questions_mcq_options check (
    (question_type = 'multiple_choice' and jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2)
    or question_type = 'fill_blank'
  )
);

create unique index if not exists idx_training_assessment_questions_order
  on public.training_assessment_questions (assessment_id, order_index, id);

create table if not exists public.training_assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.training_assessment_categories(id) on delete cascade,
  assessment_id uuid references public.training_assessments(id) on delete cascade,
  batch_id text references public.batch(id) on delete cascade,
  trainee_id text references public."user"(id) on delete cascade,
  assigned_by text not null references public."user"(id) on delete cascade,
  assigned_at timestamptz not null default timezone('utc', now()),
  due_at timestamptz,
  is_active boolean not null default true,
  constraint training_assessment_assignments_target check (
    num_nonnulls(batch_id, trainee_id) = 1
  )
);

create unique index if not exists idx_training_assessment_assignments_unique_active
  on public.training_assessment_assignments (
    category_id,
    coalesce(assessment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(batch_id, ''),
    coalesce(trainee_id, '')
  )
  where is_active = true;

create table if not exists public.training_assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.training_assessment_assignments(id) on delete set null,
  assessment_id uuid not null references public.training_assessments(id) on delete cascade,
  category_id uuid not null references public.training_assessment_categories(id) on delete cascade,
  trainee_id text not null references public."user"(id) on delete cascade,
  batch_id text references public.batch(id) on delete set null,
  attempt_no integer not null check (attempt_no > 0),
  answers jsonb not null default '{}'::jsonb,
  question_results jsonb not null default '[]'::jsonb,
  total_questions integer not null default 0 check (total_questions >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0),
  score numeric(5,2) not null default 0 check (score between 0 and 100),
  status text not null check (status in ('pass', 'fail')),
  feedback text,
  trainer_note text,
  coached_by text references public."user"(id) on delete set null,
  coached_at timestamptz,
  submitted_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_training_assessment_attempts_trainee
  on public.training_assessment_attempts (trainee_id, submitted_at desc);

create index if not exists idx_training_assessment_attempts_category
  on public.training_assessment_attempts (category_id, submitted_at desc);

create index if not exists idx_training_assessment_attempts_assessment
  on public.training_assessment_attempts (assessment_id, submitted_at desc);

create table if not exists public.training_assessment_coaching_notes (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.training_assessment_attempts(id) on delete cascade,
  trainer_id text not null references public."user"(id) on delete cascade,
  trainee_id text not null references public."user"(id) on delete cascade,
  note text not null,
  action_items text,
  visibility text not null default 'shared' check (visibility in ('shared', 'trainer_only')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_training_assessment_coaching_notes_attempt
  on public.training_assessment_coaching_notes (attempt_id, created_at desc);

create table if not exists public.training_assessment_certificates (
  id uuid primary key default gen_random_uuid(),
  trainee_id text not null references public."user"(id) on delete cascade,
  category_id uuid not null references public.training_assessment_categories(id) on delete cascade,
  assessment_id uuid not null references public.training_assessments(id) on delete cascade,
  attempt_id uuid not null references public.training_assessment_attempts(id) on delete cascade,
  certificate_code text not null unique,
  earned_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (trainee_id, category_id)
);

drop trigger if exists trg_training_assessment_categories_touch on public.training_assessment_categories;
create trigger trg_training_assessment_categories_touch
before update on public.training_assessment_categories
for each row execute function public.touch_updated_at();

drop trigger if exists trg_training_assessments_touch on public.training_assessments;
create trigger trg_training_assessments_touch
before update on public.training_assessments
for each row execute function public.touch_updated_at();

drop trigger if exists trg_training_assessment_questions_touch on public.training_assessment_questions;
create trigger trg_training_assessment_questions_touch
before update on public.training_assessment_questions
for each row execute function public.touch_updated_at();

drop trigger if exists trg_training_assessment_coaching_notes_touch on public.training_assessment_coaching_notes;
create trigger trg_training_assessment_coaching_notes_touch
before update on public.training_assessment_coaching_notes
for each row execute function public.touch_updated_at();

create or replace view public.training_assessment_attempt_feed as
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
  attempts.question_results,
  attempts.answers,
  categories.created_by as trainer_id,
  categories.title as category_title,
  categories.passing_score,
  assessments.title as assessment_title,
  assessments.type as assessment_type,
  trainee.full_name as trainee_name,
  trainee.email as trainee_email,
  batch.name as batch_name,
  cert.id as certificate_id,
  cert.certificate_code
from public.training_assessment_attempts as attempts
join public.training_assessment_categories as categories
  on categories.id = attempts.category_id
join public.training_assessments as assessments
  on assessments.id = attempts.assessment_id
join public."user" as trainee
  on trainee.id = attempts.trainee_id
left join public.batch as batch
  on batch.id = attempts.batch_id
left join public.training_assessment_certificates as cert
  on cert.attempt_id = attempts.id;

create or replace view public.training_assessment_category_report as
select
  categories.id as category_id,
  categories.created_by as trainer_id,
  categories.title as category_title,
  categories.passing_score,
  count(attempts.id) as attempt_count,
  count(*) filter (where attempts.status = 'pass') as pass_count,
  count(*) filter (where attempts.status = 'fail') as fail_count,
  coalesce(round(avg(attempts.score)::numeric, 2), 0) as average_score,
  coalesce(
    round(
      (
        count(*) filter (where attempts.status = 'pass')::numeric
        / nullif(count(attempts.id), 0)
      ) * 100,
      2
    ),
    0
  ) as pass_rate
from public.training_assessment_categories as categories
left join public.training_assessment_attempts as attempts
  on attempts.category_id = categories.id
group by categories.id, categories.created_by, categories.title, categories.passing_score;

create or replace view public.training_assessment_question_report as
select
  categories.created_by as trainer_id,
  questions.id as question_id,
  questions.assessment_id,
  assessments.category_id,
  questions.question_text,
  questions.question_type,
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
join public.training_assessments as assessments
  on assessments.id = attempts.assessment_id
join public.training_assessment_categories as categories
  on categories.id = attempts.category_id
cross join lateral jsonb_array_elements(attempts.question_results) as result
join public.training_assessment_questions as questions
  on questions.id = (result ->> 'question_id')::uuid
group by categories.created_by, questions.id, questions.assessment_id, assessments.category_id, questions.question_text, questions.question_type;

alter table public.training_assessment_categories enable row level security;
alter table public.training_assessments enable row level security;
alter table public.training_assessment_questions enable row level security;
alter table public.training_assessment_assignments enable row level security;
alter table public.training_assessment_attempts enable row level security;
alter table public.training_assessment_coaching_notes enable row level security;
alter table public.training_assessment_certificates enable row level security;

drop policy if exists training_assessment_categories_select on public.training_assessment_categories;
create policy training_assessment_categories_select
on public.training_assessment_categories
for select
using (
  auth.uid()::text = created_by
  or exists (
    select 1
    from public.training_assessment_assignments as assignments
    left join public.batch_user as batch_user
      on batch_user.batch_id = assignments.batch_id
    where assignments.category_id = training_assessment_categories.id
      and assignments.is_active = true
      and (
        assignments.trainee_id = auth.uid()::text
        or batch_user.user_id = auth.uid()::text
      )
  )
);

drop policy if exists training_assessment_categories_manage on public.training_assessment_categories;
create policy training_assessment_categories_manage
on public.training_assessment_categories
for all
using (auth.uid()::text = created_by)
with check (auth.uid()::text = created_by);

drop policy if exists training_assessments_select on public.training_assessments;
create policy training_assessments_select
on public.training_assessments
for select
using (
  exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessments.category_id
      and (
        categories.created_by = auth.uid()::text
        or exists (
          select 1
          from public.training_assessment_assignments as assignments
          left join public.batch_user as batch_user
            on batch_user.batch_id = assignments.batch_id
          where assignments.category_id = training_assessments.category_id
            and assignments.is_active = true
            and (
              assignments.trainee_id = auth.uid()::text
              or batch_user.user_id = auth.uid()::text
            )
        )
      )
  )
);

drop policy if exists training_assessments_manage on public.training_assessments;
create policy training_assessments_manage
on public.training_assessments
for all
using (
  exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessments.category_id
      and categories.created_by = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessments.category_id
      and categories.created_by = auth.uid()::text
  )
);

drop policy if exists training_assessment_questions_select on public.training_assessment_questions;
create policy training_assessment_questions_select
on public.training_assessment_questions
for select
using (
  exists (
    select 1
    from public.training_assessments as assessments
    join public.training_assessment_categories as categories
      on categories.id = assessments.category_id
    where assessments.id = training_assessment_questions.assessment_id
      and (
        categories.created_by = auth.uid()::text
        or exists (
          select 1
          from public.training_assessment_assignments as assignments
          left join public.batch_user as batch_user
            on batch_user.batch_id = assignments.batch_id
          where assignments.category_id = categories.id
            and assignments.is_active = true
            and (
              assignments.trainee_id = auth.uid()::text
              or batch_user.user_id = auth.uid()::text
            )
        )
      )
  )
);

drop policy if exists training_assessment_questions_manage on public.training_assessment_questions;
create policy training_assessment_questions_manage
on public.training_assessment_questions
for all
using (
  exists (
    select 1
    from public.training_assessments as assessments
    join public.training_assessment_categories as categories
      on categories.id = assessments.category_id
    where assessments.id = training_assessment_questions.assessment_id
      and categories.created_by = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.training_assessments as assessments
    join public.training_assessment_categories as categories
      on categories.id = assessments.category_id
    where assessments.id = training_assessment_questions.assessment_id
      and categories.created_by = auth.uid()::text
  )
);

drop policy if exists training_assessment_assignments_select on public.training_assessment_assignments;
create policy training_assessment_assignments_select
on public.training_assessment_assignments
for select
using (
  auth.uid()::text = assigned_by
  or trainee_id = auth.uid()::text
  or exists (
    select 1
    from public.batch_user as batch_user
    where batch_user.batch_id = training_assessment_assignments.batch_id
      and batch_user.user_id = auth.uid()::text
  )
);

drop policy if exists training_assessment_assignments_manage on public.training_assessment_assignments;
create policy training_assessment_assignments_manage
on public.training_assessment_assignments
for all
using (auth.uid()::text = assigned_by)
with check (auth.uid()::text = assigned_by);

drop policy if exists training_assessment_attempts_select on public.training_assessment_attempts;
create policy training_assessment_attempts_select
on public.training_assessment_attempts
for select
using (
  trainee_id = auth.uid()::text
  or exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessment_attempts.category_id
      and categories.created_by = auth.uid()::text
  )
);

drop policy if exists training_assessment_attempts_insert on public.training_assessment_attempts;
create policy training_assessment_attempts_insert
on public.training_assessment_attempts
for insert
with check (trainee_id = auth.uid()::text);

drop policy if exists training_assessment_attempts_update on public.training_assessment_attempts;
create policy training_assessment_attempts_update
on public.training_assessment_attempts
for update
using (
  exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessment_attempts.category_id
      and categories.created_by = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessment_attempts.category_id
      and categories.created_by = auth.uid()::text
  )
);

drop policy if exists training_assessment_coaching_notes_select on public.training_assessment_coaching_notes;
create policy training_assessment_coaching_notes_select
on public.training_assessment_coaching_notes
for select
using (
  trainer_id = auth.uid()::text
  or (trainee_id = auth.uid()::text and visibility = 'shared')
);

drop policy if exists training_assessment_coaching_notes_manage on public.training_assessment_coaching_notes;
create policy training_assessment_coaching_notes_manage
on public.training_assessment_coaching_notes
for all
using (trainer_id = auth.uid()::text)
with check (trainer_id = auth.uid()::text);

drop policy if exists training_assessment_certificates_select on public.training_assessment_certificates;
create policy training_assessment_certificates_select
on public.training_assessment_certificates
for select
using (
  trainee_id = auth.uid()::text
  or exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessment_certificates.category_id
      and categories.created_by = auth.uid()::text
  )
);

drop policy if exists training_assessment_certificates_insert on public.training_assessment_certificates;
create policy training_assessment_certificates_insert
on public.training_assessment_certificates
for insert
with check (
  exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessment_certificates.category_id
      and categories.created_by = auth.uid()::text
  )
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.training_assessment_attempts;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.training_assessment_assignments;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.training_assessment_coaching_notes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.training_assessment_certificates;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;
