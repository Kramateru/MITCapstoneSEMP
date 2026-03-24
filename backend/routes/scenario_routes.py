"""
Scenario Management Routes
Handles scenario CRUD, branching logic, and scenario templates
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import Scenario, ScenarioFlow, User, UserRole
from ..schemas import (
    ScenarioCreate,
    ScenarioFlowBase,
    ScenarioFlowResponse,
    ScenarioResponse,
    ScenarioUpdate,
    SuccessResponse,
)

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


@router.post("", response_model=ScenarioResponse, status_code=status.HTTP_201_CREATED)
async def create_scenario(
    scenario_data: ScenarioCreate,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Create a new scenario (trainer/admin only)"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainer or admin access required"
        )
    
    # Create scenario
    new_scenario = Scenario(
        title=scenario_data.title,
        description=scenario_data.description,
        purpose=scenario_data.purpose,
        difficulty=scenario_data.difficulty,
        lob=scenario_data.lob,
        opening_prompt=scenario_data.opening_prompt,
        opening_prompt_audio=scenario_data.opening_prompt_audio,
        expected_keywords=scenario_data.expected_keywords,
        estimated_duration=scenario_data.estimated_duration,
        created_by=current_user.id,
        is_draft=True,
        is_published=False,
    )
    
    db.add(new_scenario)
    db.flush()  # Get scenario ID
    
    # Add flow steps if provided
    if scenario_data.flow_steps:
        for step_data in scenario_data.flow_steps:
            new_step = ScenarioFlow(
                scenario_id=new_scenario.id,
                step_number=step_data.step_number,
                step_type=step_data.step_type,
                prompt_text=step_data.prompt_text,
                prompt_audio=step_data.prompt_audio,
                expected_response=step_data.expected_response,
                expected_keywords_for_step=step_data.expected_keywords_for_step,
                condition_type=step_data.condition_type,
                condition_value=step_data.condition_value,
                jump_to_step=step_data.jump_to_step,
                alternative_step=step_data.alternative_step,
                is_closing=step_data.is_closing,
                response_time_limit=step_data.response_time_limit,
            )
            db.add(new_step)
    
    db.commit()
    db.refresh(new_scenario)
    
    return ScenarioResponse.from_orm(new_scenario)


@router.get("", response_model=List[ScenarioResponse])
async def list_scenarios(
    difficulty: Optional[str] = Query(None),
    purpose: Optional[str] = Query(None),
    lob: Optional[str] = Query(None),
    published_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List scenarios with optional filtering"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    query = db.query(Scenario)
    
    # Filter by published/draft status
    if published_only:
        query = query.filter(Scenario.is_published == True)
    
    # Only trainers and admins see draft scenarios from other users
    if current_user.role == UserRole.TRAINEE:
        query = query.filter(Scenario.is_published == True)
    elif current_user.role == UserRole.TRAINER:
        # Show own drafts and all published
        query = query.filter(
            (Scenario.is_published == True) | (Scenario.created_by == current_user.id)
        )
    
    # Apply filters
    if difficulty:
        query = query.filter(Scenario.difficulty == difficulty)
    if purpose:
        query = query.filter(Scenario.purpose == purpose)
    if lob:
        query = query.filter(Scenario.lob == lob)
    
    scenarios = query.offset(skip).limit(limit).all()
    return [ScenarioResponse.from_orm(s) for s in scenarios]


@router.get("/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario(
    scenario_id: str,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get scenario by ID"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found"
        )
    
    # Check access
    if not scenario.is_published and scenario.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return ScenarioResponse.from_orm(scenario)


@router.put("/{scenario_id}", response_model=ScenarioResponse)
async def update_scenario(
    scenario_id: str,
    scenario_update: ScenarioUpdate,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Update scenario (creator or admin only)"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found"
        )
    
    # Check permissions
    if scenario.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Update fields
    if scenario_update.title:
        scenario.title = scenario_update.title
    if scenario_update.description:
        scenario.description = scenario_update.description
    if scenario_update.difficulty:
        scenario.difficulty = scenario_update.difficulty
    if scenario_update.opening_prompt:
        scenario.opening_prompt = scenario_update.opening_prompt
    if scenario_update.is_published is not None:
        scenario.is_published = scenario_update.is_published
        scenario.is_draft = not scenario_update.is_published
    
    db.commit()
    db.refresh(scenario)
    
    return ScenarioResponse.from_orm(scenario)


@router.post("/{scenario_id}/publish", response_model=SuccessResponse)
async def publish_scenario(
    scenario_id: str,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Publish a scenario (creator or admin only)"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found"
        )
    
    # Check permissions
    if scenario.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    scenario.is_published = True
    scenario.is_draft = False
    db.commit()
    
    return SuccessResponse(message="Scenario published successfully")


@router.delete("/{scenario_id}", response_model=SuccessResponse)
async def delete_scenario(
    scenario_id: str,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Delete scenario (creator or admin only)"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found"
        )
    
    # Check permissions
    if scenario.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Delete associated flow steps
    db.query(ScenarioFlow).filter(ScenarioFlow.scenario_id == scenario_id).delete()
    db.delete(scenario)
    db.commit()
    
    return SuccessResponse(message="Scenario deleted successfully")


# ==================== Scenario Flow Management ====================


@router.post("/{scenario_id}/steps", response_model=ScenarioFlowResponse, status_code=status.HTTP_201_CREATED)
async def add_flow_step(
    scenario_id: str,
    step_data: ScenarioFlowBase,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Add a branching logic step to a scenario"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found"
        )
    
    # Check permissions
    if scenario.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    new_step = ScenarioFlow(
        scenario_id=scenario_id,
        step_number=step_data.step_number,
        step_type=step_data.step_type,
        prompt_text=step_data.prompt_text,
        prompt_audio=step_data.prompt_audio,
        expected_response=step_data.expected_response,
        expected_keywords_for_step=step_data.expected_keywords_for_step,
        condition_type=step_data.condition_type,
        condition_value=step_data.condition_value,
        jump_to_step=step_data.jump_to_step,
        alternative_step=step_data.alternative_step,
        is_closing=step_data.is_closing,
        response_time_limit=step_data.response_time_limit,
    )
    
    db.add(new_step)
    db.commit()
    db.refresh(new_step)
    
    return ScenarioFlowResponse.from_orm(new_step)


@router.get("/{scenario_id}/steps", response_model=List[ScenarioFlowResponse])
async def get_scenario_steps(
    scenario_id: str,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all flow steps for a scenario"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found"
        )
    
    steps = db.query(ScenarioFlow).filter(
        ScenarioFlow.scenario_id == scenario_id
    ).order_by(ScenarioFlow.step_number).all()
    
    return [ScenarioFlowResponse.from_orm(s) for s in steps]


@router.put("/{scenario_id}/steps/{step_id}", response_model=ScenarioFlowResponse)
async def update_flow_step(
    scenario_id: str,
    step_id: str,
    step_update: ScenarioFlowBase,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Update a scenario flow step"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found"
        )
    
    # Check permissions
    if scenario.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    step = db.query(ScenarioFlow).filter(ScenarioFlow.id == step_id).first()
    if not step:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Step not found"
        )
    
    # Update fields
    step.step_number = step_update.step_number
    step.step_type = step_update.step_type
    step.prompt_text = step_update.prompt_text
    step.prompt_audio = step_update.prompt_audio
    step.expected_response = step_update.expected_response
    step.expected_keywords_for_step = step_update.expected_keywords_for_step
    step.condition_type = step_update.condition_type
    step.condition_value = step_update.condition_value
    step.jump_to_step = step_update.jump_to_step
    step.alternative_step = step_update.alternative_step
    step.is_closing = step_update.is_closing
    step.response_time_limit = step_update.response_time_limit
    
    db.commit()
    db.refresh(step)
    
    return ScenarioFlowResponse.from_orm(step)


@router.delete("/{scenario_id}/steps/{step_id}", response_model=SuccessResponse)
async def delete_flow_step(
    scenario_id: str,
    step_id: str,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Delete a scenario flow step"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found"
        )
    
    # Check permissions
    if scenario.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    step = db.query(ScenarioFlow).filter(ScenarioFlow.id == step_id).first()
    if not step:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Step not found"
        )
    
    db.delete(step)
    db.commit()
    
    return SuccessResponse(message="Step deleted successfully")
