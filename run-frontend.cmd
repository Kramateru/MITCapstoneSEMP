@echo off
setlocal
set "APP_ROOT=%~dp0"
cd /d "%APP_ROOT%frontend"
if not defined FRONTEND_HOST set "FRONTEND_HOST=localhost"
if not defined FRONTEND_PORT set "FRONTEND_PORT=3000"
if not defined BACKEND_URL set "BACKEND_URL=http://127.0.0.1:8000"
if not defined NODE_OPTIONS set "NODE_OPTIONS=--no-deprecation"
if not exist ".next\BUILD_ID" (
  echo Frontend build not found.
  echo Run "cd frontend" then "npm run build" from PowerShell before starting the frontend.
  exit /b 1
)
npm.cmd run start -- --hostname %FRONTEND_HOST% --port %FRONTEND_PORT%
