# Speech Enabled BPO Platform: Scope, Modules, Functions, and Limitations

## 1. Purpose of This Document

This document is a codebase-level analysis of the Speech Enabled BPO Platform based on the current implementation in:

- `frontend/app`
- `backend/routes`
- `backend/models.py`
- `backend/services`
- `backend/main.py`
- `supabase/single_active_sessions.sql`
- `README.md`

Its purpose is to explain the overall concept of the system, the major modules, how the business process works, what each user role can and cannot do, and the important technical and operational limitations that affect the platform.

This is not only a product description. It is also a functional map of how the program is currently structured.

## 2. System Concept

The Speech Enabled BPO Platform is a training, assessment, coaching, and certification system designed for BPO or customer-service style learning environments. It combines content delivery, speech-based practice, structured assessments, call simulations, analytics, coaching records, and certificates into one role-based platform.

At a concept level, the platform supports three main stages:

1. Content and scenario creation by Admins and Trainers
2. Assignment and completion of learning activities by Trainees
3. Review, scoring, coaching, analytics, and certification by Trainers and Admins

The platform is designed around three formal roles only:

- `Admin`
- `Trainer`
- `Trainee`

There is no separate first-class `Supervisor`, `QA`, or `Manager` role in the current backend role model. If those responsibilities are needed, they currently have to be handled through the existing Admin or Trainer roles.

## 3. Architecture at a Glance

### 3.1 Core Stack

- `Frontend`: Next.js application under `frontend/`
- `Backend`: FastAPI application under `backend/`
- `Database and Auth`: Supabase
- `ORM/Data Layer`: SQLAlchemy models
- `Storage`: Supabase Storage buckets for media and generated files
- `AI and Speech`: Gemini, local/browser TTS, speech assessment utilities, transcription services

### 3.2 Main Runtime Responsibilities

- The frontend provides role-based dashboards and workflows.
- The backend exposes API routes for authentication, training content, assessment logic, call simulation, analytics, certification, and settings.
- Supabase acts as the main production-grade storage layer for:
  - relational data
  - authentication/session coordination
  - uploaded files
  - generated audio
  - call recordings
- AI and speech services are used to support:
  - speech analysis
  - text-to-speech
  - coaching summaries
  - call simulation feedback

### 3.3 Storage Areas Mentioned in the Current Project

The current project expects these storage buckets:

- `microlearning-videos`
- `profile-pictures`
- `call-recordings`
- `call-ringers`
- `attachments`

### 3.4 System Design Pattern

The system is not a single-feature application. It is a training ecosystem with multiple engines working together:

- user and access management
- content authoring
- speech practice
- microlearning
- structured assessments
- mock call simulations
- coaching review
- certification
- analytics and reporting

Because of that, some modules overlap in purpose and use similar entities in different ways.

## 4. Role Model and Responsibility Boundaries

| Role | Primary Responsibility | Typical Ownership | Main Outcome |
| --- | --- | --- | --- |
| Admin | Governance, system setup, monitoring, master data, platform-wide control | Users, KPI rules, LOBs, certification settings, analytics, system settings | Keep the platform configured and compliant |
| Trainer | Training delivery, authoring, assignment, review, coaching | Batches, modules, assessments, call simulations, trainee feedback | Prepare trainees and evaluate performance |
| Trainee | Learning completion and performance improvement | Assigned modules, assigned assessments, assigned call simulations, self progress | Complete training and improve score/performance |

## 5. High-Level Functional Concept

The platform works as a closed training cycle:

1. Users are created and assigned a role.
2. Trainers or Admins create learning content and evaluation content.
3. Content is assigned to a trainee, batch, or learning group.
4. Trainees complete learning activities and submissions.
5. The system stores scores, transcripts, recordings, and progress.
6. Trainers review results and add coaching.
7. Admins and Trainers monitor performance through analytics and reports.
8. Certificates or competency decisions are issued when the criteria are met.

## 6. Important Architectural Realities

Before reading the modules, it is important to understand these implementation realities in the current system:

### 6.1 The Platform Contains Multiple Assessment Paths

The codebase currently contains more than one assessment style:

- `Speech practice assessment` using `PracticeSession`
- `Structured assessment CRUD` using `Assessment`, `AssessmentQuestion`, `AssessmentSubmission`
- `Assessment redesign workspace` under `/api/assessment-module`
- `MCQ certification workflow` under `/api/certification`

This means the word "assessment" can refer to different functional paths depending on the page and API used.

### 6.2 Scenario Data Is Reused Across More Than One Module

The `Scenario` and `ScenarioFlow` entities are used in more than one learning flow:

