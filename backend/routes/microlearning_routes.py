"""
Microlearning Management & Certification Routes
Trainer: CRUD modules, assign modules to batch/trainee
Trainee: view assigned modules, complete modules, receive certificate
"""

import logging
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import (
    MicrolearningModule,
    MicrolearningAssignment,
    User,
    UserRole,
    Batch,
    CertificateRecord,
)
from ..schemas import SuccessResponse

router = APIRouter(prefix="/api/microlearning", tags=["microlearning"])
logger = logging.getLogger(__name__)


class ModuleCreateRequest(BaseModel):
    title: str
    description: Optional[str]
    type: str
    duration_minutes: int
    passing_score: int
    skill_focus: Optional[str]
    content_url: Optional[str]
    content_data: Optional[dict] = {}
    exercises: Optional[list] = []
    difficulty: Optional[str] = "basic"


class ModuleUpdateRequest(BaseModel):
    title: Optional[str]
    description: Optional[str]
    type: Optional[str]
    duration_minutes: Optional[int]
    passing_score: Optional[int]
    skill_focus: Optional[str]
    content_url: Optional[str]
    content_data: Optional[dict]
    exercises: Optional[list]
    difficulty: Optional[str]
    is_active: Optional[bool]


class AssignRequest(BaseModel):
    batch_id: Optional[str]
    trainee_ids: Optional[List[str]] = []
    due_date: Optional[datetime]


class CompleteRequest(BaseModel):
    completion_percentage: int
    notes: Optional[str]


def require_trainer(user: User):
    if user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Trainer/Admin role required")


