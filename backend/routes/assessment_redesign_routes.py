"""
Assessment Module Redesign - Complete API Routes
Handles trainer assessment creation, question management, CSV uploads, and trainee attempts
"""

import json
import logging
import csv
import io
from datetime import datetime, timedelta
from typing import Optional, List
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, File, UploadFile, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select, desc
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import auth_utils
from backend.models import User, UserRole
from backend.services.assessment_workspace import (
    archive_category_record,
    build_assessment_csv_template,
    bulk_upload_questions_from_csv,
    create_assignment_record,
    create_assessment_record,
    create_category_record,
    create_question_record,
    delete_assignment_record,
    delete_assessment_record,
    delete_question_record,
    get_trainee_workspace_dashboard,
    get_trainee_workspace_session,
    get_trainer_workspace_bootstrap,
    submit_trainee_workspace_attempt,
    update_assignment_record,
    update_assessment_record,
    update_category_record,
    update_question_record,
)
from backend.supabase_client import SupabaseClient

router = APIRouter(prefix="/api/assessment-module", tags=["assessment-redesign"])
logger = logging.getLogger(__name__)

# ==================== PYDANTIC MODELS ====================

class AssessmentCategoryCreate(BaseModel):
    category_name: str
    description: Optional[str] = None
    passing_score: int = Field(90, ge=0, le=100)

class AssessmentCategoryUpdate(BaseModel):
    category_name: Optional[str] = None
    description: Optional[str] = None
    passing_score: Optional[int] = Field(None, ge=0, le=100)

class AssessmentQuestionCreate(BaseModel):
    category_id: str
    question_number: Optional[int] = None
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_answer: str  # A, B, C, or D
    explanation: Optional[str] = None

class AssignmentCreate(BaseModel):
    category_id: str
    assignment_title: str
    assignment_description: Optional[str] = None
    passing_score: int = Field(90, ge=0, le=100)
    target_scope: str  # batch, wave, or trainee
    batch_id: Optional[str] = None
    wave_number: Optional[int] = None
    trainee_id: Optional[str] = None
    question_ids: Optional[List[str]] = []
    maximum_attempts: Optional[int] = None
    time_limit_minutes: Optional[int] = None
    shuffle_choices: bool = True
    shuffle_questions: bool = False
    due_date: Optional[str] = None

class AssessmentAttemptSubmit(BaseModel):
    assignment_id: Optional[str] = None
    category_id: str
    attempt_number: int
    answers: dict  # question_id -> selected_answer
    time_spent_seconds: int
    
class CertificateIssuePayload(BaseModel):
    attempt_id: str
    category_id: str

# ==================== HELPERS ====================

def _require_trainer(current_user: User) -> None:
    """Ensure user is trainer or admin"""
    if current_user.role not in [UserRole.ADMIN, UserRole.TRAINER]:
        raise HTTPException(status_code=403, detail="Trainer access required")

def _validate_correct_answer(correct_answer: str, options: dict) -> None:
    """Validate correct answer matches one of the four options"""
    if correct_answer.upper() not in ['A', 'B', 'C', 'D']:
        raise HTTPException(status_code=400, detail="Correct answer must be A, B, C, or D")

def _calculate_score(correct_count: int, total_questions: int) -> float:
    """Calculate percentage score"""
    if total_questions == 0:
        return 0.0
    return (correct_count / total_questions) * 100


def _parse_passing_score(value: object) -> int:
    try:
        parsed = int(value if value is not None else 90)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Passing score must be a whole number.") from exc
    if parsed < 0 or parsed > 100:
        raise HTTPException(status_code=400, detail="Passing score must be between 0 and 100.")
    return parsed


def _coerce_optional_positive_int(value: object, field_label: str) -> int | None:
    if value in (None, "", 0):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{field_label} must be a whole number.") from exc
    if parsed < 1:
        raise HTTPException(status_code=400, detail=f"{field_label} must be greater than zero.")
    return parsed


