#!/usr/bin/env bash
set -euo pipefail

# Render-compatible startup script for the FastAPI backend.
# Usage: ./scripts/start-backend.sh

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$APP_ROOT/backend"

export USE_LOCAL_SQLITE=0
export PYTHONPATH="$APP_ROOT:${PYTHONPATH:-}"

cd "$APP_ROOT"

# Use the PORT provided by Render, or default to 8000
PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

echo "Starting backend in Supabase/Postgres mode on $HOST:$PORT ..."

exec uvicorn backend.main:app \
  --host "$HOST" \
  --port "$PORT" \
  --workers 1 \
  --proxy-headers
