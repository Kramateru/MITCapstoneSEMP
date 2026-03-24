"""
Trainer Portal Routes
Handles batch management, course assignment, interaction reviewing, and coaching
"""

import csv
import io
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Depends as FastAPIDepends,
    File,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import SessionLocal, get_db
from ..models import (
    batch_user_association,
    Batch,
    Course,
    CourseAssignment,
    Feedback,
    FeedbackType,
    MicrolearningModule,
    PerformanceMetrics,
    PracticeSession,
    Scenario,
    User,
    UserRole,
)
from ..services.live_updates import live_update_manager

router = APIRouter(prefix="/api/trainer", tags=["trainer"])
DEFAULT_TRAINEE_PASSWORD = "SPVTrainee2026"
TRAINER_BULK_UPLOAD_TEMPLATE = "trainer-trainee-bulk-upload-template.xlsx"


def Depends(dependency=None):
    """Default empty Depends() to DB session in this module."""
    return FastAPIDepends(get_db if dependency is None else dependency)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _normalize_header(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (header or "").strip().lower()).strip("_")


def _normalize_text_value(value: Any) -> str:
    return str(value or "").strip()


def _derive_batch_name(name: Optional[str], wave_number: Optional[int]) -> str:
    normalized_name = _normalize_text_value(name)
    if normalized_name:
        return normalized_name
    if wave_number is not None:
        return f"Batch {wave_number}"
    raise HTTPException(status_code=400, detail="Provide a batch name or batch number")


def _get_trainer_batch(
    db: Session,
    *,
    trainer_id: str,
    batch_id: str,
) -> Batch:
    batch = (
        db.query(Batch)
        .filter(Batch.id == batch_id, Batch.created_by == trainer_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


def _resolve_batch_lookup(
    db: Session,
    *,
    trainer_id: str,
    batch_lookup: str,
) -> Optional[Batch]:
    raw_lookup = _normalize_text_value(batch_lookup)
    if not raw_lookup:
        return None

    base_query = db.query(Batch).filter(Batch.created_by == trainer_id)
    direct_match = (
        base_query.filter(func.lower(Batch.name) == raw_lookup.lower()).first()
    )
    if direct_match:
        return direct_match

    numeric_match = re.search(r"(\d+)", raw_lookup)
    if numeric_match:
        wave_number = int(numeric_match.group(1))
        return (
            base_query
            .filter(Batch.wave_number == wave_number)
            .order_by(Batch.created_at.desc())
            .first()
        )

    return None


def _build_batch_department_label(batch: Batch) -> str:
    if batch.name:
        return batch.name
    if batch.wave_number is not None:
        return f"Wave {batch.wave_number}"
    return "Unassigned Batch"


def _serialize_batch(batch: Optional[Batch]) -> Optional[Dict[str, Any]]:
    if not batch:
        return None
    return {
        "id": batch.id,
        "name": batch.name,
        "wave_number": batch.wave_number,
        "lob": batch.lob,
    }


def _serialize_trainee(user: User, batch: Optional[Batch]) -> Dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "lob": user.lob,
        "department": user.department,
        "batch": _serialize_batch(batch),
    }


def _create_trainee_account(
    db: Session,
    *,
    email: str,
    full_name: str,
    batch: Batch,
    password: Optional[str] = None,
) -> User:
    normalized_email = _normalize_email(email)
    if not normalized_email:
        raise ValueError("Email address is required")

    normalized_name = _normalize_text_value(full_name)
    if not normalized_name:
        raise ValueError("Full name is required")

    existing_user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if existing_user:
        raise ValueError(f"Email {normalized_email} already exists")

    temporary_password = password or DEFAULT_TRAINEE_PASSWORD
    new_user = User(
        email=normalized_email,
        full_name=normalized_name,
        password_hash=auth_utils.hash_password(temporary_password),
        role=UserRole.TRAINEE,
        lob=batch.lob,
        department=_build_batch_department_label(batch),
    )

    db.add(new_user)
    db.flush()

    if new_user not in batch.users:
        batch.users.append(new_user)

    return new_user


def _parse_bulk_upload_rows(file_bytes: bytes, filename: str) -> List[Dict[str, str]]:
    normalized_filename = (filename or "").lower()

    header_aliases = {
        "email": "email",
        "email_address": "email",
        "full_name": "full_name",
        "fullname": "full_name",
        "role": "role",
        "password": "password",
        "wave_batch": "batch_lookup",
        "wave_or_batch": "batch_lookup",
        "batch": "batch_lookup",
        "batch_name": "batch_lookup",
        "batch_number": "batch_lookup",
        "wave": "batch_lookup",
        "wave_number": "batch_lookup",
    }

    def map_headers(headers: List[str]) -> List[str]:
        mapped = []
        for header in headers:
            normalized = _normalize_header(header)
            mapped.append(header_aliases.get(normalized, normalized))
        return mapped

    if normalized_filename.endswith(".csv"):
        decoded = file_bytes.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(decoded))
        rows = list(reader)
    elif normalized_filename.endswith(".xlsx"):
        workbook = load_workbook(io.BytesIO(file_bytes), data_only=True)
        worksheet = workbook.active
        rows = [list(row) for row in worksheet.iter_rows(values_only=True)]
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload a .xlsx or .csv file.",
        )

    if not rows:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")

    headers = map_headers([_normalize_text_value(cell) for cell in rows[0]])
    parsed_rows: List[Dict[str, str]] = []
    for row in rows[1:]:
        if not any(value not in (None, "") for value in row):
            continue

        record: Dict[str, str] = {}
        for index, header in enumerate(headers):
            if not header:
                continue
            record[header] = _normalize_text_value(row[index] if index < len(row) else "")
        parsed_rows.append(record)

    return parsed_rows