- speech practice
- branching scenario content
- call simulation

That makes scenarios a shared concept, not a single-purpose object.

### 6.3 There Are Primary Pages and Supporting or Legacy Pages

The frontend includes main sidebar pages plus additional support routes such as:

- `assessment-dashboard`
- `assessment-hub`
- `mcq`
- `authoring`
- `reviews`
- `status`
- `overview`

Some of these exist to support alternate workflows, older module versions, or more specialized operations beyond the main sidebar.

### 6.4 Production Behavior Depends Heavily on Supabase

Many features only fully work when Supabase is correctly configured:

- authentication
- profile synchronization
- storage uploads
- recording playback
- media asset delivery
- assignment persistence

## 7. Functional Module Catalog

### 7.1 Authentication and Session Management

**Purpose**

Controls login, access tokens, refresh tokens, current-user lookup, password changes, integration with Supabase-authenticated sessions, and strict single active session enforcement.

**Primary code areas**

- `backend/routes/auth_routes.py`
- `backend/routes/user_routes.py`
- `backend/services/session_service.py`
- `backend/auth_utils.py`
- `backend/models.py`
- `supabase/single_active_sessions.sql`
- `frontend/app/context/AuthContext.tsx`
- `frontend/app/login`
- `frontend/app/dashboard`

**Main functions**

- authenticate user credentials
- issue backend JWT access and refresh tokens
- generate and store a unique server-side `session_id`
- block a second active login for the same user account by default
- support configurable replacement behavior through `SINGLE_SESSION_MODE`
- validate the active `session_id` on protected backend requests
- update `last_activity` through frontend heartbeat tracking
- expire stale sessions after the configured inactivity timeout
- mark sessions inactive on logout
- optionally issue Supabase session tokens
- return active user profile
- refresh active session
- support password changes
- determine post-login routing by role

**Who uses it**

- Admin
- Trainer
- Trainee

**Core data involved**

- `User`
- `UserRole`
- `UserSession`
- backend JWT `session_id`
- Supabase-backed `user_session` rows

**Single active session behavior**

- Only one active `user_session` row is allowed per user account.
- Default mode is `SINGLE_SESSION_MODE=block`, which denies a new login when an active session already exists.
- The user-facing login error is: `Your account is already logged in on another device or browser. Please log out first.`
- If `SINGLE_SESSION_MODE=replace` is configured, the old active session is marked inactive and the new login is allowed.
- `STRICT_SINGLE_SESSION=false` allows multiple tabs in the same browser storage context while still blocking another browser or device.
- `STRICT_SINGLE_SESSION=true` stores auth state in tab-scoped session storage so separate tabs do not share the same local browser session.
- `SESSION_INACTIVITY_TIMEOUT_MINUTES` controls stale session recovery. The default documented value is 10 minutes.
- If the browser closes unexpectedly, the last heartbeat stops and the active session becomes reusable after the inactivity timeout.

**Key limitations**

- Login quality depends on correct Supabase and backend environment setup.
- Strict single-session enforcement depends on the backend database being reachable because Supabase/Postgres is the source of truth for `user_session`.
- Existing deployments must run `supabase/single_active_sessions.sql` or allow backend metadata creation to create the `user_session` table and unique active-session index.
- All protected modules depend on successful role resolution from authentication.
- Very recent duplicate login attempts are protected by the database unique active-session index, but operational reliability still depends on successful database transactions.
- Stale-session recovery is timeout-based. A crashed browser is not marked inactive instantly; it becomes reusable after the configured inactivity window.

### 7.2 User and Profile Management

**Purpose**

Manages user records, profile updates, role assignment, activation state, and profile image handling.

**Primary code areas**

- `backend/routes/user_routes.py`
- `backend/routes/admin_routes.py`
- `frontend/app/admin/users`
- trainer and trainee settings/profile pages

**Main functions**

- create users
- update users
- activate or deactivate users
- update self profile
- upload or replace profile image
- validate unique emails
- synchronize platform users to Supabase auth

**Who uses it**

- Admin for platform-wide user management
- Trainer in limited trainee-related operations
- Trainee for own profile only

**Core data involved**

- `User`
- profile image storage objects

**Key limitations**

- There are only three formal roles in the data model.
- Any organization-specific role expansion would require backend model and authorization changes.
- Profile image management depends on Supabase Storage availability.

### 7.3 Admin Governance and Master Data

**Purpose**

Provides platform-wide control over reference data, KPI configuration, system monitoring, user oversight, and global training settings.

**Primary code areas**

