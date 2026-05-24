-- Call Simulation Supabase schema
-- Covers trainer scenario authoring, trainee mock-call attempts, audio storage,
-- KPI scoring, coaching verdicts, realtime-friendly tables, and certificates.

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
    id uuid primary key references auth.users (id) on delete cascade,
    email text unique,
    full_name text,
    role text not null default 'trainee' check (
        role in ('trainer', 'trainee', 'admin')
    ),
    avatar_url text,
    status text not null default 'available' check (
        status in (
            'available',
            'busy',
            'offline',
            'on_call'
        )
    ),
    created_at timestamptz not null default timezone ('utc', now()),
    updated_at timestamptz not null default timezone ('utc', now())
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
  call_simulation_config jsonb not null default '{}'::jsonb,
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
  response_time_limit integer,
  is_closing boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (scenario_id, step_number)
);

create table if not exists public.call_simulation_audio_assets (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id uuid references public.scenarios(id) on delete set null,
  script_turn_id uuid references public.scenario_steps(id) on delete set null,
  step_number integer,
  asset_kind text not null check (
    asset_kind in ('member-step', 'ringer', 'hold', 'scenario-ringer', 'scenario-hold', 'opening-prompts')
  ),
  source_type text not null default 'upload' check (
    source_type in ('upload', 'generated_tts', 'manual_url')
  ),
  file_name text not null,
  file_type text not null,
  file_size bigint,
  bucket_name text,
  storage_path text,
  public_url text not null,
  voice_used text,
  provider text,
  generated_text text,
  asset_metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
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
  asr_provider text,
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
  asr_provider text,
  duration_seconds numeric(8,2) default 0,
  matched_keywords text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (attempt_id, step_number, actor)
);

create table if not exists public.certificates (
    id uuid primary key default gen_random_uuid (),
    trainee_id uuid not null references public.profiles (id) on delete cascade,
    scenario_id uuid not null references public.scenarios (id) on delete cascade,
    attempt_id uuid references public.mock_call_attempts (id) on delete set null,
    certificate_number text not null unique default upper(
        encode (gen_random_bytes (6), 'hex')
    ),
    certificate_title text not null default 'Certificate of Competency',
    certificate_url text,
    status text not null default 'issued' check (
        status in ('issued', 'revoked')
    ),
    remarks text,
    issued_by uuid references public.profiles (id) on delete set null,
    issue_date timestamptz not null default timezone ('utc', now()),
    created_at timestamptz not null default timezone ('utc', now())
);

create index if not exists idx_scenarios_created_by on public.scenarios (created_by);

create index if not exists idx_scenario_steps_scenario on public.scenario_steps (scenario_id, step_number);

create index if not exists idx_call_sim_audio_assets_trainer on public.call_simulation_audio_assets (trainer_id, updated_at desc);

create index if not exists idx_call_sim_audio_assets_scenario on public.call_simulation_audio_assets (scenario_id, step_number);

create index if not exists idx_mock_call_attempts_trainee on public.mock_call_attempts (trainee_id, created_at desc);

create index if not exists idx_mock_call_attempts_scenario on public.mock_call_attempts (scenario_id, created_at desc);

create index if not exists idx_mock_call_turns_attempt on public.mock_call_turns (attempt_id, step_number);

create index if not exists idx_certificates_trainee on public.certificates (trainee_id, issue_date desc);

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

drop trigger if exists trg_call_sim_audio_assets_updated_at on public.call_simulation_audio_assets;

create trigger trg_call_sim_audio_assets_updated_at
before update on public.call_simulation_audio_assets
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

alter table public.call_simulation_audio_assets enable row level security;

alter table public.kpi_configurations enable row level security;

alter table public.mock_call_attempts enable row level security;

alter table public.mock_call_turns enable row level security;

alter table public.certificates enable row level security;

drop policy if exists "profiles_select_self_or_trainer" on public.profiles;

create policy "profiles_select_self_or_trainer" on public.profiles for
select using (
        id = auth.uid ()
        or public.is_trainer_or_admin ()
    );

drop policy if exists "profiles_update_self" on public.profiles;

create policy "profiles_update_self" on public.profiles for
update using (id = auth.uid ())
with
    check (id = auth.uid ());

drop policy if exists "scenarios_select_authenticated" on public.scenarios;

create policy "scenarios_select_authenticated" on public.scenarios for
select using (
        auth.role () = 'authenticated'
    );

drop policy if exists "scenarios_manage_trainers" on public.scenarios;

