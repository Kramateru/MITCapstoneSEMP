-- Call Simulation Supabase schema
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
    id uuid primary key references auth.users (id) on delete cascade,
    email text unique,
    full_name text,
    role text not null default 'trainee' check (
        role in ('trainer', 'trainee', 'admin')
    ),
    avatar_url text,
    batch_id uuid,
    status text default 'available',
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
  step_metadata jsonb not null default '{}'::jsonb,
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

create index if not exists idx_scenarios_created_by on public.scenarios (created_by);

create index if not exists idx_scenario_steps_scenario on public.scenario_steps (scenario_id, step_number);

create index if not exists idx_call_sim_audio_assets_trainer on public.call_simulation_audio_assets (trainer_id, updated_at desc);

create index if not exists idx_call_sim_audio_assets_scenario on public.call_simulation_audio_assets (scenario_id, step_number);

create index if not exists idx_kpi_configurations_scenario on public.kpi_configurations (scenario_id);

create index if not exists idx_mock_call_attempts_trainee on public.mock_call_attempts (trainee_id, created_at desc);

create index if not exists idx_mock_call_attempts_scenario on public.mock_call_attempts (scenario_id, created_at desc);

create index if not exists idx_mock_call_attempts_verdict on public.mock_call_attempts (trainer_verdict_status);

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

alter table public.trainer_reports enable row level security;

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

drop policy if exists "trainer_reports_select_trainers" on public.trainer_reports;

create policy "trainer_reports_select_trainers" on public.trainer_reports for
select using (public.is_trainer_or_admin ());

drop policy if exists "trainer_reports_manage_trainers" on public.trainer_reports;

create policy "trainer_reports_manage_trainers" on public.trainer_reports for all using (public.is_trainer_or_admin ())
with
    check (public.is_trainer_or_admin ());

insert into
    storage.buckets (id, name, public)
values (
        'call-recordings',
        'call-recordings',
        true
    ),
    (
        'call-ringers',
        'call-ringers',
        true
    ) on conflict (id) do nothing;

drop policy if exists "audio_read_own_or_trainer" on storage.objects;

create policy "audio_read_own_or_trainer"
on storage.objects
for select
using (
  bucket_id = 'call-recordings'
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
  bucket_id = 'call-recordings'
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
  bucket_id = 'call-recordings'
  and (
    public.is_trainer_or_admin()
    or split_part(name, '/', 2) = auth.uid()::text
  )
)
with check (
  bucket_id = 'call-recordings'
  and (
    public.is_trainer_or_admin()
    or split_part(name, '/', 2) = auth.uid()::text
  )
);

drop policy if exists "call_simulation_assets_read_authenticated" on storage.objects;

create policy "call_simulation_assets_read_authenticated" on storage.objects for
select using (
        bucket_id = 'call-ringers'
        and split_part (name, '/', 1) = 'assets'
        and auth.role () = 'authenticated'
    );

drop policy if exists "call_simulation_assets_manage_trainers" on storage.objects;

create policy "call_simulation_assets_manage_trainers" on storage.objects for
insert
with
    check (
        bucket_id = 'call-ringers'
        and split_part (name, '/', 1) = 'assets'
        and public.is_trainer_or_admin ()
    );

drop policy if exists "call_simulation_assets_update_trainers" on storage.objects;

