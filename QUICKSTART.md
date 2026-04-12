# Quick Start

This is the fastest verified way to run the platform locally from PowerShell.

## Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer
- Backend virtual environment already created in `backend/venv`
- Frontend dependencies already installed in `frontend/node_modules`

## Recommended Local Mode

For local testing, use the bundled SQLite mode first. It avoids external Supabase/Postgres connectivity issues and was the mode used for the latest smoke test.

Backend URL:

- `http://127.0.0.1:8000`

Frontend URL:

- `http://localhost:3000`

## Start The Backend

Open a PowerShell terminal at the project root and run either the launcher or the direct command.

### Option A: Root launcher

```powershell
$env:USE_LOCAL_SQLITE='1'
.\run-backend.cmd
```

### Option B: Direct backend command

```powershell
cd backend
$env:USE_LOCAL_SQLITE='1'
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

## Start The Frontend

Open a second PowerShell terminal at the project root.

Build once before `start`, then run the frontend server:

### Option A: Root launcher

```powershell
cd frontend
npm run build
cd ..
.\run-frontend.cmd
```

### Option B: Direct frontend command

```powershell
cd frontend
npm run build
$env:BACKEND_URL='http://127.0.0.1:8000'
$env:NODE_OPTIONS='--no-deprecation'
npm run start -- --hostname localhost --port 3000
```

### Optional hot-reload mode

If you want frontend hot reload during UI work, use:

```powershell
cd frontend
$env:BACKEND_URL='http://127.0.0.1:8000'
$env:NODE_OPTIONS='--no-deprecation'
npm run dev -- --hostname localhost --port 3000
```

## Default Local Credentials

These seeded credentials were verified in local SQLite mode.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@stpetervelle.edu.ph` | `SPVAdmin2026` |
| Trainer | `trainer@st.peterville.edu.ph` | `SPVTrainer2026` |
| Trainee | `mcureta@fatima.edu.ph` | `SPVTrainee2026` |

Notes:

- The trainee account is configured to require a password change after first login.
- Authentication routes map users to `/admin/dashboard`, `/trainer/dashboard`, and `/trainee/dashboard`.

## Quick Verification

After both servers are running, open:

- `http://localhost:3000/login`
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/openapi.json`

Recommended smoke check:

1. Sign in as admin and open `Dashboard`, `Users`, and `Settings`.
2. Sign in as trainer and open `Dashboard`, `Sim Floor`, and `Reports`.
3. Sign in as trainee and open `Dashboard`, `Sim Floor`, `Reports`, and `Certificates`.

## Supabase Mode

Use Supabase/Postgres only when the backend environment is fully configured and external connectivity is available.

Required backend variables include:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SERVICE_KEY`
- `JWT_SECRET`

To force backend startup against Supabase/Postgres:

```powershell
cd backend
$env:USE_LOCAL_SQLITE='0'
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

If `USE_LOCAL_SQLITE=0` is set and `DATABASE_URL` is unreachable, backend startup will fail.

## Useful Commands

Install backend dependencies:

```powershell
cd backend
venv\Scripts\activate
pip install -r requirements.txt
```

Install frontend dependencies:

```powershell
cd frontend
npm install
```

Compile-check the backend:

```powershell
cd backend
venv\Scripts\python.exe -m compileall .
```

## Related Docs

- [backend/SUPABASE_SETUP.md](backend/SUPABASE_SETUP.md) for live Supabase setup
- [backend/AZURE_SETUP.md](backend/AZURE_SETUP.md) for Azure speech configuration
- [TESTING_GUIDE.md](TESTING_GUIDE.md) for broader smoke testing and troubleshooting
