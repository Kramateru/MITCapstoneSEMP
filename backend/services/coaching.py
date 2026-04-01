from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

from sqlalchemy.orm import Session, joinedload

from ..models import CoachingLog, PracticeSession

COMPETENCY_STATUSES = {"pending", "competent", "not_competent"}


def normalize_competency_status(value: Optional[str]) -> str:
    normalized = (value or "pending").strip().lower()
    return normalized if normalized in COMPETENCY_STATUSES else "pending"


def load_latest_sessions(
    db: Session,
    *,
    trainee_ids: Iterable[str],
    scenario_ids: Optional[Iterable[str]] = None,
) -> dict[str, Any]:
    trainee_ids = [trainee_id for trainee_id in trainee_ids if trainee_id]
    if not trainee_ids:
        return {
            "sessions": [],
            "attempt_count": {},
            "latest_by_scenario": {},
        }

    query = (
        db.query(PracticeSession)
        .options(
            joinedload(PracticeSession.user),
            joinedload(PracticeSession.scenario),
        )
        .filter(PracticeSession.user_id.in_(trainee_ids))
        .order_by(PracticeSession.created_at.desc(), PracticeSession.attempt_number.desc())
    )

    scenario_ids = [scenario_id for scenario_id in (scenario_ids or []) if scenario_id]
    if scenario_ids:
        query = query.filter(PracticeSession.scenario_id.in_(scenario_ids))

    sessions = query.all()

    attempt_count: dict[str, int] = {}
    latest_by_scenario: dict[tuple[str, str], PracticeSession] = {}

    for session in sessions:
        attempt_count[session.scenario_id] = attempt_count.get(session.scenario_id, 0) + 1
        key = (session.user_id, session.scenario_id)
        if key not in latest_by_scenario:
            latest_by_scenario[key] = session

    return {
        "sessions": sessions,
        "attempt_count": attempt_count,
        "latest_by_scenario": latest_by_scenario,
    }


def load_latest_coaching_logs(
    db: Session,
    *,
    trainee_ids: Iterable[str],
    scenario_ids: Optional[Iterable[str]] = None,
) -> dict[str, Any]:
    trainee_ids = [trainee_id for trainee_id in trainee_ids if trainee_id]
    if not trainee_ids:
        return {
            "logs": [],
            "published_logs": [],
            "latest_by_session": {},
            "latest_by_scenario": {},
        }

    query = (
        db.query(CoachingLog)
        .options(
            joinedload(CoachingLog.practice_session).joinedload(PracticeSession.scenario),
            joinedload(CoachingLog.trainee),
            joinedload(CoachingLog.trainer),
        )
        .filter(CoachingLog.trainee_id.in_(trainee_ids))
        .order_by(CoachingLog.created_at.desc())
    )

    scenario_ids = [scenario_id for scenario_id in (scenario_ids or []) if scenario_id]
    if scenario_ids:
        query = query.join(PracticeSession, CoachingLog.practice_session_id == PracticeSession.id).filter(
            PracticeSession.scenario_id.in_(scenario_ids)
        )

    logs = query.all()
    published_logs = [log for log in logs if log.status != "draft"]
    latest_by_session: dict[str, CoachingLog] = {}
    latest_by_scenario: dict[tuple[str, str], CoachingLog] = {}

    for log in published_logs:
        if log.practice_session_id and log.practice_session_id not in latest_by_session:
            latest_by_session[log.practice_session_id] = log

        scenario_id = log.practice_session.scenario_id if log.practice_session else None
        if scenario_id:
            key = (log.trainee_id, scenario_id)
            if key not in latest_by_scenario:
                latest_by_scenario[key] = log

    return {
        "logs": logs,
        "published_logs": published_logs,
        "latest_by_session": latest_by_session,
        "latest_by_scenario": latest_by_scenario,
    }


