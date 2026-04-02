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
    User,
    UserRole,
)
from ..services.certificate_awards import (
    award_certificate,
    build_template_snapshot,
    ensure_certification_settings,
    issue_certificate_for_verdict,
    sync_trainee_completion_certificates,
)
from ..services.mcq_samples import ensure_trainer_language_assessment_samples
from ..services.certificate_service import generate_certificate_pdf
from ..services.coaching import (
    build_training_state,
    load_latest_coaching_logs,
    load_latest_sessions,
    normalize_competency_status,
    serialize_coaching_log,
)

router = APIRouter(prefix="/api/certification", tags=["certification"])


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

    question_counts = {}
    if category_ids:
        question_counts = {
            category_id: count
            for category_id, count in (
                db.query(MCQQuestion.category_id, func.count(MCQQuestion.id))
                .filter(
                    MCQQuestion.category_id.in_(category_ids),
                    MCQQuestion.is_active == True,
                )
                .group_by(MCQQuestion.category_id)
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
            "passing_threshold": category.passing_threshold,
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
            "question_count": question_counts.get(category.id, 0),
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
        }
        for question in questions
    ]


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
                    "submitted_at": submission.submitted_at if submission else None,
                    "certificate_id": certificate.id if certificate else None,
                    "certificate_no": certificate.certificate_no if certificate else None,
                }
            )

        total_trainees = len(target_trainees)
        question_ids = assessment.question_ids or []
        active_category_question_ids = active_question_lookup.get(assessment.category_id, set())
        active_question_count = len(
            [
                question_id
                for question_id in question_ids
                if not active_category_question_ids or question_id in active_category_question_ids
            ]
        )

        serialized_assessments.append(
            {
                "id": assessment.id,
                "title": assessment.title,
                "description": assessment.description,
                "category_id": assessment.category_id,
                "category_name": category.name if category else None,
                "category_description": category.description if category else None,
                "passing_threshold": (
                    category.passing_threshold if category else 90.0
                ),
                "assigned_batch_id": assessment.assigned_batch_id,
                "assigned_batch_name": batch.name if batch else None,
                "assigned_user_id": assessment.assigned_user_id,
                "assigned_user_name": assigned_user.full_name if assigned_user else None,
                "assigned_by": assessment.assigned_by,
                "assigned_by_name": assigned_by.full_name if assigned_by else None,
                "assigned_by_role": assigned_by.role.value if assigned_by else None,
                "question_ids": question_ids,
                "category_question_count": len(active_category_question_ids),
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
    year = datetime.utcnow().year
    prefix = f"COACH-{year}-"
    count = db.query(CoachingLog).filter(CoachingLog.coaching_id.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:04d}"


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
        .filter(Batch.created_by == current_user.id)
        .order_by(Batch.wave_number.is_(None), Batch.wave_number.asc(), Batch.name.asc())
        .all()
    )
    batch_lookup = {batch.id: batch for batch in batches}
    trainee_ids = set()
    trainee_batch: dict[str, Batch] = {}

    for batch in batches:
        for user in batch.users:
            if user.role != UserRole.TRAINEE:
                continue
            trainee_ids.add(user.id)
            trainee_batch.setdefault(user.id, batch)

    return {
        "batches": batches,
        "batch_lookup": batch_lookup,
        "trainee_ids": trainee_ids,
        "trainee_batch": trainee_batch,
    }


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
        batch_ids = {batch.id for batch in current_user.batches}
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
        "mcq_passing_threshold": settings.mcq_passing_threshold,
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
    snapshot.update(cert.template_snapshot or {})
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


@router.post("/mcq/categories")
async def create_mcq_category(
    payload: MCQCategoryCreate,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    settings = _ensure_settings(db)
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
        passing_threshold=payload.passing_threshold
        if payload.passing_threshold is not None
        else settings.mcq_passing_threshold,
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
        category.passing_threshold = payload.passing_threshold
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

    question.is_active = False
    question.updated_at = datetime.utcnow()

    assessments = db.query(MCQAssessment).filter(MCQAssessment.is_active == True).all()
    for assessment in assessments:
        if question.id in (assessment.question_ids or []):
            assessment.question_ids = [
                existing_question_id
                for existing_question_id in (assessment.question_ids or [])
                if existing_question_id != question.id
            ]
            assessment.updated_at = datetime.utcnow()

    db.commit()
    return {"status": "deleted", "question_id": question_id}


# ------------------------- Assessment Assignment and Submission -------------------------


class MCQAssignPayload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: str
    question_ids: List[str] = []
    assigned_user_id: Optional[str] = None
    assigned_batch_id: Optional[str] = None
    due_date: Optional[datetime] = None


@router.post("/mcq/assign")
async def assign_mcq_assessment(
    payload: MCQAssignPayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER])
    if not payload.assigned_user_id and not payload.assigned_batch_id:
        raise HTTPException(status_code=400, detail="Provide assigned_user_id or assigned_batch_id")
    if payload.assigned_user_id and payload.assigned_batch_id:
        raise HTTPException(
            status_code=400,
            detail="Assign the assessment either to one trainee or to one batch.",
        )
    category = (
        db.query(MCQCategory)
        .filter(MCQCategory.id == payload.category_id, MCQCategory.is_active == True)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="MCQ category not found")
    if not _can_manage_mcq_resource(current_user, category.created_by):
        raise HTTPException(status_code=403, detail="Not allowed to assign this category")
    requested_question_ids = [question_id for question_id in dict.fromkeys(payload.question_ids or []) if question_id]
    question_query = db.query(MCQQuestion).filter(
        MCQQuestion.category_id == payload.category_id,
        MCQQuestion.is_active == True,
    )
    if requested_question_ids:
        question_query = question_query.filter(MCQQuestion.id.in_(requested_question_ids))

    active_questions = question_query.order_by(MCQQuestion.created_at.asc()).all()
    if requested_question_ids and len(active_questions) != len(requested_question_ids):
        raise HTTPException(
            status_code=400,
            detail="All selected question IDs must belong to the chosen category",
        )
    if not active_questions:
        raise HTTPException(
            status_code=400,
            detail="The selected category has no active questions to assign.",
        )
    trainer_scope = _get_trainer_scope(db, current_user=current_user)
    batch = None
    if payload.assigned_batch_id:
        batch = trainer_scope["batch_lookup"].get(payload.assigned_batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        if not any(user.role == UserRole.TRAINEE and user.is_active for user in batch.users):
            raise HTTPException(
                status_code=400,
                detail="The selected batch has no active trainees yet.",
            )
    if payload.assigned_user_id and payload.assigned_user_id not in set(trainer_scope["trainee_ids"]):
        raise HTTPException(status_code=404, detail="Trainee not found")

    if payload.assigned_user_id:
        trainee = db.query(User).filter(User.id == payload.assigned_user_id).first()
        if not trainee or trainee.role != UserRole.TRAINEE:
            raise HTTPException(status_code=404, detail="Trainee not found")
    else:
        trainee = None

    normalized_title = (payload.title or "").strip()
    if not normalized_title:
        if batch:
            normalized_title = f"{category.name} - {batch.name}"
        elif trainee:
            normalized_title = f"{category.name} - {trainee.full_name}"
        else:
            normalized_title = category.name

    assessment = MCQAssessment(
        title=normalized_title,
        description=(payload.description or "").strip() or category.description,
        category_id=payload.category_id,
        question_ids=[question.id for question in active_questions],
        assigned_by=current_user.id,
        assigned_user_id=payload.assigned_user_id,
        assigned_batch_id=payload.assigned_batch_id,
        due_date=payload.due_date,
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return {
        "status": "assigned",
        "assessment_id": assessment.id,
        "assessment": _serialize_mcq_assignment_rows(db, assessments=[assessment])[0],
    }


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
    summary = ensure_trainer_language_assessment_samples(
        db,
        trainer_id=current_user.id,
    )
    db.commit()
    return {
        "status": "seeded",
        **summary,
    }


@router.get("/mcq/my-assessments")
async def list_my_mcq_assessments(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINEE])
    batch_ids = [b.id for b in current_user.batches]
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
    return {
        "count": len(assessments),
        "assessments": [
            {
                "id": a.id,
                "title": a.title,
                "description": a.description,
                "category_id": a.category_id,
                "category_name": category_lookup.get(a.category_id).name
                if category_lookup.get(a.category_id)
                else None,
                "question_ids": a.question_ids,
                "question_count": len(a.question_ids or []),
                "passing_threshold": (
                    category_lookup.get(a.category_id).passing_threshold
                    if category_lookup.get(a.category_id)
                    else 90.0
                ),
                "assigned_batch_id": a.assigned_batch_id,
                "assigned_user_id": a.assigned_user_id,
                "due_date": a.due_date,
                "is_completed": bool(submission_lookup.get(a.id)),
                "score_percentage": (
                    submission_lookup[a.id].score_percentage
                    if submission_lookup.get(a.id)
                    else None
                ),
                "is_passed": (
                    submission_lookup[a.id].is_passed
                    if submission_lookup.get(a.id)
                    else None
                ),
                "submitted_at": (
                    submission_lookup[a.id].submitted_at
                    if submission_lookup.get(a.id)
                    else None
                ),
                "certificate_id": (
                    certificate_lookup[a.id].id if certificate_lookup.get(a.id) else None
                ),
                "certificate_no": (
                    certificate_lookup[a.id].certificate_no
                    if certificate_lookup.get(a.id)
                    else None
                ),
            }
            for a in assessments
        ],
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
    questions = (
        db.query(MCQQuestion)
        .filter(MCQQuestion.id.in_(assessment.question_ids), MCQQuestion.is_active == True)
        .all()
    )
    return {
        "id": assessment.id,
        "title": assessment.title,
        "description": assessment.description,
        "category_id": assessment.category_id,
        "questions": [
            {
                "id": q.id,
                "question_text": q.question_text,
                "options": {"A": q.option_a, "B": q.option_b, "C": q.option_c, "D": q.option_d},
                "media_url": q.media_url,
            }
            for q in questions
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
    questions = (
        db.query(MCQQuestion)
        .filter(MCQQuestion.id.in_(assessment.question_ids), MCQQuestion.is_active == True)
        .all()
    )
    if not questions:
        raise HTTPException(status_code=400, detail="Assessment has no active questions")

    total_weight = sum(q.kip_weight for q in questions) or 1.0
    earned = 0.0
    review = []
    for q in questions:
        answer = (payload.answers.get(q.id) or "").upper()
        correct = answer == q.correct_option
        if correct:
            earned += q.kip_weight
        review.append(
            {
                "question_id": q.id,
                "selected": answer,
                "correct": q.correct_option,
                "is_correct": correct,
                "explanation": q.explanation,
            }
        )
    score = round((earned / total_weight) * 100, 2)
    category = db.query(MCQCategory).filter(MCQCategory.id == assessment.category_id).first()
    passing = category.passing_threshold if category else 90.0
    is_passed = score >= passing

    existing = db.query(MCQSubmission).filter(
        MCQSubmission.assessment_id == assessment_id,
        MCQSubmission.trainee_id == current_user.id,
    ).first()
    submission_record: MCQSubmission
    if existing:
        existing.answers = payload.answers
        existing.score_percentage = score
        existing.is_passed = is_passed
        existing.submitted_at = datetime.utcnow()
        submission_record = existing
    else:
        submission_record = MCQSubmission(
            assessment_id=assessment_id,
            trainee_id=current_user.id,
            answers=payload.answers,
            score_percentage=score,
            is_passed=is_passed,
        )
        db.add(submission_record)
    db.flush()

    achievement_title = category.name if category else assessment.title
    certificate, certificate_created = award_certificate(
        db,
        trainee_id=current_user.id,
        issuer_id=assessment.assigned_by,
        source_type="mcq_assessment",
        source_id=assessment.id,
        achievement_title=achievement_title,
        achievement_type="assessment",
        remarks=f"Completed assessment: {assessment.title}",
        score=score,
        mcq_assessment_id=assessment.id,
        issued_at=submission_record.submitted_at,
    )
    db.commit()
    return {
        "score_percentage": score,
        "is_passed": is_passed,
        "review": review,
        "certificate_id": certificate.id if certificate else None,
        "certificate_no": certificate.certificate_no if certificate else None,
        "certificate_created": certificate_created,
        "achievement_title": achievement_title,
    }


# ------------------------- Coaching -------------------------


class CoachingTemplatePayload(BaseModel):
    name: str
    mandatory_fields: List[str]
    acknowledgment_window_hours: int = 48


class CoachingLogPayload(BaseModel):
    practice_session_id: Optional[str] = None
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
    practice_session = None
    if payload.practice_session_id:
        practice_session = (
            db.query(PracticeSession)
            .filter(PracticeSession.id == payload.practice_session_id)
            .first()
        )
        if not practice_session:
            raise HTTPException(status_code=404, detail="Practice session not found")
        if practice_session.user_id != payload.trainee_id:
            raise HTTPException(
                status_code=400,
                detail="Practice session does not belong to the selected trainee",
            )

    coaching_id = _generate_coaching_id(db)
    log = CoachingLog(
        coaching_id=coaching_id,
        practice_session_id=payload.practice_session_id,
        trainer_id=current_user.id,
        trainee_id=payload.trainee_id,
        batch_name=(
            trainer_batch.name
            if trainer_batch
            else (trainee.batches[0].name if trainee.batches else None)
        ),
        lob=practice_session.scenario.lob if practice_session and practice_session.scenario else trainee.lob,
        coaching_minutes=payload.coaching_minutes,
        strengths=payload.strengths,
        opportunities=payload.opportunities,
        action_plan=payload.action_plan,
        target_date=payload.target_date,
        trainer_remarks=payload.trainer_remarks,
        status=requested_status,
        competency_status=normalize_competency_status(payload.competency_status),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"status": "created", "coaching_log_id": log.id, "coaching_id": log.coaching_id}


@router.get("/coaching/logs")
async def list_coaching_logs(
    trainee_id: Optional[str] = None,
    coaching_id: Optional[str] = None,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN, UserRole.TRAINEE])
    coaching_payload = None
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
    query = db.query(CoachingLog)
    if current_user.role == UserRole.TRAINER:
        scope = _get_trainer_scope(db, current_user=current_user)
        trainee_ids = list(scope["trainee_ids"])
        if not trainee_ids:
            return {
                "total_logs": 0,
                "acknowledged_logs": 0,
                "pending_logs": 0,
                "draft_logs": 0,
                "competent_logs": 0,
                "not_competent_logs": 0,
                "acknowledgment_rate": 0,
            }
        query = query.filter(CoachingLog.trainee_id.in_(trainee_ids))

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
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN])

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
        batches = db.query(Batch).order_by(Batch.wave_number.is_(None), Batch.wave_number.asc(), Batch.name.asc()).all()
        batch_lookup = {batch.id: batch for batch in batches}
        trainees = db.query(User).filter(User.role == UserRole.TRAINEE).all()
        accessible_trainee_ids = {trainee.id for trainee in trainees}
        for trainee in trainees:
            if trainee.batches:
                trainee_batch[trainee.id] = trainee.batches[0]

    if batch_id:
        batch = batch_lookup.get(batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        accessible_trainee_ids = {
            user.id for user in batch.users if user.role == UserRole.TRAINEE
        }
        trainee_batch = {trainee_id_value: batch for trainee_id_value in accessible_trainee_ids}

    if trainee_id:
        if current_user.role == UserRole.TRAINER and trainee_id not in accessible_trainee_ids:
            raise HTTPException(status_code=403, detail="This trainee is not assigned to one of your batches.")
        accessible_trainee_ids = {trainee_id}

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

    trainee_records = (
        db.query(User)
        .filter(User.id.in_(list(accessible_trainee_ids)))
        .order_by(User.full_name.asc(), User.email.asc())
        .all()
    )

    session_payload = load_latest_sessions(
        db,
        trainee_ids=list(accessible_trainee_ids),
    )
    coaching_payload = load_latest_coaching_logs(
        db,
        trainee_ids=list(accessible_trainee_ids),
    )

    completed_categories = []
    for (user_id, scenario_id), latest_session in session_payload["latest_by_scenario"].items():
        latest_log = coaching_payload["latest_by_session"].get(latest_session.id)
        training_state = build_training_state(
            latest_session=latest_session,
            coaching_log=latest_log,
        )
        trainee = latest_session.user
        batch = trainee_batch.get(user_id)

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
                "practice_session_id": latest_session.id,
                "audio_file_url": latest_session.audio_file_url,
                "transcription": latest_session.transcription,
                "transcription_confidence": latest_session.transcription_confidence,
                "overall_score": latest_session.overall_score,
                "scores": {
                    "accuracy": latest_session.accuracy_score,
                    "fluency": latest_session.fluency_score,
                    "clarity": latest_session.clarity_score,
                    "keyword_adherence": latest_session.keyword_adherence_score,
                    "soft_skills": latest_session.soft_skills_score,
                },
                "attempt_number": latest_session.attempt_number,
                "created_at": latest_session.created_at,
                "status": latest_session.status,
                "is_verified": latest_session.is_verified,
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
        for log in coaching_payload["logs"][:20]
    ]

    summary = {
        "completed_categories": len(completed_categories),
        "ready_for_coaching": sum(
            1
            for item in completed_categories
            if item["training_state"]["code"] == "awaiting_coaching"
        ),
        "pending_acknowledgement": sum(
            1 for log in coaching_payload["published_logs"] if log.status == "sent"
        ),
        "acknowledged": sum(
            1 for log in coaching_payload["published_logs"] if log.status == "acknowledged"
        ),
        "competent": sum(
            1
            for log in coaching_payload["published_logs"]
            if normalize_competency_status(log.competency_status) == "competent"
        ),
        "not_competent": sum(
            1
            for log in coaching_payload["published_logs"]
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
        mcq_score >= settings.mcq_passing_threshold
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
        setattr(settings, field, value)
    settings.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "updated"}
