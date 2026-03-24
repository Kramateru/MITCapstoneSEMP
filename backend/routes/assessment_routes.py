"""
Assessment Routes
Handles practice sessions, speech recording, and pronunciation scoring
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session
import json

from .. import auth_utils
from ..database import get_db
from ..models import PracticeSession, Scenario, Feedback, FeedbackType, User
from ..schemas import (
    PracticeSessionCreate,
    PracticeSessionResponse,
    PronunciationScores,
    SuccessResponse,
    FeedbackCreate,
    FeedbackResponse,
)

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


@router.post("/sessions", response_model=PracticeSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_practice_session(
    session_data: PracticeSessionCreate,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Create a new practice session"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Verify scenario exists
    scenario = db.query(Scenario).filter(Scenario.id == session_data.scenario_id).first()
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scenario not found"
        )
    
    # Create practice session
    new_session = PracticeSession(
        user_id=current_user.id,
        scenario_id=session_data.scenario_id,
        audio_file_url=session_data.audio_file_url,
        transcription=session_data.transcription,
        status="completed",
        attempt_number=1,
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    return PracticeSessionResponse.from_orm(new_session)


@router.get("/sessions", response_model=List[PracticeSessionResponse])
async def list_practice_sessions(
    scenario_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List practice sessions"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    query = db.query(PracticeSession)
    
    # Filter by user
    if user_id:
        # Trainee can only see their own sessions
        if current_user.id != user_id and current_user.role.value == "trainee":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
        query = query.filter(PracticeSession.user_id == user_id)
    else:
        # Non-admin users see only their own sessions
        if current_user.role.value != "admin":
            query = query.filter(PracticeSession.user_id == current_user.id)
    
    # Filter by scenario
    if scenario_id:
        query = query.filter(PracticeSession.scenario_id == scenario_id)
    
    sessions = query.offset(skip).limit(limit).order_by(PracticeSession.created_at.desc()).all()
    return [PracticeSessionResponse.from_orm(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=PracticeSessionResponse)
async def get_practice_session(
    session_id: str,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get practice session by ID"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    # Check access
    if session.user_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return PracticeSessionResponse.from_orm(session)


@router.put("/sessions/{session_id}", response_model=SuccessResponse)
async def update_practice_session_scores(
    session_id: str,
    scores: PronunciationScores,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Update practice session with pronunciation scores"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    # Only trainers/admins can update scores
    if current_user.role.value not in ["trainer", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainer or admin access required"
        )
    
    # Update scores
    session.accuracy_score = scores.accuracy
    session.fluency_score = scores.fluency
    session.clarity_score = scores.completeness  # Using completeness as clarity
    session.overall_score = (scores.accuracy + scores.fluency + scores.completeness + scores.prosody) / 4
    
    # Determine if session passed
    if session.overall_score >= 70:
        session.status = "completed"
    else:
        session.status = "needs_review"
    
    session.is_verified = True
    session.reviewed_by = current_user.id
    
    db.commit()
    
    return SuccessResponse(message="Session scores updated successfully")


# ==================== Feedback Management ====================


@router.post("/sessions/{session_id}/feedback", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def add_feedback(
    session_id: str,
    feedback_data: FeedbackCreate,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Add feedback to a practice session"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Verify session exists
    session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    # Only trainers and admins can add feedback
    if current_user.role.value not in ["trainer", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainer or admin access required"
        )
    
    # Create feedback
    new_feedback = Feedback(
        practice_session_id=session_id,
        trainer_id=current_user.id,
        feedback_type=feedback_data.feedback_type,
        content=feedback_data.content,
        is_automated=feedback_data.is_automated,
        recommended_module_id=feedback_data.recommended_module_id,
        recommended_exercises=feedback_data.recommended_exercises,
    )
    
    db.add(new_feedback)
    db.commit()
    db.refresh(new_feedback)
    
    return FeedbackResponse.from_orm(new_feedback)


@router.get("/sessions/{session_id}/feedback", response_model=List[FeedbackResponse])
async def get_session_feedback(
    session_id: str,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all feedback for a practice session"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    # Check access
    if session.user_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    feedback_items = db.query(Feedback).filter(
        Feedback.practice_session_id == session_id
    ).order_by(Feedback.created_at.desc()).all()
    
    return [FeedbackResponse.from_orm(f) for f in feedback_items]


@router.put("/feedback/{feedback_id}/acknowledge", response_model=SuccessResponse)
async def acknowledge_feedback(
    feedback_id: str,
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Mark feedback as acknowledged by trainee"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found"
        )
    
    # Check access
    session = db.query(PracticeSession).filter(
        PracticeSession.id == feedback.practice_session_id
    ).first()
    
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    feedback.is_acknowledge_by_trainee = True
    db.commit()
    
    return SuccessResponse(message="Feedback acknowledged")


# ==================== WebSocket for Real-time Assessment ====================


@router.websocket("/ws/practice/{scenario_id}")
async def assess_practice(
    websocket: WebSocket,
    scenario_id: str,
    token: Optional[str] = None
):
    """
    WebSocket endpoint for real-time practice session assessment
    Client sends audio chunks, server returns live assessment results
    """
    await websocket.accept()
    
    try:
        # Get user from token (implement token verification)
        # For now, accept the connection
        
        audio_buffer = bytearray()
        session_started = False
        practice_session = None
        reference_text = None
        
        while True:
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                
                # Initialize session
                if message.get("type") == "init":
                    session_started = True
                    reference_text = message.get("reference_text")
                    
                    await websocket.send_json({
                        "type": "session_ready",
                        "reference_text": reference_text,
                        "message": "Ready to receive audio"
                    })
                
                # Receive audio chunk
                elif message.get("type") == "audio":
                    audio_data = message.get("audio")
                    if audio_data:
                        import base64
                        audio_bytes = base64.b64decode(audio_data)
                        audio_buffer.extend(audio_bytes)
                        
                        await websocket.send_json({
                            "type": "audio_received",
                            "bytes_received": len(audio_bytes)
                        })
                
                # End session and process
                elif message.get("type") == "stop":
                    if len(audio_buffer) > 0:
                        # Send processing status
                        await websocket.send_json({
                            "type": "processing",
                            "message": "Processing audio for pronunciation assessment"
                        })
                        
                        # Here you would call the pronunciation assessment
                        # For now, send mock results
                        await websocket.send_json({
                            "type": "assessment_complete",
                            "overall_score": 85.5,
                            "accuracy": 88.0,
                            "fluency": 82.0,
                            "completeness": 100.0,
                            "prosody": 84.0,
                            "transcription": "sample transcription",
                            "word_feedback": []
                        })
                        
                        audio_buffer = bytearray()
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": "No audio data received"
                        })
            
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON message"
                })
    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except:
            pass
