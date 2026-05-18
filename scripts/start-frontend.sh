#!/usr/bin/env bash
set -euo pipefail

# Render-compatible startup script for the Next.js frontend.
# Usage: ./scripts/start-frontend.sh

FRONTEND_DIR="$(cd "$(dirname "$0")/../frontend" && pwd)"
cd "$FRONTEND_DIR"

# Inherit BACKEND_URL from env or default.
if [ -z "${NEXT_PUBLIC_BACKEND_URL:-}" ]; then
    if [ -n "${BACKEND_URL:-}" ]; then
        export NEXT_PUBLIC_BACKEND_URL="$BACKEND_URL"
    elif [ -n "${RENDER:-}" ]; then
        export NEXT_PUBLIC_BACKEND_URL=""
    else
        export NEXT_PUBLIC_BACKEND_URL="http://127.0.0.1:8000"
    fi
fi
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${VITE_SUPABASE_URL:-${SUPABASE_URL:-}}}"
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-${VITE_SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}}}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-${VITE_SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_ANON_KEY:-}}}}"
export VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}}"

# Use the PORT provided by Render, or default to 3000.
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"

echo "Starting frontend production server on $HOST:$PORT ..."
echo "Backend target: $NEXT_PUBLIC_BACKEND_URL"
if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] && [ -n "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}" ]; then
    echo "Supabase public configuration detected for frontend startup."
else
    echo "WARNING: Supabase public configuration is incomplete for frontend startup."
fi

exec npm start -- --hostname "$HOST" --port "$PORT"
