@echo off
setlocal
set "APP_ROOT=%~dp0"
set "BACKEND_DIR=%APP_ROOT%backend"

call :load_env_file "%BACKEND_DIR%\.env"
call :load_env_file "%APP_ROOT%.env"

if not defined BACKEND_HOST set "BACKEND_HOST=127.0.0.1"
if not defined BACKEND_PORT set "BACKEND_PORT=8000"
if not defined FRONTEND_URL set "FRONTEND_URL=http://localhost:3000"
if not defined BACKEND_URL set "BACKEND_URL=http://%BACKEND_HOST%:%BACKEND_PORT%"
if not defined USE_LOCAL_SQLITE set "USE_LOCAL_SQLITE=0"

if /I not "%USE_LOCAL_SQLITE%"=="0" (
  echo This launcher is locked to Supabase/Postgres mode.
  echo Set USE_LOCAL_SQLITE=0 and make sure the Supabase environment variables are available.
  exit /b 1
)

cd /d "%APP_ROOT%" || exit /b 1

set "PYTHON_EXE=%BACKEND_DIR%\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=%APP_ROOT%venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
  echo Python virtual environment not found.
  echo Expected one of:
  echo   %BACKEND_DIR%\venv\Scripts\python.exe
  echo   %APP_ROOT%venv\Scripts\python.exe
  exit /b 1
)

echo Starting backend in Supabase production mode...
echo The backend will validate Supabase and sync local users into auth.users during startup.

"%PYTHON_EXE%" -m uvicorn backend.main:app --host %BACKEND_HOST% --port %BACKEND_PORT%
exit /b %errorlevel%

:load_env_file
if not exist "%~1" exit /b 0
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~1") do (
  if not "%%~A"=="" call :set_env_if_missing "%%~A" "%%~B"
)
exit /b 0

:set_env_if_missing
if "%~1"=="" exit /b 0
call set "__ENV_VALUE=%%%~1%%"
if defined __ENV_VALUE (
  set "__ENV_VALUE="
  exit /b 0
)
set "%~1=%~2"
set "__ENV_VALUE="
exit /b 0