- `backend/routes/admin_routes.py`
- `frontend/app/admin/dashboard`
- `frontend/app/admin/analytics`
- `frontend/app/admin/reports`
- `frontend/app/admin/users`
- `frontend/app/admin/certification-settings`
- `frontend/app/admin/configuration`
- `frontend/app/admin/lob`
- `frontend/app/admin/scenarios`
- `frontend/app/admin/scenario-flow`
- `frontend/app/admin/tree-builder`

**Main functions**

- manage users and roles
- manage line of business records
- configure platform KPI settings
- review system logs and broad training performance
- maintain assessment categories and certain learning references
- manage certification settings
- access platform-level reports

**Who uses it**

- Admin

**Core data involved**

- `User`
- `LineOfBusiness`
- `KPIConfiguration`
- `SystemLog`
- `CertificationSettings`
- `AssessmentCategory`

**Key limitations**

- Admin is the only truly platform-wide governing role.
- Admin pages exist beyond the default sidebar, so not all available admin tooling is obvious from first navigation.
- Some admin surfaces appear to support deeper configuration than the average operational workflow requires.

### 7.4 Batch, Course, and Delivery Management

**Purpose**

Groups trainees into manageable training units and allows assignment of courses, modules, and performance monitoring by trainer.

**Primary code areas**

- `backend/routes/trainer_routes.py`
- `frontend/app/trainer/users`
- `frontend/app/trainer/batches`
- `frontend/app/trainer/courses`
- `frontend/app/trainer/assign`

**Main functions**

- create and manage batches
- assign trainees to batches
- create and manage courses
- assign courses and content to trainees or groups
- monitor batch participation and progress

**Who uses it**

- Trainer
- Admin for visibility and governance

**Core data involved**

- `Batch`
- `Course`
- `CourseAssignment`
- batch-user association tables

**Key limitations**

- Many downstream permissions depend on batch ownership or batch membership.
- Analytics, assignment visibility, and reporting often rely on correct trainer-to-batch and trainee-to-batch relationships.

### 7.5 Scenario Management and Branching Flow

**Purpose**

Provides authoring for scenario-based training content, including prompts, expected replies, branching logic, step order, and publishing state.

**Primary code areas**

- `backend/routes/scenario_routes.py`
- `frontend/app/admin/scenarios`
- `frontend/app/admin/scenario-flow`
- `frontend/app/admin/tree-builder`
- related trainer and practice flows that consume scenario data

**Main functions**

- create scenarios
- edit scenario metadata
- define ordered scenario steps
- set prompt text and optional audio
- set expected responses and expected keywords
- define branching or jump logic
- publish or keep scenarios as draft

**Who uses it**

- Primarily Admin in the generic scenario authoring route
- Trainer in call-simulation-specific scenario authoring workflows
- Trainee as consumer only

**Core data involved**

- `Scenario`
- `ScenarioFlow`

**Key limitations**

- Scenario authoring is split between generic scenario routes and call-simulation-specific flows.
- Shared scenario usage across practice and call simulation increases reuse but also increases complexity.
- Draft versus published visibility differs by role.

### 7.6 Workspace NLP Configuration

**Purpose**

Allows trainers or admins to define the language quality rules and conversational guidance used in workspaces or evaluation contexts.

**Primary code areas**

- `backend/routes/workspace_routes.py`
- `frontend/app/trainer/workspace`
- `frontend/app/workspace/[workspaceId]`

**Main functions**

- create trainer workspaces
- define empathy statements
- define probing questions
- define forbidden words
- define required keywords
- configure confidence thresholds and language settings

**Who uses it**

- Trainer
- Admin

**Core data involved**

- `Workspace`
- workspace NLP configuration JSON

**Key limitations**

- This module is configuration-oriented and supports other modules more than it acts as a standalone learning destination.
- Trainer access is limited to the workspaces assigned to or created by that trainer.

### 7.7 Speech Practice and Pronunciation Assessment

**Purpose**

Evaluates spoken trainee responses against scenario prompts and scoring criteria such as pronunciation, fluency, clarity, keyword adherence, and soft skills.

**Primary code areas**

- `backend/routes/assessment_routes.py`
- `backend/routes/trainee_routes.py`
- `frontend/app/trainee/overview`
- `frontend/app/trainee/status`
- related session review pages

**Main functions**

- create practice sessions
- upload or reference speech recordings
- store transcription
- calculate speech-related scores
- allow trainer review and score updates
- attach feedback to sessions
- maintain attempt history

**Who uses it**

- Trainee for submission
- Trainer and Admin for review

**Core data involved**

- `PracticeSession`
- `Feedback`
- `Scenario`

**Key limitations**

