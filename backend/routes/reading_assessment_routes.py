"""
Reading Assessment Routes
API endpoints for creating reading modules, recording assessments, and retrieving results.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
import logging

from ..database import get_db
from ..models import User, MicrolearningModule, MicrolearningAssignment
from ..models_reading import ReadingAttempt, ReadingWordAnalysis, ReadingModuleConfig
from ..auth_utils import get_current_user
from ..services import audio_transcription
from ..services.reading_assessment import ReadingPronunciationAnalyzer, PronunciationScore
from ..supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trainee/reading", tags=["reading-assessment"])

try:
    from ..services.audio_transcription import get_transcription_service as _direct_get_transcription_service
except Exception:
    _direct_get_transcription_service = None


def get_transcription_service():
    """Resolve the shared transcription service lazily at runtime."""
    if callable(_direct_get_transcription_service):
        return _direct_get_transcription_service()

    service_factory = getattr(audio_transcription, "get_transcription_service", None)
    if callable(service_factory):
        return service_factory()

    service = getattr(audio_transcription, "speech_to_text_service", None)
    if service is not None:
        return service

    raise RuntimeError("Audio transcription service is unavailable.")


@router.post("/modules")
async def create_reading_module(
    *,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    title: str,
    description: Optional[str] = None,
    reading_content: str,
    passing_score: int,
    instructions: Optional[str] = None,
    max_attempts: int = 3,
    difficulty: str = "intermediate",
):
    """
    Create a new Reading microlearning module.
    Only trainers can create modules.
    """
    if user.role.value != "trainer":
        raise HTTPException(status_code=403, detail="Only trainers can create modules.")
    
    # Calculate word count and estimated reading time
    words = reading_content.split()
    word_count = len(words)
    estimated_time = max(1, word_count // 130)  # Average reading speed ~130 wpm
    
    # Create module
    module = MicrolearningModule(
        title=title,
        description=description or f"Read aloud and receive pronunciation feedback.",
        type="reading",
        category="reading",
        passing_score=passing_score,
        duration_minutes=estimated_time,
        content_data={
            "reading_content": reading_content,
            "word_count": word_count,
            "estimated_reading_time_minutes": estimated_time,
            "instructions": instructions,
            "max_attempts": max_attempts,
            "difficulty": difficulty,
        },
        created_by=user.id,
    )
    
    db.add(module)
    db.flush()
    
    # Create reading-specific config
    config = ReadingModuleConfig(
        module_id=module.id,
        reading_content=reading_content,
        word_count=word_count,
        estimated_reading_time_minutes=estimated_time,
        instructions=instructions,
        max_attempts=max_attempts,
        difficulty=difficulty,
    )
    
    db.add(config)
    db.commit()
    db.refresh(module)
    
    logger.info(f"Created reading module {module.id} by trainer {user.id}")
    
    return {
        "id": module.id,
        "title": module.title,
        "type": "reading",
        "word_count": word_count,
        "estimated_reading_time_minutes": estimated_time,
        "passing_score": passing_score,
    }


@router.post("/attempts/{module_id}/start")
async def start_reading_attempt(
    module_id: str,
    *,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Start a new reading assessment attempt."""
    if user.role.value != "trainee":
        raise HTTPException(status_code=403, detail="Only trainees can create attempts.")
    
    # Get module
    module = db.query(MicrolearningModule).filter_by(id=module_id, type="reading").first()
    if not module:
        raise HTTPException(status_code=404, detail="Reading module not found.")
    
    # Check if assignment exists
    assignment = db.query(MicrolearningAssignment).filter_by(
        trainee_id=user.id,
        module_id=module_id,
    ).first()
    if not assignment:
        raise HTTPException(status_code=403, detail="Module not assigned to you.")
    
    # Get or calculate attempt number
    config = db.query(ReadingModuleConfig).filter_by(module_id=module_id).first()
    max_attempts = config.max_attempts if config else 3
    
    attempt_count = db.query(ReadingAttempt).filter_by(
        module_id=module_id,
        trainee_id=user.id,
    ).count()
    
    if attempt_count >= max_attempts:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum attempts ({max_attempts}) reached for this module."
        )
    
    # Create attempt
    attempt = ReadingAttempt(
        module_id=module_id,
        trainee_id=user.id,
        attempt_number=attempt_count + 1,
        expected_text=config.reading_content if config else module.content_data.get("reading_content", ""),
        passing_score=module.passing_score,
        status="in_progress",
    )
    
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    
    return {
        "attempt_id": attempt.id,
        "attempt_number": attempt.attempt_number,
        "reading_content": config.reading_content if config else module.content_data.get("reading_content"),
        "instructions": config.instructions if config else module.content_data.get("instructions"),
        "word_count": config.word_count if config else len(attempt.expected_text.split()),
    }


