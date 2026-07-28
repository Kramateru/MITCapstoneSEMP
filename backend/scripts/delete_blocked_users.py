"""One-time cleanup script for blocked users.

This script deactivates local platform users, removes their active sessions,
cleans up matching Supabase Auth records, removes profile images from storage,
and deletes related audit log entries so blocked users no longer appear in
admin audit trail searches.

Usage:
    python backend/scripts/delete_blocked_users.py
"""

from __future__ import annotations

import logging
from typing import Iterable

from sqlalchemy import any_, text

from backend.database import SessionLocal
from backend.models import AuditLog, User, UserSession
from backend.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

BLOCKED_USER_EMAILS = [
    "jbchen9454val@student.fatima.edu.ph",
    "mdrivera5864val@student.fatima.edu.ph",
    "mmbaquing8991val@student.fatima.edu.ph",
    "laagustin1673val@student.fatima.edu.ph",
    "rtcastor9510val@student.fatima.edu.ph",
    "dqsopena5651val@student.fatima.edu.ph",
    "jpmadjos1933val@student.fatima.edu.ph",
]


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _delete_supabase_auth_records(db, user: User) -> int:
    deleted_rows = 0
    try:
        db.execute(
            text(
                """
                delete from auth.identities
                where user_id = cast(:user_id as uuid)
                   or lower(provider_id) = :email
                """
            ),
            {
                "user_id": user.id,
                "email": _normalize_email(user.email),
            },
        )
        db.execute(
            text(
                """
                delete from auth.users
                where id = cast(:user_id as uuid)
                   or lower(email) = :email
                """
            ),
            {
                "user_id": user.id,
                "email": _normalize_email(user.email),
            },
        )
        db.execute(
            text(
                "delete from public.profiles where id = cast(:user_id as uuid)"
            ),
            {"user_id": user.id},
        )
        deleted_rows = 1
    except Exception as exc:
        logger.warning(
            "Unable to delete Supabase auth records for user %s: %s",
            user.email,
            exc,
        )
    return deleted_rows


def _cleanup_profile_image(user: User) -> bool:
    if not getattr(user, "profile_image_url", None):
        return False
    try:
        deleted = get_supabase_client().delete_by_public_url(user.profile_image_url)
        if deleted:
            logger.info("Deleted profile image for %s", user.email)
        else:
            logger.warning("Unable to delete profile image for %s", user.email)
        return deleted
    except Exception as exc:
        logger.warning(
            "Supabase storage cleanup failed for %s: %s",
            user.email,
            exc,
        )
        return False


def _delete_audit_logs(db, user: User) -> int:
    query = db.query(AuditLog)
    deleted_count = query.filter(
        (AuditLog.user_id == user.id)
        | (AuditLog.trainee_id == user.id)
        | (AuditLog.trainer_id == user.id)
        | (AuditLog.entity_id == user.id)
    ).delete(synchronize_session=False)
    db.flush()
    return int(deleted_count or 0)


def _deactivate_user_sessions(db, user: User) -> int:
    deleted_count = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id)
        .delete(synchronize_session=False)
    )
    db.flush()
    return int(deleted_count or 0)


def _deactivate_user(db, user: User) -> None:
    user.is_active = False
    user.profile_image_url = None
    db.add(user)
    db.flush()


def _find_users(db, emails: Iterable[str]) -> list[User]:
    normalized = [_normalize_email(email) for email in emails if _normalize_email(email)]
    return (
        db.query(User)
        .filter(User.email.ilike(any_(normalized)))
        .all()
    )


def main() -> None:
    session = SessionLocal()
    try:
        normalized_emails = [_normalize_email(email) for email in BLOCKED_USER_EMAILS]
        users = (
            session.query(User)
            .filter(User.email.ilike(any_(normalized_emails)))
            .all()
        )

        if not users:
            logger.warning("No users found for the blocked email list.")
            return

        logger.info("Found %d blocked user(s) to clean up.", len(users))

        total_sessions = 0
        total_audit_logs = 0
        total_supabase_removed = 0
        total_storage_removed = 0

        for user in users:
            logger.info("Cleaning user %s (%s)", user.email, user.id)
            total_storage_removed += int(_cleanup_profile_image(user))
            _deactivate_user(session, user)
            total_sessions += _deactivate_user_sessions(session, user)
            total_audit_logs += _delete_audit_logs(session, user)
            total_supabase_removed += _delete_supabase_auth_records(session, user)

        session.commit()

        logger.info("Cleanup complete.")
        logger.info("  users cleaned: %d", len(users))
        logger.info("  sessions deleted: %d", total_sessions)
        logger.info("  audit log entries deleted: %d", total_audit_logs)
        logger.info("  Supabase auth records removed: %d", total_supabase_removed)
        logger.info("  storage objects removed: %d", total_storage_removed)
    except Exception as exc:
        session.rollback()
        logger.exception("Failed to clean blocked users: %s", exc)
    finally:
        session.close()


if __name__ == "__main__":
    main()
