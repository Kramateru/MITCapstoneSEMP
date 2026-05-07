"""
Microlearning Management & Certification Routes
Trainer: CRUD modules, assign modules to batch/trainee
Trainee: view assigned modules, complete modules, receive certificate
"""

import logging
import mimetypes
import re
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional
from urllib.parse import unquote, urlparse
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import (
    MicrolearningModule,
    MicrolearningUploadedAsset,
    MicrolearningAssignment,
    User,
    UserRole,
    Batch,
    CertificateRecord,
)
from ..schemas import SuccessResponse
from ..supabase_client import get_supabase_client
from ..services.audio_transcription import speech_to_text_service
from ..services.audio_tts import text_to_speech_service
from ..services.microlearning import assignment_is_current

router = APIRouter(prefix="/api/microlearning", tags=["microlearning"])
logger = logging.getLogger(__name__)
SUPABASE_PUBLIC_OBJECT_MARKER = "/storage/v1/object/public/"


def _sanitize_asset_name(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", (filename or "").strip())
    return cleaned.strip("-") or "asset.bin"


def _seconds_to_vtt_timestamp(value: float) -> str:
    total_milliseconds = max(int(round(float(value or 0.0) * 1000)), 0)
    hours, remainder = divmod(total_milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}"


def _build_webvtt_captions(
    *,
    transcript: str,
    words: Optional[list[dict[str, Any]]] = None,
    duration_seconds: Optional[float] = None,
) -> Optional[bytes]:
    cleaned_transcript = (transcript or "").strip()
    cue_lines: list[tuple[float, float, str]] = []
    normalized_words = [
        {
            "word": str(word.get("word") or "").strip(),
            "start": float(word.get("start") or 0.0),
            "end": float(word.get("end") or word.get("start") or 0.0),
        }
        for word in (words or [])
        if str(word.get("word") or "").strip()
    ]

    if normalized_words:
        buffer: list[str] = []
        cue_start = normalized_words[0]["start"]
        cue_end = normalized_words[0]["end"]

        for word in normalized_words:
            if not buffer:
                cue_start = word["start"]
            buffer.append(word["word"])
            cue_end = max(cue_end, word["end"])

            if (
                len(buffer) >= 8
                or (cue_end - cue_start) >= 5.0
                or word["word"].endswith((".", "!", "?"))
            ):
                cue_lines.append((cue_start, max(cue_end, cue_start + 0.8), " ".join(buffer)))
                buffer = []

        if buffer:
            cue_lines.append((cue_start, max(cue_end, cue_start + 0.8), " ".join(buffer)))
    elif cleaned_transcript:
        inferred_duration = float(duration_seconds or 0.0)
        if inferred_duration <= 0.0:
            inferred_duration = max(4.0, min(12.0, len(cleaned_transcript.split()) * 0.7))
        cue_lines.append((0.0, inferred_duration, cleaned_transcript))

    if not cue_lines:
        return None

    lines = ["WEBVTT", ""]
    for index, (start, end, text_value) in enumerate(cue_lines, start=1):
        lines.append(str(index))
        lines.append(f"{_seconds_to_vtt_timestamp(start)} --> {_seconds_to_vtt_timestamp(end)}")
        lines.append(text_value.strip())
        lines.append("")

    return "\n".join(lines).encode("utf-8")


def _read_asset_bytes(asset_url: str) -> bytes:
    if asset_url.startswith(("http://", "https://")):
        import requests

        response = requests.get(asset_url, timeout=30)
        response.raise_for_status()
        return response.content

    raise RuntimeError("Unsupported asset URL")


def _resolve_supabase_public_asset(value: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    normalized = str(value or "").strip()
    if not normalized:
        return None, None

    try:
        parsed = urlparse(normalized)
    except Exception:
        return None, None

    marker_index = parsed.path.find(SUPABASE_PUBLIC_OBJECT_MARKER)
    if marker_index < 0:
        return None, None

    suffix = parsed.path[marker_index + len(SUPABASE_PUBLIC_OBJECT_MARKER):]
    if "/" not in suffix:
        return None, None

    bucket_name, object_path = suffix.split("/", 1)
    bucket_name = unquote(bucket_name).strip()
    object_path = unquote(object_path).strip().lstrip("/")
    if not bucket_name or not object_path:
        return None, None

    return bucket_name, object_path


def _get_accessible_microlearning_module(
    db: Session,
    *,
    current_user: User,
    module_id: str,
) -> MicrolearningModule:
    module = (
        db.query(MicrolearningModule)
        .filter(
            MicrolearningModule.id == module_id,
            MicrolearningModule.is_active == True,
        )
        .first()
    )
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    if current_user.role == UserRole.TRAINEE:
        assignments = db.query(MicrolearningAssignment).filter(
            and_(
                MicrolearningAssignment.module_id == module_id,
                MicrolearningAssignment.trainee_id == current_user.id,
            )
        ).all()
        if not any(assignment_is_current(assignment) for assignment in assignments):
            raise HTTPException(status_code=403, detail="Not assigned to this module")
        return module

    if current_user.role == UserRole.TRAINER and module.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have access to this module")

    return module


def _resolve_module_asset_metadata(module: MicrolearningModule) -> dict[str, Any]:
    content_data = dict(module.content_data or {})
    asset_record_id = str(content_data.get("asset_record_id") or "").strip() or None
    asset_url = ""
    for candidate in (
        module.content_url,
        module.audio_url,
        content_data.get("asset_url"),
        content_data.get("audio_url"),
    ):
        normalized = str(candidate or "").strip()
        if normalized:
            asset_url = normalized
            break
    if not asset_url and asset_record_id:
        asset_url = f"/api/microlearning/assets/{asset_record_id}/stream"

    storage_path = (
        str(content_data.get("asset_storage_path") or "").strip()
        or str(content_data.get("audio_storage_path") or "").strip()
    )
    bucket_name = (
        str(content_data.get("asset_bucket") or "").strip()
        or str(content_data.get("audio_bucket") or "").strip()
    )

    inferred_bucket, inferred_path = _resolve_supabase_public_asset(asset_url) if asset_url else (None, None)
    if inferred_path and (
        not storage_path
        or storage_path != inferred_path
        or not storage_path.startswith("microlearning/")
    ):
        storage_path = inferred_path
    if inferred_bucket and (
        not bucket_name
        or (storage_path == inferred_path and bucket_name != inferred_bucket)
    ):
        bucket_name = inferred_bucket

    if storage_path and not bucket_name:
        bucket_name = get_supabase_client().microlearning_bucket_name

    content_type = (
        str(content_data.get("asset_content_type") or "").strip()
        or str(content_data.get("audio_content_type") or "").strip()
        or None
    )
    signed_url_required = bool(storage_path) and bool(content_data.get("signed_url_required", True))

    return {
        "module_id": module.id,
        "module_type": getattr(module, "type", None),
        "asset_url": asset_url or None,
        "asset_record_id": asset_record_id,
        "storage_path": storage_path or None,
        "bucket_name": bucket_name or None,
        "content_type": content_type,
        "signed_url_required": signed_url_required,
    }


def _resolve_audio_media_type(
    module: MicrolearningModule,
    *,
    use_tts: bool,
    asset_url: Optional[str],
) -> str:
    if use_tts:
        return "audio/wav"

    content_data = dict(module.content_data or {})
    configured_media_type = str(content_data.get("audio_content_type") or "").strip()
    if configured_media_type:
        return configured_media_type

    guessed_media_type, _ = mimetypes.guess_type((asset_url or "").split("?", 1)[0])
    if guessed_media_type:
        return guessed_media_type

    return "audio/mpeg"


def _resolve_audio_filename(
    module_id: str,
    *,
    use_tts: bool,
    asset_url: Optional[str],
    media_type: str,
) -> str:
    asset_path = (asset_url or "").split("?", 1)[0]
    extension = Path(asset_path).suffix
    if not extension:
        extension = mimetypes.guess_extension(media_type or "") or (".wav" if use_tts else ".mp3")

    suffix = "tts" if use_tts else "audio"
    return f"{module_id}_{suffix}{extension}"


def _sync_audio_content_data(
    module: MicrolearningModule,
    *,
    audio_url: Optional[str] = None,
    transcript: Optional[str] = None,
    captions_url: Optional[str] = None,
    tts_url: Optional[str] = None,
    duration_seconds: Optional[float] = None,
    language_code: Optional[str] = None,
    original_filename: Optional[str] = None,
    content_type: Optional[str] = None,
    transcript_provider: Optional[str] = None,
    transcript_confidence: Optional[float] = None,
) -> None:
    content_data = dict(module.content_data or {})

    resolved_audio_url = audio_url or module.audio_url or module.content_url
    if resolved_audio_url:
        module.content_url = resolved_audio_url
        content_data["asset_url"] = resolved_audio_url
        content_data["audio_url"] = resolved_audio_url

    resolved_transcript = transcript if transcript is not None else module.audio_transcript
    if resolved_transcript:
        content_data["content"] = resolved_transcript
        content_data["transcript"] = resolved_transcript
        content_data["transcript_text"] = resolved_transcript
        content_data["captions_text"] = resolved_transcript

    resolved_tts_url = tts_url or module.audio_tts_url
    if resolved_tts_url:
        content_data["tts_url"] = resolved_tts_url

    if captions_url:
        content_data["captions_url"] = captions_url

    resolved_duration = (
        int(round(duration_seconds))
        if duration_seconds is not None
        else module.audio_duration_seconds
    )
    if resolved_duration:
        content_data["audio_duration_seconds"] = resolved_duration

    resolved_language = language_code or module.audio_language
    if resolved_language:
        content_data["audio_language"] = resolved_language

    if original_filename:
        content_data["audio_original_filename"] = original_filename
    if content_type:
        content_data["audio_content_type"] = content_type
    if transcript_provider:
        content_data["transcript_provider"] = transcript_provider
    if transcript_confidence is not None:
        content_data["transcript_confidence"] = round(float(transcript_confidence), 4)

    module.content_data = content_data


def _resolve_module_audio_asset_url(module: MicrolearningModule) -> Optional[str]:
    content_data = dict(module.content_data or {})
    for candidate in (
        module.audio_url,
        module.content_url,
        content_data.get("audio_url"),
        content_data.get("asset_url"),
    ):
        normalized = str(candidate or "").strip()
        if normalized:
            return normalized
    return None


def _resolve_module_transcript_text(module: MicrolearningModule) -> str:
    content_data = dict(module.content_data or {})
    for candidate in (
        module.audio_transcript,
        content_data.get("transcript_text"),
        content_data.get("captions_text"),
        content_data.get("transcript"),
        content_data.get("content"),
    ):
        normalized = str(candidate or "").strip()
        if normalized:
            return normalized
    return ""


def _require_supabase_storage() -> Any:
    supabase = get_supabase_client()
    if not supabase.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase storage is required for microlearning audio assets.",
        )
    return supabase


class ModuleCreateRequest(BaseModel):
    title: str
    description: Optional[str]
    category: str  # Video, Quiz, Flashcard, Infographic, Case Study, Audio
    duration_minutes: int
    passing_score: int
    skill_focus: Optional[str]
    content_url: Optional[str]
    content_data: Optional[dict] = {}
    exercises: Optional[list] = []
    difficulty: Optional[str] = "basic"
    topic_category_id: Optional[str] = None
    assessment_method_id: Optional[str] = None
    # Audio-specific fields
    audio_language: Optional[str] = "en-US"


class ModuleUpdateRequest(BaseModel):
    title: Optional[str]
    description: Optional[str]
    category: Optional[str]  # Video, Quiz, Flashcard, Infographic, Case Study, Audio
    duration_minutes: Optional[int]
    passing_score: Optional[int]
    skill_focus: Optional[str]
    content_url: Optional[str]
    content_data: Optional[dict]
    exercises: Optional[list]
    difficulty: Optional[str]
    is_active: Optional[bool]
    topic_category_id: Optional[str]
    assessment_method_id: Optional[str]
    # Audio-specific fields
    audio_url: Optional[str] = None
    audio_transcript: Optional[str] = None
    audio_tts_url: Optional[str] = None
    audio_duration_seconds: Optional[int] = None
    audio_language: Optional[str] = None


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
        category=payload.category,  # This will be Video, Quiz, etc.
        type=payload.category,  # Keep type for backward compatibility
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
        topic_category_id=payload.topic_category_id,
        assessment_method_id=payload.assessment_method_id,
        audio_language=payload.audio_language or "en-US",
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
            "content_url": m.content_url or m.audio_url,
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
        "content_url": module.content_url or module.audio_url,
        "content_data": module.content_data,
        "exercises": module.exercises,
        "difficulty": module.difficulty,
        "is_active": module.is_active,
        # Audio-specific fields
        "audio_url": module.audio_url,
        "audio_transcript": module.audio_transcript,
        "audio_tts_url": module.audio_tts_url,
        "audio_duration_seconds": module.audio_duration_seconds,
        "audio_language": module.audio_language,
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
    if payload.category is not None:
        module.category = payload.category
        module.type = payload.category
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
    if payload.topic_category_id is not None:
        module.topic_category_id = payload.topic_category_id
    if payload.assessment_method_id is not None:
        module.assessment_method_id = payload.assessment_method_id
    
    # Audio-specific fields
    if payload.audio_url is not None:
        module.audio_url = payload.audio_url
    if payload.audio_transcript is not None:
        module.audio_transcript = payload.audio_transcript
    if payload.audio_tts_url is not None:
        module.audio_tts_url = payload.audio_tts_url
    if payload.audio_duration_seconds is not None:
        module.audio_duration_seconds = payload.audio_duration_seconds
    if payload.audio_language is not None:
        module.audio_language = payload.audio_language

    _sync_audio_content_data(
        module,
        audio_url=module.audio_url,
        transcript=module.audio_transcript,
        tts_url=module.audio_tts_url,
        duration_seconds=module.audio_duration_seconds,
        language_code=module.audio_language,
    )

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


# ==================== Audio Upload & Processing Endpoints ====================

@router.post("/modules/{module_id}/audio")
async def upload_module_audio(
    module_id: str,
    file: Optional[UploadFile] = File(None),
    audio_file: Optional[UploadFile] = File(None),
    generate_transcript: bool = True,
    generate_tts: bool = True,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Upload audio file for a microlearning module.
    
    - Saves the audio file to Supabase storage
    - Optionally generates transcript (speech-to-text)
    - Optionally generates TTS version for accessibility
    
    Returns audio URLs and transcript if generated.
    """
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    uploaded_file = file or audio_file
    if not uploaded_file:
        raise HTTPException(status_code=400, detail="Audio file is required")

    # Verify module exists
    module = db.query(MicrolearningModule).filter(MicrolearningModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    # Read audio file
    audio_bytes = await uploaded_file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # Determine content type
    content_type = uploaded_file.content_type or "audio/mpeg"
    filename = uploaded_file.filename or "audio.mp3"
    storage_filename = (
        f"{module_id}/{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}_{_sanitize_asset_name(filename)}"
    )

    supabase_client = _require_supabase_storage()
    audio_url = supabase_client.upload_microlearning_audio(
        file_data=audio_bytes,
        module_id=module_id,
        trainer_id=current_user.id,
        filename=storage_filename,
        content_type=content_type,
    )
    if not audio_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase storage could not save the microlearning audio asset.",
        )

    # Update module with audio URL
    module.audio_url = audio_url
    estimated_duration = max(len(audio_bytes) // 2000, 1)
    module.audio_duration_seconds = estimated_duration
    _sync_audio_content_data(
        module,
        audio_url=audio_url,
        duration_seconds=estimated_duration,
        language_code=module.audio_language or "en-US",
        original_filename=filename,
        content_type=content_type,
    )

    result = {
        "audio_url": audio_url,
        "filename": filename,
        "content_type": content_type,
        "duration_seconds": estimated_duration,
    }

    # Generate transcript if requested
    if generate_transcript and speech_to_text_service.is_available():
        try:
            transcript_result = speech_to_text_service.transcribe(
                audio_bytes=audio_bytes,
                language_code=module.audio_language or "en-US",
                mime_type=content_type,
            )
            
            if transcript_result:
                module.audio_transcript = transcript_result.text
                if transcript_result.duration_seconds:
                    module.audio_duration_seconds = max(
                        int(round(transcript_result.duration_seconds)),
                        module.audio_duration_seconds or 0,
                    )
                captions_bytes = _build_webvtt_captions(
                    transcript=transcript_result.text,
                    words=transcript_result.words,
                    duration_seconds=transcript_result.duration_seconds or module.audio_duration_seconds,
                )
                captions_url = None
                if captions_bytes:
                    captions_filename = f"{Path(filename).stem}.vtt"
                    captions_url = supabase_client.upload_microlearning_binary(
                        module_id=module_id,
                        trainer_id=current_user.id,
                        filename=captions_filename,
                        file_data=captions_bytes,
                        content_type="text/vtt",
                        folder="captions",
                    )
                    if not captions_url:
                        logger.warning(
                            "Supabase storage could not save captions for microlearning module %s",
                            module_id,
                        )
                _sync_audio_content_data(
                    module,
                    transcript=transcript_result.text,
                    captions_url=captions_url,
                    duration_seconds=module.audio_duration_seconds,
                    language_code=module.audio_language or "en-US",
                    original_filename=filename,
                    content_type=content_type,
                    transcript_provider=transcript_result.provider,
                    transcript_confidence=transcript_result.confidence,
                )
                result["transcript"] = transcript_result.text
                result["transcript_provider"] = transcript_result.provider
                result["transcript_confidence"] = transcript_result.confidence
                if captions_url:
                    result["captions_url"] = captions_url
                logger.info(f"✓ Audio transcript generated: {transcript_result.provider}")
        except Exception as e:
            logger.warning(f"Transcript generation failed: {e}")

    # Generate TTS version for accessibility if requested
    if generate_tts and module.audio_transcript and text_to_speech_service.is_available():
        try:
            tts_result = text_to_speech_service.synthesize(
                text=module.audio_transcript,
                language_code=module.audio_language or "en-US",
            )
            
            if tts_result:
                # Upload TTS audio to Supabase
                tts_url = supabase_client.upload_microlearning_tts(
                    audio_data=tts_result.audio_bytes,
                    module_id=module_id,
                )
                if tts_url:
                    module.audio_tts_url = tts_url
                    _sync_audio_content_data(
                        module,
                        tts_url=tts_url,
                        duration_seconds=module.audio_duration_seconds,
                        language_code=module.audio_language or "en-US",
                    )
                    result["tts_url"] = tts_url
                    result["tts_provider"] = tts_result.provider
                    logger.info(f"✓ TTS audio generated: {tts_result.provider}")
                else:
                    logger.warning(
                        "Supabase storage could not save generated TTS for microlearning module %s",
                        module_id,
                    )
        except Exception as e:
            logger.warning(f"TTS generation failed: {e}")

    db.commit()
    db.refresh(module)

    return {
        "module_id": module_id,
        "message": "Audio uploaded successfully",
        **result,
    }


@router.post("/modules/{module_id}/transcribe")
async def transcribe_audio(
    module_id: str,
    force_regenerate: bool = False,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Generate transcript for an existing audio file.
    Uses speech-to-text service (Google, Whisper, or Vosk).
    """
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    module = db.query(MicrolearningModule).filter(MicrolearningModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    if not module.audio_url:
        raise HTTPException(status_code=400, detail="No audio file associated with this module")

    # Check if transcript already exists
    if module.audio_transcript and not force_regenerate:
        return {
            "module_id": module_id,
            "transcript": module.audio_transcript,
            "message": "Transcript already exists. Use force_regenerate=true to regenerate.",
        }

    # Check if transcription service is available
    if not speech_to_text_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Speech-to-text service not available. Configure Google Speech API key or OpenAI API key.",
        )

    providers = speech_to_text_service.get_available_providers()

    try:
        audio_bytes = _read_asset_bytes(module.audio_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch audio file: {e}")

    # Transcribe
    transcript_result = speech_to_text_service.transcribe(
        audio_bytes=audio_bytes,
        language_code=module.audio_language or "en-US",
    )

    if not transcript_result:
        raise HTTPException(status_code=500, detail="Transcription failed")

    module.audio_transcript = transcript_result.text
    if transcript_result.duration_seconds:
        module.audio_duration_seconds = max(
            int(round(transcript_result.duration_seconds)),
            module.audio_duration_seconds or 0,
        )

    captions_bytes = _build_webvtt_captions(
        transcript=transcript_result.text,
        words=transcript_result.words,
        duration_seconds=transcript_result.duration_seconds or module.audio_duration_seconds,
    )
    captions_url = None
    if captions_bytes:
        supabase_client = _require_supabase_storage()
        captions_url = supabase_client.upload_microlearning_binary(
            module_id=module_id,
            trainer_id=current_user.id,
            filename=f"{module_id}.vtt",
            file_data=captions_bytes,
            content_type="text/vtt",
            folder="captions",
        )
        if not captions_url:
            logger.warning(
                "Supabase storage could not save generated captions for microlearning module %s",
                module_id,
            )

    _sync_audio_content_data(
        module,
        transcript=transcript_result.text,
        captions_url=captions_url,
        duration_seconds=module.audio_duration_seconds,
        language_code=module.audio_language or "en-US",
        transcript_provider=transcript_result.provider,
        transcript_confidence=transcript_result.confidence,
    )
    db.commit()

    return {
        "module_id": module_id,
        "transcript": transcript_result.text,
        "provider": transcript_result.provider,
        "confidence": transcript_result.confidence,
        "available_providers": providers,
        "captions_url": captions_url,
    }


@router.post("/modules/{module_id}/generate-tts")
async def generate_tts_audio(
    module_id: str,
    force_regenerate: bool = False,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Generate text-to-speech audio for accessibility.
    Uses the transcript to create an audio version.
    """
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    module = db.query(MicrolearningModule).filter(MicrolearningModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    if not module.audio_transcript:
        raise HTTPException(status_code=400, detail="No transcript available. Generate transcript first.")

    # Check if TTS already exists
    if module.audio_tts_url and not force_regenerate:
        return {
            "module_id": module_id,
            "tts_url": module.audio_tts_url,
            "message": "TTS audio already exists. Use force_regenerate=true to regenerate.",
        }

    # Check if TTS service is available
    if not text_to_speech_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Text-to-speech service not available. Configure GEMINI_API_KEY.",
        )

    # Generate TTS
    tts_result = text_to_speech_service.synthesize(
        text=module.audio_transcript,
        language_code=module.audio_language or "en-US",
    )

    if not tts_result:
        raise HTTPException(status_code=500, detail="TTS generation failed")

    supabase_client = _require_supabase_storage()
    tts_url = supabase_client.upload_microlearning_tts(
        audio_data=tts_result.audio_bytes,
        module_id=module_id,
    )
    if not tts_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase storage could not save the generated TTS audio.",
        )

    module.audio_tts_url = tts_url
    _sync_audio_content_data(
        module,
        tts_url=tts_url,
        duration_seconds=module.audio_duration_seconds,
        language_code=module.audio_language or "en-US",
    )
    db.commit()

    return {
        "module_id": module_id,
        "tts_url": tts_url,
        "provider": tts_result.provider,
        "duration_seconds": tts_result.duration_seconds,
    }


@router.get("/assets/{asset_id}/stream")
async def stream_uploaded_microlearning_asset(
    asset_id: str,
    db: Session = Depends(get_db),
):
    """Stream a trainer-uploaded microlearning asset stored in Supabase Postgres."""
    asset = (
        db.query(MicrolearningUploadedAsset)
        .filter(MicrolearningUploadedAsset.id == asset_id)
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Microlearning asset not found")

    return Response(
        content=asset.file_bytes,
        media_type=asset.content_type or "application/octet-stream",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
            "Content-Length": str(int(asset.byte_size or len(asset.file_bytes or b""))),
            "Content-Disposition": f'inline; filename="{_sanitize_asset_name(asset.filename)}"',
        },
    )


@router.get("/modules/{module_id}/asset")
async def get_module_asset(
    module_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Return the stored lesson asset metadata for a module.
    Trainers can access their own modules, admins can access all modules,
    and trainees can access only assigned modules.
    """
    current_user = await auth_utils.get_current_user(authorization, db)
    module = _get_accessible_microlearning_module(
        db,
        current_user=current_user,
        module_id=module_id,
    )
    return _resolve_module_asset_metadata(module)


@router.get("/modules/{module_id}/audio")
async def get_module_audio(
    module_id: str,
    include_tts: bool = True,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Get audio information for a module.
    Returns audio URL, transcript, and TTS URL for playback.
    """
    current_user = await auth_utils.get_current_user(authorization, db)
    module = _get_accessible_microlearning_module(
        db,
        current_user=current_user,
        module_id=module_id,
    )

    resolved_audio_url = _resolve_module_audio_asset_url(module)
    resolved_transcript = _resolve_module_transcript_text(module)
    content_data = dict(module.content_data or {})

    result = {
        "module_id": module_id,
        "title": module.title,
        "audio_url": resolved_audio_url,
        "audio_duration_seconds": module.audio_duration_seconds,
        "audio_language": module.audio_language,
        "transcript": resolved_transcript,
        "captions_url": content_data.get("captions_url"),
        "content_type": content_data.get("audio_content_type"),
    }

    if include_tts:
        result["tts_url"] = module.audio_tts_url

    return result


@router.get("/modules/{module_id}/audio/stream")
async def stream_module_audio(
    module_id: str,
    use_tts: bool = False,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Stream audio file directly to client.
    Set use_tts=true to stream the TTS version instead of original.
    """
    current_user = await auth_utils.get_current_user(authorization, db)

    module = db.query(MicrolearningModule).filter(MicrolearningModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    # Check access
    if current_user.role == UserRole.TRAINEE:
        assignments = db.query(MicrolearningAssignment).filter(
            and_(
                MicrolearningAssignment.module_id == module_id,
                MicrolearningAssignment.trainee_id == current_user.id
            )
        ).all()
        if not any(assignment_is_current(assignment) for assignment in assignments):
            raise HTTPException(status_code=403, detail="Not assigned to this module")

    # Get audio URL
    audio_url = module.audio_tts_url if use_tts else module.audio_url
    
    if not audio_url:
        raise HTTPException(status_code=404, detail="Audio not available")

    try:
        audio_bytes = _read_asset_bytes(audio_url)
        media_type = _resolve_audio_media_type(
            module,
            use_tts=use_tts,
            asset_url=audio_url,
        )
        download_filename = _resolve_audio_filename(
            module_id,
            use_tts=use_tts,
            asset_url=audio_url,
            media_type=media_type,
        )
        return Response(
            content=audio_bytes,
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-store",
                "Content-Disposition": f'inline; filename="{download_filename}"',
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stream audio: {e}")


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
            # Audio info for trainees
            "has_audio": bool(module.audio_url if module else False),
            "audio_url": module.audio_url if module else None,
            "audio_tts_url": module.audio_tts_url if module else None,
            "audio_transcript": module.audio_transcript if module else None,
            "audio_duration_seconds": module.audio_duration_seconds if module else None,
        })

    return {"assignments": result, "count": len(result)}


@router.post("/seed-samples")
async def seed_microlearning_samples(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)
    raise HTTPException(
        status_code=410,
        detail="Sample microlearning modules are disabled. Modules must be created by the trainer.",
    )


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