- Score quality depends on audio quality and speech analysis accuracy.
- Microphone quality, environment noise, and speaking pace affect results.
- This module overlaps conceptually with other assessment modules but uses its own session-centric data model.

### 7.8 Microlearning Module

**Purpose**

Delivers short-form training modules that can be assigned to trainees, completed with progress tracking, and potentially tied to certification outcomes.

**Primary code areas**

- `backend/routes/microlearning_routes.py`
- `backend/routes/trainer_routes.py`
- `backend/routes/trainee_routes.py`
- `frontend/app/trainer/microlearning`
- `frontend/app/trainee/microlearning`

**Main functions**

- create microlearning modules
- define content type and category
- upload media assets
- generate or attach transcripts and captions
- assign modules to batches or trainees
- track completion percentage
- manage flashcard or exercise states
- handle retakes where supported
- issue certificates where criteria are satisfied

**Who uses it**

- Trainer for authoring and assignment
- Trainee for consumption and completion
- Admin for oversight

**Core data involved**

- `MicrolearningModule`
- `MicrolearningAssignment`
- `MicrolearningTopicCategory`
- `MicrolearningAssessmentMethod`
- `MicrolearningUploadedAsset`
- `CertificateRecord`

**Key limitations**

- Asset handling depends on working storage buckets and valid file types.
- Module completion logic depends on assignment state and exercise tracking.
- Some module behavior changes by content type, so not all modules behave identically.

### 7.9 Structured Assessment Management

**Purpose**

Supports CRUD for trainer-created assessments with questions, assignments, submissions, and score tracking.

**Primary code areas**

- `backend/routes/assessment_management_routes.py`
- `frontend/app/trainer/assessment`
- `frontend/app/trainer/assessments`
- `frontend/app/trainee/assessment`

**Main functions**

- create assessments
- create questions
- edit and delete assessments
- assign assessments to batches
- submit trainee answers
- compute pass/fail score
- store assessment submissions

**Who uses it**

- Trainer
- Trainee
- Admin for oversight

**Core data involved**

- `Assessment`
- `AssessmentQuestion`
- `AssignmentBatch`
- `AssessmentSubmission`

**Key limitations**

- This is only one of several assessment pathways in the project.
- Naming overlaps with other assessment modules can create maintenance and navigation complexity.

### 7.10 Assessment Redesign Workspace

**Purpose**

Provides a more workspace-style assessment module for trainers and trainees, including bootstrap loading, CSV bulk upload, richer assignment controls, and trainee attempt workflows.

**Primary code areas**

- `backend/routes/assessment_redesign_routes.py`
- `backend/services/assessment_workspace.py`
- `frontend/app/trainer/assessments`
- `frontend/app/trainer/assessment-dashboard`
- `frontend/app/trainer/assessment-hub`
- `frontend/app/trainee/assessment`

**Main functions**

- load trainer assessment workspace bootstrap data
- create and edit categories
- create and edit questions
- build and download CSV templates
- bulk upload questions from CSV
- create assignments by batch, wave, or trainee
- control passing score, due date, time limit, and attempts
- submit trainee assessment attempts
- build trainee assessment dashboards

**Who uses it**

- Trainer
- Trainee
- Admin through trainer-level permission scope where allowed

**Core data involved**

- category-style assessment records
- question banks
- assignment records
- attempt records

**Key limitations**

- This module coexists with older assessment paths, so integration boundaries must be clearly understood during maintenance.
- CSV quality directly affects upload success and error handling.
- Assignment mode and category mode are more flexible here than in the simpler assessment routes.

### 7.11 MCQ and Certification Assessment Layer

**Purpose**

Handles MCQ category management, question selection, submission grading, competency verdicts, coaching logs, and certificate issuance in a more certification-oriented flow.

**Primary code areas**

- `backend/routes/certification_routes.py`
- `frontend/app/trainer/mcq`
- `frontend/app/trainee/mcq`
- `frontend/app/admin/certification-settings`

**Main functions**

- create MCQ categories
- create MCQ questions
- assemble or assign MCQ assessments
- grade submissions
- generate competency verdict inputs
- store coaching records
- issue certificates

**Who uses it**

- Trainer
- Admin
- Trainee as assessment taker

**Core data involved**

- `MCQCategory`
- `MCQQuestion`
- `MCQAssessment`
- `MCQSubmission`
- `CoachingLog`
- `CompetencyVerdict`
- `CertificateRecord`

**Key limitations**

- This layer has its own thresholds and certification logic, separate from the other assessment modules.
- Correct interpretation requires understanding whether a trainee is in a practice workflow, standard assessment workflow, or certification workflow.

### 7.12 Call Simulation Module

**Purpose**

