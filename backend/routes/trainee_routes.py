"""
Trainee Dashboard Routes
Handles practice sessions, feedback viewing, and progress tracking
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends as FastAPIDepends, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import auth_utils
from ..database import SessionLocal, get_db
from ..models import (
    Batch,
    CertificateRecord,
    Course,
    CourseAssignment,
    Feedback,
    MicrolearningAssignment,
    MicrolearningModule,
    MicrolearningTopicCategory,
    PerformanceMetrics,
    PracticeSession,
    Scenario,
    User,
    UserRole,
)
from ..services.live_updates import live_update_manager
from ..services.certificate_awards import (
    SUPPORTED_ACTIVITY_CERTIFICATE_SOURCES,
    award_certificate,
    prune_trainee_activity_certificates,
    sync_trainee_completion_certificates,
)
from ..services.microlearning import (
    advance_flashcard_assignment_runtime,
    assignment_is_current,
    ensure_assignment_result_summary,
    ensure_module_exercises,
    evaluate_exercise_submission,
    filter_current_assignments,
    get_flashcard_session_state,
    persist_flashcard_attempt_result,
    reset_assignment_for_retake,
    refresh_assignment_progress,
    serialize_assignment_detail,
    serialize_assignment_summary,
    serialize_microlearning_module,
    start_flashcard_assignment_runtime,
    sync_flashcard_assignment_runtime,
    update_flashcard_assignment_runtime_progress,
)
from ..services.speech_assessment import (
    assess_audio_submission,
    build_gold_standard_script,
)
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/api/trainee", tags=["trainee"])
logger = logging.getLogger(__name__)


def Depends(dependency=None):
    """Default empty Depends() to DB session in this module."""
    return FastAPIDepends(get_db if dependency is None else dependency)


# ==================== Pydantic Models ====================


class PracticeSessionCreate(BaseModel):
    scenario_id: str
    audio_file_url: str
    transcription: str
    transcription_confidence: float
    accuracy_score: float
    fluency_score: float
    clarity_score: float
    keyword_adherence_score: float
    soft_skills_score: float
    overall_score: float
    word_feedback: Optional[dict] = None
    filler_words_detected: Optional[List[str]] = None
    response_duration: Optional[int] = None
    dead_air_time: Optional[int] = None
    volume_level: Optional[float] = None
    attempt_number: int = 1
    assessment_data: Optional[Dict[str, Any]] = None  # Full AI assessment results


class LanguageSelection(BaseModel):
    language_dialect: str  # e.g., "en-US", "en-PH", "en-IN"


class UIPreferences(BaseModel):
    theme: Optional[str] = None  # dark, light, default
    layout: Optional[str] = None  # default, minified, boxed
    big_font: Optional[bool] = None
    high_contrast: Optional[bool] = None


class MicrolearningExerciseSubmission(BaseModel):
    response_text: Optional[str] = None
    selected_option: Optional[str] = None
    input_mode: Optional[str] = None
    revealed_side: Optional[str] = None
    study_time_seconds: Optional[int] = None
    answer_time_seconds: Optional[int] = None
    status: Optional[str] = None
    answered_at: Optional[datetime] = None
    timer_expired: Optional[bool] = None


class MicrolearningFlashcardSessionUpdate(BaseModel):
    exercise_id: str
    response_text: Optional[str] = None
    revealed_side: Optional[str] = None


# ==================== Helper Functions ====================


def verify_trainee(
    current_user: User = Depends(auth_utils.get_current_user),
) -> User:
    """Verify that current user is trainee"""
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")
    return current_user


def _get_active_batch_ids_for_user(user: User) -> list[str]:
    return [batch.id for batch in user.batches if getattr(batch, "is_active", True)]


def _active_trainee_microlearning_assignments_query(
    db: Session,
    *,
    trainee_id: str,
):
    return (
        db.query(MicrolearningAssignment)
        .join(MicrolearningAssignment.module)
        .outerjoin(MicrolearningModule.topic_category)
        .filter(
            MicrolearningAssignment.trainee_id == trainee_id,
            MicrolearningModule.is_active == True,
            or_(
                MicrolearningModule.topic_category_id.is_(None),
                MicrolearningTopicCategory.is_active == True,
            ),
        )
    )


def _get_trainee_microlearning_assignment(
    db: Session,
    *,
    trainee_id: str,
    assignment_id: str,
) -> MicrolearningAssignment:
    assignment = (
        _active_trainee_microlearning_assignments_query(
            db,
            trainee_id=trainee_id,
        )
        .options(
            joinedload(MicrolearningAssignment.module).joinedload(MicrolearningModule.assessment_method),
            joinedload(MicrolearningAssignment.module).joinedload(MicrolearningModule.topic_category),
            joinedload(MicrolearningAssignment.trainee).joinedload(User.batches),
            joinedload(MicrolearningAssignment.trainer),
            joinedload(MicrolearningAssignment.batch),
            joinedload(MicrolearningAssignment.certificate),
        )
        .filter(
            MicrolearningAssignment.id == assignment_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Microlearning assignment not found")
    if not assignment_is_current(assignment):
        raise HTTPException(status_code=404, detail="Microlearning assignment not found")
    return assignment


def _award_scenario_completion_certificate(
    db: Session,
    *,
    trainee: User,
    scenario: Scenario,
    practice_session: PracticeSession,
) -> None:
    award_certificate(
        db,
        trainee_id=trainee.id,
        issuer_id=scenario.created_by,
        source_type="scenario_task",
        source_id=scenario.id,
        achievement_title=scenario.title,
        achievement_type="task",
        remarks=f"Completed scenario task: {scenario.title}",
        score=float(practice_session.overall_score or 0.0),
        practice_session_id=practice_session.id,
        issued_at=practice_session.created_at,
    )


def _award_course_assignment_completion_certificate(
    db: Session,
    *,
    trainee: User,
    assignment: CourseAssignment,
) -> None:
    if not assignment.course:
        return

    award_certificate(
        db,
        trainee_id=trainee.id,
        issuer_id=assignment.assigned_by,
        source_type="course_assignment",
        source_id=assignment.id,
        achievement_title=assignment.course.name,
        achievement_type="task",
        remarks=f"Completed training task: {assignment.course.name}",
        score=float(assignment.completion_percentage or 0.0),
        issued_at=assignment.updated_at or assignment.assigned_at,
    )


def _award_microlearning_assignment_certificate(
    db: Session,
    *,
    trainee: User,
    assignment: MicrolearningAssignment,
) -> None:
    module = assignment.module
    if not module:
        return

    assignment_summary = serialize_assignment_summary(assignment)
    if not assignment_summary.get("is_passed"):
        return

    certificate, _ = award_certificate(
        db,
        trainee_id=trainee.id,
        issuer_id=assignment.assigned_by,
        source_type="microlearning_assignment",
        source_id=assignment.id,
        achievement_title=module.title,
        achievement_type="microlearning",
        remarks=f"Completed microlearning module: {module.title}",
        score=float(assignment_summary.get("average_score") or 0.0),
        issued_at=assignment.completed_at or assignment.updated_at or assignment.assigned_at,
    )
    assignment.certificate_id = certificate.id
    assignment.status = "certified"


def _build_trainee_microlearning_report(
    db: Session,
    *,
    trainee_id: str,
) -> dict[str, Any]:
    assignments = (
        _active_trainee_microlearning_assignments_query(
            db,
            trainee_id=trainee_id,
        )
        .options(
            joinedload(MicrolearningAssignment.module).joinedload(MicrolearningModule.assessment_method),
            joinedload(MicrolearningAssignment.module).joinedload(MicrolearningModule.topic_category),
            joinedload(MicrolearningAssignment.trainee).joinedload(User.batches),
            joinedload(MicrolearningAssignment.trainer),
            joinedload(MicrolearningAssignment.batch),
            joinedload(MicrolearningAssignment.certificate),
        )
        .order_by(MicrolearningAssignment.assigned_at.desc())
        .all()
    )
    assignments = filter_current_assignments(assignments)

    did_update = False
    rows: list[dict[str, Any]] = []
    topic_breakdown: dict[str, dict[str, Any]] = {}

    for assignment in assignments:
        did_update = ensure_module_exercises(assignment.module) or did_update
        before = (
            assignment.status,
            assignment.completion_percentage,
            assignment.completed_exercises,
            assignment.completed_at,
            assignment.certificate_id,
        )
        did_update = sync_flashcard_assignment_runtime(db, assignment) or did_update
        refresh_assignment_progress(assignment)
        summary = serialize_assignment_summary(assignment)
        if summary.get("is_passed") and assignment.status in {"completed", "certified"}:
            _award_microlearning_assignment_certificate(
                db,
                trainee=assignment.trainee,
                assignment=assignment,
            )
            refresh_assignment_progress(assignment)
            summary = serialize_assignment_summary(assignment)
        after = (
            assignment.status,
            assignment.completion_percentage,
            assignment.completed_exercises,
            assignment.completed_at,
            assignment.certificate_id,
        )
        did_update = before != after or did_update
        rows.append(summary)

        topic_key = summary.get("topic_category_id") or "uncategorized"
        bucket = topic_breakdown.setdefault(
            topic_key,
            {
                "topic_category_id": summary.get("topic_category_id"),
                "topic_category_name": summary.get("topic_category_name") or "Uncategorized",
                "assignment_count": 0,
                "completed_count": 0,
                "certified_count": 0,
                "scores": [],
            },
        )
        bucket["assignment_count"] += 1
        if summary.get("status") in {"completed", "certified"}:
            bucket["completed_count"] += 1
        if summary.get("certificate_id"):
            bucket["certified_count"] += 1
        if summary.get("completed_exercises"):
            bucket["scores"].append(float(summary.get("average_score") or 0.0))

    if did_update:
        db.commit()

    def _average(values: list[float]) -> float:
        if not values:
            return 0.0
        return round(sum(values) / len(values), 2)

    score_values = [
        float(row.get("average_score") or 0.0)
        for row in rows
        if int(row.get("completed_exercises") or 0) > 0
    ]
    completed_count = sum(
        1 for row in rows if row.get("status") in {"completed", "certified"}
    )
    certified_count = sum(1 for row in rows if row.get("certificate_id"))
    in_progress_count = sum(
        1 for row in rows if row.get("status") in {"assigned", "in_progress"}
    )
    total_duration_minutes = sum(int(row.get("duration_minutes") or 0) for row in rows)

    topic_rows = [
        {
            "topic_category_id": bucket["topic_category_id"],
            "topic_category_name": bucket["topic_category_name"],
            "assignment_count": bucket["assignment_count"],
            "completed_count": bucket["completed_count"],
            "certified_count": bucket["certified_count"],
            "average_score": _average(bucket["scores"]),
        }
        for bucket in topic_breakdown.values()
    ]
    topic_rows.sort(
        key=lambda row: (
            row["certified_count"],
            row["completed_count"],
            row["average_score"],
            row["assignment_count"],
        ),
        reverse=True,
    )

    return {
        "summary": {
            "assignment_count": len(rows),
            "in_progress_count": in_progress_count,
            "completed_count": completed_count,
            "certified_count": certified_count,
            "average_score": _average(score_values),
            "pass_rate": round(
                (certified_count / len(rows) * 100) if rows else 0.0,
                2,
            ),
            "total_duration_minutes": total_duration_minutes,
        },
        "topic_progress": topic_rows,
        "recent_certificates": [
            {
                "certificate_id": row.get("certificate_id"),
                "certificate_no": row.get("certificate_no"),
                "achievement_title": row.get("module_title") or row.get("title"),
                "issued_at": row.get("certificate_issued_at") or row.get("completed_at"),
            }
            for row in sorted(
                [row for row in rows if row.get("certificate_id")],
                key=lambda entry: str(entry.get("certificate_issued_at") or entry.get("completed_at") or ""),
                reverse=True,
            )[:8]
        ],
        "assignments": rows,
    }


# ==================== Initial Setup ====================


@router.post("/language-selection")
async def set_language_dialect(
    language_data: LanguageSelection,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Set trainee's language dialect (first-time setup)"""
    current_user.language_dialect = language_data.language_dialect
    db.commit()

    return {
        "status": "updated",
        "language_dialect": current_user.language_dialect,
        "message": "Language dialect set successfully",
    }


