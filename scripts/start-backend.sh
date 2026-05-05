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

# Use the PORT provided by Render, or default to 8000
PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

echo "Starting backend in Supabase/Postgres mode on $HOST:$PORT ..."

apt-get update && apt-get install -y espeak-ng && pip install -r requirements.txt

exec uvicorn backend.main:app \
  --host "$HOST" \
  --port "$PORT" \
  --workers 1 \
  --proxy-headers
