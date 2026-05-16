@echo off
setlocal
set "APP_ROOT=%~dp0"
set "FRONTEND_DIR=%APP_ROOT%frontend"
set "BACKEND_DIR=%APP_ROOT%backend"
if not defined ENV_FILE_OVERRIDE set "ENV_FILE_OVERRIDE=1"

call :load_env_file "%APP_ROOT%.env"
call :load_env_file "%BACKEND_DIR%\.env"
call :load_env_file "%BACKEND_DIR%\.env.local"
call :load_env_file "%APP_ROOT%.env.local"
call :load_env_file "%FRONTEND_DIR%\.env"
call :load_env_file "%FRONTEND_DIR%\.env.local"

cd /d "%FRONTEND_DIR%" || exit /b 1
if defined HOST if not defined FRONTEND_HOST set "FRONTEND_HOST=%HOST%"
if defined PORT if not defined FRONTEND_PORT set "FRONTEND_PORT=%PORT%"
if not defined FRONTEND_HOST set "FRONTEND_HOST=127.0.0.1"
if not defined FRONTEND_PORT set "FRONTEND_PORT=3000"
if not defined BACKEND_URL set "BACKEND_URL=http://127.0.0.1:8000"
if not defined NODE_OPTIONS set "NODE_OPTIONS=--no-deprecation"
if not defined SKIP_FRONTEND_BUILD set "SKIP_FRONTEND_BUILD=0"
if not defined NEXT_TELEMETRY_DISABLED set "NEXT_TELEMETRY_DISABLED=1"
if not defined WAIT_FOR_BACKEND set "WAIT_FOR_BACKEND=1"
if not defined RESTART_IF_RUNNING set "RESTART_IF_RUNNING=1"
if not defined STRICT_SUPABASE_PROJECT_CHECK set "STRICT_SUPABASE_PROJECT_CHECK=0"

if not defined NEXT_PUBLIC_SUPABASE_URL if defined SUPABASE_URL set "NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%"
if not defined NEXT_PUBLIC_SUPABASE_URL if defined REACT_APP_SUPABASE_URL set "NEXT_PUBLIC_SUPABASE_URL=%REACT_APP_SUPABASE_URL%"
if not defined NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY if defined SUPABASE_PUBLISHABLE_KEY set "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=%SUPABASE_PUBLISHABLE_KEY%"
if not defined NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY if defined NEXT_PUBLIC_SUPABASE_ANON_KEY set "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=%NEXT_PUBLIC_SUPABASE_ANON_KEY%"
if not defined NEXT_PUBLIC_SUPABASE_ANON_KEY if defined SUPABASE_ANON_KEY set "NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_ANON_KEY%"
if not defined NEXT_PUBLIC_SUPABASE_ANON_KEY if defined REACT_APP_ANON_KEY set "NEXT_PUBLIC_SUPABASE_ANON_KEY=%REACT_APP_ANON_KEY%"
if not defined NEXT_PUBLIC_SUPABASE_ANON_KEY if defined NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY set "NEXT_PUBLIC_SUPABASE_ANON_KEY=%NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY%"
if not defined NEXT_PUBLIC_BACKEND_URL set "NEXT_PUBLIC_BACKEND_URL=%BACKEND_URL%"
if not defined NEXT_PUBLIC_BACKEND_WS_URL call :derive_ws_url "%NEXT_PUBLIC_BACKEND_URL%"

if not defined NEXT_PUBLIC_SUPABASE_URL (
  echo NEXT_PUBLIC_SUPABASE_URL is not configured.
  echo Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_URL, or REACT_APP_SUPABASE_URL in your env files.
  exit /b 1
)

if not defined NEXT_PUBLIC_SUPABASE_ANON_KEY (
  echo NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.
  echo Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY, or REACT_APP_ANON_KEY in your env files.
  exit /b 1
)

if not defined SUPABASE_SERVICE_ROLE_KEY if not defined SUPABASE_SERVICE_KEY if not defined SUPABASE_SERVICE_ROLE (
  echo No Supabase service-role key is configured for frontend server routes.
  echo Public-key and backend-proxy flows will still start, but storage or privileged Supabase routes may fall back or be unavailable.
)

call :check_supabase_project_alignment
if errorlevel 1 exit /b 1

if not exist "node_modules" (
  echo Frontend dependencies not found.
  echo Run "cd frontend" then "npm install" from PowerShell before starting the frontend.
  exit /b 1
)

if /I not "%WAIT_FOR_BACKEND%"=="0" (
  call :wait_for_backend "%BACKEND_URL%"
  if errorlevel 1 exit /b 1
)

if /I not "%SKIP_FRONTEND_BUILD%"=="1" (
  if exist ".next" (
    echo Clearing stale frontend build artifacts...
    rmdir /s /q ".next"
  )
  echo Building frontend before startup...
  cmd /d /c npm.cmd run build
  if errorlevel 1 exit /b 1
)
set "FRONTEND_BUILD_READY=0"
if exist ".next\BUILD_ID" set "FRONTEND_BUILD_READY=1"
if exist ".next\build" set "FRONTEND_BUILD_READY=1"
if exist ".next\server" set "FRONTEND_BUILD_READY=1"

if /I "%SKIP_FRONTEND_BUILD%"=="1" if /I not "%FRONTEND_BUILD_READY%"=="1" (
  echo SKIP_FRONTEND_BUILD=1 was set, but no compiled frontend build was found.
  echo Run this script without SKIP_FRONTEND_BUILD=1 or build the frontend manually first.
  exit /b 1
)

call :restart_listener "%FRONTEND_PORT%" "frontend"
if errorlevel 1 exit /b 1

