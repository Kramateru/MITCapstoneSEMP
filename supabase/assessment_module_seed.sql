with trainer as (
  select id, full_name
  from public."user"
  where role::text = 'trainer'
  order by created_at
  limit 1
),
sample_batch as (
  select id
  from public.batch
  where is_active = true
  order by created_at
  limit 1
),
inserted_category as (
  insert into public.training_assessment_categories (
    title,
    description,
    passing_score,
    created_by
  )
  select
    'Customer Empathy Foundations',
    'Core empathy, acknowledgement, and resolution language checks for trainee onboarding.',
    80,
    trainer.id
  from trainer
  where not exists (
    select 1
    from public.training_assessment_categories
    where lower(title) = lower('Customer Empathy Foundations')
      and created_by = trainer.id
  )
  returning id, created_by
),
category_ref as (
  select id, created_by from inserted_category
  union all
  select categories.id, categories.created_by
  from public.training_assessment_categories as categories
  join trainer on trainer.id = categories.created_by
  where lower(categories.title) = lower('Customer Empathy Foundations')
  limit 1
),
inserted_assessment as (
  insert into public.training_assessments (
    category_id,
    title,
    description,
    type,
    sort_order
  )
  select
    category_ref.id,
    'Empathy Checkpoint A',
    'A mixed assessment that checks empathy statements and concise call handling.',
    'mixed',
    0
  from category_ref
  where not exists (
    select 1
    from public.training_assessments
    where category_id = category_ref.id
      and lower(title) = lower('Empathy Checkpoint A')
  )
  returning id, category_id
),
assessment_ref as (
  select id, category_id from inserted_assessment
  union all
  select assessments.id, assessments.category_id
  from public.training_assessments as assessments
  join category_ref on category_ref.id = assessments.category_id
  where lower(assessments.title) = lower('Empathy Checkpoint A')
  limit 1
)
insert into public.training_assessment_questions (
  assessment_id,
  question_text,
  question_type,
  options,
  correct_answer,
  explanation,
  order_index
)
select
  assessment_ref.id,
  seed.question_text,
  seed.question_type,
  seed.options,
  seed.correct_answer,
  seed.explanation,
  seed.order_index
from assessment_ref
cross join (
  values
    (
      'Which response best acknowledges the customer''s frustration before moving to a solution?',
      'multiple_choice',
      '["I understand how frustrating that must be, and I''m here to help fix it.","Calm down and let me finish checking the account.","That issue happens all the time with other customers.","I already know what the problem is, so just wait."]'::jsonb,
      'I understand how frustrating that must be, and I''m here to help fix it.',
      'The best answer acknowledges emotion and reassures the customer before the next troubleshooting step.',
      0
    ),
    (
      'Fill in the blank: "I completely ____ your concern, and I will stay on the line until we sort this out."',
      'fill_blank',
      '[]'::jsonb,
      'understand',
      'The expected empathy verb is "understand". The live module compares fill-in answers using lower-case trimmed text.',
      1
    ),
    (
      'Which option is the strongest ownership statement?',
      'multiple_choice',
      '["I will personally review your account and update you within five minutes.","Someone from the next team will probably email you later.","You need to contact billing because I cannot help.","If the system works, this should fix itself."]'::jsonb,
      'I will personally review your account and update you within five minutes.',
      'Ownership language makes the trainee accountable for the next action and timeline.',
      2
    )
) as seed(question_text, question_type, options, correct_answer, explanation, order_index)
where not exists (
  select 1
  from public.training_assessment_questions as questions
  where questions.assessment_id = assessment_ref.id
    and questions.order_index = seed.order_index
);

insert into public.training_assessment_assignments (
  category_id,
  batch_id,
  assigned_by,
  due_at
)
select
  category_ref.id,
  sample_batch.id,
  category_ref.created_by,
  timezone('utc', now()) + interval '7 days'
from category_ref
join sample_batch on true
where not exists (
  select 1
  from public.training_assessment_assignments as assignments
  where assignments.category_id = category_ref.id
    and assignments.batch_id = sample_batch.id
    and assignments.is_active = true
);
