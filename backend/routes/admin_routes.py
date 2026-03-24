"""
Admin Portal Routes
Handles scenario creation, assessment categories, KPI configuration, and user management
"""

import csv
import io
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import (
    AssessmentCategory,
    Batch,
    CertificationSettings,
    Course,
    CourseAssignment,
    FeedbackType,
    KPIConfiguration,
    LineOfBusiness,
    MCQAssessment,
    MCQCategory,
    MCQQuestion,
    MCQSubmission,
    PracticeSession,
    Scenario,
    ScenarioDifficulty,
    ScenarioFlow,
    ScenarioPurpose,
    SystemLog,
    User,
    UserRole,
)
from ..services.lob_catalog import (
    list_active_lobs,
    rename_lob_references,
    serialize_lobs,
    sync_default_lob_catalog,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
DEFAULT_ADMIN_PASSWORD = "SPVAdmin2026"
DEFAULT_TRAINER_PASSWORD = "SPVTrainer2026"
DEFAULT_TRAINEE_PASSWORD = "SPVTrainee2026"
ALL_LOB_ACCESS_LABEL = "All LOBs"


# ==================== Pydantic Models ====================


class ScenarioFlowCreate(BaseModel):
    step_number: int
    step_type: str  # "agent_response", "customer_prompt", "logic_branch"
    prompt_text: Optional[str] = None
    expected_response: Optional[str] = None
    expected_keywords_for_step: Optional[List[str]] = None
    condition_type: Optional[str] = None
    condition_value: Optional[str] = None
    jump_to_step: Optional[int] = None
    alternative_step: Optional[int] = None
    is_closing: bool = False
    response_time_limit: Optional[int] = None


class ScenarioCreate(BaseModel):
    title: str
    description: Optional[str] = None
    purpose: ScenarioPurpose = ScenarioPurpose.PRACTICE
    difficulty: ScenarioDifficulty = ScenarioDifficulty.BASIC
    lob: Optional[str] = None
    opening_prompt: str
    opening_prompt_audio: Optional[str] = None
    expected_keywords: Optional[List[str]] = None
    estimated_duration: Optional[int] = None
    flow_steps: Optional[List[ScenarioFlowCreate]] = None


class ScenarioUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    purpose: Optional[ScenarioPurpose] = None
    difficulty: Optional[ScenarioDifficulty] = None
    expected_keywords: Optional[List[str]] = None
    is_published: Optional[bool] = None


class AssessmentCategoryCreate(BaseModel):
    name: str
    category_type: FeedbackType
    description: Optional[str] = None
    min_score: float = 0.0
    max_score: float = 100.0
    passing_threshold: float = 70.0
    scoring_rules: Optional[dict] = None
    weight: float = 1.0


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


class LineOfBusinessCreate(BaseModel):
    name: str
    description: Optional[str] = None


class LineOfBusinessUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class SampleDataSeedRequest(BaseModel):
    """Optional flags for sample-data seeding."""

    reset_sample_scenarios: bool = False


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
            attempt_number=1,
        )
        db.add(session)

    session.transcription_confidence = 0.94
    session.accuracy_score = accuracy_score
    session.fluency_score = fluency_score
    session.clarity_score = clarity_score
    session.keyword_adherence_score = keyword_adherence_score
    session.soft_skills_score = soft_skills_score
    session.overall_score = overall_score
    session.response_duration = response_duration
    session.dead_air_time = 2
    session.volume_level = 0.81
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


# ==================== Scenario Management ====================


