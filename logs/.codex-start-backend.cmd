@echo off
setlocal EnableExtensions
set "APP_ROOT=%~dp0.."
for %%I in ("%APP_ROOT%") do set "APP_ROOT=%%~fI"
cd /d "%APP_ROOT%" || exit /b 1

set "BACKEND_REQUIREMENTS_INSTALL=0"
set "BACKEND_PRESTART_COMPILE=0"
set "RESTART_IF_RUNNING=1"

call "%APP_ROOT%\run-backend.cmd" >> "%APP_ROOT%\logs\backend.combined.log" 2>&1
