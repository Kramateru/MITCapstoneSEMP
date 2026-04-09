-- Sim Floor Supabase schema
-- Supports trainer scenario authoring, trainee mock calls, Google ASR logs,
-- coaching playback, retake decisions, analytics, and certificate tracking.

create extension if not exists pgcrypto;

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'trainee'
  );
$$;

create or replace function public.is_trainer_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('trainer', 'admin');
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'trainee' check (role in ('trainer', 'trainee', 'admin')),
  avatar_url text,
  batch_id uuid,
  status text default 'available',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  opening_prompt text not null,
  expected_keywords text[] not null default '{}',
  estimated_duration integer,
  difficulty text,
  purpose text,
  member_profile jsonb not null default '{}'::jsonb,
  cxone_metadata jsonb not null default '{}'::jsonb,
  sim_floor_config jsonb not null default '{}'::jsonb,
  ringer_audio_url text,
  hold_audio_url text,
  created_by uuid references public.profiles(id) on delete set null,
  is_published boolean not null default true,
  is_draft boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scenario_steps (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  step_number integer not null,
  actor text not null check (actor in ('csr', 'member', 'system')),
  speaker_label text,
  script text not null,
  expected_keywords text[] not null default '{}',
  audio_url text,
  step_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (scenario_id, step_number)
);

