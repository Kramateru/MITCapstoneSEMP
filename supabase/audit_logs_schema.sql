-- Enterprise audit trail for the Speech Enabled BPO Platform.
-- Apply in Supabase SQL editor or through your migration workflow.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public."user"(id) on delete set null,
  user_name text null,
  user_email text null,
  role text null,
  action_type text not null,
  module_name text null,
  entity_type text null,
  entity_id text null,
  description text null,
  old_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  changed_fields jsonb not null default '[]'::jsonb,
  status text not null default 'success',
  severity text not null default 'info',
  ip_address text null,
  browser_info text null,
  device_type text null,
  batch_id uuid null,
  trainee_id uuid null,
  trainer_id uuid null,
  session_id text null,
  request_id text null,
  endpoint text null,
  http_method text null,
  http_status integer null,
  metadata_json jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create index if not exists ix_audit_logs_timestamp on public.audit_logs (timestamp desc);
create index if not exists ix_audit_logs_role on public.audit_logs (role);
create index if not exists ix_audit_logs_action_type on public.audit_logs (action_type);
create index if not exists ix_audit_logs_module_name on public.audit_logs (module_name);
create index if not exists ix_audit_logs_status on public.audit_logs (status);
create index if not exists ix_audit_logs_severity on public.audit_logs (severity);
create index if not exists ix_audit_logs_entity on public.audit_logs (entity_type, entity_id);
create index if not exists ix_audit_logs_user_id on public.audit_logs (user_id);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read"
on public.audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public."user" platform_user
    where platform_user.id = auth.uid()
      and platform_user.role::text in ('ADMIN', 'admin')
      and platform_user.is_active = true
  )
);

drop policy if exists "audit_logs_no_client_insert" on public.audit_logs;
create policy "audit_logs_no_client_insert"
on public.audit_logs
for insert
to authenticated
with check (false);

drop policy if exists "audit_logs_no_client_update" on public.audit_logs;
create policy "audit_logs_no_client_update"
on public.audit_logs
for update
to authenticated
using (false)
with check (false);

drop policy if exists "audit_logs_no_client_delete" on public.audit_logs;
create policy "audit_logs_no_client_delete"
on public.audit_logs
for delete
to authenticated
using (false);
