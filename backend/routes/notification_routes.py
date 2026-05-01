"""
Notification routes for role-specific dashboard alerts.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Query, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import (
    Batch,
    CertificateRecord,
    CoachingLog,
    MCQAssessment,
    MCQSubmission,
    MicrolearningAssignment,
    NotificationRead,
    PracticeSession,
    SimSession,
    SystemLog,
    User,
    UserRole,
)
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _stable_marker(value: Any) -> str:
    if value is None:
        return "none"
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _notification_key(base_id: str, *parts: Any) -> str:
    suffix = "::".join(_stable_marker(part) for part in parts)
    return f"{base_id}::{suffix}" if suffix else base_id


def _serialize_notification(
    *,
    notification_id: str,
    title: str,
    message: str,
    href: str,
    level: str = "info",
    action_label: str = "Open",
    created_at: Optional[datetime] = None,
) -> dict[str, Any]:
    return {
        "id": notification_id,
        "title": title,
        "message": message,
        "href": href,
        "level": level,
        "action_label": action_label,
        "created_at": created_at.isoformat() if created_at else None,
        "status": "unread",
        "is_cleared": False,
    }


def _sort_key(notification: dict[str, Any]) -> tuple[int, str]:
    level_priority = {
        "critical": 0,
        "warning": 1,
        "info": 2,
        "success": 3,
    }
    created_at = notification.get("created_at")
    timestamp = 0.0
    if created_at:
        try:
            timestamp = datetime.fromisoformat(created_at).timestamp()
        except ValueError:
            timestamp = 0.0
    return (level_priority.get(notification.get("level", "info"), 4), -timestamp)


def _read_notification_ids(
    *,
    db: Session,
    current_user: User,
) -> set[str]:
    legacy_ids = set(current_user.dismissed_notifications or [])
    persisted_ids = {
        notification_id
        for (notification_id,) in (
            db.query(NotificationRead.notification_id)
            .filter(
                NotificationRead.user_id == current_user.id,
                NotificationRead.is_cleared == True,
            )
            .all()
        )
    }
    return legacy_ids | persisted_ids


def _build_notifications_for_user(
    *,
    db: Session,
    current_user: User,
) -> list[dict[str, Any]]:
    if current_user.role == UserRole.TRAINEE:
        notifications = _build_trainee_notifications(db=db, current_user=current_user)
    elif current_user.role == UserRole.TRAINER:
        notifications = _build_trainer_notifications(db=db, current_user=current_user)
    else:
        notifications = _build_admin_notifications(db=db)

    notifications.sort(key=_sort_key)
    return notifications


def _active_notifications_for_user(
    *,
    db: Session,
    current_user: User,
) -> list[dict[str, Any]]:
    notifications = _build_notifications_for_user(db=db, current_user=current_user)
    cleared_ids = _read_notification_ids(db=db, current_user=current_user)
    return [notification for notification in notifications if notification["id"] not in cleared_ids]


def _persist_notification_reads(
    *,
    db: Session,
    current_user: User,
    notification_ids: list[str],
) -> list[NotificationRead]:
    unique_notification_ids = []
    seen_notification_ids: set[str] = set()
    for notification_id in notification_ids:
        normalized_id = str(notification_id or "").strip()
        if not normalized_id or normalized_id in seen_notification_ids:
            continue
        seen_notification_ids.add(normalized_id)
        unique_notification_ids.append(normalized_id)

    if not unique_notification_ids:
        return []

    existing_records = {
        record.notification_id: record
        for record in (
            db.query(NotificationRead)
            .filter(
                NotificationRead.user_id == current_user.id,
                NotificationRead.notification_id.in_(unique_notification_ids),
            )
            .all()
        )
    }

    now = datetime.utcnow()
    updated_records: list[NotificationRead] = []

    for notification_id in unique_notification_ids:
        record = existing_records.get(notification_id)
        if not record:
            record = NotificationRead(
                user_id=current_user.id,
                notification_id=notification_id,
                role=current_user.role,
            )
            db.add(record)
        record.role = current_user.role
        record.status = "read"
        record.is_cleared = True
        record.read_at = now
        updated_records.append(record)

    dismissed_ids = list(current_user.dismissed_notifications or [])
    did_update_dismissed_ids = False
    for notification_id in unique_notification_ids:
        if notification_id not in dismissed_ids:
            dismissed_ids.append(notification_id)
            did_update_dismissed_ids = True
    if did_update_dismissed_ids:
        current_user.dismissed_notifications = dismissed_ids

    db.commit()
    for record in updated_records:
        db.refresh(record)
    return updated_records


def _active_notification_ids_for_href(
    *,
    db: Session,
    current_user: User,
    href: str,
) -> list[str]:
    normalized_href = str(href or "").strip()
    if not normalized_href:
        return []

    return [
        str(notification.get("id") or "").strip()
        for notification in _active_notifications_for_user(db=db, current_user=current_user)
        if str(notification.get("href") or "").strip() == normalized_href
    ]


def _resolve_notification_ids_to_clear(
    *,
    db: Session,
    current_user: User,
    notification_id: Optional[str],
    href: Optional[str],
) -> list[str]:
    target_ids = []
    if href:
        target_ids.extend(
            _active_notification_ids_for_href(
                db=db,
                current_user=current_user,
                href=href,
            )
        )
    if notification_id:
        target_ids.append(notification_id)
    return [str(target_id or "").strip() for target_id in target_ids if str(target_id or "").strip()]


def _trainer_cohort_ids(db: Session, trainer_id: str) -> tuple[list[str], list[str]]:
    batches = db.query(Batch).filter(Batch.created_by == trainer_id).all()
    trainee_ids: set[str] = set()
    for batch in batches:
        for user in batch.users:
            if user.role == UserRole.TRAINEE:
                trainee_ids.add(user.id)
    return [batch.id for batch in batches], list(trainee_ids)


def _build_trainee_notifications(
    *,
    db: Session,
    current_user: User,
) -> list[dict[str, Any]]:
    notifications: list[dict[str, Any]] = []

    pending_coaching = (
        db.query(CoachingLog)
        .filter(CoachingLog.trainee_id == current_user.id, CoachingLog.status == "sent")
        .order_by(CoachingLog.updated_at.desc(), CoachingLog.created_at.desc())
        .all()
    )
    if pending_coaching:
        latest_log = pending_coaching[0]
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key(
                    "trainee-coaching-pending",
                    current_user.id,
                    len(pending_coaching),
                    latest_log.id,
                    latest_log.updated_at or latest_log.created_at,
                ),
                title="Acknowledge coaching feedback",
                message=(
                    f"{len(pending_coaching)} coaching log"
                    f"{'' if len(pending_coaching) == 1 else 's'} need your acknowledgement."
                ),
                href="/trainee/coaching",
                level="warning",
                action_label="Review coaching",
                created_at=latest_log.updated_at or latest_log.created_at,
            )
        )

    open_assignments = (
        db.query(MicrolearningAssignment)
        .filter(
            MicrolearningAssignment.trainee_id == current_user.id,
            MicrolearningAssignment.status != "completed",
        )
        .order_by(
            MicrolearningAssignment.due_date.is_(None),
            MicrolearningAssignment.due_date.asc(),
            MicrolearningAssignment.assigned_at.desc(),
        )
        .all()
    )
    if open_assignments:
        overdue_count = sum(
            1
            for assignment in open_assignments
            if assignment.due_date and assignment.due_date < datetime.utcnow()
        )
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key(
                    "trainee-microlearning-open",
                    current_user.id,
                    len(open_assignments),
                    overdue_count,
                    open_assignments[0].id,
                    open_assignments[0].due_date or open_assignments[0].assigned_at,
                ),
                title="Complete microlearning tasks",
                message=(
                    f"{len(open_assignments)} assigned module"
                    f"{'' if len(open_assignments) == 1 else 's'} remain open"
                    + (
                        f", including {overdue_count} overdue item{'' if overdue_count == 1 else 's'}."
                        if overdue_count
                        else "."
                    )
                ),
                href="/trainee/microlearning",
                level="warning" if overdue_count else "info",
                action_label="Open microlearning",
                created_at=open_assignments[0].due_date or open_assignments[0].assigned_at,
            )
        )

    batch_ids = [batch.id for batch in current_user.batches]
    mcq_query = db.query(MCQAssessment).filter(MCQAssessment.is_active == True)
    if batch_ids:
        mcq_query = mcq_query.filter(
            or_(
                MCQAssessment.assigned_user_id == current_user.id,
                MCQAssessment.assigned_batch_id.in_(batch_ids),
            )
        )
    else:
        mcq_query = mcq_query.filter(MCQAssessment.assigned_user_id == current_user.id)

    assigned_assessments = mcq_query.order_by(MCQAssessment.created_at.desc()).all()
    open_assessments = []
    for assessment in assigned_assessments:
        submission_exists = (
            db.query(MCQSubmission.id)
            .filter(
                MCQSubmission.assessment_id == assessment.id,
                MCQSubmission.trainee_id == current_user.id,
            )
            .first()
        )
        if not submission_exists:
            open_assessments.append(assessment)

    if open_assessments:
        latest_assessment = open_assessments[0]
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key(
                    "trainee-mcq-open",
                    current_user.id,
                    len(open_assessments),
                    latest_assessment.id,
                    latest_assessment.updated_at or latest_assessment.created_at,
                ),
                title="Assigned MCQ assessments ready",
                message=(
                    f"{len(open_assessments)} MCQ assessment"
                    f"{'' if len(open_assessments) == 1 else 's'} are waiting for submission."
                ),
                href="/trainee/mcq",
                level="info",
                action_label="Start MCQ",
                created_at=latest_assessment.updated_at or latest_assessment.created_at,
            )
        )

    latest_reviewed_session = (
        db.query(SimSession)
        .filter(
            SimSession.trainee_id == current_user.id,
            SimSession.trainer_evaluated_at.isnot(None),
            SimSession.trainer_verdict_status.in_(["competent", "retake"]),
        )
        .order_by(SimSession.trainer_evaluated_at.desc(), SimSession.updated_at.desc())
        .first()
    )
    if latest_reviewed_session:
        verdict_status = (latest_reviewed_session.trainer_verdict_status or "").lower()
        is_competent = verdict_status == "competent"
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key(
                    "trainee-call-simulation-verdict",
                    current_user.id,
                    latest_reviewed_session.id,
                    verdict_status,
                    latest_reviewed_session.trainer_evaluated_at,
                ),
                title="Call Simulation verdict received",
                message=(
                    "Your trainer marked the latest mock call as competent."
                    if is_competent
                    else "Your trainer marked the latest mock call for retake."
                ),
                href="/trainee/certificates" if is_competent else "/trainee/call-simulation",
                level="success" if is_competent else "warning",
                action_label="View update" if is_competent else "Open Call Simulation",
                created_at=latest_reviewed_session.trainer_evaluated_at,
            )
        )

    latest_sim_floor_certificate = (
        db.query(CertificateRecord)
        .filter(
            CertificateRecord.trainee_id == current_user.id,
            CertificateRecord.source_type == "sim_floor_session",
        )
        .order_by(CertificateRecord.issued_at.desc())
        .first()
    )
    if latest_sim_floor_certificate:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key(
                    "trainee-call-simulation-certificate",
                    current_user.id,
                    latest_sim_floor_certificate.id,
                    latest_sim_floor_certificate.issued_at,
                ),
                title="Call Simulation certificate unlocked",
                message=(
                    f"Certificate {latest_sim_floor_certificate.certificate_no} is now available in your certificates tab."
                ),
                href="/trainee/certificates",
                level="success",
                action_label="Open certificates",
                created_at=latest_sim_floor_certificate.issued_at,
            )
        )

    certificate_count = (
        db.query(func.count(CertificateRecord.id))
        .filter(CertificateRecord.trainee_id == current_user.id)
        .scalar()
        or 0
    )
    if certificate_count:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key(
                    "trainee-certificates-available",
                    current_user.id,
                    certificate_count,
                ),
                title="Certificates available",
                message=(
                    f"You currently have {certificate_count} certificate"
                    f"{'' if certificate_count == 1 else 's'} saved in the database."
                ),
                href="/trainee/certificates",
                level="success",
                action_label="View certificates",
            )
        )

    return notifications


def _build_trainer_notifications(
    *,
    db: Session,
    current_user: User,
) -> list[dict[str, Any]]:
    notifications: list[dict[str, Any]] = []
    batch_ids, trainee_ids = _trainer_cohort_ids(db, current_user.id)
    if not trainee_ids:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key("trainer-empty-cohort", current_user.id),
                title="No trainees assigned yet",
                message="Assign trainees to your batches so analytics, coaching, MCQ, and reports can populate.",
                href="/trainer/users",
                level="info",
                action_label="Manage trainees",
            )
        )
        return notifications

    draft_count = (
        db.query(func.count(CoachingLog.id))
        .filter(CoachingLog.trainer_id == current_user.id, CoachingLog.status == "draft")
        .scalar()
        or 0
    )
    if draft_count:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key(
                    "trainer-draft-coaching",
                    current_user.id,
                    draft_count,
                ),
                title="Draft coaching logs pending",
                message=(
                    f"{draft_count} coaching draft"
                    f"{'' if draft_count == 1 else 's'} still need to be completed or sent."
                ),
                href="/trainer/coaching",
                level="warning",
                action_label="Open coaching",
            )
        )

    pending_ack_count = (
        db.query(func.count(CoachingLog.id))
        .filter(CoachingLog.trainer_id == current_user.id, CoachingLog.status == "sent")
        .scalar()
        or 0
    )
    if pending_ack_count:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key(
                    "trainer-pending-acknowledgement",
                    current_user.id,
                    pending_ack_count,
                ),
                title="Trainee acknowledgement pending",
                message=(
                    f"{pending_ack_count} published coaching log"
                    f"{'' if pending_ack_count == 1 else 's'} are still waiting for trainee acknowledgement."
                ),
                href="/trainer/coaching",
                level="info",
                action_label="Follow up",
            )
        )

    sessions_needing_review = (
        db.query(func.count(PracticeSession.id))
        .filter(
            PracticeSession.user_id.in_(trainee_ids),
            or_(PracticeSession.is_verified == False, PracticeSession.status == "needs_review"),
        )
        .scalar()
        or 0
    )
    if sessions_needing_review:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key(
                    "trainer-sessions-needing-review",
                    current_user.id,
                    sessions_needing_review,
                ),
                title="Practice sessions need review",
                message=(
                    f"{sessions_needing_review} trainee practice session"
                    f"{'' if sessions_needing_review == 1 else 's'} need verification or review."
                ),
                href="/trainer/realtime",
                level="warning",
                action_label="Open analytics",
            )
        )

    recent_cutoff = datetime.utcnow() - timedelta(days=7)
    active_recent_ids = {
        user_id
        for (user_id,) in (
            db.query(PracticeSession.user_id)
            .filter(
                PracticeSession.user_id.in_(trainee_ids),
                PracticeSession.created_at >= recent_cutoff,
            )
            .distinct()
            .all()
        )
    }
    inactive_count = len(set(trainee_ids) - active_recent_ids)
    if inactive_count:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key(
                    "trainer-inactive-trainees",
                    current_user.id,
                    inactive_count,
                    recent_cutoff.date(),
                ),
                title="Inactive trainees need attention",
                message=(
                    f"{inactive_count} trainee"
                    f"{'' if inactive_count == 1 else 's'} have no recorded practice activity in the last 7 days."
                ),
                href="/trainer/realtime",
                level="warning",
                action_label="Inspect analytics",
            )
        )

    if batch_ids:
        open_batch_assessments = (
            db.query(func.count(MCQAssessment.id))
            .filter(
                MCQAssessment.is_active == True,
                MCQAssessment.assigned_batch_id.in_(batch_ids),
            )
            .scalar()
            or 0
        )
        if open_batch_assessments:
            notifications.append(
                _serialize_notification(
                        notification_id=_notification_key(
                            "trainer-mcq-active",
                            current_user.id,
                            open_batch_assessments,
                        ),
                    title="Batch MCQ activity is live",
                    message=(
                        f"{open_batch_assessments} active batch MCQ assessment"
                        f"{'' if open_batch_assessments == 1 else 's'} are currently assigned to your cohorts."
                    ),
                    href="/trainer/mcq/progress",
                    level="info",
                    action_label="Open MCQ",
                )
            )

    return notifications


def _build_admin_notifications(
    *,
    db: Session,
) -> list[dict[str, Any]]:
    notifications: list[dict[str, Any]] = []

    system_drafts = (
        db.query(func.count(CoachingLog.id))
        .filter(CoachingLog.status == "draft")
        .scalar()
        or 0
    )
    if system_drafts:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key("admin-system-draft-coaching", system_drafts),
                title="Coaching drafts across the platform",
                message=(
                    f"{system_drafts} coaching draft"
                    f"{'' if system_drafts == 1 else 's'} are still pending completion."
                ),
                href="/admin/coaching",
                level="warning",
                action_label="Review coaching",
            )
        )

    pending_ack = (
        db.query(func.count(CoachingLog.id))
        .filter(CoachingLog.status == "sent")
        .scalar()
        or 0
    )
    if pending_ack:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key("admin-pending-ack-coaching", pending_ack),
                title="Pending trainee acknowledgements",
                message=(
                    f"{pending_ack} published coaching log"
                    f"{'' if pending_ack == 1 else 's'} still need trainee acknowledgement."
                ),
                href="/admin/coaching",
                level="info",
                action_label="Monitor coaching",
            )
        )

    trainee_records = db.query(User).filter(User.role == UserRole.TRAINEE, User.is_active == True).all()
    unassigned_count = sum(1 for trainee in trainee_records if not trainee.batches)
    if unassigned_count:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key("admin-unassigned-trainees", unassigned_count),
                title="Unassigned trainees detected",
                message=(
                    f"{unassigned_count} trainee"
                    f"{'' if unassigned_count == 1 else 's'} are active but not assigned to any batch."
                ),
                href="/admin/users",
                level="warning",
                action_label="Open users",
            )
        )

    supabase = get_supabase_client()
    if not supabase.is_available:
        notifications.append(
            _serialize_notification(
                notification_id=_notification_key("admin-supabase-storage", supabase.is_available),
                title="Supabase storage is not configured",
                message="Audio uploads and cloud storage features need Supabase credentials before they can be used safely.",
                href="/admin/dashboard",
                level="critical",
                action_label="Check system status",
            )
        )

    recent_logs = db.query(SystemLog).order_by(SystemLog.created_at.desc()).limit(2).all()
    for log in recent_logs:
        notifications.append(
            _serialize_notification(
                notification_id=f"admin-log-{log.id}",
                title="Recent admin activity",
                message=f"{log.action.replace('_', ' ').capitalize()} on {log.entity_type or 'system resource'}.",
                href="/admin/dashboard",
                level="info",
                action_label="Open dashboard",
                created_at=log.created_at,
            )
        )

    return notifications


@router.get("")
async def list_notifications(
    limit: int = Query(8, ge=1, le=20),
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    notifications = _active_notifications_for_user(db=db, current_user=current_user)

    return {
        "count": len(notifications),
        "notifications": notifications[:limit],
        "role": current_user.role.value,
        "generated_at": datetime.utcnow().isoformat(),
    }


@router.post("/read")
async def mark_notification_read(
    payload: dict[str, str] = Body(...),
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    notification_id = (payload.get("notification_id") or "").strip()
    href = (payload.get("href") or "").strip()
    notification_ids = _resolve_notification_ids_to_clear(
        db=db,
        current_user=current_user,
        notification_id=notification_id,
        href=href or None,
    )
    if not notification_ids:
        raise HTTPException(status_code=400, detail="notification_id or href is required")

    read_records = _persist_notification_reads(
        db=db,
        current_user=current_user,
        notification_ids=notification_ids,
    )
    unread_notifications = _active_notifications_for_user(db=db, current_user=current_user)

    return {
        "message": "Notifications marked as read",
        "notification_id": notification_ids[0],
        "notification_ids": notification_ids,
        "status": read_records[0].status if read_records else "read",
        "is_cleared": all(record.is_cleared for record in read_records) if read_records else True,
        "read_at": read_records[0].read_at.isoformat() if read_records and read_records[0].read_at else None,
        "count": len(unread_notifications),
    }


@router.post("/dismiss")
async def dismiss_notification(
    payload: dict[str, str] = Body(...),
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    return await mark_notification_read(payload=payload, current_user=current_user, db=db)
