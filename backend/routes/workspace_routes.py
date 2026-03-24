"""
Workspace Management Routes - NLP configuration, empathy library, forbidden words, probing questions
Trainers can customize language settings per workspace
"""

import uuid
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models import User, Workspace
from ..database import get_db
from ..schemas import WorkspaceCreate

router = APIRouter(prefix="/api/workspace", tags=["Workspace"])


# Pydantic Models

class EmpathyStatement(BaseModel):
    id: Optional[str] = None
    statement: str
    category: str  # greeting, acknowledgment, validation, apology, reassurance
    language: str = "en"
    is_approved: bool = True
    usage_count: int = 0


class ProbingQuestion(BaseModel):
    id: Optional[str] = None
    question: str
    context: str  # When to use (e.g., "clarification", "root_cause", "follow_up")
    department: Optional[str] = None  # Customer Service, Tech Support, etc.
    difficulty: str = "medium"  # easy, medium, hard
    is_approved: bool = True


class ForbiddenWord(BaseModel):
    id: Optional[str] = None
    word: str
    reason: str  # "Offensive", "Jargon", "Competitor name", "Confidential"
    severity: str = "medium"  # low, medium, high
    replacement: Optional[str] = None  # Suggested alternative
    is_active: bool = True


class RequiredKeyword(BaseModel):
    id: Optional[str] = None
    keyword: str
    importance: str = "medium"  # low, medium, high
    context: str  # When this keyword should be used
    score_impact: float = 1.0  # How much it affects the score


class WorkspaceNLPConfig(BaseModel):
    workspace_id: str
    empathy_statements: List[EmpathyStatement] = []
    probing_questions: List[ProbingQuestion] = []
    forbidden_words: List[ForbiddenWord] = []
    required_keywords: List[RequiredKeyword] = []
    
    # NLP Settings
    confidence_threshold: float = 0.75
    language_dialect: str = "en-US"
    is_production: bool = False
    updated_at: Optional[datetime] = None


class WorkspaceNLPStatsResponse(BaseModel):
    total_empathy_statements: int
    total_probing_questions: int
    total_forbidden_words: int
    total_required_keywords: int
    last_updated: Optional[datetime]
    is_production_approved: bool


# Dependency to verify trainer/admin

async def verify_trainer_or_admin(current_user: Any = Depends(get_db)):
    """Verify user is trainer or admin"""
    if not current_user or current_user.role not in ["trainer", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainer or Admin access required"
        )
    return current_user


# GET ENDPOINTS ============================================

@router.post("", response_model=dict)
async def create_workspace(
    workspace_data: WorkspaceCreate,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Create a new workspace (trainer or admin)"""
    new_ws = Workspace(
        name=workspace_data.name,
        trainer_id=current_user.id if current_user.role == "trainer" else None,
        empathy_statements=workspace_data.empathy_statements or [],
        probing_questions=workspace_data.probing_questions or [],
        forbidden_words=workspace_data.forbidden_words or [],
        required_keywords=workspace_data.required_keywords or [],
    )
    db.add(new_ws)
    db.commit()
    db.refresh(new_ws)
    return {"id": new_ws.id, "name": new_ws.name}


@router.get("", response_model=list)
async def list_workspaces(
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """List workspaces (trainers see own, admins see all)"""
    query = db.query(Workspace)
    if current_user.role == "trainer":
        query = query.filter(Workspace.trainer_id == current_user.id)
    workspaces = query.all()
    return [
        {"id": w.id, "name": w.name, "trainer_id": w.trainer_id} for w in workspaces
    ]


@router.get("/{workspace_id}/config")
async def get_workspace_nlp_config(
    workspace_id: str,
    db: Session = Depends(get_db)
):
    """Get complete NLP configuration for a workspace"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    return {
        "workspace_id": workspace.id,
        "empathy_statements": workspace.empathy_statements or [],
        "probing_questions": workspace.probing_questions or [],
        "forbidden_words": workspace.forbidden_words or [],
        "required_keywords": workspace.required_keywords or [],
        "confidence_threshold": getattr(workspace, 'confidence_threshold', 0.75),
        "language_dialect": workspace.language_dialect,
        "is_production": getattr(workspace, 'is_production', False)
    }


@router.get("/{workspace_id}/empathy-statements")
async def get_empathy_statements(
    workspace_id: str,
    db: Session = Depends(get_db)
):
    """Get all empathy statements for workspace"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    statements = workspace.empathy_statements or []
    # Organize by category
    by_category = {}
    for stmt in statements:
        category = stmt.get('category', 'uncategorized')
        if category not in by_category:
            by_category[category] = []
        by_category[category].append(stmt)
    
    return {
        "workspace_id": workspace_id,
        "total_count": len(statements),
        "by_category": by_category,
        "statements": statements
    }


@router.get("/{workspace_id}/probing-questions")
async def get_probing_questions(
    workspace_id: str,
    db: Session = Depends(get_db)
):
    """Get all probing questions for workspace"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    questions = workspace.probing_questions or []
    
    return {
        "workspace_id": workspace_id,
        "total_count": len(questions),
        "questions": questions,
        "contexts": list(set(q.get('context') for q in questions if q.get('context')))
    }


