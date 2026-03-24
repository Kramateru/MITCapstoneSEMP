-- Core Supabase schema for Speech-Enabled BPO Platform
-- Run in Supabase SQL Editor (adjust RLS/policies to your org rules).

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin','trainer','trainee')),
  lob text,
  language_dialect text default 'en-US',
  theme text default 'default',
  layout text default 'default',
  high_contrast boolean default false,
  big_font boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id uuid,
  audio_url text,
  transcript text,
  transcript_confidence numeric(5,4),
  pronunciation_score numeric(5,2),
  grammar_score numeric(5,2),
  fluency_score numeric(5,2),
  tone_score numeric(5,2),
  clarity_score numeric(5,2),
  keyword_adherence_score numeric(5,2),
  overall_score numeric(5,2),
  sentiment_score numeric(5,2),
  dead_air_seconds integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_training_sessions_user_id on public.training_sessions(user_id);
create index if not exists idx_training_sessions_created_at on public.training_sessions(created_at desc);

create table if not exists public.feedback_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  trainer_id uuid references public.profiles(id),
  source text not null default 'ai' check (source in ('ai','trainer')),
  sentiment_analysis jsonb default '{}'::jsonb,
  accuracy_percentage numeric(5,2),
  strengths text,
  opportunities text,
  action_plan text,
  status text default 'sent' check (status in ('draft','sent','acknowledged')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_feedback_logs_session_id on public.feedback_logs(session_id);
create index if not exists idx_feedback_logs_trainee_id on public.feedback_logs(trainee_id);

create table if not exists public.coaching_logs (
  id uuid primary key default gen_random_uuid(),
  coaching_id text unique not null,
  session_id uuid references public.training_sessions(id),
  trainee_id uuid not null references public.profiles(id),
  trainer_id uuid not null references public.profiles(id),
  strengths text,
  opportunities text,
  action_plan text,
  target_date date,
  status text not null default 'draft' check (status in ('draft','sent','acknowledged')),
  acknowledged_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.mcq_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  passing_threshold numeric(5,2) default 90,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.mcq_questions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.mcq_categories(id) on delete cascade,
  question_text text not null,
  options jsonb not null,
  correct_option text not null,
  explanation text,
  difficulty text default 'basic',
  kip_weight numeric(5,2) default 1,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.mcq_assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_id uuid not null references public.mcq_categories(id),
  question_ids uuid[] not null,
  assigned_by uuid not null references public.profiles(id),
  assigned_user_id uuid references public.profiles(id),
  assigned_batch text,
  due_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.mcq_submissions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.mcq_assessments(id) on delete cascade,
  trainee_id uuid not null references public.profiles(id),
  answers jsonb not null,
  score_percentage numeric(5,2) not null,
  is_passed boolean not null default false,
  submitted_at timestamptz default now(),
  unique (assessment_id, trainee_id)
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_no text unique not null,
  trainee_id uuid not null references public.profiles(id),
  trainer_id uuid not null references public.profiles(id),
  kip_score numeric(5,2) not null,
  status text not null default 'competent' check (status in ('competent','not_competent')),
  qr_token text unique not null,
  issued_at timestamptz default now()
);

-- Optional trigger helper for updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_feedback_logs_updated on public.feedback_logs;
create trigger trg_feedback_logs_updated before update on public.feedback_logs
for each row execute function public.set_updated_at();

drop trigger if exists trg_coaching_logs_updated on public.coaching_logs;
create trigger trg_coaching_logs_updated before update on public.coaching_logs
for each row execute function public.set_updated_at();

-- ==================== INTEGRATION ADDITIONS ====================

-- Helper role checks for RLS
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_trainer_or_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('trainer','admin')
  );
$$;

-- Training modules
create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists trg_training_modules_updated on public.training_modules;
create trigger trg_training_modules_updated before update on public.training_modules
for each row execute function public.set_updated_at();

-- Training logs (UI requirement: persist completed exercises)
create table if not exists public.training_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid references public.training_modules(id),
  session_id uuid references public.training_sessions(id) on delete set null,
  audio_url text,
  transcript text,
  accuracy_score numeric(5,2),
  created_at timestamptz default now()
);

create index if not exists idx_training_logs_user_id on public.training_logs(user_id);
create index if not exists idx_training_logs_created_at on public.training_logs(created_at desc);