Provides trainer-authored and trainee-completed mock call sessions where a scenario script, AI/member responses, recording, scoring, and coaching are combined into a simulated BPO call experience.

**Primary code areas**

- `backend/routes/call_simulation_routes.py`
- `backend/routes/call_simulation_recordings.py`
- `frontend/app/trainer/call-simulation`
- `frontend/app/trainee/call-simulation`
- `frontend/app/trainee/call-simulation/[scenarioId]`

**Main functions**

- create call simulation scenarios
- define ordered call script steps
- define speaker roles per step
- upload ringer or call audio assets
- configure KPI rubric and passing logic
- assign scenario to trainees or batches
- create trainee simulation sessions
- record and upload call audio
- store transcript and turn-by-turn response data
- calculate content score and KPI score
- mark pass or fail
- generate coaching and certificate side effects where applicable
- let trainers review recordings and notes

**Who uses it**

- Trainer for scenario creation, assignment, review, and coaching
- Trainee for mock call execution
- Admin for high-level oversight

**Core data involved**

- `Scenario`
- `ScenarioFlow`
- `ScenarioVariation`
- `BatchScenarioMapping`
- `CallSimulationAssignment`
- `BatchKPIConfig`
- `SimSession`
- `SessionResponseRecord`
- call audio assets and storage objects

**Key limitations**

- This module depends heavily on microphone access, audio playback, and browser behavior.
- Recording completeness can vary by browser if synthetic speech and live microphone capture are handled differently.
- AI speech and evaluation features depend on valid external provider keys and reachable services.
- Scenario quality strongly affects the realism and fairness of scoring.

### 7.13 Coaching and Feedback

**Purpose**

Turns raw performance records into reviewable learning feedback, action plans, and trainer follow-up.

**Primary code areas**

- `backend/routes/certification_routes.py`
- `backend/routes/trainer_routes.py`
- `backend/routes/admin_routes.py`
- `frontend/app/trainer/coaching`
- `frontend/app/trainee/coaching`
- `frontend/app/admin/coaching`

**Main functions**

- capture trainer review notes
- store strengths and opportunities
- create action plans
- maintain coaching status
- link coaching to practice or simulation sessions
- expose trainee-facing coaching history

**Who uses it**

- Trainer
- Trainee as recipient
- Admin for oversight

**Core data involved**

- `Feedback`
- `CoachingLog`

**Key limitations**

- Coaching value depends on correct linking to the relevant trainee activity.
- Some coaching records are system-generated while others are manually authored, so consistency may vary by workflow.

### 7.14 Certification and Competency Tracking

**Purpose**

Represents completion and competency outcomes through settings, verdicts, and certificate records.

**Primary code areas**

- `backend/routes/certification_routes.py`
- `frontend/app/trainee/certificates`
- `frontend/app/admin/certification-settings`

**Main functions**

- maintain certification settings
- generate competency verdicts
- issue certificates
- prune or sync activity-based certificates
- expose certificate history to trainees

**Who uses it**

- Admin
- Trainer
- Trainee as certificate recipient

**Core data involved**

- `CertificationSettings`
- `CompetencyVerdict`
- `CertificateRecord`

**Key limitations**

- Certificate issuance depends on correct scoring and completion states upstream.
- Different training modules may contribute to certificate eligibility in different ways.

### 7.15 Analytics, Reports, and Exports

**Purpose**

Transforms operational and learning data into dashboards, progress views, trainer reports, and downloadable documents.

**Primary code areas**

- `backend/routes/analytics_routes.py`
- `backend/routes/export_routes.py`
- `frontend/app/admin/analytics`
- `frontend/app/admin/reports`
- `frontend/app/trainer/analytics`
- `frontend/app/trainer/realtime`
- `frontend/app/trainer/reports`
- `frontend/app/trainee/progress`
- `frontend/app/trainee/reports`

**Main functions**

- aggregate learning performance
- show trainee and batch metrics
- show completion and pass rates
- show coaching and certification trends
- generate PDF performance reports
- expose live or near-live trainer views

**Who uses it**

- Admin
- Trainer
- Trainee for self progress views

**Core data involved**

- `PerformanceMetrics`
- `PracticeSession`
- `MicrolearningAssignment`
- `AssessmentSubmission`
- `SimSession`
- `CertificateRecord`
- `CoachingLog`

**Key limitations**

- Analytics quality depends on consistent status updates and complete source records.
- Because several modules use different scoring models, cross-module comparisons require careful interpretation.

### 7.16 Notifications

**Purpose**

Provides role-specific alerts and updates tied to assignments, completions, coaching, certificates, and system events.

**Primary code areas**