@router.post("/ui-preferences")
async def update_ui_preferences(
    preferences: UIPreferences,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Update UI preferences"""
    if preferences.theme:
        current_user.theme = preferences.theme
    if preferences.layout:
        current_user.layout = preferences.layout
    if preferences.big_font is not None:
        current_user.big_font = preferences.big_font
    if preferences.high_contrast is not None:
        current_user.high_contrast = preferences.high_contrast

    current_user.updated_at = datetime.utcnow()
    db.commit()

    return {
        "status": "updated",
        "preferences": {
            "theme": current_user.theme,
            "layout": current_user.layout,
            "big_font": current_user.big_font,
            "high_contrast": current_user.high_contrast,
        },
    }


# ==================== Assigned Scenarios ====================


@router.get("/assigned-scenarios")
async def get_assigned_scenarios(
    current_user: Any = Depends(verify_trainee), db: Session = Depends()
):
    """Get scenarios assigned to trainee via courses"""
    # Get batches for this trainee
    batch_ids = _get_active_batch_ids_for_user(current_user)

    # Get course assignments for trainee's batches or personal assignments
    assignments = (
        db.query(CourseAssignment)
        .join(Course)
        .filter(
            and_(
                CourseAssignment.is_mandatory == True,
                Course.is_published == True,
                (CourseAssignment.batch_id.in_(batch_ids))
                | (CourseAssignment.user_id == current_user.id),
            )
        )
        .all()
    )

    # Collect all scenarios from assigned courses
    scenario_ids = []
    for assignment in assignments:
        if assignment.course and assignment.course.scenario_ids:
            scenario_ids.extend(assignment.course.scenario_ids)
    scenario_ids = [scenario_id for scenario_id in dict.fromkeys(scenario_ids) if scenario_id]

    scenarios = (
        db.query(Scenario)
        .filter(
            Scenario.id.in_(scenario_ids),
            Scenario.is_published == True,
        )
        .all()
        if scenario_ids
        else []
    )

    # Count attempts
    attempts = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .all()
    )
    attempt_count = {}
    for attempt in attempts:
        attempt_count[attempt.scenario_id] = (
            attempt_count.get(attempt.scenario_id, 0) + 1
        )

    return {
        "count": len(scenarios),
        "assigned_scenarios": [
            {
                "id": s.id,
                "title": s.title,
                "description": s.description,
                "difficulty": s.difficulty,
                "estimated_duration": s.estimated_duration,
                "attempt_count": attempt_count.get(s.id, 0),
                "is_completed": attempt_count.get(s.id, 0) > 0,
            }
            for s in scenarios
        ],
    }


@router.get("/all-scenarios")
async def get_all_scenarios(
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
    skip: int = 0,
    limit: int = 50,
    difficulty: Optional[str] = None,
):
    """Get all published scenarios available for self-registration"""
    query = db.query(Scenario).filter(Scenario.is_published == True)

    if difficulty:
        query = query.filter(Scenario.difficulty == difficulty)

    scenarios = query.offset(skip).limit(limit).all()

    # Count attempts for each
    attempts = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .all()
    )
    attempt_count = {}
    for attempt in attempts:
        attempt_count[attempt.scenario_id] = (
            attempt_count.get(attempt.scenario_id, 0) + 1
        )

    return {
        "count": len(scenarios),
        "scenarios": [
            {
                "id": s.id,
                "title": s.title,
                "description": s.description,
                "difficulty": s.difficulty,
                "estimated_duration": s.estimated_duration,
                "attempt_count": attempt_count.get(s.id, 0),
            }
            for s in scenarios
        ],
    }


@router.get("/scenarios/{scenario_id}")
async def get_scenario_detail(
    scenario_id: str,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Get scenario details for practice"""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()

    if not scenario or not scenario.is_published:
        raise HTTPException(status_code=404, detail="Scenario not found")

    # Get flow steps
    flow_steps = sorted(scenario.flow_steps, key=lambda x: x.step_number)

    return {
        "id": scenario.id,
        "title": scenario.title,
        "description": scenario.description,
        "difficulty": scenario.difficulty,
        "estimated_duration": scenario.estimated_duration,
        "opening_prompt": scenario.opening_prompt,
        "opening_prompt_audio": scenario.opening_prompt_audio,
        "expected_keywords": scenario.expected_keywords,
        "gold_standard_script": build_gold_standard_script(scenario=scenario),
        "flow_structure": [
            {
                "step_number": step.step_number,
                "step_type": step.step_type,
                "prompt_text": step.prompt_text,
                "expected_response": step.expected_response,
                "expected_keywords": step.expected_keywords_for_step,
                "is_closing": step.is_closing,
                "response_time_limit": step.response_time_limit,
            }
            for step in flow_steps
        ],
    }


# ==================== Practice Sessions ====================


@router.post("/asr/assess")
async def assess_practice_audio(
    file: UploadFile = File(...),
    scenario_id: Optional[str] = Form(None),
    reference_text: Optional[str] = Form(None),
    response_duration: Optional[float] = Form(None),
    volume_level: Optional[float] = Form(None),
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Assess uploaded trainee audio against a scenario gold-standard script."""
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

    scenario = None
    if scenario_id:
        scenario = (
            db.query(Scenario)
            .filter(Scenario.id == scenario_id, Scenario.is_published == True)
            .first()
        )
        if not scenario:
            raise HTTPException(status_code=404, detail="Scenario not found")
    elif not reference_text:
        raise HTTPException(
            status_code=400,
            detail="Provide either a scenario_id or a reference_text for assessment",
        )

    assessment = assess_audio_submission(
        audio_bytes=file_bytes,
        filename=file.filename or "practice-attempt.webm",
        mime_type=file.content_type or "application/octet-stream",
        scenario=scenario,
        reference_text=reference_text,
        response_duration=response_duration,
        user_dialect=current_user.language_dialect,
    )

    if not scenario:
        return assessment

    next_attempt = (
        db.query(func.max(PracticeSession.attempt_number))
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.scenario_id == scenario.id,
        )
        .scalar()
        or 0
    ) + 1

    session_status = (
        "completed" if float(assessment.get("overall_score", 0)) >= 70 else "needs_review"
    )

    practice_session = PracticeSession(
        user_id=current_user.id,
        scenario_id=scenario.id,
        audio_file_url=None,
        transcription=assessment.get("transcription"),
        transcription_confidence=assessment.get("transcription_confidence"),
        accuracy_score=assessment.get("scores", {}).get("phonetic_accuracy"),
        fluency_score=assessment.get("scores", {}).get("fluency"),
        clarity_score=assessment.get("scores", {}).get("phonetic_accuracy"),
        keyword_adherence_score=assessment.get("scores", {}).get("keyword_adherence"),
        soft_skills_score=assessment.get("scores", {}).get("grammar_precision"),
        overall_score=assessment.get("overall_score"),
        word_feedback=assessment.get("word_feedback"),
        filler_words_detected=assessment.get("detected_disfluencies", {}).get(
            "filler_words", []
        ),
        assessment_data=assessment.get("assessment_data", {}),
        response_duration=int(round(response_duration or 0)) if response_duration else None,
        dead_air_time=None,
        volume_level=volume_level,
        attempt_number=next_attempt,
        status=session_status,
    )

    db.add(practice_session)
    db.commit()
    db.refresh(practice_session)
    _award_scenario_completion_certificate(
        db,
        trainee=current_user,
        scenario=scenario,
        practice_session=practice_session,
    )

    assignments = (
        db.query(CourseAssignment)
        .filter(
            and_(
                CourseAssignment.user_id == current_user.id,
                CourseAssignment.is_completed == False,
            )
        )
        .all()
    )

    for assignment in assignments:
        if (
            assignment.course
            and practice_session.scenario_id in assignment.course.scenario_ids
        ):
            completed_scenarios = (
                db.query(PracticeSession)
                .filter(
                    and_(
                        PracticeSession.user_id == current_user.id,
                        PracticeSession.scenario_id.in_(assignment.course.scenario_ids),
                    )
                )
                .distinct(PracticeSession.scenario_id)
                .count()
            )

            total_scenarios = len(assignment.course.scenario_ids)
            assignment.completion_percentage = (
                (completed_scenarios / total_scenarios * 100)
                if total_scenarios > 0
                else 0
            )

            if assignment.completion_percentage >= 100:
                assignment.is_completed = True
                _award_course_assignment_completion_certificate(
                    db,
                    trainee=current_user,
                    assignment=assignment,
                )

    db.commit()

    assessment["session_id"] = practice_session.id
    assessment["scenario_id"] = scenario.id
    assessment["scenario_title"] = scenario.title
    assessment["attempt_number"] = practice_session.attempt_number
    assessment["status"] = session_status

    await live_update_manager.broadcast_training_update(
        {
            "type": "practice_session_completed",
            "session": {
                "id": practice_session.id,
                "user_id": current_user.id,
                "user_name": current_user.full_name,
                "scenario_id": scenario.id,
                "scenario_title": scenario.title,
                "overall_score": practice_session.overall_score or 0,
                "accuracy": practice_session.accuracy_score or 0,
                "fluency": practice_session.fluency_score or 0,
                "created_at": practice_session.created_at.isoformat(),
                "is_verified": practice_session.is_verified,
                "provider": assessment.get("provider"),
            },
        }
    )

    return assessment


@router.post("/practice-sessions")
async def create_practice_session(
    session_data: PracticeSessionCreate,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Record a completed practice session"""
    scenario = (
        db.query(Scenario).filter(Scenario.id == session_data.scenario_id).first()
    )

    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    new_session = PracticeSession(
        user_id=current_user.id,
        scenario_id=session_data.scenario_id,
        audio_file_url=session_data.audio_file_url,
        transcription=session_data.transcription,
        transcription_confidence=session_data.transcription_confidence,
        accuracy_score=session_data.accuracy_score,
        fluency_score=session_data.fluency_score,
        clarity_score=session_data.clarity_score,
        keyword_adherence_score=session_data.keyword_adherence_score,
        soft_skills_score=session_data.soft_skills_score,
        overall_score=session_data.overall_score,
        word_feedback=session_data.word_feedback,
        filler_words_detected=session_data.filler_words_detected or [],
        response_duration=session_data.response_duration,
        dead_air_time=session_data.dead_air_time,
        volume_level=session_data.volume_level,
        attempt_number=session_data.attempt_number,
        assessment_data=session_data.assessment_data or {},  # Store full assessment data
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    _award_scenario_completion_certificate(
        db,
        trainee=current_user,
        scenario=scenario,
        practice_session=new_session,
    )

    # Update course assignment completion if applicable
    # Find if there's an assignment for this scenario's course
    assignments = (
        db.query(CourseAssignment)
        .filter(
            and_(
                CourseAssignment.user_id == current_user.id,
                CourseAssignment.is_completed == False,
            )
        )
        .all()
    )

    for assignment in assignments:
        if (
            assignment.course
            and new_session.scenario_id in assignment.course.scenario_ids
        ):
            completed_scenarios = (
                db.query(PracticeSession)
                .filter(
                    and_(
                        PracticeSession.user_id == current_user.id,
                        PracticeSession.scenario_id.in_(assignment.course.scenario_ids),
                    )
                )
                .distinct(PracticeSession.scenario_id)
                .count()
            )

            total_scenarios = len(assignment.course.scenario_ids)
            assignment.completion_percentage = (
                (completed_scenarios / total_scenarios * 100)
                if total_scenarios > 0
                else 0
            )

            if assignment.completion_percentage >= 100:
                assignment.is_completed = True
                _award_course_assignment_completion_certificate(
                    db,
                    trainee=current_user,
                    assignment=assignment,
                )

    db.commit()

    return {
        "session_id": new_session.id,
        "scenario_id": new_session.scenario_id,
        "overall_score": new_session.overall_score,
        "status": "recorded",
    }


@router.get("/practice-sessions")
async def list_practice_sessions(
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
    scenario_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    """Get trainee's practice session history"""
    query = db.query(PracticeSession).filter(PracticeSession.user_id == current_user.id)

    if scenario_id:
        query = query.filter(PracticeSession.scenario_id == scenario_id)

    sessions = (
        query.order_by(PracticeSession.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "count": len(sessions),
        "sessions": [
            {
                "id": s.id,
                "scenario_id": s.scenario_id,
                "scenario_title": s.scenario.title if s.scenario else None,
                "overall_score": s.overall_score,
                "attempt_number": s.attempt_number,
                "created_at": s.created_at,
                "is_verified": s.is_verified,
            }
            for s in sessions
        ],
    }


@router.get("/scenarios")
async def list_dashboard_scenarios(
    current_user: Any = Depends(verify_trainee), db: Session = Depends()
):
    """UI-friendly scenario list for trainee dashboard."""
    data = await get_assigned_scenarios(current_user=current_user, db=db)
    return {"scenarios": data.get("assigned_scenarios", [])}


@router.get("/sessions")
async def list_dashboard_sessions(
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
    skip: int = 0,
    limit: int = 50,
):
    """UI-friendly session list for trainee dashboard."""
    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .order_by(PracticeSession.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "count": len(sessions),
        "sessions": [
            {
                "id": s.id,
                "scenario_title": s.scenario.title if s.scenario else None,
                "overall_score": s.overall_score or 0,
                "accuracy": s.accuracy_score or 0,
                "fluency": s.fluency_score or 0,
                "created_at": s.created_at,
                "duration": s.response_duration or 0,
            }
            for s in sessions
        ],
    }


@router.get("/practice-sessions/{session_id}")
async def get_practice_session(
    session_id: str,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Get detailed practice session results"""
    session = (
        db.query(PracticeSession)
        .filter(
            and_(
                PracticeSession.id == session_id,
                PracticeSession.user_id == current_user.id,
            )
        )
        .first()
    )

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "id": session.id,
        "scenario_id": session.scenario_id,
        "scenario_title": session.scenario.title if session.scenario else None,
        "audio_file_url": session.audio_file_url,
        "transcription": session.transcription,
        "transcription_confidence": session.transcription_confidence,
        "overall_score": session.overall_score,
        "scores": {
            "accuracy": session.accuracy_score,
            "fluency": session.fluency_score,
            "clarity": session.clarity_score,
            "keyword_adherence": session.keyword_adherence_score,
            "soft_skills": session.soft_skills_score,
        },
        "word_feedback": session.word_feedback,
        "filler_words": session.filler_words_detected,
        "assessment_data": session.assessment_data,
        "response_metrics": {
            "duration": session.response_duration,
            "dead_air_time": session.dead_air_time,
            "volume_level": session.volume_level,
        },
        "attempt_number": session.attempt_number,
        "is_verified": session.is_verified,
        "feedback": [
            {
                "id": f.id,
                "feedback_type": f.feedback_type,
                "content": f.content,
                "trainer_name": f.trainer.full_name if f.trainer else None,
                "recommended_module_id": f.recommended_module_id,
                "is_acknowledged": f.is_acknowledge_by_trainee,
                "created_at": f.created_at,
            }
            for f in session.feedback_items
        ],
        "created_at": session.created_at,
    }


@router.post("/practice-sessions/{session_id}/acknowledge-feedback")
async def acknowledge_feedback(
    session_id: str,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Mark feedback as acknowledged by trainee"""
    feedback_items = (
        db.query(Feedback).filter(Feedback.practice_session_id == session_id).all()
    )

    for feedback in feedback_items:
        feedback.is_acknowledge_by_trainee = True

    db.commit()

    return {"status": "acknowledged"}


# ==================== Reports & Progress ====================


@router.get("/reports")
async def get_performance_reports(
    current_user: Any = Depends(verify_trainee), db: Session = Depends(), days: int = 7
):
    """Get trainee's performance report"""
    cutoff_date = datetime.utcnow() - timedelta(days=days)

    sessions = (
        db.query(PracticeSession)
        .filter(
            and_(
                PracticeSession.user_id == current_user.id,
                PracticeSession.created_at >= cutoff_date,
            )
        )
        .order_by(PracticeSession.created_at.asc())
        .all()
    )

    total_sessions = len(sessions)
    passed_sessions = sum(
        1 for s in sessions if s.overall_score and s.overall_score >= 70
    )

    # Calculate averages
    avg_scores = {
        "overall": (
            sum(s.overall_score or 0 for s in sessions) / total_sessions
            if total_sessions
            else 0
        ),
        "accuracy": (
            sum(s.accuracy_score or 0 for s in sessions) / total_sessions
            if total_sessions
            else 0
        ),
        "fluency": (
            sum(s.fluency_score or 0 for s in sessions) / total_sessions
            if total_sessions
            else 0
        ),
        "clarity": (
            sum(s.clarity_score or 0 for s in sessions) / total_sessions
            if total_sessions
            else 0
        ),
        "keyword_adherence": (
            sum(s.keyword_adherence_score or 0 for s in sessions) / total_sessions
            if total_sessions
            else 0
        ),
        "soft_skills": (
            sum(s.soft_skills_score or 0 for s in sessions) / total_sessions
            if total_sessions
            else 0
        ),
    }

    # Group by scenario for category breakdown
    scenario_performance = {}
    for session in sessions:
        scenario_id = session.scenario_id
        if scenario_id not in scenario_performance:
            scenario_performance[scenario_id] = {
                "scenario_title": session.scenario.title if session.scenario else None,
                "attempts": [],
                "best_score": 0,
            }

        scenario_performance[scenario_id]["attempts"].append(
            {
                "overall_score": session.overall_score,
                "attempt_number": session.attempt_number,
                "created_at": session.created_at,
            }
        )

        if (
            session.overall_score
            and session.overall_score > scenario_performance[scenario_id]["best_score"]
        ):
            scenario_performance[scenario_id]["best_score"] = session.overall_score

    return {
        "period_days": days,
        "summary": {
            "total_sessions": total_sessions,
            "passed_sessions": passed_sessions,
            "failed_sessions": total_sessions - passed_sessions,
            "pass_rate": (
                round((passed_sessions / total_sessions * 100), 2)
                if total_sessions > 0
                else 0
            ),
        },
        "average_scores": {k: round(v, 2) for k, v in avg_scores.items()},
        "scenario_performance": scenario_performance,
    }


@router.get("/progress-trends")
async def get_progress_trends(
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
    weeks: int = 4,
):
    """Get weekly progress trend"""
    cutoff_date = datetime.utcnow() - timedelta(days=weeks * 7)

    sessions = (
        db.query(PracticeSession)
        .filter(
            and_(
                PracticeSession.user_id == current_user.id,
                PracticeSession.created_at >= cutoff_date,
            )
        )
        .order_by(PracticeSession.created_at.asc())
        .all()
    )

    # Group by week
    weekly_data = {}
    for session in sessions:
        week_num = (datetime.utcnow() - session.created_at).days // 7
        week_key = f"week_{week_num}"

        if week_key not in weekly_data:
            weekly_data[week_key] = {"week": week_num, "sessions": [], "avg_score": 0}

        weekly_data[week_key]["sessions"].append(session)

    # Calculate weekly averages
    for week_key, data in weekly_data.items():
        if data["sessions"]:
            avg = sum(s.overall_score or 0 for s in data["sessions"]) / len(
                data["sessions"]
            )
            data["avg_score"] = round(avg, 2)

    return {
        "weeks": weeks,
        "trend_data": [
            {
                "week": data["week"],
                "average_score": data["avg_score"],
                "session_count": len(data["sessions"]),
            }
            for data in sorted(
                weekly_data.values(), key=lambda x: x["week"], reverse=True
            )
        ],
    }


# ==================== Assigned Courses & Modules ====================


@router.get("/assigned-courses")
async def get_assigned_courses(
    current_user: Any = Depends(verify_trainee), db: Session = Depends()
):
    """Get courses assigned to trainee"""
    batch_ids = _get_active_batch_ids_for_user(current_user)

    # Get assignments from batches or personal
    assignments = (
        db.query(CourseAssignment)
        .join(Course)
        .filter(
            Course.is_published == True,
            (CourseAssignment.batch_id.in_(batch_ids))
            | (CourseAssignment.user_id == current_user.id)
        )
        .all()
    )

    return {
        "count": len(assignments),
        "courses": [
            {
                "course_id": a.course_id,
                "course_name": a.course.name if a.course else None,
                "is_mandatory": a.is_mandatory,
                "due_date": a.due_date,
                "completion_percentage": a.completion_percentage,
                "is_completed": a.is_completed,
                "assigned_at": a.assigned_at,
            }
            for a in assignments
        ],
    }


@router.get("/microlearning-modules")
async def get_microlearning_modules(
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
    category: Optional[str] = None,
):
    """Get available microlearning modules"""
    assignments = (
        _active_trainee_microlearning_assignments_query(
            db,
            trainee_id=current_user.id,
        )
        .options(
            joinedload(MicrolearningAssignment.module).joinedload(MicrolearningModule.assessment_method),
            joinedload(MicrolearningAssignment.module).joinedload(MicrolearningModule.topic_category),
            joinedload(MicrolearningAssignment.trainee).joinedload(User.batches),
            joinedload(MicrolearningAssignment.batch),
        )
        .order_by(MicrolearningAssignment.assigned_at.desc())
        .all()
    )
    assignments = filter_current_assignments(assignments)
    modules: list[MicrolearningModule] = []
    seen_module_ids: set[str] = set()
    for assignment in assignments:
        module = assignment.module
        if not module or module.id in seen_module_ids:
            continue
        if category and module.category != category:
            continue
        seen_module_ids.add(module.id)
        modules.append(module)

    return {
        "count": len(modules),
        "modules": [serialize_microlearning_module(m) for m in modules],
    }


@router.get("/microlearning-assignments")
async def list_microlearning_assignments(
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """List the trainee's assigned microlearning modules."""
    assignments = (
        _active_trainee_microlearning_assignments_query(
            db,
            trainee_id=current_user.id,
        )
        .options(
            joinedload(MicrolearningAssignment.module).joinedload(MicrolearningModule.assessment_method),
            joinedload(MicrolearningAssignment.module).joinedload(MicrolearningModule.topic_category),
            joinedload(MicrolearningAssignment.trainee).joinedload(User.batches),
            joinedload(MicrolearningAssignment.trainer),
            joinedload(MicrolearningAssignment.batch),
            joinedload(MicrolearningAssignment.certificate),
        )
        .order_by(MicrolearningAssignment.assigned_at.desc())
        .all()
    )
    assignments = filter_current_assignments(assignments)

    did_update = False
    serialized = []
    for assignment in assignments:
        did_update = ensure_module_exercises(assignment.module) or did_update
        before = (
            assignment.status,
            assignment.completion_percentage,
            assignment.completed_exercises,
            assignment.completed_at,
        )
        did_update = sync_flashcard_assignment_runtime(db, assignment) or did_update
        refresh_assignment_progress(assignment)
        after = (
            assignment.status,
            assignment.completion_percentage,
            assignment.completed_exercises,
            assignment.completed_at,
        )
        did_update = before != after or did_update
        serialized.append(serialize_assignment_summary(assignment))

    if did_update:
        db.commit()

    return {
        "count": len(serialized),
        "assignments": serialized,
    }


@router.get("/microlearning-assignments/{assignment_id}")
async def get_microlearning_assignment_detail(
    assignment_id: str,
    include_exercises: bool = True,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Get the assignment detail and exercise attempts for a trainee."""
    assignment = _get_trainee_microlearning_assignment(
        db,
        trainee_id=current_user.id,
        assignment_id=assignment_id,
    )

    did_update = ensure_module_exercises(assignment.module)
    before = (
        assignment.status,
        assignment.completion_percentage,
        assignment.completed_exercises,
        assignment.completed_at,
    )
    responses_before = dict(assignment.responses or {})
    did_update = sync_flashcard_assignment_runtime(db, assignment) or did_update
    refresh_assignment_progress(assignment)
    after = (
        assignment.status,
        assignment.completion_percentage,
        assignment.completed_exercises,
        assignment.completed_at,
    )
    result_summary = ensure_assignment_result_summary(assignment)
    if did_update or before != after or responses_before != dict(assignment.responses or {}):
        db.commit()
        db.refresh(assignment)

    return serialize_assignment_detail(assignment, include_exercises=include_exercises)


@router.post("/microlearning-assignments/{assignment_id}/start")
async def start_microlearning_assignment(
    assignment_id: str,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Mark an assigned microlearning module as started before the trainee begins the lesson."""
    assignment = _get_trainee_microlearning_assignment(
        db,
        trainee_id=current_user.id,
        assignment_id=assignment_id,
    )

    ensure_module_exercises(assignment.module)
    start_time = datetime.utcnow()
    if assignment.started_at is None:
        assignment.started_at = start_time
    start_flashcard_assignment_runtime(
        assignment,
        now=assignment.started_at or start_time,
    )

    refresh_assignment_progress(assignment)
    db.commit()
    db.refresh(assignment)

    return {
        "status": "started",
        "assignment": serialize_assignment_summary(assignment),
        "flashcard_session": get_flashcard_session_state(assignment),
    }


@router.post("/microlearning-assignments/{assignment_id}/flashcard-session")
async def update_microlearning_flashcard_session(
    assignment_id: str,
    payload: MicrolearningFlashcardSessionUpdate,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Persist the in-progress flashcard answer so refreshes can resume cleanly."""
    assignment = _get_trainee_microlearning_assignment(
        db,
        trainee_id=current_user.id,
        assignment_id=assignment_id,
    )

    ensure_module_exercises(assignment.module)
    sync_flashcard_assignment_runtime(db, assignment)

    started_at = assignment.started_at or datetime.utcnow()
    if assignment.started_at is None:
        assignment.started_at = started_at
        start_flashcard_assignment_runtime(assignment, now=started_at)

    session_state = update_flashcard_assignment_runtime_progress(
        assignment,
        exercise_id=payload.exercise_id,
        draft_response_text=payload.response_text,
        revealed_side=payload.revealed_side,
        now=datetime.utcnow(),
    )
    refresh_assignment_progress(assignment)
    db.commit()
    db.refresh(assignment)

    return {
        "status": "updated",
        "assignment": serialize_assignment_summary(assignment),
        "flashcard_session": session_state or get_flashcard_session_state(assignment),
    }


@router.post("/microlearning-assignments/{assignment_id}/exercises/{exercise_id}")
async def submit_microlearning_exercise(
    assignment_id: str,
    exercise_id: str,
    payload: MicrolearningExerciseSubmission,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Save a trainee exercise response and update assignment progress."""
    assignment = _get_trainee_microlearning_assignment(
        db,
        trainee_id=current_user.id,
        assignment_id=assignment_id,
    )

    ensure_module_exercises(assignment.module)
    sync_flashcard_assignment_runtime(db, assignment)
    exercises = (assignment.module.exercises or []) if assignment.module else []
    exercise = next((item for item in exercises if item.get("id") == exercise_id), None)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    existing_attempt = dict(assignment.responses or {}).get(exercise_id)
    if (
        str(exercise.get("type") or "").strip().lower() == "flashcard_recall"
        and isinstance(existing_attempt, dict)
        and existing_attempt.get("is_completed")
    ):
        return {
            "status": "saved",
            "attempt": existing_attempt,
            "assignment": serialize_assignment_summary(assignment),
            "flashcard_session": get_flashcard_session_state(assignment),
        }

    now = datetime.utcnow()
    flashcard_session = get_flashcard_session_state(assignment, now=now)
    if str(exercise.get("type") or "").strip().lower() == "flashcard_recall":
        if assignment.started_at is None:
            raise HTTPException(status_code=409, detail="Start the flashcard module before answering.")
        if not flashcard_session or flashcard_session.get("phase") == "not_started":
            raise HTTPException(status_code=409, detail="The flashcard timer is not active yet.")
        if flashcard_session.get("phase") == "completed":
            raise HTTPException(status_code=409, detail="This flashcard module is already complete.")
        if flashcard_session.get("current_exercise_id") != exercise_id:
            raise HTTPException(
                status_code=409,
                detail="Only the active flashcard can be answered. Wait for the guided sequence to advance.",
            )
        if flashcard_session.get("phase") == "study":
            raise HTTPException(
                status_code=409,
                detail="Study Mode is still active. Answers unlock automatically after the 30-second study timer ends.",
            )
        if not payload.timer_expired:
            raise HTTPException(
                status_code=409,
                detail="Flashcard answers are saved automatically when the 60-second answer timer expires.",
            )

        study_started_text = flashcard_session.get("study_started_at")
        resolved_study_started_at = (
            datetime.fromisoformat(str(study_started_text))
            if study_started_text
            else now
        )

        answer_deadline_text = flashcard_session.get("answer_deadline_at")
        resolved_answer_deadline = (
            datetime.fromisoformat(str(answer_deadline_text))
            if answer_deadline_text
            else resolved_study_started_at + timedelta(seconds=90)
        )
        answer_status = payload.status or ("timed_out" if (payload.response_text or "").strip() else "unanswered")
        attempt = evaluate_exercise_submission(
            exercise,
            response_text=payload.response_text,
            selected_option=payload.selected_option,
            input_mode=payload.input_mode,
            revealed_side=payload.revealed_side or "back",
            study_time_seconds=flashcard_session.get("study_time_seconds"),
            answer_time_seconds=flashcard_session.get("answer_time_seconds"),
            answer_status=answer_status,
            answered_at=resolved_answer_deadline,
            timer_expired=True,
            mark_completed=True,
        )
        responses = dict(assignment.responses or {})
        responses[exercise_id] = attempt
        assignment.responses = responses
        persist_flashcard_attempt_result(
            db,
            assignment,
            exercise_id=exercise_id,
            attempt=attempt,
            study_started_at=resolved_study_started_at,
        )
        advance_flashcard_assignment_runtime(
            assignment,
            next_start_at=resolved_answer_deadline,
        )
    else:
        attempt = evaluate_exercise_submission(
            exercise,
            response_text=payload.response_text,
            selected_option=payload.selected_option,
            input_mode=payload.input_mode,
            revealed_side=payload.revealed_side,
        )
        responses = dict(assignment.responses or {})
        responses[exercise_id] = attempt
        assignment.responses = responses

    refresh_assignment_progress(assignment)
    assignment_summary = serialize_assignment_summary(assignment)
    if assignment_summary.get("is_passed") and assignment.status in {"completed", "certified"}:
        _award_microlearning_assignment_certificate(
            db,
            trainee=current_user,
            assignment=assignment,
        )
        refresh_assignment_progress(assignment)
    result_summary = ensure_assignment_result_summary(assignment)
    db.commit()
    db.refresh(assignment)

    return {
        "status": "saved",
        "attempt": attempt,
        "assignment": serialize_assignment_summary(assignment),
        "flashcard_session": get_flashcard_session_state(assignment),
        "result_summary": result_summary or None,
    }


@router.post("/microlearning-assignments/{assignment_id}/retake")
async def retake_microlearning_assignment(
    assignment_id: str,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Reset a completed-but-not-passed microlearning module so the trainee can try again."""
    assignment = _get_trainee_microlearning_assignment(
        db,
        trainee_id=current_user.id,
        assignment_id=assignment_id,
    )

    ensure_module_exercises(assignment.module)
    refresh_assignment_progress(assignment)
    summary = serialize_assignment_summary(assignment)

    if summary.get("is_passed"):
        raise HTTPException(status_code=400, detail="This module is already passed.")
    if assignment.completed_exercises < len((assignment.module.exercises or []) if assignment.module else []):
        raise HTTPException(status_code=400, detail="Finish the current attempt before requesting a retake.")

    reset_assignment_for_retake(assignment)
    refresh_assignment_progress(assignment)
    db.commit()
    db.refresh(assignment)

    return {
        "status": "retake_started",
        "assignment": serialize_assignment_summary(assignment),
    }


@router.get("/microlearning-report")
async def get_microlearning_report(
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Return the trainee's microlearning accomplishment report."""
    sync_trainee_completion_certificates(db, current_user.id)
    return _build_trainee_microlearning_report(db, trainee_id=current_user.id)


# ==================== Trainee Dashboard ====================


@router.get("/stats")
async def trainee_stats(
    current_user: Any = Depends(verify_trainee), db: Session = Depends()
):
    """Stats payload used by trainee dashboard UI."""
    sync_trainee_completion_certificates(db, current_user.id)
    now = datetime.utcnow()
    start_of_day = datetime(now.year, now.month, now.day)
    end_of_day = start_of_day + timedelta(days=1)

    (
        total_sessions,
        avg_score,
        max_score,
        total_practice_time,
        completed_today,
        completed_scenarios,
    ) = (
        db.query(
            func.count(PracticeSession.id),
            func.avg(PracticeSession.overall_score),
            func.max(PracticeSession.overall_score),
            func.sum(PracticeSession.response_duration),
            func.sum(
                case(
                    (
                        and_(
                            PracticeSession.created_at >= start_of_day,
                            PracticeSession.created_at < end_of_day,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.count(func.distinct(PracticeSession.scenario_id)),
        )
        .filter(PracticeSession.user_id == current_user.id)
        .one()
    )
    certifications = (
        db.query(func.count(CertificateRecord.id))
        .filter(
            CertificateRecord.trainee_id == current_user.id,
            CertificateRecord.source_type.in_(list(SUPPORTED_ACTIVITY_CERTIFICATE_SOURCES)),
        )
        .scalar()
        or 0
    )

    microlearning_assignment_rows = (
        _active_trainee_microlearning_assignments_query(
            db,
            trainee_id=current_user.id,
        )
        .options(
            joinedload(MicrolearningAssignment.module),
            joinedload(MicrolearningAssignment.batch),
            joinedload(MicrolearningAssignment.trainee).joinedload(User.batches),
        )
        .all()
    )
    current_microlearning_assignments = filter_current_assignments(microlearning_assignment_rows)
    microlearning_assignments = len(current_microlearning_assignments)
    certified_microlearning_assignments = sum(
        1
        for assignment in current_microlearning_assignments
        if assignment.certificate_id is not None
    )

    return {
        "total_sessions": int(total_sessions),
        "average_score": float(avg_score or 0),
        "highest_score": float(max_score or 0),
        "total_practice_time": int(total_practice_time or 0),
        "completed_today": int(completed_today),
        "completed_scenarios": int(completed_scenarios),
        "certifications": int(certifications),
        "microlearning_assignments": int(microlearning_assignments or 0),
        "microlearning_certifications": int(certified_microlearning_assignments or 0),
    }


@router.get("/dashboard")
async def trainee_dashboard(
    current_user: Any = Depends(verify_trainee), db: Session = Depends()
):
    """Trainee dashboard overview"""
    # Get recent sessions
    recent_sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .order_by(PracticeSession.created_at.desc())
        .limit(5)
        .all()
    )

    # Get pending feedback
    pending_feedback = (
        db.query(Feedback)
        .join(PracticeSession)
        .filter(
            and_(
                PracticeSession.user_id == current_user.id,
                Feedback.is_acknowledge_by_trainee == False,
            )
        )
        .all()
    )

    # Get assigned courses
    batch_ids = _get_active_batch_ids_for_user(current_user)
    assigned_courses = (
        db.query(CourseAssignment)
        .join(Course)
        .filter(
            Course.is_published == True,
            (CourseAssignment.batch_id.in_(batch_ids))
            | (CourseAssignment.user_id == current_user.id)
        )
        .all()
    )

    # Calculate stats
    total_sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .count()
    )

    return {
        "user_name": current_user.full_name,
        "language_dialect": current_user.language_dialect,
        "total_sessions": total_sessions,
        "pending_feedback_count": len(pending_feedback),
        "assigned_courses_count": len(assigned_courses),
        "recent_sessions": [
            {
                "session_id": s.id,
                "scenario_title": s.scenario.title if s.scenario else None,
                "overall_score": s.overall_score,
                "created_at": s.created_at,
            }
            for s in recent_sessions
        ],
        "timestamp": datetime.utcnow(),
    }

# ==================== Audio Upload to Supabase ====================


@router.post("/upload-audio")
async def upload_audio_to_supabase(
    scenario_id: str,
    file: UploadFile = File(...),
    current_user: Any = Depends(verify_trainee),
):
    """
    Upload audio recording to Supabase cloud storage
    Returns the public URL for the uploaded file
    
    This endpoint handles:
    1. Receiving audio file from trainee's browser/app
    2. Uploading to Supabase storage bucket
    3. Returning public URL for storage in database
    """
    try:
        supabase = get_supabase_client()
        
        if not supabase.is_available:
            logger.warning("Supabase storage not available for audio upload")
            return {
                "status": "success",
                "audio_url": None,
                "message": "Audio storage not configured - assessment will proceed without audio file",
                "user_id": current_user.id,
            }
        
        # Read file bytes
        file_bytes = await file.read()
        
        # Upload to Supabase
        public_url = supabase.upload_audio(
            file_data=file_bytes,
            user_id=current_user.id,
            filename=f"{scenario_id}_{datetime.utcnow().isoformat()}.wav"
        )
        
        if not public_url:
            logger.warning(f"Failed to upload audio for scenario {scenario_id}, continuing without URL")
            return {
                "status": "success",
                "audio_url": None,
                "message": "Audio upload failed - assessment will proceed without audio file",
                "user_id": current_user.id,
            }
        
        return {
            "status": "success",
            "audio_url": public_url,
            "message": "Audio uploaded to cloud storage",
            "user_id": current_user.id,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Audio upload failed: {str(e)}"
        )


# ==================== Account Status Management ====================


class AccountStatusUpdate(BaseModel):
    """Request model for trainee account status update"""
    is_active: bool


@router.get("/account-status")
async def get_account_status(
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Get the trainee's current account status"""
    trainee = db.query(User).filter(User.id == current_user.id).first()
    
    if not trainee:
        raise HTTPException(status_code=404, detail="Trainee account not found")
    
    return {
        "id": trainee.id,
        "full_name": trainee.full_name,
        "email": trainee.email,
        "is_active": trainee.is_active,
        "created_at": trainee.created_at,
        "updated_at": trainee.updated_at,
    }


@router.get("/registered-trainees")
async def get_all_registered_trainees(
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """Get all registered trainee accounts in the system (read-only for trainees)"""
    trainees = (
        db.query(User)
        .filter(User.role == UserRole.TRAINEE)
        .order_by(User.is_active.desc(), User.full_name.asc(), User.email.asc())
        .all()
    )
    
    trainee_list = [
        {
            "id": t.id,
            "full_name": t.full_name,
            "email": t.email,
            "is_active": t.is_active,
            "department": t.department,
            "created_at": t.created_at,
        }
        for t in trainees
    ]
    
    return {
        "count": len(trainee_list),
        "trainees": trainee_list,
    }


@router.put("/account-status")
async def update_account_status(
    status_data: AccountStatusUpdate,
    current_user: Any = Depends(verify_trainee),
    db: Session = Depends(),
):
    """
    Update trainee's own account status (active/inactive).
    Trainee can deactivate their own account but CANNOT reactivate it.
    Only trainers can reactivate deactivated trainee accounts.
    """
    trainee = db.query(User).filter(User.id == current_user.id).first()
    
    if not trainee:
        raise HTTPException(status_code=404, detail="Trainee account not found")
    
    # Trainee can only deactivate their account, not reactivate
    if status_data.is_active and not trainee.is_active:
        raise HTTPException(
            status_code=403,
            detail="You cannot reactivate your account. Please contact your trainer for account reactivation."
        )
    
    # If deactivating, remove from all batch assignments
    if not status_data.is_active and trainee.is_active:
        trainee.batches.clear()
    
    trainee.is_active = status_data.is_active
    db.commit()
    db.refresh(trainee)
    
    return {
        "status": "updated",
        "message": f"Account status changed to {'active' if status_data.is_active else 'inactive'}",
        "trainee": {
            "id": trainee.id,
            "full_name": trainee.full_name,
            "email": trainee.email,
            "is_active": trainee.is_active,
        }
    }


@router.websocket("/live-updates")
async def trainee_live_updates(websocket: WebSocket, token: str):
    """Push trainee-specific workspace updates such as microlearning assignment removals."""
    db = SessionLocal()
    channel = ""
    try:
        token_data = auth_utils.decode_token(token)
        user = db.query(User).filter(User.id == token_data.user_id).first()

        if not user or user.role != UserRole.TRAINEE:
            await websocket.close(code=4403)
            return

        channel = f"trainee:{user.id}"
        await live_update_manager.connect(channel, websocket)
        await websocket.send_json(
            {
                "type": "connected",
                "role": user.role.value,
                "message": "Live trainee workspace updates enabled",
            }
        )

        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except HTTPException:
        try:
            await websocket.accept()
        except Exception:
            pass
        try:
            await websocket.close(code=4401)
        except Exception:
            pass
    except WebSocketDisconnect:
        if channel:
            await live_update_manager.disconnect(channel, websocket)
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
        if channel:
            await live_update_manager.disconnect(channel, websocket)
    finally:
        db.close()
