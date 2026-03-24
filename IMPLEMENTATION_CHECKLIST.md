# Implementation Checklist

Use this as the current operational checklist for the active platform.

## Environment

- [ ] `backend/.env` exists and is not committed
- [ ] `DATABASE_URL` points to the intended database
- [ ] `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_KEY` are valid
- [ ] `JWT_SECRET` is set
- [ ] `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set if Azure testing is required
- [ ] `OPENAI_API_KEY` is set if live upload-based transcription is required

## Startup

- [ ] Backend starts without import or dependency failures
- [ ] Frontend starts without build-time route failures
- [ ] `http://127.0.0.1:8000/docs` loads
- [ ] `http://127.0.0.1:3000/login` loads

## Core Role Flows

### Admin

- [ ] Users & Access can create and update admin or trainer accounts
- [ ] LOB Management can fetch, add, modify, and deactivate LOBs
- [ ] MCQ Manager can refresh, create, edit, and delete categories and questions
- [ ] Scenario and assessment configuration pages load from the live database

### Trainer

- [ ] Trainee Access can create trainee accounts with batch or wave assignment
- [ ] Assign Content can assign modules, courses, or assessments
- [ ] Coaching pages can load practice results
- [ ] Reports and Performance Hub resolve without runtime errors

### Trainee

- [ ] Training Hub loads available scenarios
- [ ] Sim Floor and assessments load without broken states
- [ ] Microlearning loads assigned content
- [ ] MCQ Assessment shows assigned categories and submits results
- [ ] Certification and Performance Hub reflect live data

## Speech Workflow

- [ ] The browser can record audio
- [ ] `POST /api/trainee/asr/assess` succeeds
- [ ] Practice sessions are saved
- [ ] Scores and coaching tips appear in the UI
- [ ] Trainer review can see the saved attempt

## Database Validation

- [ ] A newly created record appears in the database
- [ ] The same record is fetched back into the UI after refresh
- [ ] Supabase mode is verified with `USE_LOCAL_SQLITE=0`
- [ ] Local SQLite mode is only used intentionally for local development

## Build Validation

- [ ] `python -m compileall backend` passes
- [ ] `npm run build` passes

## Cleanup Before Demo Or Deployment

- [ ] Remove or disable local bootstrap accounts if production should not seed users
- [ ] Review CORS settings
- [ ] Review storage and secrets handling
- [ ] Confirm all documentation matches the deployed configuration
