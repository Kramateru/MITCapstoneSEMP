#!/usr/bin/env bash
set -euo pipefail

# Render-compatible startup script for the FastAPI backend.
# Usage: ./scripts/start-backend.sh

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$APP_ROOT/backend"

export USE_LOCAL_SQLITE=0
if [ -z "${PYTHONPATH:-}" ]; then
    export PYTHONPATH="$APP_ROOT:$BACKEND_DIR"
else
    export PYTHONPATH="$APP_ROOT:$BACKEND_DIR:$PYTHONPATH"
fi

cd "$APP_ROOT"

# Use the PORT provided by Render, or default to 8000.
PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"
DEFAULT_BACKEND_URL="${RENDER_EXTERNAL_URL:-http://$HOST:$PORT}"
export BACKEND_URL="${BACKEND_URL:-$DEFAULT_BACKEND_URL}"

if [ -z "${FRONTEND_URL:-}" ]; then
    if [ -n "${RENDER:-}" ]; then
        export FRONTEND_URL=""
    else
        export FRONTEND_URL="http://127.0.0.1:3000"
    fi
fi

# Mirror legacy/public aliases into the backend-friendly names when needed.
if [ -z "${SUPABASE_URL:-}" ]; then
    export SUPABASE_URL="${VITE_SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-${REACT_APP_SUPABASE_URL:-}}}"
fi

if [ -z "${SUPABASE_PUBLISHABLE_KEY:-}" ]; then
    export SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-${REACT_APP_ANON_KEY:-}}}}}"
fi

if [ -z "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}" ] && [ -n "${SUPABASE_PUBLISHABLE_KEY:-}" ]; then
    export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$SUPABASE_PUBLISHABLE_KEY"
fi

if [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ] && [ -n "${SUPABASE_PUBLISHABLE_KEY:-}" ]; then
    export NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_PUBLISHABLE_KEY"
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ -n "${SUPABASE_SERVICE_KEY:-}" ]; then
    export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_KEY"
fi

if [ -z "${SUPABASE_SERVICE_KEY:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    export SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
fi

echo "Starting backend in Supabase/Postgres mode on $HOST:$PORT ..."
if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-}}" ]; then
    echo "Supabase admin storage credentials detected for backend startup."
else
    echo "WARNING: Supabase admin storage credentials are not set at process launch."
fi

exec python -m uvicorn backend.main:app \
  --host "$HOST" \
  --port "$PORT" \
  --workers 1 \
  --proxy-headers
