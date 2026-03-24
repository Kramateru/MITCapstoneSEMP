# Supabase Setup

This guide covers the backend connection to Supabase Postgres and related platform services.

## What Supabase Is Used For Here

The backend can use Supabase for:

- PostgreSQL via `DATABASE_URL`
- shared data for users, LOBs, scenarios, MCQ categories, MCQ questions, assignments, and reporting
- optional storage integrations when service credentials are configured

## 1. Create Or Open A Supabase Project

From Supabase dashboard:

1. Open your project.
2. Go to `Project Settings`.
3. Copy the project URL.
4. Copy the anon key.
5. Copy the service role key.
6. Copy the Postgres connection string for Python or SQLAlchemy.

## 2. Configure `backend/.env`

Start from `backend/.env.example` and set:

```env
DATABASE_URL=postgresql://postgres:password@db.project-id.supabase.co:5432/postgres
SUPABASE_URL=https://project-id.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
STORAGE_BUCKET_NAME=audio-records
JWT_SECRET=your_jwt_secret_key
```

Optional:

```env
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=eastus
OPENAI_API_KEY=your_openai_api_key
OPENAI_TRANSCRIPTION_MODEL=whisper-1
```

## 3. Start The Backend In Supabase Mode

The root `run-backend.cmd` script defaults to local SQLite. To force Supabase:

```powershell
$env:USE_LOCAL_SQLITE='0'
.\run-backend.cmd
```

If you start manually:

```powershell
cd backend
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

## 4. Verify Connectivity

Check:

- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/openapi.json`
- admin login through the frontend

Then perform one real write:

- create or modify an LOB
- create or edit an MCQ category
- create a trainer or trainee account

Confirm the record appears in Supabase and still appears after page refresh.

## 5. Common Misconfiguration

### The app still shows SQLite data

- `USE_LOCAL_SQLITE=0` was not set before backend startup
- `DATABASE_URL` is missing or invalid

### Supabase client imports fail

- backend dependencies are outdated
- the virtual environment needs `pip install -r requirements.txt`

### The UI loads but uploads or protected routes fail

- `SUPABASE_SERVICE_KEY` is missing for server-side operations that need elevated access
- the JWT or auth configuration is inconsistent

## 6. Recommended Smoke Checks

Run these after connecting to Supabase:

- admin login
- trainer login
- trainee login
- LOB Management fetch and modify
- MCQ Manager refresh, create, and edit
- Trainee Access create user flow
- speech assessment submission and saved practice session

For the complete startup flow, see [README.md](../README.md) and [TESTING_GUIDE.md](../TESTING_GUIDE.md).