create policy "scenarios_manage_trainers" on public.scenarios for all using (public.is_trainer_or_admin ())
with
    check (public.is_trainer_or_admin ());

drop policy if exists "scenario_steps_select_authenticated" on public.scenario_steps;

create policy "scenario_steps_select_authenticated" on public.scenario_steps for
select using (
        auth.role () = 'authenticated'
    );

drop policy if exists "scenario_steps_manage_trainers" on public.scenario_steps;

create policy "scenario_steps_manage_trainers" on public.scenario_steps for all using (public.is_trainer_or_admin ())
with
    check (public.is_trainer_or_admin ());

drop policy if exists "kpi_manage_trainers" on public.kpi_configurations;

create policy "kpi_manage_trainers" on public.kpi_configurations for all using (public.is_trainer_or_admin ())
with
    check (public.is_trainer_or_admin ());

drop policy if exists "attempts_select_owner_or_trainer" on public.mock_call_attempts;

create policy "attempts_select_owner_or_trainer" on public.mock_call_attempts for
select using (
        trainee_id = auth.uid ()
        or public.is_trainer_or_admin ()
    );

drop policy if exists "attempts_insert_owner" on public.mock_call_attempts;

create policy "attempts_insert_owner" on public.mock_call_attempts for
insert
with
    check (
        trainee_id = auth.uid ()
        or public.is_trainer_or_admin ()
    );

drop policy if exists "attempts_update_owner_or_trainer" on public.mock_call_attempts;

create policy "attempts_update_owner_or_trainer" on public.mock_call_attempts for
update using (
    trainee_id = auth.uid ()
    or public.is_trainer_or_admin ()
)
with
    check (
        trainee_id = auth.uid ()
        or public.is_trainer_or_admin ()
    );

drop policy if exists "turns_select_owner_or_trainer" on public.mock_call_turns;

create policy "turns_select_owner_or_trainer" on public.mock_call_turns for
select using (
        exists (
            select 1
            from public.mock_call_attempts attempts
            where
                attempts.id = attempt_id
                and (
                    attempts.trainee_id = auth.uid ()
                    or public.is_trainer_or_admin ()
                )
        )
    );

drop policy if exists "turns_insert_owner_or_trainer" on public.mock_call_turns;

create policy "turns_insert_owner_or_trainer" on public.mock_call_turns for
insert
with
    check (
        exists (
            select 1
            from public.mock_call_attempts attempts
            where
                attempts.id = attempt_id
                and (
                    attempts.trainee_id = auth.uid ()
                    or public.is_trainer_or_admin ()
                )
        )
    );

drop policy if exists "turns_update_owner_or_trainer" on public.mock_call_turns;

create policy "turns_update_owner_or_trainer" on public.mock_call_turns for
update using (
    exists (
        select 1
        from public.mock_call_attempts attempts
        where
            attempts.id = attempt_id
            and (
                attempts.trainee_id = auth.uid ()
                or public.is_trainer_or_admin ()
            )
    )
)
with
    check (
        exists (
            select 1
            from public.mock_call_attempts attempts
            where
                attempts.id = attempt_id
                and (
                    attempts.trainee_id = auth.uid ()
                    or public.is_trainer_or_admin ()
                )
        )
    );

drop policy if exists "certificates_select_owner_or_trainer" on public.certificates;

create policy "certificates_select_owner_or_trainer" on public.certificates for
select using (
        trainee_id = auth.uid ()
        or public.is_trainer_or_admin ()
    );

drop policy if exists "certificates_manage_trainers" on public.certificates;

create policy "certificates_manage_trainers" on public.certificates for all using (public.is_trainer_or_admin ())
with
    check (public.is_trainer_or_admin ());

insert into
    storage.buckets (id, name, public)
values (
        'call-simulation-audio',
        'call-simulation-audio',
        true
    ) on conflict (id) do nothing;

drop policy if exists "audio_read_own_or_trainer" on storage.objects;

create policy "audio_read_own_or_trainer"
on storage.objects
for select
using (
  bucket_id = 'call-simulation-audio'
  and split_part(name, '/', 1) = 'recordings'
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
  bucket_id = 'call-simulation-audio'
  and split_part(name, '/', 1) = 'recordings'
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
  bucket_id = 'call-simulation-audio'
  and split_part(name, '/', 1) = 'recordings'
  and (
    public.is_trainer_or_admin()
    or split_part(name, '/', 2) = auth.uid()::text
  )
)
with check (
  bucket_id = 'call-simulation-audio'
  and split_part(name, '/', 1) = 'recordings'
  and (
    public.is_trainer_or_admin()
    or split_part(name, '/', 2) = auth.uid()::text
  )
);

