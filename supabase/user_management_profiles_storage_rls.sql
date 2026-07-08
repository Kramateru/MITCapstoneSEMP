-- User Management profile and storage setup.
-- Run in the Supabase SQL Editor for the project.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  role text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  );
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own_or_admin" on public.profiles;
create policy "profiles_insert_own_or_admin"
  on public.profiles
  for insert
  with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles
  for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-pictures',
  'profile-pictures',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_pictures_public_read" on storage.objects;
create policy "profile_pictures_public_read"
  on storage.objects
  for select
  using (bucket_id = 'profile-pictures');

drop policy if exists "profile_pictures_insert_own_or_admin" on storage.objects;
create policy "profile_pictures_insert_own_or_admin"
  on storage.objects
  for insert
  with check (
    bucket_id = 'profile-pictures'
    and (
      split_part(name, '/', 2) = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "profile_pictures_update_own_or_admin" on storage.objects;
create policy "profile_pictures_update_own_or_admin"
  on storage.objects
  for update
  using (
    bucket_id = 'profile-pictures'
    and (
      split_part(name, '/', 2) = auth.uid()::text
      or public.is_admin()
    )
  )
  with check (
    bucket_id = 'profile-pictures'
    and (
      split_part(name, '/', 2) = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "profile_pictures_delete_own_or_admin" on storage.objects;
create policy "profile_pictures_delete_own_or_admin"
  on storage.objects
  for delete
  using (
    bucket_id = 'profile-pictures'
    and (
      split_part(name, '/', 2) = auth.uid()::text
      or public.is_admin()
    )
  );
