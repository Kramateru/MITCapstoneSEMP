"""
Sim Floor Audio Recording Access Routes
Handles trainer access to trainee audio recordings for coaching
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import SimSession, User, UserRole
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/api/sim-floor", tags=["sim-floor-recordings"])
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
    else:
        raise HTTPException(status_code=403, detail="Only trainees and trainers can access recordings")

    # Check if recording exists
    if not session.audio_url:
        raise HTTPException(status_code=404, detail="No audio recording available for this session")

    # If audio URL is a Supabase URL (starts with http), redirect to it
    if session.audio_url.startswith("http"):
        return {
            "audio_url": session.audio_url,
            "message": "Recording found on Supabase storage",
            "type": "supabase_redirect",
        }

    # If it's a local path, serve the file
    if session.audio_url.startswith("/api/sim-floor/recordings/"):
        file_path_parts = session.audio_url.replace("/api/sim-floor/recordings/", "").split("/")
        if len(file_path_parts) != 2:
            raise HTTPException(status_code=400, detail="Invalid audio path format")

        user_id, filename = file_path_parts
        local_audio_dir = os.path.join(os.getcwd(), "media", "sim-floor-recordings", user_id)
        local_filepath = os.path.join(local_audio_dir, filename)

        # Security check: ensure file is within the expected directory
        if not os.path.abspath(local_filepath).startswith(os.path.abspath(local_audio_dir)):
            raise HTTPException(status_code=400, detail="Invalid file path")

        if not os.path.exists(local_filepath):
            logger.warning(f"Audio file not found: {local_filepath}")
            raise HTTPException(status_code=404, detail="Audio file not found on disk")

        logger.info(f"Serving local audio: {local_filepath}")
        return FileResponse(
            local_filepath,
            media_type="audio/webm",
            headers={
                "Content-Disposition": f"inline; filename={os.path.basename(local_filepath)}",
            },
        )

    raise HTTPException(status_code=400, detail="Invalid audio URL format")


@router.get("/recordings/{user_id}/{filename}")
async def get_recording_file(
    user_id: str,
    filename: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Direct access endpoint for local audio recordings.
    Used for streaming audio files from local storage.
    """
    current_user = await auth_utils.get_current_user(authorization, db)

    # Check authorization
    if current_user.role == UserRole.TRAINEE:
        if user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot access other user's recordings")
    elif current_user.role not in [UserRole.TRAINER, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Only trainers and admins can access this")

    # Construct safe file path
    local_audio_dir = os.path.join(os.getcwd(), "media", "sim-floor-recordings", user_id)
    local_filepath = os.path.join(local_audio_dir, filename)

    # Security check: ensure file is within the expected directory
    abs_path = os.path.abspath(local_filepath)
    abs_dir = os.path.abspath(local_audio_dir)
    if not abs_path.startswith(abs_dir):
        raise HTTPException(status_code=403, detail="Invalid file path")

    if not os.path.exists(local_filepath):
        logger.warning(f"Audio file not found: {local_filepath}")
        raise HTTPException(status_code=404, detail="Audio recording not found")

    logger.info(f"Streaming audio: {local_filepath}")
    return FileResponse(
        local_filepath,
        media_type="audio/webm",
        headers={
            "Content-Disposition": f"inline; filename={filename}",
        },
    )
