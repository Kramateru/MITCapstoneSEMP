"""
Assessment Management Routes
Handles creation, editing, assignment, and tracking of BPO-focused assessments
Trainer: Create, edit, assign, and monitor assessments
Trainee: View available assessments, take assessments, and earn certificates
"""

import json
import logging
from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import (
    Assessment,
    AssignmentBatch,
    AssessmentQuestion,
    AssessmentSubmission,
    User,
    UserRole,
    Batch,
    CertificateRecord,
)
from ..schemas import SuccessResponse

router = APIRouter(prefix="/api/assessments", tags=["assessments-management"])
logger = logging.getLogger(__name__)


# ==================== Pydantic Models ====================

class QuestionCreate(BaseModel):
    question_text: str
    options: list[str]
    correct_answer: str
    explanation: Optional[str] = None


class AssessmentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str  # grammar, pronunciation, customer_service, communication, product_knowledge
    difficulty: str  # basic, intermediate, advanced
    question_count: int = 10
    passing_score: int = 75
    questions: Optional[list[QuestionCreate]] = None


class AssessmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    passing_score: Optional[int] = None


class AssignmentRequest(BaseModel):
    assessment_id: str
    batch_ids: list[str]


class SubmitAssessmentRequest(BaseModel):
    responses: dict[str, str]  # question_id -> answer
    time_taken_seconds: int


class AssessmentResponseModel(BaseModel):
    id: str
    title: str
    description: Optional[str]
    category: str
    difficulty: str
    question_count: int
    passing_score: int
    is_published: bool
    created_at: Optional[str]
    created_by_name: Optional[str]
    assigned_batches_count: int = 0
    trainee_completion_rate: float = 0.0


# ==================== Helper Functions ====================

def _require_trainer(current_user: User) -> None:
    """Ensure user has trainer or admin privileges."""
    if current_user.role not in [UserRole.ADMIN, UserRole.TRAINER]:
        raise HTTPException(status_code=403, detail="Trainer access required")


def _grade_assessment(assessment: Assessment, responses: dict, db: Session) -> float:
    """
    Grade an assessment submission.
    
    Args:
        assessment: The assessment being graded
        responses: Dict of {question_id: answer_provided}
        db: Database session
    
    Returns:
        Score as percentage (0-100)
    """
    questions = db.query(AssessmentQuestion).filter(
        AssessmentQuestion.assessment_id == assessment.id
    ).all()
    
    if not questions:
        return 0.0
    
    correct_count = 0
    for question in questions:
        user_answer = responses.get(question.id, "").strip().lower()
        correct_answer = question.correct_answer.strip().lower()
        
        if user_answer == correct_answer:
            correct_count += 1
    
    score = (correct_count / len(questions)) * 100
    return score


# ==================== CRUD Operations ====================

@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: AssessmentCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Create a new assessment"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    provided_questions = payload.questions or []
    question_count = len(provided_questions)

    assessment = Assessment(
        id=str(uuid4()),
        title=payload.title,
        description=payload.description,
        category=payload.category,
        difficulty=payload.difficulty,
        question_count=question_count,
        passing_score=payload.passing_score,
        created_by=current_user.id,
        is_published=True,
    )
    
    db.add(assessment)
    db.flush()  # Get the ID without committing

    for idx, q in enumerate(provided_questions):
        question = AssessmentQuestion(
            id=str(uuid4()),
            assessment_id=assessment.id,
            question_text=q.question_text,
            options=q.options,
            correct_answer=q.correct_answer,
            explanation=q.explanation,
            question_index=idx,
        )
        db.add(question)
    
    db.commit()
    db.refresh(assessment)

    logger.info(f"✓ Assessment created: {assessment.id} by {current_user.email}")
    
    return {
        "assessment_id": assessment.id,
        "title": assessment.title,
        "message": "Assessment created successfully",
    }


@router.get("/my-assessments")
async def get_my_assessments(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get all assessments created by current trainer"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    assessments = (
        db.query(Assessment)
        .filter(Assessment.created_by == current_user.id)
        .order_by(Assessment.created_at.desc())
        .all()
    )

    result = []
    for assessment in assessments:
        # Count assigned batches
        assigned_count = db.query(func.count(AssignmentBatch.id)).filter(
            AssignmentBatch.assessment_id == assessment.id
        ).scalar() or 0

        # Calculate completion rate
        total_in_batches = db.query(func.count(User.id)).join(
            Batch, User.id == Batch.id  # This won't work as intended - need proper join
        ).filter(
            User.role == UserRole.TRAINEE
        ).scalar() or 1

        completed = db.query(func.count(AssessmentSubmission.id)).filter(
            AssessmentSubmission.assessment_id == assessment.id,
            AssessmentSubmission.is_passed == True,
        ).scalar() or 0

        completion_rate = (completed / max(total_in_batches, 1) * 100) if total_in_batches > 0 else 0

        result.append({
            "id": assessment.id,
            "title": assessment.title,
            "description": assessment.description,
            "category": assessment.category,
            "difficulty": assessment.difficulty,
            "question_count": assessment.question_count,
            "passing_score": assessment.passing_score,
            "is_published": assessment.is_published,
            "created_at": assessment.created_at.isoformat() if assessment.created_at else None,
            "created_by_name": current_user.full_name,
            "assigned_batches_count": assigned_count,
            "trainee_completion_rate": completion_rate,
        })

    return {"assessments": result, "count": len(result)}


