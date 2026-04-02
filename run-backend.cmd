@echo off
setlocal
set "APP_ROOT=%~dp0"
cd /d "%APP_ROOT%backend"

if defined USE_LOCAL_SQLITE (
  if /I "%USE_LOCAL_SQLITE%"=="0" (
    echo Starting backend with DATABASE_URL from backend/.env, repo root .env, or environment...
  ) else (
    echo Starting backend with local SQLite database...
  )
) else (
  echo Starting backend using environment resolution from backend/.env, repo root .env, or the current shell...
)
"%APP_ROOT%backend\venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000
