with seeded_categories(name) as (
  values
    ('Bereavement Empathy'),
    ('Plan Sales and Routing'),
    ('Accounts and Billing'),
    ('Claims and Documentation'),
    ('Operations and Platform Support')
),
seeded_category_ids as (
  select category.id
  from public.microlearning_topic_category as category
  join seeded_categories
    on lower(category.name) = lower(seeded_categories.name)
)
update public.microlearning_module
set
  topic_category_id = null,
  updated_at = timezone('utc', now())
where topic_category_id in (select id from seeded_category_ids);

with seeded_modules(title) as (
  values
    ('Bereavement First Response'),
    ('Active Listening for Grieving Families'),
    ('New Plan Inquiry Routing: St. Anne or St. Bernadette'),
    ('Payment Posting Update Script'),
    ('Death Claim Urgency Triage'),
    ('Beneficiary Verification Essentials'),
    ('Service Schedule Coordination Notes'),
    ('TTS-Safe Benefit Update Delivery'),
    ('Compassionate Document Request Phrases'),
    ('Speech Platform Issue Handoff')
)
update public.microlearning_module
set
  is_active = false,
  updated_at = timezone('utc', now())
where lower(title) in (
  select lower(seeded_modules.title)
  from seeded_modules
);

with seeded_categories(name) as (
  values
    ('Bereavement Empathy'),
    ('Plan Sales and Routing'),
    ('Accounts and Billing'),
    ('Claims and Documentation'),
    ('Operations and Platform Support')
)
update public.microlearning_topic_category
set
  is_active = false,
  updated_at = timezone('utc', now())
where lower(name) in (
  select lower(seeded_categories.name)
  from seeded_categories
);
