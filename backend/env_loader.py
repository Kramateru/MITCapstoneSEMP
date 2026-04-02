"""
Environment helpers for the backend runtime.
"""

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
    """Prefer an explicitly configured DATABASE_URL unless SQLite is forced."""
    raw_value = os.getenv("USE_LOCAL_SQLITE")
    if raw_value is not None:
        return raw_value.strip().lower() not in _FALSE_VALUES

    return not bool(os.getenv("DATABASE_URL"))


def default_sqlite_database_url() -> str:
    """Keep the SQLite database path stable regardless of the current working directory."""
    sqlite_path = (Path(__file__).resolve().parent / "test.db").as_posix()
    return f"sqlite:///{sqlite_path}"


def resolve_database_url() -> str:
    """Resolve the active database URL based on the configured runtime mode."""
    if use_local_sqlite():
        return os.getenv("LOCAL_DATABASE_URL", default_sqlite_database_url())

    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    raise RuntimeError(
        "DATABASE_URL must be set when USE_LOCAL_SQLITE=0. "
        "Set USE_LOCAL_SQLITE=1 to use the bundled SQLite database."
    )