@router.post("/modules", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_module(
    payload: ModuleCreateRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    module = MicrolearningModule(
        id=str(uuid4()),
        title=payload.title,
        description=payload.description,
        category=payload.type,
        type=payload.type,
        duration_minutes=payload.duration_minutes,
        passing_score=payload.passing_score,
        skill_focus=payload.skill_focus,
        content_url=payload.content_url,
        content_data=payload.content_data or {},
        exercises=payload.exercises or [],
        difficulty=payload.difficulty or "basic",
        created_by=current_user.id,
        created_at=datetime.utcnow(),
        is_active=True,
    )
    db.add(module)
    db.commit()
    db.refresh(module)

    return {"module_id": module.id, "message": "Microlearning module created"}


@router.get("/modules")
async def list_modules(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    modules = db.query(MicrolearningModule).order_by(MicrolearningModule.created_at.desc()).all()
    result = []
    for m in modules:
        result.append({
            "id": m.id,
            "title": m.title,
            "description": m.description,
            "type": m.type,
            "duration_minutes": m.duration_minutes,
            "passing_score": m.passing_score,
            "skill_focus": m.skill_focus,
            "content_url": m.content_url,
            "is_active": m.is_active,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })
    return {"modules": result, "count": len(result)}


@router.get("/modules/{module_id}")
async def get_module(module_id: str, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    module = db.query(MicrolearningModule).filter(MicrolearningModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    return {
        "id": module.id,
        "title": module.title,
        "description": module.description,
        "type": module.type,
        "duration_minutes": module.duration_minutes,
        "passing_score": module.passing_score,
        "skill_focus": module.skill_focus,
        "content_url": module.content_url,
        "content_data": module.content_data,
        "exercises": module.exercises,
        "difficulty": module.difficulty,
        "is_active": module.is_active,
    }


@router.put("/modules/{module_id}")
async def update_module(module_id: str, payload: ModuleUpdateRequest, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    module = db.query(MicrolearningModule).filter(MicrolearningModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    if payload.title is not None:
        module.title = payload.title
    if payload.description is not None:
        module.description = payload.description
    if payload.type is not None:
        module.type = payload.type
        module.category = payload.type
    if payload.duration_minutes is not None:
        module.duration_minutes = payload.duration_minutes
    if payload.passing_score is not None:
        module.passing_score = payload.passing_score
    if payload.skill_focus is not None:
        module.skill_focus = payload.skill_focus
    if payload.content_url is not None:
        module.content_url = payload.content_url
    if payload.content_data is not None:
        module.content_data = payload.content_data
    if payload.exercises is not None:
        module.exercises = payload.exercises
    if payload.difficulty is not None:
        module.difficulty = payload.difficulty
    if payload.is_active is not None:
        module.is_active = payload.is_active

    module.updated_at = datetime.utcnow()
    db.commit()

    return {"message": "Module updated"}


@router.delete("/modules/{module_id}", response_model=SuccessResponse)
async def delete_module(module_id: str, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    module = db.query(MicrolearningModule).filter(MicrolearningModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    db.delete(module)
    db.commit()
    return SuccessResponse(message="Module deleted")


@router.post("/modules/{module_id}/assign", response_model=dict)
async def assign_module(module_id: str, payload: AssignRequest, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    module = db.query(MicrolearningModule).filter(MicrolearningModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    assigned = []
    if payload.batch_id:
        batch = db.query(Batch).filter(Batch.id == payload.batch_id).first()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

        trainees = batch.users
        for trainee in trainees:
            existing = db.query(MicrolearningAssignment).filter(
                and_(MicrolearningAssignment.module_id == module_id, MicrolearningAssignment.trainee_id == trainee.id)
            ).first()
            if not existing:
                assignment = MicrolearningAssignment(
                    id=str(uuid4()),
                    module_id=module_id,
                    trainee_id=trainee.id,
                    batch_id=payload.batch_id,
                    assigned_by=current_user.id,
                    assigned_at=datetime.utcnow(),
                    status="assigned",
                    completion_percentage=0.0,
                    due_date=payload.due_date,
                )
                db.add(assignment)
                assigned.append(trainee.id)

    if payload.trainee_ids:
        for trainee_id in payload.trainee_ids:
            trainee = db.query(User).filter(User.id == trainee_id).first()
            if not trainee:
                continue
            existing = db.query(MicrolearningAssignment).filter(
                and_(MicrolearningAssignment.module_id == module_id, MicrolearningAssignment.trainee_id == trainee_id)
            ).first()
            if not existing:
                assignment = MicrolearningAssignment(
                    id=str(uuid4()),
                    module_id=module_id,
                    trainee_id=trainee_id,
                    batch_id=payload.batch_id,
                    assigned_by=current_user.id,
                    assigned_at=datetime.utcnow(),
                    status="assigned",
                    completion_percentage=0.0,
                    due_date=payload.due_date,
                )
                db.add(assignment)
                assigned.append(trainee_id)

    db.commit()
    return {"message": f"Assigned to {len(assigned)} trainees", "assigned": assigned}


@router.get("/assignments")
async def list_assignments(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    assignments = db.query(MicrolearningAssignment).order_by(MicrolearningAssignment.assigned_at.desc()).all()
    result = []
    for a in assignments:
        result.append({
            "id": a.id,
            "module_id": a.module_id,
            "trainee_id": a.trainee_id,
            "batch_id": a.batch_id,
            "status": a.status,
            "completion_percentage": a.completion_percentage,
            "certificate_id": a.certificate_id,
            "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
        })

    return {"assignments": result, "count": len(result)}


@router.get("/trainee/assigned")
async def trainee_assigned(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    current_user = await auth_utils.get_current_user(authorization, db)
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainees only")

    assignments = db.query(MicrolearningAssignment).filter(MicrolearningAssignment.trainee_id == current_user.id).all()
    result = []
    for a in assignments:
        module = db.query(MicrolearningModule).filter(MicrolearningModule.id == a.module_id).first()
        result.append({
            "assignment_id": a.id,
            "module_id": a.module_id,
            "module_title": module.title if module else "",
            "type": module.type if module else "",
            "status": a.status,
            "completion_percentage": a.completion_percentage,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "certificate_id": a.certificate_id,
        })

    return {"assignments": result, "count": len(result)}


@router.post("/seed-samples")
async def seed_microlearning_samples(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    samples = [
        {
            "title": "De-escalation Toolkit (HEARD Technique)",
            "description": "Short high-energy video on HEARD technique with practice prompt.",
            "type": "video",
            "duration_minutes": 3,
            "passing_score": 80,
            "skill_focus": "De-escalation",
            "content_url": "https://example.com/videos/heard-technique.mp4",
            "content_data": {
                "lesson": "HEARD technique",
                "steps": ["Hear", "Empathize", "Apologize", "Resolve", "Diagnose"],
                "prompt": "In 30 seconds, respond to a shouting customer using HEARD."
            },
            "difficulty": "basic"
        },
        {
            "title": "Spot the Tone",
            "description": "Quiz: identify robotic, casual, or empathetic tone in responses.",
            "type": "quiz",
            "duration_minutes": 5,
            "passing_score": 70,
            "skill_focus": "Tone recognition",
            "content_data": {
                "questions": [
                    {
                        "question": "Pick the empathetic answer.",
                        "options": ["Robotic", "Casual", "Empathetic"],
                        "correct": "Empathetic"
                    }
                ]
            },
            "difficulty": "intermediate"
        },
        {
            "title": "Product Feature Flashcards",
            "description": "Flashcards for API key reset and feature updates.",
            "type": "flashcard",
            "duration_minutes": 4,
            "passing_score": 80,
            "skill_focus": "Product knowledge",
            "content_data": {
                "cards": [
                    {"front": "How to reset API key?", "back": "1. Go to settings 2. Click reset 3. Save"},
                    {"front": "API 429 error fix", "back": "Use exponential backoff and rate limit"}
                ]
            },
            "difficulty": "basic"
        },
        {
            "title": "One-Sentence Empathy Challenge",
            "description": "Infographic on power phrases vs wall phrases.",
            "type": "infographic",
            "duration_minutes": 2,
            "passing_score": 75,
            "skill_focus": "Empathy",
            "content_data": {
                "power_phrases": ["I understand how frustrating that delay must be."],
                "wall_phrases": ["Our policy says we can’t do that."]
            },
            "difficulty": "basic"
        },
        {
            "title": "What Went Wrong? Case Study",
            "description": "Audio transcript analysis for a 1-star review interaction.",
            "type": "case_study",
            "duration_minutes": 6,
            "passing_score": 80,
            "skill_focus": "Critical thinking",
            "content_data": {
                "transcript": "Customer complains about wait time and dropped call.",
                "analysis_prompt": "Identify pivot point where the interaction turned negative."
            },
            "difficulty": "intermediate"
        }
    ]

    created = 0
    for sample in samples:
        existing = db.query(MicrolearningModule).filter(MicrolearningModule.title == sample["title"]).first()
        if existing:
            continue

        mod = MicrolearningModule(
            id=str(uuid4()),
            title=sample["title"],
            description=sample.get("description"),
            category=sample.get("type"),
            type=sample.get("type"),
            duration_minutes=sample.get("duration_minutes", 3),
            passing_score=sample.get("passing_score", 80),
            skill_focus=sample.get("skill_focus"),
            content_url=sample.get("content_url"),
            content_data=sample.get("content_data", {}),
            exercises=sample.get("exercises", []),
            difficulty=sample.get("difficulty", "basic"),
            created_by=current_user.id,
            created_at=datetime.utcnow(),
            is_active=True,
        )
        db.add(mod)
        created += 1

    db.commit()
    return {"message": f"Seeded {created} microlearning modules"}


@router.post("/assignments/{assignment_id}/complete")
async def complete_assignment(assignment_id: str, payload: CompleteRequest, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    current_user = await auth_utils.get_current_user(authorization, db)
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainees only")

    assignment = db.query(MicrolearningAssignment).filter(MicrolearningAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if assignment.trainee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your assignment")

    assignment.completion_percentage = payload.completion_percentage
    assignment.responses = {"notes": payload.notes or ""}
    assignment.status = "completed" if payload.completion_percentage >= 100 else "in_progress"
    assignment.completed_at = datetime.utcnow() if payload.completion_percentage >= 100 else None

    if payload.completion_percentage >= 100 and not assignment.certificate_id:
        module = db.query(MicrolearningModule).filter(MicrolearningModule.id == assignment.module_id).first()
        certificate = CertificateRecord(
            id=str(uuid4()),
            certificate_no=f"MICRO-{current_user.id[:8]}-{int(datetime.utcnow().timestamp())}",
            verdict_id=str(uuid4()),
            trainee_id=current_user.id,
            trainer_id=assignment.assigned_by,
            unit_of_competency=module.title if module else "Microlearning Module",
            kip_score=assignment.completion_percentage,
            qr_token=str(uuid4()),
            source_type="microlearning_assignment",
            source_id=assignment.id,
            achievement_type="microlearning_completion",
            issued_at=datetime.utcnow(),
        )
        db.add(certificate)
        db.flush()
        assignment.certificate_id = certificate.id

    db.commit()

    return {
        "assignment_id": assignment.id,
        "status": assignment.status,
        "completion_percentage": assignment.completion_percentage,
        "certificate_id": assignment.certificate_id,
    }