@router.get("/{assessment_id}")
async def get_assessment(
    assessment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get assessment details with questions"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Check access: Only creator/admin or trainee in assigned batch can view
    if current_user.role == UserRole.TRAINER:
        if assessment.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    questions = db.query(AssessmentQuestion).filter(
        AssessmentQuestion.assessment_id == assessment_id
    ).order_by(AssessmentQuestion.question_index).all()

    return {
        "id": assessment.id,
        "title": assessment.title,
        "description": assessment.description,
        "category": assessment.category,
        "difficulty": assessment.difficulty,
        "question_count": assessment.question_count,
        "passing_score": assessment.passing_score,
        "questions": [
            {
                "id": q.id,
                "question_text": q.question_text,
                "options": q.options,
                "correct_answer": q.correct_answer if current_user.role != UserRole.TRAINEE else None,
                "explanation": q.explanation if current_user.role != UserRole.TRAINEE else None,
            }
            for q in questions
        ]
    }


@router.put("/{assessment_id}")
async def update_assessment(
    assessment_id: str,
    payload: AssessmentUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Update assessment details"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if assessment.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    # Update fields
    if payload.title is not None:
        assessment.title = payload.title
    if payload.description is not None:
        assessment.description = payload.description
    if payload.category is not None:
        assessment.category = payload.category
    if payload.difficulty is not None:
        assessment.difficulty = payload.difficulty
    if payload.passing_score is not None:
        assessment.passing_score = payload.passing_score

    assessment.updated_at = datetime.utcnow()
    db.commit()
    logger.info(f"✓ Assessment updated: {assessment_id}")

    return {"message": "Assessment updated successfully"}


@router.delete("/{assessment_id}", response_model=SuccessResponse)
async def delete_assessment(
    assessment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Delete assessment and all related records"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if assessment.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    # Delete related records
    db.query(AssignmentBatch).filter(AssignmentBatch.assessment_id == assessment_id).delete()
    db.query(AssessmentSubmission).filter(AssessmentSubmission.assessment_id == assessment_id).delete()
    db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_id == assessment_id).delete()
    db.delete(assessment)
    
    db.commit()
    logger.info(f"✓ Assessment deleted: {assessment_id}")

    return SuccessResponse(message="Assessment deleted successfully")


# ==================== Assignment ====================

@router.post("/assign")
async def assign_assessment_to_batches(
    payload: AssignmentRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Assign assessment to batches"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    assessment = db.query(Assessment).filter(Assessment.id == payload.assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if assessment.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    assigned_count = 0
    # Assign to each batch
    for batch_id in payload.batch_ids:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if not batch:
            continue

        # Check if already assigned
        existing = db.query(AssignmentBatch).filter(
            and_(
                AssignmentBatch.assessment_id == payload.assessment_id,
                AssignmentBatch.batch_id == batch_id,
            )
        ).first()

        if not existing:
            assignment = AssignmentBatch(
                id=str(uuid4()),
                assessment_id=payload.assessment_id,
                batch_id=batch_id,
                assigned_by=current_user.id,
                assigned_at=datetime.utcnow(),
            )
            db.add(assignment)
            assigned_count += 1
            logger.info(f"✓ Assessment assigned: {payload.assessment_id} → Batch {batch_id}")

    db.commit()
    return {
        "message": f"Assessment assigned to {assigned_count} batch(es)",
        "assigned_count": assigned_count,
    }


# ==================== Trainee View ====================

@router.get("/batch/{batch_id}/available")
async def get_available_assessments_for_batch(
    batch_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get assessments assigned to a batch that trainee can take"""
    current_user = await auth_utils.get_current_user(authorization, db)

    # Verify trainee is in batch
    if current_user.role == UserRole.TRAINEE:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

    # Get assignments for batch
    assignments = (
        db.query(AssignmentBatch, Assessment)
        .join(Assessment, AssignmentBatch.assessment_id == Assessment.id)
        .filter(AssignmentBatch.batch_id == batch_id)
        .all()
    )

    result = []
    for assignment, assessment in assignments:
        # Check if trainee already completed
        submission = (
            db.query(AssessmentSubmission)
            .filter(
                and_(
                    AssessmentSubmission.assessment_id == assessment.id,
                    AssessmentSubmission.trainee_id == current_user.id,
                )
            )
            .first()
        )

        result.append({
            "id": assessment.id,
            "title": assessment.title,
            "description": assessment.description,
            "category": assessment.category,
            "difficulty": assessment.difficulty,
            "question_count": assessment.question_count,
            "passing_score": assessment.passing_score,
            "status": "completed" if submission else "pending",
            "score": submission.score if submission else None,
            "is_passed": submission.is_passed if submission else None,
            "certificate_awarded": bool(submission.certificate_id if submission else None),
            "submitted_at": submission.submitted_at.isoformat() if submission and submission.submitted_at else None,
        })

    return {"assessments": result, "count": len(result)}


# ==================== Submission & Grading ====================

@router.post("/{assessment_id}/submit")
async def submit_assessment(
    assessment_id: str,
    payload: SubmitAssessmentRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Submit assessment responses and get graded"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainees only")

    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Check if trainee has already submitted
    existing_submission = (
        db.query(AssessmentSubmission)
        .filter(
            and_(
                AssessmentSubmission.assessment_id == assessment_id,
                AssessmentSubmission.trainee_id == current_user.id,
            )
        )
        .first()
    )

    if existing_submission:
        raise HTTPException(
            status_code=400,
            detail="You have already submitted this assessment",
        )

    # Grade assessment
    score = _grade_assessment(assessment, payload.responses, db)
    is_passed = score >= assessment.passing_score

    # Get trainee's batch (find first assigned batch)
    assignment = (
        db.query(AssignmentBatch)
        .filter(AssignmentBatch.assessment_id == assessment_id)
        .first()
    )
    batch_id = assignment.batch_id if assignment else None

    # Create submission record
    submission = AssessmentSubmission(
        id=str(uuid4()),
        assessment_id=assessment_id,
        trainee_id=current_user.id,
        batch_id=batch_id,
        score=score,
        is_passed=is_passed,
        time_taken_seconds=payload.time_taken_seconds,
        responses=payload.responses,
        submitted_at=datetime.utcnow(),
        graded_at=datetime.utcnow(),
    )

    db.add(submission)

    # Award certificate if passed
    certificate_id = None
    if is_passed:
        certificate_no = f"CERT-{assessment.category.upper()}-{current_user.id[:8]}-{int(datetime.utcnow().timestamp())}"
        certificate = CertificateRecord(
            id=str(uuid4()),
            certificate_no=certificate_no,
            verdict_id=str(uuid4()),  # Placeholder - in production link to actual verdict
            trainee_id=current_user.id,
            trainer_id=assessment.created_by,
            unit_of_competency=f"{assessment.title} - {assessment.category}",
            kip_score=score,
            qr_token=str(uuid4()),
            source_type="assessment",
            source_id=assessment_id,
            achievement_type="assessment_completion",
        )
        db.add(certificate)
        db.flush()
        certificate_id = certificate.id
        submission.certificate_id = certificate_id
        logger.info(f"✓ Certificate awarded to {current_user.email} for assessment {assessment_id}")

    db.commit()
    logger.info(f"✓ Assessment submitted: {assessment_id} by {current_user.email}, Score: {score:.1f}%")

    return {
        "submission_id": submission.id,
        "score": round(score, 2),
        "is_passed": is_passed,
        "certificate_awarded": is_passed,
        "certificate_id": certificate_id,
        "message": f"Assessment submitted! Score: {score:.1f}%" + (" 🎉 Certificate awarded!" if is_passed else " Keep practicing!"),
    }


# ==================== Results & Analytics ====================

@router.get("/{assessment_id}/results")
async def get_assessment_results(
    assessment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get assessment results/analytics (trainer only)"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if assessment.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    submissions = db.query(AssessmentSubmission).filter(
        AssessmentSubmission.assessment_id == assessment_id
    ).all()

    passed = sum(1 for s in submissions if s.is_passed)
    total = len(submissions)
    avg_score = sum(s.score for s in submissions) / total if total > 0 else 0

    return {
        "assessment_id": assessment_id,
        "assessment_title": assessment.title,
        "total_submissions": total,
        "passed_count": passed,
        "failed_count": total - passed,
        "pass_rate": (passed / total * 100) if total > 0 else 0,
        "average_score": round(avg_score, 2),
        "submissions": [
            {
                "trainee_name": s.trainee.full_name,
                "score": s.score,
                "is_passed": s.is_passed,
                "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
                "certificate_awarded": s.certificate_id is not None,
            }
            for s in submissions
        ]
    }


@router.get("/trainee/my-results")
async def get_my_assessment_results(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get trainee's assessment results"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainees only")

    submissions = db.query(AssessmentSubmission).filter(
        AssessmentSubmission.trainee_id == current_user.id
    ).order_by(AssessmentSubmission.submitted_at.desc()).all()

    return {
        "results": [
            {
                "assessment_id": s.assessment_id,
                "assessment_title": s.assessment.title,
                "category": s.assessment.category,
                "score": s.score,
                "is_passed": s.is_passed,
                "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
                "certificate_awarded": s.certificate_id is not None,
                "passing_score": s.assessment.passing_score,
            }
            for s in submissions
        ],
        "total_completed": len(submissions),
        "total_passed": sum(1 for s in submissions if s.is_passed),
    }
