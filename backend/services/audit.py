"""Audit trail helpers for append-only activity logging."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Iterable, Optional
from uuid import uuid4

from fastapi import Request
from sqlalchemy.orm import Session

from backend import auth_utils
from backend.database import SessionLocal
from backend.models import AuditLog, User

logger = logging.getLogger(__name__)


AUDIT_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
AUDIT_VIEW_PATH_MARKERS = (
    "/analytics",
    "/reports",
    "/export",
    "/admin/dashboard",
    "/coaching",
    "/microlearning",
    "/assessment",
    "/call-simulation",
)
SENSITIVE_FIELDS = {
    "password",
    "password_hash",
    "new_password",
    "old_password",
    "current_password",
    "confirm_password",
    "access_token",
    "refresh_token",
    "supabase_access_token",
    "supabase_refresh_token",
}


def _enum_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    return getattr(value, "value", str(value))


def sanitize_for_audit(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            if key_text.lower() in SENSITIVE_FIELDS:
                sanitized[key_text] = "[redacted]"
            else:
                sanitized[key_text] = sanitize_for_audit(item)
        return sanitized
    if isinstance(value, (list, tuple, set)):
        return [sanitize_for_audit(item) for item in value]
    return str(value)


def snapshot_model(instance: Any, fields: Iterable[str]) -> dict[str, Any]:
    return {
        field: sanitize_for_audit(getattr(instance, field, None))
        for field in fields
    }


def changed_fields(old_data: Optional[dict[str, Any]], new_data: Optional[dict[str, Any]]) -> list[str]:
    old_payload = old_data or {}
    new_payload = new_data or {}
    keys = set(old_payload).union(new_payload)
    return sorted(key for key in keys if old_payload.get(key) != new_payload.get(key))


def get_client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else None


def get_browser_info(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    return request.headers.get("user-agent")


def get_device_type(user_agent: Optional[str]) -> Optional[str]:
    if not user_agent:
        return None
    lowered = user_agent.lower()
    if "mobile" in lowered or "android" in lowered or "iphone" in lowered:
        return "mobile"
    if "ipad" in lowered or "tablet" in lowered:
        return "tablet"
    return "desktop"


def action_from_request(method: str, path: str) -> str:
    normalized_path = path.lower()
    method_upper = method.upper()
    if "/auth/login" in normalized_path:
        return "login_attempt"
    if "/auth/logout" in normalized_path:
        return "logout"
    if method_upper == "POST":
        return "create"
    if method_upper in {"PUT", "PATCH"}:
        return "update"
    if method_upper == "DELETE":
        return "delete"
    if "/export" in normalized_path or "/reports" in normalized_path:
        return "report_viewed"
    if "/analytics" in normalized_path:
        return "analytics_viewed"
    return "view"


def module_from_path(path: str) -> str:
    normalized_path = path.lower()
    module_markers = [
        ("auth", "Authentication"),
        ("users", "User Management"),
        ("admin", "Administration"),
        ("trainer", "Trainer Workspace"),
        ("trainee", "Trainee Workspace"),
        ("assessment-module", "Assessment"),
        ("assessment", "Assessment"),
        ("microlearning", "Microlearning"),
        ("call-simulation", "Call Simulation"),
        ("scenario", "Call Simulation"),
        ("coaching", "Coaching"),
        ("analytics", "Analytics"),
        ("reports", "Reports"),
        ("settings", "Settings"),
        ("certification", "Certification"),
        ("notification", "Notifications"),
    ]
    for marker, label in module_markers:
        if marker in normalized_path:
            return label
    return "System"


def entity_from_path(path: str) -> tuple[Optional[str], Optional[str]]:
    parts = [part for part in path.strip("/").split("/") if part]
    if len(parts) < 3:
        return (parts[-1] if parts else None, None)
    entity_type = parts[-2] if len(parts[-1]) >= 8 else parts[-1]
    entity_id = parts[-1] if len(parts[-1]) >= 8 else None
    return entity_type.replace("-", "_"), entity_id


def should_audit_request(request: Request) -> bool:
    path = request.url.path
    if not path.startswith("/api/"):
        return False
    if path.startswith("/api/audit"):
        return False
    if path in {"/api/auth/login", "/api/auth/logout"}:
        return False
    if path.endswith("/session/activity"):
        return False
    method = request.method.upper()
    if method in AUDIT_MUTATING_METHODS:
        return True
    normalized_path = path.lower()
    return any(marker in normalized_path for marker in AUDIT_VIEW_PATH_MARKERS)


def resolve_actor_from_request(db: Session, request: Optional[Request]) -> tuple[Optional[User], Optional[str]]:
    if request is None:
        return None, None
    authorization = request.headers.get("authorization")
    if not authorization:
        return None, None
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            return None, None
        token_data = auth_utils.decode_token(token, allowed_types={"access", "refresh"})
        user = db.query(User).filter(User.id == token_data.user_id).first()
        return user, token_data.session_id
    except Exception:
        return None, None


def create_audit_log(
    db: Session,
    *,
    user: Optional[User] = None,
    request: Optional[Request] = None,
    action_type: str,
    module_name: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    description: Optional[str] = None,
    old_data: Optional[dict[str, Any]] = None,
    new_data: Optional[dict[str, Any]] = None,
    changed_fields_override: Optional[list[str]] = None,
    status: str = "success",
    severity: str = "info",
    batch_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
    trainer_id: Optional[str] = None,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    endpoint: Optional[str] = None,
    http_method: Optional[str] = None,
    http_status: Optional[int] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> AuditLog:
    browser_info = get_browser_info(request)
    log = AuditLog(
        user_id=getattr(user, "id", None),
        user_name=getattr(user, "full_name", None),
        user_email=getattr(user, "email", None),
        role=_enum_value(getattr(user, "role", None)),
        action_type=action_type,
        module_name=module_name,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        old_data=sanitize_for_audit(old_data or {}),
        new_data=sanitize_for_audit(new_data or {}),
        changed_fields=changed_fields_override
        if changed_fields_override is not None
        else changed_fields(old_data, new_data),
        status=status,
        severity=severity,
        ip_address=get_client_ip(request),
        browser_info=browser_info,
        device_type=get_device_type(browser_info),
        batch_id=batch_id,
        trainee_id=trainee_id,
        trainer_id=trainer_id,
        session_id=session_id,
        request_id=request_id or (request.headers.get("x-request-id") if request else None) or str(uuid4()),
        endpoint=endpoint or (request.url.path if request else None),
        http_method=http_method or (request.method if request else None),
        http_status=http_status,
        metadata_json=sanitize_for_audit(metadata or {}),
    )
    db.add(log)
    return log


def write_audit_log(**kwargs: Any) -> None:
    db = SessionLocal()
    try:
        create_audit_log(db, **kwargs)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Unable to write audit log")
    finally:
        db.close()


def write_request_audit_log(
    *,
    request: Request,
    http_status: int,
    duration_ms: float,
) -> None:
    db = SessionLocal()
    try:
        user, session_id = resolve_actor_from_request(db, request)
        entity_type, entity_id = entity_from_path(request.url.path)
        action_type = action_from_request(request.method, request.url.path)
        status_value = "success" if http_status < 400 else "failed"
        severity = "critical" if http_status >= 500 else "warning" if http_status >= 400 else "info"
        description = f"{request.method.upper()} {request.url.path} completed with HTTP {http_status}."
        create_audit_log(
            db,
            user=user,
            request=request,
            action_type=action_type,
            module_name=module_from_path(request.url.path),
            entity_type=entity_type,
            entity_id=entity_id,
            description=description,
            status=status_value,
            severity=severity,
            session_id=session_id,
            http_status=http_status,
            metadata={
                "query_params": dict(request.query_params),
                "duration_ms": round(duration_ms, 2),
                "path": request.url.path,
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Unable to write request audit log")
    finally:
        db.close()