def _coerce_optional_non_negative_int(value: object, field_label: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{field_label} must be a whole number.") from exc
    if parsed < 0:
        raise HTTPException(status_code=400, detail=f"{field_label} cannot be negative.")
    return parsed


def _validate_assessment_type(value: object) -> str:
    normalized = str(value or "multiple_choice").strip().lower()
    if normalized not in {"multiple_choice", "fill_blank", "mixed"}:
        raise HTTPException(status_code=400, detail="Assessment type is invalid.")
    return normalized


def _validate_question_type(value: object) -> str:
    normalized = str(value or "multiple_choice").strip().lower()
    if normalized not in {"multiple_choice", "fill_blank"}:
        raise HTTPException(status_code=400, detail="Question type is invalid.")
    return normalized


def _validate_difficulty(value: object) -> Optional[str]:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return None
    if normalized not in {"easy", "medium", "hard"}:
        raise HTTPException(status_code=400, detail="Difficulty must be easy, medium, or hard.")
    return normalized


def _validate_assignment_target_type(value: object) -> str:
    normalized = str(value or "batch").strip().lower()
    if normalized not in {"batch", "wave", "trainee"}:
        raise HTTPException(status_code=400, detail="Assignment target type is invalid.")
    return normalized


def _validate_assignment_mode(value: object) -> str:
    normalized = str(value or "entire_category").strip().lower()
    if normalized not in {"selected_questions", "entire_category", "random_subset"}:
        raise HTTPException(status_code=400, detail="Assignment mode is invalid.")
    return normalized


@router.get("/trainer/bootstrap")
async def trainer_workspace_bootstrap(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Load the trainer/admin assessment workspace using the primary database connection."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    try:
        return get_trainer_workspace_bootstrap(db, current_user)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error loading trainer workspace bootstrap: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to load the assessment workspace.") from exc

# ==================== CATEGORY ENDPOINTS ====================

@router.post("/trainer/categories", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_category(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Create a new assessment category."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    body = await request.json()
    category = create_category_record(
        db,
        current_user,
        title=(body.get("title") or body.get("category_name") or ""),
        description=(body.get("description") or "").strip() or None,
        passing_score=_parse_passing_score(body.get("passingScore", body.get("passing_score", 90))),
    )
    logger.info("Assessment category created by %s: %s", current_user.email, category["title"])
    return category

@router.get("/trainer/categories")
async def list_categories(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """List all categories for the current trainer/admin workspace."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    workspace = get_trainer_workspace_bootstrap(db, current_user)
    return {
        "categories": workspace["categories"],
        "count": len(workspace["categories"]),
    }

@router.get("/trainer/categories/{category_id}")
async def get_category(
    category_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get category details with workspace-derived metrics."""
    current_user = await auth_utils.get_current_user(authorization, db)
    workspace = get_trainer_workspace_bootstrap(db, current_user)
    category = next((record for record in workspace["categories"] if record["id"] == category_id), None)
    if not category:
        raise HTTPException(status_code=404, detail="Assessment category not found.")
    return category


@router.put("/trainer/categories/{category_id}")
@router.patch("/trainer/categories/{category_id}")
async def update_category(
    category_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Update an assessment category."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    body = await request.json()
    category = update_category_record(
        db,
        current_user,
        category_id,
        title=(body.get("title") or body.get("category_name") or ""),
        description=(body.get("description") or "").strip() or None,
        passing_score=_parse_passing_score(body.get("passingScore", body.get("passing_score", 90))),
    )
    logger.info("Assessment category updated by %s: %s", current_user.email, category_id)
    return category

@router.delete("/trainer/categories/{category_id}")
async def archive_category(
    category_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Archive an assessment category."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    archive_category_record(db, current_user, category_id)
    logger.info("Assessment category archived by %s: %s", current_user.email, category_id)
    return {"message": "Category archived", "id": category_id}

# ==================== ASSESSMENT ENDPOINTS ====================

@router.get("/trainer/assessments")
async def list_assessments(
    category_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    workspace = get_trainer_workspace_bootstrap(db, current_user)
    assessments = [
        assessment
        for category in workspace["categories"]
        for assessment in category.get("assessments", [])
        if not category_id or assessment["categoryId"] == category_id
    ]
    return {"assessments": assessments, "count": len(assessments)}


@router.post("/trainer/assessments", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    body = await request.json()
    assessment = create_assessment_record(
        db,
        current_user,
        category_id=(body.get("categoryId") or "").strip(),
        title=(body.get("title") or ""),
        description=(body.get("description") or "").strip() or None,
        assessment_type=_validate_assessment_type(body.get("type")),
        is_published=bool(body.get("isPublished", True)),
    )
    logger.info("Assessment definition created by %s: %s", current_user.email, assessment["title"])
    return assessment


@router.get("/trainer/assessments/{assessment_id}")
async def get_assessment(
    assessment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    workspace = get_trainer_workspace_bootstrap(db, current_user)
    assessment = next(
        (
            candidate
            for category in workspace["categories"]
            for candidate in category.get("assessments", [])
            if candidate["id"] == assessment_id
        ),
        None,
    )
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment definition not found.")
    return assessment


@router.patch("/trainer/assessments/{assessment_id}")
@router.put("/trainer/assessments/{assessment_id}")
async def update_assessment(
    assessment_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    body = await request.json()
    assessment = update_assessment_record(
        db,
        current_user,
        assessment_id,
        title=(body.get("title") or ""),
        description=(body.get("description") or "").strip() or None,
        assessment_type=_validate_assessment_type(body.get("type")),
        is_published=bool(body.get("isPublished", True)),
    )
    logger.info("Assessment definition updated by %s: %s", current_user.email, assessment_id)
    return assessment


@router.delete("/trainer/assessments/{assessment_id}")
async def delete_assessment(
    assessment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    delete_assessment_record(db, current_user, assessment_id)
    logger.info("Assessment definition deleted by %s: %s", current_user.email, assessment_id)
    return {"message": "Assessment deleted", "id": assessment_id}

# ==================== QUESTION ENDPOINTS ====================

@router.post("/trainer/questions", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_question(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Create a new assessment question."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    body = await request.json()
    question = create_question_record(
        db,
        current_user,
        category_id=(body.get("categoryId") or body.get("category_id") or "").strip() or None,
        assessment_id=(body.get("assessmentId") or body.get("assessment_id") or "").strip() or None,
        question_number=_coerce_optional_positive_int(body.get("questionNumber", body.get("question_number")), "Question Number"),
        question_text=(body.get("questionText") or body.get("question_text") or ""),
        question_type=_validate_question_type(body.get("questionType", body.get("question_type"))),
        options=body.get("options") or [
            body.get("option_a") or body.get("option_a".upper()) or "",
            body.get("option_b") or body.get("option_b".upper()) or "",
            body.get("option_c") or body.get("option_c".upper()) or "",
            body.get("option_d") or body.get("option_d".upper()) or "",
        ],
        correct_answer=(body.get("correctAnswer") or body.get("correct_answer") or ""),
        difficulty=_validate_difficulty(body.get("difficulty")),
        explanation=(body.get("explanation") or "").strip() or None,
        points=_coerce_optional_positive_int(body.get("points"), "Points"),
        order_index=_coerce_optional_non_negative_int(body.get("orderIndex", body.get("order_index")), "Order index"),
    )
    logger.info("Assessment question created by %s: %s", current_user.email, question["id"])
    return question

@router.get("/trainer/questions")
async def list_questions(
    category_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """List assessment questions for the trainer/admin workspace."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    workspace = get_trainer_workspace_bootstrap(db, current_user)
    questions = [
        question
        for question in workspace["questions"]
        if not category_id or question["categoryId"] == category_id
    ]
    return {"questions": questions, "count": len(questions)}

@router.get("/trainer/questions/{question_id}")
async def get_question(
    question_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get question details."""
    current_user = await auth_utils.get_current_user(authorization, db)
    workspace = get_trainer_workspace_bootstrap(db, current_user)
    question = next((record for record in workspace["questions"] if record["id"] == question_id), None)
    if not question:
        raise HTTPException(status_code=404, detail="Assessment question not found.")
    return question


@router.patch("/trainer/questions/{question_id}")
@router.put("/trainer/questions/{question_id}")
async def update_question(
    question_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    body = await request.json()
    question = update_question_record(
        db,
        current_user,
        question_id,
        category_id=(body.get("categoryId") or body.get("category_id") or "").strip() or None,
        assessment_id=(body.get("assessmentId") or body.get("assessment_id") or "").strip() or None,
        question_number=_coerce_optional_positive_int(body.get("questionNumber", body.get("question_number")), "Question Number"),
        question_text=(body.get("questionText") or body.get("question_text") or ""),
        question_type=_validate_question_type(body.get("questionType", body.get("question_type"))),
        options=body.get("options") or [
            body.get("option_a") or body.get("option_a".upper()) or "",
            body.get("option_b") or body.get("option_b".upper()) or "",
            body.get("option_c") or body.get("option_c".upper()) or "",
            body.get("option_d") or body.get("option_d".upper()) or "",
        ],
        correct_answer=(body.get("correctAnswer") or body.get("correct_answer") or ""),
        difficulty=_validate_difficulty(body.get("difficulty")),
        explanation=(body.get("explanation") or "").strip() or None,
        points=_coerce_optional_positive_int(body.get("points"), "Points"),
        order_index=_coerce_optional_non_negative_int(body.get("orderIndex", body.get("order_index")), "Order index"),
    )
    logger.info("Assessment question updated by %s: %s", current_user.email, question_id)
    return question

@router.delete("/trainer/questions/{question_id}")
async def delete_question(
    question_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Delete a question."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    delete_question_record(db, current_user, question_id)
    logger.info("Assessment question deleted by %s: %s", current_user.email, question_id)
    return {"message": "Question deleted", "id": question_id}

# ==================== BULK UPLOAD ENDPOINTS ====================

@router.get("/trainer/csv-template")
async def download_csv_template():
    """Download CSV template for bulk question upload"""
    return {
        "template": build_assessment_csv_template(),
        "filename": "assessment_template.csv",
    }


@router.post("/trainer/questions/bulk-upload")
async def bulk_upload_workspace_questions(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Bulk upload assessment questions using the workspace CSV template."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    try:
        contents = await file.read()
        csv_text = contents.decode("utf-8-sig")
        return bulk_upload_questions_from_csv(db, current_user, csv_text)
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="The uploaded file must be a valid UTF-8 CSV.") from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Workspace CSV upload error: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to process the assessment CSV upload.") from exc

@router.post("/trainer/bulk-upload")
async def bulk_upload_questions(
    file: UploadFile = File(...),
    category_id: str = Query(...),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Bulk upload questions via CSV to assessment_questions table"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    try:
        # Initialize Supabase client
        supabase_client = SupabaseClient()
        if not supabase_client.client:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        # Read CSV file
        contents = await file.read()
        stream = io.StringIO(contents.decode('utf-8'))
        reader = csv.DictReader(stream)
        
        successful = 0
        failed = 0
        errors = []
        created_question_ids = []
        
        if not reader.fieldnames:
            raise HTTPException(status_code=400, detail="CSV file is empty or invalid")
        
        # Verify category exists
        try:
            category_response = supabase_client.client.table('assessment_categories').select('*').eq('id', category_id).single().execute()
            if not category_response.data:
                raise ValueError("Category not found")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid category ID: {str(e)}")
        
        # Process each row
        for row_num, row in enumerate(reader, start=2):  # Start at 2 (skip header)
            try:
                # Validate required fields from CSV
                required_fields = ['Question Number', 'Question', 'Choice 1', 'Choice 2', 'Choice 3', 'Choice 4', 'Correct Answer']
                missing_fields = []
                for field in required_fields:
                    if field not in reader.fieldnames:
                        missing_fields.append(field)
                    elif not row.get(field, '').strip():
                        missing_fields.append(field)
                
                if missing_fields:
                    raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")
                
                # Parse and validate data
                try:
                    question_number = int(row['Question Number'].strip())
                except ValueError:
                    raise ValueError("Question Number must be an integer")
                
                question_text = row['Question'].strip()
                choice_1 = row['Choice 1'].strip()
                choice_2 = row['Choice 2'].strip()
                choice_3 = row['Choice 3'].strip()
                choice_4 = row['Choice 4'].strip()
                correct_answer = row['Correct Answer'].strip().upper()
                
                # Validate answer format
                if correct_answer not in ['A', 'B', 'C', 'D']:
                    raise ValueError("Correct Answer must be one of: A, B, C, D")
                
                # Validate question text length
                if len(question_text) < 5:
                    raise ValueError("Question text must be at least 5 characters")
                
                # Check for duplicate question in category
                try:
                    dup_check = supabase_client.client.table('assessment_questions').select('id').eq(
                        'category_id', category_id
                    ).eq('question_number', question_number).execute()
                    if dup_check.data and len(dup_check.data) > 0:
                        raise ValueError(f"Question number {question_number} already exists in this category")
                except Exception as e:
                    if "already exists" not in str(e):
                        logger.debug(f"Duplicate check error: {e}")
                    if "already exists" in str(e):
                        raise
                
                # Prepare question data
                question_data = {
                    'category_id': category_id,
                    'question_number': question_number,
                    'question_text': question_text,
                    'option_a': choice_1,
                    'option_b': choice_2,
                    'option_c': choice_3,
                    'option_d': choice_4,
                    'correct_answer': correct_answer,
                    'created_by': current_user.id,
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat(),
                }
                
                # Insert into Supabase
                insert_response = supabase_client.client.table('assessment_questions').insert(question_data).execute()
                
                if insert_response.data:
                    successful += 1
                    created_question_ids.append(insert_response.data[0]['id'] if isinstance(insert_response.data, list) else insert_response.data['id'])
                    logger.info(f"Question {question_number} uploaded successfully")
                else:
                    failed += 1
                    errors.append({
                        "row": row_num,
                        "question_number": question_number,
                        "error": "Failed to insert question (no response data)",
                    })
                
            except ValueError as e:
                failed += 1
                errors.append({
                    "row": row_num,
                    "question_number": row.get('Question Number', 'N/A'),
                    "error": str(e),
                })
            except Exception as e:
                failed += 1
                error_msg = str(e)
                # Clean up error message for sensitive details
                if 'UNIQUE constraint failed' in error_msg:
                    error_msg = "Question already exists in this category"
                errors.append({
                    "row": row_num,
                    "question_number": row.get('Question Number', 'N/A'),
                    "error": error_msg,
                })
        
        logger.info(f"Bulk upload completed: {successful} successful, {failed} failed by trainer {current_user.email}")
        
        return {
            "status": "completed",
            "total_rows": successful + failed,
            "successful": successful,
            "failed": failed,
            "created_question_ids": created_question_ids,
            "errors": errors[:20],  # Return first 20 errors
            "message": f"Uploaded {successful} question(s)" + (f" with {failed} error(s)" if failed > 0 else ""),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CSV upload error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"File processing error: {str(e)}")

# ==================== ASSIGNMENT ENDPOINTS ====================

@router.post("/trainer/assignments", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Create an assessment assignment."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    body = await request.json()
    assignment = create_assignment_record(
        db,
        current_user,
        category_id=(body.get("categoryId") or body.get("category_id") or "").strip(),
        assessment_id=(body.get("assessmentId") or body.get("assessment_id") or "").strip() or None,
        target_type=_validate_assignment_target_type(body.get("targetType", body.get("target_scope"))),
        batch_id=(body.get("batchId") or body.get("batch_id") or "").strip() or None,
        wave_number=_coerce_optional_positive_int(body.get("waveNumber", body.get("wave_number")), "Wave number"),
        trainee_id=(body.get("traineeId") or body.get("trainee_id") or "").strip() or None,
        due_at=(body.get("dueAt") or body.get("due_date") or body.get("due_at") or "").strip() or None,
        title=(body.get("title") or body.get("assignment_title") or ""),
        description=(body.get("description") or body.get("assignment_description") or "").strip() or None,
        assignment_mode=_validate_assignment_mode(body.get("assignmentMode", body.get("assignment_mode"))),
        question_ids=body.get("questionIds") or body.get("question_ids") or [],
        random_question_count=_coerce_optional_positive_int(body.get("randomQuestionCount", body.get("random_question_count")), "Random question count"),
        passing_score=_parse_passing_score(body.get("passingScore", body.get("passing_score", 90))),
        maximum_attempts=_coerce_optional_positive_int(body.get("maximumAttempts", body.get("maximum_attempts")), "Maximum attempts"),
        time_limit_minutes=_coerce_optional_positive_int(body.get("timeLimitMinutes", body.get("time_limit_minutes")), "Time limit"),
        shuffle_choices=bool(body.get("shuffleChoices", body.get("shuffle_choices", True))),
        shuffle_questions=bool(body.get("shuffleQuestions", body.get("shuffle_questions", False))),
    )
    logger.info("Assessment assignment created by %s: %s", current_user.email, assignment["id"])
    return assignment

@router.get("/trainer/assignments")
async def list_assignments(
    category_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """List assignments for the trainer/admin workspace."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    workspace = get_trainer_workspace_bootstrap(db, current_user)
    assignments = [
        assignment
        for assignment in workspace["assignments"]
        if not category_id or assignment["categoryId"] == category_id
    ]
    return {"assignments": assignments, "count": len(assignments)}

@router.get("/trainer/assignments/{assignment_id}")
async def get_assignment(
    assignment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get assignment details."""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    workspace = get_trainer_workspace_bootstrap(db, current_user)
    assignment = next((record for record in workspace["assignments"] if record["id"] == assignment_id), None)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assessment assignment not found.")
    return assignment


@router.patch("/trainer/assignments/{assignment_id}")
@router.put("/trainer/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    body = await request.json()
    assignment = update_assignment_record(
        db,
        current_user,
        assignment_id,
        category_id=(body.get("categoryId") or body.get("category_id") or "").strip(),
        assessment_id=(body.get("assessmentId") or body.get("assessment_id") or "").strip() or None,
        target_type=_validate_assignment_target_type(body.get("targetType", body.get("target_scope"))),
        batch_id=(body.get("batchId") or body.get("batch_id") or "").strip() or None,
        wave_number=_coerce_optional_positive_int(body.get("waveNumber", body.get("wave_number")), "Wave number"),
        trainee_id=(body.get("traineeId") or body.get("trainee_id") or "").strip() or None,
        due_at=(body.get("dueAt") or body.get("due_date") or body.get("due_at") or "").strip() or None,
        title=(body.get("title") or body.get("assignment_title") or ""),
        description=(body.get("description") or body.get("assignment_description") or "").strip() or None,
        assignment_mode=_validate_assignment_mode(body.get("assignmentMode", body.get("assignment_mode"))),
        question_ids=body.get("questionIds") or body.get("question_ids") or [],
        random_question_count=_coerce_optional_positive_int(body.get("randomQuestionCount", body.get("random_question_count")), "Random question count"),
        passing_score=_parse_passing_score(body.get("passingScore", body.get("passing_score", 90))),
        maximum_attempts=_coerce_optional_positive_int(body.get("maximumAttempts", body.get("maximum_attempts")), "Maximum attempts"),
        time_limit_minutes=_coerce_optional_positive_int(body.get("timeLimitMinutes", body.get("time_limit_minutes")), "Time limit"),
        shuffle_choices=bool(body.get("shuffleChoices", body.get("shuffle_choices", True))),
        shuffle_questions=bool(body.get("shuffleQuestions", body.get("shuffle_questions", False))),
    )
    logger.info("Assessment assignment updated by %s: %s", current_user.email, assignment_id)
    return assignment


@router.delete("/trainer/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    delete_assignment_record(db, current_user, assignment_id)
    logger.info("Assessment assignment deleted by %s: %s", current_user.email, assignment_id)
    return {"message": "Assignment deleted", "id": assignment_id}

# ==================== TRAINEE ASSESSMENT ENDPOINTS ====================

@router.get("/trainee/available")
async def get_available_assessments(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Legacy alias for trainee dashboard availability."""
    current_user = await auth_utils.get_current_user(authorization, db)
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")

    dashboard = get_trainee_workspace_dashboard(db, current_user)
    return {
        "assignments": dashboard["availableAssessments"],
        "count": len(dashboard["availableAssessments"]),
    }


@router.get("/trainee/dashboard")
async def get_trainee_dashboard(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")

    return get_trainee_workspace_dashboard(db, current_user)

@router.get("/trainee/assignments/{assignment_id}")
async def get_trainee_assignment(
    assignment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")

    return get_trainee_workspace_session(db, current_user, assignment_id)


@router.post("/trainee/attempts", response_model=dict, status_code=status.HTTP_201_CREATED)
async def submit_assessment_attempt(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")
    payload = await request.json()
    result = submit_trainee_workspace_attempt(db, current_user, payload)
    logger.info("Assessment attempt saved by %s for assignment %s", current_user.email, payload.get("assignmentId") or payload.get("assignment_id"))
    return result


@router.post("/trainee/attempts/submit", response_model=dict, status_code=status.HTTP_201_CREATED)
async def submit_assessment_legacy(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Legacy alias for trainee attempt submission."""
    return await submit_assessment_attempt(request, authorization, db)

@router.get("/trainee/attempts/{attempt_id}")
async def get_attempt_details(
    attempt_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")

    dashboard = get_trainee_workspace_dashboard(db, current_user)
    attempt = next((row for row in dashboard["attempts"] if row["id"] == attempt_id), None)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    return {
        "attempt_id": attempt_id,
        "score": attempt["score"],
        "passed": attempt["status"] == "pass",
        "correct_answers": attempt.get("correctAnswers", 0),
        "incorrect_answers": attempt.get("incorrectAnswers", 0),
        "total_questions": attempt.get("totalQuestions", 0),
        "submitted_at": attempt.get("submittedAt"),
        "question_results": attempt.get("questionResults", []),
        "attempt": attempt,
    }

# ==================== CERTIFICATE ENDPOINTS ====================

@router.get("/trainee/certificates")
async def get_trainee_certificates(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get certificates earned by trainee"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")
    
    try:
        supabase_client = SupabaseClient()
        if not supabase_client.client:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        # Query certificates for this trainee
        response = supabase_client.client.table('training_assessment_certificates').select(
            '*, training_assessment_categories(*), training_assessments(*)'
        ).eq('trainee_id', current_user.id).order('earned_at', desc=True).execute()
        
        certificates = response.data or []
        return {
            "certificates": certificates,
            "count": len(certificates),
        }
    except Exception as e:
        logger.error(f"Error getting certificates: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== TRAINER PROGRESS & EVALUATION ====================

@router.get("/trainer/progress")
async def get_trainer_progress(
    category_id: Optional[str] = Query(None),
    batch_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get assessment progress summary for trainer"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    # Query from assessment_progress_summary view
    return {
        "progress": [],
        "statistics": {
            "total_assignments": 0,
            "total_trainees": 0,
            "avg_score": 0.0,
            "pass_rate": 0.0,
        },
    }

@router.get("/trainer/evaluations/{assignment_id}")
async def get_assignment_evaluations(
    assignment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get detailed evaluation for assignment"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    workspace = get_trainer_workspace_bootstrap(db, current_user)
    assignment = next((row for row in workspace.get("assignments", []) if row.get("id") == assignment_id), None)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    attempts = [row for row in workspace.get("attempts", []) if row.get("assignmentId") == assignment_id]
    latest_attempts_by_trainee = {}
    for attempt in sorted(
        attempts,
        key=lambda row: row.get("completedAt") or row.get("submittedAt") or "",
        reverse=True,
    ):
        trainee_id = attempt.get("traineeId") or ""
        if trainee_id and trainee_id not in latest_attempts_by_trainee:
            latest_attempts_by_trainee[trainee_id] = attempt

    return {
        "assignment_id": assignment_id,
        "assignment_title": assignment.get("title") or assignment.get("assessmentTitle") or assignment.get("categoryTitle"),
        "trainee_results": [
            {
                "trainee_id": trainee_id,
                "trainee_name": attempt.get("traineeName") or "Trainee",
                "score": float(attempt.get("score") or 0.0),
                "pass_fail": attempt.get("status") or "assigned",
                "attempt_count": len(
                    [
                        row
                        for row in attempts
                        if (row.get("traineeId") or "") == trainee_id
                    ]
                ),
                "last_attempt_date": attempt.get("completedAt") or attempt.get("submittedAt"),
                "has_certificate": bool(attempt.get("certificateCode")),
            }
            for trainee_id, attempt in latest_attempts_by_trainee.items()
        ],
    }
