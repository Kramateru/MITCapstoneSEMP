"""
Admin Portal Routes
Handles assessment categories, KPI configuration, and user management
"""

import csv
import io
import os
from datetime import datetime, timedelta
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, selectinload

from .. import auth_utils
from ..database import get_db
from ..default_credentials import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    DEFAULT_TRAINEE_PASSWORD,
    TRAINEE_EMAIL,
    TRAINEE_PASSWORD,
    TRAINER_EMAIL,
    TRAINER_PASSWORD,
)
from ..models import (
    AssessmentCategory,
    Batch,
    CertificationSettings,
    CertificateRecord,
    CompetencyVerdict,
    Course,
    CourseAssignment,
    FeedbackType,
    KPIConfiguration,
    LineOfBusiness,
    MCQAssessment,
    MCQCategory,
    MCQQuestion,
    MCQSubmission,
    MicrolearningAssignment,
    MicrolearningModule,
    PracticeSession,
    Scenario,
    ScenarioDifficulty,
    ScenarioFlow,
    ScenarioPurpose,
    SystemLog,
    User,
    UserRole,
    batch_user_association,
)
from ..services.microlearning import (
    ensure_module_exercises,
    refresh_assignment_progress,
    serialize_assignment_summary,
)
from ..services.admin_learning_analytics import build_admin_learning_insights
from ..services.lob_catalog import (
    list_active_lobs,
    rename_lob_references,
    serialize_lobs,
    sync_default_lob_catalog,
)
from ..services.supabase_auth_service import SupabaseUserSyncError, sync_user_to_supabase_auth
from ..services.pdf_generator import PerformanceReportGenerator
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/api/admin", tags=["admin"])
DEFAULT_ADMIN_PASSWORD = ADMIN_PASSWORD
DEFAULT_TRAINER_PASSWORD = TRAINER_PASSWORD
ALL_LOB_ACCESS_LABEL = "All LOBs"
MIN_FULL_NAME_LENGTH = 2
MAX_FULL_NAME_LENGTH = 100
ADMIN_USER_SORT_COLUMNS = {
    "name": User.full_name,
    "email": User.email,
    "role": User.role,
    "created_at": User.created_at,
    "last_login": User.last_login,
    "status": User.is_active,
}


# ==================== Pydantic Models ====================


class AssessmentCategoryCreate(BaseModel):
    name: str
    category_type: FeedbackType
    description: Optional[str] = None
    min_score: float = 0.0
    max_score: float = 100.0
    passing_threshold: float = 70.0
    scoring_rules: Optional[dict] = None
    weight: float = 1.0


class AssessmentCategoryUpdate(BaseModel):
    name: Optional[str] = None
    category_type: Optional[FeedbackType] = None
    description: Optional[str] = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None
    passing_threshold: Optional[float] = None
    scoring_rules: Optional[dict] = None
    weight: Optional[float] = None


class KPIConfigUpdate(BaseModel):
    accuracy_weight: Optional[float] = None
    fluency_weight: Optional[float] = None
    clarity_weight: Optional[float] = None
    keyword_adherence_weight: Optional[float] = None
    soft_skills_weight: Optional[float] = None
    npl_confidence_threshold: Optional[float] = None
    background_noise_sensitivity: Optional[str] = None
    min_response_duration: Optional[int] = None
    max_response_duration: Optional[int] = None
    passing_score: Optional[float] = None


class UserCreate(BaseModel):
    email: str
    full_name: str
    role: UserRole
    password: Optional[str] = None
    lob: Optional[str] = None
    department: Optional[str] = None
    language_dialect: str = "en-US"


class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    department: Optional[str] = None
    language_dialect: Optional[str] = None


class LineOfBusinessCreate(BaseModel):
    name: str
    description: Optional[str] = None


class LineOfBusinessUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


# ==================== Helper Functions ====================


