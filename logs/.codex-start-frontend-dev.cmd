@echo off
setlocal EnableExtensions
set "APP_ROOT=%~dp0.."
for %%I in ("%APP_ROOT%") do set "APP_ROOT=%%~fI"
set "FRONTEND_DIR=%APP_ROOT%\frontend"

cd /d "%FRONTEND_DIR%" || exit /b 1

set "BACKEND_URL=http://127.0.0.1:8000"
set "NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000"
set "NEXT_PUBLIC_BACKEND_WS_URL=ws://127.0.0.1:8000"
set "NODE_OPTIONS=--no-deprecation"
set "NEXT_TELEMETRY_DISABLED=1"

call "C:\Program Files\nodejs\npm.cmd" run dev -- --hostname 127.0.0.1 --port 3000 >> "%APP_ROOT%\logs\frontend.dev.log" 2>&1
