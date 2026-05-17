from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import (
    Batch,
    MicrolearningAssignment,
    NotificationEvent,
    Scenario,
    SimSession,
    User,
    UserRole,
    batch_user_association,
)


def _batch_label(batch: Optional[Batch]) -> str:
    if not batch:
        return "Unassigned batch"
    if batch.wave_number is not None:
        return f"{batch.name} | Wave {batch.wave_number}"
    return batch.name or "Assigned batch"


def _recipient_rows_for_trainee(db: Session, trainee_id: str) -> list[tuple[str, UserRole]]:
    trainer_ids = [
        trainer_id
        for (trainer_id,) in (
            db.query(Batch.created_by)
            .join(batch_user_association, batch_user_association.c.batch_id == Batch.id)
            .filter(
                batch_user_association.c.user_id == trainee_id,
                Batch.created_by.isnot(None),
            )
            .distinct()
            .all()
        )
        if trainer_id
    ]

    recipient_rows = db.query(User.id, User.role).filter(
        User.is_active == True,
        or_(
            User.role == UserRole.ADMIN,
            User.id.in_(trainer_ids or ["__none__"]),
        ),
    ).all()

    unique_rows: list[tuple[str, UserRole]] = []
    seen_ids: set[str] = set()
    for recipient_id, role in recipient_rows:
        if not recipient_id or recipient_id in seen_ids:
            continue
        seen_ids.add(recipient_id)
        unique_rows.append((recipient_id, role))
    return unique_rows


def _create_role_notifications(
    db: Session,
    *,
    trainee_id: str,
    event_type: str,
    title: str,
    message: str,
    details: dict[str, Any],
    level: str = "info",
    trainer_href: str = "/trainer/dashboard",
    admin_href: str = "/admin/dashboard",
    action_label: str = "Open details",
) -> None:
    created_at = datetime.utcnow()

    for recipient_id, recipient_role in _recipient_rows_for_trainee(db, trainee_id):
        href = trainer_href if recipient_role == UserRole.TRAINER else admin_href
        db.add(
            NotificationEvent(
                recipient_id=recipient_id,
                recipient_role=recipient_role,
                trainee_id=trainee_id,
                event_type=event_type,
                title=title,
                message=message,
                details=details,
                href=href,
                action_label=action_label,
                level=level,
                created_at=created_at,
            )
        )


def notify_microlearning_progress_update(
    db: Session,
    *,
    trainee: User,
    assignment: MicrolearningAssignment,
) -> None:
    module = getattr(assignment, "module", None)
    batch = getattr(assignment, "batch", None)
    module_title = getattr(module, "title", None) or "a microlearning module"
    _create_role_notifications(
        db,
        trainee_id=trainee.id,
        event_type="progress_update_submitted",
        title=f"{trainee.full_name} started {module_title}",
        message=f"A trainee opened a microlearning assignment under {_batch_label(batch)} and has started making progress.",
        details={
            "trainee_name": trainee.full_name,
            "trainee_email": trainee.email,
            "module_title": module_title,
            "batch_name": _batch_label(batch),
            "assignment_status": assignment.status,
            "started_at": assignment.started_at.isoformat() if assignment.started_at else None,
        },
        level="info",
        trainer_href="/trainer/microlearning",
        admin_href="/admin/analytics",
        action_label="Review progress",
    )


def notify_microlearning_completion(
    db: Session,
    *,
    trainee: User,
    assignment: MicrolearningAssignment,
    score: float,
    is_passed: bool,
) -> None:
    module = getattr(assignment, "module", None)
    batch = getattr(assignment, "batch", None)
    module_title = getattr(module, "title", None) or "a microlearning module"
    level = "success" if is_passed else "warning"
    result_label = "Passed" if is_passed else "Needs retake"
    _create_role_notifications(
        db,
        trainee_id=trainee.id,
        event_type="microlearning_completed",
        title=f"{trainee.full_name} completed {module_title}",
        message=f"Microlearning result saved for {_batch_label(batch)}. Status: {result_label}. Score: {round(score, 2)}%.",
        details={
            "trainee_name": trainee.full_name,
            "trainee_email": trainee.email,
            "module_title": module_title,
            "batch_name": _batch_label(batch),
            "completion_status": assignment.status,
            "score": round(score, 2),
            "is_passed": is_passed,
            "completed_at": assignment.completed_at.isoformat() if assignment.completed_at else None,
        },
        level=level,
        trainer_href="/trainer/microlearning",
        admin_href="/admin/analytics",
        action_label="Open results",
    )


def notify_assessment_completion(
    db: Session,
    *,
    trainee: User,
    assignment_title: str,
    category_title: str,
    batch_name: str,
    score: float,
    passing_score: float,
    passed: bool,
    attempt_no: int,
    completed_at: str,
) -> None:
    status_label = "passed" if passed else "failed"
    _create_role_notifications(
        db,
        trainee_id=trainee.id,
        event_type=f"assessment_{status_label}",
        title=f"{trainee.full_name} {status_label} {assignment_title}",
        message=f"Assessment completed under {batch_name}. Score: {round(score, 2)}% against a {round(passing_score, 2)}% passing score.",
        details={
            "trainee_name": trainee.full_name,
            "trainee_email": trainee.email,
            "assignment_title": assignment_title,
            "category_title": category_title,
            "batch_name": batch_name,
            "score": round(score, 2),
            "passing_score": round(passing_score, 2),
            "passed": passed,
            "attempt_no": attempt_no,
            "completed_at": completed_at,
        },
        level="success" if passed else "warning",
        trainer_href="/trainer/assessments",
        admin_href="/admin/analytics",
        action_label="Review assessment",
    )


def notify_call_simulation_completion(
    db: Session,
    *,
    trainee: User,
    session: SimSession,
    scenario: Optional[Scenario],
) -> None:
    batch_name = _batch_label(getattr(session, "batch", None))
    scenario_title = getattr(scenario, "title", None) or getattr(scenario, "name", None) or "Call Simulation"
    passed = bool(getattr(session, "pass_fail", False))
    overall_score = float(getattr(session, "overall_score", 0) or 0)
    _create_role_notifications(
        db,
        trainee_id=trainee.id,
        event_type="call_simulation_completed",
        title=f"{trainee.full_name} completed {scenario_title}",
        message=f"Call Simulation result saved for {batch_name}. Outcome: {'Passed' if passed else 'Needs review'}. Score: {round(overall_score, 2)}%.",
        details={
            "trainee_name": trainee.full_name,
            "trainee_email": trainee.email,
            "scenario_title": scenario_title,
            "batch_name": batch_name,
            "session_id": session.id,
            "score": round(overall_score, 2),
            "passed": passed,
            "completed_at": session.updated_at.isoformat() if session.updated_at else None,
        },
        level="success" if passed else "warning",
        trainer_href="/trainer/call-simulation",
        admin_href="/admin/analytics",
        action_label="Review simulation",
    )
