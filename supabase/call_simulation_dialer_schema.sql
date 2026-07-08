-- Dialer-mode add-on schema for Call Simulation.
-- This supplements the existing call_simulation_schema.sql with
-- trainer-authored scenario metadata and Supabase score persistence.

create extension if not exists pgcrypto;

create or replace function public.set_call_simulation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.call_scenarios (
  id uuid primary key default gen_random_uuid(),
  source_scenario_id text,
  title text,
  description text,
  topic text not null,
  trainer_id uuid references public.profiles(id) on delete set null,
  target_kpis jsonb not null default '{}'::jsonb,
  script_flow jsonb not null default '[]'::jsonb,
  ringer_audio_url text,
  hold_audio_url text,
  difficulty text,
  estimated_duration_seconds integer,
  passing_score numeric(6,2) not null default 80,
  is_published boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.call_scenarios
  add column if not exists source_scenario_id text;

alter table public.call_scenarios
  add column if not exists title text;

alter table public.call_scenarios
  add column if not exists description text;

alter table public.call_scenarios
  add column if not exists ringer_audio_url text;

alter table public.call_scenarios
  add column if not exists hold_audio_url text;

alter table public.call_scenarios
  add column if not exists difficulty text;

alter table public.call_scenarios
  add column if not exists estimated_duration_seconds integer;

alter table public.call_scenarios
  add column if not exists passing_score numeric(6,2) not null default 80;

alter table public.call_scenarios
  add column if not exists is_published boolean not null default true;

alter table public.call_scenarios
  add column if not exists is_active boolean not null default true;

alter table public.call_scenarios
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.call_simulation_scores (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  scenario_id text not null,
  call_scenario_id uuid references public.call_scenarios(id) on delete set null,
  trainee_id text not null,
  trainee_name text,
  scenario_topic text,
  total_score numeric(6,2) not null default 0,
  passing_score numeric(6,2) not null default 80,
  is_passed boolean not null default false,
  aht_seconds integer not null default 0,
  speech_accuracy numeric(6,2) not null default 0,
  grammar_score numeric(6,2) not null default 0,
  pronunciation_score numeric(6,2) not null default 0,
  pacing_score numeric(6,2) not null default 0,
  empathy_count integer not null default 0,
  probing_count integer not null default 0,
  sentiment_score numeric(6,2) not null default 0,
  rate_of_speech numeric(8,2) not null default 0,
  dead_air_seconds numeric(8,2) not null default 0,
  transcript_log jsonb not null default '[]'::jsonb,
  turn_logs jsonb not null default '[]'::jsonb,
  full_transcript text,
  script_comparison_log jsonb not null default '[]'::jsonb,
  feedback_report jsonb not null default '{}'::jsonb,
  certificate_id text,
  supabase_certificate_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.call_simulation_scores
  add column if not exists scenario_topic text;

alter table public.call_simulation_scores
  add column if not exists full_transcript text;

alter table public.call_simulation_scores
  add column if not exists script_comparison_log jsonb not null default '[]'::jsonb;

alter table public.call_simulation_scores
  add column if not exists supabase_certificate_id uuid;

create table if not exists public.call_simulation_certificates (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  scenario_id text not null,
  call_scenario_id uuid references public.call_scenarios(id) on delete set null,
  trainee_id text not null,
  trainee_name text,
  scenario_topic text,
  total_score numeric(6,2) not null default 0,
  passing_score numeric(6,2) not null default 80,
  certificate_title text not null default 'Call Simulation Certificate of Competency',
  feedback_report jsonb not null default '{}'::jsonb,
  local_certificate_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_call_scenarios_topic
  on public.call_scenarios (topic);

create unique index if not exists idx_call_scenarios_source_scenario_id
  on public.call_scenarios (source_scenario_id);

create index if not exists idx_call_scenarios_status
  on public.call_scenarios (is_published, is_active, updated_at desc);

create index if not exists idx_call_simulation_scores_scenario
  on public.call_simulation_scores (scenario_id, created_at desc);

create index if not exists idx_call_simulation_scores_trainee
  on public.call_simulation_scores (trainee_id, created_at desc);

create index if not exists idx_call_simulation_certificates_trainee
  on public.call_simulation_certificates (trainee_id, created_at desc);

drop trigger if exists trg_call_scenarios_updated_at on public.call_scenarios;
create trigger trg_call_scenarios_updated_at
before update on public.call_scenarios
for each row execute function public.set_call_simulation_updated_at();

drop trigger if exists trg_call_simulation_scores_updated_at on public.call_simulation_scores;
create trigger trg_call_simulation_scores_updated_at
before update on public.call_simulation_scores
for each row execute function public.set_call_simulation_updated_at();

drop trigger if exists trg_call_simulation_certificates_updated_at on public.call_simulation_certificates;
create trigger trg_call_simulation_certificates_updated_at
before update on public.call_simulation_certificates
for each row execute function public.set_call_simulation_updated_at();
