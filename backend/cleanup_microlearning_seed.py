"""
Permanently remove the legacy seeded microlearning categories, modules, assignments,
and related certificates from the active database.

Run with the desired DATABASE_URL already loaded. In this repo, that means:
- local SQLite for local verification
- Supabase Postgres when using the root .env value
"""

from .database import SessionLocal
from .services.microlearning_catalog import cleanup_seeded_microlearning_library


def cleanup() -> dict[str, int]:
    db = SessionLocal()
    try:
        summary = cleanup_seeded_microlearning_library(db)
        db.commit()

        print("Legacy microlearning seed cleanup completed.")
        for key, value in summary.items():
            print(f"{key}: {value}")
        return summary
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    cleanup()
