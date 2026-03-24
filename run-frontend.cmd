@echo off
setlocal
set "APP_ROOT=%~dp0"
cd /d "%APP_ROOT%frontend"
set BACKEND_URL=http://127.0.0.1:8000
set NODE_OPTIONS=--no-deprecation
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
