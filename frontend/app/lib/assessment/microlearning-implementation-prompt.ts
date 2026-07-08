export const MICROLEARNING_IMPLEMENTATION_PROMPT = `Develop a full-stack Microlearning module inside the current codebase and align it to the existing trainer, trainee, analytics, reporting, certificate, and Supabase flows.

Current stack and boundaries:
- Frontend: Next.js, React, Tailwind CSS.
- Backend: FastAPI, SQLAlchemy.
- Database/Auth/Storage/Realtime: Supabase.
- Existing trainer and trainee modules already exist. Extend them. Do not rebuild the platform from scratch.

Primary goal:
Build a production-ready microlearning experience for BPO training where trainer users can manage categories, author modules, upload supporting assets to Supabase, assign selected topics to batches or specific trainees, and track completion, passing score, certificates, reports, and analytics end to end.

Non-negotiable business rules:
- Supabase is the source of truth for microlearning categories, modules, assignments, progress, certificates, accomplishment history, reports, analytics, and uploaded assets.
- Topic categories must be created and managed by trainer users instead of being pre-seeded.
- Modules must be created and managed by trainer users instead of relying on a default seed pack.
- Trainers must be able to add, modify, and delete microlearning topic categories.
- Trainers must be able to select one or more microlearning topics and assign them to a selected batch that already has assigned trainees.
- Trainees must be able to open assigned microlearning modules, complete the activity, receive a passing score, and unlock the related certificate automatically.
- Passing microlearning completions must appear in trainee certificate navigation, trainee reports, trainee analytics, and trainer-facing reports.
- Trainer reporting must support progress per batch and per trainee.

Trainer experience requirements:
- Trainer can create, edit, archive, and review microlearning modules.
- Trainer can create, edit, and delete topic categories such as Language, Grammar, Tone and Empathy, Voice and Delivery, Process and Product, and Listening and Analysis.
- Trainer can upload module assets such as videos, audio files, and infographics to Supabase Storage.
- Trainer can assign selected modules to:
  - an entire batch
  - a specific trainee
- Trainer can review assignment status, completion percentage, passing state, certificate issuance, and averages.
- Trainer can view microlearning accomplishment reports by batch and by trainee.
- Trainer can view recent microlearning certificates from the same reporting workspace.

Trainee experience requirements:
- Trainee sees assigned microlearning modules in a dedicated microlearning hub.
- Trainee can open a module and complete all generated exercises.
- Trainee progress states must include assigned, in_progress, completed, and certified.
- If a module is a video, the practice prompt unlocks only after the video finishes.
- If a module is a flashcard, the trainee can flip the card before answering the mastery check.
- When the trainee completes all exercises and reaches the passing score, the module becomes certified and the certificate is created automatically.
- The accomplishment must appear in the trainee reports area, analytics, and certificate navigation without manual admin work.

Supported module templates:
- Video
  - upload video to Supabase Storage
  - store a practice prompt
  - store required keywords
  - store a sample answer
- Quiz
  - store the customer question
  - store answer options
  - store the correct option
  - store option-level feedback
- Flashcard
  - store front and back content
  - store a mastery prompt
  - store required keywords
  - store a mastery answer
- Infographic
  - upload infographic image to Supabase Storage
  - store power phrases
  - store wall phrases
  - store a reflection prompt
  - store a sample answer
- Case Study
  - upload audio if provided
  - store transcript
  - store root-cause question, options, and answer
  - store corrective analysis prompt
  - store sample answer

Seed content requirements:
- Create at least 10 default modules with answers.
- Include these default themes:
  - HEARD De-escalation Toolkit
  - Robotic vs Empathetic Tone
  - API Reset Playbook
  - Power Phrases vs Wall Phrases
  - 1-Star Review Recovery Analysis
  - Grammar Rescue: Subject-Verb Agreement
  - Escalation Update Sentence Builder
  - Technical Term Pronunciation Drill
  - Active Listening Power Phrase Board
  - Billing Dispute Root Cause Review

Required persistence model:
- TopicCategory
  - id
  - name
  - slug
  - description
  - created_by
  - is_active
- MicrolearningModule
  - id
  - title
  - description
  - category
  - module_type
  - duration_minutes
  - passing_score
  - skill_focus
  - content_url
  - content_data JSON
  - exercises JSON
  - difficulty
  - assessment_method_id optional
  - topic_category_id optional
  - created_by
  - is_active
- MicrolearningAssignment
  - id
  - module_id
  - trainee_id
  - assigned_by
  - batch_id optional
  - due_date
  - notes
  - is_mandatory
  - status
  - completion_percentage
  - completed_exercises
  - responses JSON
  - certificate_id optional
  - assigned_at
  - completed_at

Scoring and certification rules:
- Exercises generated from content_data must be saved with the module.
- Multiple choice questions score against the correct option.
- Keyword-response exercises score by matched required keywords.
- Module completion percentage must come from completed exercise count.
- A module is passed only when all exercises are completed and the average score is at least the passing score.
- When passed, automatically issue a certificate record linked to the assignment.
- The microlearning certificate must appear beside other platform certificates.

Reporting and analytics requirements:
- Trainer overview:
  - total categories
  - total modules
  - total assignments
  - completed count
  - certified count
  - average score
  - pass rate
- Trainer batch progress:
  - batch label
  - trainee count
  - assignment count
  - completed count
  - certified count
  - average score
  - pass rate
- Trainer trainee progress:
  - trainee name
  - batch label
  - assignment count
  - completed count
  - certified count
  - average score
  - pass rate
- Trainee report:
  - assignment count
  - in-progress count
  - completed count
  - certified count
  - average score
  - pass rate
  - topic progress
  - recent certificates
  - accomplishment history

Required deliverables:
- Backend trainer APIs for category CRUD, module CRUD, asset upload, assignment creation, and trainer microlearning reporting.
- Backend trainee APIs for assignment listing, module detail, exercise submission, progress refresh, microlearning report generation, and automatic certificate award.
- Frontend trainer microlearning studio for categories, modules, assignments, certificates, and per-batch or per-trainee progress.
- Frontend trainee microlearning hub for opening modules, answering exercises, tracking progress, and seeing certificate unlock state.
- Supabase-compatible SQL or maintenance artifacts for cleaning up legacy sample categories and modules.
- Documentation that explains that trainer-created categories and modules are saved into the active Supabase database.

Acceptance criteria:
- Trainer can add, edit, and delete microlearning topic categories.
- Trainer can create and save microlearning modules into Supabase-backed persistence.
- Trainer can assign selected modules to a batch with trainees or to a specific trainee.
- Trainee can access assigned modules, complete the exercises, and receive a passing score.
- Passing microlearning modules automatically appear in trainee certificates.
- Microlearning accomplishment appears in trainee report and analytics views.
- Trainer can view microlearning progress per batch and per trainee.
- Uploaded media assets for microlearning authoring use Supabase Storage in configured environments.`

export function getMicrolearningImplementationPrompt() {
  return MICROLEARNING_IMPLEMENTATION_PROMPT
}