drop policy if exists "call_simulation_assets_read_authenticated" on storage.objects;

create policy "call_simulation_assets_read_authenticated" on storage.objects for
select using (
        bucket_id = 'call-simulation-audio'
        and split_part (name, '/', 1) = 'assets'
        and auth.role () = 'authenticated'
    );

drop policy if exists "call_simulation_assets_manage_trainers" on storage.objects;

create policy "call_simulation_assets_manage_trainers" on storage.objects for
insert
with
    check (
        bucket_id = 'call-simulation-audio'
        and split_part (name, '/', 1) = 'assets'
        and public.is_trainer_or_admin ()
    );

drop policy if exists "call_simulation_assets_update_trainers" on storage.objects;

create policy "call_simulation_assets_update_trainers" on storage.objects for
update using (
    bucket_id = 'call-simulation-audio'
    and split_part (name, '/', 1) = 'assets'
    and public.is_trainer_or_admin ()
)
with
    check (
        bucket_id = 'call-simulation-audio'
        and split_part (name, '/', 1) = 'assets'
        and public.is_trainer_or_admin ()
    );

drop policy if exists "call_sim_audio_assets_select_trainers" on public.call_simulation_audio_assets;

create policy "call_sim_audio_assets_select_trainers" on public.call_simulation_audio_assets for
select using (
  public.is_trainer_or_admin()
  and trainer_id = auth.uid()
);

drop policy if exists "call_sim_audio_assets_insert_trainers" on public.call_simulation_audio_assets;

create policy "call_sim_audio_assets_insert_trainers" on public.call_simulation_audio_assets for
insert with check (
  public.is_trainer_or_admin()
  and trainer_id = auth.uid()
);

drop policy if exists "call_sim_audio_assets_update_trainers" on public.call_simulation_audio_assets;

create policy "call_sim_audio_assets_update_trainers" on public.call_simulation_audio_assets for
update using (
  public.is_trainer_or_admin()
  and trainer_id = auth.uid()
)
with check (
  public.is_trainer_or_admin()
  and trainer_id = auth.uid()
);

drop policy if exists "call_sim_audio_assets_delete_trainers" on public.call_simulation_audio_assets;

create policy "call_sim_audio_assets_delete_trainers" on public.call_simulation_audio_assets for
delete using (
  public.is_trainer_or_admin()
  and trainer_id = auth.uid()
);

comment on
table public.mock_call_attempts is 'Storage path conventions: recordings/{trainee_id}/{scenario_id}/{attempt_id}/{timestamp}.wav for attempts and assets/{trainer_id}/{scenario_id_or_draft}/{asset_kind}/{timestamp}_{filename} for trainer-managed member, ringer, and hold audio. The live app defaults map recordings to the `call-recordings` bucket and trainer-managed assets to the `call-ringers` bucket unless overridden by env.';

