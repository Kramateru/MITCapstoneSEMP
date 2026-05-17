"""
Helpers for authenticating platform users against the Supabase auth schema
stored in Postgres and keeping local users aligned with auth.users records.
"""

from __future__ import annotations

import json
from datetime import datetime
import os
from typing import Any, Sequence

import requests
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from .. import auth_utils
from ..config_validation import (
    extract_supabase_project_ref_from_key,
    extract_supabase_project_ref_from_url,
    is_usable_supabase_publishable_key,
    is_usable_supabase_url,
    normalize_env_value,
    resolve_supabase_publishable_key,
    resolve_supabase_url,
    supabase_key_matches_url,
)
from ..models import User


class SupabaseAuthServiceError(RuntimeError):
    """Base error for Supabase auth integration failures."""


class SupabaseAuthConfigurationError(SupabaseAuthServiceError):
    """Raised when the Supabase auth store is unavailable."""


class SupabaseAuthenticationError(SupabaseAuthServiceError):
    """Raised when Supabase rejects the submitted credentials."""


class SupabaseAuthInputError(SupabaseAuthServiceError):
    """Raised when a login request contains invalid auth input."""


class SupabaseUserSyncError(SupabaseAuthServiceError):
    """Raised when a local user cannot be synced into Supabase Auth."""


def _get_supabase_auth_rest_config() -> tuple[str, str]:
    supabase_url = resolve_supabase_url(os.getenv)
    publishable_key = resolve_supabase_publishable_key(os.getenv)

    if not is_usable_supabase_url(supabase_url):
        raise SupabaseAuthConfigurationError(
            "Supabase Auth REST is unavailable because SUPABASE_URL is missing or invalid."
        )

    if not is_usable_supabase_publishable_key(publishable_key):
        raise SupabaseAuthConfigurationError(
            "Supabase Auth REST is unavailable because the public API key is missing or invalid."
        )

    if not supabase_key_matches_url(supabase_url, publishable_key):
        url_ref = extract_supabase_project_ref_from_url(supabase_url) or "unknown"
        key_ref = extract_supabase_project_ref_from_key(publishable_key) or "unknown"
        raise SupabaseAuthConfigurationError(
            "Supabase Auth REST is unavailable because the configured public API key "
            f"belongs to project {key_ref}, but the Supabase URL points to project {url_ref}."
        )

    return supabase_url.rstrip("/"), publishable_key