-- Notifications for realtime UI updates
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb default '{}'::jsonb,
  is_read boolean default false,
  created_at timestamptz default now(),
  read_at timestamptz
);

create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_created_at on public.notifications(created_at desc);

-- Trigger: create notification when feedback is submitted
create or replace function public.notify_feedback_insert()
returns trigger
language plpgsql
as $$
begin
  insert into public.notifications (user_id, type, payload)
  values (
    new.trainee_id,
    'trainer_feedback',
    jsonb_build_object(
      'feedback_id', new.id,
      'session_id', new.session_id,
      'status', new.status
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_feedback_notify on public.feedback_logs;
create trigger trg_feedback_notify
after insert on public.feedback_logs
for each row execute function public.notify_feedback_insert();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.training_sessions enable row level security;
alter table public.feedback_logs enable row level security;
alter table public.coaching_logs enable row level security;
alter table public.training_modules enable row level security;
alter table public.training_logs enable row level security;
alter table public.notifications enable row level security;

-- RLS Policies: profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own_or_admin" on public.profiles;
create policy "profiles_insert_own_or_admin"
  on public.profiles for insert
  with check (auth.uid() = id or public.is_admin());

-- RLS Policies: training_sessions
drop policy if exists "training_sessions_select" on public.training_sessions;
create policy "training_sessions_select"
  on public.training_sessions for select
  using (auth.uid() = user_id or public.is_trainer_or_admin());

drop policy if exists "training_sessions_insert" on public.training_sessions;
create policy "training_sessions_insert"
  on public.training_sessions for insert
  with check (auth.uid() = user_id or public.is_trainer_or_admin());

drop policy if exists "training_sessions_update" on public.training_sessions;
create policy "training_sessions_update"
  on public.training_sessions for update
  using (auth.uid() = user_id or public.is_trainer_or_admin());

-- RLS Policies: feedback_logs
drop policy if exists "feedback_logs_select" on public.feedback_logs;
create policy "feedback_logs_select"
  on public.feedback_logs for select
  using (
    trainee_id = auth.uid()
    or trainer_id = auth.uid()
    or public.is_trainer_or_admin()
  );

drop policy if exists "feedback_logs_insert" on public.feedback_logs;
create policy "feedback_logs_insert"
  on public.feedback_logs for insert
  with check (public.is_trainer_or_admin());

drop policy if exists "feedback_logs_update" on public.feedback_logs;
create policy "feedback_logs_update"
  on public.feedback_logs for update
  using (
    public.is_trainer_or_admin()
    or trainee_id = auth.uid()
  );

-- RLS Policies: coaching_logs
drop policy if exists "coaching_logs_select" on public.coaching_logs;
create policy "coaching_logs_select"
  on public.coaching_logs for select
  using (
    trainee_id = auth.uid()
    or trainer_id = auth.uid()
    or public.is_trainer_or_admin()
  );

drop policy if exists "coaching_logs_insert" on public.coaching_logs;
create policy "coaching_logs_insert"
  on public.coaching_logs for insert
  with check (public.is_trainer_or_admin());

drop policy if exists "coaching_logs_update" on public.coaching_logs;
create policy "coaching_logs_update"
  on public.coaching_logs for update
  using (
    public.is_trainer_or_admin()
    or trainee_id = auth.uid()
  );

-- RLS Policies: training_modules
drop policy if exists "training_modules_select" on public.training_modules;
create policy "training_modules_select"
  on public.training_modules for select
  using (auth.role() = 'authenticated');

drop policy if exists "training_modules_write" on public.training_modules;
create policy "training_modules_write"
  on public.training_modules for insert
  with check (public.is_trainer_or_admin());

-- RLS Policies: training_logs
drop policy if exists "training_logs_select" on public.training_logs;
create policy "training_logs_select"
  on public.training_logs for select
  using (auth.uid() = user_id or public.is_trainer_or_admin());

drop policy if exists "training_logs_insert" on public.training_logs;
create policy "training_logs_insert"
  on public.training_logs for insert
  with check (auth.uid() = user_id);

-- RLS Policies: notifications
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update"
  on public.notifications for update
  using (auth.uid() = user_id);

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert"
  on public.notifications for insert
  with check (public.is_trainer_or_admin());

-- Add realtime publication entries if missing
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feedback_logs'
  ) then
    alter publication supabase_realtime add table public.feedback_logs;
  end if;
end;
$$;
