# Quick Start

This guide uses PowerShell only. Open terminals in the project root:

`C:\Users\Mark Ureta\Documents\MIT CAPSTONE\SYSTEM\SYSTEM - Speech Enabled BPO Platform`

## Prerequisites

- Python 3.11+
- Node.js 20+
- Backend virtual environment present at `backend\venv`
- Frontend dependencies installed in `frontend\node_modules`

## Recommended Supabase Run

The backend is configured to read Supabase/Postgres settings from `backend\.env` and the repo `.env`.

### Terminal 1: Backend

```powershell
cd backend
$env:USE_LOCAL_SQLITE='0'
$env:BACKEND_URL='http://127.0.0.1:8000'
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### Terminal 2: Frontend Dev Server

```powershell
cd frontend
$env:BACKEND_URL='http://127.0.0.1:8000'
$env:NODE_OPTIONS='--no-deprecation'
npm run dev -- --hostname localhost --port 3000
```

Frontend URL: `http://localhost:3000`

Backend URL: `http://127.0.0.1:8000`

## Production-Style Frontend Start

If you want to run the frontend the same way as `run-frontend.cmd`, build first, then start:

```powershell
cd frontend
$env:BACKEND_URL='http://127.0.0.1:8000'
$env:NODE_OPTIONS='--no-deprecation'
npm run build
npm run start -- --hostname localhost --port 3000
```

## SQLite Fallback

If Supabase/Postgres is unavailable, use local SQLite for backend startup:

```powershell
cd backend
$env:USE_LOCAL_SQLITE='1'
$env:BACKEND_URL='http://127.0.0.1:8000'
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The frontend command stays the same.

## Default Login Credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@stpetervelle.edu.ph` | `SPVAdmin2026` |
| Trainer | `trainer@st.peterville.edu.ph` | `SPVTrainer2026` |
| Trainee | `mcureta@fatima.edu.ph` | `SPVTrainee2026` |

Notes:

- The trainee account may prompt for a password change on first login.
- Role routing goes to `/admin/dashboard`, `/trainer/dashboard`, and `/trainee/dashboard`.

## Fast Smoke Check

1. Open `http://localhost:3000/login`.
2. Sign in as trainee and verify `Microlearning`, `Assessments`, `My Progress`, `Reports`, and `Certificates`.
3. Sign in as trainer and verify `Microlearning`, `Assessments`, `Coaching`, and `Reports`.
4. Open `http://127.0.0.1:8000/docs` to confirm backend API availability.

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

Compile-check backend Python files:

```powershell
cd backend
venv\Scripts\python.exe -m compileall .
```

## Related Docs

- [INPUT_GUIDE.md](INPUT_GUIDE.md)
- [backend/SUPABASE_SETUP.md](backend/SUPABASE_SETUP.md)
- [frontend/README.md](frontend/README.md)
