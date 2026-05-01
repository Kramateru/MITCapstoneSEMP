"""Environment helpers for the backend runtime."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_FALSE_VALUES = {"0", "false", "no", "off"}


def load_backend_environment() -> None:
    """Load backend-local env first, then fall back to the repo root env."""
    backend_dir = Path(__file__).resolve().parent
    backend_env = backend_dir / ".env"
    root_env = backend_dir.parent / ".env"

    for env_path in (backend_env, root_env):
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=False)


def use_local_sqlite() -> bool:
    """Backward-compatible shim for the retired SQLite toggle."""
    raw_value = os.getenv("USE_LOCAL_SQLITE")
    if raw_value is not None and raw_value.strip().lower() not in _FALSE_VALUES:
        raise RuntimeError(
            "SQLite mode has been removed. Configure the backend with the Supabase "
            "Postgres DATABASE_URL and keep USE_LOCAL_SQLITE=0."
        )
    return False


def resolve_database_url() -> str:
    """Resolve the Supabase Postgres database URL for the live runtime."""
    use_local_sqlite()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL must point to the Supabase Postgres database for the live runtime."
        )

    normalized = database_url.strip().lower()
    if "postgresql" not in normalized:
        raise RuntimeError(
            "DATABASE_URL must be a PostgreSQL/Supabase connection string. "
            "Other database engines are no longer supported."
        )

    return database_url
