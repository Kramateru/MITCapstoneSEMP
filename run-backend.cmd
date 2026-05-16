@echo off
setlocal
set "APP_ROOT=%~dp0"
set "BACKEND_DIR=%APP_ROOT%backend"

call :load_env_file "%BACKEND_DIR%\.env.local"
call :load_env_file "%BACKEND_DIR%\.env"
call :load_env_file "%APP_ROOT%.env.local"
call :load_env_file "%APP_ROOT%.env"

if defined HOST if not defined BACKEND_HOST set "BACKEND_HOST=%HOST%"
if defined PORT if not defined BACKEND_PORT set "BACKEND_PORT=%PORT%"
if not defined BACKEND_HOST set "BACKEND_HOST=127.0.0.1"
if not defined BACKEND_PORT set "BACKEND_PORT=8000"
if not defined FRONTEND_URL set "FRONTEND_URL=http://127.0.0.1:3000"
if not defined BACKEND_URL set "BACKEND_URL=http://%BACKEND_HOST%:%BACKEND_PORT%"
if not defined USE_LOCAL_SQLITE set "USE_LOCAL_SQLITE=0"
if not defined RESTART_IF_RUNNING set "RESTART_IF_RUNNING=1"
if not defined STRICT_SUPABASE_PROJECT_CHECK set "STRICT_SUPABASE_PROJECT_CHECK=0"

if /I not "%USE_LOCAL_SQLITE%"=="0" (
  echo This launcher is locked to Supabase/Postgres mode.
  echo Set USE_LOCAL_SQLITE=0 and make sure the Supabase environment variables are available.
  exit /b 1
)

cd /d "%APP_ROOT%" || exit /b 1

if defined PYTHONPATH (
  set "PYTHONPATH=%APP_ROOT%;%BACKEND_DIR%;%PYTHONPATH%"
) else (
  set "PYTHONPATH=%APP_ROOT%;%BACKEND_DIR%"
)

set "PYTHON_EXE=%BACKEND_DIR%\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=%APP_ROOT%venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
  echo Python virtual environment not found.
  echo Expected one of:
  echo   %BACKEND_DIR%\venv\Scripts\python.exe
  echo   %APP_ROOT%venv\Scripts\python.exe
  exit /b 1
)

call :check_supabase_project_alignment
if errorlevel 1 exit /b 1

call :restart_listener "%BACKEND_PORT%" "backend"
if errorlevel 1 exit /b 1

echo Starting backend in Supabase production mode...
echo The backend will validate Supabase and sync local users into auth.users during startup.
echo Backend URL: %BACKEND_URL%

"%PYTHON_EXE%" -m uvicorn backend.main:app --host %BACKEND_HOST% --port %BACKEND_PORT%
exit /b %errorlevel%

:check_supabase_project_alignment
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$strict = '%STRICT_SUPABASE_PROJECT_CHECK%';" ^
  "$url = ($env:SUPABASE_URL, $env:NEXT_PUBLIC_SUPABASE_URL, $env:REACT_APP_SUPABASE_URL | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1);" ^
  "$anon = ($env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, $env:SUPABASE_KEY, $env:NEXT_PUBLIC_SUPABASE_ANON_KEY, $env:REACT_APP_ANON_KEY | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1);" ^
  "$service = ($env:SUPABASE_SERVICE_ROLE_KEY, $env:SUPABASE_SERVICE_KEY, $env:SUPABASE_SERVICE_ROLE | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1);" ^
  "function Get-ProjectRefFromUrl([string]$value) { try { return ([uri]$value).Host.Split('.')[0] } catch { return '' } }" ^
  "function Get-ProjectRefFromJwt([string]$value) { try { $part = $value.Split('.')[1]; if (-not $part) { return '' }; $padding = '=' * ((4 - $part.Length %% 4) %% 4); $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($part + $padding).Replace('-', '+').Replace('_', '/'))); return ((ConvertFrom-Json $json).ref) } catch { return '' } }" ^
  "$urlRef = Get-ProjectRefFromUrl $url;" ^
  "$anonRef = Get-ProjectRefFromJwt $anon;" ^
  "$serviceRef = Get-ProjectRefFromJwt $service;" ^
  "$mismatch = $false;" ^
  "if ($urlRef -and $anonRef -and $urlRef -ne $anonRef) { Write-Host ('WARNING: Supabase public key belongs to project ' + $anonRef + ', but SUPABASE_URL points to ' + $urlRef + '.'); $mismatch = $true }" ^
  "if ($urlRef -and $serviceRef -and $urlRef -ne $serviceRef) { Write-Host ('WARNING: Supabase service-role key belongs to project ' + $serviceRef + ', but SUPABASE_URL points to ' + $urlRef + '.'); $mismatch = $true }" ^
  "if ($mismatch) { Write-Host 'Update the Supabase URL and keys so they all point to the same project before relying on assessment features.'; if ($strict -eq '1') { exit 1 } }"
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