create policy "call_simulation_assets_update_trainers" on storage.objects for
update using (
    bucket_id = 'call-ringers'
    and split_part (name, '/', 1) = 'assets'
    and public.is_trainer_or_admin ()
)
with
    check (
        bucket_id = 'call-ringers'
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
table public.mock_call_attempts is 'Supabase storage path conventions: recordings/{trainee_id}/{scenario_id}/{attempt_id}/{timestamp}.webm for attempts and assets/{trainer_id}/{scenario_id_or_draft}/{asset_kind}/{timestamp}_{filename} for trainer-managed member/ringer/hold audio. The live app defaults map recordings to the `call-recordings` bucket and trainer-managed assets to the `call-ringers` bucket unless overridden by env.';

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
        coalesce(nullif(call_simulation_config ->> 'topic', ''), title) as topic,
        opening_prompt,
        expected_keywords,
        estimated_duration,
        difficulty,
        purpose,
        member_profile,
        cxone_metadata,
        call_simulation_config,
        call_simulation_config -> 'script_flow' as script_flow,
        call_simulation_config -> 'target_kpis' as target_kpis,
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
        step_metadata,
        coalesce(
          nullif(step_metadata ->> 'member_audio_url', ''),
          nullif(step_metadata ->> 'audio_url', ''),
          audio_url
        ) as member_audio_url,
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
        jsonb_build_object(
          'speech_to_text_weight', speech_to_text_weight,
          'aht_weight', aht_weight,
          'rate_of_speech_weight', rate_of_speech_weight,
          'dead_air_weight', dead_air_weight,
          'empathy_statements_weight', empathy_statements_weight,
          'probing_questions_weight', probing_questions_weight,
          'grammar_weight', grammar_weight,
          'pronunciation_weight', pronunciation_weight,
          'pacing_weight', pacing_weight,
          'forbidden_words_penalty', forbidden_words_penalty,
          'passing_score', passing_score,
          'forbidden_words', forbidden_words,
          'empathy_keywords', empathy_keywords,
          'probing_keywords', probing_keywords,
          'target_aht_seconds', target_aht_seconds,
          'target_ros_words_per_min', target_ros_words_per_min,
          'target_dead_air_seconds', target_dead_air_seconds
        ) as criteria_payload,
        created_at,
        updated_at
      from public.batch_kpi_config;
    $view$;
  end if;

  if to_regclass('public.call_simulation_assignment') is not null then
    if to_regclass('public.sim_session') is not null then
      execute $view$
        create or replace view public.call_simulation_assignments as
        select
          assignment.id,
          assignment.scenario_id,
          assignment.trainee_id,
          assignment.assigned_by as trainer_id,
          assignment.batch_id,
          assignment.max_attempts,
          assignment.trainer_notes,
          assignment.is_active,
          assignment.assigned_at,
          assignment.updated_at,
          coalesce(session_stats.latest_attempt_number, 0) as latest_attempt_number,
          greatest(coalesce(session_stats.latest_attempt_number, 0) - 1, 0) as retake_count,
          latest_session.id as latest_session_id,
          latest_session.status as latest_session_status,
          latest_session.pass_fail as latest_pass_fail,
          latest_session.weighted_score as latest_score,
          latest_session.completed_at as latest_completed_at,
          latest_session.audio_url as latest_recording_url
        from public.call_simulation_assignment as assignment
        left join lateral (
          select
            session.id,
            session.status,
            session.pass_fail,
            session.weighted_score,
            session.completed_at,
            session.audio_url
          from public.sim_session as session
          where session.assignment_id::text = assignment.id::text
          order by coalesce(session.completed_at, session.created_at) desc, session.attempt_number desc
          limit 1
        ) as latest_session on true
        left join lateral (
          select coalesce(max(session.attempt_number), 0) as latest_attempt_number
          from public.sim_session as session
          where session.assignment_id::text = assignment.id::text
        ) as session_stats on true;
      $view$;
    else
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
          updated_at,
          0::integer as latest_attempt_number,
          0::integer as retake_count,
          null::text as latest_session_id,
          null::text as latest_session_status,
          null::boolean as latest_pass_fail,
          null::numeric as latest_score,
          null::timestamp as latest_completed_at,
          null::text as latest_recording_url
        from public.call_simulation_assignment;
      $view$;
    end if;
  end if;

  if to_regclass('public.sim_session') is not null then
    if to_regclass('public.call_simulation_scores') is not null then
      execute $view$
        create or replace view public.call_simulation_attempts as
        select
          session.id,
          session.trainee_id,
          session.scenario_id,
          session.assignment_id,
          session.assigned_by_id as trainer_id,
          session.batch_id,
          session.status,
          session.attempt_number,
          greatest(coalesce(session.attempt_number, 1) - 1, 0) as retake_count,
          session.max_attempts,
          session.transcript,
          session.transcript_log,
          session.turn_logs,
          session.audio_url,
          session.audio_url as recording_url,
          session.audio_duration_seconds as call_duration_seconds,
          session.speech_to_text_accuracy,
          session.grammar_score,
          session.pronunciation_score,
          session.pacing_score,
          session.rate_of_speech,
          session.dead_air_seconds,
          session.sentiment_score,
          session.keyword_compliance,
          session.weighted_score as final_score,
          session.pass_fail,
          session.ai_feedback,
          score.id as supabase_score_record_id,
          score.passing_score,
          coalesce(score.full_transcript, session.transcript) as full_transcript,
          score.feedback_report as evaluation_payload,
          session.coaching_notes,
          session.trainer_verdict_status,
          session.trainer_verdict_notes,
          session.trainer_evaluated_by,
          session.trainer_evaluated_at,
          session.certificate_id,
          session.started_at,
          session.completed_at,
          session.created_at,
          session.updated_at
        from public.sim_session as session
        left join public.call_simulation_scores as score
          on score.session_id::text = session.id::text;
      $view$;
    else
      execute $view$
        create or replace view public.call_simulation_attempts as
        select
          session.id,
          session.trainee_id,
          session.scenario_id,
          session.assignment_id,
          session.assigned_by_id as trainer_id,
          session.batch_id,
          session.status,
          session.attempt_number,
          greatest(coalesce(session.attempt_number, 1) - 1, 0) as retake_count,
          session.max_attempts,
          session.transcript,
          session.transcript_log,
          session.turn_logs,
          session.audio_url,
          session.audio_url as recording_url,
          session.audio_duration_seconds as call_duration_seconds,
          session.speech_to_text_accuracy,
          session.grammar_score,
          session.pronunciation_score,
          session.pacing_score,
          session.rate_of_speech,
          session.dead_air_seconds,
          session.sentiment_score,
          session.keyword_compliance,
          session.weighted_score as final_score,
          session.pass_fail,
          session.ai_feedback,
          null::text as supabase_score_record_id,
          null::numeric as passing_score,
          session.transcript as full_transcript,
          null::jsonb as evaluation_payload,
          session.coaching_notes,
          session.trainer_verdict_status,
          session.trainer_verdict_notes,
          session.trainer_evaluated_by,
          session.trainer_evaluated_at,
          session.certificate_id,
          session.started_at,
          session.completed_at,
          session.created_at,
          session.updated_at
        from public.sim_session as session;
      $view$;
    end if;

    execute $view$
      create or replace view public.call_simulation_recordings as
      select
        session.id,
        session.trainee_id,
        session.scenario_id,
        session.assignment_id,
        session.batch_id,
        session.audio_url as recording_url,
        session.audio_url as recording_path,
        session.audio_duration_seconds as call_duration_seconds,
        session.transcript,
        session.transcript_log,
        session.turn_logs,
        session.weighted_score as final_score,
        session.pass_fail,
        session.attempt_number,
        greatest(coalesce(session.attempt_number, 1) - 1, 0) as retake_count,
        session.started_at,
        session.completed_at,
        session.created_at,
        session.updated_at
      from public.sim_session as session
      where session.audio_url is not null;
    $view$;
  end if;

  if to_regclass('public.call_simulation_scores') is not null then
    if to_regclass('public.sim_session') is not null then
      execute $view$
        create or replace view public.call_simulation_ai_evaluations as
        select
          score.id,
          score.session_id,
          score.scenario_id,
          score.call_scenario_id,
          score.trainee_id,
          score.trainee_name,
          score.scenario_topic,
          score.total_score,
          score.passing_score,
          score.is_passed,
          coalesce(score.full_transcript, session.transcript) as full_transcript,
          session.transcript_log,
          session.turn_logs,
          session.audio_url as recording_url,
          session.audio_duration_seconds as call_duration_seconds,
          session.attempt_number,
          greatest(coalesce(session.attempt_number, 1) - 1, 0) as retake_count,
          session.max_attempts,
          session.batch_id,
          session.assignment_id,
          session.coaching_notes,
          session.trainer_verdict_status,
          session.trainer_verdict_notes,
          session.completed_at,
          score.feedback_report as evaluation_payload,
          score.certificate_id,
          score.supabase_certificate_id,
          score.created_at,
          score.updated_at
        from public.call_simulation_scores as score
        left join public.sim_session as session
          on session.id::text = score.session_id::text;
      $view$;
    else
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
          null::jsonb as transcript_log,
          null::jsonb as turn_logs,
          null::text as recording_url,
          null::integer as call_duration_seconds,
          null::integer as attempt_number,
          0::integer as retake_count,
          null::integer as max_attempts,
          null::text as batch_id,
          null::text as assignment_id,
          null::text as coaching_notes,
          null::text as trainer_verdict_status,
          null::text as trainer_verdict_notes,
          null::timestamp as completed_at,
          feedback_report as evaluation_payload,
          certificate_id,
          supabase_certificate_id,
          created_at,
          updated_at
        from public.call_simulation_scores;
      $view$;
    end if;
  end if;

  if to_regclass('public.coaching_log') is not null then
    execute $view$
      create or replace view public.call_simulation_coaching_notes as
      select
        coaching.id,
        coaching.coaching_id,
        coaching.sim_session_id as session_id,
        coaching.trainer_id,
        coaching.trainee_id,
        coaching.batch_name,
        coaching.lob,
        coaching.coaching_minutes,
        coaching.strengths,
        coaching.opportunities,
        coaching.action_plan,
        coaching.target_date,
        coaching.status,
        coaching.competency_status,
        coaching.trainer_remarks,
        coaching.acknowledged_at,
        session.scenario_id,
        session.batch_id,
        session.audio_url as recording_url,
        session.transcript,
        session.attempt_number,
        session.pass_fail,
        session.trainer_verdict_status,
        session.completed_at,
        coaching.created_at,
        coaching.updated_at
      from public.coaching_log as coaching
      left join public.sim_session as session
        on session.id::text = coaching.sim_session_id::text;
    $view$;
  elsif to_regclass('public.coaching_logs') is not null then
    execute $view$
      create or replace view public.call_simulation_coaching_notes as
      select
        coaching.id,
        coaching.coaching_id,
        coaching.session_id,
        coaching.trainer_id,
        coaching.trainee_id,
        null::text as batch_name,
        null::text as lob,
        null::integer as coaching_minutes,
        coaching.strengths,
        coaching.opportunities,
        coaching.action_plan,
        coaching.target_date::timestamp as target_date,
        coaching.status,
        null::text as competency_status,
        null::text as trainer_remarks,
        coaching.acknowledged_at,
        session.scenario_id,
        session.batch_id,
        session.audio_url as recording_url,
        session.transcript,
        session.attempt_number,
        session.pass_fail,
        session.trainer_verdict_status,
        session.completed_at,
        coaching.created_at,
        coaching.updated_at
      from public.coaching_logs as coaching
      left join public.sim_session as session
        on session.id::text = coaching.session_id::text;
    $view$;
  end if;
end $$;