echo Starting frontend in production mode against %BACKEND_URL%...
cmd /d /c npm.cmd run start -- --hostname %FRONTEND_HOST% --port %FRONTEND_PORT%
exit /b %errorlevel%

:check_supabase_project_alignment
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$strict = '%STRICT_SUPABASE_PROJECT_CHECK%';" ^
  "$url = ($env:NEXT_PUBLIC_SUPABASE_URL, $env:SUPABASE_URL, $env:REACT_APP_SUPABASE_URL | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1);" ^
  "$anon = ($env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, $env:NEXT_PUBLIC_SUPABASE_ANON_KEY, $env:SUPABASE_ANON_KEY, $env:REACT_APP_ANON_KEY | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1);" ^
  "$service = ($env:SUPABASE_SERVICE_ROLE_KEY, $env:SUPABASE_SERVICE_KEY, $env:SUPABASE_SERVICE_ROLE | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1);" ^
  "function Get-ProjectRefFromUrl([string]$value) { try { return ([uri]$value).Host.Split('.')[0] } catch { return '' } }" ^
  "function Get-ProjectRefFromJwt([string]$value) { try { $part = $value.Split('.')[1]; if (-not $part) { return '' }; $padding = '=' * ((4 - $part.Length %% 4) %% 4); $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($part + $padding).Replace('-', '+').Replace('_', '/'))); return ((ConvertFrom-Json $json).ref) } catch { return '' } }" ^
  "$urlRef = Get-ProjectRefFromUrl $url;" ^
  "$anonRef = Get-ProjectRefFromJwt $anon;" ^
  "$serviceRef = Get-ProjectRefFromJwt $service;" ^
  "$mismatch = $false;" ^
  "if ($urlRef -and $anonRef -and $urlRef -ne $anonRef) { Write-Host ('WARNING: NEXT_PUBLIC_SUPABASE_ANON_KEY belongs to project ' + $anonRef + ', but NEXT_PUBLIC_SUPABASE_URL points to ' + $urlRef + '.'); $mismatch = $true }" ^
  "if ($urlRef -and $serviceRef -and $urlRef -ne $serviceRef) { Write-Host ('WARNING: Supabase service-role key belongs to project ' + $serviceRef + ', but NEXT_PUBLIC_SUPABASE_URL points to ' + $urlRef + '.'); $mismatch = $true }" ^
  "if ($mismatch) { Write-Host 'Update the Supabase URL and keys so they all point to the same project before relying on assessment routes.'; if ($strict -eq '1') { exit 1 } }"
exit /b %errorlevel%

:restart_listener
set "RESTART_PORT=%~1"
set "RESTART_NAME=%~2"
if "%RESTART_PORT%"=="" exit /b 0
set "FOUND_LISTENER="
for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = %RESTART_PORT%; netstat -ano | Select-String (':'+$port+'\s+.*LISTENING\s+\d+$') | ForEach-Object { if ($_.Line -match 'LISTENING\s+(\d+)\s*$') { $matches[1] } } | Sort-Object -Unique"') do (
  set "FOUND_LISTENER=1"
  if /I "%RESTART_IF_RUNNING%"=="0" (
    echo Port %RESTART_PORT% is already in use by PID %%P.
    echo Set RESTART_IF_RUNNING=1 to stop the existing listener automatically.
    exit /b 1
  )
  echo Stopping existing %RESTART_NAME% listener on port %RESTART_PORT% ^(PID %%P^)...
  taskkill /PID %%P /F >nul 2>&1
  if errorlevel 1 (
    echo Failed to stop PID %%P on port %RESTART_PORT%.
    exit /b 1
  )
)
if defined FOUND_LISTENER (
  call :wait_for_port_release "%RESTART_PORT%"
  if errorlevel 1 exit /b 1
)
set "FOUND_LISTENER="
set "RESTART_PORT="
set "RESTART_NAME="
exit /b 0

:wait_for_port_release
if "%~1"=="" exit /b 0
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port = %~1;" ^
  "$deadline = (Get-Date).AddSeconds(15);" ^
  "while ((Get-Date) -lt $deadline) {" ^
  "  $inUse = netstat -ano | Select-String (':'+$port+'\s+.*LISTENING\s+\d+$');" ^
  "  if (-not $inUse) { exit 0 }" ^
  "  Start-Sleep -Milliseconds 500;" ^
  "}" ^
  "Write-Host 'Timed out waiting for port %~1 to be released.';" ^
  "exit 1"
exit /b %errorlevel%

:wait_for_backend
if "%~1"=="" exit /b 0
echo Waiting for backend health at %~1/health...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$baseUrl = '%~1'.TrimEnd('/');" ^
  "$healthUrl = $baseUrl + '/health';" ^
  "$deadline = (Get-Date).AddSeconds(60);" ^
  "while ((Get-Date) -lt $deadline) {" ^
  "  try {" ^
  "    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 5;" ^
  "    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 }" ^
  "  } catch {}" ^
  "  Start-Sleep -Milliseconds 750;" ^
  "}" ^
  "Write-Host 'Backend health check timed out.';" ^
  "exit 1"
if errorlevel 1 (
  echo Backend did not become reachable at %~1/health.
  echo Start the backend first or update BACKEND_URL / NEXT_PUBLIC_BACKEND_URL.
  exit /b 1
)
exit /b 0

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
  if not "%%~A"=="" (
    if /I "%ENV_FILE_OVERRIDE%"=="0" (
      call :set_env_if_missing "%%~A" "%%~B"
    ) else (
      call :set_env_value "%%~A" "%%~B"
    )
  )
)
exit /b 0

:set_env_value
if "%~1"=="" exit /b 0
set "%~1=%~2"
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
