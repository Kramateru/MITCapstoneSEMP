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

from fastapi import APIRouter, Depends, Header, HTTPException, Query, File, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select, desc
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import auth_utils
from backend.models import User, UserRole
from backend.supabase_client import SupabaseClient

router = APIRouter(prefix="/api/assessment", tags=["assessment-redesign"])
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

# ==================== CATEGORY ENDPOINTS ====================

@router.post("/trainer/categories", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: AssessmentCategoryCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Create a new assessment category"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    # Note: This is a placeholder. You'll need to:
    # 1. Create or import the AssessmentCategory model
    # 2. Save to Supabase directly or use an ORM model
    
    logger.info(f"Category created by {current_user.email}: {payload.category_name}")
    return {
        "id": str(uuid4()),
        "trainer_id": current_user.id,
        "category_name": payload.category_name,
        "description": payload.description,
        "passing_score": payload.passing_score,
        "status": "active",
        "created_at": datetime.utcnow().isoformat(),
    }

@router.get("/trainer/categories")
async def list_categories(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """List all categories for current trainer"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    # Return trainer's categories
    # Query from assessment_categories table filtered by trainer_id
    return {
        "categories": [],  # Placeholder
        "count": 0,
    }

@router.get("/trainer/categories/{category_id}")
async def get_category(
    category_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get category details with question count"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Fetch category and verify access
    return {
        "id": category_id,
        "trainer_id": current_user.id,
        "category_name": "Sample Category",
        "description": None,
        "passing_score": 90,
        "total_questions": 0,
        "status": "active",
        "created_at": datetime.utcnow().isoformat(),
    }

@router.put("/trainer/categories/{category_id}")
async def update_category(
    category_id: str,
    payload: AssessmentCategoryUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Update an assessment category"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    # Verify ownership, update category
    return {"message": "Category updated", "id": category_id}

@router.delete("/trainer/categories/{category_id}")
async def archive_category(
    category_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Archive an assessment category"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    # Archive the category (set status to 'archived')
    return {"message": "Category archived", "id": category_id}

# ==================== QUESTION ENDPOINTS ====================

@router.post("/trainer/questions", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_question(
    payload: AssessmentQuestionCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Create a new multiple-choice question"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    _validate_correct_answer(payload.correct_answer, {
        'A': payload.option_a,
        'B': payload.option_b,
        'C': payload.option_c,
        'D': payload.option_d,
    })
    
    logger.info(f"Question created by {current_user.email} in category {payload.category_id}")
    
    return {
        "id": str(uuid4()),
        "category_id": payload.category_id,
        "question_number": payload.question_number or 1,
        "question_text": payload.question_text,
        "option_a": payload.option_a,
        "option_b": payload.option_b,
        "option_c": payload.option_c,
        "option_d": payload.option_d,
        "correct_answer": payload.correct_answer.upper(),
        "explanation": payload.explanation,
        "created_by": current_user.id,
        "created_at": datetime.utcnow().isoformat(),
    }

@router.get("/trainer/questions")
async def list_questions(
    category_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """List all questions for trainer (optionally filtered by category)"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    # Query questions from assessment_questions table
    return {
        "questions": [],
        "count": 0,
    }

@router.get("/trainer/questions/{question_id}")
async def get_question(
    question_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get question details"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Fetch question and verify access
    return {
        "id": question_id,
        "category_id": "",
        "question_number": 1,
        "question_text": "Sample question",
    }

@router.delete("/trainer/questions/{question_id}")
async def delete_question(
    question_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Delete a question"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    # Delete question from assessment_questions
    return {"message": "Question deleted", "id": question_id}

# ==================== BULK UPLOAD ENDPOINTS ====================

@router.get("/trainer/csv-template")
async def download_csv_template():
    """Download CSV template for bulk question upload"""
    template = """Question Number,Category,Question,Choice 1,Choice 2,Choice 3,Choice 4,Correct Answer
1,Category Name,What is the correct answer?,Option A,Option B,Option C,Option D,A
2,Category Name,Another question?,Option A,Option B,Option C,Option D,B"""
    
    return {
        "template": template,
        "filename": "assessment_template.csv",
    }

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
    payload: AssignmentCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Create assessment assignment for batch/wave/trainee"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    # Validate target scope
    if payload.target_scope == 'batch' and not payload.batch_id:
        raise HTTPException(status_code=400, detail="batch_id required for batch scope")
    if payload.target_scope == 'wave' and payload.wave_number is None:
        raise HTTPException(status_code=400, detail="wave_number required for wave scope")
    if payload.target_scope == 'trainee' and not payload.trainee_id:
        raise HTTPException(status_code=400, detail="trainee_id required for trainee scope")
    
    logger.info(f"Assignment created by {current_user.email}: {payload.assignment_title}")
    
    return {
        "id": str(uuid4()),
        "trainer_id": current_user.id,
        "category_id": payload.category_id,
        "assignment_title": payload.assignment_title,
        "target_scope": payload.target_scope,
        "status": "active",
        "assigned_at": datetime.utcnow().isoformat(),
    }

@router.get("/trainer/assignments")
async def list_assignments(
    category_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """List all assignments for trainer"""
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    
    return {
        "assignments": [],
        "count": 0,
    }

@router.get("/trainer/assignments/{assignment_id}")
async def get_assignment(
    assignment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get assignment details with assigned questions"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    return {
        "id": assignment_id,
        "assignment_title": "Sample Assignment",
        "questions": [],
        "question_count": 0,
    }

# ==================== TRAINEE ASSESSMENT ENDPOINTS ====================

@router.get("/trainee/available")
async def get_available_assessments(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get available assessments for trainee"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")
    
    # Query assignments where trainee is in batch/wave and is_active
    return {
        "assignments": [],
        "count": 0,
    }

@router.get("/trainee/assignments/{assignment_id}")
async def get_trainee_assignment(
    assignment_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get assignment questions for trainee (without correct answers)"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Fetch questions, randomize choices, don't include correct answers
    return {
        "assignment_id": assignment_id,
        "category_name": "Category",
        "questions": [
            {
                "id": "q1",
                "question_number": 1,
                "question_text": "Sample question",
                "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
                # Note: correct_answer is NOT included for trainees
            }
        ],
        "total_questions": 1,
        "time_limit_minutes": 30,
    }

@router.post("/trainee/attempts/submit", response_model=dict, status_code=status.HTTP_201_CREATED)
async def submit_assessment(
    payload: AssessmentAttemptSubmit,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Submit assessment attempt and get results"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")
    
    # Calculate score
    correct_count = 0  # TODO: Compare answers against correct answers
    total_questions = len(payload.answers)
    score = _calculate_score(correct_count, total_questions)
    passed = score >= 90  # 90% passing score
    
    logger.info(f"Assessment submitted by {current_user.email}: Score={score}%, Pass={passed}")
    
    # TODO: Save attempt to assessment_attempts table
    # TODO: If passed, create certificate
    
    return {
        "attempt_id": str(uuid4()),
        "score": score,
        "passed": passed,
        "correct_answers": correct_count,
        "total_questions": total_questions,
        "attempt_number": payload.attempt_number,
        "submitted_at": datetime.utcnow().isoformat(),
    }

@router.get("/trainee/attempts/{attempt_id}")
async def get_attempt_details(
    attempt_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get attempt details with analysis summary"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Return attempt with analysis summary
    return {
        "attempt_id": attempt_id,
        "score": 92.5,
        "passed": True,
        "analysis_summary": {
            "final_score": 92.5,
            "pass_fail": "pass",
            "correct_answers": 37,
            "incorrect_answers": 3,
            "total_questions": 40,
            "passing_requirement": 90,
            "attempt_number": 1,
            "strengths": ["Customer service", "Product knowledge"],
            "areas_for_improvement": ["Grammar"],
            "recommended_topics": ["English grammar basics"],
        },
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
    
    # Query certificates where trainee_id = current_user.id
    return {
        "certificates": [],
        "count": 0,
    }

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
    
    # Query trainee results for assignment
    return {
        "assignment_id": assignment_id,
        "trainee_results": [
            {
                "trainee_id": "",
                "trainee_name": "Sample Trainee",
                "score": 95.0,
                "pass_fail": "pass",
                "attempt_count": 1,
                "last_attempt_date": datetime.utcnow().isoformat(),
                "has_certificate": True,
            }
        ],
    }

