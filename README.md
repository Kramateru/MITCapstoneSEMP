# Speech-Enabled BPO Platform

This repository contains the active St. Peter role-based BPO training platform. It combines a Next.js frontend, a FastAPI backend, Supabase-backed data access, speech assessment workflows, MCQ management, microlearning, and role-specific dashboards for admin, trainer, and trainee users.

## What The System Covers

- Admin operations for Users & Access, LOB Management, simulation and assessment configuration, certification, and governance.
- Trainer operations for Trainee Access, content assignment, coaching, grading, MCQ management, reports, and performance tracking.
- Trainee operations for Training Hub, MCQ Assessment, Sim Floor, Microlearning, coaching review, certification, and personal performance tracking.
- Speech assessment flows that capture trainee audio in the browser, upload it to the backend, score the response, and persist results to the database.
- St. Peter Buddy support workflows for role-based FAQ guidance.

## Current Stack

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase JS client

### Backend

- FastAPI
- SQLAlchemy
- PostgreSQL via Supabase or local SQLite for development
- Supabase Python client
- Azure Speech SDK installed for direct speech experiments
- OpenAI transcription support in the speech assessment service when configured

## Repository Layout

```text
.
|-- backend/
|   |-- main.py
|   |-- requirements.txt
|   |-- routes/
|   |-- services/
|   `-- .env.example
|-- frontend/
|   |-- app/
|   |-- hooks/
|   `-- package.json
|-- run-backend.cmd
|-- run-frontend.cmd
|-- QUICKSTART.md
|-- TESTING_GUIDE.md
|-- AUDIO_PROCESSING.md
|-- PRONUNCIATION_ASSESSMENT.md
|-- SYSTEM_OPTIMIZATION.md
`-- IMPLEMENTATION_CHECKLIST.md
```

## Quick Start

### 1. Install dependencies

```powershell
cd backend
venv\Scripts\activate
pip install -r requirements.txt

cd ..\frontend
npm install
```

### 2. Configure environment

Copy `backend/.env.example` to `backend/.env` and update the values you need:

- `DATABASE_URL` for Supabase Postgres
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SERVICE_KEY`
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- `OPENAI_API_KEY` if you want live transcription through the current assessment pipeline

### 3. Start the backend

For local SQLite:

```powershell
.\run-backend.cmd
```

For Supabase:

```powershell
$env:USE_LOCAL_SQLITE='0'
.\run-backend.cmd
```

### 4. Start the frontend

```powershell
.\run-frontend.cmd
```

### 5. Open the app

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`

## Database Modes

### Local development

`run-backend.cmd` defaults to `sqlite:///./test.db` unless `USE_LOCAL_SQLITE=0` is set.

### Supabase

Set `USE_LOCAL_SQLITE=0`, provide a valid `DATABASE_URL`, and configure the Supabase keys in `backend/.env`. The current backend is built to use the live database routes for users, LOBs, MCQ categories, questions, assignments, and reporting.

## Speech Assessment Overview

The active trainee workflow is upload-based:

1. The browser records audio with `MediaRecorder`.
2. The frontend posts the recording to `/api/trainee/asr/assess`.
3. The backend transcribes and scores the attempt.
4. Practice session data is stored in the database and surfaced in trainer and trainee views.

The repository also still includes a direct `/ws/speech` WebSocket endpoint in `backend/main.py` for Azure-based speech experiments and lower-level testing.

## Local Access Notes

On a fresh local SQLite startup, `backend/main.py` currently ensures baseline admin, trainer, and trainee accounts for local development. If your team wants a no-seed environment, disable or remove that bootstrap logic before deployment.

## Recommended Verification

After startup, verify:

- `GET /openapi.json`
- `GET /docs`
- `GET /login`
- Admin login and dashboard access
- Trainer login and Trainee Access page
- Trainee login and Training Hub page
- LOB Management, MCQ Manager, and speech assessment submission

Detailed smoke tests are in [TESTING_GUIDE.md](TESTING_GUIDE.md).

## Documentation Map

- [QUICKSTART.md](QUICKSTART.md): fastest path to run the app locally
- [TESTING_GUIDE.md](TESTING_GUIDE.md): smoke tests and troubleshooting
- [AUDIO_PROCESSING.md](AUDIO_PROCESSING.md): current audio capture and assessment flow
- [PRONUNCIATION_ASSESSMENT.md](PRONUNCIATION_ASSESSMENT.md): scoring model and outputs
- [SYSTEM_OPTIMIZATION.md](SYSTEM_OPTIMIZATION.md): product structure and module grouping
- [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md): rollout and maintenance checklist
- [backend/SUPABASE_SETUP.md](backend/SUPABASE_SETUP.md): backend database setup
- [backend/AZURE_SETUP.md](backend/AZURE_SETUP.md): Azure speech configuration
- [frontend/README.md](frontend/README.md): frontend-only commands and structure