def verify_admin(
    current_user: User = Depends(auth_utils.get_current_user),
) -> User:
    # Dependency used only for authorization checks; response_model isn't generated
    """Verify that current user is admin"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def log_admin_action(
    db: Session,
    admin_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    changes: dict = None,
):
    """Log admin action for audit trail"""
    log = SystemLog(
        admin_id=admin_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes,
    )
    db.add(log)
    db.commit()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _validate_password_or_raise(password: Optional[str], *, field_name: str = "Password") -> str:
    try:
        return auth_utils.validate_password_length(password, field_name=field_name)
    except auth_utils.PasswordValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _validate_full_name_or_raise(value: Optional[str]) -> str:
    full_name = (value or "").strip()
    if len(full_name) < MIN_FULL_NAME_LENGTH:
        raise HTTPException(status_code=400, detail="Full name must be at least 2 characters.")
    if len(full_name) > MAX_FULL_NAME_LENGTH:
        raise HTTPException(status_code=400, detail="Full name must be 100 characters or fewer.")
    return full_name


def _serialize_admin_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value if isinstance(user.role, UserRole) else str(user.role),
        "lob": user.lob,
        "department": user.department,
        "language_dialect": user.language_dialect,
        "profile_image_url": user.profile_image_url,
        "is_active": bool(user.is_active),
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "last_login": user.last_login,
    }


def _ensure_user(
    db: Session,
    *,
    email: str,
    full_name: str,
    role: UserRole,
    password: str,
    lob: Optional[str] = None,
    department: Optional[str] = None,
    language_dialect: str = "en-US",
):
    password = auth_utils.validate_password_length(password)
    user = db.query(User).filter(func.lower(User.email) == _normalize_email(email)).first()
    created = user is None

    if not user:
        user = User(
            email=_normalize_email(email),
            full_name=full_name,
            password_hash=auth_utils.hash_password(password),
            role=role,
        )
        db.add(user)

    user.email = _normalize_email(email)
    user.full_name = full_name
    user.role = role
    user.lob = lob
    user.department = department
    user.language_dialect = language_dialect
    user.is_active = True

    try:
        password_ok = auth_utils.verify_password(password, user.password_hash)
    except Exception:
        password_ok = False

    if not password_ok:
        user.password_hash = auth_utils.hash_password(password)

    db.flush()
    return user, created


def _ensure_lob(db: Session, *, name: str, description: Optional[str]):
    lob = db.query(LineOfBusiness).filter(func.lower(LineOfBusiness.name) == name.lower()).first()
    created = lob is None

    if not lob:
        lob = LineOfBusiness(name=name, description=description)
        db.add(lob)
    else:
        lob.description = description
        lob.is_active = True

    db.flush()
    return lob, created


def _ensure_assessment_category(
    db: Session,
    *,
    name: str,
    category_type: FeedbackType,
    description: str,
    weight: float,
    created_by: str,
):
    category = (
        db.query(AssessmentCategory)
        .filter(func.lower(AssessmentCategory.name) == name.lower())
        .first()
    )
    created = category is None

    if not category:
        category = AssessmentCategory(
            name=name,
            category_type=category_type,
            description=description,
            weight=weight,
            created_by=created_by,
        )
        db.add(category)
    else:
        category.category_type = category_type
        category.description = description
        category.weight = weight
        category.is_active = True

    db.flush()
    return category, created


def _serialize_assessment_category(category: AssessmentCategory) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "category_type": category.category_type,
        "description": category.description,
        "min_score": category.min_score,
        "max_score": category.max_score,
        "passing_threshold": category.passing_threshold,
        "scoring_rules": category.scoring_rules,
        "weight": category.weight,
        "is_active": category.is_active,
        "created_by": category.created_by,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
    }


def _format_system_log_action(action: Optional[str]) -> str:
    normalized = (action or "").replace("_", " ").strip()
    return normalized.title() if normalized else "Updated Record"


def _ensure_scenario(
    db: Session,
    *,
    created_by: str,
    title: str,
    description: str,
    purpose: ScenarioPurpose,
    difficulty: ScenarioDifficulty,
    lob: Optional[str],
    opening_prompt: str,
    expected_keywords: List[str],
    estimated_duration: int,
    flow_steps: List[dict],
    reset_steps: bool,
):
    scenario = db.query(Scenario).filter(func.lower(Scenario.title) == title.lower()).first()
    created = scenario is None

    if not scenario:
        scenario = Scenario(
            title=title,
            description=description,
            purpose=purpose,
            difficulty=difficulty,
            lob=lob,
            opening_prompt=opening_prompt,
            expected_keywords=expected_keywords,
            estimated_duration=estimated_duration,
            created_by=created_by,
            is_draft=False,
            is_published=True,
        )
        db.add(scenario)
        db.flush()
    else:
        scenario.description = description
        scenario.purpose = purpose
        scenario.difficulty = difficulty
        scenario.lob = lob
        scenario.opening_prompt = opening_prompt
        scenario.expected_keywords = expected_keywords
        scenario.estimated_duration = estimated_duration
        scenario.is_draft = False
        scenario.is_published = True

    if created or reset_steps or not scenario.flow_steps:
        scenario.flow_steps.clear()
        db.flush()
        for step in flow_steps:
            db.add(ScenarioFlow(scenario_id=scenario.id, **step))

    db.flush()
    return scenario, created


def _ensure_batch(
    db: Session,
    *,
    name: str,
    description: str,
    wave_number: int,
    lob: str,
    created_by: str,
):
    batch = (
        db.query(Batch)
        .filter(Batch.name == name, Batch.created_by == created_by)
        .first()
    )
    created = batch is None

    if not batch:
        batch = Batch(
            name=name,
            description=description,
            wave_number=wave_number,
            lob=lob,
            created_by=created_by,
        )
        db.add(batch)
    else:
        batch.description = description
        batch.wave_number = wave_number
        batch.lob = lob

    db.flush()
    return batch, created


def _ensure_course(
    db: Session,
    *,
    name: str,
    description: str,
    duration_minutes: int,
    difficulty: ScenarioDifficulty,
    lob: str,
    scenario_ids: List[str],
    created_by: str,
):
    course = (
        db.query(Course)
        .filter(Course.name == name, Course.created_by == created_by)
        .first()
    )
    created = course is None

    if not course:
        course = Course(
            name=name,
            description=description,
            duration_minutes=duration_minutes,
            difficulty=difficulty,
            lob=lob,
            scenario_ids=scenario_ids,
            created_by=created_by,
            is_published=True,
        )
        db.add(course)
    else:
        course.description = description
        course.duration_minutes = duration_minutes
        course.difficulty = difficulty
        course.lob = lob
        course.scenario_ids = scenario_ids
        course.is_published = True

    db.flush()
    return course, created


def _ensure_course_assignment(
    db: Session,
    *,
    course_id: str,
    batch_id: Optional[str],
    user_id: Optional[str],
    assigned_by: str,
):
    assignment = (
        db.query(CourseAssignment)
        .filter(
            CourseAssignment.course_id == course_id,
            CourseAssignment.batch_id == batch_id,
            CourseAssignment.user_id == user_id,
        )
        .first()
    )
    created = assignment is None

    if not assignment:
        assignment = CourseAssignment(
            course_id=course_id,
            batch_id=batch_id,
            user_id=user_id,
            assigned_by=assigned_by,
            is_mandatory=True,
        )
        db.add(assignment)

    db.flush()
    return assignment, created


def _ensure_practice_session(
    db: Session,
    *,
    user_id: str,
    scenario_id: str,
    transcription: str,
    overall_score: float,
    accuracy_score: float,
    fluency_score: float,
    clarity_score: float,
    keyword_adherence_score: float,
    soft_skills_score: float,
    response_duration: int,
    filler_words: List[str],
    keyword_hits: List[str],
    attempt_number: int = 1,
    created_at: Optional[datetime] = None,
    transcription_confidence: float = 0.94,
    dead_air_time: int = 2,
    volume_level: float = 0.81,
):
    session = (
        db.query(PracticeSession)
        .filter(
            PracticeSession.user_id == user_id,
            PracticeSession.scenario_id == scenario_id,
            PracticeSession.transcription == transcription,
        )
        .first()
    )
    created = session is None

    if not session:
        session = PracticeSession(
            user_id=user_id,
            scenario_id=scenario_id,
            transcription=transcription,
            attempt_number=attempt_number,
        )
        db.add(session)

    session.attempt_number = attempt_number
    if created_at is not None:
        session.created_at = created_at
        session.updated_at = created_at
    session.transcription_confidence = transcription_confidence
    session.accuracy_score = accuracy_score
    session.fluency_score = fluency_score
    session.clarity_score = clarity_score
    session.keyword_adherence_score = keyword_adherence_score
    session.soft_skills_score = soft_skills_score
    session.overall_score = overall_score
    session.response_duration = response_duration
    session.dead_air_time = dead_air_time
    session.volume_level = volume_level
    session.filler_words_detected = filler_words
    session.word_feedback = [
        {"word": word, "score": 92, "error_type": "None", "color": "green"}
        for word in keyword_hits
    ]
    session.assessment_data = {
        "summary": "Seeded sample assessment result",
        "keyword_hits": keyword_hits,
        "coaching_focus": ["empathy", "verification", "clear next steps"],
    }
    session.status = "completed"
    session.is_verified = True

    db.flush()
    return session, created


def _ensure_competency_verdict(
    db: Session,
    *,
    trainee_id: str,
    trainer_id: str,
    practice_session_id: Optional[str],
    mcq_assessment_id: Optional[str],
    asr_score: float,
    mcq_score: float,
    remarks: str,
    is_competent: bool,
    decided_at: datetime,
):
    verdict = (
        db.query(CompetencyVerdict)
        .filter(
            CompetencyVerdict.trainee_id == trainee_id,
            CompetencyVerdict.practice_session_id == practice_session_id,
            CompetencyVerdict.mcq_assessment_id == mcq_assessment_id,
        )
        .first()
    )
    created = verdict is None

    if not verdict:
        verdict = CompetencyVerdict(
            trainee_id=trainee_id,
            trainer_id=trainer_id,
            practice_session_id=practice_session_id,
            mcq_assessment_id=mcq_assessment_id,
        )
        db.add(verdict)

    verdict.asr_score = asr_score
    verdict.mcq_score = mcq_score
    verdict.remarks = remarks
    verdict.is_competent = is_competent
    verdict.decided_at = decided_at

    db.flush()
    return verdict, created


def _ensure_certificate_record(
    db: Session,
    *,
    verdict_id: str,
    trainee_id: str,
    trainer_id: str,
    unit_of_competency: str,
    kip_score: float,
    certificate_no: str,
    qr_token: str,
):
    certificate = (
        db.query(CertificateRecord)
        .filter(
            or_(
                CertificateRecord.verdict_id == verdict_id,
                CertificateRecord.certificate_no == certificate_no,
                CertificateRecord.qr_token == qr_token,
            )
        )
        .first()
    )
    created = certificate is None

    if not certificate:
        certificate = CertificateRecord(
            verdict_id=verdict_id,
            trainee_id=trainee_id,
            trainer_id=trainer_id,
            certificate_no=certificate_no,
            qr_token=qr_token,
            unit_of_competency=unit_of_competency,
            source_type="competency_verdict",
            source_id=verdict_id,
            achievement_type="competency",
            template_snapshot={},
        )
        db.add(certificate)

    certificate.kip_score = kip_score
    certificate.unit_of_competency = unit_of_competency
    certificate.source_type = "competency_verdict"
    certificate.source_id = verdict_id
    certificate.achievement_type = "competency"

    db.flush()
    return certificate, created


def _ensure_mcq_category(
    db: Session,
    *,
    name: str,
    description: str,
    difficulty: ScenarioDifficulty,
    lob: str,
    created_by: str,
):
    category = db.query(MCQCategory).filter(func.lower(MCQCategory.name) == name.lower()).first()
    created = category is None

    if not category:
        category = MCQCategory(
            name=name,
            description=description,
            difficulty=difficulty,
            lob=lob,
            is_global=True,
            created_by=created_by,
        )
        db.add(category)
    else:
        category.description = description
        category.difficulty = difficulty
        category.lob = lob
        category.is_active = True

    db.flush()
    return category, created


def _ensure_mcq_question(
    db: Session,
    *,
    category_id: str,
    question_text: str,
    option_a: str,
    option_b: str,
    option_c: str,
    option_d: str,
    correct_option: str,
    explanation: str,
    created_by: str,
):
    question = (
        db.query(MCQQuestion)
        .filter(
            MCQQuestion.category_id == category_id,
            func.lower(MCQQuestion.question_text) == question_text.lower(),
        )
        .first()
    )
    created = question is None

    if not question:
        question = MCQQuestion(
            category_id=category_id,
            question_text=question_text,
            option_a=option_a,
            option_b=option_b,
            option_c=option_c,
            option_d=option_d,
            correct_option=correct_option,
            explanation=explanation,
            created_by=created_by,
        )
        db.add(question)
    else:
        question.option_a = option_a
        question.option_b = option_b
        question.option_c = option_c
        question.option_d = option_d
        question.correct_option = correct_option
        question.explanation = explanation
        question.is_active = True

    db.flush()
    return question, created


def _ensure_mcq_assessment(
    db: Session,
    *,
    title: str,
    description: str,
    category_id: str,
    question_ids: List[str],
    assigned_by: str,
    assigned_batch_id: Optional[str],
):
    assessment = (
        db.query(MCQAssessment)
        .filter(
            func.lower(MCQAssessment.title) == title.lower(),
            MCQAssessment.assigned_batch_id == assigned_batch_id,
        )
        .first()
    )
    created = assessment is None

    if not assessment:
        assessment = MCQAssessment(
            title=title,
            description=description,
            category_id=category_id,
            question_ids=question_ids,
            assigned_by=assigned_by,
            assigned_batch_id=assigned_batch_id,
        )
        db.add(assessment)
    else:
        assessment.description = description
        assessment.category_id = category_id
        assessment.question_ids = question_ids
        assessment.is_active = True

    db.flush()
    return assessment, created


def _ensure_mcq_submission(
    db: Session,
    *,
    assessment_id: str,
    trainee_id: str,
    answers: dict,
    score_percentage: float,
    is_passed: bool,
):
    submission = (
        db.query(MCQSubmission)
        .filter(
            MCQSubmission.assessment_id == assessment_id,
            MCQSubmission.trainee_id == trainee_id,
        )
        .first()
    )
    created = submission is None

    if not submission:
        submission = MCQSubmission(
            assessment_id=assessment_id,
            trainee_id=trainee_id,
            answers=answers,
            score_percentage=score_percentage,
            is_passed=is_passed,
        )
        db.add(submission)
    else:
        submission.answers = answers
        submission.score_percentage = score_percentage
        submission.is_passed = is_passed

    db.flush()
    return submission, created

# ==================== Assessment Category Management ====================


@router.post("/assessment-categories", response_model=dict)
async def create_assessment_category(
    category: AssessmentCategoryCreate,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Create a new assessment category"""
    new_category = AssessmentCategory(
        name=category.name,
        category_type=category.category_type,
        description=category.description,
        min_score=category.min_score,
        max_score=category.max_score,
        passing_threshold=category.passing_threshold,
        scoring_rules=category.scoring_rules,
        weight=category.weight,
        created_by=current_user.id,
    )

    db.add(new_category)
    db.commit()

    log_admin_action(
        db,
        current_user.id,
        "created_assessment_category",
        "AssessmentCategory",
        new_category.id,
        {"name": category.name},
    )

    return {
        "id": new_category.id,
        "name": new_category.name,
        "category_type": new_category.category_type,
        "category": _serialize_assessment_category(new_category),
        "status": "created",
    }


@router.get("/assessment-categories")
async def list_assessment_categories(
    current_user: Any = Depends(verify_admin), db: Session = Depends(get_db)
):
    """List all assessment categories"""
    categories = (
        db.query(AssessmentCategory).filter(AssessmentCategory.is_active == True).all()
    )

    return {
        "count": len(categories),
        "categories": [_serialize_assessment_category(category) for category in categories],
    }