@router.post("/attempts/{attempt_id}/upload-audio")
async def upload_reading_audio(
    attempt_id: str,
    file: UploadFile = File(...),
    *,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload audio recording for a reading attempt."""
    # Verify ownership
    attempt = db.query(ReadingAttempt).filter_by(id=attempt_id).first()
    if not attempt or attempt.trainee_id != user.id:
        raise HTTPException(status_code=403, detail="Unauthorized.")
    
    if attempt.status != "in_progress":
        raise HTTPException(status_code=400, detail="Cannot upload audio to a completed attempt.")
    
    # Read file
    file_bytes = await file.read()
    
    # Upload to Supabase
    supabase = get_supabase_client()
    storage_path = f"reading-assessments/{attempt.module_id}/{user.id}/{attempt_id}.webm"
    
    audio_url = supabase.upload_microlearning_audio(
        module_id=attempt.module_id,
        trainer_id=user.id,  # Note: trainee_id stored as trainer_id for compatibility
        lesson_id=f"attempt-{attempt.attempt_number}",
        filename=f"reading-{attempt_id}.webm",
        file_data=file_bytes,
        content_type="audio/webm",
        allow_local_fallback=True,
    )
    
    if not audio_url:
        raise HTTPException(status_code=503, detail="Failed to upload audio.")
    
    # Update attempt
    attempt.audio_storage_path = storage_path
    attempt.audio_url = audio_url
    attempt.audio_duration_seconds = len(file_bytes) / 44100 / 2  # Rough estimate
    attempt.status = "processing"
    db.commit()
    
    logger.info(f"Uploaded audio for attempt {attempt_id}")
    
    return {"audio_url": audio_url, "status": "processing"}


@router.post("/attempts/{attempt_id}/process")
async def process_reading_assessment(
    attempt_id: str,
    *,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Process a reading attempt:
    - Convert audio to transcript
    - Align with expected text
    - Calculate pronunciation score
    - Generate feedback
    """
    attempt = db.query(ReadingAttempt).filter_by(id=attempt_id).first()
    if not attempt or attempt.trainee_id != user.id:
        raise HTTPException(status_code=403, detail="Unauthorized.")
    
    if not attempt.audio_url:
        raise HTTPException(status_code=400, detail="Audio not uploaded yet.")
    
    if attempt.status != "processing":
        raise HTTPException(status_code=400, detail="Attempt not in processing state.")
    
    try:
        # Step 1: Transcribe audio
        transcription_service = get_transcription_service()
        transcript = await transcription_service.transcribe_from_url(attempt.audio_url)
        attempt.audio_transcript = transcript
        
        # Step 2: Analyze pronunciation
        analyzer = ReadingPronunciationAnalyzer()
        alignment, score = analyzer.analyze_pronunciation(
            expected_text=attempt.expected_text,
            audio_transcript=transcript,
        )
        
        # Step 3: Store results
        attempt.total_words = score.total_words
        attempt.correct_words = score.correct_words
        attempt.mispronounced_words = score.mispronounced_words
        attempt.omitted_words = score.omitted_words
        attempt.extra_words = score.extra_words
        attempt.pronunciation_score = score.overall_score
        
        # Determine pass/fail
        passed = score.overall_score >= attempt.passing_score
        attempt.status = "passed" if passed else "failed"
        attempt.completed_at = datetime.utcnow()
        
        # Generate feedback
        common_issues = analyzer.extract_common_issues(alignment)
        attempt.most_common_issues = common_issues
        attempt.strengths = analyzer.generate_strengths_feedback(alignment, score)
        attempt.improvement_areas = analyzer.generate_improvement_feedback(
            alignment, common_issues, score
        )
        
        # Step 4: Store word-by-word analysis
        for word_alignment in alignment:
            word_analysis = ReadingWordAnalysis(
                attempt_id=attempt_id,
                word_index=attempt.expected_text.find(word_alignment.expected_word),
                expected_word=word_alignment.expected_word,
                spoken_word=word_alignment.spoken_word,
                status=word_alignment.status,
                confidence=word_alignment.confidence,
                feedback=word_alignment.feedback,
            )
            db.add(word_analysis)
        
        db.commit()
        db.refresh(attempt)
        
        logger.info(
            f"Processed reading attempt {attempt_id}: "
            f"score={score.overall_score:.1f}%, passed={passed}"
        )
        
        return {
            "attempt_id": attempt.id,
            "status": attempt.status,
            "score": float(attempt.pronunciation_score),
            "passing_score": float(attempt.passing_score),
            "passed": passed,
            "word_count": attempt.total_words,
            "correct": attempt.correct_words,
            "mispronounced": attempt.mispronounced_words,
            "omitted": attempt.omitted_words,
            "extra": attempt.extra_words,
            "strengths": attempt.strengths,
            "improvement_areas": attempt.improvement_areas,
        }
        
    except Exception as e:
        attempt.status = "error"
        db.commit()
        logger.exception(f"Error processing reading attempt {attempt_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to process audio.")


@router.get("/attempts/{attempt_id}")
async def get_reading_results(
    attempt_id: str,
    *,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get detailed results for a reading attempt."""
    attempt = db.query(ReadingAttempt).filter_by(id=attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    
    # Check authorization
    if attempt.trainee_id != user.id and user.id != attempt.module.created_by:
        raise HTTPException(status_code=403, detail="Unauthorized.")
    
    # Get word-by-word analysis
    word_analysis = db.query(ReadingWordAnalysis).filter_by(attempt_id=attempt_id).all()
    
    return {
        "id": attempt.id,
        "attempt_number": attempt.attempt_number,
        "status": attempt.status,
        "score": float(attempt.pronunciation_score) if attempt.pronunciation_score else None,
        "passing_score": float(attempt.passing_score),
        "passed": attempt.status == "passed",
        "word_count": attempt.total_words,
        "correct_words": attempt.correct_words,
        "mispronounced_words": attempt.mispronounced_words,
        "omitted_words": attempt.omitted_words,
        "extra_words": attempt.extra_words,
        "transcript": attempt.audio_transcript,
        "audio_url": attempt.audio_url,
        "strengths": attempt.strengths,
        "improvement_areas": attempt.improvement_areas,
        "common_issues": attempt.most_common_issues,
        "word_analysis": [
            {
                "word_index": wa.word_index,
                "expected_word": wa.expected_word,
                "spoken_word": wa.spoken_word,
                "status": wa.status,
                "confidence": float(wa.confidence) if wa.confidence else None,
                "feedback": wa.feedback,
            }
            for wa in word_analysis
        ],
        "created_at": attempt.created_at.isoformat() if attempt.created_at else None,
        "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
    }


@router.get("/modules/{module_id}/history")
async def get_attempt_history(
    module_id: str,
    *,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get attempt history for a reading module."""
    # Get attempts for this user
    attempts = db.query(ReadingAttempt).filter_by(
        module_id=module_id,
        trainee_id=user.id,
    ).order_by(ReadingAttempt.attempt_number).all()
    
    return {
        "module_id": module_id,
        "total_attempts": len(attempts),
        "attempts": [
            {
                "id": a.id,
                "attempt_number": a.attempt_number,
                "status": a.status,
                "score": float(a.pronunciation_score) if a.pronunciation_score else None,
                "passed": a.status == "passed",
                "completed_at": a.completed_at.isoformat() if a.completed_at else None,
            }
            for a in attempts
        ],
    }