# ==================== Pydantic Models ====================


class BatchCreate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    wave_number: Optional[int] = None
    lob: Optional[str] = None


class BatchUserAssignment(BaseModel):
    user_ids: List[str]  # IDs of trainees to add to batch


class CourseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    scenario_ids: Optional[List[str]] = None
    difficulty: Optional[str] = None


class CourseAssignmentCreate(BaseModel):
    course_id: str
    batch_id: Optional[str] = None
    user_id: Optional[str] = None  # For individual assignment
    is_mandatory: bool = True
    due_date: Optional[datetime] = None


class FeedbackCreate(BaseModel):
    practice_session_id: str
    feedback_type: FeedbackType
    content: str
    recommended_module_id: Optional[str] = None
    recommended_exercises: Optional[List[str]] = None


class SessionVerification(BaseModel):
    is_verified: bool = True
    corrected_transcription: Optional[str] = None


class TraineeCreate(BaseModel):
    email: str
    full_name: str
    role: UserRole = UserRole.TRAINEE
    password: Optional[str] = None
    batch_id: str


class TraineeUpdate(BaseModel):
    email: str
    full_name: str
    role: UserRole = UserRole.TRAINEE
    batch_id: str


# ==================== Helper Functions ====================


def verify_trainer(
    current_user: User = Depends(auth_utils.get_current_user),
) -> User:
    """Verify that current user is trainer"""
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Trainer access required")
    return current_user


# ==================== Batch Management ====================


