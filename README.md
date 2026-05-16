# Speech-Enabled BPO Platform

Speech-enabled BPO training platform with a Next.js frontend, a FastAPI backend, and Supabase as the production database, auth store, storage layer, and selected realtime backend.

## Architecture

- `frontend/`: Next.js application
- `backend/`: FastAPI API and service layer
- `supabase/`: SQL schema and migration helpers
- `run-backend.cmd`: production backend launcher
- `run-frontend.cmd`: production frontend launcher

## Required Environment

Store the production values in the repo root `.env` or `backend/.env`.

```env
USE_LOCAL_SQLITE=0
DATABASE_URL=postgresql://<supabase-postgres-connection>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-or-sb_secret-key>
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
SECRET_KEY=<32+ character secret>
BACKEND_URL=http://127.0.0.1:8000
FRONTEND_URL=http://localhost:3000
```

## Production Run In Terminal

Open two PowerShell windows at the project root:

```powershell
cd "C:\Users\Mark Ureta\Documents\MIT CAPSTONE\SYSTEM\SYSTEM - Speech Enabled BPO Platform"
```

Start the backend:

```powershell
.\run-backend.cmd
```

Start the frontend:

```powershell
.\run-frontend.cmd
```

## What The Launchers Do

- The launchers reload the latest repo and feature env values from `.env` / `.env.local` by default
- Set `ENV_FILE_OVERRIDE=0` if you intentionally want existing shell env vars to win instead
- The backend launcher forces `USE_LOCAL_SQLITE=0`
- The backend runs a Python compile preflight before serving traffic
- The backend validates the Supabase database and auth configuration before serving traffic
- The backend synchronizes local platform users into Supabase `auth.users` on every startup
- The frontend launcher rebuilds the app and starts Next.js in production mode

## Access URLs

- Frontend login: `http://localhost:3000/login`
- Backend docs: `http://127.0.0.1:8000/docs`

## Default Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@stpetervelle.edu.ph` | `SPVAdmin2026` |
| Trainer | `trainer@stpetervelle.edu.ph` | `SPVTrainer2026` |
| Trainee | `mcureta@fatima.edu.ph` | `SPVTrainee2026` |