- `backend/routes/notification_routes.py`
- role dashboards and notification UI components

**Main functions**

- generate role-aware notifications
- persist notification events
- track cleared or read notifications
- stream or fetch active notifications

**Who uses it**

- Admin
- Trainer
- Trainee

**Core data involved**

- `NotificationEvent`
- `NotificationRead`
- assignment and completion records used to build alerts

**Key limitations**

- Notification completeness depends on upstream events being created correctly.
- The notification layer mixes persisted notifications and computed dashboard alerts.

### 7.17 Settings, Accessibility, and Branding

**Purpose**

Manages the user interface experience, accessibility preferences, theme behavior, and system-wide presentation settings.

**Primary code areas**

- `backend/routes/settings_routes.py`
- `frontend/app/admin/settings`
- `frontend/app/trainer/settings`
- `frontend/app/trainee/settings`

**Main functions**

- get system settings
- update user UI preferences
- control sidebar and layout state
- manage accessibility options
- manage theme configuration
- manage branding configuration

**Who uses it**

- Admin for global defaults
- All roles for user-level preferences

**Core data involved**

- `SystemSettings`
- user UI preference fields

**Key limitations**

- UI settings improve usability but do not change business permissions.
- Some layout or theme options may be available in data but not equally surfaced in every page.

## 8. Frontend Role Surface

### 8.1 Admin-Facing Pages

The current admin-facing route directories indicate that Admin can work with:

- dashboard
- analytics
- reports
- users
- coaching
- certification settings
- settings
- overview
- assessment
- scenarios
- scenario flow
- tree builder
- configuration
- line of business

This means the Admin role is both operational and configuration-oriented.

### 8.2 Trainer-Facing Pages

The trainer route structure shows the Trainer role is the main operational delivery role. The trainer-facing surface includes:

- dashboard
- live analytics
- reports
- trainees
- batches
- microlearning studio
- assessments
- call simulations
- coaching
- settings
- courses
- assignment pages
- authoring pages
- grading pages
- workspace
- MCQ-related pages
- status and review pages

This indicates Trainer is the core learning owner after system setup is finished.

### 8.3 Trainee-Facing Pages

The trainee route structure shows that Trainee is the execution and progress role. The trainee-facing surface includes:

- dashboard
- microlearning hub
- assessments
- call simulations
- coaching
- progress
- certificates
- settings
- overview
- status
- reports
- MCQ pages

This indicates the trainee experience is focused on assigned work, completion, results, and self-improvement.

## 9. End-to-End Process Flows

### 9.1 Login and Access Flow

1. User enters credentials on the login page.
2. Backend validates the credentials.
3. Supabase session issuance is attempted.
4. Backend checks Supabase/Postgres for an existing active `user_session`.
5. If an active session already exists and `SINGLE_SESSION_MODE=block`, login is denied.
6. If no active session exists, backend creates a new `user_session` row with a unique `session_id`.
7. Backend JWT access and refresh tokens are created with the `session_id` embedded.
8. Current role is resolved.
9. User is redirected to the correct dashboard:
   - Admin dashboard
   - Trainer dashboard
   - Trainee dashboard
10. The frontend verifies the session on startup and sends periodic activity heartbeats.
11. Every protected backend route validates both the JWT and active server-side `session_id`.
12. Logout marks the session inactive and clears local storage, session storage, cookies, and auth state.

### 9.2 Content Authoring Flow

1. Admin or Trainer creates a scenario, module, assessment, or MCQ item.
2. Metadata such as title, category, difficulty, script steps, or passing score is defined.
3. Optional media assets such as audio, video, or attachments are uploaded.
4. The content is saved to the main relational database.
5. Related files are stored in Supabase Storage when needed.

### 9.3 Assignment Flow

1. Trainer chooses the content to assign.
2. Trainer chooses target audience:
   - batch
   - wave
   - individual trainee
3. Trainer sets delivery rules such as:
   - due date
   - attempt limit
   - passing score
   - time limit
4. Assignment record is stored.
5. Assigned content becomes visible to the trainee based on role and assignment filters.

### 9.4 Trainee Learning Flow

1. Trainee logs in.
2. Dashboard loads assigned activities.
3. Trainee opens a module, assessment, or call simulation.
4. Trainee completes the activity.
5. The system stores:
   - answers
   - transcript
   - scores
   - status
   - attempt history
   - recordings when applicable
6. Results become available for progress views, trainer review, and analytics.

### 9.5 Speech Practice Flow

1. Trainee receives a scenario prompt.
2. Trainee records or submits spoken response.
3. Audio and transcript are processed.
4. Scoring is computed.
5. Practice session is stored.
6. Trainer may later add review notes or update scoring.

