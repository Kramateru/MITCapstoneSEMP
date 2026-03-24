# Testing Guide

This guide focuses on the current platform, not the earlier speech-only prototype.

## Pre-Flight

Before testing, confirm:

- Backend is running on `127.0.0.1:8000`
- Frontend is running on `127.0.0.1:3000`
- `backend/.env` is present
- If using Supabase, `USE_LOCAL_SQLITE=0` is set before backend startup

## 1. Backend Availability

Verify these URLs in the browser or with `curl`:

```powershell
curl http://127.0.0.1:8000/
curl http://127.0.0.1:8000/docs
curl http://127.0.0.1:8000/openapi.json
```

Expected result: all should respond successfully.

## 2. Frontend Availability

Open:

- `http://127.0.0.1:3000/login`
- `http://127.0.0.1:3000/admin/dashboard`
- `http://127.0.0.1:3000/trainer/dashboard`
- `http://127.0.0.1:3000/trainee/dashboard`

Expected result: the login page loads without console errors, and protected pages redirect correctly when not authenticated.

## 3. Authentication And Database

Test these flows:

- Log in as admin.
- Log in as trainer.
- Log in as trainee.
- Confirm the correct role dashboard loads.
- Refresh the page and confirm the session still resolves correctly.

If you are using Supabase, also verify that newly created records appear in the live database.

## 4. Admin Smoke Tests

Confirm these features work end to end:

- `Users & Access`: create or update an admin or trainer account
- `LOB Management`: fetch the LOB list, add a new LOB, modify it, and confirm the change persists
- `MCQ Manager`: refresh categories, create a category, edit it, create questions, and edit a question
- `Simulation Architect` and `Scenario Flow`: load existing data without API failures

## 5. Trainer Smoke Tests

Confirm:

- `Trainee Access` creates a trainee account and assigns the selected batch or wave
- `Assign Content` loads live content and saves assignments
- `MCQ Manager` loads trainer-visible category and question data
- `Reports` and `Performance Hub` load without empty-state errors or crash loops

## 6. Trainee Smoke Tests

Confirm:

- `Training Hub` loads assigned or published scenarios
- `MCQ Assessment` shows assigned categories and submits results
- `Microlearning` loads assigned modules
- `Certification` and `Performance Hub` load using the current user data

## 7. Speech Assessment Tests

The active assessment route is:

```text
POST /api/trainee/asr/assess
```

Check this flow:

1. Open a trainee practice page.
2. Start recording.
3. Stop recording and wait for assessment.
4. Confirm transcript, scores, and coaching tips return.
5. Confirm the practice session is written to the database.

If `OPENAI_API_KEY` is not configured, the backend will fall back to heuristic scoring instead of full live transcription.

## 8. Supabase-Specific Checks

When running against Supabase:

- Confirm `DATABASE_URL` points to the correct project
- Confirm `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_KEY` are valid
- Create a record from the UI, then verify it in Supabase
- Restart the app and confirm the same record is fetched back into the UI

## 9. Build And Compile Checks

Backend:

```powershell
cd backend
venv\Scripts\python.exe -m compileall .
```

Frontend:

```powershell
cd frontend
npm run build
```

## Common Failures

### `ERR_CONNECTION_REFUSED`

- Backend or frontend is not running
- Wrong port
- Another process is already using `3000` or `8000`

### Login succeeds but data is missing

- Backend is connected to SQLite instead of Supabase
- `USE_LOCAL_SQLITE=0` was not set before backend startup
- `DATABASE_URL` is incorrect

### Audio assessment returns a fallback response

- `OPENAI_API_KEY` is not configured
- Audio was too short or empty
- The request did not include a valid `scenario_id` or `reference_text`

### Azure setup exists but does not affect the trainee flow

That is expected. The current trainee workflow uses the upload-based assessment service. The Azure WebSocket path in `backend/main.py` is still available for direct speech experiments, but it is not the default trainee assessment path.
