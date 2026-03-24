# Quick Start

This guide is the shortest path to run the active platform locally.

## Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer
- Backend virtual environment already created in `backend/venv`
- Frontend dependencies installed in `frontend/node_modules`

## 1. Configure backend environment

Create `backend/.env` from `backend/.env.example`.

Minimum recommended values:

```env
DATABASE_URL=postgresql://postgres:password@db.project-id.supabase.co:5432/postgres
SUPABASE_URL=https://project-id.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=eastus
JWT_SECRET=your_jwt_secret_key
```

Optional for the active upload-based ASR flow:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_TRANSCRIPTION_MODEL=whisper-1
```

## 2. Start the backend

### Local SQLite mode

```powershell
.\run-backend.cmd
```

### Supabase mode

```powershell
$env:USE_LOCAL_SQLITE='0'
.\run-backend.cmd
```

## 3. Start the frontend

```powershell
.\run-frontend.cmd
```

## 4. Verify the app

Open:

- `http://127.0.0.1:3000/login`
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/openapi.json`

## 5. Recommended first checks

- Log in as admin and open `Users & Access`, `LOB Management`, and `MCQ Manager`.
- Log in as trainer and open `Trainee Access` and `Assign Content`.
- Log in as trainee and open `Training Hub`, `MCQ Assessment`, and `Microlearning`.

## Common Commands

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

Build the frontend:

```powershell
cd frontend
npm run build
```

Compile-check the backend:

```powershell
cd backend
venv\Scripts\python.exe -m compileall .
```

## When To Use Other Docs

- Use [backend/SUPABASE_SETUP.md](backend/SUPABASE_SETUP.md) if you are pointing the app to a live Supabase project.
- Use [backend/AZURE_SETUP.md](backend/AZURE_SETUP.md) if you need Azure speech configuration.
- Use [TESTING_GUIDE.md](TESTING_GUIDE.md) for full smoke tests and troubleshooting.