@router.post("/scenarios", response_model=dict)
async def create_scenario(
    scenario: ScenarioCreate,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Create a new scenario with branching flow"""
    try:
        new_scenario = Scenario(
            title=scenario.title,
            description=scenario.description,
            purpose=scenario.purpose,
            difficulty=scenario.difficulty,
            lob=scenario.lob,
            opening_prompt=scenario.opening_prompt,
            opening_prompt_audio=scenario.opening_prompt_audio,
            expected_keywords=scenario.expected_keywords or [],
            estimated_duration=scenario.estimated_duration,
            created_by=current_user.id,
            is_draft=True,
        )

        db.add(new_scenario)
        db.flush()  # Get the ID without committing

        # Add flow steps if provided
        if scenario.flow_steps:
            for step_data in scenario.flow_steps:
                flow_step = ScenarioFlow(
                    scenario_id=new_scenario.id, **step_data.dict()
                )
                db.add(flow_step)

        db.commit()

        log_admin_action(
            db,
            current_user.id,
            "created_scenario",
            "Scenario",
            new_scenario.id,
            {"title": scenario.title},
        )

        return {
            "id": new_scenario.id,
            "title": new_scenario.title,
            "status": "created",
            "is_draft": True,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scenarios")
async def list_scenarios(
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 50,
    difficulty: Optional[ScenarioDifficulty] = None,
):
    """List all scenarios with filtering"""
    query = db.query(Scenario)

    if difficulty:
        query = query.filter(Scenario.difficulty == difficulty)

    scenarios = query.offset(skip).limit(limit).all()

    return {
        "count": len(scenarios),
        "scenarios": [
            {
                "id": s.id,
                "title": s.title,
                "difficulty": s.difficulty,
                "purpose": s.purpose,
                "is_draft": s.is_draft,
                "is_published": s.is_published,
                "created_at": s.created_at,
                "flow_steps_count": len(s.flow_steps),
            }
            for s in scenarios
        ],
    }


@router.put("/scenarios/{scenario_id}")
async def update_scenario(
    scenario_id: str,
    scenario_update: ScenarioUpdate,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Update scenario details"""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    changes = {}

    if scenario_update.title:
        changes["title"] = {"old": scenario.title, "new": scenario_update.title}
        scenario.title = scenario_update.title

    if scenario_update.difficulty:
        changes["difficulty"] = {
            "old": scenario.difficulty,
            "new": scenario_update.difficulty,
        }
        scenario.difficulty = scenario_update.difficulty

    if scenario_update.is_published is not None:
        changes["is_published"] = {
            "old": scenario.is_published,
            "new": scenario_update.is_published,
        }
        scenario.is_published = scenario_update.is_published
        scenario.is_draft = not scenario_update.is_published

    scenario.updated_at = datetime.utcnow()
    db.commit()

    log_admin_action(
        db, current_user.id, "updated_scenario", "Scenario", scenario_id, changes
    )

    return {"status": "updated", "scenario_id": scenario_id}


@router.post("/scenarios/{scenario_id}/publish")
async def publish_scenario(
    scenario_id: str,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Publish a scenario (make it available for trainees)"""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    scenario.is_published = True
    scenario.is_draft = False
    db.commit()

    log_admin_action(db, current_user.id, "published_scenario", "Scenario", scenario_id)

    return {"status": "published", "scenario_id": scenario_id}


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
        "categories": [
            {
                "id": c.id,
                "name": c.name,
                "category_type": c.category_type,
                "weight": c.weight,
                "passing_threshold": c.passing_threshold,
            }
            for c in categories
        ],
    }


@router.post("/scenarios/{scenario_id}/assessment-categories/{category_id}")
async def link_assessment_to_scenario(
    scenario_id: str,
    category_id: str,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Link an assessment category to a scenario"""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    category = (
        db.query(AssessmentCategory)
        .filter(AssessmentCategory.id == category_id)
        .first()
    )

    if not scenario or not category:
        raise HTTPException(status_code=404, detail="Scenario or category not found")

    if category not in scenario.assessment_categories:
        scenario.assessment_categories.append(category)
        db.commit()

        log_admin_action(
            db,
            current_user.id,
            "linked_assessment_to_scenario",
            "Scenario",
            scenario_id,
            {"category_id": category_id},
        )

    return {"status": "linked", "scenario_id": scenario_id, "category_id": category_id}


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
    temporary_password = user_data.password or default_passwords[user_data.role]

    new_user = User(
        email=normalized_email,
        full_name=user_data.full_name.strip(),
        password_hash=auth_utils.hash_password(temporary_password),
        role=user_data.role,
        lob=ALL_LOB_ACCESS_LABEL,
        department=None,
        language_dialect=user_data.language_dialect,
    )

    db.add(new_user)
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
                new_user = User(
                    email=row["email"],
                    full_name=row["full_name"],
                    password_hash=auth_utils.hash_password(temporary_password),
                    role=role,
                    lob=row.get("lob"),
                    department=row.get("department"),
                    language_dialect=row.get("language_dialect", "en-US"),
                )

                db.add(new_user)
                created_count += 1

            except KeyError as e:
                errors.append(f"Row {idx}: Invalid role value")
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
    skip: int = 0,
    limit: int = 50,
):
    """List all users with optional filtering by role"""
    query = db.query(User).filter(User.is_active == True)

    if role:
        query = query.filter(User.role == role)

    users = query.offset(skip).limit(limit).all()

    return {
        "count": len(users),
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role,
                "lob": u.lob,
                "created_at": u.created_at,
            }
            for u in users
        ],
    }


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
    }

    lob_sync = sync_default_lob_catalog(db, deactivate_missing=True)
    summary["lobs_created"] += lob_sync["created"]

    users = {}
    for user_seed in [
        {
            "email": "admin@stpeterville.edu.ph",
            "full_name": "Admin User",
            "role": UserRole.ADMIN,
            "password": "Admin@SPV",
            "lob": "Customer Service",
            "department": "Management",
            "language_dialect": "en-US",
        },
        {
            "email": "trainer@st.peterville.edu.ph",
            "full_name": "Trainer User",
            "role": UserRole.TRAINER,
            "password": "Trainer@123",
            "lob": "Customer Service",
            "department": "Operations",
            "language_dialect": "en-US",
        },
        {
            "email": "mcureta@fatima.edu.ph",
            "full_name": "Maria Cureta",
            "role": UserRole.TRAINEE,
            "password": "SPVTrainee2026",
            "lob": "Billing & Payments",
            "department": "Wave 1",
            "language_dialect": "en-PH",
        },
        {
            "email": "sample.trainee1@stpeterville.edu.ph",
            "full_name": "Alyssa Ramos",
            "role": UserRole.TRAINEE,
            "password": DEFAULT_TRAINEE_PASSWORD,
            "lob": "Customer Service",
            "department": "Wave 1",
            "language_dialect": "en-PH",
        },
        {
            "email": "sample.trainee2@stpeterville.edu.ph",
            "full_name": "Noah Santos",
            "role": UserRole.TRAINEE,
            "password": DEFAULT_TRAINEE_PASSWORD,
            "lob": "Technical Support",
            "department": "Wave 1",
            "language_dialect": "en-US",
        },
    ]:
        user, created = _ensure_user(db, **user_seed)
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
    cert_settings.contact_email = "training@stpeterville.edu.ph"
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

    trainer_user = users["trainer@st.peterville.edu.ph"]
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
        users["sample.trainee1@stpeterville.edu.ph"],
        users["sample.trainee2@stpeterville.edu.ph"],
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

    for (
        trainee,
        scenario,
        transcription,
        overall_score,
        accuracy_score,
        fluency_score,
        clarity_score,
        keyword_adherence_score,
        soft_skills_score,
        response_duration,
        filler_words,
        keyword_hits,
    ) in [
        (
            users["mcureta@fatima.edu.ph"],
            scenario_lookup["Billing Dispute Resolution"],
            "I am sorry for the duplicate charge. Let me verify your account, review the refund request, and give you the timeline today.",
            88.5,
            90.0,
            86.0,
            87.0,
            91.0,
            88.0,
            112,
            ["um"],
            ["verify", "refund", "timeline"],
        ),
        (
            users["sample.trainee1@stpeterville.edu.ph"],
            scenario_lookup["Account Verification and Refund Inquiry"],
            "I can verify your account details first and then explain the refund policy and the next steps clearly.",
            84.2,
            85.0,
            82.0,
            84.0,
            83.0,
            87.0,
            94,
            [],
            ["verify", "refund", "policy"],
        ),
        (
            users["sample.trainee2@stpeterville.edu.ph"],
            scenario_lookup["Service Outage Escalation Call"],
            "I understand how frustrating this outage is. I will troubleshoot with you, create an escalation ticket, and stay accountable for the update.",
            91.4,
            92.0,
            90.0,
            89.0,
            93.0,
            93.0,
            138,
            ["uh"],
            ["troubleshoot", "escalate", "ticket"],
        ),
    ]:
        _, created = _ensure_practice_session(
            db,
            user_id=trainee.id,
            scenario_id=scenario.id,
            transcription=transcription,
            overall_score=overall_score,
            accuracy_score=accuracy_score,
            fluency_score=fluency_score,
            clarity_score=clarity_score,
            keyword_adherence_score=keyword_adherence_score,
            soft_skills_score=soft_skills_score,
            response_duration=response_duration,
            filler_words=filler_words,
            keyword_hits=keyword_hits,
        )
        summary["practice_sessions_created"] += int(created)

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
    _, submission_created = _ensure_mcq_submission(
        db,
        assessment_id=mcq_assessment.id,
        trainee_id=users["mcureta@fatima.edu.ph"].id,
        answers=answers,
        score_percentage=100.0,
        is_passed=True,
    )
    summary["mcq_submissions_created"] += int(submission_created)

    db.commit()

    return {
        "summary": summary,
        "credentials": {
            "admin": {"email": "admin@stpeterville.edu.ph", "password": "Admin@SPV"},
            "trainer": {"email": "trainer@st.peterville.edu.ph", "password": "Trainer@123"},
            "trainee": {"email": "mcureta@fatima.edu.ph", "password": "SPVTrainee2026"},
        },
    }


