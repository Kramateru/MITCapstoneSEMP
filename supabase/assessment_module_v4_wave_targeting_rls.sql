create or replace function public.training_assessment_is_admin(user_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public."user" as platform_user
    where platform_user.id = user_id
      and lower(platform_user.role) = 'admin'
  );
$$;

alter table public.training_assessment_assignments
  add column if not exists target_scope text not null default 'batch'
    check (target_scope in ('batch', 'wave', 'trainee')),
  add column if not exists wave_number integer
    check (wave_number is null or wave_number > 0);

update public.training_assessment_assignments as assignments
set target_scope = case
  when assignments.trainee_id is not null then 'trainee'
  when assignments.wave_number is not null and assignments.batch_id is null then 'wave'
  else 'batch'
end;

update public.training_assessment_assignments as assignments
set wave_number = batch.wave_number
from public.batch
where assignments.batch_id = batch.id
  and assignments.wave_number is null;

create index if not exists idx_training_assessment_assignments_target_scope
  on public.training_assessment_assignments (target_scope, wave_number, batch_id, trainee_id);

drop policy if exists training_assessment_categories_select on public.training_assessment_categories;
create policy training_assessment_categories_select
on public.training_assessment_categories
for select
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or auth.uid()::text = created_by
  or exists (
    select 1
    from public.training_assessment_assignments as assignments
    left join public.batch_user as batch_user
      on batch_user.batch_id = assignments.batch_id
    where assignments.category_id = training_assessment_categories.id
      and assignments.is_active = true
      and (
        assignments.trainee_id = auth.uid()::text
        or batch_user.user_id = auth.uid()::text
      )
  )
  or exists (
    select 1
    from public.training_assessment_assignments as assignments
    join public.batch as trainee_batch
      on trainee_batch.wave_number = assignments.wave_number
     and trainee_batch.created_by = training_assessment_categories.created_by
    join public.batch_user as batch_user
      on batch_user.batch_id = trainee_batch.id
    where assignments.category_id = training_assessment_categories.id
      and assignments.is_active = true
      and assignments.target_scope = 'wave'
      and batch_user.user_id = auth.uid()::text
  )
);

drop policy if exists training_assessments_select on public.training_assessments;
create policy training_assessments_select
on public.training_assessments
for select
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessments.category_id
      and (
        categories.created_by = auth.uid()::text
        or exists (
          select 1
          from public.training_assessment_assignments as assignments
          left join public.batch_user as batch_user
            on batch_user.batch_id = assignments.batch_id
          where assignments.category_id = training_assessments.category_id
            and assignments.is_active = true
            and (
              assignments.trainee_id = auth.uid()::text
              or batch_user.user_id = auth.uid()::text
            )
        )
        or exists (
          select 1
          from public.training_assessment_assignments as assignments
          join public.batch as trainee_batch
            on trainee_batch.wave_number = assignments.wave_number
           and trainee_batch.created_by = categories.created_by
          join public.batch_user as batch_user
            on batch_user.batch_id = trainee_batch.id
          where assignments.category_id = training_assessments.category_id
            and assignments.is_active = true
            and assignments.target_scope = 'wave'
            and batch_user.user_id = auth.uid()::text
        )
      )
  )
);

drop policy if exists training_assessment_questions_select on public.training_assessment_questions;
create policy training_assessment_questions_select
on public.training_assessment_questions
for select
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessments as assessments
    join public.training_assessment_categories as categories
      on categories.id = assessments.category_id
    where assessments.id = training_assessment_questions.assessment_id
      and (
        categories.created_by = auth.uid()::text
        or exists (
          select 1
          from public.training_assessment_assignments as assignments
          left join public.batch_user as batch_user
            on batch_user.batch_id = assignments.batch_id
          where assignments.category_id = categories.id
            and assignments.is_active = true
            and (
              assignments.trainee_id = auth.uid()::text
              or batch_user.user_id = auth.uid()::text
            )
        )
        or exists (
          select 1
          from public.training_assessment_assignments as assignments
          join public.batch as trainee_batch
            on trainee_batch.wave_number = assignments.wave_number
           and trainee_batch.created_by = categories.created_by
          join public.batch_user as batch_user
            on batch_user.batch_id = trainee_batch.id
          where assignments.category_id = categories.id
            and assignments.is_active = true
            and assignments.target_scope = 'wave'
            and batch_user.user_id = auth.uid()::text
        )
      )
  )
);

drop policy if exists training_assessment_assignments_select on public.training_assessment_assignments;
create policy training_assessment_assignments_select
on public.training_assessment_assignments
for select
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or auth.uid()::text = assigned_by
  or trainee_id = auth.uid()::text
  or exists (
    select 1
    from public.batch_user as batch_user
    where batch_user.batch_id = training_assessment_assignments.batch_id
      and batch_user.user_id = auth.uid()::text
  )
  or exists (
    select 1
    from public.batch as trainee_batch
    join public.batch_user as batch_user
      on batch_user.batch_id = trainee_batch.id
    join public.training_assessment_categories as categories
      on categories.id = training_assessment_assignments.category_id
    where training_assessment_assignments.target_scope = 'wave'
      and trainee_batch.wave_number = training_assessment_assignments.wave_number
      and trainee_batch.created_by = categories.created_by
      and batch_user.user_id = auth.uid()::text
  )
);

drop policy if exists training_assessment_assignment_questions_select on public.training_assessment_assignment_questions;
create policy training_assessment_assignment_questions_select
on public.training_assessment_assignment_questions
for select
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessment_assignments as assignments
    join public.training_assessment_categories as categories
      on categories.id = assignments.category_id
    left join public.batch_user as batch_user
      on batch_user.batch_id = assignments.batch_id
    where assignments.id = training_assessment_assignment_questions.assignment_id
      and (
        categories.created_by = auth.uid()::text
        or assignments.trainee_id = auth.uid()::text
        or batch_user.user_id = auth.uid()::text
      )
  )
  or exists (
    select 1
    from public.training_assessment_assignments as assignments
    join public.training_assessment_categories as categories
      on categories.id = assignments.category_id
    join public.batch as trainee_batch
      on trainee_batch.wave_number = assignments.wave_number
     and trainee_batch.created_by = categories.created_by
    join public.batch_user as batch_user
      on batch_user.batch_id = trainee_batch.id
    where assignments.id = training_assessment_assignment_questions.assignment_id
      and assignments.target_scope = 'wave'
      and batch_user.user_id = auth.uid()::text
  )
);
