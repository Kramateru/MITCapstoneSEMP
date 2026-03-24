"""
Integrated routes for MCQ assessments, coaching logs, competency verdicts, and certificates.
"""

import secrets
from datetime import datetime, timedelta
from io import BytesIO
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
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
from ..services.certificate_service import generate_certificate_pdf

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
    creator_lookup = {}
    if creator_ids:
        creator_lookup = {
            user.id: user
            for user in db.query(User).filter(User.id.in_(creator_ids)).all()
        }

    return [
        {
            "id": question.id,
            "category_id": question.category_id,
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


def _ensure_settings(db: Session) -> CertificationSettings:
    settings = db.query(CertificationSettings).first()
    if not settings:
        settings = CertificationSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _generate_coaching_id(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"COACH-{year}-"
    count = db.query(CoachingLog).filter(CoachingLog.coaching_id.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:04d}"


# ------------------------- MCQ Category and Question Bank -------------------------


class MCQCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    difficulty: str = "basic"
    lob: Optional[str] = None
    passing_threshold: float = 90.0
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
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER])
    normalized_name = payload.name.strip()
    existing = (
        db.query(MCQCategory)
        .filter(
            func.lower(MCQCategory.name) == normalized_name.lower(),
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
        passing_threshold=payload.passing_threshold,
        is_global=payload.is_global,
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
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER, UserRole.TRAINEE])
    categories = (
        db.query(MCQCategory)
        .filter(MCQCategory.is_active == True)
        .order_by(MCQCategory.created_at.desc(), MCQCategory.name.asc())
        .all()
    )
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
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER])
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
    if "is_global" in update_data and payload.is_global is not None:
        category.is_global = payload.is_global

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
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER])
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
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER])
    if payload.correct_option.upper() not in {"A", "B", "C", "D"}:
        raise HTTPException(status_code=400, detail="correct_option must be A/B/C/D")
    category = (
        db.query(MCQCategory)
        .filter(MCQCategory.id == payload.category_id, MCQCategory.is_active == True)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="MCQ category not found")
    if current_user.role != UserRole.ADMIN and not _can_manage_mcq_resource(
        current_user, category.created_by
    ):
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


@router.get("/mcq/questions/{category_id}")
async def list_mcq_questions(
    category_id: str,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER])
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
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER])
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
        if current_user.role != UserRole.ADMIN and not _can_manage_mcq_resource(
            current_user, category.created_by
        ):
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
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER])
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
    title: str
    description: Optional[str] = None
    category_id: str
    question_ids: List[str]
    assigned_user_id: Optional[str] = None
    assigned_batch_id: Optional[str] = None
    due_date: Optional[datetime] = None


@router.post("/mcq/assign")
async def assign_mcq_assessment(
    payload: MCQAssignPayload,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER])
    if not payload.assigned_user_id and not payload.assigned_batch_id:
        raise HTTPException(status_code=400, detail="Provide assigned_user_id or assigned_batch_id")
    if payload.assigned_batch_id:
        batch = db.query(Batch).filter(Batch.id == payload.assigned_batch_id).first()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
    assessment = MCQAssessment(
        title=payload.title,
        description=payload.description,
        category_id=payload.category_id,
        question_ids=payload.question_ids,
        assigned_by=current_user.id,
        assigned_user_id=payload.assigned_user_id,
        assigned_batch_id=payload.assigned_batch_id,
        due_date=payload.due_date,
    )
    db.add(assessment)
    db.commit()
    return {"status": "assigned", "assessment_id": assessment.id}