@router.get("/{workspace_id}/forbidden-words")
async def get_forbidden_words(
    workspace_id: str,
    db: Session = Depends(get_db)
):
    """Get all forbidden/restricted words for workspace"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    words = workspace.forbidden_words or []
    active_only = [w for w in words if w.get('is_active', True)]
    
    return {
        "workspace_id": workspace_id,
        "total_count": len(words),
        "active_count": len(active_only),
        "by_severity": {
            "high": len([w for w in words if w.get('severity') == 'high']),
            "medium": len([w for w in words if w.get('severity') == 'medium']),
            "low": len([w for w in words if w.get('severity') == 'low'])
        },
        "words": active_only
    }


@router.get("/{workspace_id}/required-keywords")
async def get_required_keywords(
    workspace_id: str,
    db: Session = Depends(get_db)
):
    """Get all required keywords for workspace"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    keywords = workspace.required_keywords or []
    
    return {
        "workspace_id": workspace_id,
        "total_count": len(keywords),
        "keywords": keywords,
        "by_importance": {
            "high": len([k for k in keywords if k.get('importance') == 'high']),
            "medium": len([k for k in keywords if k.get('importance') == 'medium']),
            "low": len([k for k in keywords if k.get('importance') == 'low'])
        }
    }


@router.get("/{workspace_id}/statistics")
async def get_workspace_nlp_statistics(
    workspace_id: str,
    db: Session = Depends(get_db)
):
    """Get statistics about NLP configuration"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    statements = workspace.empathy_statements or []
    questions = workspace.probing_questions or []
    words = workspace.forbidden_words or []
    keywords = workspace.required_keywords or []
    
    return WorkspaceNLPStatsResponse(
        total_empathy_statements=len(statements),
        total_probing_questions=len(questions),
        total_forbidden_words=len(words),
        total_required_keywords=len(keywords),
        last_updated=workspace.updated_at,
        is_production_approved=getattr(workspace, 'is_production', False)
    )


# CREATE/ADD ENDPOINTS ============================================

@router.post("/{workspace_id}/empathy-statements")
async def add_empathy_statement(
    workspace_id: str,
    statement: EmpathyStatement,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Add a new empathy statement to workspace"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    statements = workspace.empathy_statements or []
    
    new_stmt = {
        "id": statement.id or str(uuid.uuid4()),
        "statement": statement.statement,
        "category": statement.category,
        "language": statement.language,
        "is_approved": statement.is_approved,
        "usage_count": 0,
        "added_by_user_id": current_user.id,
        "added_at": datetime.utcnow().isoformat()
    }
    
    statements.append(new_stmt)
    workspace.empathy_statements = statements
    workspace.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "success": True,
        "statement_id": new_stmt["id"],
        "message": "Empathy statement added",
        "total_statements": len(statements)
    }


@router.post("/{workspace_id}/probing-questions")
async def add_probing_question(
    workspace_id: str,
    question: ProbingQuestion,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Add a new probing question to workspace"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    questions = workspace.probing_questions or []
    
    new_question = {
        "id": question.id or str(uuid.uuid4()),
        "question": question.question,
        "context": question.context,
        "department": question.department,
        "difficulty": question.difficulty,
        "is_approved": question.is_approved,
        "added_by_user_id": current_user.id,
        "added_at": datetime.utcnow().isoformat()
    }
    
    questions.append(new_question)
    workspace.probing_questions = questions
    workspace.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "success": True,
        "question_id": new_question["id"],
        "message": "Probing question added",
        "total_questions": len(questions)
    }


@router.post("/{workspace_id}/forbidden-words")
async def add_forbidden_word(
    workspace_id: str,
    word_data: ForbiddenWord,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Add a forbidden/restricted word to workspace"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    words = workspace.forbidden_words or []
    
    new_word = {
        "id": word_data.id or str(uuid.uuid4()),
        "word": word_data.word.lower(),
        "reason": word_data.reason,
        "severity": word_data.severity,
        "replacement": word_data.replacement,
        "is_active": word_data.is_active,
        "added_by_user_id": current_user.id,
        "added_at": datetime.utcnow().isoformat()
    }
    
    words.append(new_word)
    workspace.forbidden_words = words
    workspace.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "success": True,
        "word_id": new_word["id"],
        "message": "Forbidden word added",
        "total_forbidden_words": len(words)
    }


@router.post("/{workspace_id}/required-keywords")
async def add_required_keyword(
    workspace_id: str,
    keyword_data: RequiredKeyword,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Add a required keyword to workspace"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    keywords = workspace.required_keywords or []
    
    new_keyword = {
        "id": keyword_data.id or str(uuid.uuid4()),
        "keyword": keyword_data.keyword.lower(),
        "importance": keyword_data.importance,
        "context": keyword_data.context,
        "score_impact": keyword_data.score_impact,
        "added_by_user_id": current_user.id,
        "added_at": datetime.utcnow().isoformat()
    }
    
    keywords.append(new_keyword)
    workspace.required_keywords = keywords
    workspace.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "success": True,
        "keyword_id": new_keyword["id"],
        "message": "Required keyword added",
        "total_keywords": len(keywords)
    }


# UPDATE ENDPOINTS ============================================

@router.put("/{workspace_id}/empathy-statements/{statement_id}")
async def update_empathy_statement(
    workspace_id: str,
    statement_id: str,
    statement: EmpathyStatement,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Update an empathy statement"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    statements = workspace.empathy_statements or []
    
    for stmt in statements:
        if stmt.get("id") == statement_id:
            stmt["statement"] = statement.statement
            stmt["category"] = statement.category
            stmt["updated_at"] = datetime.utcnow().isoformat()
            workspace.empathy_statements = statements
            workspace.updated_at = datetime.utcnow()
            db.commit()
            return {"success": True, "message": "Statement updated"}
    
    raise HTTPException(status_code=404, detail="Statement not found")


@router.delete("/{workspace_id}/empathy-statements/{statement_id}")
async def delete_empathy_statement(
    workspace_id: str,
    statement_id: str,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Delete an empathy statement"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    statements = [s for s in (workspace.empathy_statements or []) if s.get("id") != statement_id]
    workspace.empathy_statements = statements
    workspace.updated_at = datetime.utcnow()
    db.commit()
    
    return {"success": True, "message": "Statement deleted"}


@router.delete("/{workspace_id}/forbidden-words/{word_id}")
async def delete_forbidden_word(
    workspace_id: str,
    word_id: str,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Delete a forbidden word (soft delete by marking inactive)"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    words = workspace.forbidden_words or []
    for word in words:
        if word.get("id") == word_id:
            word["is_active"] = False
            break
    
    workspace.forbidden_words = words
    workspace.updated_at = datetime.utcnow()
    db.commit()
    
    return {"success": True, "message": "Forbidden word deactivated"}


# IMPORT/EXPORT ENDPOINTS ============================================

@router.post("/{workspace_id}/import-nlp-config")
async def import_nlp_configuration(
    workspace_id: str,
    config: WorkspaceNLPConfig,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Bulk import NLP configuration (e.g., from template or another workspace)"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    workspace.empathy_statements = config.empathy_statements
    workspace.probing_questions = config.probing_questions
    workspace.forbidden_words = config.forbidden_words
    workspace.required_keywords = config.required_keywords
    workspace.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "success": True,
        "message": "NLP configuration imported",
        "stats": {
            "empathy_statements": len(config.empathy_statements),
            "probing_questions": len(config.probing_questions),
            "forbidden_words": len(config.forbidden_words),
            "required_keywords": len(config.required_keywords)
        }
    }


@router.get("/{workspace_id}/export-nlp-config")
async def export_nlp_configuration(
    workspace_id: str,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Export current NLP configuration as JSON (for sharing or backup)"""
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    return {
        "workspace_id": workspace_id,
        "workspace_name": workspace.name,
        "export_date": datetime.utcnow().isoformat(),
        "config": {
            "empathy_statements": workspace.empathy_statements or [],
            "probing_questions": workspace.probing_questions or [],
            "forbidden_words": workspace.forbidden_words or [],
            "required_keywords": workspace.required_keywords or []
        }
    }


@router.post("/{workspace_id}/approve-for-production")
async def approve_workspace_production(
    workspace_id: str,
    current_user: Any = Depends(verify_trainer_or_admin),
    db: Session = Depends(get_db)
):
    """Mark workspace NLP config as approved for production use"""
    
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can approve for production"
        )
    
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    workspace.is_production = True
    workspace.updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "message": "Workspace approved for production",
        "workspace_id": workspace_id
    }


@router.get("/health")
async def workspace_health():
    """Health check for workspace service"""
    return {
        "status": "healthy",
        "service": "workspace",
        "capabilities": [
            "empathy_statements_management",
            "probing_questions_library",
            "forbidden_words_filtering",
            "required_keywords_tracking",
            "nlp_configuration_import_export",
            "production_approval"
        ]
    }
