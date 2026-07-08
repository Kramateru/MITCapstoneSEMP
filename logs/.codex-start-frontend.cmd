@echo off
setlocal EnableExtensions
set "APP_ROOT=%~dp0.."
for %%I in ("%APP_ROOT%") do set "APP_ROOT=%%~fI"
cd /d "%APP_ROOT%" || exit /b 1

set "FRONTEND_INSTALL_DEPS=0"
set "SKIP_FRONTEND_BUILD=1"
set "WAIT_FOR_BACKEND=1"
set "RESTART_IF_RUNNING=1"

call "%APP_ROOT%\run-frontend.cmd" >> "%APP_ROOT%\logs\frontend.combined.log" 2>&1
