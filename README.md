# Speech-Enabled BPO Platform

Speech-enabled BPO training platform with a Next.js frontend, a FastAPI backend, and Supabase as the production database, auth store, storage layer, and selected realtime backend.

## Architecture

- `frontend/`: Next.js application
- `backend/`: FastAPI API and service layer
- `supabase/`: SQL schema and migration helpers
- `run-backend.cmd`: production backend launcher
- `run-frontend.cmd`: production frontend launcher

## Required Environment

Store the production values in the repo root `.env` or `backend/.env`. The backend accepts both `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SERVICE_KEY`; set both to the same service-role secret so local scripts, Docker startup, Render, and server-only Next routes all resolve the same admin credential.

```env
USE_LOCAL_SQLITE=0
DATABASE_URL=postgresql://<supabase-postgres-connection>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-or-sb_secret-key>
SUPABASE_SERVICE_KEY=<service-role-or-sb_secret-key>
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
CALL_SIMULATION_STORAGE_BUCKET_NAME=recordings
CALL_SIMULATION_ASSET_BUCKET_NAME=call-simulation-audio
MICROLEARNING_STORAGE_BUCKET_NAME=microlearning-audio
# Set to false in production. Critical uploads for profile images,
# microlearning audio/assets, and call simulation assets require Supabase storage.
ALLOW_LOCAL_MEDIA_FALLBACK=false
SECRET_KEY=<32+ character secret>
BACKEND_URL=http://127.0.0.1:8000
FRONTEND_URL=http://localhost:3000
```

Frontend-only env files such as `frontend/.env.local` must contain only the public values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
NEXT_PUBLIC_BACKEND_URL=https://<your-backend-host>
```

Never place the Supabase service-role key in a frontend env file.

## Render Environment

Backend service:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_KEY`
- `DATABASE_URL`
- `CALL_SIMULATION_STORAGE_BUCKET_NAME`
- `CALL_SIMULATION_ASSET_BUCKET_NAME`
- `MICROLEARNING_STORAGE_BUCKET_NAME`
- `ALLOW_LOCAL_MEDIA_FALLBACK`
- `BACKEND_URL`
- `FRONTEND_URL`
- `ENABLE_LOCAL_TTS=1`

Frontend service:

- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `BACKEND_URL`
- `NEXT_PUBLIC_BACKEND_URL`

Expected Render startup behavior:

- The backend log should report `Supabase admin storage configuration detected.`
- The warning `Supabase service role key is not configured...` should not appear once either service-key variable is set.
- Trainer microlearning audio uploads should write to the `microlearning-audio` bucket.
- Profile image uploads should write to the `profile-pictures` bucket.

## Storage Buckets

Verify these buckets exist in Supabase Storage:

- `microlearning-audio`
- `profile-pictures`
- `recordings`
- `call-simulation-audio`
- `attachments`

Use `supabase/storage_bucket_alignment.sql` in the Supabase SQL editor to align the bucket and policy setup when provisioning a fresh project.

## Run the Program from Terminal

Use two terminal windows from the project root to start the current checked-in backend and frontend in production mode.

See `run-backend.md` and `run-frontend.md` for a more detailed startup guide and the latest runtime behavior notes.

### Current / Production mode (recommended)

Open a PowerShell terminal at the project root:

```powershell
cd "C:\Users\Mark Ureta\Documents\MIT CAPSTONE\SYSTEM\SYSTEM - Speech Enabled BPO Platform"
```

Start the backend:

```powershell
.\run-backend.cmd
```

Open a second PowerShell terminal and start the frontend:

```powershell
.\run-frontend.cmd
```

These launcher scripts refresh dependencies, load the latest environment values, rebuild the current code, and start the backend/frontend in the same way the live production workflow is expected to run.

### Manual startup commands

If you prefer to start them manually, use these commands:

Backend:

```powershell
$env:USE_LOCAL_SQLITE = "0"
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

### Access URLs

- Frontend login: `http://localhost:3000/login`
- Backend docs: `http://127.0.0.1:8000/docs`

## What The Launchers Do

- The launchers reload the latest repo and feature env values from `.env` / `.env.local` by default.
- Set `ENV_FILE_OVERRIDE=0` if you intentionally want existing shell env vars to win instead.
- The backend launcher forces `USE_LOCAL_SQLITE=0`, refreshes Python dependencies, compiles the backend, and starts the current FastAPI code in production mode.
- The backend validates the Supabase database and auth configuration before serving traffic and syncs local platform users into Supabase `auth.users` on every startup.
- The frontend launcher refreshes Node dependencies, builds the latest checked-in Next.js app, and starts the production server on the configured port.

## Default Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@stpetervelle.edu.ph` | `SPVAdmin2026` |
| Trainer | `trainer@stpetervelle.edu.ph` | `SPVTrainer2026` |
| Trainee | `mcureta@fatima.edu.ph` | `SPVTrainee2026` |

### Manual startup commands

If you prefer to start them manually, use these commands:

Backend:

```powershell
$env:USE_LOCAL_SQLITE = "0"
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

### Access URLs

- Frontend login: `http://localhost:3000/login`
- Backend docs: `http://127.0.0.1:8000/docs`

## What The Launchers Do

- The launchers reload the latest repo and feature env values from `.env` / `.env.local` by default.
- Set `ENV_FILE_OVERRIDE=0` if you intentionally want existing shell env vars to win instead.
- The backend launcher forces `USE_LOCAL_SQLITE=0`, refreshes Python dependencies, compiles the backend, and starts the current FastAPI code in production mode.
- The backend validates the Supabase database and auth configuration before serving traffic and syncs local platform users into Supabase `auth.users` on every startup.
- The frontend launcher refreshes Node dependencies, builds the latest checked-in Next.js app, and starts the production server on the configured port.

## Default Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@stpetervelle.edu.ph` | `SPVAdmin2026` |
| Trainer | `trainer@stpetervelle.edu.ph` | `SPVTrainer2026` |
| Trainee | `mcureta@fatima.edu.ph` | `SPVTrainee2026` |
