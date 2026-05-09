"""
Call Simulation Audio Recording Access Routes
Handles trainer access to trainee audio recordings for coaching
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import SimSession, User, UserRole

router = APIRouter(prefix="/api/call-simulation", tags=["call-simulation-recordings"])
logger = logging.getLogger(__name__)


@router.get("/session/{session_id}/audio")
async def get_session_audio(
    session_id: str,
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
    if session.audio_url.startswith("http"):
        return {
            "audio_url": session.audio_url,
            "message": "Recording found on Supabase storage",
            "type": "supabase_redirect",
        }

    if session.audio_url.startswith("/media/"):
        return {
            "audio_url": session.audio_url,
            "message": "Recording found in the local media fallback workspace",
            "type": "local_proxy",
        }

    raise HTTPException(status_code=404, detail="No playable recording URL is available for this session")


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
