create extension if not exists pgcrypto;

create or replace function public.seed_bpo_microlearning_pack(target_trainer text)
returns jsonb
language plpgsql
as $$
declare
  resolved_trainer_id text;
  categories_seeded integer := 0;
  modules_created integer := 0;
  modules_updated integer := 0;
begin
  select "user".id
  into resolved_trainer_id
  from public."user"
  where "user".id = target_trainer
     or lower("user".email) = lower(target_trainer)
  order by
    case when lower("user".email) = lower(target_trainer) then 0 else 1 end,
    "user".created_at asc
  limit 1;

  if resolved_trainer_id is null then
    raise exception 'Trainer user not found for identifier: %', target_trainer;
  end if;

  with category_defs(name, slug, description) as (
    values
      ('Language Mastery', 'language-mastery', 'Grammar, sentence structure, and polished BPO communication.'),
      ('Tone and Empathy', 'tone-and-empathy', 'De-escalation, empathy cues, and customer-safe phrasing.'),
      ('Process and Product', 'process-and-product', 'Troubleshooting steps, process discipline, and product knowledge.'),
      ('Listening and Analysis', 'listening-and-analysis', 'Case review, issue diagnosis, and root-cause thinking.'),
      ('Voice and Delivery', 'voice-and-delivery', 'Pronunciation, pacing, and confident spoken delivery.')
  )
  insert into public.microlearning_topic_category (
    id,
    name,
    slug,
    description,
    created_by,
    is_active,
    created_at,
    updated_at
  )
  select
    gen_random_uuid()::text,
    defs.name,
    defs.slug,
    defs.description,
    resolved_trainer_id,
    true,
    timezone('utc', now()),
    timezone('utc', now())
  from category_defs as defs
  on conflict (created_by, slug) do update
    set
      name = excluded.name,
      description = excluded.description,
      is_active = true,
      updated_at = timezone('utc', now());

  get diagnostics categories_seeded = row_count;

  with module_defs(
    title,
    description,
    feedback_category,
    module_type,
    duration_minutes,
    passing_score,
    skill_focus,
    difficulty,
    topic_slug,
    content_data,
    content_url
  ) as (
    values
      (
        'HEARD De-escalation Toolkit',
        'A trainer video template that reinforces Hear, Empathize, Apologize, Resolve, and Diagnose.',
        'empathy',
        'video',
        5,
        80,
        'De-escalation language under pressure',
        'basic',
        'tone-and-empathy',
        $json${"practice_prompt":"A customer says, 'I have called three times and no one fixed this.' Deliver a calm HEARD-based response.","required_keywords":["understand","sorry","help","next step"],"sample_answer":"I understand how frustrating this has been, and I am sorry you had to repeat the concern. I will help you now and explain the next step clearly."}$json$::jsonb,
        null
      ),
      (
        'Robotic vs Empathetic Tone',
        'Spot which reply sounds human, calm, and supportive for a BPO call.',
        'empathy',
        'quiz',
        4,
        80,
        'Tone selection for upset customers',
        'basic',
        'tone-and-empathy',
        $json${"questions":[{"title":"Choose the strongest response","question":"The customer says, 'Your app locked me out before payroll.' Which response is best?","options":["That is our security process. Please wait for the reset email.","I understand how urgent that is. Let me help you regain access as quickly as possible.","Calm down. I just need you to follow the instructions."],"correct_option":"I understand how urgent that is. Let me help you regain access as quickly as possible.","option_feedback":{"That is our security process. Please wait for the reset email.":"This sounds procedural and does not acknowledge urgency.","I understand how urgent that is. Let me help you regain access as quickly as possible.":"Correct. It acknowledges the emotion and moves into action.","Calm down. I just need you to follow the instructions.":"This escalates the conversation and sounds dismissive."}}]}$json$::jsonb,
        null
      ),
      (
        'API Reset Playbook',
        'Flashcards for technical reset steps that agents explain to customers during support calls.',
        'clarity',
        'flashcard',
        6,
        75,
        'Explaining reset steps in the right order',
        'basic',
        'process-and-product',
        $json${"cards":[{"front":"How do you reset an API key?","back":"Open Security Settings, choose API Keys, select Reset, copy the new key, and save the change.","mastery_prompt":"Write the customer-facing explanation for resetting the API key.","required_keywords":["security settings","reset","new key","save"],"mastery_answer":"Please open Security Settings, choose API Keys, select Reset, copy the new key, and save the update."},{"front":"What should the customer do after receiving a 429 error?","back":"Slow the request rate, wait briefly, and retry with backoff to avoid another limit hit.","mastery_prompt":"Explain the safest next step after a 429 error.","required_keywords":["wait","retry","backoff"],"mastery_answer":"Please wait briefly and retry with backoff so the request rate stays within limit."}]}$json$::jsonb,
        null
      ),
      (
        'Power Phrases vs Wall Phrases',
        'An infographic template showing the difference between empathetic and blocking language.',
        'empathy',
        'infographic',
        3,
        80,
        'Replacing policy walls with power phrases',
        'basic',
        'tone-and-empathy',
        $json${"power_phrases":["I understand why that feels frustrating.","Thank you for your patience while I check this.","Let us fix this together."],"wall_phrases":["That is just our policy.","There is nothing I can do.","You should have read the terms."],"reflection_prompt":"Rewrite a wall phrase into a power phrase for a delayed refund case.","required_keywords":["understand","help","next step"],"sample_answer":"I understand the delay is frustrating, and I will help by checking the refund now and sharing the next step."}$json$::jsonb,
        null
      ),
      (
        '1-Star Review Recovery Analysis',
        'Review a poor customer interaction and identify the point where trust was lost.',
        'clarity',
        'case_study',
        7,
        80,
        'Root-cause analysis for call handling',
        'intermediate',
        'listening-and-analysis',
        $json${"transcript":"Customer: I waited twenty minutes and got disconnected twice. Agent: You need to hold because the system is slow. Customer: This is ridiculous.","root_cause_question":"What was the main reason the interaction collapsed?","root_cause_options":["The customer refused to cooperate.","The agent failed to acknowledge the frustration and used cold language.","The system outage automatically caused a 1-star review."],"root_cause_answer":"The agent failed to acknowledge the frustration and used cold language.","analysis_prompt":"Write the corrective response the agent should have used after the first complaint.","required_keywords":["understand","sorry","assist","next step"],"sample_answer":"I understand the wait has been frustrating, and I am sorry for the repeated disconnection. I will assist you now and explain the next step before we continue."}$json$::jsonb,
        null
      ),
      (
        'Grammar Rescue: Subject-Verb Agreement',
        'A grammar quiz focused on polished customer updates in a BPO environment.',
        'grammar',
        'quiz',
        4,
        80,
        'Professional grammar in status updates',
        'basic',
        'language-mastery',
        $json${"questions":[{"title":"Pick the grammatically correct sentence","question":"Which sentence should the agent send to the customer?","options":["Your refund have been processed and the confirmation email was send.","Your refund has been processed, and the confirmation email was sent.","Your refund has processed and the confirmation email send."],"correct_option":"Your refund has been processed, and the confirmation email was sent.","option_feedback":{"Your refund have been processed and the confirmation email was send.":"The sentence has agreement and tense errors.","Your refund has been processed, and the confirmation email was sent.":"Correct. The grammar and tense are both professional.","Your refund has processed and the confirmation email send.":"The structure is incomplete and the verbs are incorrect."}}]}$json$::jsonb,
        null
      ),
      (
        'Escalation Update Sentence Builder',
        'Flashcards that help trainees build cleaner escalation notes and update messages.',
        'grammar',
        'flashcard',
        5,
        75,
        'Clean escalation summaries',
        'intermediate',
        'language-mastery',
        $json${"cards":[{"front":"What should a strong escalation update include?","back":"The issue summary, the action taken, the current owner, and the next callback window.","mastery_prompt":"Draft a one-sentence escalation update for the customer.","required_keywords":["summary","action","owner","callback"],"mastery_answer":"Here is the summary, the action already taken, the current owner, and the callback window for the next update."}]}$json$::jsonb,
        null
      ),
      (
        'Technical Term Pronunciation Drill',
        'A short voice-delivery module centered on clear technical terms used in support calls.',
        'pronunciation',
        'video',
        4,
        80,
        'Pronouncing common technical support terms',
        'intermediate',
        'voice-and-delivery',
        $json${"practice_prompt":"Say a short response that includes authentication, verification, and configuration while staying calm and clear.","required_keywords":["authentication","verification","configuration"],"sample_answer":"I will guide you through authentication, verification, and configuration so the setup is completed correctly."}$json$::jsonb,
        null
      ),
      (
        'Active Listening Power Phrase Board',
        'An infographic module that trains agents to reflect customer concerns before solving.',
        'clarity',
        'infographic',
        3,
        75,
        'Reflective listening before action',
        'basic',
        'tone-and-empathy',
        $json${"power_phrases":["What I hear is that the outage is affecting your workday.","You need a stable fix before your next shift starts.","Let me confirm the issue before I change anything."],"wall_phrases":["You already told us that.","I am only following the script."],"reflection_prompt":"Write a reflective listening line for a customer whose payroll access is delayed.","required_keywords":["hear","delay","help"],"sample_answer":"What I hear is that the payroll delay is stressful, and I will help by checking the access issue now."}$json$::jsonb,
        null
      ),
      (
        'Billing Dispute Root Cause Review',
        'A case-study exercise for refund policy analysis and ownership language.',
        'empathy',
        'case_study',
        7,
        80,
        'Billing dispute analysis and recovery language',
        'intermediate',
        'listening-and-analysis',
        $json${"transcript":"Customer: I was charged twice for the same upgrade. Agent: You probably clicked the button twice. Customer: Are you blaming me?","root_cause_question":"Which coaching point should the trainer highlight first?","root_cause_options":["The agent should have escalated without speaking.","The agent blamed the customer instead of owning the review.","The agent used too much silence."],"root_cause_answer":"The agent blamed the customer instead of owning the review.","analysis_prompt":"Write the recovery line the agent should have used instead.","required_keywords":["review","sorry","check","resolve"],"sample_answer":"I am sorry for the confusion. I will review the billing details now, check the duplicate charge, and work toward a resolution with you."}$json$::jsonb,
        null
      )
  ),
  category_lookup as (
    select id, slug
    from public.microlearning_topic_category
    where created_by = resolved_trainer_id
  )
  update public.microlearning_module as existing
  set
    description = defs.description,
    category = defs.feedback_category::feedbacktype,
    type = defs.module_type,
    duration_minutes = defs.duration_minutes,
    content_data = defs.content_data,
    passing_score = defs.passing_score,
    skill_focus = defs.skill_focus,
    content_url = defs.content_url,
    exercises = '[]'::jsonb,
    difficulty = defs.difficulty::scenariodifficulty,
    assessment_method_id = null,
    topic_category_id = categories.id,
    is_active = true
  from module_defs as defs
  join category_lookup as categories
    on categories.slug = defs.topic_slug
  where existing.created_by = resolved_trainer_id
    and lower(existing.title) = lower(defs.title);

  get diagnostics modules_updated = row_count;

  with module_defs(
    title,
    description,
    feedback_category,
    module_type,
    duration_minutes,
    passing_score,
    skill_focus,
    difficulty,
    topic_slug,
    content_data,
    content_url
  ) as (
    values
      (
        'HEARD De-escalation Toolkit',
        'A trainer video template that reinforces Hear, Empathize, Apologize, Resolve, and Diagnose.',
        'empathy',
        'video',
        5,
        80,
        'De-escalation language under pressure',
        'basic',
        'tone-and-empathy',
        $json${"practice_prompt":"A customer says, 'I have called three times and no one fixed this.' Deliver a calm HEARD-based response.","required_keywords":["understand","sorry","help","next step"],"sample_answer":"I understand how frustrating this has been, and I am sorry you had to repeat the concern. I will help you now and explain the next step clearly."}$json$::jsonb,
        null
      ),
      (
        'Robotic vs Empathetic Tone',
        'Spot which reply sounds human, calm, and supportive for a BPO call.',
        'empathy',
        'quiz',
        4,
        80,
        'Tone selection for upset customers',
        'basic',
        'tone-and-empathy',
        $json${"questions":[{"title":"Choose the strongest response","question":"The customer says, 'Your app locked me out before payroll.' Which response is best?","options":["That is our security process. Please wait for the reset email.","I understand how urgent that is. Let me help you regain access as quickly as possible.","Calm down. I just need you to follow the instructions."],"correct_option":"I understand how urgent that is. Let me help you regain access as quickly as possible.","option_feedback":{"That is our security process. Please wait for the reset email.":"This sounds procedural and does not acknowledge urgency.","I understand how urgent that is. Let me help you regain access as quickly as possible.":"Correct. It acknowledges the emotion and moves into action.","Calm down. I just need you to follow the instructions.":"This escalates the conversation and sounds dismissive."}}]}$json$::jsonb,
        null
      ),
      (
        'API Reset Playbook',
        'Flashcards for technical reset steps that agents explain to customers during support calls.',
        'clarity',
        'flashcard',
        6,
        75,
        'Explaining reset steps in the right order',
        'basic',
        'process-and-product',
        $json${"cards":[{"front":"How do you reset an API key?","back":"Open Security Settings, choose API Keys, select Reset, copy the new key, and save the change.","mastery_prompt":"Write the customer-facing explanation for resetting the API key.","required_keywords":["security settings","reset","new key","save"],"mastery_answer":"Please open Security Settings, choose API Keys, select Reset, copy the new key, and save the update."},{"front":"What should the customer do after receiving a 429 error?","back":"Slow the request rate, wait briefly, and retry with backoff to avoid another limit hit.","mastery_prompt":"Explain the safest next step after a 429 error.","required_keywords":["wait","retry","backoff"],"mastery_answer":"Please wait briefly and retry with backoff so the request rate stays within limit."}]}$json$::jsonb,
        null
      ),
      (
        'Power Phrases vs Wall Phrases',
        'An infographic template showing the difference between empathetic and blocking language.',
        'empathy',
        'infographic',
        3,
        80,
        'Replacing policy walls with power phrases',
        'basic',
        'tone-and-empathy',
        $json${"power_phrases":["I understand why that feels frustrating.","Thank you for your patience while I check this.","Let us fix this together."],"wall_phrases":["That is just our policy.","There is nothing I can do.","You should have read the terms."],"reflection_prompt":"Rewrite a wall phrase into a power phrase for a delayed refund case.","required_keywords":["understand","help","next step"],"sample_answer":"I understand the delay is frustrating, and I will help by checking the refund now and sharing the next step."}$json$::jsonb,
        null
      ),
      (
        '1-Star Review Recovery Analysis',
        'Review a poor customer interaction and identify the point where trust was lost.',
        'clarity',
        'case_study',
        7,
        80,
        'Root-cause analysis for call handling',
        'intermediate',
        'listening-and-analysis',
        $json${"transcript":"Customer: I waited twenty minutes and got disconnected twice. Agent: You need to hold because the system is slow. Customer: This is ridiculous.","root_cause_question":"What was the main reason the interaction collapsed?","root_cause_options":["The customer refused to cooperate.","The agent failed to acknowledge the frustration and used cold language.","The system outage automatically caused a 1-star review."],"root_cause_answer":"The agent failed to acknowledge the frustration and used cold language.","analysis_prompt":"Write the corrective response the agent should have used after the first complaint.","required_keywords":["understand","sorry","assist","next step"],"sample_answer":"I understand the wait has been frustrating, and I am sorry for the repeated disconnection. I will assist you now and explain the next step before we continue."}$json$::jsonb,
        null
      ),
      (
        'Grammar Rescue: Subject-Verb Agreement',
        'A grammar quiz focused on polished customer updates in a BPO environment.',
        'grammar',
        'quiz',
        4,
        80,
        'Professional grammar in status updates',
        'basic',
        'language-mastery',
        $json${"questions":[{"title":"Pick the grammatically correct sentence","question":"Which sentence should the agent send to the customer?","options":["Your refund have been processed and the confirmation email was send.","Your refund has been processed, and the confirmation email was sent.","Your refund has processed and the confirmation email send."],"correct_option":"Your refund has been processed, and the confirmation email was sent.","option_feedback":{"Your refund have been processed and the confirmation email was send.":"The sentence has agreement and tense errors.","Your refund has been processed, and the confirmation email was sent.":"Correct. The grammar and tense are both professional.","Your refund has processed and the confirmation email send.":"The structure is incomplete and the verbs are incorrect."}}]}$json$::jsonb,
        null
      ),
      (
        'Escalation Update Sentence Builder',
        'Flashcards that help trainees build cleaner escalation notes and update messages.',
        'grammar',
        'flashcard',
        5,
        75,
        'Clean escalation summaries',
        'intermediate',
        'language-mastery',
        $json${"cards":[{"front":"What should a strong escalation update include?","back":"The issue summary, the action taken, the current owner, and the next callback window.","mastery_prompt":"Draft a one-sentence escalation update for the customer.","required_keywords":["summary","action","owner","callback"],"mastery_answer":"Here is the summary, the action already taken, the current owner, and the callback window for the next update."}]}$json$::jsonb,
        null
      ),
      (
        'Technical Term Pronunciation Drill',
        'A short voice-delivery module centered on clear technical terms used in support calls.',
        'pronunciation',
        'video',
        4,
        80,
        'Pronouncing common technical support terms',
        'intermediate',
        'voice-and-delivery',
        $json${"practice_prompt":"Say a short response that includes authentication, verification, and configuration while staying calm and clear.","required_keywords":["authentication","verification","configuration"],"sample_answer":"I will guide you through authentication, verification, and configuration so the setup is completed correctly."}$json$::jsonb,
        null
      ),
      (
        'Active Listening Power Phrase Board',
        'An infographic module that trains agents to reflect customer concerns before solving.',
        'clarity',
        'infographic',
        3,
        75,
        'Reflective listening before action',
        'basic',
        'tone-and-empathy',
        $json${"power_phrases":["What I hear is that the outage is affecting your workday.","You need a stable fix before your next shift starts.","Let me confirm the issue before I change anything."],"wall_phrases":["You already told us that.","I am only following the script."],"reflection_prompt":"Write a reflective listening line for a customer whose payroll access is delayed.","required_keywords":["hear","delay","help"],"sample_answer":"What I hear is that the payroll delay is stressful, and I will help by checking the access issue now."}$json$::jsonb,
        null
      ),
      (
        'Billing Dispute Root Cause Review',
        'A case-study exercise for refund policy analysis and ownership language.',
        'empathy',
        'case_study',
        7,
        80,
        'Billing dispute analysis and recovery language',
        'intermediate',
        'listening-and-analysis',
        $json${"transcript":"Customer: I was charged twice for the same upgrade. Agent: You probably clicked the button twice. Customer: Are you blaming me?","root_cause_question":"Which coaching point should the trainer highlight first?","root_cause_options":["The agent should have escalated without speaking.","The agent blamed the customer instead of owning the review.","The agent used too much silence."],"root_cause_answer":"The agent blamed the customer instead of owning the review.","analysis_prompt":"Write the recovery line the agent should have used instead.","required_keywords":["review","sorry","check","resolve"],"sample_answer":"I am sorry for the confusion. I will review the billing details now, check the duplicate charge, and work toward a resolution with you."}$json$::jsonb,
        null
      )
  ),
  category_lookup as (
    select id, slug
    from public.microlearning_topic_category
    where created_by = resolved_trainer_id
  )
  insert into public.microlearning_module (
    id,
    title,
    description,
    category,
    type,
    duration_minutes,
    content_data,
    passing_score,
    skill_focus,
    content_url,
    exercises,
    difficulty,
    assessment_method_id,
    topic_category_id,
    created_by,
    created_at,
    is_active
  )
  select
    gen_random_uuid()::text,
    defs.title,
    defs.description,
    defs.feedback_category::feedbacktype,
    defs.module_type,
    defs.duration_minutes,
    defs.content_data,
    defs.passing_score,
    defs.skill_focus,
    defs.content_url,
    '[]'::jsonb,
    defs.difficulty::scenariodifficulty,
    null,
    categories.id,
    resolved_trainer_id,
    timezone('utc', now()),
    true
  from module_defs as defs
  join category_lookup as categories
    on categories.slug = defs.topic_slug
  where not exists (
    select 1
    from public.microlearning_module as existing
    where existing.created_by = resolved_trainer_id
      and lower(existing.title) = lower(defs.title)
  );

  get diagnostics modules_created = row_count;

  return jsonb_build_object(
    'trainer_id', resolved_trainer_id,
    'categories_seeded', categories_seeded,
    'modules_created', modules_created,
    'modules_updated', modules_updated
  );
end;
$$;

-- Example usage:
-- select public.seed_bpo_microlearning_pack('trainer@st.peterville.edu.ph');
-- select public.seed_bpo_microlearning_pack('your-trainer-user-id');