def _request_supabase_auth_session(
    *,
    grant_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    supabase_url, publishable_key = _get_supabase_auth_rest_config()
    endpoint = f"{supabase_url}/auth/v1/token?grant_type={grant_type}"

    try:
        response = requests.post(
            endpoint,
            headers={
                "apikey": publishable_key,
                "Authorization": f"Bearer {publishable_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
    except requests.RequestException as exc:
        raise SupabaseAuthServiceError(
            "Unable to reach Supabase Auth while creating a session."
        ) from exc

    try:
        response_payload = response.json() if response.content else {}
    except ValueError:
        response_payload = {}
    if not response.ok:
        detail = (
            response_payload.get("msg")
            or response_payload.get("error_description")
            or response_payload.get("error")
            or "Supabase rejected the session request."
        )

        if response.status_code in {400, 401, 422}:
            raise SupabaseAuthenticationError(str(detail))

        raise SupabaseAuthServiceError(str(detail))

    return response_payload


def _normalized_email(email: str) -> str:
    return (email or "").strip().lower()


def _validate_auth_password(password: str, *, field_name: str = "Password") -> str:
    try:
        return auth_utils.validate_password_length(password, field_name=field_name)
    except auth_utils.PasswordValidationError as exc:
        raise SupabaseAuthInputError(str(exc)) from exc


def _uses_supabase_auth_schema(db: Session) -> bool:
    bind = db.get_bind()
    return bind is not None and bind.dialect.name == "postgresql"


def _load_active_supabase_auth_emails(
    db: Session,
    candidate_emails: Sequence[str],
) -> set[str]:
    normalized_candidates = sorted(
        {
            _normalized_email(email)
            for email in candidate_emails
            if _normalized_email(email)
        }
    )
    if not normalized_candidates:
        return set()

    if not _uses_supabase_auth_schema(db):
        raise SupabaseAuthConfigurationError(
            "Supabase Auth is unavailable because the backend is not connected to Supabase Postgres."
        )

    statement = text(
        """
        select lower(email) as email
        from auth.users
        where lower(email) in :emails
          and deleted_at is null
          and encrypted_password is not null
          and (banned_until is null or banned_until <= now())
        """
    ).bindparams(bindparam("emails", expanding=True))

    try:
        rows = db.execute(statement, {"emails": normalized_candidates}).mappings().all()
    except Exception as exc:
        raise SupabaseAuthConfigurationError(
            "Unable to reach the Supabase credentials store. Please try again."
        ) from exc

    return {
        row["email"]
        for row in rows
        if isinstance(row.get("email"), str) and row["email"].strip()
    }


def filter_to_supabase_active_users(db: Session, users: Sequence[User]) -> list[User]:
    """Keep only local users that still have an active Supabase auth.users record."""
    if not users:
        return []

    ordered_users: list[tuple[str, User]] = []
    seen_user_ids: set[str] = set()
    for user in users:
        if not user or not getattr(user, "id", None) or user.id in seen_user_ids:
            continue
        normalized_email = _normalized_email(getattr(user, "email", ""))
        if not normalized_email:
            continue
        ordered_users.append((normalized_email, user))
        seen_user_ids.add(user.id)

    active_emails = _load_active_supabase_auth_emails(
        db,
        [email for email, _ in ordered_users],
    )
    return [user for email, user in ordered_users if email in active_emails]


def _build_app_metadata(local_user: User) -> str:
    return json.dumps(
        {
            "provider": "email",
            "providers": ["email"],
            "role": local_user.role.value,
        }
    )


def _build_user_metadata(local_user: User) -> str:
    return json.dumps(
        {
            "full_name": local_user.full_name,
            "role": local_user.role.value,
            "lob": local_user.lob,
            "department": local_user.department,
            "language_dialect": local_user.language_dialect,
        }
    )


def _build_identity_metadata(user_id: str, email: str) -> str:
    return json.dumps(
        {
            "sub": user_id,
            "email": email,
            "email_verified": True,
            "phone_verified": False,
        }
    )


def get_auth_provider_status(db: Session) -> dict[str, Any]:
    """Report which credential store is currently active for login checks."""
    if not _uses_supabase_auth_schema(db):
        return {
            "provider": "supabase",
            "uses_supabase": True,
            "available": False,
            "credential_source": "auth.users",
            "message": "Backend is not connected to Supabase Postgres.",
        }

    try:
        db.execute(text("select 1 from auth.users limit 1"))
    except Exception:
        return {
            "provider": "supabase",
            "uses_supabase": True,
            "available": False,
            "credential_source": "auth.users",
            "message": "Unable to reach Supabase Auth right now.",
        }

    return {
        "provider": "supabase",
        "uses_supabase": True,
        "available": True,
        "credential_source": "auth.users",
        "message": "Supabase Auth is connected for credential checks.",
    }


def authenticate_supabase_credentials(db: Session, email: str, password: str) -> dict[str, Any]:
    """Validate an email/password pair against Supabase's auth.users table."""
    normalized_email = _normalized_email(email)
    if not normalized_email:
        raise SupabaseAuthInputError("Email is required.")
    normalized_password = _validate_auth_password(password)

    if not _uses_supabase_auth_schema(db):
        raise SupabaseAuthConfigurationError(
            "Supabase Auth is unavailable because the backend is not connected to Supabase Postgres."
        )

    try:
        record = (
            db.execute(
                text(
                    """
                    select
                        id::text as id,
                        email,
                        encrypted_password,
                        banned_until,
                        deleted_at
                    from auth.users
                    where lower(email) = :email
                    limit 1
                    """
                ),
                {"email": normalized_email},
            )
            .mappings()
            .first()
        )
    except Exception as exc:
        raise SupabaseAuthConfigurationError(
            "Unable to reach the Supabase credentials store. Please try again."
        ) from exc

    if not record or record["deleted_at"] is not None or not record["encrypted_password"]:
        raise SupabaseAuthenticationError("Invalid email or password")

    if not auth_utils.verify_password(normalized_password, record["encrypted_password"]):
        raise SupabaseAuthenticationError("Invalid email or password")

    banned_until = record["banned_until"]
    if banned_until is not None and banned_until > datetime.utcnow():
        raise SupabaseAuthenticationError("This Supabase account is currently disabled.")

    return dict(record)


def issue_supabase_session(email: str, password: str) -> dict[str, Any]:
    normalized_email = _normalized_email(email)
    if not normalized_email:
        raise SupabaseAuthInputError("Email is required.")
    normalized_password = _validate_auth_password(password)

    return _request_supabase_auth_session(
        grant_type="password",
        payload={
            "email": normalized_email,
            "password": normalized_password,
        },
    )


def refresh_supabase_session(refresh_token: str) -> dict[str, Any]:
    normalized_refresh_token = (refresh_token or "").strip()
    if not normalized_refresh_token:
        raise SupabaseAuthInputError("Supabase refresh token is required.")

    return _request_supabase_auth_session(
        grant_type="refresh_token",
        payload={
            "refresh_token": normalized_refresh_token,
        },
    )


def sync_user_to_supabase_auth(db: Session, local_user: User) -> dict[str, Any]:
    """
    Ensure a local platform user has a matching Supabase auth.users record.

    The local bcrypt hash is copied into auth.users so the platform login only
    accepts the credentials stored in the Supabase auth schema.
    """
    normalized_email = _normalized_email(local_user.email)
    if not normalized_email:
        raise SupabaseUserSyncError("Supabase sync requires the user to have a valid email address.")

    if not _uses_supabase_auth_schema(db):
        raise SupabaseUserSyncError(
            "Supabase sync requires the backend to be connected to Supabase Postgres."
        )

    now = datetime.utcnow()
    app_metadata = _build_app_metadata(local_user)
    user_metadata = _build_user_metadata(local_user)
    identity_metadata = _build_identity_metadata(local_user.id, normalized_email)

    try:
        existing_user = (
            db.execute(
                text(
                    """
                    select id::text as id
                    from auth.users
                    where lower(email) = :email
                    limit 1
                    """
                ),
                {"email": normalized_email},
            )
            .mappings()
            .first()
        )

        if existing_user is None:
            db.execute(
                text(
                    """
                    insert into auth.users (
                        id,
                        instance_id,
                        aud,
                        role,
                        email,
                        encrypted_password,
                        email_confirmed_at,
                        raw_app_meta_data,
                        raw_user_meta_data,
                        created_at,
                        updated_at,
                        is_super_admin,
                        is_sso_user,
                        is_anonymous
                    ) values (
                        cast(:user_id as uuid),
                        null,
                        'authenticated',
                        'authenticated',
                        :email,
                        :encrypted_password,
                        :confirmed_at,
                        cast(:app_metadata as jsonb),
                        cast(:user_metadata as jsonb),
                        :created_at,
                        :updated_at,
                        false,
                        false,
                        false
                    )
                    """
                ),
                {
                    "user_id": local_user.id,
                    "email": normalized_email,
                    "encrypted_password": local_user.password_hash,
                    "confirmed_at": now,
                    "app_metadata": app_metadata,
                    "user_metadata": user_metadata,
                    "created_at": local_user.created_at or now,
                    "updated_at": now,
                },
            )
            matched_local_id = True
            supabase_user_id = local_user.id
            status = "created"
        else:
            supabase_user_id = existing_user["id"]
            matched_local_id = supabase_user_id == local_user.id

            db.execute(
                text(
                    """
                    update auth.users
                    set
                        email = :email,
                        encrypted_password = :encrypted_password,
                        email_confirmed_at = coalesce(email_confirmed_at, :confirmed_at),
                        raw_app_meta_data = cast(:app_metadata as jsonb),
                        raw_user_meta_data = cast(:user_metadata as jsonb),
                        aud = 'authenticated',
                        role = 'authenticated',
                        deleted_at = null,
                        banned_until = null,
                        updated_at = :updated_at
                    where id = cast(:supabase_user_id as uuid)
                    """
                ),
                {
                    "supabase_user_id": supabase_user_id,
                    "email": normalized_email,
                    "encrypted_password": local_user.password_hash,
                    "confirmed_at": now,
                    "app_metadata": app_metadata,
                    "user_metadata": user_metadata,
                    "updated_at": now,
                },
            )
            status = "updated"

        db.execute(
            text(
                """
                insert into auth.identities (
                    user_id,
                    identity_data,
                    provider,
                    provider_id,
                    created_at,
                    updated_at
                ) values (
                    cast(:supabase_user_id as uuid),
                    cast(:identity_data as jsonb),
                    'email',
                    :provider_id,
                    :created_at,
                    :updated_at
                )
                on conflict (provider_id, provider)
                do update set
                    user_id = excluded.user_id,
                    identity_data = excluded.identity_data,
                    updated_at = excluded.updated_at
                """
            ),
            {
                "supabase_user_id": supabase_user_id,
                "identity_data": identity_metadata,
                "provider_id": normalized_email,
                "created_at": local_user.created_at or now,
                "updated_at": now,
            },
        )

        return {
            "status": status,
            "supabase_user_id": supabase_user_id,
            "email": normalized_email,
            "matched_local_id": matched_local_id,
        }
    except SupabaseUserSyncError:
        raise
    except Exception as exc:
        raise SupabaseUserSyncError(
            f"Unable to sync {normalized_email} to Supabase Auth: {exc}"
        ) from exc
