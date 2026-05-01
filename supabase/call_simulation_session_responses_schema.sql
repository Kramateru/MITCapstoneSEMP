-- Supplemental Call Simulation schema for per-turn trainee response persistence.
-- This aligns the Supabase database with the current SQLAlchemy-backed
-- Call Simulation flow used by the trainer and trainee modules.

create extension if not exists pgcrypto;

create table if not exists public.session_responses (
  id text primary key default gen_random_uuid()::text,
  session_id text not null references public.sim_session(id) on delete cascade,
  script_id text references public.scenario_flow(id) on delete set null,
  scenario_id text not null references public.scenario(id) on delete cascade,
  trainee_id text not null references public."user"(id) on delete cascade,
  step_number integer not null,
  turn_attempt_number integer not null default 1,
  actor_type text not null default 'CSR',
  scenario_group text,
  expected_script text,
  trainee_spoken_text text,
  matched_score numeric(8,2) not null default 0,
  grammar_score numeric(6,2) not null default 0,
  pronunciation_score numeric(6,2) not null default 0,
  pacing_score numeric(6,2) not null default 0,
  speech_to_text_accuracy numeric(6,2) not null default 0,
  transcript_confidence numeric(6,2) not null default 0,
  audio_url text,
  ai_feedback text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (session_id, step_number, turn_attempt_number)
);

create index if not exists idx_session_responses_session
  on public.session_responses (session_id, step_number, turn_attempt_number);

create index if not exists idx_session_responses_trainee
  on public.session_responses (trainee_id, created_at desc);

create index if not exists idx_session_responses_scenario
  on public.session_responses (scenario_id, created_at desc);

alter table public.session_responses enable row level security;

drop policy if exists "session_responses_select_related_users" on public.session_responses;
create policy "session_responses_select_related_users"
on public.session_responses
for select
using (
  public.is_trainer_or_admin()
  or exists (
    select 1
    from public.sim_session session_row
    where session_row.id = session_responses.session_id
      and session_row.trainee_id = auth.uid()::text
  )
);

drop policy if exists "session_responses_insert_trainers_or_backend" on public.session_responses;
create policy "session_responses_insert_trainers_or_backend"
on public.session_responses
for insert
with check (
  public.is_trainer_or_admin()
  or exists (
    select 1
    from public.sim_session session_row
    where session_row.id = session_responses.session_id
      and session_row.trainee_id = auth.uid()::text
  )
);

drop policy if exists "session_responses_update_trainers_or_owner" on public.session_responses;
create policy "session_responses_update_trainers_or_owner"
on public.session_responses
for update
using (
  public.is_trainer_or_admin()
  or exists (
    select 1
    from public.sim_session session_row
    where session_row.id = session_responses.session_id
      and session_row.trainee_id = auth.uid()::text
  )
)
with check (
  public.is_trainer_or_admin()
  or exists (
    select 1
    from public.sim_session session_row
    where session_row.id = session_responses.session_id
      and session_row.trainee_id = auth.uid()::text
  )
);
