-- Single active login session tracking.
-- Run this in the Supabase SQL editor for existing deployments.

create table if not exists public.user_session (
  id uuid primary key default gen_random_uuid(),
  user_id varchar(36) not null references public."user"(id) on delete cascade,
  session_id varchar(128) not null unique,
  login_time timestamptz not null default now(),
  last_activity timestamptz not null default now(),
  browser_info text,
  device_info text,
  ip_address varchar(64),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_session_user_id
  on public.user_session(user_id);

create index if not exists idx_user_session_session_id
  on public.user_session(session_id);

create index if not exists idx_user_session_last_activity
  on public.user_session(last_activity desc);

create unique index if not exists uq_user_session_one_active_per_user
  on public.user_session(user_id)
  where is_active = true;

create or replace function public.set_user_session_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_session_updated_at on public.user_session;
create trigger trg_user_session_updated_at
before update on public.user_session
for each row execute function public.set_user_session_updated_at();