create table if not exists public.kpi_configurations (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid references public.scenarios(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  opening_spiel_weight numeric(6,2) not null default 20,
  empathy_weight numeric(6,2) not null default 15,
  accuracy_weight numeric(6,2) not null default 20,
  verification_weight numeric(6,2) not null default 15,
  closing_weight numeric(6,2) not null default 15,
  aht_weight numeric(6,2) not null default 10,
  pacing_weight numeric(6,2) not null default 5,
  passing_score numeric(6,2) not null default 90,
  target_aht_seconds integer default 180,
  target_ros_words_per_min numeric(6,2) default 150,
  target_dead_air_seconds numeric(6,2) default 3,
  empathy_keywords text[] not null default '{}',
  probing_keywords text[] not null default '{}',
  forbidden_words text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.mock_call_attempts (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  kpi_configuration_id uuid references public.kpi_configurations(id) on delete set null,
  attempt_number integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'failed')),
  trainer_verdict_status text not null default 'pending' check (trainer_verdict_status in ('pending', 'competent', 'retake')),
  trainer_evaluated_by uuid references public.profiles(id) on delete set null,
  trainer_evaluated_at timestamptz,
  trainer_remarks text,
  coaching_notes text,
  transcript text,
  transcript_log jsonb not null default '[]'::jsonb,
  turn_logs jsonb not null default '[]'::jsonb,
  audio_path text,
  audio_url text,
  speech_to_text_accuracy numeric(6,2) default 0,
  grammar_score numeric(6,2) default 0,
  pronunciation_score numeric(6,2) default 0,
  pacing_score numeric(6,2) default 0,
  rate_of_speech numeric(8,2) default 0,
  dead_air_seconds numeric(8,2) default 0,
  empathy_statements_count integer not null default 0,
  probing_questions_count integer not null default 0,
  forbidden_words_count integer not null default 0,
  forbidden_words_detected text[] not null default '{}',
  keyword_match_percent numeric(6,2) default 0,
  sentiment_score numeric(6,2) default 0,
  weighted_score numeric(6,2) default 0,
  pass_fail boolean not null default false,
  total_handle_time_seconds integer default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.mock_call_turns (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.mock_call_attempts(id) on delete cascade,
  step_number integer not null,
  actor text not null check (actor in ('csr', 'member', 'system')),
  speaker_label text,
  transcript text,
  audio_path text,
  audio_url text,
  duration_seconds numeric(8,2) default 0,
  matched_keywords text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (attempt_id, step_number, actor)
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  attempt_id uuid references public.mock_call_attempts(id) on delete set null,
  certificate_number text not null unique default upper(encode(gen_random_bytes(6), 'hex')),
  certificate_title text not null default 'Certificate of Competency',
  certificate_url text,
  status text not null default 'issued' check (status in ('issued', 'revoked')),
  remarks text,
  issued_by uuid references public.profiles(id) on delete set null,
  issue_date timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trainer_reports (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id uuid references public.scenarios(id) on delete cascade,
  trainee_id uuid references public.profiles(id) on delete cascade,
  pass_rate numeric(6,2) default 0,
  average_attempts_before_competency numeric(6,2) default 0,
  average_score numeric(6,2) default 0,
  report_payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_scenarios_created_by on public.scenarios(created_by);
create index if not exists idx_scenario_steps_scenario on public.scenario_steps(scenario_id, step_number);
create index if not exists idx_kpi_configurations_scenario on public.kpi_configurations(scenario_id);
create index if not exists idx_mock_call_attempts_trainee on public.mock_call_attempts(trainee_id, created_at desc);
create index if not exists idx_mock_call_attempts_scenario on public.mock_call_attempts(scenario_id, created_at desc);
create index if not exists idx_mock_call_attempts_verdict on public.mock_call_attempts(trainer_verdict_status);
create index if not exists idx_mock_call_turns_attempt on public.mock_call_turns(attempt_id, step_number);
create index if not exists idx_certificates_trainee on public.certificates(trainee_id, issue_date desc);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_scenarios_updated_at on public.scenarios;
create trigger trg_scenarios_updated_at
before update on public.scenarios
for each row execute function public.set_updated_at();

drop trigger if exists trg_scenario_steps_updated_at on public.scenario_steps;
create trigger trg_scenario_steps_updated_at
before update on public.scenario_steps
for each row execute function public.set_updated_at();

drop trigger if exists trg_kpi_configurations_updated_at on public.kpi_configurations;
create trigger trg_kpi_configurations_updated_at
before update on public.kpi_configurations
for each row execute function public.set_updated_at();

drop trigger if exists trg_mock_call_attempts_updated_at on public.mock_call_attempts;
create trigger trg_mock_call_attempts_updated_at
before update on public.mock_call_attempts
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.scenarios enable row level security;
alter table public.scenario_steps enable row level security;
alter table public.kpi_configurations enable row level security;
alter table public.mock_call_attempts enable row level security;
alter table public.mock_call_turns enable row level security;
alter table public.certificates enable row level security;
alter table public.trainer_reports enable row level security;

drop policy if exists "profiles_select_self_or_trainer" on public.profiles;
create policy "profiles_select_self_or_trainer"
on public.profiles
for select
using (id = auth.uid() or public.is_trainer_or_admin());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "scenarios_select_authenticated" on public.scenarios;
create policy "scenarios_select_authenticated"
on public.scenarios
for select
using (auth.role() = 'authenticated');

drop policy if exists "scenarios_manage_trainers" on public.scenarios;
create policy "scenarios_manage_trainers"
on public.scenarios
for all
using (public.is_trainer_or_admin())
with check (public.is_trainer_or_admin());

drop policy if exists "scenario_steps_select_authenticated" on public.scenario_steps;
create policy "scenario_steps_select_authenticated"
on public.scenario_steps
for select
using (auth.role() = 'authenticated');

drop policy if exists "scenario_steps_manage_trainers" on public.scenario_steps;
create policy "scenario_steps_manage_trainers"
on public.scenario_steps
for all
using (public.is_trainer_or_admin())
with check (public.is_trainer_or_admin());

drop policy if exists "kpi_manage_trainers" on public.kpi_configurations;
create policy "kpi_manage_trainers"
on public.kpi_configurations
for all
using (public.is_trainer_or_admin())
with check (public.is_trainer_or_admin());

drop policy if exists "attempts_select_owner_or_trainer" on public.mock_call_attempts;
create policy "attempts_select_owner_or_trainer"
on public.mock_call_attempts
for select
using (trainee_id = auth.uid() or public.is_trainer_or_admin());

drop policy if exists "attempts_insert_owner" on public.mock_call_attempts;
create policy "attempts_insert_owner"
on public.mock_call_attempts
for insert
with check (trainee_id = auth.uid() or public.is_trainer_or_admin());

drop policy if exists "attempts_update_owner_or_trainer" on public.mock_call_attempts;
create policy "attempts_update_owner_or_trainer"
on public.mock_call_attempts
for update
using (trainee_id = auth.uid() or public.is_trainer_or_admin())
with check (trainee_id = auth.uid() or public.is_trainer_or_admin());

drop policy if exists "turns_select_owner_or_trainer" on public.mock_call_turns;
create policy "turns_select_owner_or_trainer"
on public.mock_call_turns
for select
using (
  exists (
    select 1
    from public.mock_call_attempts attempts
    where attempts.id = attempt_id
      and (attempts.trainee_id = auth.uid() or public.is_trainer_or_admin())
  )
);

drop policy if exists "turns_insert_owner_or_trainer" on public.mock_call_turns;
create policy "turns_insert_owner_or_trainer"
on public.mock_call_turns
for insert
with check (
  exists (
    select 1
    from public.mock_call_attempts attempts
    where attempts.id = attempt_id
      and (attempts.trainee_id = auth.uid() or public.is_trainer_or_admin())
  )
);

drop policy if exists "turns_update_owner_or_trainer" on public.mock_call_turns;
create policy "turns_update_owner_or_trainer"
on public.mock_call_turns
for update
using (
  exists (
    select 1
    from public.mock_call_attempts attempts
    where attempts.id = attempt_id
      and (attempts.trainee_id = auth.uid() or public.is_trainer_or_admin())
  )
)
with check (
  exists (
    select 1
    from public.mock_call_attempts attempts
    where attempts.id = attempt_id
      and (attempts.trainee_id = auth.uid() or public.is_trainer_or_admin())
  )
);

drop policy if exists "certificates_select_owner_or_trainer" on public.certificates;
create policy "certificates_select_owner_or_trainer"
on public.certificates
for select
using (trainee_id = auth.uid() or public.is_trainer_or_admin());

drop policy if exists "certificates_manage_trainers" on public.certificates;
create policy "certificates_manage_trainers"
on public.certificates
for all
using (public.is_trainer_or_admin())
with check (public.is_trainer_or_admin());

drop policy if exists "trainer_reports_select_trainers" on public.trainer_reports;
create policy "trainer_reports_select_trainers"
on public.trainer_reports
for select
using (public.is_trainer_or_admin());

drop policy if exists "trainer_reports_manage_trainers" on public.trainer_reports;
create policy "trainer_reports_manage_trainers"
on public.trainer_reports
for all
using (public.is_trainer_or_admin())
with check (public.is_trainer_or_admin());

insert into storage.buckets (id, name, public)
values ('sim-floor-audio', 'sim-floor-audio', true)
on conflict (id) do nothing;

drop policy if exists "audio_read_own_or_trainer" on storage.objects;
create policy "audio_read_own_or_trainer"
on storage.objects
for select
using (
  bucket_id = 'sim-floor-audio'
  and (
    public.is_trainer_or_admin()
    or split_part(name, '/', 2) = auth.uid()::text
  )
);

drop policy if exists "audio_insert_own_or_trainer" on storage.objects;
create policy "audio_insert_own_or_trainer"
on storage.objects
for insert
with check (
  bucket_id = 'sim-floor-audio'
  and (
    public.is_trainer_or_admin()
    or split_part(name, '/', 2) = auth.uid()::text
  )
);

drop policy if exists "audio_update_own_or_trainer" on storage.objects;
create policy "audio_update_own_or_trainer"
on storage.objects
for update
using (
  bucket_id = 'sim-floor-audio'
  and (
    public.is_trainer_or_admin()
    or split_part(name, '/', 2) = auth.uid()::text
  )
)
with check (
  bucket_id = 'sim-floor-audio'
  and (
    public.is_trainer_or_admin()
    or split_part(name, '/', 2) = auth.uid()::text
  )
);

drop policy if exists "sim_floor_assets_read_authenticated" on storage.objects;
create policy "sim_floor_assets_read_authenticated"
on storage.objects
for select
using (
  bucket_id = 'sim-floor-audio'
  and split_part(name, '/', 1) = 'assets'
  and auth.role() = 'authenticated'
);

drop policy if exists "sim_floor_assets_manage_trainers" on storage.objects;
create policy "sim_floor_assets_manage_trainers"
on storage.objects
for insert
with check (
  bucket_id = 'sim-floor-audio'
  and split_part(name, '/', 1) = 'assets'
  and public.is_trainer_or_admin()
);

drop policy if exists "sim_floor_assets_update_trainers" on storage.objects;
create policy "sim_floor_assets_update_trainers"
on storage.objects
for update
using (
  bucket_id = 'sim-floor-audio'
  and split_part(name, '/', 1) = 'assets'
  and public.is_trainer_or_admin()
)
with check (
  bucket_id = 'sim-floor-audio'
  and split_part(name, '/', 1) = 'assets'
  and public.is_trainer_or_admin()
);

comment on table public.mock_call_attempts is
'Supabase storage path conventions: recordings/{trainee_id}/{scenario_id}/{attempt_id}/{timestamp}.webm for attempts and assets/{trainer_id}/{scenario_id_or_draft}/{asset_kind}/{timestamp}_{filename} for trainer-managed member/ringer/hold audio.';