def build_training_state(
    *,
    latest_session: Optional[PracticeSession],
    coaching_log: Optional[CoachingLog],
) -> dict[str, Any]:
    if not latest_session:
        return {
            "code": "not_started",
            "label": "Start",
            "summary": "No attempts recorded yet.",
            "can_practice": True,
            "is_locked": False,
            "requires_acknowledgement": False,
        }

    if coaching_log and coaching_log.practice_session_id == latest_session.id:
        competency_status = normalize_competency_status(coaching_log.competency_status)
        if coaching_log.status == "sent":
            return {
                "code": "pending_acknowledgement",
                "label": "Open Coaching",
                "summary": (
                    "A coaching log was sent and must be acknowledged before the next "
                    "training action is unlocked."
                ),
                "can_practice": False,
                "is_locked": competency_status == "competent",
                "requires_acknowledgement": True,
            }
        if competency_status == "competent":
            return {
                "code": "competent",
                "label": "Competent",
                "summary": "The latest coached attempt is marked competent.",
                "can_practice": False,
                "is_locked": True,
                "requires_acknowledgement": False,
            }
        if competency_status == "not_competent":
            return {
                "code": "needs_retake",
                "label": "Retake",
                "summary": "The latest acknowledged coaching log requires a retake.",
                "can_practice": True,
                "is_locked": False,
                "requires_acknowledgement": False,
            }
        if coaching_log.status == "acknowledged":
            return {
                "code": "acknowledged",
                "label": "Practice Again",
                "summary": "The latest coaching log has been acknowledged.",
                "can_practice": True,
                "is_locked": False,
                "requires_acknowledgement": False,
            }

    return {
        "code": "awaiting_coaching",
        "label": "Continue",
        "summary": "The latest attempt is waiting for trainer coaching.",
        "can_practice": True,
        "is_locked": False,
        "requires_acknowledgement": False,
    }


def serialize_coaching_log(log: CoachingLog) -> dict[str, Any]:
    practice_session = log.practice_session
    scenario = practice_session.scenario if practice_session else None
    trainer = log.trainer
    trainee = log.trainee
    competency_status = normalize_competency_status(log.competency_status)

    return {
        "id": log.id,
        "coaching_id": log.coaching_id,
        "practice_session_id": log.practice_session_id,
        "scenario_id": practice_session.scenario_id if practice_session else None,
        "scenario_title": scenario.title if scenario else None,
        "trainer_id": log.trainer_id,
        "trainer_name": trainer.full_name if trainer else None,
        "trainer_email": trainer.email if trainer else None,
        "trainee_id": log.trainee_id,
        "trainee_name": trainee.full_name if trainee else None,
        "trainee_email": trainee.email if trainee else None,
        "batch_name": log.batch_name,
        "lob": log.lob,
        "coaching_minutes": log.coaching_minutes,
        "strengths": log.strengths,
        "opportunities": log.opportunities,
        "action_plan": log.action_plan,
        "target_date": log.target_date,
        "status": log.status,
        "competency_status": competency_status,
        "trainer_remarks": log.trainer_remarks,
        "acknowledged_at": log.acknowledged_at,
        "created_at": log.created_at,
        "updated_at": log.updated_at,
        "audio_file_url": practice_session.audio_file_url if practice_session else None,
        "transcription": practice_session.transcription if practice_session else None,
        "transcription_confidence": practice_session.transcription_confidence if practice_session else None,
        "attempt_number": practice_session.attempt_number if practice_session else None,
        "overall_score": practice_session.overall_score if practice_session else None,
        "session_created_at": practice_session.created_at if practice_session else None,
        "response_duration": practice_session.response_duration if practice_session else None,
        "scores": {
            "accuracy": practice_session.accuracy_score if practice_session else None,
            "fluency": practice_session.fluency_score if practice_session else None,
            "clarity": practice_session.clarity_score if practice_session else None,
            "keyword_adherence": practice_session.keyword_adherence_score if practice_session else None,
            "soft_skills": practice_session.soft_skills_score if practice_session else None,
        },
        "requires_retake": competency_status == "not_competent",
        "is_competent": competency_status == "competent",
    }