@router.post("/batches", response_model=dict)
async def create_batch(
    batch_data: BatchCreate,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Create a new training batch"""
    batch_name = _derive_batch_name(batch_data.name, batch_data.wave_number)

    existing_name = (
        db.query(Batch)
        .filter(
            Batch.created_by == current_user.id,
            func.lower(Batch.name) == batch_name.lower(),
        )
        .first()
    )
    if existing_name:
        raise HTTPException(status_code=400, detail="Batch name already exists")

    if batch_data.wave_number is not None:
        existing_wave = (
            db.query(Batch)
            .filter(
                Batch.created_by == current_user.id,
                Batch.wave_number == batch_data.wave_number,
            )
            .first()
        )
        if existing_wave:
            raise HTTPException(status_code=400, detail="Batch number already exists")

    new_batch = Batch(
        name=batch_name,
        description=_normalize_text_value(batch_data.description) or None,
        wave_number=batch_data.wave_number,
        lob=_normalize_text_value(batch_data.lob) or None,
        created_by=current_user.id,
    )

    db.add(new_batch)
    db.commit()
    db.refresh(new_batch)

    return {
        "id": new_batch.id,
        "name": new_batch.name,
        "description": new_batch.description,
        "wave_number": new_batch.wave_number,
        "lob": new_batch.lob,
        "status": "created",
        "users_count": 0,
    }


@router.get("/batches")
async def list_batches(
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
    skip: int = 0,
    limit: int = 50,
):
    """List all batches created by this trainer"""
    batches = (
        db.query(Batch)
        .filter(Batch.created_by == current_user.id)
        .order_by(Batch.wave_number.is_(None), Batch.wave_number.asc(), Batch.name.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "count": len(batches),
        "batches": [
            {
                "id": b.id,
                "name": b.name,
                "description": b.description,
                "wave_number": b.wave_number,
                "lob": b.lob,
                "users_count": len(b.users),
                "created_at": b.created_at,
            }
            for b in batches
        ],
    }


@router.get("/batches/{batch_id}")
async def get_batch(
    batch_id: str, current_user: Any = Depends(verify_trainer), db: Session = Depends()
):
    """Get detailed batch information"""
    batch = _get_trainer_batch(db, trainer_id=current_user.id, batch_id=batch_id)

    return {
        "id": batch.id,
        "name": batch.name,
        "description": batch.description,
        "wave_number": batch.wave_number,
        "lob": batch.lob,
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "language_dialect": u.language_dialect,
            }
            for u in batch.users
        ],
        "course_assignments": [
            {
                "id": ca.id,
                "course_id": ca.course_id,
                "course_name": ca.course.name if ca.course else None,
                "assigned_at": ca.assigned_at,
                "due_date": ca.due_date,
            }
            for ca in batch.course_assignments
        ],
        "created_at": batch.created_at,
    }


@router.post("/batches/{batch_id}/users")
async def assign_users_to_batch(
    batch_id: str,
    assignment: BatchUserAssignment,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Add trainees to a batch"""
    batch = _get_trainer_batch(db, trainer_id=current_user.id, batch_id=batch_id)

    users = (
        db.query(User)
        .filter(User.id.in_(assignment.user_ids), User.role == UserRole.TRAINEE)
        .all()
    )

    if not users:
        raise HTTPException(status_code=404, detail="No users found")

    added_count = 0
    for user in users:
        if user not in batch.users:
            batch.users.append(user)
            added_count += 1

    db.commit()

    return {
        "status": "updated",
        "batch_id": batch_id,
        "added_users": added_count,
        "total_users": len(batch.users),
    }


@router.delete("/batches/{batch_id}/users/{user_id}")
async def remove_user_from_batch(
    batch_id: str,
    user_id: str,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Remove a trainee from a batch"""
    batch = _get_trainer_batch(db, trainer_id=current_user.id, batch_id=batch_id)

    user = db.query(User).filter(User.id == user_id).first()

    if user in batch.users:
        batch.users.remove(user)
        db.commit()

    return {"status": "removed", "batch_id": batch_id, "user_id": user_id}


@router.post("/trainees", response_model=dict)
async def create_trainee(
    trainee_data: TraineeCreate,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Create a trainee account and assign it to one of the trainer's batches."""
    if trainee_data.role != UserRole.TRAINEE:
        raise HTTPException(
            status_code=400,
            detail="Trainer user management only creates Trainee accounts.",
        )
    batch = _get_trainer_batch(db, trainer_id=current_user.id, batch_id=trainee_data.batch_id)

    temporary_password = trainee_data.password or DEFAULT_TRAINEE_PASSWORD
    try:
        new_user = _create_trainee_account(
            db,
            email=trainee_data.email,
            full_name=trainee_data.full_name,
            batch=batch,
            password=temporary_password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.commit()
    db.refresh(new_user)

    return {
        "status": "created",
        "id": new_user.id,
        "email": new_user.email,
        "full_name": new_user.full_name,
        "role": new_user.role,
        "temporary_password": temporary_password,
        "batch": _serialize_batch(batch),
    }


@router.get("/trainees")
async def list_trainees(
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """List active trainees assigned to batches created by the current trainer."""
    trainees = (
        db.query(User, Batch)
        .join(batch_user_association, batch_user_association.c.user_id == User.id)
        .join(Batch, Batch.id == batch_user_association.c.batch_id)
        .filter(
            User.role == UserRole.TRAINEE,
            User.is_active.is_(True),
            Batch.created_by == current_user.id,
        )
        .order_by(Batch.wave_number.asc(), User.full_name.asc())
        .all()
    )

    trainee_rows = []
    seen_ids = set()
    for user, batch in trainees:
        if user.id in seen_ids:
            continue
        seen_ids.add(user.id)
        trainee_rows.append(_serialize_trainee(user, batch))

    return {"count": len(trainee_rows), "trainees": trainee_rows}


@router.put("/trainees/{trainee_id}", response_model=dict)
async def update_trainee(
    trainee_id: str,
    trainee_data: TraineeUpdate,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Update a trainee profile and reassign them to one of the trainer's batches."""
    if trainee_data.role != UserRole.TRAINEE:
        raise HTTPException(
            status_code=400,
            detail="Trainer user management only updates Trainee accounts.",
        )

    batch = _get_trainer_batch(db, trainer_id=current_user.id, batch_id=trainee_data.batch_id)
    trainee = (
        db.query(User)
        .filter(
            User.id == trainee_id,
            User.role == UserRole.TRAINEE,
            User.is_active.is_(True),
        )
        .first()
    )

    if not trainee:
        raise HTTPException(status_code=404, detail="Trainee not found")

    trainer_batches = [existing_batch for existing_batch in trainee.batches if existing_batch.created_by == current_user.id]
    if not trainer_batches:
        raise HTTPException(status_code=404, detail="Trainee not found in your batch list")

    normalized_email = _normalize_email(trainee_data.email)
    normalized_name = _normalize_text_value(trainee_data.full_name)

    if not normalized_email:
        raise HTTPException(status_code=400, detail="Email address is required")
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Full name is required")

    existing_user = (
        db.query(User)
        .filter(
            func.lower(User.email) == normalized_email,
            User.id != trainee.id,
        )
        .first()
    )
    if existing_user:
        raise HTTPException(status_code=400, detail=f"Email {normalized_email} already exists")

    trainee.email = normalized_email
    trainee.full_name = normalized_name
    trainee.lob = batch.lob
    trainee.department = _build_batch_department_label(batch)

    for existing_batch in trainer_batches:
        if existing_batch.id != batch.id and trainee in existing_batch.users:
            existing_batch.users.remove(trainee)

    if trainee not in batch.users:
        batch.users.append(trainee)

    db.commit()
    db.refresh(trainee)

    return {
        "status": "updated",
        "trainee": _serialize_trainee(trainee, batch),
    }


@router.get("/trainees/bulk-upload-template")
async def download_trainee_bulk_upload_template(
    current_user: Any = Depends(verify_trainer),
    format: str = Query("csv"),
):
    """Download the trainee bulk upload template as CSV or Excel."""
    headers = ["Email Address", "Full Name", "Role", "Password", "Wave/Batch"]
    sample_rows = [
        [
            "trainee.one@example.com",
            "Trainee One",
            "trainee",
            DEFAULT_TRAINEE_PASSWORD,
            "Batch 1",
        ],
        [
            "trainee.two@example.com",
            "Trainee Two",
            "trainee",
            DEFAULT_TRAINEE_PASSWORD,
            "2",
        ],
    ]

    template_format = (format or "csv").strip().lower()
    if template_format == "xlsx":
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "Trainees"
        worksheet.append(headers)
        for row in sample_rows:
            worksheet.append(row)

        instructions = workbook.create_sheet("Instructions")
        instructions.append(["Field", "Notes"])
        instructions.append(["Email Address", "Required and must be unique"])
        instructions.append(["Full Name", "Required"])
        instructions.append(["Role", "Use trainee"])
        instructions.append(["Password", f"Default password is always {DEFAULT_TRAINEE_PASSWORD}"])
        instructions.append(["Wave/Batch", "Use an existing trainer batch name or batch number"])

        output = io.BytesIO()
        workbook.save(output)
        output.seek(0)

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{TRAINER_BULK_UPLOAD_TEMPLATE}"'
            },
        )

    if template_format != "csv":
        raise HTTPException(status_code=400, detail="Template format must be csv or xlsx")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(sample_rows)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="trainer-trainee-bulk-upload-template.csv"'
        },
    )


@router.post("/trainees/bulk-upload")
async def bulk_upload_trainees(
    file: UploadFile = File(...),
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Bulk create trainee accounts from an Excel or CSV file."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    rows = _parse_bulk_upload_rows(content, file.filename or "")
    if not rows:
        raise HTTPException(status_code=400, detail="No trainee rows found in the uploaded file")

    created_rows = []
    errors = []

    for index, row in enumerate(rows, start=2):
        email = _normalize_text_value(row.get("email"))
        full_name = _normalize_text_value(row.get("full_name"))
        role = _normalize_text_value(row.get("role")).lower() or UserRole.TRAINEE.value
        batch_lookup = _normalize_text_value(row.get("batch_lookup"))

        if role != UserRole.TRAINEE.value:
            errors.append(f"Row {index}: Role must be trainee")
            continue
        if not email or not full_name:
            errors.append(f"Row {index}: Email address and full name are required")
            continue
        if not batch_lookup:
            errors.append(f"Row {index}: Wave/Batch is required")
            continue

        batch = _resolve_batch_lookup(
            db,
            trainer_id=current_user.id,
            batch_lookup=batch_lookup,
        )
        if not batch:
            errors.append(
                f"Row {index}: No trainer batch matches '{batch_lookup}'. Create the batch first."
            )
            continue

        try:
            with db.begin_nested():
                new_user = _create_trainee_account(
                    db,
                    email=email,
                    full_name=full_name,
                    batch=batch,
                    password=DEFAULT_TRAINEE_PASSWORD,
                )
                created_rows.append(
                    _serialize_trainee(new_user, batch)
                )
        except ValueError as exc:
            errors.append(f"Row {index}: {exc}")

    db.commit()

    return {
        "status": "completed",
        "created": len(created_rows),
        "temporary_password": DEFAULT_TRAINEE_PASSWORD,
        "trainees": created_rows,
        "errors": errors,
    }


# ==================== Course Management ====================


@router.post("/courses", response_model=dict)
async def create_course(
    course_data: CourseCreate,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Create a new training course"""
    new_course = Course(
        name=course_data.name,
        description=course_data.description,
        duration_minutes=course_data.duration_minutes,
        scenario_ids=course_data.scenario_ids or [],
        difficulty=course_data.difficulty,
        created_by=current_user.id,
    )

    db.add(new_course)
    db.commit()

    return {"id": new_course.id, "name": new_course.name, "status": "created"}


@router.get("/courses")
async def list_courses(
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
    skip: int = 0,
    limit: int = 50,
):
    """List all courses created by this trainer"""
    courses = (
        db.query(Course)
        .filter(Course.created_by == current_user.id)
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "count": len(courses),
        "courses": [
            {
                "id": c.id,
                "name": c.name,
                "duration_minutes": c.duration_minutes,
                "difficulty": c.difficulty,
                "is_published": c.is_published,
                "scenario_count": len(c.scenario_ids),
                "created_at": c.created_at,
            }
            for c in courses
        ],
    }


@router.get("/courses/{course_id}")
async def get_course(
    course_id: str,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Get course details"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return {
        "id": course.id,
        "name": course.name,
        "description": course.description,
        "difficulty": course.difficulty,
        "duration_minutes": course.duration_minutes,
        "scenario_ids": course.scenario_ids,
        "is_published": course.is_published,
        "created_at": course.created_at,
    }


@router.put("/courses/{course_id}")
async def update_course(
    course_id: str,
    course_data: CourseCreate,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Update course"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    course.name = course_data.name or course.name
    course.description = course_data.description or course.description
    course.scenario_ids = course_data.scenario_ids or course.scenario_ids
    course.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "updated", "course_id": course_id}


@router.delete("/courses/{course_id}")
async def delete_course(
    course_id: str,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Delete course (only if not assigned to batches)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    assignments = db.query(CourseAssignment).filter(CourseAssignment.course_id == course_id).count()
    if assignments > 0:
        raise HTTPException(status_code=400, detail="Cannot delete course with active assignments")
    db.delete(course)
    db.commit()
    return {"status": "deleted", "course_id": course_id}


@router.post("/courses/{course_id}/publish")
async def publish_course(
    course_id: str,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Publish a course (make available for assignment)"""
    course = db.query(Course).filter(Course.id == course_id).first()

    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    course.is_published = True
    db.commit()

    return {"status": "published", "course_id": course_id}


# ==================== Course Assignment ====================


@router.post("/assign-course", response_model=dict)
async def assign_course(
    assignment: CourseAssignmentCreate,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Assign a course to a batch or individual trainee"""
    course = db.query(Course).filter(Course.id == assignment.course_id).first()

    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Validate batch or user
    if assignment.batch_id:
        batch = db.query(Batch).filter(Batch.id == assignment.batch_id).first()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
    elif assignment.user_id:
        user = db.query(User).filter(User.id == assignment.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
    else:
        raise HTTPException(status_code=400, detail="Must specify batch_id or user_id")

    new_assignment = CourseAssignment(
        course_id=assignment.course_id,
        batch_id=assignment.batch_id,
        user_id=assignment.user_id,
        assigned_by=current_user.id,
        is_mandatory=assignment.is_mandatory,
        due_date=assignment.due_date,
    )

    db.add(new_assignment)
    db.commit()

    return {
        "id": new_assignment.id,
        "course_id": assignment.course_id,
        "assigned_to": assignment.batch_id or assignment.user_id,
        "status": "assigned",
    }


@router.get("/course-assignments")
async def list_course_assignments(
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
    batch_id: Optional[str] = None,
):
    """List course assignments for trainer's batches"""
    query = db.query(CourseAssignment)

    if batch_id:
        query = query.filter(CourseAssignment.batch_id == batch_id)

    assignments = query.all()

    return {
        "count": len(assignments),
        "assignments": [
            {
                "id": a.id,
                "course_id": a.course_id,
                "course_name": a.course.name if a.course else None,
                "batch_id": a.batch_id,
                "user_id": a.user_id,
                "assigned_at": a.assigned_at,
                "due_date": a.due_date,
                "is_mandatory": a.is_mandatory,
                "completion_percentage": a.completion_percentage,
            }
            for a in assignments
        ],
    }


# ==================== Interaction Review & Verification ====================


@router.get("/interaction-history")
async def get_interaction_history(
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
    batch_id: Optional[str] = None,
    user_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    """Get practice sessions for trainer's assigned batch/users"""
    query = db.query(PracticeSession)

    # Filter by batch if provided
    if batch_id:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if batch:
            user_ids = [u.id for u in batch.users]
            query = query.filter(PracticeSession.user_id.in_(user_ids))

    # Filter by user if provided
    if user_id:
        query = query.filter(PracticeSession.user_id == user_id)

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
                "user_id": s.user_id,
                "user_name": s.user.full_name if s.user else None,
                "scenario_id": s.scenario_id,
                "scenario_title": s.scenario.title if s.scenario else None,
                "overall_score": s.overall_score,
                "accuracy": s.accuracy_score,
                "fluency": s.fluency_score,
                "attempt_number": s.attempt_number,
                "status": s.status,
                "is_verified": s.is_verified,
                "created_at": s.created_at,
                "audio_file_url": s.audio_file_url,
            }
            for s in sessions
        ],
    }


@router.get("/interactions/{session_id}")
async def get_interaction_detail(
    session_id: str,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Get detailed interaction information with transcript"""
    session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "id": session.id,
        "user_id": session.user_id,
        "user_name": session.user.full_name if session.user else None,
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
        "response_duration": session.response_duration,
        "dead_air_time": session.dead_air_time,
        "volume_level": session.volume_level,
        "attempt_number": session.attempt_number,
        "is_verified": session.is_verified,
        "feedback_items": [
            {
                "id": f.id,
                "feedback_type": f.feedback_type,
                "content": f.content,
                "recommended_module_id": f.recommended_module_id,
                "created_at": f.created_at,
            }
            for f in session.feedback_items
        ],
        "created_at": session.created_at,
    }


@router.post("/interactions/{session_id}/verify")
async def verify_interaction(
    session_id: str,
    verification: SessionVerification,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Verify/correct ASR transcription for a session"""
    session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.is_verified = verification.is_verified

    if verification.corrected_transcription:
        session.transcription = verification.corrected_transcription

    session.reviewed_by = current_user.id
    db.commit()

    return {"status": "verified", "session_id": session_id}


# ==================== Coaching & Feedback ====================


@router.post("/feedback", response_model=dict)
async def create_feedback(
    feedback_data: FeedbackCreate,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Provide coaching feedback on a practice session"""
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.id == feedback_data.practice_session_id)
        .first()
    )

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    new_feedback = Feedback(
        practice_session_id=feedback_data.practice_session_id,
        trainer_id=current_user.id,
        feedback_type=feedback_data.feedback_type,
        content=feedback_data.content,
        recommended_module_id=feedback_data.recommended_module_id,
        recommended_exercises=feedback_data.recommended_exercises or [],
        is_automated=False,
    )

    db.add(new_feedback)
    db.commit()

    return {
        "id": new_feedback.id,
        "session_id": feedback_data.practice_session_id,
        "status": "created",
    }


@router.get("/feedback/{session_id}")
async def get_feedback(
    session_id: str,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Get all feedback for a session"""
    feedback_items = (
        db.query(Feedback).filter(Feedback.practice_session_id == session_id).all()
    )

    return {
        "count": len(feedback_items),
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
            for f in feedback_items
        ],
    }


@router.post("/feedback/{feedback_id}/push-module")
async def push_microlearning(
    feedback_id: str,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
):
    """Push a microlearning module to trainee based on feedback"""
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()

    if not feedback or not feedback.recommended_module_id:
        raise HTTPException(status_code=404, detail="Feedback or module not found")

    # Create assignment for trainee
    # This would be stored as a notification/assignment

    return {
        "status": "module_assigned",
        "module_id": feedback.recommended_module_id,
        "session_id": feedback.practice_session_id,
    }


# ==================== Performance Analysis ====================


@router.get("/batch-performance/{batch_id}")
async def get_batch_performance(
    batch_id: str, current_user: Any = Depends(verify_trainer), db: Session = Depends()
):
    """Get performance analytics for a batch"""
    batch = db.query(Batch).filter(Batch.id == batch_id).first()

    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Get all sessions for batch users
    user_ids = [u.id for u in batch.users]
    sessions = (
        db.query(PracticeSession).filter(PracticeSession.user_id.in_(user_ids)).all()
    )

    # Calculate metrics by user
    user_metrics = {}
    for session in sessions:
        if session.user_id not in user_metrics:
            user_metrics[session.user_id] = {
                "sessions": [],
                "avg_score": 0,
                "passed_count": 0,
                "failed_count": 0,
            }

        user_metrics[session.user_id]["sessions"].append(session)
        if session.overall_score and session.overall_score >= 70:
            user_metrics[session.user_id]["passed_count"] += 1
        else:
            user_metrics[session.user_id]["failed_count"] += 1

    # Calculate averages
    for metrics in user_metrics.values():
        if metrics["sessions"]:
            total_score = sum(s.overall_score or 0 for s in metrics["sessions"])
            metrics["avg_score"] = total_score / len(metrics["sessions"])

    return {
        "batch_id": batch_id,
        "batch_name": batch.name,
        "total_users": len(batch.users),
        "total_sessions": len(sessions),
        "user_performance": [
            {
                "user_id": user_id,
                "user_name": next(
                    (u.full_name for u in batch.users if u.id == user_id), None
                ),
                "avg_score": round(metrics["avg_score"], 2),
                "passed_sessions": metrics["passed_count"],
                "failed_sessions": metrics["failed_count"],
                "session_count": len(metrics["sessions"]),
            }
            for user_id, metrics in user_metrics.items()
        ],
    }


@router.get("/user-performance/{user_id}")
async def get_user_performance(
    user_id: str,
    current_user: Any = Depends(verify_trainer),
    db: Session = Depends(),
    days: int = 7,
):
    """Get detailed performance metrics for a trainee"""
    from datetime import timedelta

    from sqlalchemy import and_

    # Get sessions in timeframe
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    sessions = (
        db.query(PracticeSession)
        .filter(
            and_(
                PracticeSession.user_id == user_id,
                PracticeSession.created_at >= cutoff_date,
            )
        )
        .order_by(PracticeSession.created_at.asc())
        .all()
    )

    # Calculate metrics
    total_sessions = len(sessions)
    passed_sessions = sum((s.overall_score or 0) >= 70 for s in sessions)

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

    return {
        "user_id": user_id,
        "period_days": days,
        "total_sessions": total_sessions,
        "passed_sessions": passed_sessions,
        "failed_sessions": total_sessions - passed_sessions,
        "pass_rate": (
            round((passed_sessions / total_sessions * 100), 2)
            if total_sessions > 0
            else 0
        ),
        "average_scores": {k: round(v, 2) for k, v in avg_scores.items()},
        "session_timeline": [
            {
                "session_id": s.id,
                "scenario_title": s.scenario.title if s.scenario else None,
                "overall_score": s.overall_score,
                "created_at": s.created_at,
            }
            for s in sessions
        ],
    }


# ==================== Trainer Dashboard ====================


@router.websocket("/live-updates")
async def trainer_live_updates(websocket: WebSocket, token: str):
    """Push new trainee session events to trainer and admin dashboards."""
    db = SessionLocal()
    channel = "trainers"
    try:
        token_data = auth_utils.decode_token(token)
        user = db.query(User).filter(User.id == token_data.user_id).first()

        if not user or user.role not in (UserRole.TRAINER, UserRole.ADMIN):
            await websocket.close(code=4403)
            return

        if user.role == UserRole.ADMIN:
            channel = "admins"

        await live_update_manager.connect(channel, websocket)
        await websocket.send_json(
            {
                "type": "connected",
                "role": user.role.value,
                "message": "Live dashboard updates enabled",
            }
        )

        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await live_update_manager.disconnect(channel, websocket)
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
        await live_update_manager.disconnect(channel, websocket)
    finally:
        db.close()


@router.get("/stats")
async def trainer_stats(
    current_user: Any = Depends(verify_trainer), db: Session = Depends()
):
    """Stats payload used by trainer dashboard UI."""
    data = await trainer_dashboard(current_user=current_user, db=db)
    return {
        "total_trainees": data.get("total_assigned_users", 0),
        "total_batches": data.get("total_batches", 0),
        "total_sessions": data.get("total_sessions", 0),
        "average_score": data.get("average_session_score", 0),
        "pending_reviews": data.get("pending_reviews", 0),
    }


@router.get("/dashboard")
async def trainer_dashboard(
    current_user: Any = Depends(verify_trainer), db: Session = Depends()
):
    """Trainer dashboard overview"""
    # Get batches
    batches = db.query(Batch).filter(Batch.created_by == current_user.id).all()
    batch_ids = [b.id for b in batches]

    # Get user IDs from batches
    from sqlalchemy import and_

    batch_user_ids = (
        db.query(User).filter(User.batches.any(Batch.id.in_(batch_ids))).all()
    )
    user_ids = [u.id for u in batch_user_ids]

    # Get sessions
    sessions = (
        db.query(PracticeSession).filter(PracticeSession.user_id.in_(user_ids)).all()
        if user_ids
        else []
    )

    # Calculate metrics
    total_users = len(batch_user_ids)
    total_sessions = len(sessions)

    avg_score = (
        sum(s.overall_score or 0 for s in sessions) / total_sessions if sessions else 0
    )

    return {
        "trainer_name": current_user.full_name,
        "total_batches": len(batches),
        "total_assigned_users": total_users,
        "total_sessions": total_sessions,
        "average_session_score": round(avg_score, 2),
        "pending_reviews": sum(not s.is_verified for s in sessions),
        "timestamp": datetime.utcnow(),
    }
