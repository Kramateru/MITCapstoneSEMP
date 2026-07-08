create or replace function public.training_assessment_is_admin(user_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public."user" as platform_user
    where platform_user.id = user_id
      and platform_user.role = 'ADMIN'
  );
$$;

alter table public.training_assessment_categories
  alter column passing_score set default 90;

alter table public.training_assessment_assignments
  alter column passing_score set default 90;

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
);

drop policy if exists training_assessment_categories_manage on public.training_assessment_categories;
create policy training_assessment_categories_manage
on public.training_assessment_categories
for all
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or auth.uid()::text = created_by
)
with check (
  public.training_assessment_is_admin(auth.uid()::text)
  or auth.uid()::text = created_by
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
      )
  )
);

drop policy if exists training_assessments_manage on public.training_assessments;
create policy training_assessments_manage
on public.training_assessments
for all
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessments.category_id
      and categories.created_by = auth.uid()::text
  )
)
with check (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessments.category_id
      and categories.created_by = auth.uid()::text
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
      )
  )
);

drop policy if exists training_assessment_questions_manage on public.training_assessment_questions;
create policy training_assessment_questions_manage
on public.training_assessment_questions
for all
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessments as assessments
    join public.training_assessment_categories as categories
      on categories.id = assessments.category_id
    where assessments.id = training_assessment_questions.assessment_id
      and categories.created_by = auth.uid()::text
  )
)
with check (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessments as assessments
    join public.training_assessment_categories as categories
      on categories.id = assessments.category_id
    where assessments.id = training_assessment_questions.assessment_id
      and categories.created_by = auth.uid()::text
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
);

drop policy if exists training_assessment_assignments_manage on public.training_assessment_assignments;
create policy training_assessment_assignments_manage
on public.training_assessment_assignments
for all
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or auth.uid()::text = assigned_by
)
with check (
  public.training_assessment_is_admin(auth.uid()::text)
  or auth.uid()::text = assigned_by
);

drop policy if exists training_assessment_attempts_select on public.training_assessment_attempts;
create policy training_assessment_attempts_select
on public.training_assessment_attempts
for select
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or trainee_id = auth.uid()::text
  or exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessment_attempts.category_id
      and categories.created_by = auth.uid()::text
  )
);

drop policy if exists training_assessment_attempts_insert on public.training_assessment_attempts;
create policy training_assessment_attempts_insert
on public.training_assessment_attempts
for insert
with check (
  public.training_assessment_is_admin(auth.uid()::text)
  or trainee_id = auth.uid()::text
);

drop policy if exists training_assessment_attempts_update on public.training_assessment_attempts;
create policy training_assessment_attempts_update
on public.training_assessment_attempts
for update
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessment_attempts.category_id
      and categories.created_by = auth.uid()::text
  )
)
with check (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessment_attempts.category_id
      and categories.created_by = auth.uid()::text
  )
);

drop policy if exists training_assessment_coaching_notes_select on public.training_assessment_coaching_notes;
create policy training_assessment_coaching_notes_select
on public.training_assessment_coaching_notes
for select
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or trainer_id = auth.uid()::text
  or (trainee_id = auth.uid()::text and visibility = 'shared')
);

drop policy if exists training_assessment_coaching_notes_manage on public.training_assessment_coaching_notes;
create policy training_assessment_coaching_notes_manage
on public.training_assessment_coaching_notes
for all
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or trainer_id = auth.uid()::text
)
with check (
  public.training_assessment_is_admin(auth.uid()::text)
  or trainer_id = auth.uid()::text
);

drop policy if exists training_assessment_certificates_select on public.training_assessment_certificates;
create policy training_assessment_certificates_select
on public.training_assessment_certificates
for select
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or trainee_id = auth.uid()::text
  or exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessment_certificates.category_id
      and categories.created_by = auth.uid()::text
  )
);

drop policy if exists training_assessment_certificates_insert on public.training_assessment_certificates;
create policy training_assessment_certificates_insert
on public.training_assessment_certificates
for insert
with check (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessment_categories as categories
    where categories.id = training_assessment_certificates.category_id
      and categories.created_by = auth.uid()::text
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
);

drop policy if exists training_assessment_assignment_questions_manage on public.training_assessment_assignment_questions;
create policy training_assessment_assignment_questions_manage
on public.training_assessment_assignment_questions
for all
using (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessment_assignments as assignments
    join public.training_assessment_categories as categories
      on categories.id = assignments.category_id
    where assignments.id = training_assessment_assignment_questions.assignment_id
      and categories.created_by = auth.uid()::text
  )
)
with check (
  public.training_assessment_is_admin(auth.uid()::text)
  or exists (
    select 1
    from public.training_assessment_assignments as assignments
    join public.training_assessment_categories as categories
      on categories.id = assignments.category_id
    where assignments.id = training_assessment_assignment_questions.assignment_id
      and categories.created_by = auth.uid()::text
  )
);
