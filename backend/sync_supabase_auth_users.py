"""
One-time migration helper to ensure existing local users are provisioned in
Supabase Auth without overwriting passwords that Supabase already owns.
"""

from __future__ import annotations

from backend.database import SessionLocal
from backend.models import User
from backend.services.supabase_auth_service import sync_user_to_supabase_auth


def main() -> None:
    db = SessionLocal()
    created = 0
    updated = 0
    mismatched_ids = 0

    try:
        users = db.query(User).order_by(User.created_at.asc(), User.email.asc()).all()
        print(f"Syncing {len(users)} local users to Supabase Auth...")

        for user in users:
            result = sync_user_to_supabase_auth(db, user, update_password=False)
            status = result.get("status")
            if status == "created":
                created += 1
            else:
                updated += 1

            if not result.get("matched_local_id", True):
                mismatched_ids += 1

            print(
                f"  {user.email} -> {result.get('supabase_user_id')} "
                f"({status}, matched_local_id={result.get('matched_local_id', True)})"
            )

        db.commit()

        print("Supabase Auth sync complete.")
        print(f"  created: {created}")
        print(f"  updated: {updated}")
        print(f"  mismatched_ids: {mismatched_ids}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
