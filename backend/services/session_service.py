"""Server-side user session tracking for single active login enforcement."""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import User, UserSession

ALREADY_LOGGED_IN_MESSAGE = (
    "Your account is already logged in on another device or browser. Please log out first."
)
ALREADY_ACTIVE_MESSAGE = "This account is already active on another device or browser."
SESSION_EXPIRED_MESSAGE = "Your session has expired. Please log in again."
FORCED_LOGOUT_MESSAGE = (
    "Your session has been terminated because another active session was detected."
)


def _normalize_bool(value: Optional[str], *, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_single_session_mode() -> str:
    mode = os.getenv("SINGLE_SESSION_MODE", "block").strip().lower()
    if mode in {"replace", "terminate_previous", "force_new"}:
        return "replace"
    return "block"


def strict_single_session_enabled() -> bool:
    return _normalize_bool(os.getenv("STRICT_SINGLE_SESSION"), default=False)


def get_session_timeout_minutes() -> int:
    raw_value = os.getenv("SESSION_INACTIVITY_TIMEOUT_MINUTES", "10").strip()
    try:
        timeout = int(raw_value)
    except ValueError:
        return 10
    return max(1, timeout)


def get_session_timeout_seconds() -> int:
    return get_session_timeout_minutes() * 60


def _now() -> datetime:
    return datetime.utcnow()


def generate_session_id() -> str:
    return secrets.token_urlsafe(32)


def _client_ip(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()[:64] or None
    return request.client.host[:64] if request.client and request.client.host else None


def _browser_info(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    user_agent = request.headers.get("user-agent", "").strip()
    return user_agent[:500] or None


def _device_info(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    platform = request.headers.get("sec-ch-ua-platform", "").strip().strip('"')
    mobile = request.headers.get("sec-ch-ua-mobile", "").strip()
    if platform and mobile:
        return f"{platform}; mobile={mobile}"[:255]
    if platform:
        return platform[:255]
    return None


def expire_stale_sessions(db: Session, user_id: Optional[str] = None) -> int:
    cutoff = _now() - timedelta(minutes=get_session_timeout_minutes())
    query = db.query(UserSession).filter(
        UserSession.is_active.is_(True),
        UserSession.last_activity < cutoff,
    )
    if user_id:
        query = query.filter(UserSession.user_id == user_id)

    expired_count = query.update(
        {
            UserSession.is_active: False,
            UserSession.updated_at: _now(),
        },
        synchronize_session=False,
    )
    if expired_count:
        db.flush()
    return int(expired_count or 0)


def get_active_session(db: Session, user_id: str) -> Optional[UserSession]:
    expire_stale_sessions(db, user_id=user_id)
    return (
        db.query(UserSession)
        .filter(UserSession.user_id == user_id, UserSession.is_active.is_(True))
        .order_by(UserSession.last_activity.desc())
        .first()
    )


def start_login_session(db: Session, user: User, request: Optional[Request]) -> UserSession:
    active_session = get_active_session(db, user.id)
    mode = get_single_session_mode()

    if active_session and mode == "block":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ALREADY_LOGGED_IN_MESSAGE,
        )

    if active_session and mode == "replace":
        (
            db.query(UserSession)
            .filter(UserSession.user_id == user.id, UserSession.is_active.is_(True))
            .update(
                {
                    UserSession.is_active: False,
                    UserSession.updated_at: _now(),
                },
                synchronize_session=False,
            )
        )
        db.flush()

    now = _now()
    session = UserSession(
        user_id=user.id,
        session_id=generate_session_id(),
        login_time=now,
        last_activity=now,
        browser_info=_browser_info(request),
        device_info=_device_info(request),
        ip_address=_client_ip(request),
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(session)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ALREADY_LOGGED_IN_MESSAGE,
        ) from exc

    return session


def deactivate_session(db: Session, session_id: Optional[str]) -> bool:
    if not session_id:
        return False

    updated = (
        db.query(UserSession)
        .filter(UserSession.session_id == session_id, UserSession.is_active.is_(True))
        .update(
            {
                UserSession.is_active: False,
                UserSession.updated_at: _now(),
            },
            synchronize_session=False,
        )
    )
    db.flush()
    return bool(updated)


def validate_user_session(db: Session, user: User, session_id: Optional[str]) -> UserSession:
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=SESSION_EXPIRED_MESSAGE,
        )

    expire_stale_sessions(db, user_id=user.id)
    session = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == user.id,
            UserSession.session_id == session_id,
            UserSession.is_active.is_(True),
        )
        .first()
    )
    if session:
        return session

    active_session = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id, UserSession.is_active.is_(True))
        .first()
    )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=FORCED_LOGOUT_MESSAGE if active_session else SESSION_EXPIRED_MESSAGE,
    )


def touch_user_session(db: Session, user: User, session_id: Optional[str]) -> UserSession:
    session = validate_user_session(db, user, session_id)
    session.last_activity = _now()
    session.updated_at = _now()
    db.flush()
    return session
