-- Timed flashcard result storage for the Microlearning Module.
-- Captures each enforced 30-second study window and 60-second answer window
-- so trainee progress, trainer monitoring, analytics, and reports can query
-- per-card outcomes directly from Supabase.

create extension if not exists pgcrypto;

create table if not exists public.microlearning_flashcard_result (
  id text primary key default gen_random_uuid()::text,
  assignment_id text not null references public.microlearning_assignment(id) on delete cascade,
  module_id text not null references public.microlearning_module(id) on delete cascade,
  trainee_id text not null references public."user"(id) on delete cascade,
  flashcard_id text not null,
  flashcard_order integer not null default 1,
  attempt_number integer not null default 1,
  prompt text,
  front_text text,
  back_text text,
  answer_text text,
  selected_choice text,
  revealed_side text,
  study_time_seconds integer not null default 30,
  answer_time_seconds integer not null default 60,
  status text not null default 'unanswered',
  score double precision not null default 0,
  points_earned double precision not null default 0,
  points_possible double precision not null default 0,
  started_study_at timestamptz,
  answer_started_at timestamptz,
  answer_deadline_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_microlearning_flashcard_result_attempt unique (assignment_id, flashcard_id, attempt_number)
);

create index if not exists idx_microlearning_flashcard_result_assignment_id
  on public.microlearning_flashcard_result (assignment_id);

create index if not exists idx_microlearning_flashcard_result_module_id
  on public.microlearning_flashcard_result (module_id);

create index if not exists idx_microlearning_flashcard_result_trainee_id
  on public.microlearning_flashcard_result (trainee_id);

create index if not exists idx_microlearning_flashcard_result_assignment_order
  on public.microlearning_flashcard_result (assignment_id, flashcard_order);

create index if not exists idx_microlearning_flashcard_result_status
  on public.microlearning_flashcard_result (status);

create index if not exists idx_microlearning_flashcard_result_answered_at
  on public.microlearning_flashcard_result (answered_at desc);

create or replace function public.set_microlearning_flashcard_result_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_microlearning_flashcard_result_updated_at on public.microlearning_flashcard_result;
create trigger trg_microlearning_flashcard_result_updated_at
before update on public.microlearning_flashcard_result
for each row
execute function public.set_microlearning_flashcard_result_updated_at();

alter table public.microlearning_flashcard_result enable row level security;

drop policy if exists microlearning_flashcard_result_select on public.microlearning_flashcard_result;
create policy microlearning_flashcard_result_select
on public.microlearning_flashcard_result
for select
using (
  trainee_id = auth.uid()::text
  or exists (
    select 1
    from public.microlearning_assignment as assignment
    where assignment.id = microlearning_flashcard_result.assignment_id
      and assignment.assigned_by = auth.uid()::text
  )
  or exists (
    select 1
    from public.microlearning_module as module
    where module.id = microlearning_flashcard_result.module_id
      and module.created_by = auth.uid()::text
  )
);

drop policy if exists microlearning_flashcard_result_manage on public.microlearning_flashcard_result;
create policy microlearning_flashcard_result_manage
on public.microlearning_flashcard_result
for all
using (
  trainee_id = auth.uid()::text
  or exists (
    select 1
    from public.microlearning_assignment as assignment
    where assignment.id = microlearning_flashcard_result.assignment_id
      and assignment.assigned_by = auth.uid()::text
  )
  or exists (
    select 1
    from public.microlearning_module as module
    where module.id = microlearning_flashcard_result.module_id
      and module.created_by = auth.uid()::text
  )
)
with check (
  trainee_id = auth.uid()::text
  or exists (
    select 1
    from public.microlearning_assignment as assignment
    where assignment.id = microlearning_flashcard_result.assignment_id
      and assignment.assigned_by = auth.uid()::text
  )
  or exists (
    select 1
    from public.microlearning_module as module
    where module.id = microlearning_flashcard_result.module_id
      and module.created_by = auth.uid()::text
  )
);