@router.get("/mcq/my-assessments")
async def list_my_mcq_assessments(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINEE])
    batch_ids = [b.id for b in current_user.batches]
    assessments = db.query(MCQAssessment).filter(
        MCQAssessment.is_active == True,
        (MCQAssessment.assigned_user_id == current_user.id)
        | (MCQAssessment.assigned_batch_id.in_(batch_ids)),
    ).all()
    return {
        "count": len(assessments),
        "assessments": [
            {
                "id": a.id,
                "title": a.title,
                "description": a.description,
                "category_id": a.category_id,
                "question_ids": a.question_ids,
                "due_date": a.due_date,
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
    if existing:
        existing.answers = payload.answers
        existing.score_percentage = score
        existing.is_passed = is_passed
        existing.submitted_at = datetime.utcnow()
    else:
        submission = MCQSubmission(
            assessment_id=assessment_id,
            trainee_id=current_user.id,
            answers=payload.answers,
            score_percentage=score,
            is_passed=is_passed,
        )
        db.add(submission)
    db.commit()
    return {"score_percentage": score, "is_passed": is_passed, "review": review}


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
    coaching_id = _generate_coaching_id(db)
    log = CoachingLog(
        coaching_id=coaching_id,
        practice_session_id=payload.practice_session_id,
        trainer_id=current_user.id,
        trainee_id=payload.trainee_id,
        batch_name=(trainee.batches[0].name if trainee.batches else None),
        lob=trainee.lob,
        coaching_minutes=payload.coaching_minutes,
        strengths=payload.strengths,
        opportunities=payload.opportunities,
        action_plan=payload.action_plan,
        target_date=payload.target_date,
        trainer_remarks=payload.trainer_remarks,
        status=payload.status if payload.status in {"draft", "sent"} else "draft",
    )
    db.add(log)
    db.commit()
    return {"status": "created", "coaching_log_id": log.id, "coaching_id": log.coaching_id}


@router.get("/coaching/logs")
async def list_coaching_logs(
    trainee_id: Optional[str] = None,
    coaching_id: Optional[str] = None,
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.TRAINER, UserRole.ADMIN, UserRole.TRAINEE])
    query = db.query(CoachingLog)
    if current_user.role == UserRole.TRAINEE:
        query = query.filter(CoachingLog.trainee_id == current_user.id)
    if trainee_id:
        query = query.filter(CoachingLog.trainee_id == trainee_id)
    if coaching_id:
        query = query.filter(CoachingLog.coaching_id == coaching_id)
    logs = query.order_by(CoachingLog.created_at.desc()).all()
    return {
        "count": len(logs),
        "logs": [
            {
                "id": l.id,
                "coaching_id": l.coaching_id,
                "trainee_id": l.trainee_id,
                "trainer_id": l.trainer_id,
                "status": l.status,
                "strengths": l.strengths,
                "opportunities": l.opportunities,
                "action_plan": l.action_plan,
                "target_date": l.target_date,
                "acknowledged_at": l.acknowledged_at,
                "created_at": l.created_at,
            }
            for l in logs
        ],
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
    total = db.query(CoachingLog).count()
    acknowledged = db.query(CoachingLog).filter(CoachingLog.status == "acknowledged").count()
    pending = total - acknowledged
    return {
        "total_logs": total,
        "acknowledged_logs": acknowledged,
        "pending_logs": pending,
        "acknowledgment_rate": round((acknowledged / total) * 100, 2) if total else 0,
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
    db.commit()
    return {
        "status": "created",
        "verdict_id": verdict.id,
        "is_competent": verdict.is_competent,
        "asr_score": asr_score,
        "mcq_score": mcq_score,
        "threshold_met": threshold_ok,
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
    return {
        "id": verdict.id,
        "is_competent": verdict.is_competent,
        "remarks": verdict.remarks,
        "asr_score": verdict.asr_score,
        "mcq_score": verdict.mcq_score,
        "decided_at": verdict.decided_at,
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

    existing = db.query(CertificateRecord).filter(CertificateRecord.verdict_id == verdict.id).first()
    if existing:
        return {"status": "exists", "certificate_no": existing.certificate_no, "token": existing.qr_token}

    settings = _ensure_settings(db)
    certificate_no = f"CL-{datetime.utcnow().year}-{secrets.randbelow(9999):04d}"
    qr_token = secrets.token_urlsafe(18)
    cert = CertificateRecord(
        certificate_no=certificate_no,
        verdict_id=verdict.id,
        trainee_id=verdict.trainee_id,
        trainer_id=verdict.trainer_id,
        unit_of_competency=settings.unit_of_competency,
        kip_score=round((verdict.asr_score + verdict.mcq_score) / 2, 2),
        qr_token=qr_token,
    )
    db.add(cert)
    db.commit()
    return {"status": "issued", "certificate_id": cert.id, "certificate_no": cert.certificate_no, "token": cert.qr_token}


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
    trainer = db.query(User).filter(User.id == cert.trainer_id).first()
    verdict = db.query(CompetencyVerdict).filter(CompetencyVerdict.id == cert.verdict_id).first()
    settings = _ensure_settings(db)
    verification_url = f"/api/certification/verify/{cert.qr_token}"

    pdf_bytes = generate_certificate_pdf(
        trainee_name=trainee.full_name if trainee else "Trainee",
        trainer_name=trainer.full_name if trainer else "Trainer",
        assessment_date=verdict.decided_at if verdict else cert.issued_at,
        unit_of_competency=cert.unit_of_competency,
        certificate_no=cert.certificate_no,
        verification_url=verification_url,
        institution_name=settings.institution_name,
        registrar_name=settings.registrar_name,
        kip_score=cert.kip_score,
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
    return {
        "valid": True,
        "certificate_no": cert.certificate_no,
        "trainee_name": trainee.full_name if trainee else None,
        "trainer_name": trainer.full_name if trainer else None,
        "unit_of_competency": cert.unit_of_competency,
        "issued_at": cert.issued_at,
        "kip_score": cert.kip_score,
    }


# ------------------------- Settings -------------------------


class CertificationSettingsPayload(BaseModel):
    asr_passing_threshold: Optional[float] = None
    mcq_passing_threshold: Optional[float] = None
    manager_signature_url: Optional[str] = None
    logo_url: Optional[str] = None
    dry_seal_url: Optional[str] = None
    registrar_name: Optional[str] = None
    unit_of_competency: Optional[str] = None
    institution_name: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    contact_email: Optional[str] = None


@router.get("/settings")
async def get_certification_settings(
    current_user: Any = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_role(current_user, [UserRole.ADMIN, UserRole.TRAINER, UserRole.TRAINEE])
    settings = _ensure_settings(db)
    return {
        "institution_name": settings.institution_name,
        "address": settings.address,
        "contact_number": settings.contact_number,
        "contact_email": settings.contact_email,
        "logo_url": settings.logo_url,
        "dry_seal_url": settings.dry_seal_url,
        "manager_signature_url": settings.manager_signature_url,
        "registrar_name": settings.registrar_name,
        "asr_passing_threshold": settings.asr_passing_threshold,
        "mcq_passing_threshold": settings.mcq_passing_threshold,
        "unit_of_competency": settings.unit_of_competency,
    }


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
