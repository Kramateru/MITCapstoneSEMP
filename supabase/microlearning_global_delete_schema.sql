-- Global delete backfill for microlearning modules.
-- App schema mapping:
--   modules -> public.microlearning_module
--   branch_assignments / trainee_progress / trainee_scores -> public.microlearning_assignment
--   accomplishments -> public.certificate_record (cleaned in application logic because source_id is polymorphic)

do $$
declare
  existing_constraint text;
begin
  if to_regclass('public.microlearning_assignment') is null then
    return;
  end if;

  select tc.constraint_name
    into existing_constraint
  from information_schema.table_constraints as tc
  join information_schema.key_column_usage as kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'microlearning_assignment'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'module_id'
  limit 1;

  if existing_constraint is not null then
    execute format(
      'alter table public.microlearning_assignment drop constraint %I',
      existing_constraint
    );
  end if;

  execute '
    alter table public.microlearning_assignment
    add constraint microlearning_assignment_module_id_fkey
    foreign key (module_id)
    references public.microlearning_module(id)
    on delete cascade
  ';

  execute '
    create index if not exists idx_microlearning_assignment_module_id
      on public.microlearning_assignment (module_id)
  ';
end $$;

-- audio_content already points to microlearning_module(id) with ON DELETE CASCADE,
-- but this keeps the relationship explicit in one migration set.
do $$
declare
  audio_constraint text;
begin
  if to_regclass('public.audio_content') is null then
    return;
  end if;

  select tc.constraint_name
    into audio_constraint
  from information_schema.table_constraints as tc
  join information_schema.key_column_usage as kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'audio_content'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'module_id'
  limit 1;

  if audio_constraint is not null then
    execute format(
      'alter table public.audio_content drop constraint %I',
      audio_constraint
    );
  end if;

  execute '
    alter table public.audio_content
    add constraint audio_content_module_id_fkey
    foreign key (module_id)
    references public.microlearning_module(id)
    on delete cascade
  ';
end $$;