@router.put("/assessment-categories/{category_id}")
async def update_assessment_category(
    category_id: str,
    category_update: AssessmentCategoryUpdate,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Update an assessment category"""
    category = (
        db.query(AssessmentCategory)
        .filter(
            AssessmentCategory.id == category_id,
            AssessmentCategory.is_active == True,
        )
        .first()
    )

    if not category:
        raise HTTPException(status_code=404, detail="Assessment category not found")

    changes = {}
    update_data = category_update.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        previous_value = getattr(category, field)
        if previous_value != value:
            setattr(category, field, value)
            changes[field] = {"old": previous_value, "new": value}

    if not changes:
        return {"status": "unchanged", "category": _serialize_assessment_category(category)}

    category.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(category)

    log_admin_action(
        db,
        current_user.id,
        "updated_assessment_category",
        "AssessmentCategory",
        category.id,
        changes,
    )

    return {"status": "updated", "category": _serialize_assessment_category(category)}


@router.delete("/assessment-categories/{category_id}")
async def delete_assessment_category(
    category_id: str,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Deactivate an assessment category"""
    category = (
        db.query(AssessmentCategory)
        .filter(
            AssessmentCategory.id == category_id,
            AssessmentCategory.is_active == True,
        )
        .first()
    )

    if not category:
        raise HTTPException(status_code=404, detail="Assessment category not found")

    category.is_active = False
    category.updated_at = datetime.utcnow()
    db.commit()

    log_admin_action(
        db,
        current_user.id,
        "deleted_assessment_category",
        "AssessmentCategory",
        category.id,
        {"name": category.name},
    )

    return {"status": "deleted", "category_id": category.id}

# ==================== KPI Configuration ====================


@router.get("/kpi-config")
async def get_kpi_config(
    current_user: Any = Depends(verify_admin), db: Session = Depends(get_db)
):
    """Get current KPI configuration"""
    config = db.query(KPIConfiguration).first()

    if not config:
        # Create default config if doesn't exist
        config = KPIConfiguration()
        db.add(config)
        db.commit()

    return {
        "id": config.id,
        "accuracy_weight": config.accuracy_weight,
        "fluency_weight": config.fluency_weight,
        "clarity_weight": config.clarity_weight,
        "keyword_adherence_weight": config.keyword_adherence_weight,
        "soft_skills_weight": config.soft_skills_weight,
        "npl_confidence_threshold": config.npl_confidence_threshold,
        "background_noise_sensitivity": config.background_noise_sensitivity,
        "min_response_duration": config.min_response_duration,
        "max_response_duration": config.max_response_duration,
        "passing_score": config.passing_score,
    }


@router.put("/kpi-config")
async def update_kpi_config(
    config_update: KPIConfigUpdate,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Update KPI configuration (The "Brain")"""
    config = db.query(KPIConfiguration).first()

    if not config:
        config = KPIConfiguration()
        db.add(config)

    changes = {}

    # Update weights
    if config_update.accuracy_weight is not None:
        changes["accuracy_weight"] = {
            "old": config.accuracy_weight,
            "new": config_update.accuracy_weight,
        }
        config.accuracy_weight = config_update.accuracy_weight

    if config_update.fluency_weight is not None:
        changes["fluency_weight"] = {
            "old": config.fluency_weight,
            "new": config_update.fluency_weight,
        }
        config.fluency_weight = config_update.fluency_weight

    if config_update.clarity_weight is not None:
        changes["clarity_weight"] = {
            "old": config.clarity_weight,
            "new": config_update.clarity_weight,
        }
        config.clarity_weight = config_update.clarity_weight

    if config_update.keyword_adherence_weight is not None:
        changes["keyword_adherence_weight"] = {
            "old": config.keyword_adherence_weight,
            "new": config_update.keyword_adherence_weight,
        }
        config.keyword_adherence_weight = config_update.keyword_adherence_weight

    if config_update.soft_skills_weight is not None:
        changes["soft_skills_weight"] = {
            "old": config.soft_skills_weight,
            "new": config_update.soft_skills_weight,
        }
        config.soft_skills_weight = config_update.soft_skills_weight

    # Update ASR settings
    if config_update.npl_confidence_threshold is not None:
        changes["npl_confidence_threshold"] = {
            "old": config.npl_confidence_threshold,
            "new": config_update.npl_confidence_threshold,
        }
        config.npl_confidence_threshold = config_update.npl_confidence_threshold

    if config_update.background_noise_sensitivity is not None:
        changes["background_noise_sensitivity"] = {
            "old": config.background_noise_sensitivity,
            "new": config_update.background_noise_sensitivity,
        }
        config.background_noise_sensitivity = config_update.background_noise_sensitivity

    if config_update.min_response_duration is not None:
        config.min_response_duration = config_update.min_response_duration

    if config_update.max_response_duration is not None:
        config.max_response_duration = config_update.max_response_duration

    if config_update.passing_score is not None:
        changes["passing_score"] = {
            "old": config.passing_score,
            "new": config_update.passing_score,
        }
        config.passing_score = config_update.passing_score

    config.updated_at = datetime.utcnow()
    db.commit()

    log_admin_action(
        db,
        current_user.id,
        "updated_kpi_config",
        "KPIConfiguration",
        config.id,
        changes,
    )

    return {"status": "updated", "message": "KPI configuration updated successfully"}


# ==================== User Management ====================


@router.post("/users", response_model=dict)
async def create_user(
    user_data: UserCreate,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Create a new user (admin can create any role)"""
    if user_data.role not in {UserRole.ADMIN, UserRole.TRAINER}:
        raise HTTPException(
            status_code=400,
            detail="Admin user management only creates Admin or Trainer accounts.",
        )

    # Check if email exists
    normalized_email = _normalize_email(user_data.email)
    existing_user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already exists")

    default_passwords = {
        UserRole.ADMIN: DEFAULT_ADMIN_PASSWORD,
        UserRole.TRAINER: DEFAULT_TRAINER_PASSWORD,
    }
    temporary_password = _validate_password_or_raise(
        user_data.password or default_passwords[user_data.role]
    )

    new_user = User(
        email=normalized_email,
        full_name=_validate_full_name_or_raise(user_data.full_name),
        password_hash=auth_utils.hash_password(temporary_password),
        role=user_data.role,
        lob=ALL_LOB_ACCESS_LABEL,
        department=None,
        language_dialect=user_data.language_dialect,
    )

    db.add(new_user)
    db.flush()

    try:
        sync_user_to_supabase_auth(db, new_user, update_password=True)
    except SupabaseUserSyncError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    db.commit()

    log_admin_action(
        db,
        current_user.id,
        "created_user",
        "User",
        new_user.id,
        {"email": normalized_email, "role": user_data.role, "lob": ALL_LOB_ACCESS_LABEL},
    )

    return {
        "id": new_user.id,
        "email": new_user.email,
        "role": new_user.role,
        "temporary_password": temporary_password,
        "status": "created",
    }


@router.post("/users/bulk-upload")
async def bulk_upload_users(
    file: UploadFile = File(...),
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Bulk upload users via CSV"""
    try:
        content = await file.read()
        stream = io.StringIO(content.decode("utf8"))
        csv_reader = csv.DictReader(stream)

        created_count = 0
        errors = []

        for idx, row in enumerate(csv_reader, start=2):  # Start at 2 (after header)
            try:
                # Validate required fields
                if not row.get("email") or not row.get("full_name"):
                    errors.append(f"Row {idx}: Missing email or full_name")
                    continue

                # Check if user exists
                existing = db.query(User).filter(User.email == row["email"]).first()
                if existing:
                    errors.append(f"Row {idx}: Email {row['email']} already exists")
                    continue

                # Create user
                role = UserRole[row.get("role", "TRAINEE").upper()]
                temporary_password = (
                    row.get("password")
                    or (DEFAULT_TRAINEE_PASSWORD if role == UserRole.TRAINEE else "ChangeMe@123")
                )
                temporary_password = auth_utils.validate_password_length(temporary_password)
                with db.begin_nested():
                    new_user = User(
                        email=row["email"].strip().lower(),
                        full_name=row["full_name"],
                        password_hash=auth_utils.hash_password(temporary_password),
                        role=role,
                        lob=row.get("lob"),
                        department=row.get("department"),
                        language_dialect=row.get("language_dialect", "en-US"),
                    )

                    db.add(new_user)
                    db.flush()
                    sync_user_to_supabase_auth(db, new_user, update_password=True)

                created_count += 1

            except KeyError as e:
                errors.append(f"Row {idx}: Invalid role value")
            except SupabaseUserSyncError as e:
                errors.append(f"Row {idx}: {str(e)}")
            except Exception as e:
                errors.append(f"Row {idx}: {str(e)}")

        db.commit()

        log_admin_action(
            db,
            current_user.id,
            "bulk_upload_users",
            "User",
            "",
            {"created": created_count, "errors": len(errors)},
        )

        return {
            "status": "completed",
            "created": created_count,
            "errors": errors if errors else None,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File processing error: {str(e)}")


@router.get("/users")
async def list_users(
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
    role: Optional[UserRole] = None,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "created_at",
    sort_order: str = "desc",
):
    """List users with search, filters, sorting, and pagination."""
    safe_limit = max(1, min(limit, 100))
    safe_skip = max(0, skip)

    query = db.query(User)

    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(User.full_name).like(term),
                func.lower(User.email).like(term),
            )
        )

    total = query.count()
    sort_column = ADMIN_USER_SORT_COLUMNS.get(sort_by, User.created_at)
    if sort_order.lower() == "asc":
        query = query.order_by(sort_column.asc().nullslast(), User.full_name.asc())
    else:
        query = query.order_by(sort_column.desc().nullslast(), User.full_name.asc())

    users = query.offset(safe_skip).limit(safe_limit).all()

    return {
        "count": len(users),
        "total": total,
        "skip": safe_skip,
        "limit": safe_limit,
        "users": [_serialize_admin_user(user) for user in users],
    }


@router.put("/users/{user_id}")
async def update_admin_user(
    user_id: str,
    payload: AdminUserUpdate,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Update role, profile details, or account status for any user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changes: dict[str, Any] = {}

    if payload.full_name is not None:
        next_name = _validate_full_name_or_raise(payload.full_name)
        if next_name != user.full_name:
            changes["full_name"] = {"from": user.full_name, "to": next_name}
            user.full_name = next_name

    if payload.role is not None and payload.role != user.role:
        changes["role"] = {
            "from": user.role.value if isinstance(user.role, UserRole) else str(user.role),
            "to": payload.role.value,
        }
        user.role = payload.role

    if payload.is_active is not None and bool(payload.is_active) != bool(user.is_active):
        if user.id == current_user.id and not payload.is_active:
            raise HTTPException(status_code=400, detail="Admins cannot deactivate their own account.")
        changes["is_active"] = {"from": bool(user.is_active), "to": bool(payload.is_active)}
        user.is_active = bool(payload.is_active)

    if payload.department is not None:
        user.department = payload.department.strip() or None
    if payload.language_dialect is not None:
        user.language_dialect = payload.language_dialect.strip() or "en-US"

    try:
        sync_user_to_supabase_auth(db, user, update_password=False)
    except SupabaseUserSyncError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    db.commit()
    db.refresh(user)

    if changes:
        log_admin_action(
            db,
            current_user.id,
            "updated_user",
            "User",
            user.id,
            changes,
        )

    return {"status": "updated", "user": _serialize_admin_user(user)}


# ==================== Line of Business Management ====================


@router.post("/lob", response_model=dict)
async def create_lob(
    lob_data: LineOfBusinessCreate,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Create a new Line of Business"""
    existing = (
        db.query(LineOfBusiness)
        .filter(func.lower(LineOfBusiness.name) == lob_data.name.strip().lower())
        .first()
    )
    if existing and existing.is_active:
        raise HTTPException(status_code=400, detail="LOB name already exists")

    normalized_name = lob_data.name.strip()
    normalized_description = (lob_data.description or "").strip() or None

    if existing:
        existing.name = normalized_name
        existing.description = normalized_description
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        log_admin_action(
            db,
            current_user.id,
            "reactivated_lob",
            "LineOfBusiness",
            existing.id,
            {"name": existing.name},
        )
        return {
            "status": "reactivated",
            "lob": serialize_lobs(db, [existing])[0],
        }

    new_lob = LineOfBusiness(name=normalized_name, description=normalized_description)

    db.add(new_lob)
    db.commit()
    db.refresh(new_lob)

    log_admin_action(db, current_user.id, "created_lob", "LineOfBusiness", new_lob.id)

    return {
        "status": "created",
        "lob": serialize_lobs(db, [new_lob])[0],
    }


@router.get("/lob")
async def list_lobs(
    current_user: Any = Depends(verify_admin), db: Session = Depends(get_db)
):
    """List all Lines of Business"""
    lobs = list_active_lobs(db)

    return {
        "count": len(lobs),
        "lobs": serialize_lobs(db, lobs),
    }


@router.put("/lob/{lob_id}", response_model=dict)
async def update_lob(
    lob_id: str,
    lob_data: LineOfBusinessUpdate,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Update an existing Line of Business"""
    lob = db.query(LineOfBusiness).filter(LineOfBusiness.id == lob_id).first()
    if not lob or not lob.is_active:
        raise HTTPException(status_code=404, detail="LOB not found")

    changes = {}

    if lob_data.name is not None:
        normalized_name = lob_data.name.strip()
        if not normalized_name:
            raise HTTPException(status_code=400, detail="LOB name is required")

        duplicate = (
            db.query(LineOfBusiness)
            .filter(
                func.lower(LineOfBusiness.name) == normalized_name.lower(),
                LineOfBusiness.id != lob_id,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=400, detail="LOB name already exists")

        if lob.name != normalized_name:
            previous_name = lob.name
            changes["name"] = {"from": lob.name, "to": normalized_name}
            lob.name = normalized_name
            propagated = rename_lob_references(
                db,
                old_name=previous_name,
                new_name=normalized_name,
            )
            if any(propagated.values()):
                changes["propagated_records"] = propagated

    if lob_data.description is not None:
        normalized_description = lob_data.description.strip() or None
        if (lob.description or None) != normalized_description:
            changes["description"] = {
                "from": lob.description,
                "to": normalized_description,
            }
            lob.description = normalized_description

    if not changes:
        return {"status": "unchanged", "lob": serialize_lobs(db, [lob])[0]}

    db.commit()
    db.refresh(lob)

    log_admin_action(
        db,
        current_user.id,
        "updated_lob",
        "LineOfBusiness",
        lob.id,
        changes,
    )

    return {"status": "updated", "lob": serialize_lobs(db, [lob])[0]}


@router.delete("/lob/{lob_id}", response_model=dict)
async def deactivate_lob(
    lob_id: str,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Deactivate a Line of Business"""
    lob = db.query(LineOfBusiness).filter(LineOfBusiness.id == lob_id).first()
    if not lob or not lob.is_active:
        raise HTTPException(status_code=404, detail="LOB not found")

    lob.is_active = False
    db.commit()

    log_admin_action(
        db,
        current_user.id,
        "deactivated_lob",
        "LineOfBusiness",
        lob.id,
        {"name": lob.name},
    )

    return {"status": "deactivated", "lob_id": lob.id}


def _seed_sample_dataset(
    db: Session,
    *,
    admin_user: User,
    reset_sample_scenarios: bool = False,
):
    summary = {
        "users_created": 0,
        "lobs_created": 0,
        "assessment_categories_created": 0,
        "scenarios_created": 0,
        "batches_created": 0,
        "courses_created": 0,
        "course_assignments_created": 0,
        "practice_sessions_created": 0,
        "mcq_categories_created": 0,
        "mcq_questions_created": 0,
        "mcq_assessments_created": 0,
        "mcq_submissions_created": 0,
        "competency_verdicts_created": 0,
        "certificates_created": 0,
    }

    lob_sync = sync_default_lob_catalog(db, deactivate_missing=True)
    summary["lobs_created"] += lob_sync["created"]

    users = {}
    for user_seed in [
        {
            "email": ADMIN_EMAIL,
            "full_name": "Admin User",
            "role": UserRole.ADMIN,
            "password": ADMIN_PASSWORD,
            "lob": "Customer Service",
            "department": "Management",
            "language_dialect": "en-US",
        },
        {
            "email": TRAINER_EMAIL,
            "full_name": "Trainer User",
            "role": UserRole.TRAINER,
            "password": TRAINER_PASSWORD,
            "lob": "Customer Service",
            "department": "Operations",
            "language_dialect": "en-US",
        },
        {
            "email": TRAINEE_EMAIL,
            "full_name": "Maria Cureta",
            "role": UserRole.TRAINEE,
            "password": TRAINEE_PASSWORD,
            "lob": "Billing & Payments",
            "department": "Wave 1",
            "language_dialect": "en-PH",
        },
        {
            "email": "sample.trainee1@stpetervelle.edu.ph",
            "full_name": "Alyssa Ramos",
            "role": UserRole.TRAINEE,
            "password": DEFAULT_TRAINEE_PASSWORD,
            "lob": "Customer Service",
            "department": "Wave 1",
            "language_dialect": "en-PH",
        },
        {
            "email": "sample.trainee2@stpetervelle.edu.ph",
            "full_name": "Noah Santos",
            "role": UserRole.TRAINEE,
            "password": DEFAULT_TRAINEE_PASSWORD,
            "lob": "Technical Support",
            "department": "Wave 1",
            "language_dialect": "en-US",
        },
    ]:
        user, created = _ensure_user(db, **user_seed)
        sync_user_to_supabase_auth(db, user, update_password=True)
        users[user_seed["email"]] = user
        summary["users_created"] += int(created)

    kpi_config = db.query(KPIConfiguration).first()
    if not kpi_config:
        kpi_config = KPIConfiguration()
        db.add(kpi_config)
    kpi_config.accuracy_weight = 30
    kpi_config.fluency_weight = 25
    kpi_config.clarity_weight = 15
    kpi_config.keyword_adherence_weight = 15
    kpi_config.soft_skills_weight = 15
    kpi_config.passing_score = 75
    kpi_config.npl_confidence_threshold = 0.78
    kpi_config.updated_at = datetime.utcnow()

    cert_settings = db.query(CertificationSettings).first()
    if not cert_settings:
        cert_settings = CertificationSettings()
        db.add(cert_settings)
    cert_settings.institution_name = "St. Peter Velle Technical Training Center, Inc."
    cert_settings.address = "#92 Mc Arthur Highway Marulas, Valenzuela, Philippines, 1440"
    cert_settings.contact_number = "0960 545 6293"
    cert_settings.contact_email = "training@stpetervelle.edu.ph"
    cert_settings.registrar_name = "Training Registrar"
    cert_settings.unit_of_competency = "Communication effectively in English for Customer Support Services"
    cert_settings.asr_passing_threshold = 80
    cert_settings.mcq_passing_threshold = 90
    cert_settings.updated_at = datetime.utcnow()

    category_lookup = {}
    for category_seed in [
        {
            "name": "Pronunciation Accuracy",
            "category_type": FeedbackType.PRONUNCIATION,
            "description": "Measures articulation, pronunciation precision, and sound clarity.",
            "weight": 1.4,
        },
        {
            "name": "Fluency and Flow",
            "category_type": FeedbackType.FLUENCY,
            "description": "Measures pacing, filler-word control, and natural delivery.",
            "weight": 1.2,
        },
        {
            "name": "Empathy and Ownership",
            "category_type": FeedbackType.EMPATHY,
            "description": "Measures reassurance, empathy, and proactive next steps.",
            "weight": 1.3,
        },
        {
            "name": "Clarity and Compliance",
            "category_type": FeedbackType.CLARITY,
            "description": "Measures clear statements, account verification, and policy-safe language.",
            "weight": 1.1,
        },
    ]:
        category, created = _ensure_assessment_category(
            db,
            created_by=admin_user.id,
            **category_seed,
        )
        category_lookup[category_seed["name"]] = category
        summary["assessment_categories_created"] += int(created)

    scenario_lookup = {}
    scenario_seeds = [
        {
            "title": "Billing Dispute Resolution",
            "description": "Coach an upset customer through duplicate-charge verification, empathy, and refund expectations.",
            "purpose": ScenarioPurpose.PRACTICE,
            "difficulty": ScenarioDifficulty.INTERMEDIATE,
            "lob": "Billing & Payments",
            "opening_prompt": "I checked my statement and I was billed twice for the same purchase. I need this fixed today.",
            "expected_keywords": ["verify", "duplicate charge", "refund", "timeline"],
            "estimated_duration": 360,
            "flow_steps": [
                {
                    "step_number": 1,
                    "step_type": "customer_prompt",
                    "prompt_text": "Explain the duplicate charge concern and ask for help.",
                    "expected_keywords_for_step": ["verify", "apologize"],
                    "response_time_limit": 30,
                },
                {
                    "step_number": 2,
                    "step_type": "agent_response",
                    "expected_response": "Acknowledge the concern, verify the account, and explain the refund review path.",
                    "expected_keywords_for_step": ["verify", "refund", "review"],
                    "response_time_limit": 45,
                },
                {
                    "step_number": 3,
                    "step_type": "logic_branch",
                    "condition_type": "contains_keyword",
                    "condition_value": "refund",
                    "jump_to_step": 4,
                    "alternative_step": 2,
                },
                {
                    "step_number": 4,
                    "step_type": "agent_response",
                    "expected_response": "Confirm the timeline and set expectations for the follow-up update.",
                    "expected_keywords_for_step": ["timeline", "follow-up"],
                    "is_closing": True,
                    "response_time_limit": 30,
                },
            ],
            "assessment_categories": [
                "Pronunciation Accuracy",
                "Empathy and Ownership",
                "Clarity and Compliance",
            ],
        },
        {
            "title": "Service Outage Escalation Call",
            "description": "Handle a technical-support escalation with clear troubleshooting questions and calm ownership language.",
            "purpose": ScenarioPurpose.ASSESSMENT,
            "difficulty": ScenarioDifficulty.ADVANCED,
            "lob": "Technical Support",
            "opening_prompt": "Our internet has been down for two hours and I keep getting transferred. I need someone to take ownership of this now.",
            "expected_keywords": ["apologize", "troubleshoot", "escalate", "ticket"],
            "estimated_duration": 420,
            "flow_steps": [
                {
                    "step_number": 1,
                    "step_type": "customer_prompt",
                    "prompt_text": "Customer demands a supervisor and explains repeated transfers.",
                    "expected_keywords_for_step": ["ownership", "apologize"],
                    "response_time_limit": 25,
                },
                {
                    "step_number": 2,
                    "step_type": "agent_response",
                    "expected_response": "Acknowledge frustration, take ownership, and ask diagnostic questions before escalation.",
                    "expected_keywords_for_step": ["ownership", "diagnostic", "escalate"],
                    "response_time_limit": 45,
                },
                {
                    "step_number": 3,
                    "step_type": "agent_response",
                    "expected_response": "Provide the case number and the next callback/update commitment.",
                    "expected_keywords_for_step": ["ticket", "callback", "update"],
                    "is_closing": True,
                    "response_time_limit": 30,
                },
            ],
            "assessment_categories": [
                "Fluency and Flow",
                "Empathy and Ownership",
                "Clarity and Compliance",
            ],
        },
        {
            "title": "Account Verification and Refund Inquiry",
            "description": "Practice a calm verification-first flow before discussing refund eligibility and next steps.",
            "purpose": ScenarioPurpose.PRACTICE,
            "difficulty": ScenarioDifficulty.BASIC,
            "lob": "Customer Service",
            "opening_prompt": "I want to ask for a refund, but before that can you confirm you have my latest contact details?",
            "expected_keywords": ["verify", "refund", "policy", "confirm"],
            "estimated_duration": 300,
            "flow_steps": [
                {
                    "step_number": 1,
                    "step_type": "agent_response",
                    "expected_response": "Verify the account and repeat the latest details for confirmation.",
                    "expected_keywords_for_step": ["verify", "confirm"],
                    "response_time_limit": 30,
                },
                {
                    "step_number": 2,
                    "step_type": "agent_response",
                    "expected_response": "Explain the refund policy and the supporting details needed to continue.",
                    "expected_keywords_for_step": ["refund", "policy"],
                    "is_closing": True,
                    "response_time_limit": 30,
                },
            ],
            "assessment_categories": [
                "Pronunciation Accuracy",
                "Clarity and Compliance",
            ],
        },
    ]

    for scenario_seed in scenario_seeds:
        scenario, created = _ensure_scenario(
            db,
            created_by=admin_user.id,
            title=scenario_seed["title"],
            description=scenario_seed["description"],
            purpose=scenario_seed["purpose"],
            difficulty=scenario_seed["difficulty"],
            lob=scenario_seed["lob"],
            opening_prompt=scenario_seed["opening_prompt"],
            expected_keywords=scenario_seed["expected_keywords"],
            estimated_duration=scenario_seed["estimated_duration"],
            flow_steps=scenario_seed["flow_steps"],
            reset_steps=reset_sample_scenarios,
        )
        for category_name in scenario_seed["assessment_categories"]:
            category = category_lookup[category_name]
            if category not in scenario.assessment_categories:
                scenario.assessment_categories.append(category)
        scenario_lookup[scenario_seed["title"]] = scenario
        summary["scenarios_created"] += int(created)

    trainer_user = users[TRAINER_EMAIL]
    sample_batch, batch_created = _ensure_batch(
        db,
        name="Wave 1 - Sample Cohort",
        description="Seeded trainee cohort for admin, trainer, and analytics validation.",
        wave_number=1,
        lob="Customer Service",
        created_by=trainer_user.id,
    )
    summary["batches_created"] += int(batch_created)

    for trainee in [
        users["mcureta@fatima.edu.ph"],
        users["sample.trainee1@stpetervelle.edu.ph"],
        users["sample.trainee2@stpetervelle.edu.ph"],
    ]:
        if trainee not in sample_batch.users:
            sample_batch.users.append(trainee)

    sample_course, course_created = _ensure_course(
        db,
        name="BPO Foundations - Sample Course",
        description="Seeded cross-functional course that bundles billing, support, and technical handling scenarios.",
        duration_minutes=90,
        difficulty=ScenarioDifficulty.INTERMEDIATE,
        lob="Customer Service",
        scenario_ids=[scenario.id for scenario in scenario_lookup.values()],
        created_by=trainer_user.id,
    )
    summary["courses_created"] += int(course_created)

    _, assignment_created = _ensure_course_assignment(
        db,
        course_id=sample_course.id,
        batch_id=sample_batch.id,
        user_id=None,
        assigned_by=trainer_user.id,
    )
    summary["course_assignments_created"] += int(assignment_created)

    now = datetime.utcnow()
    latest_sessions_by_email = {}
    practice_session_seeds = [
        {
            "trainee_email": "mcureta@fatima.edu.ph",
            "scenario_title": "Account Verification and Refund Inquiry",
            "transcription": "Week 6 attempt 1: I can verify the account first and confirm the best callback details before we review the refund options.",
            "overall_score": 72.4,
            "accuracy_score": 74.0,
            "fluency_score": 70.0,
            "clarity_score": 73.0,
            "keyword_adherence_score": 71.0,
            "soft_skills_score": 74.0,
            "response_duration": 102,
            "filler_words": ["um", "uh"],
            "keyword_hits": ["verify", "confirm"],
            "attempt_number": 1,
            "created_at": now - timedelta(days=38),
            "transcription_confidence": 0.91,
        },
        {
            "trainee_email": "mcureta@fatima.edu.ph",
            "scenario_title": "Billing Dispute Resolution",
            "transcription": "Week 4 attempt 2: I am sorry for the duplicate charge. Let me verify the account, review the transaction, and explain the refund timeline.",
            "overall_score": 79.8,
            "accuracy_score": 81.0,
            "fluency_score": 77.0,
            "clarity_score": 80.0,
            "keyword_adherence_score": 79.0,
            "soft_skills_score": 82.0,
            "response_duration": 108,
            "filler_words": ["um"],
            "keyword_hits": ["verify", "refund", "timeline"],
            "attempt_number": 2,
            "created_at": now - timedelta(days=25),
            "transcription_confidence": 0.93,
        },
        {
            "trainee_email": "mcureta@fatima.edu.ph",
            "scenario_title": "Account Verification and Refund Inquiry",
            "transcription": "Week 2 attempt 3: I verified the account details, confirmed the contact information, and explained the refund policy with the next update window.",
            "overall_score": 84.7,
            "accuracy_score": 86.0,
            "fluency_score": 82.0,
            "clarity_score": 85.0,
            "keyword_adherence_score": 83.0,
            "soft_skills_score": 86.0,
            "response_duration": 96,
            "filler_words": [],
            "keyword_hits": ["verify", "refund", "policy", "confirm"],
            "attempt_number": 3,
            "created_at": now - timedelta(days=13),
            "transcription_confidence": 0.95,
        },
        {
            "trainee_email": "mcureta@fatima.edu.ph",
            "scenario_title": "Billing Dispute Resolution",
            "transcription": "Week 1 attempt 4: I am sorry for the duplicate charge. Let me verify your account, review the refund request, and give you the timeline today.",
            "overall_score": 88.5,
            "accuracy_score": 90.0,
            "fluency_score": 86.0,
            "clarity_score": 87.0,
            "keyword_adherence_score": 91.0,
            "soft_skills_score": 88.0,
            "response_duration": 112,
            "filler_words": ["um"],
            "keyword_hits": ["verify", "refund", "timeline"],
            "attempt_number": 4,
            "created_at": now - timedelta(days=5),
            "transcription_confidence": 0.97,
        },
        {
            "trainee_email": "sample.trainee1@stpetervelle.edu.ph",
            "scenario_title": "Account Verification and Refund Inquiry",
            "transcription": "Week 5 attempt 1: I can check the account details and then explain the refund process once the information is verified.",
            "overall_score": 68.9,
            "accuracy_score": 70.0,
            "fluency_score": 67.0,
            "clarity_score": 69.0,
            "keyword_adherence_score": 68.0,
            "soft_skills_score": 71.0,
            "response_duration": 101,
            "filler_words": ["uh"],
            "keyword_hits": ["verify"],
            "attempt_number": 1,
            "created_at": now - timedelta(days=32),
            "transcription_confidence": 0.9,
        },
        {
            "trainee_email": "sample.trainee1@stpetervelle.edu.ph",
            "scenario_title": "Billing Dispute Resolution",
            "transcription": "Week 3 attempt 2: I understand the duplicate charge concern, I will verify the account and review the refund path with you.",
            "overall_score": 76.4,
            "accuracy_score": 78.0,
            "fluency_score": 74.0,
            "clarity_score": 77.0,
            "keyword_adherence_score": 75.0,
            "soft_skills_score": 80.0,
            "response_duration": 107,
            "filler_words": ["um"],
            "keyword_hits": ["verify", "refund"],
            "attempt_number": 2,
            "created_at": now - timedelta(days=19),
            "transcription_confidence": 0.92,
        },
        {
            "trainee_email": "sample.trainee1@stpetervelle.edu.ph",
            "scenario_title": "Account Verification and Refund Inquiry",
            "transcription": "Week 2 attempt 3: I verified your account details first, and I can now explain the refund policy and the next steps clearly.",
            "overall_score": 84.2,
            "accuracy_score": 85.0,
            "fluency_score": 82.0,
            "clarity_score": 84.0,
            "keyword_adherence_score": 83.0,
            "soft_skills_score": 87.0,
            "response_duration": 94,
            "filler_words": [],
            "keyword_hits": ["verify", "refund", "policy"],
            "attempt_number": 3,
            "created_at": now - timedelta(days=8),
            "transcription_confidence": 0.95,
        },
        {
            "trainee_email": "sample.trainee1@stpetervelle.edu.ph",
            "scenario_title": "Billing Dispute Resolution",
            "transcription": "Week 1 attempt 4: I reviewed the billing issue, verified the transaction, and set a clear refund follow-up timeline for you.",
            "overall_score": 86.4,
            "accuracy_score": 87.0,
            "fluency_score": 84.0,
            "clarity_score": 86.0,
            "keyword_adherence_score": 85.0,
            "soft_skills_score": 89.0,
            "response_duration": 99,
            "filler_words": [],
            "keyword_hits": ["verify", "refund", "timeline"],
            "attempt_number": 4,
            "created_at": now - timedelta(days=2),
            "transcription_confidence": 0.96,
        },
        {
            "trainee_email": "sample.trainee2@stpetervelle.edu.ph",
            "scenario_title": "Service Outage Escalation Call",
            "transcription": "Week 5 attempt 1: I know the outage is frustrating, so I will begin troubleshooting and document the escalation for you.",
            "overall_score": 79.5,
            "accuracy_score": 81.0,
            "fluency_score": 77.0,
            "clarity_score": 78.0,
            "keyword_adherence_score": 80.0,
            "soft_skills_score": 82.0,
            "response_duration": 122,
            "filler_words": ["uh"],
            "keyword_hits": ["troubleshoot", "escalate"],
            "attempt_number": 1,
            "created_at": now - timedelta(days=30),
            "transcription_confidence": 0.92,
        },
        {
            "trainee_email": "sample.trainee2@stpetervelle.edu.ph",
            "scenario_title": "Service Outage Escalation Call",
            "transcription": "Week 3 attempt 2: I understand the impact of the outage. I will take ownership, troubleshoot the line, and create the escalation ticket.",
            "overall_score": 85.6,
            "accuracy_score": 87.0,
            "fluency_score": 84.0,
            "clarity_score": 83.0,
            "keyword_adherence_score": 88.0,
            "soft_skills_score": 86.0,
            "response_duration": 131,
            "filler_words": [],
            "keyword_hits": ["ownership", "troubleshoot", "ticket"],
            "attempt_number": 2,
            "created_at": now - timedelta(days=18),
            "transcription_confidence": 0.95,
        },
        {
            "trainee_email": "sample.trainee2@stpetervelle.edu.ph",
            "scenario_title": "Service Outage Escalation Call",
            "transcription": "Week 2 attempt 3: I understand how frustrating this outage is. I will troubleshoot with you, create an escalation ticket, and set the callback update.",
            "overall_score": 89.7,
            "accuracy_score": 90.0,
            "fluency_score": 88.0,
            "clarity_score": 87.0,
            "keyword_adherence_score": 91.0,
            "soft_skills_score": 91.0,
            "response_duration": 136,
            "filler_words": [],
            "keyword_hits": ["troubleshoot", "escalate", "ticket", "update"],
            "attempt_number": 3,
            "created_at": now - timedelta(days=9),
            "transcription_confidence": 0.96,
        },
        {
            "trainee_email": "sample.trainee2@stpetervelle.edu.ph",
            "scenario_title": "Service Outage Escalation Call",
            "transcription": "Week 1 attempt 4: I understand how frustrating this outage is. I will troubleshoot with you, create an escalation ticket, and stay accountable for the update.",
            "overall_score": 91.4,
            "accuracy_score": 92.0,
            "fluency_score": 90.0,
            "clarity_score": 89.0,
            "keyword_adherence_score": 93.0,
            "soft_skills_score": 93.0,
            "response_duration": 138,
            "filler_words": ["uh"],
            "keyword_hits": ["troubleshoot", "escalate", "ticket"],
            "attempt_number": 4,
            "created_at": now - timedelta(days=1),
            "transcription_confidence": 0.98,
        },
    ]

    for practice_seed in practice_session_seeds:
        trainee = users[practice_seed["trainee_email"]]
        scenario = scenario_lookup[practice_seed["scenario_title"]]
        session, created = _ensure_practice_session(
            db,
            user_id=trainee.id,
            scenario_id=scenario.id,
            transcription=practice_seed["transcription"],
            overall_score=practice_seed["overall_score"],
            accuracy_score=practice_seed["accuracy_score"],
            fluency_score=practice_seed["fluency_score"],
            clarity_score=practice_seed["clarity_score"],
            keyword_adherence_score=practice_seed["keyword_adherence_score"],
            soft_skills_score=practice_seed["soft_skills_score"],
            response_duration=practice_seed["response_duration"],
            filler_words=practice_seed["filler_words"],
            keyword_hits=practice_seed["keyword_hits"],
            attempt_number=practice_seed["attempt_number"],
            created_at=practice_seed["created_at"],
            transcription_confidence=practice_seed["transcription_confidence"],
        )
        summary["practice_sessions_created"] += int(created)

        latest_existing = latest_sessions_by_email.get(practice_seed["trainee_email"])
        if (
            latest_existing is None
            or (
                session.created_at is not None
                and latest_existing.created_at is not None
                and session.created_at > latest_existing.created_at
            )
        ):
            latest_sessions_by_email[practice_seed["trainee_email"]] = session

    mcq_category, mcq_category_created = _ensure_mcq_category(
        db,
        name="Customer Service Essentials",
        description="Seeded MCQ bank for verification, empathy, and troubleshooting basics.",
        difficulty=ScenarioDifficulty.BASIC,
        lob="Customer Service",
        created_by=admin_user.id,
    )
    summary["mcq_categories_created"] += int(mcq_category_created)

    mcq_questions = []
    for question_seed in [
        {
            "question_text": "Which response best demonstrates ownership during an outage escalation?",
            "option_a": "That issue belongs to another team.",
            "option_b": "I understand the impact, and I will stay with you through the next update.",
            "option_c": "Please call back later when the system is stable.",
            "option_d": "You should wait for an email and avoid calling again.",
            "correct_option": "B",
            "explanation": "Ownership language reassures the customer and sets a clear support commitment.",
        },
        {
            "question_text": "What should an agent do before discussing refund eligibility on a live call?",
            "option_a": "Promise a refund immediately.",
            "option_b": "Transfer the caller without context.",
            "option_c": "Verify the account and confirm the transaction details first.",
            "option_d": "Ask the customer to repeat the story later by email.",
            "correct_option": "C",
            "explanation": "Verification protects the customer and keeps the refund workflow compliant.",
        },
    ]:
        question, created = _ensure_mcq_question(
            db,
            category_id=mcq_category.id,
            created_by=admin_user.id,
            **question_seed,
        )
        mcq_questions.append(question)
        summary["mcq_questions_created"] += int(created)

    mcq_assessment, mcq_assessment_created = _ensure_mcq_assessment(
        db,
        title="Wave 1 Readiness Check",
        description="Seeded assessment that checks empathy, ownership, and refund-verification basics.",
        category_id=mcq_category.id,
        question_ids=[question.id for question in mcq_questions],
        assigned_by=trainer_user.id,
        assigned_batch_id=sample_batch.id,
    )
    summary["mcq_assessments_created"] += int(mcq_assessment_created)

    answers = {
        mcq_questions[0].id: "B",
        mcq_questions[1].id: "C",
    }
    maria_submission, submission_created = _ensure_mcq_submission(
        db,
        assessment_id=mcq_assessment.id,
        trainee_id=users["mcureta@fatima.edu.ph"].id,
        answers=answers,
        score_percentage=100.0,
        is_passed=True,
    )
    summary["mcq_submissions_created"] += int(submission_created)

    noah_submission, noah_submission_created = _ensure_mcq_submission(
        db,
        assessment_id=mcq_assessment.id,
        trainee_id=users["sample.trainee2@stpetervelle.edu.ph"].id,
        answers=answers,
        score_percentage=100.0,
        is_passed=True,
    )
    summary["mcq_submissions_created"] += int(noah_submission_created)

    alyssa_submission, alyssa_submission_created = _ensure_mcq_submission(
        db,
        assessment_id=mcq_assessment.id,
        trainee_id=users["sample.trainee1@stpetervelle.edu.ph"].id,
        answers={
            mcq_questions[0].id: "B",
            mcq_questions[1].id: "A",
        },
        score_percentage=50.0,
        is_passed=False,
    )
    summary["mcq_submissions_created"] += int(alyssa_submission_created)

    verdict_seed_rows = [
        {
            "trainee_email": "mcureta@fatima.edu.ph",
            "practice_session_id": latest_sessions_by_email["mcureta@fatima.edu.ph"].id,
            "mcq_assessment_id": maria_submission.assessment_id,
            "asr_score": latest_sessions_by_email["mcureta@fatima.edu.ph"].overall_score or 0.0,
            "mcq_score": maria_submission.score_percentage or 0.0,
            "remarks": "Consistently demonstrates refund verification, empathy, and accurate next-step communication.",
            "is_competent": True,
            "decided_at": now - timedelta(days=3),
            "certificate_no": "CL-2026-SAMPLE-0001",
            "qr_token": "seed-certificate-maria",
        },
        {
            "trainee_email": "sample.trainee2@stpetervelle.edu.ph",
            "practice_session_id": latest_sessions_by_email["sample.trainee2@stpetervelle.edu.ph"].id,
            "mcq_assessment_id": noah_submission.assessment_id,
            "asr_score": latest_sessions_by_email["sample.trainee2@stpetervelle.edu.ph"].overall_score or 0.0,
            "mcq_score": noah_submission.score_percentage or 0.0,
            "remarks": "Shows strong outage-escalation ownership and confidently meets the technical support benchmark.",
            "is_competent": True,
            "decided_at": now - timedelta(days=1),
            "certificate_no": "CL-2026-SAMPLE-0002",
            "qr_token": "seed-certificate-noah",
        },
    ]

    for verdict_seed in verdict_seed_rows:
        trainee = users[verdict_seed["trainee_email"]]
        verdict, verdict_created = _ensure_competency_verdict(
            db,
            trainee_id=trainee.id,
            trainer_id=trainer_user.id,
            practice_session_id=verdict_seed["practice_session_id"],
            mcq_assessment_id=verdict_seed["mcq_assessment_id"],
            asr_score=verdict_seed["asr_score"],
            mcq_score=verdict_seed["mcq_score"],
            remarks=verdict_seed["remarks"],
            is_competent=verdict_seed["is_competent"],
            decided_at=verdict_seed["decided_at"],
        )
        summary["competency_verdicts_created"] += int(verdict_created)

        _, certificate_created = _ensure_certificate_record(
            db,
            verdict_id=verdict.id,
            trainee_id=trainee.id,
            trainer_id=trainer_user.id,
            unit_of_competency=cert_settings.unit_of_competency,
            kip_score=round((verdict.asr_score + verdict.mcq_score) / 2, 2),
            certificate_no=verdict_seed["certificate_no"],
            qr_token=verdict_seed["qr_token"],
        )
        summary["certificates_created"] += int(certificate_created)

    db.commit()

    return {
        "summary": summary,
        "credentials": {
            "admin": {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            "trainer": {"email": TRAINER_EMAIL, "password": TRAINER_PASSWORD},
            "trainee": {"email": TRAINEE_EMAIL, "password": TRAINEE_PASSWORD},
        },
    }


@router.get("/dashboard")
async def admin_dashboard(
    current_user: Any = Depends(verify_admin), db: Session = Depends(get_db)
):
    """Admin dashboard with system overview"""
    insights = build_admin_learning_insights(db)
    summary = insights.get("summary") or {}

    total_users = db.query(User).filter(User.is_active.is_(True)).count()
    total_scenarios = db.query(Scenario).filter(Scenario.is_published.is_(True)).count()
    trainee_count = (
        db.query(User)
        .filter(User.role == UserRole.TRAINEE, User.is_active.is_(True))
        .count()
    )
    trainer_count = (
        db.query(User)
        .filter(User.role == UserRole.TRAINER, User.is_active.is_(True))
        .count()
    )
    # Count batches with at least one trainee directly in SQL to avoid loading every
    # batch and relationship collection into Python on each dashboard refresh.
    active_batches = (
        db.query(func.count(func.distinct(Batch.id)))
        .select_from(Batch)
        .join(batch_user_association, batch_user_association.c.batch_id == Batch.id)
        .join(User, User.id == batch_user_association.c.user_id)
        .filter(User.role == UserRole.TRAINEE, User.is_active.is_(True))
        .scalar()
        or 0
    )
    average_completion = float(summary.get("completion_rate") or 0.0)

    total_completed_activities = (
        int(summary.get("completed_modules") or 0)
        + int(summary.get("completed_assessments") or 0)
        + int(summary.get("completed_call_simulations") or 0)
    )
    avg_score = float(summary.get("overall_score") or 0.0)
    audio_sessions = (
        db.query(func.count(PracticeSession.audio_file_url))
        .filter(PracticeSession.audio_file_url.isnot(None))
        .scalar()
        or 0
    )
    practice_sessions = db.query(func.count(PracticeSession.id)).scalar() or 0
    audio_coverage = round((int(audio_sessions) / int(practice_sessions) * 100) if practice_sessions else 0.0, 2)

    database_status = {
        "status": "connected",
        "detail": "Primary database connection is healthy.",
    }
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        database_status = {
            "status": "error",
            "detail": str(exc),
        }

    supabase = get_supabase_client()
    openai_key_configured = bool(os.getenv("OPENAI_API_KEY"))
    recent_logs = (
        db.query(SystemLog, User.full_name.label("actor_name"))
        .outerjoin(User, User.id == SystemLog.admin_id)
        .order_by(SystemLog.created_at.desc())
        .limit(8)
        .all()
    )

    return {
        "total_users": total_users,
        "total_trainees": trainee_count,
        "total_trainers": trainer_count,
        "total_scenarios": total_scenarios,
        "total_sessions": total_completed_activities,
        "total_completed_activities": total_completed_activities,
        "total_assigned_activities": (
            int(summary.get("assigned_module_records") or 0)
            + int(summary.get("assigned_assessment_records") or 0)
            + int(summary.get("assigned_call_simulation_records") or 0)
        ),
        "total_pending_activities": int(summary.get("pending_items") or 0),
        "total_failed_activities": int(summary.get("failed_items") or 0),
        "average_score": round(avg_score, 2),
        "active_batches": active_batches,
        "average_completion": round(float(average_completion or 0), 2),
        "passing_rate": round(float(summary.get("pass_rate") or 0.0), 2),
        "intervention_needed_count": int(summary.get("intervention_needed_count") or 0),
        "system_status": {
            "asr_engine": {
                "status": "configured" if openai_key_configured else "fallback_only",
                "detail": (
                    "OpenAI transcription is configured for live assessment."
                    if openai_key_configured
                    else "Live ASR credentials are missing, so heuristic fallback scoring is active."
                ),
            },
            "nlp_processing": {
                "status": "active",
                "detail": "Database-backed scoring, keyword matching, and coaching insights are enabled.",
            },
            "database": database_status,
            "audio_storage": {
                "status": "connected" if supabase.is_available else "not_configured",
                "provider": "supabase" if supabase.is_available else "unavailable",
                "detail": (
                    "Audio uploads are stored through Supabase."
                    if supabase.is_available
                    else getattr(
                        supabase,
                        "status_detail",
                        "Supabase storage is not configured, so audio uploads are blocked.",
                    )
                ),
                "utilization": {
                    "sessions_with_audio": int(audio_sessions),
                    "coverage_percentage": audio_coverage,
                },
            },
        },
        "recent_activity": [
            {
                "id": log.id,
                "action": log.action,
                "label": _format_system_log_action(log.action),
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "actor_name": actor_name or "System",
                "created_at": log.created_at,
                "changes": log.changes or {},
            }
            for log, actor_name in recent_logs
        ],
        "timestamp": datetime.utcnow(),
    }


# Admin Reports and Data Access Routes
@router.get("/trainers")
async def get_all_trainers(
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """Get all trainers for admin reports"""
    trainers = db.query(User).filter(User.role == UserRole.TRAINER).all()
    
    trainer_data = []
    for trainer in trainers:
        trainer_batches = db.query(Batch).filter(Batch.created_by == trainer.id).all()
        trainee_count = sum(
            1
            for batch in trainer_batches
            for trainee in batch.users
            if trainee.role == UserRole.TRAINEE
        )
        
        trainer_data.append({
            "id": trainer.id,
            "full_name": trainer.full_name,
            "email": trainer.email,
            "batches_count": len(trainer_batches),
            "trainees_count": trainee_count,
        })
    
    return {"trainers": trainer_data}


@router.get("/batches")
async def get_all_batches(
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """Get all batches for admin reports"""
    batches = db.query(Batch).all()
    
    batch_data = []
    for batch in batches:
        trainer = db.query(User).filter(User.id == batch.created_by).first()
        trainee_count = len(
            [user for user in batch.users if user.role == UserRole.TRAINEE]
        )
        
        batch_data.append({
            "id": batch.id,
            "name": batch.name,
            "wave_number": batch.wave_number,
            "users_count": trainee_count,
            "description": batch.description,
            "lob": batch.lob,
            "trainer_id": batch.created_by,
            "trainer_name": trainer.full_name if trainer else "Unknown",
        })
    
    return {"batches": batch_data}


def _get_report_trainees_for_batch(batch: Batch) -> List[User]:
    return [
        user
        for user in batch.users
        if user.role == UserRole.TRAINEE and user.is_active
    ]


def _average_numbers(values: List[Optional[float]]) -> float:
    normalized = [float(value) for value in values if value is not None]
    if not normalized:
        return 0.0
    return sum(normalized) / len(normalized)


def _get_scored_sessions(sessions: List[PracticeSession]) -> List[PracticeSession]:
    return [session for session in sessions if session.overall_score is not None]


def _get_average_score(sessions: List[PracticeSession]) -> float:
    return _average_numbers([session.overall_score for session in sessions])


def _get_pass_rate_percent(
    sessions: List[PracticeSession],
    *,
    passing_score: float = 70.0,
) -> float:
    scored_sessions = _get_scored_sessions(sessions)
    if not scored_sessions:
        return 0.0
    passed_sessions = [
        session for session in scored_sessions if float(session.overall_score or 0) >= passing_score
    ]
    return (len(passed_sessions) / len(scored_sessions)) * 100


def _get_average_metric(sessions: List[PracticeSession], field_name: str) -> float:
    return _average_numbers([getattr(session, field_name) for session in sessions])


def _get_metric_improvement(sessions: List[PracticeSession], field_name: str) -> float:
    metric_sessions = [
        session
        for session in sorted(sessions, key=lambda item: item.created_at or datetime.min)
        if getattr(session, field_name) is not None
    ]
    if len(metric_sessions) < 2:
        return 0.0

    midpoint = max(len(metric_sessions) // 2, 1)
    earlier_sessions = metric_sessions[:midpoint]
    recent_sessions = metric_sessions[midpoint:]
    earlier_average = _get_average_metric(earlier_sessions, field_name)
    recent_average = _get_average_metric(recent_sessions, field_name)
    return recent_average - earlier_average


def _build_category_performance(sessions: List[PracticeSession]) -> List[dict]:
    category_fields = [
        ("Pronunciation", "accuracy_score"),
        ("Fluency", "fluency_score"),
        ("Clarity", "clarity_score"),
        ("Keyword Adherence", "keyword_adherence_score"),
        ("Soft Skills", "soft_skills_score"),
    ]
    return [
        {
            "category": category_name,
            "average_score": round(_get_average_metric(sessions, field_name), 1),
            "improvement_trend": round(_get_metric_improvement(sessions, field_name), 1),
        }
        for category_name, field_name in category_fields
    ]


def _get_sessions_for_trainee_ids(db: Session, trainee_ids: List[str]) -> List[PracticeSession]:
    if not trainee_ids:
        return []
    return (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id.in_(trainee_ids))
        .all()
    )


def _build_admin_microlearning_report_overview(db: Session) -> dict[str, Any]:
    assignments = (
        db.query(MicrolearningAssignment)
        .options(
            selectinload(MicrolearningAssignment.module),
            selectinload(MicrolearningAssignment.trainee),
            selectinload(MicrolearningAssignment.trainer),
            selectinload(MicrolearningAssignment.batch),
            selectinload(MicrolearningAssignment.certificate),
        )
        .order_by(MicrolearningAssignment.assigned_at.desc())
        .all()
    )

    did_update = False
    serialized_assignments: list[dict[str, Any]] = []

    for assignment in assignments:
        did_update = ensure_module_exercises(assignment.module) or did_update
        before = (
            assignment.status,
            assignment.completion_percentage,
            assignment.completed_exercises,
            assignment.completed_at,
            assignment.certificate_id,
        )
        refresh_assignment_progress(assignment)
        after = (
            assignment.status,
            assignment.completion_percentage,
            assignment.completed_exercises,
            assignment.completed_at,
            assignment.certificate_id,
        )
        did_update = before != after or did_update
        serialized_assignments.append(serialize_assignment_summary(assignment))

    if did_update:
        db.commit()

    def _average(values: list[float]) -> float:
        if not values:
            return 0.0
        return round(sum(values) / len(values), 2)

    modules = (
        db.query(MicrolearningModule)
        .filter(MicrolearningModule.is_active == True)
        .all()
    )

    score_values = [
        float(row.get("average_score") or 0.0)
        for row in serialized_assignments
        if int(row.get("completed_exercises") or 0) > 0
    ]
    completed_count = sum(
        1 for row in serialized_assignments if row.get("status") in {"completed", "certified"}
    )
    certified_count = sum(1 for row in serialized_assignments if row.get("certificate_id"))
    in_progress_count = sum(
        1 for row in serialized_assignments if row.get("status") in {"assigned", "in_progress"}
    )
    recent_certificates = [
        {
            "assignment_id": row["id"],
            "certificate_id": row.get("certificate_id"),
            "certificate_no": row.get("certificate_no"),
            "module_title": row.get("module_title") or row.get("title"),
            "trainee_name": row.get("trainee_name"),
            "assigned_by": row.get("assigned_by"),
            "assigned_by_name": row.get("assigned_by_name"),
            "batch_id": row.get("batch_id"),
            "batch_name": row.get("batch_name"),
            "issued_at": row.get("certificate_issued_at") or row.get("completed_at"),
        }
        for row in serialized_assignments
        if row.get("certificate_id")
    ]
    recent_certificates.sort(
        key=lambda entry: str(entry.get("issued_at") or ""),
        reverse=True,
    )

    return {
        "summary": {
            "module_count": len(modules),
            "assignment_count": len(serialized_assignments),
            "in_progress_count": in_progress_count,
            "completed_count": completed_count,
            "certified_count": certified_count,
            "average_score": _average(score_values),
            "pass_rate": round(
                (certified_count / len(serialized_assignments) * 100)
                if serialized_assignments
                else 0.0,
                2,
            ),
        },
        "assignments": serialized_assignments,
        "recent_certificates": recent_certificates[:12],
    }


@router.get("/microlearning-reports/overview")
async def get_admin_microlearning_reports_overview(
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Return admin-wide microlearning reporting data backed by the active database."""
    return _build_admin_microlearning_report_overview(db)


@router.get("/reports/trainer/{trainer_id}")
async def get_trainer_report(
    trainer_id: str,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """Get comprehensive trainer performance report"""
    trainer = (
        db.query(User)
        .filter(User.id == trainer_id, User.role == UserRole.TRAINER)
        .first()
    )
    if not trainer:
        raise HTTPException(status_code=404, detail="Trainer not found")
    
    # Get all batches for this trainer
    batches = db.query(Batch).filter(Batch.created_by == trainer_id).all()
    
    batch_summaries = []
    total_trainees = 0
    total_sessions = 0
    total_avg_performance = 0
    trainer_trainee_lookup = {}
    
    for batch in batches:
        trainees = _get_report_trainees_for_batch(batch)
        for trainee in trainees:
            trainer_trainee_lookup[trainee.id] = trainee
        
        batch_trainees = len(trainees)
        total_trainees += batch_trainees
        
        # Get sessions for this batch
        sessions = _get_sessions_for_trainee_ids(db, [trainee.id for trainee in trainees])
        
        batch_sessions = len(sessions)
        total_sessions += batch_sessions
        
        # Calculate average performance
        avg_score = _get_average_score(sessions)
        pass_rate_percent = _get_pass_rate_percent(sessions)
        
        total_avg_performance += avg_score
        trainee_scores = {
            trainee.id: _get_average_score(
                [session for session in sessions if session.user_id == trainee.id]
            )
            for trainee in trainees
        }
        
        batch_summaries.append({
            "batch_id": batch.id,
            "batch_name": batch.name,
            "total_trainees": batch_trainees,
            "avg_performance": round(avg_score, 1),
            "avg_score": round(avg_score, 1),
            "pass_rate": round(pass_rate_percent, 1),
            "total_sessions": batch_sessions,
            "completion_rate": round((batch_sessions / max(batch_trainees, 1)) * 100, 1),
            "top_performers": len(
                [score for score in trainee_scores.values() if score >= 80]
            ),
            "needs_improvement": len(
                [score for score in trainee_scores.values() if score < 60]
            ),
        })
    
    # Calculate overall metrics
    avg_batch_performance = total_avg_performance / max(len(batches), 1)
    trainer_trainee_ids = list(trainer_trainee_lookup.keys())
    trainer_sessions = _get_sessions_for_trainee_ids(db, trainer_trainee_ids)
    
    # Get performance trends (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    trends = []
    
    for i in range(30):
        date = thirty_days_ago + timedelta(days=i)
        next_date = date + timedelta(days=1)
        
        day_sessions = [
            session
            for session in trainer_sessions
            if session.created_at and date <= session.created_at < next_date
        ]
        avg_score = _get_average_score(day_sessions)
        pass_rate_percent = _get_pass_rate_percent(day_sessions)
        
        trends.append({
            "period": date.strftime("%Y-%m-%d"),
            "avg_score": round(avg_score, 1),
            "sessions": len(day_sessions),
            "pass_rate": round(pass_rate_percent, 1),
        })
    
    category_performance = _build_category_performance(trainer_sessions)
    overall_pass_rate = _get_pass_rate_percent(trainer_sessions)
    top_batch_summary = (
        max(batch_summaries, key=lambda item: item["avg_performance"])
        if batch_summaries
        else None
    )
    top_performing_batch = (
        {
            "batch_name": top_batch_summary["batch_name"],
            "avg_score": top_batch_summary["avg_performance"],
        }
        if top_batch_summary
        else None
    )
    
    return {
        "trainer": {
            "id": trainer.id,
            "full_name": trainer.full_name,
            "email": trainer.email,
        },
        "batches": batch_summaries,
        "summary": {
            "trainer_id": trainer.id,
            "trainer_name": trainer.full_name,
            "total_batches": len(batches),
            "total_trainees": total_trainees,
            "avg_batch_performance": round(avg_batch_performance, 1),
            "total_sessions": total_sessions,
            "pass_rate": round(overall_pass_rate, 1),
            "top_performing_batch": top_performing_batch,
            "needs_attention_batches": len([b for b in batch_summaries if b["avg_performance"] < 70]),
        },
        "trends": trends,
        "category_performance": category_performance,
    }


@router.get("/reports/batch/{batch_id}")
async def get_batch_report(
    batch_id: str,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """Get comprehensive batch performance report"""
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    trainer = db.query(User).filter(User.id == batch.created_by).first()
    
    # Get trainees in this batch
    trainees = _get_report_trainees_for_batch(batch)
    
    # Get all sessions for this batch
    sessions = _get_sessions_for_trainee_ids(db, [trainee.id for trainee in trainees])
    
    # Calculate batch metrics
    total_sessions = len(sessions)
    sessions_with_scores = _get_scored_sessions(sessions)
    
    if sessions_with_scores:
        avg_performance = _get_average_score(sessions_with_scores)
        pass_rate_percent = _get_pass_rate_percent(sessions_with_scores)
    else:
        avg_performance = 0
        pass_rate_percent = 0
    
    completion_rate = (total_sessions / max(len(trainees), 1)) * 100
    
    # Get trainee performance data
    trainee_performance = []
    for trainee in trainees:
        trainee_sessions = [s for s in sessions if s.user_id == trainee.id]
        sessions_with_scores = _get_scored_sessions(trainee_sessions)
        
        if sessions_with_scores:
            avg_score = _get_average_score(sessions_with_scores)
            pass_rate_percent = _get_pass_rate_percent(sessions_with_scores)
            highest_score = max(
                float(session.overall_score or 0) for session in sessions_with_scores
            )
        else:
            avg_score = 0
            pass_rate_percent = 0
            highest_score = 0
        
        latest_session = max(trainee_sessions, key=lambda s: s.created_at) if trainee_sessions else None
        
        trainee_performance.append({
            "trainee_id": trainee.id,
            "trainee_name": trainee.full_name,
            "sessions_completed": len(trainee_sessions),
            "avg_score": round(avg_score, 1),
            "highest_score": round(highest_score, 1),
            "pass_rate": round(pass_rate_percent, 1),
            "latest_session": latest_session.created_at.isoformat() if latest_session else None,
        })
    
    # Sort by performance
    trainee_performance.sort(key=lambda x: x["avg_score"], reverse=True)
    
    # Get performance trends (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    trends = []
    
    for i in range(30):
        date = thirty_days_ago + timedelta(days=i)
        next_date = date + timedelta(days=1)
        
        day_sessions = [s for s in sessions if date <= s.created_at < next_date]
        
        if day_sessions:
            sessions_with_scores = _get_scored_sessions(day_sessions)
            if sessions_with_scores:
                avg_score = _get_average_score(sessions_with_scores)
                pass_rate_percent = _get_pass_rate_percent(sessions_with_scores)
            else:
                avg_score = 0
                pass_rate_percent = 0
        else:
            avg_score = 0
            pass_rate_percent = 0
        
        trends.append({
            "period": date.strftime("%Y-%m-%d"),
            "avg_score": round(avg_score, 1),
            "sessions": len(day_sessions),
            "pass_rate": round(pass_rate_percent, 1),
        })
    
    category_performance = _build_category_performance(sessions)
    
    return {
        "batch": {
            "id": batch.id,
            "name": batch.name,
            "wave_number": batch.wave_number,
            "description": batch.description,
            "lob": batch.lob,
        },
        "trainer": {
            "id": trainer.id if trainer else None,
            "full_name": trainer.full_name if trainer else "Unknown",
            "email": trainer.email if trainer else "",
        },
        "summary": {
            "batch_id": batch.id,
            "batch_name": batch.name,
            "trainer_name": trainer.full_name if trainer else "Unknown",
            "total_trainees": len(trainees),
            "avg_performance": round(avg_performance, 1),
            "pass_rate": round(pass_rate_percent, 1),
            "total_sessions": total_sessions,
            "completion_rate": round(completion_rate, 1),
            "top_performers": len([t for t in trainee_performance if t["avg_score"] >= 80]),
            "needs_improvement": len([t for t in trainee_performance if t["avg_score"] < 60]),
        },
        "trends": trends,
        "category_performance": category_performance,
        "trainee_performance": trainee_performance,
    }


@router.get("/reports/trainer/{trainer_id}/pdf")
async def download_trainer_report_pdf(
    trainer_id: str,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """Download trainer performance report as PDF"""
    report_data = await get_trainer_report(trainer_id, current_user, db)

    generator = PerformanceReportGenerator(title="Trainer Performance Report")
    pdf_buffer = generator.generate_trainer_report(
        trainer_name=report_data["trainer"]["full_name"],
        trainer_email=report_data["trainer"]["email"],
        report_period="All Time",
        generated_at=datetime.utcnow(),
        total_batches=int(report_data["summary"]["total_batches"]),
        total_trainees=int(report_data["summary"]["total_trainees"]),
        avg_batch_performance=float(report_data["summary"]["avg_batch_performance"]),
        total_sessions=int(report_data["summary"]["total_sessions"]),
        pass_rate=float(report_data["summary"]["pass_rate"]),
        top_performing_batch=report_data["summary"].get("top_performing_batch"),
        needs_attention_batches=int(report_data["summary"]["needs_attention_batches"]),
        batch_rows=report_data["batches"],
        category_rows=report_data["category_performance"],
        trend_rows=report_data["trends"],
    )

    return Response(
        content=pdf_buffer.read(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="trainer_report_{trainer_id[:8]}_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.pdf"',
        },
    )


@router.get("/reports/batch/{batch_id}/pdf")
async def download_batch_report_pdf(
    batch_id: str,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db)
):
    """Download batch performance report as PDF"""
    report_data = await get_batch_report(batch_id, current_user, db)

    generator = PerformanceReportGenerator(title="Batch Performance Report")
    improvement_rows = [
        {
            "category": category["category"],
            "average": float(category["average_score"]),
            "below_threshold_count": int(category["average_score"] < 70),
            "recommendation": f"Improve {category['category']}.",
        }
        for category in report_data["category_performance"]
    ]
    pronunciation_rows = [
        {
            "error_type": category["category"],
            "frequency": max(1, int(category["average_score"] // 10)),
            "examples": [],
        }
        for category in report_data["category_performance"]
    ]
    ranking_rows = [
        {
            "trainee_name": trainee["trainee_name"],
            "sessions_count": int(trainee["sessions_completed"]),
            "average_score": float(trainee["avg_score"]),
            "highest_score": float(trainee.get("highest_score", trainee["avg_score"])),
            "pass_sessions": int(round(trainee["pass_rate"] / 100 * trainee["sessions_completed"])),
        }
        for trainee in report_data["trainee_performance"]
    ]

    pdf_buffer = generator.generate_trainer_batch_report(
        batch_name=report_data["batch"]["name"],
        wave_number=report_data["batch"].get("wave_number"),
        report_period="All Time",
        generated_at=datetime.utcnow(),
        focus_metric="Average Score",
        total_trainees=int(report_data["summary"]["total_trainees"]),
        total_sessions=int(report_data["summary"]["total_sessions"]),
        average_score=float(report_data["summary"]["avg_performance"]),
        pass_rate=float(report_data["summary"]["pass_rate"]),
        average_pronunciation=float(report_data["summary"]["avg_performance"]),
        improvement_rows=improvement_rows,
        pronunciation_rows=pronunciation_rows,
        ranking_rows=ranking_rows,
    )

    return Response(
        content=pdf_buffer.read(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="batch_report_{batch_id[:8]}_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.pdf"',
        },
    )
