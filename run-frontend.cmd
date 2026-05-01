@echo off
setlocal
set "APP_ROOT=%~dp0"
set "FRONTEND_DIR=%APP_ROOT%frontend"
set "BACKEND_DIR=%APP_ROOT%backend"

call :load_env_file "%FRONTEND_DIR%\.env.local"
call :load_env_file "%FRONTEND_DIR%\.env"
call :load_env_file "%APP_ROOT%.env.local"
call :load_env_file "%BACKEND_DIR%\.env"
call :load_env_file "%APP_ROOT%.env"

cd /d "%FRONTEND_DIR%" || exit /b 1
if not defined FRONTEND_HOST set "FRONTEND_HOST=localhost"
if not defined FRONTEND_PORT set "FRONTEND_PORT=3000"
if not defined BACKEND_URL set "BACKEND_URL=http://127.0.0.1:8000"
if not defined NODE_OPTIONS set "NODE_OPTIONS=--no-deprecation"
if not defined SKIP_FRONTEND_BUILD set "SKIP_FRONTEND_BUILD=0"
if not defined NEXT_TELEMETRY_DISABLED set "NEXT_TELEMETRY_DISABLED=1"

if not defined NEXT_PUBLIC_SUPABASE_URL if defined SUPABASE_URL set "NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%"
if not defined NEXT_PUBLIC_SUPABASE_URL if defined REACT_APP_SUPABASE_URL set "NEXT_PUBLIC_SUPABASE_URL=%REACT_APP_SUPABASE_URL%"
if not defined NEXT_PUBLIC_SUPABASE_ANON_KEY if defined SUPABASE_ANON_KEY set "NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_ANON_KEY%"
if not defined NEXT_PUBLIC_SUPABASE_ANON_KEY if defined REACT_APP_ANON_KEY set "NEXT_PUBLIC_SUPABASE_ANON_KEY=%REACT_APP_ANON_KEY%"
if not defined NEXT_PUBLIC_BACKEND_URL set "NEXT_PUBLIC_BACKEND_URL=%BACKEND_URL%"
if not defined NEXT_PUBLIC_BACKEND_WS_URL call :derive_ws_url "%NEXT_PUBLIC_BACKEND_URL%"

if not defined NEXT_PUBLIC_SUPABASE_URL (
  echo NEXT_PUBLIC_SUPABASE_URL is not configured.
  echo Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_URL, or REACT_APP_SUPABASE_URL in your env files.
  exit /b 1
)

if not defined NEXT_PUBLIC_SUPABASE_ANON_KEY (
  echo NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.
  echo Set NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY, or REACT_APP_ANON_KEY in your env files.
  exit /b 1
)

if not defined SUPABASE_SERVICE_ROLE_KEY if not defined SUPABASE_SERVICE_KEY if not defined SUPABASE_SERVICE_ROLE (
  echo No Supabase service-role key is configured for frontend server routes.
  echo Set SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, or SUPABASE_SERVICE_ROLE in backend\.env or .env.
  exit /b 1
)

if not exist "node_modules" (
  echo Frontend dependencies not found.
  echo Run "cd frontend" then "npm install" from PowerShell before starting the frontend.
  exit /b 1
)
if /I not "%SKIP_FRONTEND_BUILD%"=="1" (
  if exist ".next" (
    echo Clearing stale frontend build artifacts...
    rmdir /s /q ".next"
  )
  echo Building frontend before startup...
  call npm.cmd run build
  if errorlevel 1 exit /b 1
)
if /I "%SKIP_FRONTEND_BUILD%"=="1" if not exist ".next\BUILD_ID" (
  echo SKIP_FRONTEND_BUILD=1 was set, but no compiled frontend build was found.
  echo Run this script without SKIP_FRONTEND_BUILD=1 or build the frontend manually first.
  exit /b 1
)
echo Starting frontend in production mode against %BACKEND_URL%...
call npm.cmd run start -- --hostname %FRONTEND_HOST% --port %FRONTEND_PORT%
exit /b %errorlevel%

:derive_ws_url
set "WS_SOURCE=%~1"
if not defined WS_SOURCE exit /b 0
set "NEXT_PUBLIC_BACKEND_WS_URL=%WS_SOURCE:http://=ws://%"
if /I "%NEXT_PUBLIC_BACKEND_WS_URL%"=="%WS_SOURCE%" set "NEXT_PUBLIC_BACKEND_WS_URL=%WS_SOURCE:https://=wss://%"
set "WS_SOURCE="
exit /b 0

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
