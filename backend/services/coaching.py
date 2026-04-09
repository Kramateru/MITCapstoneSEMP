from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterable, Optional

from sqlalchemy.orm import Session, joinedload

from ..models import CoachingLog, PracticeSession, SimSession

COMPETENCY_STATUSES = {"pending", "competent", "not_competent"}
COACHING_SOURCE_TYPES = {"practice_session", "sim_floor_session", "general"}


def normalize_competency_status(value: Optional[str]) -> str:
    normalized = (value or "pending").strip().lower()
    return normalized if normalized in COMPETENCY_STATUSES else "pending"


def normalize_coaching_source_type(value: Optional[str]) -> str:
    normalized = (value or "practice_session").strip().lower()
    return normalized if normalized in COACHING_SOURCE_TYPES else "practice_session"


def generate_coaching_id(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"COACH-{year}-"
    count = db.query(CoachingLog).filter(CoachingLog.coaching_id.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:04d}"


def get_coaching_log_session(log: CoachingLog) -> PracticeSession | SimSession | None:
    return log.sim_session or log.practice_session


def get_coaching_log_scenario_id(log: CoachingLog) -> Optional[str]:
    session = get_coaching_log_session(log)
    return getattr(session, "scenario_id", None) if session else None


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
            joinedload(CoachingLog.sim_session).joinedload(SimSession.scenario),
            joinedload(CoachingLog.trainee),
            joinedload(CoachingLog.trainer),
        )
        .filter(CoachingLog.trainee_id.in_(trainee_ids))
        .order_by(CoachingLog.created_at.desc())
    )

    scenario_ids = [scenario_id for scenario_id in (scenario_ids or []) if scenario_id]
    logs = query.all()
    if scenario_ids:
        logs = [
            log
            for log in logs
            if get_coaching_log_scenario_id(log) in scenario_ids
        ]
    published_logs = [log for log in logs if log.status != "draft"]
    latest_by_session: dict[str, CoachingLog] = {}
    latest_by_scenario: dict[tuple[str, str], CoachingLog] = {}

    for log in published_logs:
        session_id = log.sim_session_id or log.practice_session_id
        if session_id and session_id not in latest_by_session:
            latest_by_session[session_id] = log

        scenario_id = get_coaching_log_scenario_id(log)
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
    latest_session: Optional[Any],
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

    if coaching_log and (coaching_log.practice_session_id == latest_session.id or coaching_log.sim_session_id == latest_session.id):
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
    session = get_coaching_log_session(log)
    scenario = session.scenario if session else None
    trainer = log.trainer
    trainee = log.trainee
    competency_status = normalize_competency_status(log.competency_status)
    source_type = normalize_coaching_source_type(log.source_type)
    is_sim_session = source_type == "sim_floor_session"

    return {
        "id": log.id,
        "coaching_id": log.coaching_id,
        "practice_session_id": log.practice_session_id,
        "sim_session_id": log.sim_session_id,
        "source_type": source_type,
        "scenario_id": getattr(session, "scenario_id", None) if session else None,
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
        "audio_file_url": (
            session.audio_url if is_sim_session and session else session.audio_file_url if session else None
        ),
        "transcription": (
            session.transcript if is_sim_session and session else session.transcription if session else None
        ),
        "transcription_confidence": (
            session.transcript_confidence if session else None
        ),
        "attempt_number": session.attempt_number if session else None,
        "overall_score": (
            session.weighted_score if is_sim_session and session else session.overall_score if session else None
        ),
        "session_created_at": session.created_at if session else None,
        "response_duration": (
            session.audio_duration_seconds if is_sim_session and session else session.response_duration if session else None
        ),
        "scores": {
            "accuracy": (
                session.speech_to_text_accuracy if is_sim_session and session else session.accuracy_score if session else None
            ),
            "fluency": (
                session.pronunciation_score if is_sim_session and session else session.fluency_score if session else None
            ),
            "clarity": (
                session.pacing_score if is_sim_session and session else session.clarity_score if session else None
            ),
            "keyword_adherence": (
                (session.keyword_compliance or {}).get("score")
                if is_sim_session and session
                else session.keyword_adherence_score if session else None
            ),
            "soft_skills": (
                session.sentiment_score if is_sim_session and session else session.soft_skills_score if session else None
            ),
        },
        "trainer_verdict_status": (
            session.trainer_verdict_status if is_sim_session and session else None
        ),
        "certificate_id": (
            session.certificate_id if is_sim_session and session else None
        ),
        "requires_retake": competency_status == "not_competent",
        "is_competent": competency_status == "competent",
    }