alter table public.scenarios
  add column if not exists topic text,
  add column if not exists scenario_group text;

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  actor_type text not null check (actor_type in ('CSR', 'Member', 'System')),
  content text not null,
  score_weight numeric(8,2) not null default 0,
  sequence_order integer not null,
  scenario_group text,
  audio_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.simulations_results (
  id text primary key,
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id uuid references public.scenarios(id) on delete set null,
  scenario_title text,
  scenario_topic text,
  final_score numeric(8,2) not null default 0,
  ai_feedback jsonb not null default '{}'::jsonb,
  transcript text,
  passed boolean not null default false,
  certificate_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scenario_groups (
  id uuid primary key,
  title text not null,
  topic text,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scenario_scripts (
  id uuid primary key default gen_random_uuid(),
  scenario_group_id uuid not null references public.scenario_groups(id) on delete cascade,
  actor_type text not null check (actor_type in ('CSR', 'Member')),
  script_text text not null,
  score_value integer not null default 0,
  audio_url text,
  order_index integer not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.scenario_scripts
  add column if not exists audio_url text;

create table if not exists public.kpi_metrics (
  id uuid primary key default gen_random_uuid(),
  scenario_group_id uuid not null references public.scenario_groups(id) on delete cascade,
  metric_name text not null,
  weight_percentage integer not null default 0
);

create table if not exists public.trainee_sessions (
  id uuid primary key,
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  scenario_group_id uuid not null references public.scenario_groups(id) on delete cascade,
  started_at timestamptz,
  completed_at timestamptz,
  total_score integer not null default 0,
  passed boolean not null default false,
  ai_feedback text
);

create table if not exists public.session_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.trainee_sessions(id) on delete cascade,
  script_id uuid references public.scenario_scripts(id) on delete set null,
  scenario_id uuid references public.scenario_groups(id) on delete cascade,
  trainee_id uuid references public.profiles(id) on delete cascade,
  step_number integer,
  turn_attempt_number integer not null default 1,
  actor_type text not null default 'CSR',
  scenario_group text,
  expected_script text,
  trainee_spoken_text text,
  matched_score integer not null default 0,
  grammar_score integer not null default 0,
  pronunciation_score integer not null default 0,
  pacing_score integer not null default 0,
  speech_to_text_accuracy numeric(8,2) not null default 0,
  transcript_confidence numeric(8,2) not null default 0,
  audio_url text,
  ai_feedback text
);

alter table public.certificates
  add column if not exists scenario_group_id uuid references public.scenario_groups(id) on delete set null,
  add column if not exists issued_at timestamptz;

create index if not exists idx_scripts_scenario_sequence
  on public.scripts (scenario_id, sequence_order);

create index if not exists idx_simulations_results_trainee
  on public.simulations_results (trainee_id, created_at desc);

create index if not exists idx_simulations_results_scenario
  on public.simulations_results (scenario_id, created_at desc);

create index if not exists idx_scenario_scripts_group_sequence
  on public.scenario_scripts (scenario_group_id, order_index);

create index if not exists idx_kpi_metrics_group
  on public.kpi_metrics (scenario_group_id);

create index if not exists idx_trainee_sessions_trainee
  on public.trainee_sessions (trainee_id, completed_at desc);

create index if not exists idx_session_responses_session
  on public.session_responses (session_id);

drop trigger if exists trg_scripts_updated_at on public.scripts;

create trigger trg_scripts_updated_at
before update on public.scripts
for each row execute function public.set_updated_at();

drop trigger if exists trg_simulations_results_updated_at on public.simulations_results;

create trigger trg_simulations_results_updated_at
before update on public.simulations_results
for each row execute function public.set_updated_at();

alter table public.scripts enable row level security;

alter table public.simulations_results enable row level security;

alter table public.scenario_groups enable row level security;

alter table public.scenario_scripts enable row level security;

alter table public.kpi_metrics enable row level security;

alter table public.trainee_sessions enable row level security;

alter table public.session_responses enable row level security;

drop policy if exists "scripts_select_authenticated" on public.scripts;

create policy "scripts_select_authenticated" on public.scripts
for select using (
  auth.role() = 'authenticated'
);

drop policy if exists "scripts_manage_trainers" on public.scripts;

create policy "scripts_manage_trainers" on public.scripts
for all using (public.is_trainer_or_admin())
with check (public.is_trainer_or_admin());

drop policy if exists "scenario_groups_select_authenticated" on public.scenario_groups;

create policy "scenario_groups_select_authenticated" on public.scenario_groups
for select using (
  auth.role() = 'authenticated'
);

drop policy if exists "scenario_groups_manage_trainers" on public.scenario_groups;

create policy "scenario_groups_manage_trainers" on public.scenario_groups
for all using (public.is_trainer_or_admin())
with check (public.is_trainer_or_admin());

drop policy if exists "scenario_scripts_select_authenticated" on public.scenario_scripts;

create policy "scenario_scripts_select_authenticated" on public.scenario_scripts
for select using (
  auth.role() = 'authenticated'
);

drop policy if exists "scenario_scripts_manage_trainers" on public.scenario_scripts;

create policy "scenario_scripts_manage_trainers" on public.scenario_scripts
for all using (public.is_trainer_or_admin())
with check (public.is_trainer_or_admin());

drop policy if exists "kpi_metrics_select_authenticated" on public.kpi_metrics;

create policy "kpi_metrics_select_authenticated" on public.kpi_metrics
for select using (
  auth.role() = 'authenticated'
);

drop policy if exists "kpi_metrics_manage_trainers" on public.kpi_metrics;

create policy "kpi_metrics_manage_trainers" on public.kpi_metrics
for all using (public.is_trainer_or_admin())
with check (public.is_trainer_or_admin());

drop policy if exists "trainee_sessions_select_related_users" on public.trainee_sessions;

create policy "trainee_sessions_select_related_users" on public.trainee_sessions
for select using (
  trainee_id = auth.uid()
  or public.is_trainer_or_admin()
);

drop policy if exists "trainee_sessions_insert_related_users" on public.trainee_sessions;

create policy "trainee_sessions_insert_related_users" on public.trainee_sessions
for insert with check (
  trainee_id = auth.uid()
  or public.is_trainer_or_admin()
);

drop policy if exists "trainee_sessions_update_related_users" on public.trainee_sessions;

create policy "trainee_sessions_update_related_users" on public.trainee_sessions
for update using (
  trainee_id = auth.uid()
  or public.is_trainer_or_admin()
)
with check (
  trainee_id = auth.uid()
  or public.is_trainer_or_admin()
);

drop policy if exists "session_responses_select_related_users" on public.session_responses;

create policy "session_responses_select_related_users" on public.session_responses
for select using (
  exists (
    select 1
    from public.trainee_sessions trainee_session
    where trainee_session.id = session_responses.session_id
      and (
        trainee_session.trainee_id = auth.uid()
        or public.is_trainer_or_admin()
      )
  )
);

drop policy if exists "session_responses_insert_related_users" on public.session_responses;

create policy "session_responses_insert_related_users" on public.session_responses
for insert with check (
  exists (
    select 1
    from public.trainee_sessions trainee_session
    where trainee_session.id = session_responses.session_id
      and (
        trainee_session.trainee_id = auth.uid()
        or public.is_trainer_or_admin()
      )
  )
);

drop policy if exists "session_responses_update_related_users" on public.session_responses;

create policy "session_responses_update_related_users" on public.session_responses
for update using (
  exists (
    select 1
    from public.trainee_sessions trainee_session
    where trainee_session.id = session_responses.session_id
      and (
        trainee_session.trainee_id = auth.uid()
        or public.is_trainer_or_admin()
      )
  )
)
with check (
  exists (
    select 1
    from public.trainee_sessions trainee_session
    where trainee_session.id = session_responses.session_id
      and (
        trainee_session.trainee_id = auth.uid()
        or public.is_trainer_or_admin()
      )
  )
);

drop policy if exists "simulations_results_select_related_users" on public.simulations_results;

create policy "simulations_results_select_related_users" on public.simulations_results
for select using (
  trainee_id = auth.uid()
  or public.is_trainer_or_admin()
);

drop policy if exists "simulations_results_insert_related_users" on public.simulations_results;

create policy "simulations_results_insert_related_users" on public.simulations_results
for insert with check (
  trainee_id = auth.uid()
  or public.is_trainer_or_admin()
);

drop policy if exists "simulations_results_update_related_users" on public.simulations_results;

create policy "simulations_results_update_related_users" on public.simulations_results
for update using (
  trainee_id = auth.uid()
  or public.is_trainer_or_admin()
)
with check (
  trainee_id = auth.uid()
  or public.is_trainer_or_admin()
);

comment on table public.scripts is 'Normalized trainer-authored call simulation script rows mirrored from the scenario builder and bulk upload flows.';

comment on table public.simulations_results is 'Normalized trainee call simulation results mirrored from the final scoring and Gemini feedback workflow.';

comment on table public.scenario_groups is 'Prompt-aligned Supabase scenario group records mirrored from trainer-authored call simulations.';

comment on table public.scenario_scripts is 'Prompt-aligned Supabase scenario scripts for alternating CSR and Member rows.';

comment on table public.kpi_metrics is 'Prompt-aligned KPI metric weights mirrored from Call Simulation KPI Management.';

comment on table public.trainee_sessions is 'Prompt-aligned trainee session summary rows for BPO call simulations.';

-- Compatibility reporting views
-- These expose the exact entity names used by the Call Simulation module spec
-- while preserving the app's existing normalized/runtime tables.

do $$
begin
  if to_regclass('public.scenarios') is not null then
    execute $view$
      create or replace view public.call_simulation_scenarios as
      select
        id,
        title,
        description,
        opening_prompt,
        expected_keywords,
        estimated_duration,
        difficulty,
        purpose,
        member_profile,
        cxone_metadata,
        call_simulation_config,
        ringer_audio_url,
        hold_audio_url,
        created_by as trainer_id,
        is_published,
        is_draft,
        created_at,
        updated_at
      from public.scenarios;
    $view$;
  end if;

  if to_regclass('public.scenario_steps') is not null then
    execute $view$
      create or replace view public.call_simulation_script_turns as
      select
        id,
        scenario_id,
        step_number,
        actor,
        speaker_label,
        script,
        expected_keywords,
        audio_url,
        response_time_limit,
        is_closing,
        metadata,
        created_at,
        updated_at
      from public.scenario_steps;
    $view$;
  end if;

  if to_regclass('public.batch_kpi_config') is not null then
    execute $view$
      create or replace view public.call_simulation_kpis as
      select
        id,
        batch_id,
        speech_to_text_weight,
        aht_weight,
        rate_of_speech_weight,
        dead_air_weight,
        empathy_statements_weight,
        probing_questions_weight,
        grammar_weight,
        pronunciation_weight,
        pacing_weight,
        forbidden_words_penalty,
        passing_score,
        forbidden_words,
        empathy_keywords,
        probing_keywords,
        target_aht_seconds,
        target_ros_words_per_min,
        target_dead_air_seconds,
        created_at,
        updated_at
      from public.batch_kpi_config;
    $view$;
  end if;

  if to_regclass('public.call_simulation_assignment') is not null then
    execute $view$
      create or replace view public.call_simulation_assignments as
      select
        id,
        scenario_id,
        trainee_id,
        assigned_by as trainer_id,
        batch_id,
        max_attempts,
        trainer_notes,
        is_active,
        assigned_at,
        updated_at
      from public.call_simulation_assignment;
    $view$;
  end if;

  if to_regclass('public.sim_session') is not null then
    execute $view$
      create or replace view public.call_simulation_attempts as
      select
        id,
        trainee_id,
        scenario_id,
        assignment_id,
        assigned_by_id as trainer_id,
        batch_id,
        status,
        attempt_number,
        max_attempts,
        transcript,
        transcript_log,
        turn_logs,
        audio_url,
        audio_duration_seconds as call_duration_seconds,
        speech_to_text_accuracy,
        grammar_score,
        pronunciation_score,
        pacing_score,
        rate_of_speech,
        dead_air_seconds,
        sentiment_score,
        keyword_compliance,
        weighted_score as final_score,
        pass_fail,
        ai_feedback,
        coaching_notes,
        trainer_verdict_status,
        trainer_verdict_notes,
        trainer_evaluated_by,
        trainer_evaluated_at,
        certificate_id,
        started_at,
        completed_at,
        created_at,
        updated_at
      from public.sim_session;
    $view$;

    execute $view$
      create or replace view public.call_simulation_recordings as
      select
        id,
        trainee_id,
        scenario_id,
        assignment_id,
        batch_id,
        audio_url as recording_url,
        audio_duration_seconds as call_duration_seconds,
        started_at,
        completed_at,
        created_at,
        updated_at
      from public.sim_session
      where audio_url is not null;
    $view$;
  end if;

  if to_regclass('public.call_simulation_scores') is not null then
    execute $view$
      create or replace view public.call_simulation_ai_evaluations as
      select
        id,
        session_id,
        scenario_id,
        call_scenario_id,
        trainee_id,
        trainee_name,
        scenario_topic,
        total_score,
        passing_score,
        is_passed,
        full_transcript,
        feedback_report as evaluation_payload,
        certificate_id,
        supabase_certificate_id,
        created_at,
        updated_at
      from public.call_simulation_scores;
    $view$;
  end if;

  if to_regclass('public.coaching_log') is not null then
    execute $view$
      create or replace view public.call_simulation_coaching_notes as
      select
        id,
        coaching_id,
        sim_session_id as session_id,
        trainer_id,
        trainee_id,
        batch_name,
        lob,
        coaching_minutes,
        strengths,
        opportunities,
        action_plan,
        target_date,
        status,
        competency_status,
        trainer_remarks,
        acknowledged_at,
        created_at,
        updated_at
      from public.coaching_log;
    $view$;
  elsif to_regclass('public.coaching_logs') is not null then
    execute $view$
      create or replace view public.call_simulation_coaching_notes as
      select
        id,
        coaching_id,
        session_id,
        trainer_id,
        trainee_id,
        null::text as batch_name,
        null::text as lob,
        null::integer as coaching_minutes,
        strengths,
        opportunities,
        action_plan,
        target_date::timestamp as target_date,
        status,
        null::text as competency_status,
        null::text as trainer_remarks,
        acknowledged_at,
        created_at,
        updated_at
      from public.coaching_logs;
    $view$;
  end if;
end $$;
