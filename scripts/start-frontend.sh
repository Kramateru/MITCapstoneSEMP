#!/usr/bin/env bash
set -euo pipefail

# Render-compatible startup script for the Next.js frontend.
# Usage: ./scripts/start-frontend.sh

FRONTEND_DIR="$(cd "$(dirname "$0")/../frontend" && pwd)"
cd "$FRONTEND_DIR"

# Inherit BACKEND_URL from env or default
export NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-${BACKEND_URL:-http://127.0.0.1:8000}}"

# Use the PORT provided by Render, or default to 3000
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"

echo "Starting frontend production server on $HOST:$PORT ..."
echo "Backend target: $NEXT_PUBLIC_BACKEND_URL"

exec npm start -- --hostname "$HOST" --port "$PORT"
