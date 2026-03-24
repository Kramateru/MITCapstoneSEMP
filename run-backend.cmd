@echo off
setlocal
set "APP_ROOT=%~dp0"
cd /d "%APP_ROOT%backend"
if /I not "%USE_LOCAL_SQLITE%"=="0" (
  echo Starting backend with local SQLite database...
  set DATABASE_URL=sqlite:///./test.db
) else (
  echo Starting backend with DATABASE_URL from .env or environment...
)
"%APP_ROOT%backend\venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000
