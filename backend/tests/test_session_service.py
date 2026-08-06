import pytest
from fastapi import HTTPException, status
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models import Base, User, UserRole, UserSession
from backend.services import session_service


@pytest.fixture
def sqlite_session_factory():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    yield SessionLocal
    Base.metadata.drop_all(engine)


def test_validate_user_session_returns_none_when_table_is_unavailable():
    engine = create_engine("sqlite:///:memory:")
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    user = User(
        id="user-1",
        email="user@example.com",
        full_name="Test User",
        password_hash="hashed",
        role=UserRole.TRAINEE,
        is_active=True,
    )

    result = session_service.validate_user_session(db, user, "missing-session-id")

    assert result is None


def test_validate_user_session_raises_forced_logout_when_other_session_is_active(sqlite_session_factory):
    SessionLocal = sqlite_session_factory
    db = SessionLocal()

    user = User(
        id="user-2",
        email="user2@example.com",
        full_name="Test User",
        password_hash="hashed",
        role=UserRole.TRAINEE,
        is_active=True,
    )
    db.add(user)
    db.flush()

    active_session = UserSession(
        user_id=user.id,
        session_id="active-session",
        is_active=True,
    )
    db.add(active_session)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        session_service.validate_user_session(db, user, "stale-session-id")

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert session_service.FORCED_LOGOUT_MESSAGE in str(exc_info.value.detail)
