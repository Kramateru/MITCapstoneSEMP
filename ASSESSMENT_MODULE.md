# Assessment Module

Production-ready assessment workflows for the Speech-Enabled BPO Platform are implemented in the existing Next.js + Supabase stack.

## Stack

- Frontend: Next.js App Router with React and Tailwind CSS
- API layer: Next.js route handlers in `frontend/app/api/assessment-module`
- Database: Supabase PostgreSQL
- Auth: Existing platform token verification with Supabase session fallback
- Realtime: Supabase Realtime via SSE bridge routes

## Folder Structure

```text
frontend/
  app/
    api/
      assessment-module/
        trainer/
          assignments/route.ts
          assessments/route.ts
          assessments/[assessmentId]/route.ts
          bootstrap/route.ts
          categories/route.ts
          categories/[categoryId]/route.ts
          coach/route.ts
          export/csv/route.ts
          questions/route.ts
          questions/[questionId]/route.ts
          stream/route.ts
        trainee/
          attempts/route.ts
          dashboard/route.ts
          stream/route.ts
    components/
      assessment/
        trainer/
          trainer-assessment-studio.tsx
          trainer-builder-panel.tsx
          trainer-assignment-panel.tsx
          trainer-live-analytics-panel.tsx
          question-editor-card.tsx
        trainee/
          trainee-assessment-workspace.tsx
          assessment-player.tsx
    lib/
      assessment/
        backend-auth.ts
        client.ts
        env.ts
        route-utils.ts
        scoring.ts
        service.ts
        supabase-admin.ts
        types.ts
    trainer/
      assessments/page.tsx
    trainee/
      assessment/page.tsx
      progress/page.tsx
      certificates/page.tsx
supabase/
  assessment_module_schema.sql
  assessment_module_seed.sql
```

## Supabase Schema

Apply the assessment schema after the platform core tables already exist.

Required existing tables used by this module:

- `public."user"`
- `public.batch`
- `public.batch_user`

Assessment tables and views are created in:

- [supabase/assessment_module_schema.sql](/c:/Users/Mark%20Ureta/Documents/MIT%20CAPSTONE/SYSTEM/SYSTEM%20-%20Speech%20Enabled%20BPO%20Platform/supabase/assessment_module_schema.sql)

Main assessment entities:

- `training_assessment_categories`
- `training_assessments`
- `training_assessment_questions`
- `training_assessment_assignments`
- `training_assessment_attempts`
- `training_assessment_coaching_notes`
- `training_assessment_certificates`
- `training_assessment_attempt_feed`
- `training_assessment_category_report`
- `training_assessment_question_report`

Notes:

- Role control is enforced through existing `public."user".role` values: `admin`, `trainer`, `trainee`.
- RLS limits trainer ownership and trainee visibility through direct assignment or `batch_user`.
- Realtime publication now includes attempts, assignments, coaching notes, and certificates.

## API Surface

Trainer routes:

- `GET /api/assessment-module/trainer/bootstrap`
- `POST /api/assessment-module/trainer/categories`
- `PATCH /api/assessment-module/trainer/categories/:categoryId`
- `DELETE /api/assessment-module/trainer/categories/:categoryId`
- `POST /api/assessment-module/trainer/assessments`
- `PATCH /api/assessment-module/trainer/assessments/:assessmentId`
- `DELETE /api/assessment-module/trainer/assessments/:assessmentId`
- `POST /api/assessment-module/trainer/questions`
- `PATCH /api/assessment-module/trainer/questions/:questionId`
- `DELETE /api/assessment-module/trainer/questions/:questionId`
- `POST /api/assessment-module/trainer/assignments`
- `POST /api/assessment-module/trainer/coach`
- `GET /api/assessment-module/trainer/export/csv`
- `GET /api/assessment-module/trainer/stream`

Trainee routes:

- `GET /api/assessment-module/trainee/dashboard`
- `POST /api/assessment-module/trainee/attempts`
- `GET /api/assessment-module/trainee/stream`

## UI Pages

Trainer sample pages:

- [frontend/app/trainer/assessments/page.tsx](/c:/Users/Mark%20Ureta/Documents/MIT%20CAPSTONE/SYSTEM/SYSTEM%20-%20Speech%20Enabled%20BPO%20Platform/frontend/app/trainer/assessments/page.tsx)

Trainee sample pages:

- [frontend/app/trainee/assessment/page.tsx](/c:/Users/Mark%20Ureta/Documents/MIT%20CAPSTONE/SYSTEM/SYSTEM%20-%20Speech%20Enabled%20BPO%20Platform/frontend/app/trainee/assessment/page.tsx)
- [frontend/app/trainee/progress/page.tsx](/c:/Users/Mark%20Ureta/Documents/MIT%20CAPSTONE/SYSTEM/SYSTEM%20-%20Speech%20Enabled%20BPO%20Platform/frontend/app/trainee/progress/page.tsx)
- [frontend/app/trainee/certificates/page.tsx](/c:/Users/Mark%20Ureta/Documents/MIT%20CAPSTONE/SYSTEM/SYSTEM%20-%20Speech%20Enabled%20BPO%20Platform/frontend/app/trainee/certificates/page.tsx)

## Features Covered

- Role-based workflows for admin, trainer, and trainee
- Category CRUD with soft archive
- Assessment CRUD with multiple choice and fill-in-the-blank question support
- Question create, update, delete
- Batch or direct trainee assignment
- Trainee attempt flow with automatic grading and explanation feedback
- Retake support with `attempt_no`
- Trainer coaching notes
- Certificate issuance after pass
- Trainer analytics for pass/fail, average score, and weak questions
- Trainee progress charts and certificate history
- CSV export and print/save-PDF reporting from trainer analytics
- Realtime trainer and trainee updates using Supabase subscriptions bridged through SSE
- Search, filter, and pagination controls in key trainer and trainee views

## Seed Data

Starter seed SQL:

- [supabase/assessment_module_seed.sql](/c:/Users/Mark%20Ureta/Documents/MIT%20CAPSTONE/SYSTEM/SYSTEM%20-%20Speech%20Enabled%20BPO%20Platform/supabase/assessment_module_seed.sql)

The seed expects:

- at least one active trainer in `public."user"`
- at least one active batch in `public.batch`

It creates:

- a sample category
- a mixed assessment
- starter multiple-choice and fill-in-the-blank questions
- a sample batch assignment

## Local Run Instructions

1. Configure environment variables for both frontend and backend.

Required for the assessment module:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`
- `BACKEND_URL`

2. Apply SQL in Supabase.

Run, in order:

- core platform schema already used by the app
- `supabase/assessment_module_schema.sql`
- optional `supabase/assessment_module_seed.sql`

3. Start the backend from `backend/`.

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

4. Start the frontend from `frontend/`.

```powershell
npm run dev
```

5. Open the role-based pages:

- Trainer: `/trainer/assessments`
- Trainee: `/trainee/assessment`
- Trainee progress: `/trainee/progress`
- Trainee certificates: `/trainee/certificates`

## Implementation Notes

- This module intentionally extends the repo’s existing `public."user"` and `batch_user` model instead of introducing a parallel `profiles` table just for assessments.
- If you later standardize the whole platform on `public.profiles`, update the table references in `service.ts`, `backend-auth.ts`, and `assessment_module_schema.sql` together.
