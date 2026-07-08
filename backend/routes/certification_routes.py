"""
Integrated routes for MCQ assessments, coaching logs, competency verdicts, and certificates.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import (
    Batch,
    CallSimulationAssignment,
    CertificateRecord,
    CertificationSettings,
    CoachingLog,
    CoachingTemplate,
    CompetencyVerdict,
    MCQAssessment,
    MCQCategory,
    MCQQuestion,
    MCQSubmission,
    PracticeSession,
    Scenario,
    SimSession,
    User,
    UserRole,
)
from ..services.certificate_awards import (
    award_certificate,
    build_template_snapshot,
    ensure_certification_settings,
    issue_certificate_for_verdict,
    prune_trainee_activity_certificates,
    sync_trainee_completion_certificates,
)
from ..services.certificate_service import generate_certificate_pdf
from ..services.coaching import (
    build_training_state,
    generate_coaching_id,
    load_latest_coaching_logs,
    normalize_competency_status,
    serialize_coaching_log,
)
from ..services.supabase_auth_service import filter_to_supabase_active_users

router = APIRouter(prefix="/api/certification", tags=["certification"])
MCQ_MIN_PASSING_THRESHOLD = 90.0


def _effective_mcq_passing_threshold(value: Optional[float]) -> float:
    try:
        normalized = float(value or 0.0)
    except (TypeError, ValueError):
        normalized = 0.0

    return max(normalized, MCQ_MIN_PASSING_THRESHOLD)


def _ensure_role(current_user: User, allowed: List[UserRole]) -> None:
    if current_user.role not in allowed:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _can_manage_mcq_resource(current_user: User, created_by: str) -> bool:
    return current_user.role == UserRole.ADMIN or current_user.id == created_by


def _serialize_mcq_categories(db: Session, categories: List[MCQCategory]) -> List[dict]:
    category_ids = [category.id for category in categories]
    creator_ids = list({category.created_by for category in categories if category.created_by})

    creator_lookup = {}
    if creator_ids:
        creator_lookup = {
            user.id: user
            for user in db.query(User).filter(User.id.in_(creator_ids)).all()
        }

    active_question_ids: dict[str, list[str]] = {}
    if category_ids:
        question_rows = (
            db.query(MCQQuestion.id, MCQQuestion.category_id)
            .filter(
                MCQQuestion.category_id.in_(category_ids),
                MCQQuestion.is_active == True,
            )
            .all()
        )
        for question_id, category_id in question_rows:
            active_question_ids.setdefault(category_id, []).append(question_id)

    assignment_counts = {}
    if category_ids:
        assignment_counts = {
            category_id: count
            for category_id, count in (
                db.query(MCQAssessment.category_id, func.count(MCQAssessment.id))
                .filter(
                    MCQAssessment.category_id.in_(category_ids),
                    MCQAssessment.is_active == True,
                )
                .group_by(MCQAssessment.category_id)
                .all()
            )
        }

    return [
        {
            "id": category.id,
            "name": category.name,
            "description": category.description,
            "difficulty": category.difficulty,
            "lob": category.lob,
            "passing_threshold": _effective_mcq_passing_threshold(category.passing_threshold),
            "is_global": category.is_global,
            "is_active": category.is_active,
            "created_by": category.created_by,
            "created_by_name": creator_lookup.get(category.created_by).full_name
            if creator_lookup.get(category.created_by)
            else None,
            "created_by_role": creator_lookup.get(category.created_by).role
            if creator_lookup.get(category.created_by)
            else None,
            "created_at": category.created_at,
            "updated_at": category.updated_at,
            "question_count": len(active_question_ids.get(category.id, [])),
            "selected_question_ids": [
                question_id
                for question_id in dict.fromkeys(category.selected_question_ids or [])
                if question_id in set(active_question_ids.get(category.id, []))
            ],
            "selected_question_count": len(
                [
                    question_id
                    for question_id in dict.fromkeys(category.selected_question_ids or [])
                    if question_id in set(active_question_ids.get(category.id, []))
                ]
            ),
            "assignment_count": assignment_counts.get(category.id, 0),
        }
        for category in categories
    ]


def _serialize_mcq_questions(db: Session, questions: List[MCQQuestion]) -> List[dict]:
    creator_ids = list({question.created_by for question in questions if question.created_by})
    category_ids = list({question.category_id for question in questions if question.category_id})
    creator_lookup = {}
    category_lookup = {}
    if creator_ids:
        creator_lookup = {
            user.id: user
            for user in db.query(User).filter(User.id.in_(creator_ids)).all()
        }
    if category_ids:
        category_lookup = {
            category.id: category
            for category in db.query(MCQCategory).filter(MCQCategory.id.in_(category_ids)).all()
        }

    return [
        {
            "id": question.id,
            "category_id": question.category_id,
            "category_name": category_lookup.get(question.category_id).name
            if category_lookup.get(question.category_id)
            else None,
            "question_text": question.question_text,
            "options": {
                "A": question.option_a,
                "B": question.option_b,
                "C": question.option_c,
                "D": question.option_d,
            },
            "correct_option": question.correct_option,
            "explanation": question.explanation,
            "media_url": question.media_url,
            "kip_weight": question.kip_weight,
            "created_by": question.created_by,
            "created_by_name": creator_lookup.get(question.created_by).full_name
            if creator_lookup.get(question.created_by)
            else None,
            "created_by_role": creator_lookup.get(question.created_by).role
            if creator_lookup.get(question.created_by)
            else None,
            "created_at": question.created_at,
            "updated_at": question.updated_at,
            "is_selected_for_assessment": question.id
            in set((category_lookup.get(question.category_id).selected_question_ids or []))
            if category_lookup.get(question.category_id)
            else False,
        }
        for question in questions
    ]


def _serialize_mcq_question_snapshot(question: MCQQuestion) -> dict:
    return {
        "id": question.id,
        "question_text": question.question_text,
        "options": {
            "A": question.option_a,
            "B": question.option_b,
            "C": question.option_c,
            "D": question.option_d,
        },
        "correct_option": question.correct_option,
        "explanation": question.explanation,
        "media_url": question.media_url,
        "kip_weight": question.kip_weight,
    }


def _build_mcq_question_snapshot(questions: List[MCQQuestion]) -> List[dict]:
    return [_serialize_mcq_question_snapshot(question) for question in questions]


def _resolve_mcq_assessment_snapshot(
    db: Session,
    assessment: MCQAssessment,
) -> List[dict]:
    if isinstance(assessment.question_snapshot, list) and assessment.question_snapshot:
        return [row for row in assessment.question_snapshot if isinstance(row, dict)]

    ordered_question_ids = [question_id for question_id in dict.fromkeys(assessment.question_ids or []) if question_id]
    if not ordered_question_ids:
        return []

    question_lookup = {
        question.id: question
        for question in (
            db.query(MCQQuestion)
            .filter(MCQQuestion.id.in_(ordered_question_ids))
            .all()
        )
    }
    ordered_questions = [
        question_lookup[question_id]
        for question_id in ordered_question_ids
        if question_id in question_lookup
    ]
    return _build_mcq_question_snapshot(ordered_questions)


def _serialize_mcq_assignment_rows(
    db: Session,
    *,
    assessments: List[MCQAssessment],
) -> List[dict]:
    if not assessments:
        return []

    assessment_ids = [assessment.id for assessment in assessments]
    category_ids = list({assessment.category_id for assessment in assessments if assessment.category_id})
    batch_ids = list({assessment.assigned_batch_id for assessment in assessments if assessment.assigned_batch_id})
    assigned_user_ids = list(
        {assessment.assigned_user_id for assessment in assessments if assessment.assigned_user_id}
    )
    assigned_by_ids = list({assessment.assigned_by for assessment in assessments if assessment.assigned_by})

    categories = (
        db.query(MCQCategory)
        .filter(MCQCategory.id.in_(category_ids))
        .all()
        if category_ids
        else []
    )
    category_lookup = {category.id: category for category in categories}

    batches = db.query(Batch).filter(Batch.id.in_(batch_ids)).all() if batch_ids else []
    batch_lookup = {batch.id: batch for batch in batches}

    users = (
        db.query(User)
        .filter(User.id.in_(list({*assigned_user_ids, *assigned_by_ids})))
        .all()
        if assigned_user_ids or assigned_by_ids
        else []
    )
    user_lookup = {user.id: user for user in users}

    question_rows = (
        db.query(MCQQuestion.id, MCQQuestion.category_id)
        .filter(MCQQuestion.is_active == True, MCQQuestion.category_id.in_(category_ids))
        .all()
        if category_ids
        else []
    )
    active_question_lookup: dict[str, set[str]] = {}
    for question_id, category_id in question_rows:
        active_question_lookup.setdefault(category_id, set()).add(question_id)

    submission_rows = (
        db.query(MCQSubmission)
        .filter(MCQSubmission.assessment_id.in_(assessment_ids))
        .all()
    )
    submissions_by_assessment: dict[str, dict[str, MCQSubmission]] = {}
    for submission in submission_rows:
        submissions_by_assessment.setdefault(submission.assessment_id, {})[
            submission.trainee_id
        ] = submission

    certificate_rows = (
        db.query(CertificateRecord)
        .filter(
            CertificateRecord.source_type == "mcq_assessment",
            CertificateRecord.source_id.in_(assessment_ids),
        )
        .all()
    )
    certificates_by_assessment: dict[str, dict[str, CertificateRecord]] = {}
    for certificate in certificate_rows:
        certificates_by_assessment.setdefault(certificate.source_id, {})[
            certificate.trainee_id
        ] = certificate

    serialized_assessments: List[dict] = []
    for assessment in assessments:
        category = category_lookup.get(assessment.category_id)
        batch = batch_lookup.get(assessment.assigned_batch_id) if assessment.assigned_batch_id else None
        assigned_user = user_lookup.get(assessment.assigned_user_id) if assessment.assigned_user_id else None
        assigned_by = user_lookup.get(assessment.assigned_by) if assessment.assigned_by else None
        selected_category_question_ids = [
            question_id
            for question_id in dict.fromkeys((category.selected_question_ids or []) if category else [])
            if question_id in active_question_lookup.get(assessment.category_id, set())
        ]

        if batch:
            target_trainees = sorted(
                [
                    trainee
                    for trainee in batch.users
                    if trainee.role == UserRole.TRAINEE and trainee.is_active
                ],
                key=lambda trainee: (trainee.full_name.lower(), trainee.email.lower()),
            )
        elif assigned_user:
            target_trainees = [assigned_user]
        else:
            target_trainees = []

        assessment_submissions = submissions_by_assessment.get(assessment.id, {})
        assessment_certificates = certificates_by_assessment.get(assessment.id, {})
        assessment_snapshot = _resolve_mcq_assessment_snapshot(db, assessment)
        snapshot_question_ids = [
            str(row.get("id"))
            for row in assessment_snapshot
            if isinstance(row, dict) and row.get("id")
        ]

        trainee_rows = []
        completed_trainees = 0
        passed_trainees = 0
        for trainee in target_trainees:
            submission = assessment_submissions.get(trainee.id)
            certificate = assessment_certificates.get(trainee.id)
            target_batch = batch
            if not target_batch and trainee.batches:
                target_batch = next(
                    (
                        existing_batch
                        for existing_batch in trainee.batches
                        if existing_batch.id == assessment.assigned_batch_id
                    ),
                    trainee.batches[0],
                )

            if submission:
                completed_trainees += 1
                if submission.is_passed:
                    passed_trainees += 1

            trainee_rows.append(
                {
                    "id": trainee.id,
                    "full_name": trainee.full_name,
                    "email": trainee.email,
                    "batch_id": target_batch.id if target_batch else None,
                    "batch_name": target_batch.name if target_batch else None,
                    "status": "completed" if submission else "pending",
                    "score_percentage": submission.score_percentage if submission else None,
                    "is_passed": submission.is_passed if submission else None,
                    "attempt_count": int(submission.attempt_count or 0) if submission else 0,
                    "submitted_at": submission.submitted_at if submission else None,
                    "certificate_id": certificate.id if certificate else None,
                    "certificate_no": certificate.certificate_no if certificate else None,
                }
            )

        total_trainees = len(target_trainees)
        question_ids = snapshot_question_ids or [question_id for question_id in dict.fromkeys(assessment.question_ids or []) if question_id]
        active_category_question_ids = active_question_lookup.get(assessment.category_id, set())
        active_question_count = len(question_ids)

        serialized_assessments.append(
            {
                "id": assessment.id,
                "title": assessment.title,
                "description": assessment.description,
                "category_id": assessment.category_id,
                "category_name": category.name if category else None,
                "category_description": category.description if category else None,
                "passing_threshold": (
                    _effective_mcq_passing_threshold(category.passing_threshold)
                    if category
                    else MCQ_MIN_PASSING_THRESHOLD
                ),
                "time_limit_minutes": assessment.time_limit_minutes or 30,
                "assigned_batch_id": assessment.assigned_batch_id,
                "assigned_batch_name": batch.name if batch else None,
                "assigned_user_id": assessment.assigned_user_id,
                "assigned_user_name": assigned_user.full_name if assigned_user else None,
                "assigned_by": assessment.assigned_by,
                "assigned_by_name": assigned_by.full_name if assigned_by else None,
                "assigned_by_role": assigned_by.role.value if assigned_by else None,
                "question_ids": question_ids,
                "category_question_count": len(selected_category_question_ids),
                "question_bank_count": len(active_category_question_ids),
                "question_count": active_question_count,
                "total_trainees": total_trainees,
                "completed_trainees": completed_trainees,
                "pending_trainees": max(total_trainees - completed_trainees, 0),
                "passed_trainees": passed_trainees,
                "certificate_count": len(assessment_certificates),
                "completion_rate": round((completed_trainees / total_trainees) * 100, 2)
                if total_trainees
                else 0.0,
                "is_complete": total_trainees > 0 and completed_trainees == total_trainees,
                "due_date": assessment.due_date,
                "created_at": assessment.created_at,
                "updated_at": assessment.updated_at,
                "trainees": trainee_rows,
            }
        )

    serialized_assessments.sort(
        key=lambda item: (
            item["due_date"] is None,
            item["due_date"] or item["created_at"],
            item["title"].lower(),
        )
    )
    return serialized_assessments


def _ensure_settings(db: Session) -> CertificationSettings:
    return ensure_certification_settings(db)


def _generate_coaching_id(db: Session) -> str:
    return generate_coaching_id(db)


def _get_mcq_assessment_target_trainee_ids(
    db: Session,
    assessment: MCQAssessment,
) -> set[str]:
    trainee_ids: set[str] = set()
    if assessment.assigned_user_id:
        trainee_ids.add(assessment.assigned_user_id)

    if assessment.assigned_batch_id:
        batch = db.query(Batch).filter(Batch.id == assessment.assigned_batch_id).first()
        if batch:
            trainee_ids.update(
                user.id
                for user in batch.users
                if user.role == UserRole.TRAINEE and getattr(user, "is_active", True)
            )

    return trainee_ids


def _practice_session_has_active_trainer_source(
    session: Optional[PracticeSession],
) -> bool:
    if not session:
        return False

    scenario = getattr(session, "scenario", None)
    return bool(scenario and getattr(scenario, "is_published", False))


def _sim_session_has_active_trainer_source(
    db: Session,
    session: Optional[SimSession],
) -> bool:
    if not session:
        return False

    scenario = getattr(session, "scenario", None)
    if not scenario:
        scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
    if not scenario or not bool(getattr(scenario, "is_published", False)):
        return False

    active_assignment = (
        db.query(CallSimulationAssignment.id)
        .filter(
            CallSimulationAssignment.trainee_id == session.trainee_id,
            CallSimulationAssignment.scenario_id == session.scenario_id,
            CallSimulationAssignment.is_active == True,
        )
        .first()
    )
    return bool(active_assignment)


def _resolve_coaching_log_source(
    db: Session,
    *,
    payload: "CoachingLogPayload",
    trainee_id: str,
) -> tuple[Optional[PracticeSession], Optional[SimSession], str]:
    if payload.practice_session_id and payload.sim_session_id:
        raise HTTPException(
            status_code=400,
            detail="Provide either a practice session or a Call Simulation session, not both.",
        )

    if payload.practice_session_id:
        practice_session = (
            db.query(PracticeSession)
            .filter(PracticeSession.id == payload.practice_session_id)
            .first()
        )
        if not practice_session:
            raise HTTPException(status_code=404, detail="Practice session not found")
        if practice_session.user_id != trainee_id:
            raise HTTPException(
                status_code=400,
                detail="Practice session does not belong to the selected trainee",
            )
        return practice_session, None, "practice_session"

    if payload.sim_session_id:
        sim_session = (
            db.query(SimSession)
            .filter(SimSession.id == payload.sim_session_id)
            .first()
        )
        if not sim_session:
            raise HTTPException(status_code=404, detail="Call Simulation session not found")
        if sim_session.trainee_id != trainee_id:
            raise HTTPException(
                status_code=400,
                detail="Call Simulation session does not belong to the selected trainee",
            )
        return None, sim_session, "sim_floor_session"

    return None, None, "general"


def _purge_orphaned_coaching_logs(
    db: Session,
    *,
    trainee_ids: Optional[list[str]] = None,
) -> int:
    query = db.query(CoachingLog)
    if trainee_ids:
        query = query.filter(CoachingLog.trainee_id.in_(trainee_ids))

    logs = query.all()
    practice_ids = {log.practice_session_id for log in logs if log.practice_session_id}
    sim_session_ids = {log.sim_session_id for log in logs if log.sim_session_id}
    practice_lookup = {
        session.id: session
        for session in (
            db.query(PracticeSession)
            .filter(PracticeSession.id.in_(list(practice_ids or ["__none__"])))
            .all()
        )
    }
    sim_session_lookup = {
        session.id: session
        for session in (
            db.query(SimSession)
            .filter(SimSession.id.in_(list(sim_session_ids or ["__none__"])))
            .all()
        )
    }

    deleted_count = 0
    for log in logs:
        if log.practice_session_id and not _practice_session_has_active_trainer_source(
            practice_lookup.get(log.practice_session_id)
        ):
            db.delete(log)
            deleted_count += 1
            continue
        if log.sim_session_id and not _sim_session_has_active_trainer_source(
            db,
            sim_session_lookup.get(log.sim_session_id),
        ):
            db.delete(log)
            deleted_count += 1
            continue
        if (
            log.status == "draft"
            and normalize_competency_status(log.competency_status) == "pending"
            and not (log.strengths or "").strip()
            and not (log.opportunities or "").strip()
            and not (log.action_plan or "").strip()
            and not (log.trainer_remarks or "").strip()
            and not (log.batch_name or "").strip()
            and not (log.lob or "").strip()
            and not int(log.coaching_minutes or 0)
            and not log.target_date
        ):
            db.delete(log)
            deleted_count += 1

    if deleted_count:
        db.commit()

    return deleted_count


def _get_trainer_scope(
    db: Session,
    *,
    current_user: User,
) -> dict[str, Any]:
    if current_user.role != UserRole.TRAINER:
        return {
            "batches": [],
            "batch_lookup": {},
            "trainee_ids": set(),
            "trainee_batch": {},
        }

    batches = (
        db.query(Batch)
        .filter(Batch.created_by == current_user.id, Batch.is_active == True)
        .order_by(Batch.wave_number.is_(None), Batch.wave_number.asc(), Batch.name.asc())
        .all()
    )
    batch_lookup = {batch.id: batch for batch in batches}
    trainee_ids = set()
    trainee_batch: dict[str, Batch] = {}

    for batch in batches:
        for user in batch.users:
            if user.role != UserRole.TRAINEE or not user.is_active:
                continue
            trainee_ids.add(user.id)
            trainee_batch.setdefault(user.id, batch)

    return {
        "batches": batches,
        "batch_lookup": batch_lookup,
        "trainee_ids": trainee_ids,
        "trainee_batch": trainee_batch,
    }


def _find_preferred_wave_one_batch(batches: List[Batch]) -> Optional[Batch]:
    normalized_batches = [batch for batch in batches if batch.is_active]
    for batch in normalized_batches:
        batch_name = (batch.name or "").strip().lower()
        if batch.wave_number == 1 and ("batch 1" in batch_name or "wave 1" in batch_name):
            return batch
    for batch in normalized_batches:
        if batch.wave_number == 1:
            return batch
    for batch in normalized_batches:
        batch_name = (batch.name or "").strip().lower()
        if "batch 1" in batch_name or "wave 1" in batch_name:
            return batch
    return normalized_batches[0] if normalized_batches else None


def _ensure_trainer_can_access_trainee(
    db: Session,
    *,
    current_user: User,
    trainee_id: str,
) -> Optional[Batch]:
    if current_user.role != UserRole.TRAINER:
        return None

    scope = _get_trainer_scope(db, current_user=current_user)
    batch = scope["trainee_batch"].get(trainee_id)
    if not batch:
        raise HTTPException(
            status_code=403,
            detail="This trainee is not assigned to one of your batches.",
        )
    return batch


def _ensure_mcq_assessment_access(
    db: Session,
    *,
    assessment: MCQAssessment,
    current_user: User,
) -> None:
    if current_user.role == UserRole.ADMIN:
        return

    if current_user.role == UserRole.TRAINEE:
        batch_ids = {
            batch.id for batch in current_user.batches if getattr(batch, "is_active", True)
        }
        if assessment.assigned_user_id == current_user.id:
            return
        if assessment.assigned_batch_id and assessment.assigned_batch_id in batch_ids:
            return
        raise HTTPException(
            status_code=403,
            detail="This assessment is not assigned to your trainee account.",
        )

    if current_user.role == UserRole.TRAINER:
        scope = _get_trainer_scope(db, current_user=current_user)
        trainer_batch_ids = set(scope["batch_lookup"].keys())
        trainer_trainee_ids = set(scope["trainee_ids"])
        if assessment.assigned_user_id and assessment.assigned_user_id in trainer_trainee_ids:
            return
        if assessment.assigned_batch_id and assessment.assigned_batch_id in trainer_batch_ids:
            return
        raise HTTPException(
            status_code=403,
            detail="This assessment is not assigned to one of your trainees or batches.",
        )

    raise HTTPException(status_code=403, detail="Insufficient permissions")


def _serialize_certificate_settings(settings: CertificationSettings) -> dict:
    return {
        "institution_name": settings.institution_name,
        "address": settings.address,
        "contact_number": settings.contact_number,
        "contact_email": settings.contact_email,
        "logo_url": settings.logo_url,
        "dry_seal_url": settings.dry_seal_url,
        "manager_signature_url": settings.manager_signature_url,
        "registrar_name": settings.registrar_name,
        "signatory_title": settings.signatory_title,
        "certificate_prefix": settings.certificate_prefix,
        "certificate_title": settings.certificate_title,
        "certificate_subtitle": settings.certificate_subtitle,
        "certificate_intro": settings.certificate_intro,
        "certificate_outro": settings.certificate_outro,
        "certificate_footer": settings.certificate_footer,
        "asr_passing_threshold": settings.asr_passing_threshold,
        "mcq_passing_threshold": _effective_mcq_passing_threshold(settings.mcq_passing_threshold),
        "unit_of_competency": settings.unit_of_competency,
    }


def _serialize_certificate_record(
    cert: CertificateRecord,
    *,
    trainee: Optional[User],
    issuer: Optional[User],
    settings: CertificationSettings,
) -> dict:
    snapshot = build_template_snapshot(settings)
    if isinstance(cert.template_snapshot, dict):
        snapshot.update(cert.template_snapshot)
    verification_path = f"/api/certification/verify/{cert.qr_token}"

    return {
        "id": cert.id,
        "certificate_no": cert.certificate_no,
        "issued_at": cert.issued_at,
        "achievement_title": cert.unit_of_competency,
        "achievement_type": cert.achievement_type or "completion",
        "source_type": cert.source_type,
        "source_id": cert.source_id,
        "score": cert.kip_score,
        "trainee_name": trainee.full_name if trainee else None,
        "issuer_name": issuer.full_name if issuer else None,
        "pdf_url": f"/api/certification/certificate/{cert.id}/pdf",
        "verification_url": verification_path,
        "qr_token": cert.qr_token,
        "settings": snapshot,
    }


def _sync_certificates_for_assessment_targets(
    db: Session,
    assessments: List[MCQAssessment],
) -> None:
    trainee_ids: set[str] = set()
    for assessment in assessments:
        trainee_ids.update(_get_mcq_assessment_target_trainee_ids(db, assessment))

    for trainee_id in sorted(trainee_ids):
        sync_trainee_completion_certificates(db, trainee_id)


# ------------------------- MCQ Category and Question Bank -------------------------


class MCQCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    difficulty: str = "basic"
    lob: Optional[str] = None
    passing_threshold: Optional[float] = None
    is_global: bool = False


class MCQCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[str] = None
    lob: Optional[str] = None
    passing_threshold: Optional[float] = None
    is_global: Optional[bool] = None


class MCQQuestionCreate(BaseModel):
    category_id: str
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str
    explanation: Optional[str] = None
    media_url: Optional[str] = None
    kip_weight: float = 1.0


class MCQQuestionUpdate(BaseModel):
    category_id: Optional[str] = None
    question_text: Optional[str] = None
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    correct_option: Optional[str] = None
    explanation: Optional[str] = None
    media_url: Optional[str] = None
    kip_weight: Optional[float] = None


class MCQCategorySelectionPayload(BaseModel):
    question_ids: List[str] = []


@router.post("/mcq/categories")
async def create_mcq_category(
    payload: MCQCategoryCreate,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    normalized_name = payload.name.strip()
    existing = (
        db.query(MCQCategory)
        .filter(
            func.lower(MCQCategory.name) == normalized_name.lower(),
            MCQCategory.created_by == current_user.id,
            MCQCategory.is_active == True,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="MCQ category already exists")
    category = MCQCategory(
        name=normalized_name,
        description=(payload.description or "").strip() or None,
        difficulty=payload.difficulty,
        lob=payload.lob,
        passing_threshold=_effective_mcq_passing_threshold(payload.passing_threshold),
        is_global=False,
        created_by=current_user.id,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return {
        "status": "created",
        "category_id": category.id,
        "name": category.name,
        "category": _serialize_mcq_categories(db, [category])[0],
    }


@router.get("/mcq/categories")
async def list_mcq_categories(
    scope: str = Query("owned"),
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN])
    query = db.query(MCQCategory).filter(MCQCategory.is_active == True)
    if current_user.role == UserRole.TRAINER and scope != "all":
        query = query.filter(MCQCategory.created_by == current_user.id)

    categories = query.order_by(MCQCategory.created_at.desc(), MCQCategory.name.asc()).all()
    return {
        "count": len(categories),
        "categories": _serialize_mcq_categories(db, categories),
    }


@router.put("/mcq/categories/{category_id}")
async def update_mcq_category(
    category_id: str,
    payload: MCQCategoryUpdate,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    category = (
        db.query(MCQCategory)
        .filter(MCQCategory.id == category_id, MCQCategory.is_active == True)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="MCQ category not found")
    if not _can_manage_mcq_resource(current_user, category.created_by):
        raise HTTPException(status_code=403, detail="Not allowed to edit this category")

    update_data = payload.model_dump(exclude_unset=True)
    if "name" in update_data:
        normalized_name = (payload.name or "").strip()
        if not normalized_name:
            raise HTTPException(status_code=400, detail="Category name is required")
        duplicate = (
            db.query(MCQCategory)
            .filter(
                MCQCategory.id != category_id,
                func.lower(MCQCategory.name) == normalized_name.lower(),
                MCQCategory.created_by == current_user.id,
                MCQCategory.is_active == True,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=400, detail="MCQ category already exists")
        category.name = normalized_name
    if "description" in update_data:
        category.description = (payload.description or "").strip() or None
    if "difficulty" in update_data:
        category.difficulty = payload.difficulty
    if "lob" in update_data:
        category.lob = (payload.lob or "").strip() or None
    if "passing_threshold" in update_data and payload.passing_threshold is not None:
        category.passing_threshold = _effective_mcq_passing_threshold(payload.passing_threshold)
    if "is_global" in update_data:
        category.is_global = False

    category.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(category)
    return {"status": "updated", "category": _serialize_mcq_categories(db, [category])[0]}


@router.delete("/mcq/categories/{category_id}")
async def delete_mcq_category(
    category_id: str,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    category = (
        db.query(MCQCategory)
        .filter(MCQCategory.id == category_id, MCQCategory.is_active == True)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="MCQ category not found")
    if not _can_manage_mcq_resource(current_user, category.created_by):
        raise HTTPException(status_code=403, detail="Not allowed to delete this category")

    category.is_active = False
    category.updated_at = datetime.utcnow()
    (
        db.query(MCQQuestion)
        .filter(MCQQuestion.category_id == category_id, MCQQuestion.is_active == True)
        .update(
            {
                MCQQuestion.is_active: False,
                MCQQuestion.updated_at: datetime.utcnow(),
            },
            synchronize_session=False,
        )
    )
    (
        db.query(MCQAssessment)
        .filter(MCQAssessment.category_id == category_id, MCQAssessment.is_active == True)
        .update(
            {
                MCQAssessment.is_active: False,
                MCQAssessment.updated_at: datetime.utcnow(),
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return {"status": "deleted", "category_id": category_id}


@router.post("/mcq/questions")
async def create_mcq_question(
    payload: MCQQuestionCreate,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    if payload.correct_option.upper() not in {"A", "B", "C", "D"}:
        raise HTTPException(status_code=400, detail="correct_option must be A/B/C/D")
    category = (
        db.query(MCQCategory)
        .filter(MCQCategory.id == payload.category_id, MCQCategory.is_active == True)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="MCQ category not found")
    if not _can_manage_mcq_resource(current_user, category.created_by):
        raise HTTPException(status_code=403, detail="Not allowed to use this category")
    question = MCQQuestion(
        category_id=payload.category_id,
        question_text=payload.question_text.strip(),
        option_a=payload.option_a.strip(),
        option_b=payload.option_b.strip(),
        option_c=payload.option_c.strip(),
        option_d=payload.option_d.strip(),
        correct_option=payload.correct_option.upper(),
        explanation=(payload.explanation or "").strip() or None,
        media_url=payload.media_url,
        kip_weight=payload.kip_weight,
        created_by=current_user.id,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return {
        "status": "created",
        "question_id": question.id,
        "question": _serialize_mcq_questions(db, [question])[0],
    }


@router.get("/mcq/questions")
async def list_all_mcq_questions(
    scope: str = Query("owned"),
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN])
    query = db.query(MCQQuestion).filter(MCQQuestion.is_active == True)
    if current_user.role == UserRole.TRAINER and scope != "all":
        query = query.filter(MCQQuestion.created_by == current_user.id)

    questions = query.order_by(MCQQuestion.created_at.desc()).all()
    return {
        "count": len(questions),
        "questions": _serialize_mcq_questions(db, questions),
    }


@router.get("/mcq/questions/{category_id}")
async def list_mcq_questions(
    category_id: str,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN])
    category = (
        db.query(MCQCategory)
        .filter(MCQCategory.id == category_id, MCQCategory.is_active == True)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="MCQ category not found")
    questions = (
        db.query(MCQQuestion)
        .filter(MCQQuestion.category_id == category_id, MCQQuestion.is_active == True)
        .order_by(MCQQuestion.created_at.desc())
        .all()
    )
    return {
        "count": len(questions),
        "questions": _serialize_mcq_questions(db, questions),
    }


@router.put("/mcq/categories/{category_id}/selected-questions")
async def save_selected_category_questions(
    category_id: str,
    payload: MCQCategorySelectionPayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    category = (
        db.query(MCQCategory)
        .filter(MCQCategory.id == category_id, MCQCategory.is_active == True)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="MCQ category not found")
    if not _can_manage_mcq_resource(current_user, category.created_by):
        raise HTTPException(status_code=403, detail="Not allowed to manage this category")

    requested_question_ids = [question_id for question_id in dict.fromkeys(payload.question_ids or []) if question_id]
    active_questions = (
        db.query(MCQQuestion.id)
        .filter(
            MCQQuestion.category_id == category_id,
            MCQQuestion.is_active == True,
        )
        .all()
    )
    active_question_ids = {question_id for question_id, in active_questions}
    invalid_question_ids = [question_id for question_id in requested_question_ids if question_id not in active_question_ids]
    if invalid_question_ids:
        raise HTTPException(
            status_code=400,
            detail="All selected question IDs must belong to the chosen category question bank.",
        )

    category.selected_question_ids = requested_question_ids
    category.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(category)

    return {
        "status": "saved",
        "category": _serialize_mcq_categories(db, [category])[0],
    }


@router.put("/mcq/questions/{question_id}")
async def update_mcq_question(
    question_id: str,
    payload: MCQQuestionUpdate,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    question = (
        db.query(MCQQuestion)
        .filter(MCQQuestion.id == question_id, MCQQuestion.is_active == True)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="MCQ question not found")
    if not _can_manage_mcq_resource(current_user, question.created_by):
        raise HTTPException(status_code=403, detail="Not allowed to edit this question")

    update_data = payload.model_dump(exclude_unset=True)
    previous_category_id = question.category_id
    if "category_id" in update_data and payload.category_id:
        category = (
            db.query(MCQCategory)
            .filter(MCQCategory.id == payload.category_id, MCQCategory.is_active == True)
            .first()
        )
        if not category:
            raise HTTPException(status_code=404, detail="Target MCQ category not found")
        if not _can_manage_mcq_resource(current_user, category.created_by):
            raise HTTPException(status_code=403, detail="Not allowed to use this category")
        question.category_id = payload.category_id
    if "question_text" in update_data and payload.question_text is not None:
        normalized_text = payload.question_text.strip()
        if not normalized_text:
            raise HTTPException(status_code=400, detail="Question text is required")
        question.question_text = normalized_text
    if "option_a" in update_data and payload.option_a is not None:
        question.option_a = payload.option_a.strip()
    if "option_b" in update_data and payload.option_b is not None:
        question.option_b = payload.option_b.strip()
    if "option_c" in update_data and payload.option_c is not None:
        question.option_c = payload.option_c.strip()
    if "option_d" in update_data and payload.option_d is not None:
        question.option_d = payload.option_d.strip()
    if "correct_option" in update_data and payload.correct_option is not None:
        correct_option = payload.correct_option.upper()
        if correct_option not in {"A", "B", "C", "D"}:
            raise HTTPException(status_code=400, detail="correct_option must be A/B/C/D")
        question.correct_option = correct_option
    if "explanation" in update_data:
        question.explanation = (payload.explanation or "").strip() or None
    if "media_url" in update_data:
        question.media_url = (payload.media_url or "").strip() or None
    if "kip_weight" in update_data and payload.kip_weight is not None:
        question.kip_weight = payload.kip_weight

    if previous_category_id != question.category_id:
        previous_category = (
            db.query(MCQCategory)
            .filter(MCQCategory.id == previous_category_id)
            .first()
        )
        if previous_category:
            previous_category.selected_question_ids = [
                existing_question_id
                for existing_question_id in dict.fromkeys(previous_category.selected_question_ids or [])
                if existing_question_id != question.id
            ]
            previous_category.updated_at = datetime.utcnow()

    question.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(question)
    return {"status": "updated", "question": _serialize_mcq_questions(db, [question])[0]}


@router.delete("/mcq/questions/{question_id}")
async def delete_mcq_question(
    question_id: str,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    question = (
        db.query(MCQQuestion)
        .filter(MCQQuestion.id == question_id, MCQQuestion.is_active == True)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="MCQ question not found")
    if not _can_manage_mcq_resource(current_user, question.created_by):
        raise HTTPException(status_code=403, detail="Not allowed to delete this question")

    category = (
        db.query(MCQCategory)
        .filter(MCQCategory.id == question.category_id)
        .first()
    )
    if category:
        category.selected_question_ids = [
            existing_question_id
            for existing_question_id in dict.fromkeys(category.selected_question_ids or [])
            if existing_question_id != question.id
        ]
        category.updated_at = datetime.utcnow()

    question.is_active = False
    question.updated_at = datetime.utcnow()

    db.commit()
    return {"status": "deleted", "question_id": question_id}


# ------------------------- Assessment Assignment and Submission -------------------------


def _load_assignment_question_set(
    db: Session,
    *,
    category: MCQCategory,
    requested_question_ids: Optional[List[str]] = None,
) -> tuple[List[str], List[MCQQuestion]]:
    active_questions = (
        db.query(MCQQuestion)
        .filter(
            MCQQuestion.category_id == category.id,
            MCQQuestion.is_active == True,
        )
        .order_by(MCQQuestion.created_at.asc())
        .all()
    )
    question_lookup = {question.id: question for question in active_questions}

    if requested_question_ids:
        ordered_question_ids = [question_id for question_id in dict.fromkeys(requested_question_ids) if question_id]
    else:
        ordered_question_ids = [
            question_id
            for question_id in dict.fromkeys(category.selected_question_ids or [])
            if question_id
        ]

    if ordered_question_ids:
        invalid_question_ids = [
            question_id for question_id in ordered_question_ids if question_id not in question_lookup
        ]
        if invalid_question_ids:
            raise HTTPException(
                status_code=400,
                detail="All selected question IDs must belong to the active question bank of this category.",
            )
        ordered_questions = [question_lookup[question_id] for question_id in ordered_question_ids]
        return ordered_question_ids, ordered_questions

    return [], []


class MCQAssignPayload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: str
    question_ids: List[str] = []
    assigned_user_id: Optional[str] = None
    assigned_batch_id: Optional[str] = None
    assigned_batch_ids: List[str] = []
    due_date: Optional[datetime] = None
    time_limit_minutes: int = 30


class MCQAssignmentUpdatePayload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    question_ids: Optional[List[str]] = None
    assigned_user_id: Optional[str] = None
    assigned_batch_id: Optional[str] = None
    due_date: Optional[datetime] = None
    time_limit_minutes: Optional[int] = None


@router.post("/mcq/assign")
async def assign_mcq_assessment(
    payload: MCQAssignPayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    selected_batch_ids = [
        batch_id
        for batch_id in dict.fromkeys(
            ([payload.assigned_batch_id] if payload.assigned_batch_id else [])
            + list(payload.assigned_batch_ids or [])
        )
        if batch_id
    ]
    if not payload.assigned_user_id and not selected_batch_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide assigned_user_id or at least one assigned_batch_id.",
        )
    if payload.assigned_user_id and selected_batch_ids:
        raise HTTPException(
            status_code=400,
            detail="Assign the assessment either to one trainee or to one or more batches.",
        )
    category = (
        db.query(MCQCategory)
        .filter(MCQCategory.id == payload.category_id, MCQCategory.is_active == True)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="MCQ category not found")
    if not _can_manage_mcq_resource(current_user, category.created_by):
        raise HTTPException(status_code=403, detail="Not allowed to use this category")

    ordered_question_ids, ordered_questions = _load_assignment_question_set(
        db,
        category=category,
        requested_question_ids=payload.question_ids,
    )
    if not ordered_questions:
        raise HTTPException(
            status_code=400,
            detail="Save at least one question to this assessment category before assigning it.",
        )
    trainer_scope = _get_trainer_scope(db, current_user=current_user)
    target_batches: List[Batch] = []
    for batch_id in selected_batch_ids:
        batch = trainer_scope["batch_lookup"].get(batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        if not any(user.role == UserRole.TRAINEE and user.is_active for user in batch.users):
            raise HTTPException(
                status_code=400,
                detail=f'The selected batch "{batch.name}" has no active trainees yet.',
            )
        target_batches.append(batch)
    if payload.assigned_user_id and payload.assigned_user_id not in set(trainer_scope["trainee_ids"]):
        raise HTTPException(status_code=404, detail="Trainee not found")

    if payload.assigned_user_id:
        trainee = db.query(User).filter(User.id == payload.assigned_user_id).first()
        if not trainee or trainee.role != UserRole.TRAINEE:
            raise HTTPException(status_code=404, detail="Trainee not found")
    else:
        trainee = None

    normalized_title = (payload.title or "").strip()
    base_description = (payload.description or "").strip() or category.description
    time_limit_minutes = max(int(payload.time_limit_minutes or 0), 1)
    created_assessments: List[MCQAssessment] = []
    question_snapshot = _build_mcq_question_snapshot(ordered_questions)

    if trainee:
        if not normalized_title:
            normalized_title = f"{category.name} - {trainee.full_name}"
        assessment = (
            db.query(MCQAssessment)
            .filter(
                MCQAssessment.category_id == payload.category_id,
                MCQAssessment.assigned_user_id == payload.assigned_user_id,
                MCQAssessment.is_active == True,
                MCQAssessment.assigned_by == current_user.id,
            )
            .order_by(MCQAssessment.updated_at.desc(), MCQAssessment.created_at.desc())
            .first()
        )
        if assessment:
            assessment.title = normalized_title
            assessment.description = base_description
            assessment.question_ids = ordered_question_ids
            assessment.question_snapshot = question_snapshot
            assessment.due_date = payload.due_date
            assessment.time_limit_minutes = time_limit_minutes
            assessment.updated_at = datetime.utcnow()
        else:
            assessment = MCQAssessment(
                title=normalized_title,
                description=base_description,
                category_id=payload.category_id,
                question_ids=ordered_question_ids,
                question_snapshot=question_snapshot,
                assigned_by=current_user.id,
                assigned_user_id=payload.assigned_user_id,
                due_date=payload.due_date,
                time_limit_minutes=time_limit_minutes,
            )
            db.add(assessment)
        created_assessments.append(assessment)
    else:
        for batch in target_batches:
            assessment_title = normalized_title or f"{category.name} - {batch.name}"
            assessment = (
                db.query(MCQAssessment)
                .filter(
                    MCQAssessment.category_id == payload.category_id,
                    MCQAssessment.assigned_batch_id == batch.id,
                    MCQAssessment.is_active == True,
                    MCQAssessment.assigned_by == current_user.id,
                )
                .order_by(MCQAssessment.updated_at.desc(), MCQAssessment.created_at.desc())
                .first()
            )
            if assessment:
                assessment.title = assessment_title
                assessment.description = base_description
                assessment.question_ids = ordered_question_ids
                assessment.question_snapshot = question_snapshot
                assessment.due_date = payload.due_date
                assessment.time_limit_minutes = time_limit_minutes
                assessment.updated_at = datetime.utcnow()
            else:
                assessment = MCQAssessment(
                    title=assessment_title,
                    description=base_description,
                    category_id=payload.category_id,
                    question_ids=ordered_question_ids,
                    question_snapshot=question_snapshot,
                    assigned_by=current_user.id,
                    assigned_batch_id=batch.id,
                    due_date=payload.due_date,
                    time_limit_minutes=time_limit_minutes,
                )
                db.add(assessment)
            created_assessments.append(assessment)

    db.commit()
    for assessment in created_assessments:
        db.refresh(assessment)
    serialized_assessments = _serialize_mcq_assignment_rows(db, assessments=created_assessments)
    return {
        "status": "assigned",
        "assessment_id": serialized_assessments[0]["id"] if serialized_assessments else None,
        "assessment": serialized_assessments[0] if serialized_assessments else None,
        "count": len(serialized_assessments),
        "assessments": serialized_assessments,
    }


@router.put("/mcq/assignments/{assessment_id}")
async def update_mcq_assignment(
    assessment_id: str,
    payload: MCQAssignmentUpdatePayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    fields_set = set(payload.model_fields_set)
    assessment = (
        db.query(MCQAssessment)
        .filter(MCQAssessment.id == assessment_id, MCQAssessment.is_active == True)
        .first()
    )
    if not assessment:
        raise HTTPException(status_code=404, detail="Assigned assessment not found")
    if assessment.assigned_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to edit this assigned assessment")

    next_category = (
        db.query(MCQCategory)
        .filter(
            MCQCategory.id == (payload.category_id if "category_id" in fields_set and payload.category_id else assessment.category_id),
            MCQCategory.is_active == True,
        )
        .first()
    )
    if not next_category:
        raise HTTPException(status_code=404, detail="MCQ category not found")
    if not _can_manage_mcq_resource(current_user, next_category.created_by):
        raise HTTPException(status_code=403, detail="Not allowed to use this category")

    trainer_scope = _get_trainer_scope(db, current_user=current_user)
    next_batch_id = assessment.assigned_batch_id
    next_user_id = assessment.assigned_user_id
    if "assigned_batch_id" in fields_set:
        if payload.assigned_batch_id and payload.assigned_batch_id not in trainer_scope["batch_lookup"]:
            raise HTTPException(status_code=404, detail="Batch not found")
        next_batch_id = payload.assigned_batch_id or None
        next_user_id = None
    if "assigned_user_id" in fields_set:
        if payload.assigned_user_id and payload.assigned_user_id not in set(trainer_scope["trainee_ids"]):
            raise HTTPException(status_code=404, detail="Trainee not found")
        next_user_id = payload.assigned_user_id or None
        next_batch_id = None

    if not next_batch_id and not next_user_id:
        raise HTTPException(status_code=400, detail="Assign the category to either one batch or one trainee.")

    ordered_question_ids, ordered_questions = _load_assignment_question_set(
        db,
        category=next_category,
        requested_question_ids=payload.question_ids
        if "question_ids" in fields_set
        else (assessment.question_ids if "category_id" not in fields_set else None),
    )
    if not ordered_questions:
        raise HTTPException(
            status_code=400,
            detail="Save at least one question to this assessment category before assigning it.",
        )

    duplicate = (
        db.query(MCQAssessment)
        .filter(
            MCQAssessment.id != assessment.id,
            MCQAssessment.category_id == next_category.id,
            MCQAssessment.assigned_batch_id == next_batch_id,
            MCQAssessment.assigned_user_id == next_user_id,
            MCQAssessment.assigned_by == current_user.id,
            MCQAssessment.is_active == True,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail="An active assessment category is already assigned to that target.",
        )

    assessment.category_id = next_category.id
    assessment.question_ids = ordered_question_ids
    assessment.question_snapshot = _build_mcq_question_snapshot(ordered_questions)
    assessment.assigned_batch_id = next_batch_id
    assessment.assigned_user_id = next_user_id
    if "title" in fields_set:
        normalized_title = payload.title.strip()
        if not normalized_title:
            target_label = (
                trainer_scope["batch_lookup"][next_batch_id].name
                if next_batch_id and next_batch_id in trainer_scope["batch_lookup"]
                else db.query(User).filter(User.id == next_user_id).first().full_name
                if next_user_id
                else "Assignment"
            )
            normalized_title = f"{next_category.name} - {target_label}"
        assessment.title = normalized_title
    if "description" in fields_set:
        assessment.description = payload.description.strip() or None
    if "due_date" in fields_set:
        assessment.due_date = payload.due_date
    if "time_limit_minutes" in fields_set:
        assessment.time_limit_minutes = max(int(payload.time_limit_minutes or 0), 1)
    assessment.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(assessment)

    return {
        "status": "updated",
        "assessment": _serialize_mcq_assignment_rows(db, assessments=[assessment])[0],
    }


@router.delete("/mcq/assignments/{assessment_id}")
async def delete_mcq_assignment(
    assessment_id: str,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    assessment = (
        db.query(MCQAssessment)
        .filter(MCQAssessment.id == assessment_id, MCQAssessment.is_active == True)
        .first()
    )
    if not assessment:
        raise HTTPException(status_code=404, detail="Assigned assessment not found")
    if assessment.assigned_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to delete this assigned assessment")

    impacted_trainee_ids = sorted(_get_mcq_assessment_target_trainee_ids(db, assessment))
    assessment.is_active = False
    assessment.updated_at = datetime.utcnow()
    db.commit()
    for trainee_id in impacted_trainee_ids:
        sync_trainee_completion_certificates(db, trainee_id)
    return {"status": "deleted", "assessment_id": assessment_id}


@router.get("/mcq/assignments")
async def list_trainer_mcq_assignments(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN])
    query = db.query(MCQAssessment).filter(MCQAssessment.is_active == True)
    if current_user.role == UserRole.TRAINER:
        query = query.filter(MCQAssessment.assigned_by == current_user.id)

    assessments = query.order_by(MCQAssessment.created_at.desc(), MCQAssessment.title.asc()).all()
    _sync_certificates_for_assessment_targets(db, assessments)
    serialized = _serialize_mcq_assignment_rows(db, assessments=assessments)
    return {
        "count": len(serialized),
        "assignments": serialized,
    }


@router.post("/mcq/samples/language-assessment")
async def seed_language_assessment_mcq_samples(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    raise HTTPException(
        status_code=410,
        detail="Sample MCQ programs are disabled. Create question banks and assessments from live database records instead.",
    )


@router.post("/mcq/samples/kpi-program")
async def seed_kpi_assessment_program(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    raise HTTPException(
        status_code=410,
        detail="Sample MCQ programs are disabled. Create question banks and assessments from live database records instead.",
    )


@router.get("/mcq/my-assessments")
async def list_my_mcq_assessments(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINEE])
    sync_trainee_completion_certificates(db, current_user.id)
    batch_ids = [b.id for b in current_user.batches if getattr(b, "is_active", True)]
    assessments = (
        db.query(MCQAssessment)
        .filter(
            MCQAssessment.is_active == True,
            (MCQAssessment.assigned_user_id == current_user.id)
            | (MCQAssessment.assigned_batch_id.in_(batch_ids)),
        )
        .order_by(MCQAssessment.created_at.desc(), MCQAssessment.title.asc())
        .all()
    )
    assessment_ids = [assessment.id for assessment in assessments]
    category_ids = list({assessment.category_id for assessment in assessments if assessment.category_id})

    categories = (
        db.query(MCQCategory)
        .filter(MCQCategory.id.in_(category_ids))
        .all()
        if category_ids
        else []
    )
    category_lookup = {category.id: category for category in categories}

    submissions = (
        db.query(MCQSubmission)
        .filter(
            MCQSubmission.trainee_id == current_user.id,
            MCQSubmission.assessment_id.in_(assessment_ids),
        )
        .all()
        if assessment_ids
        else []
    )
    submission_lookup = {submission.assessment_id: submission for submission in submissions}

    certificates = (
        db.query(CertificateRecord)
        .filter(
            CertificateRecord.trainee_id == current_user.id,
            CertificateRecord.source_type == "mcq_assessment",
            CertificateRecord.source_id.in_(assessment_ids),
        )
        .all()
        if assessment_ids
        else []
    )
    certificate_lookup = {certificate.source_id: certificate for certificate in certificates}
    serialized_assessments = []
    for assessment in assessments:
        submission = submission_lookup.get(assessment.id)
        certificate = certificate_lookup.get(assessment.id)
        snapshot = _resolve_mcq_assessment_snapshot(db, assessment)
        question_ids = [
            str(row.get("id"))
            for row in snapshot
            if isinstance(row, dict) and row.get("id")
        ] or [question_id for question_id in dict.fromkeys(assessment.question_ids or []) if question_id]
        is_completed = bool(submission)
        is_passed = submission.is_passed if submission else None
        status = "passed" if submission and submission.is_passed else "failed" if submission else "pending"
        serialized_assessments.append(
            {
                "id": assessment.id,
                "title": assessment.title,
                "description": assessment.description,
                "category_id": assessment.category_id,
                "category_name": category_lookup.get(assessment.category_id).name
                if category_lookup.get(assessment.category_id)
                else None,
                "question_ids": question_ids,
                "question_count": len(question_ids),
                "passing_threshold": (
                    _effective_mcq_passing_threshold(
                        category_lookup.get(assessment.category_id).passing_threshold
                    )
                    if category_lookup.get(assessment.category_id)
                    else MCQ_MIN_PASSING_THRESHOLD
                ),
                "time_limit_minutes": assessment.time_limit_minutes or 30,
                "assigned_batch_id": assessment.assigned_batch_id,
                "assigned_user_id": assessment.assigned_user_id,
                "due_date": assessment.due_date,
                "is_completed": is_completed,
                "is_passed": is_passed,
                "status": status,
                "score_percentage": submission.score_percentage if submission else None,
                "can_retake": bool(submission and submission.is_passed is False),
                "can_view": bool(submission),
                "is_locked": bool(submission and submission.is_passed),
                "attempt_count": int(submission.attempt_count or 0) if submission else 0,
                "submitted_at": submission.submitted_at if submission else None,
                "latest_review": submission.review if submission else [],
                "certificate_id": certificate.id if certificate else None,
                "certificate_no": certificate.certificate_no if certificate else None,
            }
        )

    serialized_assessments.sort(
        key=lambda item: (
            0
            if item["status"] == "pending"
            else 1
            if item["status"] == "failed"
            else 2,
            item["due_date"] is None,
            str(item["due_date"] or ""),
            item["title"].lower(),
        )
    )
    return {
        "count": len(serialized_assessments),
        "assessments": serialized_assessments,
    }


@router.get("/mcq/assessment/{assessment_id}")
async def get_mcq_assessment(
    assessment_id: str,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINEE, UserRole.TRAINER, UserRole.ADMIN])
    assessment = db.query(MCQAssessment).filter(MCQAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    _ensure_mcq_assessment_access(
        db,
        assessment=assessment,
        current_user=current_user,
    )
    question_snapshot = _resolve_mcq_assessment_snapshot(db, assessment)
    if not question_snapshot:
        raise HTTPException(status_code=400, detail="Assessment has no saved questions")

    latest_submission = None
    certificate = None
    if current_user.role == UserRole.TRAINEE:
        latest_submission = (
            db.query(MCQSubmission)
            .filter(
                MCQSubmission.assessment_id == assessment.id,
                MCQSubmission.trainee_id == current_user.id,
            )
            .first()
        )
        certificate = (
            db.query(CertificateRecord)
            .filter(
                CertificateRecord.trainee_id == current_user.id,
                CertificateRecord.source_type == "mcq_assessment",
                CertificateRecord.source_id == assessment.id,
            )
            .first()
        )

    return {
        "id": assessment.id,
        "title": assessment.title,
        "description": assessment.description,
        "category_id": assessment.category_id,
        "time_limit_minutes": assessment.time_limit_minutes or 30,
        "status": (
            "passed"
            if latest_submission and latest_submission.is_passed
            else "failed"
            if latest_submission
            else "pending"
        ),
        "can_retake": bool(latest_submission and latest_submission.is_passed is False),
        "is_locked": bool(latest_submission and latest_submission.is_passed),
        "latest_submission": {
            "score_percentage": latest_submission.score_percentage,
            "is_passed": latest_submission.is_passed,
            "attempt_count": latest_submission.attempt_count or 1,
            "submitted_at": latest_submission.submitted_at,
            "review": latest_submission.review or [],
            "certificate_id": certificate.id if certificate else None,
            "certificate_no": certificate.certificate_no if certificate else None,
        }
        if latest_submission
        else None,
        "questions": [
            {
                "id": row.get("id"),
                "question_text": row.get("question_text"),
                "options": row.get("options") or {},
                "media_url": row.get("media_url"),
            }
            for row in question_snapshot
        ],
    }


class MCQSubmitPayload(BaseModel):
    answers: Dict[str, str]  # {question_id: "A"}


@router.post("/mcq/assessment/{assessment_id}/submit")
async def submit_mcq_assessment(
    assessment_id: str,
    payload: MCQSubmitPayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINEE])
    assessment = db.query(MCQAssessment).filter(MCQAssessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    _ensure_mcq_assessment_access(
        db,
        assessment=assessment,
        current_user=current_user,
    )
    question_snapshot = _resolve_mcq_assessment_snapshot(db, assessment)
    if not question_snapshot:
        raise HTTPException(status_code=400, detail="Assessment has no saved questions")

    total_weight = sum(float(question.get("kip_weight") or 1.0) for question in question_snapshot) or 1.0
    earned = 0.0
    review = []
    for question in question_snapshot:
        question_id = str(question.get("id") or "")
        answer = (payload.answers.get(question_id) or "").upper()
        correct_option = str(question.get("correct_option") or "").upper()
        correct = answer == correct_option
        if correct:
            earned += float(question.get("kip_weight") or 1.0)
        review.append(
            {
                "question_id": question_id,
                "selected": answer,
                "correct": correct_option,
                "is_correct": correct,
                "explanation": question.get("explanation"),
            }
        )
    score = round((earned / total_weight) * 100, 2)
    category = db.query(MCQCategory).filter(MCQCategory.id == assessment.category_id).first()
    passing = (
        _effective_mcq_passing_threshold(category.passing_threshold)
        if category
        else MCQ_MIN_PASSING_THRESHOLD
    )
    is_passed = score >= passing

    existing = db.query(MCQSubmission).filter(
        MCQSubmission.assessment_id == assessment_id,
        MCQSubmission.trainee_id == current_user.id,
    ).first()
    if existing and existing.is_passed:
        raise HTTPException(
            status_code=400,
            detail="Passed assessments cannot be retaken.",
        )
    submission_record: MCQSubmission
    if existing:
        existing.answers = payload.answers
        existing.review = review
        existing.score_percentage = score
        existing.is_passed = is_passed
        existing.attempt_count = int(existing.attempt_count or 0) + 1
        existing.submitted_at = datetime.utcnow()
        submission_record = existing
    else:
        submission_record = MCQSubmission(
            assessment_id=assessment_id,
            trainee_id=current_user.id,
            answers=payload.answers,
            review=review,
            score_percentage=score,
            is_passed=is_passed,
            attempt_count=1,
        )
        db.add(submission_record)
    db.flush()

    achievement_title = category.name if category else assessment.title
    db.commit()
    created_certificates = sync_trainee_completion_certificates(db, current_user.id)

    assessment_certificate = (
        db.query(CertificateRecord)
        .filter(
            CertificateRecord.trainee_id == current_user.id,
            CertificateRecord.source_type == "mcq_assessment",
            CertificateRecord.source_id == assessment.id,
        )
        .first()
        if is_passed
        else None
    )
    completion_certificate = (
        db.query(CertificateRecord)
        .filter(
            CertificateRecord.trainee_id == current_user.id,
            CertificateRecord.source_type == "mcq_assessment_completion",
            CertificateRecord.source_id == current_user.id,
        )
        .first()
    )
    return {
        "score_percentage": score,
        "is_passed": is_passed,
        "review": review,
        "certificate_id": assessment_certificate.id if assessment_certificate else None,
        "certificate_no": assessment_certificate.certificate_no if assessment_certificate else None,
        "certificate_created": any(
            certificate.id == assessment_certificate.id
            for certificate in created_certificates
        )
        if assessment_certificate
        else False,
        "completion_certificate_id": completion_certificate.id if completion_certificate else None,
        "completion_certificate_no": completion_certificate.certificate_no if completion_certificate else None,
        "completion_certificate_created": any(
            certificate.id == completion_certificate.id
            for certificate in created_certificates
        )
        if completion_certificate
        else False,
        "status": "passed" if is_passed else "failed",
        "can_retake": not is_passed,
        "achievement_title": achievement_title,
    }


# ------------------------- Coaching -------------------------


class CoachingTemplatePayload(BaseModel):
    name: str
    mandatory_fields: List[str]
    acknowledgment_window_hours: int = 48


class CoachingLogPayload(BaseModel):
    practice_session_id: Optional[str] = None
    sim_session_id: Optional[str] = None
    trainee_id: str
    coaching_minutes: int = 0
    strengths: Optional[str] = None
    opportunities: Optional[str] = None
    action_plan: Optional[str] = None
    target_date: Optional[datetime] = None
    trainer_remarks: Optional[str] = None
    status: str = "draft"
    competency_status: str = "pending"


@router.post("/coaching/templates")
async def create_coaching_template(
    payload: CoachingTemplatePayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN])
    template = CoachingTemplate(
        name=payload.name,
        mandatory_fields=payload.mandatory_fields,
        acknowledgment_window_hours=payload.acknowledgment_window_hours,
        created_by=current_user.id,
    )
    db.add(template)
    db.commit()
    return {"status": "created", "template_id": template.id}


@router.get("/coaching/template")
async def get_coaching_template(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER])
    template = (
        db.query(CoachingTemplate)
        .filter(CoachingTemplate.is_active == True)
        .order_by(CoachingTemplate.updated_at.desc(), CoachingTemplate.created_at.desc())
        .first()
    )

    if not template:
        return {
            "name": "Default Coaching Template",
            "mandatory_fields": [
                "strengths",
                "opportunities",
                "action_plan",
                "target_date",
            ],
            "acknowledgment_window_hours": 48,
        }

    return {
        "id": template.id,
        "name": template.name,
        "mandatory_fields": template.mandatory_fields or [],
        "acknowledgment_window_hours": template.acknowledgment_window_hours,
        "updated_at": template.updated_at,
    }


@router.put("/coaching/template")
async def update_coaching_template(
    payload: CoachingTemplatePayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN])
    template = (
        db.query(CoachingTemplate)
        .filter(CoachingTemplate.is_active == True)
        .order_by(CoachingTemplate.updated_at.desc(), CoachingTemplate.created_at.desc())
        .first()
    )

    if not template:
        template = CoachingTemplate(
            name=payload.name,
            mandatory_fields=payload.mandatory_fields,
            acknowledgment_window_hours=payload.acknowledgment_window_hours,
            created_by=current_user.id,
        )
        db.add(template)
    else:
        template.name = payload.name
        template.mandatory_fields = payload.mandatory_fields
        template.acknowledgment_window_hours = payload.acknowledgment_window_hours
        template.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(template)

    return {
        "status": "updated",
        "template": {
            "id": template.id,
            "name": template.name,
            "mandatory_fields": template.mandatory_fields or [],
            "acknowledgment_window_hours": template.acknowledgment_window_hours,
            "updated_at": template.updated_at,
        },
    }


@router.post("/coaching/logs")
async def create_coaching_log(
    payload: CoachingLogPayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN])
    trainee = db.query(User).filter(User.id == payload.trainee_id).first()
    if not trainee:
        raise HTTPException(status_code=404, detail="Trainee not found")
    requested_status = payload.status if payload.status in {"draft", "sent"} else "draft"
    if requested_status == "sent":
        required_fields = {
            "strengths": payload.strengths,
            "opportunities": payload.opportunities,
            "action_plan": payload.action_plan,
            "target_date": payload.target_date,
        }
        missing = [field for field, value in required_fields.items() if not value]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required coaching fields: {', '.join(missing)}",
            )

    trainer_batch = _ensure_trainer_can_access_trainee(
        db,
        current_user=current_user,
        trainee_id=payload.trainee_id,
    )
    practice_session, sim_session, source_type = _resolve_coaching_log_source(
        db,
        payload=payload,
        trainee_id=payload.trainee_id,
    )

    existing_log = None
    if payload.practice_session_id:
        existing_log = (
            db.query(CoachingLog)
            .filter(CoachingLog.practice_session_id == payload.practice_session_id)
            .order_by(CoachingLog.updated_at.desc(), CoachingLog.created_at.desc())
            .first()
        )
    elif payload.sim_session_id:
        existing_log = (
            db.query(CoachingLog)
            .filter(CoachingLog.sim_session_id == payload.sim_session_id)
            .order_by(CoachingLog.updated_at.desc(), CoachingLog.created_at.desc())
            .first()
        )

    log = existing_log or CoachingLog(
        coaching_id=_generate_coaching_id(db),
        trainer_id=current_user.id,
        trainee_id=payload.trainee_id,
    )
    if not existing_log:
        db.add(log)

    source_batch = (
        sim_session.batch
        if sim_session and sim_session.batch
        else trainer_batch or (trainee.batches[0] if trainee.batches else None)
    )
    source_lob = (
        sim_session.scenario.lob
        if sim_session and sim_session.scenario
        else practice_session.scenario.lob
        if practice_session and practice_session.scenario
        else trainee.lob
    )

    log.source_type = source_type
    log.practice_session_id = payload.practice_session_id
    log.sim_session_id = payload.sim_session_id
    log.trainer_id = current_user.id
    log.trainee_id = payload.trainee_id
    log.batch_name = source_batch.name if source_batch else None
    log.lob = source_lob
    log.coaching_minutes = payload.coaching_minutes
    log.strengths = payload.strengths
    log.opportunities = payload.opportunities
    log.action_plan = payload.action_plan
    log.target_date = payload.target_date
    log.trainer_remarks = payload.trainer_remarks
    log.status = requested_status
    log.competency_status = normalize_competency_status(payload.competency_status)
    log.updated_at = datetime.utcnow()
    if requested_status != "acknowledged":
        log.acknowledged_at = None

    db.commit()
    db.refresh(log)
    return {
        "status": "updated" if existing_log else "created",
        "coaching_log_id": log.id,
        "coaching_id": log.coaching_id,
    }


@router.get("/coaching/logs")
async def list_coaching_logs(
    trainee_id: Optional[str] = None,
    coaching_id: Optional[str] = None,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN, UserRole.TRAINEE])
    coaching_payload = None
    scoped_trainee_ids = [trainee_id] if trainee_id else None
    if current_user.role == UserRole.TRAINEE:
        scoped_trainee_ids = [current_user.id]
    _purge_orphaned_coaching_logs(db, trainee_ids=scoped_trainee_ids)
    query = db.query(CoachingLog)

    if current_user.role == UserRole.TRAINEE:
        query = query.filter(
            CoachingLog.trainee_id == current_user.id,
            CoachingLog.status.in_(["sent", "acknowledged"]),
        )
    elif current_user.role == UserRole.TRAINER:
        scope = _get_trainer_scope(db, current_user=current_user)
        trainee_ids = list(scope["trainee_ids"])
        if not trainee_ids:
            return {"count": 0, "logs": []}
        query = query.filter(CoachingLog.trainee_id.in_(trainee_ids))

    if trainee_id:
        if current_user.role == UserRole.TRAINEE and trainee_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not allowed")
        query = query.filter(CoachingLog.trainee_id == trainee_id)
    if coaching_id:
        query = query.filter(CoachingLog.coaching_id == coaching_id)

    logs = query.order_by(CoachingLog.created_at.desc()).all()
    if logs:
        coaching_payload = load_latest_coaching_logs(
            db,
            trainee_ids=list({log.trainee_id for log in logs}),
        )
        serialized = []
        log_lookup = {log.id: log for log in coaching_payload["logs"]}
        for log in logs:
            serialized.append(serialize_coaching_log(log_lookup.get(log.id, log)))
    else:
        serialized = []

    return {
        "count": len(serialized),
        "logs": serialized,
    }


@router.post("/coaching/logs/{log_id}/acknowledge")
async def acknowledge_coaching_log(
    log_id: str,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINEE])
    log = db.query(CoachingLog).filter(CoachingLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Coaching log not found")
    if log.trainee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot acknowledge another trainee's log")
    if log.status == "draft":
        raise HTTPException(status_code=400, detail="Draft coaching logs cannot be acknowledged")
    log.status = "acknowledged"
    log.acknowledged_at = datetime.utcnow()
    db.commit()
    return {"status": "acknowledged", "coaching_id": log.coaching_id}


@router.get("/coaching/compliance")
async def coaching_compliance(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER])
    _purge_orphaned_coaching_logs(db)

    if current_user.role == UserRole.TRAINER:
        scope = _get_trainer_scope(db, current_user=current_user)
        candidate_trainee_ids = list(scope["trainee_ids"])
    else:
        candidate_trainee_ids = [
            trainee_id
            for (trainee_id,) in db.query(User.id)
            .filter(User.role == UserRole.TRAINEE, User.is_active == True)
            .all()
        ]

    candidate_trainees = (
        db.query(User)
        .filter(
            User.id.in_(candidate_trainee_ids or ["__none__"]),
            User.role == UserRole.TRAINEE,
            User.is_active == True,
        )
        .all()
    )
    active_trainee_ids = [
        trainee.id for trainee in filter_to_supabase_active_users(db, candidate_trainees)
    ]
    if not active_trainee_ids:
        return {
            "total_logs": 0,
            "acknowledged_logs": 0,
            "pending_logs": 0,
            "draft_logs": 0,
            "competent_logs": 0,
            "not_competent_logs": 0,
            "acknowledgment_rate": 0,
        }

    query = db.query(CoachingLog).filter(CoachingLog.trainee_id.in_(active_trainee_ids))
    if current_user.role == UserRole.TRAINER:
        query = query.filter(CoachingLog.trainee_id.in_(active_trainee_ids))

    total = query.count()
    acknowledged = query.filter(CoachingLog.status == "acknowledged").count()
    pending = query.filter(CoachingLog.status == "sent").count()
    drafts = query.filter(CoachingLog.status == "draft").count()
    competent = query.filter(CoachingLog.competency_status == "competent").count()
    not_competent = query.filter(CoachingLog.competency_status == "not_competent").count()
    return {
        "total_logs": total,
        "acknowledged_logs": acknowledged,
        "pending_logs": pending,
        "draft_logs": drafts,
        "competent_logs": competent,
        "not_competent_logs": not_competent,
        "acknowledgment_rate": round((acknowledged / total) * 100, 2) if total else 0,
    }


@router.get("/coaching/hub")
async def coaching_hub(
    trainee_id: Optional[str] = None,
    batch_id: Optional[str] = None,
    trainer_id: Optional[str] = None,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN])
    _purge_orphaned_coaching_logs(db)

    batch_lookup: dict[str, Batch] = {}
    accessible_trainee_ids: set[str] = set()
    trainee_batch: dict[str, Batch] = {}
    batches: list[Batch] = []

    if current_user.role == UserRole.TRAINER:
        scope = _get_trainer_scope(db, current_user=current_user)
        batches = scope["batches"]
        batch_lookup = scope["batch_lookup"]
        accessible_trainee_ids = set(scope["trainee_ids"])
        trainee_batch = scope["trainee_batch"]
    else:
        batches = (
            db.query(Batch)
            .filter(Batch.is_active == True)
            .order_by(Batch.wave_number.is_(None), Batch.wave_number.asc(), Batch.name.asc())
            .all()
        )
        batch_lookup = {batch.id: batch for batch in batches}
        trainees = (
            db.query(User)
            .filter(User.role == UserRole.TRAINEE, User.is_active == True)
            .all()
        )
        accessible_trainee_ids = {trainee.id for trainee in trainees}
        for trainee in trainees:
            active_batch = next((batch for batch in trainee.batches if batch.id in batch_lookup), None)
            if active_batch:
                trainee_batch[trainee.id] = active_batch

        if trainer_id:
            trainer_batches = [batch for batch in batches if batch.created_by == trainer_id]
            trainer_batch_lookup = {batch.id: batch for batch in trainer_batches}
            trainer_trainee_ids = {
                user.id
                for batch in trainer_batches
                for user in batch.users
                if user.role == UserRole.TRAINEE and user.is_active
            }
            accessible_trainee_ids = trainer_trainee_ids
            batch_lookup = trainer_batch_lookup
            trainee_batch = {}
            for batch in trainer_batches:
                for user in batch.users:
                    if user.role == UserRole.TRAINEE and user.is_active:
                        trainee_batch[user.id] = batch
            batches = trainer_batches

    if batch_id:
        batch = batch_lookup.get(batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        accessible_trainee_ids = {
            user.id for user in batch.users if user.role == UserRole.TRAINEE and user.is_active
        }
        trainee_batch = {trainee_id_value: batch for trainee_id_value in accessible_trainee_ids}

    if trainee_id:
        if current_user.role == UserRole.TRAINER and trainee_id not in accessible_trainee_ids:
            raise HTTPException(status_code=403, detail="This trainee is not assigned to one of your batches.")
        accessible_trainee_ids = {trainee_id}

    candidate_trainee_records = (
        db.query(User)
        .filter(
            User.id.in_(list(accessible_trainee_ids) or ["__none__"]),
            User.role == UserRole.TRAINEE,
            User.is_active == True,
        )
        .all()
    )
    trainee_records = sorted(
        filter_to_supabase_active_users(db, candidate_trainee_records),
        key=lambda trainee: ((trainee.full_name or "").lower(), (trainee.email or "").lower()),
    )
    accessible_trainee_ids = {trainee.id for trainee in trainee_records}
    trainee_batch = {
        trainee_id_value: batch
        for trainee_id_value, batch in trainee_batch.items()
        if trainee_id_value in accessible_trainee_ids
    }
    batches = [
        batch
        for batch in batches
        if any(
            user.id in accessible_trainee_ids
            for user in batch.users
            if user.role == UserRole.TRAINEE and user.is_active
        )
    ]
    batch_lookup = {batch.id: batch for batch in batches}

    if not accessible_trainee_ids:
        return {
            "summary": {
                "completed_categories": 0,
                "ready_for_coaching": 0,
                "pending_acknowledgement": 0,
                "acknowledged": 0,
                "competent": 0,
                "not_competent": 0,
            },
            "batches": [],
            "trainees": [],
            "completed_categories": [],
            "recent_logs": [],
        }

    completed_sim_sessions = (
        db.query(SimSession)
        .filter(
            SimSession.trainee_id.in_(list(accessible_trainee_ids)),
            SimSession.status.in_(["completed", "failed"]),
        )
        .order_by(SimSession.created_at.desc(), SimSession.attempt_number.desc())
        .all()
    )
    latest_session_by_scenario: dict[tuple[str, str], SimSession] = {}
    for session in completed_sim_sessions:
        key = (session.trainee_id, session.scenario_id)
        if key not in latest_session_by_scenario:
            latest_session_by_scenario[key] = session

    relevant_session_ids = [session.id for session in latest_session_by_scenario.values()]
    sim_coaching_logs = (
        db.query(CoachingLog)
        .filter(
            CoachingLog.sim_session_id.in_(relevant_session_ids or ["__none__"]),
        )
        .order_by(CoachingLog.created_at.desc(), CoachingLog.updated_at.desc())
        .all()
    )
    latest_log_by_sim_session: dict[str, CoachingLog] = {}
    published_sim_logs: list[CoachingLog] = []
    for log in sim_coaching_logs:
        if log.status != "draft":
            published_sim_logs.append(log)
        if log.sim_session_id and log.sim_session_id not in latest_log_by_sim_session:
            latest_log_by_sim_session[log.sim_session_id] = log

    completed_categories = []
    for (user_id, scenario_id), latest_session in latest_session_by_scenario.items():
        latest_log = latest_log_by_sim_session.get(latest_session.id)
        training_state = build_training_state(
            latest_session=latest_session,
            coaching_log=latest_log,
        )
        trainee = latest_session.trainee
        batch = latest_session.batch or trainee_batch.get(user_id)

        completed_categories.append(
            {
                "trainee_id": user_id,
                "trainee_name": trainee.full_name if trainee else None,
                "trainee_email": trainee.email if trainee else None,
                "batch_id": batch.id if batch else None,
                "batch_name": batch.name if batch else None,
                "wave_number": batch.wave_number if batch else None,
                "scenario_id": scenario_id,
                "scenario_title": latest_session.scenario.title if latest_session.scenario else None,
                "practice_session_id": None,
                "sim_session_id": latest_session.id,
                "audio_file_url": latest_session.audio_url,
                "transcription": latest_session.transcript,
                "transcription_confidence": latest_session.transcript_confidence,
                "overall_score": latest_session.weighted_score,
                "scores": {
                    "accuracy": latest_session.speech_to_text_accuracy,
                    "fluency": latest_session.pronunciation_score,
                    "clarity": latest_session.pacing_score,
                    "keyword_adherence": (latest_session.keyword_compliance or {}).get("score"),
                    "soft_skills": latest_session.sentiment_score,
                },
                "attempt_number": latest_session.attempt_number,
                "created_at": latest_session.created_at,
                "status": latest_session.status,
                "is_verified": latest_session.trainer_verdict_status == "competent",
                "latest_coaching_log": serialize_coaching_log(latest_log) if latest_log else None,
                "training_state": training_state,
            }
        )

    completed_categories.sort(
        key=lambda item: (
            item["batch_name"] or "",
            item["trainee_name"] or "",
            item["scenario_title"] or "",
        )
    )

    recent_logs = [
        serialize_coaching_log(log)
        for log in sim_coaching_logs[:20]
    ]

    summary = {
        "completed_categories": len(completed_categories),
        "ready_for_coaching": sum(
            1
            for item in completed_categories
            if item["training_state"]["code"] == "awaiting_coaching"
        ),
        "pending_acknowledgement": sum(
            1 for log in published_sim_logs if log.status == "sent"
        ),
        "acknowledged": sum(
            1 for log in published_sim_logs if log.status == "acknowledged"
        ),
        "competent": sum(
            1
            for log in published_sim_logs
            if normalize_competency_status(log.competency_status) == "competent"
        ),
        "not_competent": sum(
            1
            for log in published_sim_logs
            if normalize_competency_status(log.competency_status) == "not_competent"
        ),
    }

    return {
        "summary": summary,
        "batches": [
            {
                "id": batch.id,
                "name": batch.name,
                "wave_number": batch.wave_number,
                "lob": batch.lob,
            }
            for batch in batches
        ],
        "trainees": [
            {
                "id": trainee.id,
                "full_name": trainee.full_name,
                "email": trainee.email,
                "batch_id": trainee_batch.get(trainee.id).id if trainee_batch.get(trainee.id) else None,
                "batch_name": trainee_batch.get(trainee.id).name if trainee_batch.get(trainee.id) else None,
                "wave_number": trainee_batch.get(trainee.id).wave_number if trainee_batch.get(trainee.id) else None,
            }
            for trainee in trainee_records
        ],
        "completed_categories": completed_categories,
        "recent_logs": recent_logs,
    }


# ------------------------- Verdict and Certificate -------------------------


class VerdictPayload(BaseModel):
    trainee_id: str
    practice_session_id: Optional[str] = None
    mcq_assessment_id: Optional[str] = None
    remarks: Optional[str] = None
    is_competent: bool


@router.post("/verdicts")
async def create_competency_verdict(
    payload: VerdictPayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN])
    settings = _ensure_settings(db)
    if current_user.role == UserRole.TRAINER:
        _ensure_trainer_can_access_trainee(
            db,
            current_user=current_user,
            trainee_id=payload.trainee_id,
        )

    asr_score = 0.0
    mcq_score = 0.0
    if payload.practice_session_id:
        session = db.query(PracticeSession).filter(PracticeSession.id == payload.practice_session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Practice session not found")
        asr_score = float(session.overall_score or 0.0)
    if payload.mcq_assessment_id:
        submission = db.query(MCQSubmission).filter(
            MCQSubmission.assessment_id == payload.mcq_assessment_id,
            MCQSubmission.trainee_id == payload.trainee_id,
        ).first()
        if not submission:
            raise HTTPException(status_code=404, detail="MCQ submission not found")
        mcq_score = float(submission.score_percentage or 0.0)

    # Enforce thresholds for competent decision.
    threshold_ok = (asr_score >= settings.asr_passing_threshold) and (
        mcq_score >= _effective_mcq_passing_threshold(settings.mcq_passing_threshold)
    )
    is_competent = payload.is_competent and threshold_ok

    verdict = CompetencyVerdict(
        trainee_id=payload.trainee_id,
        trainer_id=current_user.id,
        practice_session_id=payload.practice_session_id,
        mcq_assessment_id=payload.mcq_assessment_id,
        asr_score=asr_score,
        mcq_score=mcq_score,
        remarks=payload.remarks,
        is_competent=is_competent,
        decided_at=datetime.utcnow(),
    )
    db.add(verdict)
    db.flush()

    certificate: Optional[CertificateRecord] = None
    certificate_created = False
    if verdict.is_competent:
        certificate, certificate_created = issue_certificate_for_verdict(
            db,
            verdict=verdict,
            achievement_title=settings.unit_of_competency,
        )
    db.commit()
    return {
        "status": "created",
        "verdict_id": verdict.id,
        "is_competent": verdict.is_competent,
        "asr_score": asr_score,
        "mcq_score": mcq_score,
        "threshold_met": threshold_ok,
        "certificate_id": certificate.id if certificate else None,
        "certificate_created": certificate_created,
    }


@router.get("/verdicts/my-latest")
async def my_latest_verdict(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINEE])
    verdict = (
        db.query(CompetencyVerdict)
        .filter(CompetencyVerdict.trainee_id == current_user.id)
        .order_by(CompetencyVerdict.decided_at.desc())
        .first()
    )
    if not verdict:
        return {"status": "none"}
    certificate = (
        db.query(CertificateRecord)
        .filter(CertificateRecord.verdict_id == verdict.id)
        .order_by(CertificateRecord.issued_at.desc())
        .first()
    )
    return {
        "id": verdict.id,
        "is_competent": verdict.is_competent,
        "remarks": verdict.remarks,
        "asr_score": verdict.asr_score,
        "mcq_score": verdict.mcq_score,
        "decided_at": verdict.decided_at,
        "certificate_id": certificate.id if certificate else None,
    }


@router.post("/verdicts/{verdict_id}/issue-certificate")
async def issue_certificate(
    verdict_id: str,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN])
    verdict = db.query(CompetencyVerdict).filter(CompetencyVerdict.id == verdict_id).first()
    if not verdict:
        raise HTTPException(status_code=404, detail="Verdict not found")
    if not verdict.is_competent:
        raise HTTPException(status_code=400, detail="Certificate only allowed for competent verdict")

    settings = _ensure_settings(db)
    cert, created = issue_certificate_for_verdict(
        db,
        verdict=verdict,
        achievement_title=settings.unit_of_competency,
    )
    db.commit()
    return {
        "status": "issued" if created else "exists",
        "certificate_id": cert.id,
        "certificate_no": cert.certificate_no,
        "token": cert.qr_token,
    }


@router.get("/certificates")
async def list_certificates(
    trainee_id: Optional[str] = None,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER, UserRole.TRAINEE])

    target_trainee_id = trainee_id
    if current_user.role == UserRole.TRAINEE:
        target_trainee_id = current_user.id
    if target_trainee_id:
        sync_trainee_completion_certificates(db, target_trainee_id)

    query = db.query(CertificateRecord)
    if current_user.role == UserRole.TRAINEE:
        query = query.filter(CertificateRecord.trainee_id == current_user.id)
    elif target_trainee_id:
        query = query.filter(CertificateRecord.trainee_id == target_trainee_id)

    certificates = query.order_by(CertificateRecord.issued_at.desc()).all()
    trainee_ids = {certificate.trainee_id for certificate in certificates}
    issuer_ids = {certificate.trainer_id for certificate in certificates}
    users = (
        db.query(User)
        .filter(User.id.in_(list(trainee_ids | issuer_ids)))
        .all()
        if certificates
        else []
    )
    user_lookup = {user.id: user for user in users}
    settings = _ensure_settings(db)

    return {
        "count": len(certificates),
        "settings": _serialize_certificate_settings(settings),
        "certificates": [
            _serialize_certificate_record(
                certificate,
                trainee=user_lookup.get(certificate.trainee_id),
                issuer=user_lookup.get(certificate.trainer_id),
                settings=settings,
            )
            for certificate in certificates
        ],
    }


@router.get("/certificate/{certificate_id}/pdf")
async def get_certificate_pdf(
    certificate_id: str,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER, UserRole.TRAINEE])
    cert = db.query(CertificateRecord).filter(CertificateRecord.id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if current_user.role == UserRole.TRAINEE and cert.trainee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    trainee = db.query(User).filter(User.id == cert.trainee_id).first()
    issuer = db.query(User).filter(User.id == cert.trainer_id).first()
    settings = _ensure_settings(db)
    template = build_template_snapshot(settings)
    template.update(cert.template_snapshot or {})
    verification_url = f"/api/certification/verify/{cert.qr_token}"

    pdf_bytes = generate_certificate_pdf(
        trainee_name=trainee.full_name if trainee else "Trainee",
        achievement_title=cert.unit_of_competency,
        achievement_type=cert.achievement_type or "completion",
        certificate_no=cert.certificate_no,
        verification_url=verification_url,
        issued_at=cert.issued_at,
        institution_name=template["institution_name"],
        institution_address=template["address"],
        contact_number=template["contact_number"],
        contact_email=template["contact_email"],
        logo_url=template["logo_url"],
        signatory_name=template["registrar_name"],
        signatory_title=template["signatory_title"],
        signature_url=template["manager_signature_url"],
        certificate_title=template["certificate_title"],
        certificate_subtitle=template["certificate_subtitle"],
        certificate_intro=template["certificate_intro"],
        certificate_outro=template["certificate_outro"],
        certificate_footer=template["certificate_footer"],
        issuer_name=issuer.full_name if issuer else template["registrar_name"],
        score=cert.kip_score,
    )

    return Response(
        content=pdf_bytes.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="certificate_{cert.certificate_no}.pdf"'},
    )


@router.get("/verify/{token}")
async def verify_certificate(token: str, db: Session = Depends(get_db)):
    cert = db.query(CertificateRecord).filter(CertificateRecord.qr_token == token).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    trainee = db.query(User).filter(User.id == cert.trainee_id).first()
    trainer = db.query(User).filter(User.id == cert.trainer_id).first()
    settings = _ensure_settings(db)
    template = build_template_snapshot(settings)
    template.update(cert.template_snapshot or {})
    return {
        "valid": True,
        "certificate_no": cert.certificate_no,
        "trainee_name": trainee.full_name if trainee else None,
        "trainer_name": trainer.full_name if trainer else None,
        "achievement_title": cert.unit_of_competency,
        "achievement_type": cert.achievement_type or "completion",
        "issued_at": cert.issued_at,
        "score": cert.kip_score,
        "source_type": cert.source_type,
        "settings": template,
    }


# ------------------------- Settings -------------------------


class CertificationSettingsPayload(BaseModel):
    asr_passing_threshold: Optional[float] = None
    mcq_passing_threshold: Optional[float] = None
    manager_signature_url: Optional[str] = None
    logo_url: Optional[str] = None
    dry_seal_url: Optional[str] = None
    registrar_name: Optional[str] = None
    signatory_title: Optional[str] = None
    unit_of_competency: Optional[str] = None
    institution_name: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    contact_email: Optional[str] = None
    certificate_prefix: Optional[str] = None
    certificate_title: Optional[str] = None
    certificate_subtitle: Optional[str] = None
    certificate_intro: Optional[str] = None
    certificate_outro: Optional[str] = None
    certificate_footer: Optional[str] = None


@router.get("/settings")
async def get_certification_settings(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER, UserRole.TRAINEE])
    settings = _ensure_settings(db)
    return _serialize_certificate_settings(settings)


@router.put("/settings")
async def update_certification_settings(
    payload: CertificationSettingsPayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN])
    settings = _ensure_settings(db)
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "mcq_passing_threshold":
            value = _effective_mcq_passing_threshold(value)
        setattr(settings, field, value)
    settings.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "updated"}
