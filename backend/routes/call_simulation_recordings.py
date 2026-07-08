"""
Call Simulation Audio Recording Access Routes
Handles trainer access to trainee audio recordings for coaching
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import SimSession, User, UserRole
from ..services.audit import create_audit_log

router = APIRouter(prefix="/api/call-simulation", tags=["call-simulation-recordings"])
logger = logging.getLogger(__name__)


@router.get("/session/{session_id}/audio")
async def get_session_audio(
    session_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Stream audio recording for a trainee session.
    - Trainee can access their own recordings
    - Trainers can access recordings of their trainees
    - Returns audio file or Supabase URL
    """
    current_user = await auth_utils.get_current_user(authorization, db)

    # Get the session
    session = db.query(SimSession).filter(SimSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check authorization
    if current_user.role == UserRole.TRAINEE:
        if session.trainee_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot access other trainee recordings")
    elif current_user.role == UserRole.TRAINER:
        # Trainer can only access recordings of trainees in their batches
        trainee = db.query(User).filter(User.id == session.trainee_id).first()
        if not trainee:
            raise HTTPException(status_code=404, detail="Trainee not found")

        trainer_batch_ids = {batch.id for batch in current_user.batches_managed}
        trainee_batch_ids = {batch.id for batch in trainee.batches}
        if not trainer_batch_ids.intersection(trainee_batch_ids):
            raise HTTPException(status_code=403, detail="Trainer cannot access this trainee's recordings")
    elif current_user.role == UserRole.ADMIN:
        pass
    else:
        raise HTTPException(status_code=403, detail="Only trainees, trainers, and admins can access recordings")

    # Check if recording exists
    if not session.audio_url:
        raise HTTPException(status_code=404, detail="No audio recording available for this session")

    # Supabase-hosted recordings are returned as URLs for the client to stream directly.
    if session.audio_url.startswith("http") and "/storage/v1/object/public/" in session.audio_url:
        create_audit_log(
            db,
            user=current_user,
            request=request,
            action_type="trainer_viewed_recording" if current_user.role in {UserRole.TRAINER, UserRole.ADMIN} else "trainee_viewed_recording",
            module_name="Call Simulation",
            entity_type="sim_session",
            entity_id=session.id,
            description="Call Simulation recording URL was requested for playback.",
            batch_id=session.batch_id,
            trainee_id=session.trainee_id,
            trainer_id=getattr(current_user, "id", None) if current_user.role in {UserRole.TRAINER, UserRole.ADMIN} else session.assigned_by_id,
            session_id=session.id,
            http_status=200,
            metadata={"recording_url": session.audio_url},
        )
        db.commit()
        return {
            "audio_url": session.audio_url,
            "message": "Recording found on Supabase storage",
            "type": "supabase_redirect",
        }

    raise HTTPException(
        status_code=410,
        detail="This recording is not stored in Supabase Storage. Local recording URLs are no longer supported.",
    )


@router.get("/recordings/{user_id}/{filename}")
async def get_recording_file(
    user_id: str,
    filename: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Legacy route kept for compatibility. Local recording storage is no longer supported."""
    current_user = await auth_utils.get_current_user(authorization, db)

    if current_user.role == UserRole.TRAINEE:
        if user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot access other user's recordings")
    elif current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Only trainers and admins can access this")

    raise HTTPException(
        status_code=410,
        detail="Local recording URLs are no longer supported. Use the Supabase-backed session audio endpoint instead.",
    )