@router.post("/seed-sample-data")
async def seed_sample_data(
    payload: SampleDataSeedRequest,
    current_user: Any = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Seed a reusable sample dataset into the active database."""
    try:
        seeded = _seed_sample_dataset(
            db,
            admin_user=current_user,
            reset_sample_scenarios=payload.reset_sample_scenarios,
        )
        log_admin_action(
            db,
            current_user.id,
            "seeded_sample_data",
            "SampleData",
            "",
            seeded["summary"],
        )
        return {"status": "seeded", **seeded}
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to seed sample data: {exc}")


# ==================== Analytics & Reports ====================


@router.get("/dashboard")
async def admin_dashboard(
    current_user: Any = Depends(verify_admin), db: Session = Depends(get_db)
):
    """Admin dashboard with system overview"""
    total_users = db.query(User).filter(User.is_active == True).count()
    total_scenarios = db.query(Scenario).filter(Scenario.is_published == True).count()
    total_sessions = db.query(PracticeSession).count()

    trainee_count = db.query(User).filter(User.role == UserRole.TRAINEE).count()
    trainer_count = db.query(User).filter(User.role == UserRole.TRAINER).count()

    # Get average overall score
    from sqlalchemy import func

    avg_score = db.query(func.avg(PracticeSession.overall_score)).scalar() or 0

    return {
        "total_users": total_users,
        "total_trainees": trainee_count,
        "total_trainers": trainer_count,
        "total_scenarios": total_scenarios,
        "total_sessions": total_sessions,
        "average_score": round(avg_score, 2),
        "timestamp": datetime.utcnow(),
    }