### 9.6 Assessment Flow

1. Trainer creates question banks or assessments.
2. Trainer assigns them to target trainees or groups.
3. Trainee opens only assigned assessments.
4. Trainee submits answers.
5. Backend grades the attempt.
6. Submission status, percentage, and pass/fail result are stored.
7. Results feed trainee progress, reports, and possible certification logic.

### 9.7 Call Simulation Flow

1. Trainer creates a call simulation scenario and ordered script.
2. Trainer defines member lines, CSR expectations, KPI criteria, and audio assets.
3. Trainer assigns the scenario.
4. Trainee opens only assigned simulations.
5. Trainee starts the call.
6. Ringer and audio cues are played.
7. Trainee speaks as CSR.
8. Member or AI response is played by TTS or configured audio.
9. Hold and unhold flow repeats per step.
10. Recording and transcript data are collected.
11. Session is scored.
12. Trainer reviews the result, recording, transcript, and coaching notes.

### 9.8 Coaching and Certification Flow

1. Performance records are created from practice, assessments, or simulations.
2. Trainer or automated logic generates feedback or coaching.
3. Competency is evaluated.
4. Certificates may be issued when thresholds are satisfied.
5. Trainee sees coaching history and certificate outcomes.

### 9.9 Reporting Flow

1. Operational activity records accumulate in the system.
2. Analytics routes aggregate performance data.
3. Dashboards display summaries by role.
4. Reports can be exported as PDF or viewed in-app.

## 10. Core Data Model Summary

The current project centers on these data groupings:

### 10.1 Identity and Access

- `User`
- `UserRole`
- `UserSession`
- authentication tokens and session state
- Supabase-backed active session status
- `last_activity` heartbeat timestamps

### 10.2 Training Structure

- `Batch`
- `Course`
- `CourseAssignment`
- `LineOfBusiness`

### 10.3 Scenario and Speech Practice

- `Scenario`
- `ScenarioFlow`
- `PracticeSession`
- `Feedback`

### 10.4 Microlearning

- `MicrolearningModule`
- `MicrolearningAssignment`
- `MicrolearningUploadedAsset`

### 10.5 Assessment

- `Assessment`
- `AssessmentQuestion`
- `AssessmentSubmission`
- assignment records

### 10.6 MCQ and Certification

- `MCQCategory`
- `MCQQuestion`
- `MCQAssessment`
- `MCQSubmission`
- `CompetencyVerdict`
- `CertificateRecord`

### 10.7 Call Simulation

- `CallSimulationAssignment`
- `BatchKPIConfig`
- `SimSession`
- `SessionResponseRecord`
- call audio assets

### 10.8 Support and Governance

- `Workspace`
- `KPIConfiguration`
- `NotificationEvent`
- `NotificationRead`
- `SystemLog`
- `SystemSettings`

## 11. Scope and Limitations by Role

### 11.1 Admin Role

**Scope**

- full platform visibility
- user creation and governance
- line of business management
- KPI and category governance
- certification settings
- reporting and analytics
- oversight of coaching and platform content
- system settings and branding

**Limitations**

- Admin is not modeled as a separate trainee experience.
- Some specialized operational tasks are still implemented under trainer-specific routes and pages.
- Admin visibility is broad, but daily training delivery still centers around Trainer-owned batches and content.

**What Admin is best used for**

- platform setup
- policy and KPI control
- global monitoring
- master data quality
- certification rules

### 11.2 Trainer Role

**Scope**

- create and manage batches
- manage trainees within delivery scope
- create and assign microlearning
- create and manage assessments
- create and manage call simulations
- review submissions and recordings
- add coaching feedback
- monitor live and historical performance
- export trainee reports

**Limitations**

- Trainer is not a platform super-admin.
- Trainer permissions are frequently scoped by owned batches, created content, or assigned trainees.
- Trainer depends on Admin-provided or platform-provided master data for some configuration areas.
- Trainer cannot safely bypass system-wide auth, branding, or global governance responsibilities.

**What Trainer is best used for**

- content delivery
- assignment
- coaching
- monitoring learning outcomes
- hands-on trainee performance improvement

### 11.3 Trainee Role

**Scope**

- access assigned modules
- access assigned assessments
- access assigned call simulations
- complete submissions
- view progress and reports
- read coaching
- view certificates
- update own settings and profile preferences

**Limitations**

- Trainee cannot create content.
- Trainee cannot manage users, batches, or system settings.
- Trainee visibility should be restricted to own records and assigned activities only.
- Many trainee modules depend on assignment records. If no assignment exists, the content should not appear.

