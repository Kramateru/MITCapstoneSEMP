# Input Guide

This guide shows the exact terminal inputs to run the system without using the file explorer.

## 1. Open Two PowerShell Windows

Set both terminals to the project root:

```powershell
cd "C:\Users\Mark Ureta\Documents\MIT CAPSTONE\SYSTEM\SYSTEM - Speech Enabled BPO Platform"
```

## 2. Start The Backend

Use Supabase/Postgres:

```powershell
cd backend
$env:USE_LOCAL_SQLITE='0'
$env:BACKEND_URL='http://127.0.0.1:8000'
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

If you need a local fallback:

```powershell
cd backend
$env:USE_LOCAL_SQLITE='1'
$env:BACKEND_URL='http://127.0.0.1:8000'
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

## 3. Start The Frontend

Development mode:

```powershell
cd frontend
$env:BACKEND_URL='http://127.0.0.1:8000'
$env:NODE_OPTIONS='--no-deprecation'
npm run dev -- --hostname localhost --port 3000
```

Production-style mode:

```powershell
cd frontend
$env:BACKEND_URL='http://127.0.0.1:8000'
$env:NODE_OPTIONS='--no-deprecation'
npm run build
npm run start -- --hostname localhost --port 3000
```

## 4. Sign In

Open:

- `http://localhost:3000/login`
- `http://127.0.0.1:8000/docs`

Use one of these accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@stpetervelle.edu.ph` | `SPVAdmin2026` |
| Trainer | `trainer@st.peterville.edu.ph` | `SPVTrainer2026` |
| Trainee | `mcureta@fatima.edu.ph` | `SPVTrainee2026` |

## 5. Quick Role Checks

- Trainee: `Microlearning`, `Assessments`, `My Progress`, `Reports`, `Certificates`
- Trainer: `Microlearning`, `Assessments`, `Coaching`, `Reports`
- Admin: `Users`, `Reports`, `Settings`

## 6. Stop The Servers

In each terminal, press `Ctrl + C`.