**What Trainee is best used for**

- completing learning tasks
- practicing communication
- receiving feedback
- tracking personal improvement

## 12. System-Wide Scope

The current platform is capable of supporting:

- role-based learning delivery
- speech-enabled practice
- scenario-based mock conversations
- structured assessment workflows
- microlearning content delivery
- coaching and feedback cycles
- competency and certification workflows
- dashboard analytics and exportable reporting
- cloud-backed media and recording storage

In short, the project scope is broad enough to function as a BPO training operations platform, not just a single language assessment app.

## 13. System-Wide Limitations

### 13.1 Dependency on External Services

Full feature completeness depends on:

- Supabase availability
- valid database connection settings
- valid storage configuration
- valid auth configuration
- working AI provider keys
- browser microphone and audio APIs

If any of these fail, the user experience may fall back, partially degrade, or stop for affected modules.

### 13.2 Single Active Session Constraints

The system now enforces one active login session per user account across browsers, devices, and normal browser storage contexts.

Important constraints:

- Supabase/Postgres is the source of truth for active login state.
- Login blocking requires the `user_session` table and the unique active-session index.
- A normal logout immediately marks the session inactive.
- A browser crash, closed tab, device shutdown, or network disconnect is recovered by inactivity timeout, not by instant close detection.
- Protected backend routes reject tokens whose embedded `session_id` no longer maps to an active session.
- Frontend route checks are not the security boundary. Backend token and session validation are the security boundary.
- If `SINGLE_SESSION_MODE=replace` is enabled later, the platform changes from blocking new logins to terminating the previous active session.
- If `STRICT_SINGLE_SESSION=true`, additional tabs may not share the same stored auth state, depending on browser session-storage behavior.

### 13.3 Audio and Speech Reliability

Speech-related modules are sensitive to:

- microphone permissions
- background noise
- file upload integrity
- device audio routing
- browser support for media recording and playback

This especially affects practice sessions and call simulation.

### 13.4 Overlapping Module Generations

The codebase contains legacy, intermediate, and redesigned versions of some learning modules. This is especially visible in:

- assessments
- scenario handling
- call simulation support flows

This increases flexibility, but it also increases maintenance complexity and can create naming confusion.

### 13.5 Role Model Simplicity

Only three formal roles are currently implemented:

- admin
- trainer
- trainee

Any requirement for more granular governance roles would require code changes.

### 13.6 Cloud-First Behavior

The project may support local development fallbacks in some places, but the intended operational design is cloud-backed. Production-grade behavior assumes working Supabase integration for:

- database persistence
- auth synchronization
- active login session tracking
- storage uploads
- media retrieval

### 13.7 AI Output Quality

AI-supported outputs such as:

- TTS
- evaluation summaries
- speech scoring assistance
- coaching suggestions

are only as strong as the underlying services, prompt design, transcript quality, and available keys.

### 13.8 Reporting Consistency Depends on Status Discipline

Analytics, notifications, coaching, and certificates rely on activity status values being updated correctly across modules. If upstream modules do not save or transition state correctly, downstream reports can become incomplete or misleading.

## 14. What Someone New to the System Should Know First

If someone is trying to understand the platform quickly, these are the most important ideas:

1. This is a multi-module training platform, not a single assessment page.
2. Supabase is a central dependency for real data, storage, and many production workflows.
3. The system has three formal roles only: Admin, Trainer, and Trainee.
4. Trainer is the main content-delivery role.
5. Trainee should see only assigned work.
6. A user account can only have one active login session by default.
7. Scenarios, assessments, and call simulations are related but not identical modules.
8. There are multiple assessment implementations in the same codebase.
9. Audio, transcript, and AI features are central to the platform concept.
10. Coaching and certification depend on clean data coming from earlier stages.
11. Navigation shows the main experience, but the codebase contains additional support routes beyond the sidebar.

## 15. Conclusion

The Speech Enabled BPO Platform is best understood as a role-based BPO training ecosystem made of tightly connected modules:

- governance and user control
- content and scenario authoring
- learning delivery
- speech and assessment evaluation
- call simulation
- coaching
- certification
- analytics

Its strength is breadth: it can cover the full cycle from training creation to trainee completion to coaching and certification. Its main complexity comes from overlapping assessment systems, heavy media dependence, and strong reliance on Supabase and AI-related integrations.

Anyone extending the system should first decide which module family they are working in:

- speech practice
- assessment CRUD
- assessment redesign workspace
- microlearning
- call simulation
- MCQ/certification

That decision is important because each family uses different data structures, workflows, and role interactions even though they all belong to the same overall platform.
