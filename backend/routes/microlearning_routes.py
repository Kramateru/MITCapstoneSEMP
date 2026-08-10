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
from ..models_reading import ReadingModuleConfig
from ..schemas import SuccessResponse
from ..supabase_client import get_supabase_client
from ..services.audio_transcription import speech_to_text_service
from ..services.audio_tts import text_to_speech_service
from ..services.audit import create_audit_log
from ..services.microlearning import assignment_is_current, filter_current_assignments

router = APIRouter(prefix="/api/microlearning", tags=["microlearning"])
logger = logging.getLogger(__name__)
SUPABASE_PUBLIC_OBJECT_MARKER = "/storage/v1/object/public/"
MICROLEARNING_AUDIO_MAX_BYTES = 50 * 1024 * 1024
MICROLEARNING_AUDIO_EXTENSION_CONTENT_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
}
MICROLEARNING_AUDIO_CONTENT_TYPES = {
    "audio/mpeg": "audio/mpeg",
    "audio/mp3": "audio/mpeg",
    "audio/mpga": "audio/mpeg",
    "audio/wav": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/mp4": "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/ogg": "audio/ogg",
    "audio/webm": "audio/webm",
    "audio/aac": "audio/aac",
    "audio/flac": "audio/flac",
}


def _strip_reading_markup(value: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", value or "", flags=re.IGNORECASE)
    text = re.sub(r"</p\s*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _reading_passage_stats(value: str) -> dict[str, Any]:
    words = re.findall(r"\b[\w']+\b", value or "")
    sentences = [item.strip() for item in re.split(r"[.!?]+(?:\s|$)", value or "") if item.strip()]
    paragraphs = [item.strip() for item in re.split(r"\n{2,}", value or "") if item.strip()]
    average_words_per_sentence = (len(words) / len(sentences)) if sentences else 0
    if len(words) < 120 or average_words_per_sentence <= 12:
        reading_level = "Basic"
    elif average_words_per_sentence <= 20:
        reading_level = "Intermediate"
    else:
        reading_level = "Advanced"
    return {
        "word_count": len(words),
        "sentence_count": len(sentences),
        "paragraph_count": max(len(paragraphs), 1 if value else 0),
        "reading_level": reading_level,
        "estimated_reading_time_minutes": max(1, int((len(words) + 129) // 130)) if words else 1,
    }


def _reading_config_difficulty(value: Optional[str]) -> str:
    normalized = str(getattr(value, "value", value) or "").strip().lower()
    if normalized in {"basic", "beginner"}:
        return "beginner"
    if normalized == "advanced":
        return "advanced"
    return "intermediate"


def _clamp_score(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = default
    return max(0.0, min(100.0, numeric))


def _default_reading_exercises(content_data: dict[str, Any]) -> list[dict[str, Any]]:
    passage = (
        content_data.get("reading_passage")
        or content_data.get("reading_content")
        or content_data.get("content")
        or ""
    )
    return [{
        "id": "reading-pronunciation",
        "title": "Pronunciation Reading",
        "type": "speech_reading",
        "prompt": "Read the assigned passage aloud.",
        "sample_answer": passage,
        "required_keywords": [],
        "enable_stt": True,
        "point_value": 10,
    }]


def _sync_reading_module_config(db: Session, module: MicrolearningModule) -> None:
    if str(getattr(module, "type", "") or "").strip().lower() != "reading":
        return

    content_data = dict(module.content_data or {})
    reading_config = dict(content_data.get("reading_config") or {})
    ai_configuration = dict(content_data.get("ai_configuration") or reading_config.get("ai_configuration") or {})
    rich_content = str(
        content_data.get("reading_rich_content")
        or content_data.get("reading_markup")
        or content_data.get("reading_passage")
        or content_data.get("reading_content")
        or content_data.get("content")
        or ""
    )
    reading_content = _strip_reading_markup(rich_content)
    if not reading_content:
        return

    stats = _reading_passage_stats(reading_content)
    content_data.update({
        "reading_title": content_data.get("reading_title") or module.title,
        "reading_content": reading_content,
        "reading_passage": reading_content,
        "reading_rich_content": rich_content.strip() or reading_content,
        "word_count": stats["word_count"],
        "sentence_count": stats["sentence_count"],
        "paragraph_count": stats["paragraph_count"],
        "reading_level": stats["reading_level"],
        "estimated_reading_time_minutes": int(
            content_data.get("estimated_reading_time_minutes")
            or module.duration_minutes
            or stats["estimated_reading_time_minutes"]
        ),
        "language": content_data.get("language") or module.audio_language or "en-US",
        "reading_config": {
            "max_attempts": max(0, min(10, int(reading_config.get("max_attempts", content_data.get("max_attempts", 3)) or 0))),
            "time_limit_seconds": reading_config.get("time_limit_seconds"),
            "allow_replay": reading_config.get("allow_replay", True) is not False,
            "allow_pause": reading_config.get("allow_pause", True) is not False,
            "auto_submit": bool(reading_config.get("auto_submit", False)),
            "manual_review_required": bool(reading_config.get("manual_review_required", False)),
            "minimum_pronunciation_score": _clamp_score(reading_config.get("minimum_pronunciation_score")),
            "minimum_accuracy_score": _clamp_score(reading_config.get("minimum_accuracy_score")),
            "minimum_completeness_score": _clamp_score(reading_config.get("minimum_completeness_score")),
            "minimum_fluency_score": _clamp_score(reading_config.get("minimum_fluency_score")),
        },
        "ai_configuration": {
            "voice_assessment_enabled": ai_configuration.get("voice_assessment_enabled", True) is not False,
            "pronunciation": ai_configuration.get("pronunciation", True) is not False,
            "fluency": ai_configuration.get("fluency", True) is not False,
            "accuracy": ai_configuration.get("accuracy", True) is not False,
            "completeness": ai_configuration.get("completeness", True) is not False,
            "confidence": ai_configuration.get("confidence", True) is not False,
            "word_analysis": ai_configuration.get("word_analysis", True) is not False,
            "mispronounced_words": ai_configuration.get("mispronounced_words", True) is not False,
            "sound_analysis": ai_configuration.get("sound_analysis", True) is not False,
            "suggestions": ai_configuration.get("suggestions", True) is not False,
        },
        "enable_stt_reading": True,
    })
    module.content_data = content_data

    if not module.exercises:
        module.exercises = _default_reading_exercises(content_data)
    else:
        normalized_exercises = []
        for exercise in module.exercises or []:
            normalized_exercise = dict(exercise or {})
            normalized_exercise["type"] = "speech_reading"
            normalized_exercise["prompt"] = "Read the assigned passage aloud."
            normalized_exercise["required_keywords"] = []
            normalized_exercise["enable_stt"] = True
            normalized_exercises.append(normalized_exercise)
        module.exercises = normalized_exercises

    config = db.query(ReadingModuleConfig).filter_by(module_id=module.id).first()
    if not config:
        config = ReadingModuleConfig(module_id=module.id, reading_content=reading_content, word_count=stats["word_count"])
        db.add(config)

    normalized_config = content_data["reading_config"]
    config.reading_title = content_data.get("reading_title") or module.title
    config.reading_category = content_data.get("reading_category") or "BPO Communication"
    config.reading_content = reading_content
    config.word_count = stats["word_count"]
    config.sentence_count = stats["sentence_count"]
    config.paragraph_count = stats["paragraph_count"]
    config.reading_level = stats["reading_level"]
    config.estimated_reading_time_minutes = content_data.get("estimated_reading_time_minutes")
    config.language = content_data.get("language") or "en-US"
    config.description = module.description
    config.instructions = content_data.get("instructions") or "Read the passage aloud clearly and naturally."
    config.max_attempts = normalized_config["max_attempts"]
    config.time_limit_seconds = normalized_config["time_limit_seconds"]
    config.allow_replay = 1 if normalized_config["allow_replay"] else 0
    config.allow_pause = 1 if normalized_config["allow_pause"] else 0
    config.auto_submit = 1 if normalized_config["auto_submit"] else 0
    config.manual_review_required = 1 if normalized_config["manual_review_required"] else 0
    config.minimum_pronunciation_score = normalized_config["minimum_pronunciation_score"]
    config.minimum_accuracy_score = normalized_config["minimum_accuracy_score"]
    config.minimum_completeness_score = normalized_config["minimum_completeness_score"]
    config.minimum_fluency_score = normalized_config["minimum_fluency_score"]
    config.ai_configuration = content_data["ai_configuration"]
    config.difficulty = _reading_config_difficulty(getattr(module, "difficulty", None))


def _sanitize_asset_name(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", (filename or "").strip())
    return cleaned.strip("-") or "asset.bin"


def _normalize_microlearning_audio_content_type(content_type: Optional[str]) -> Optional[str]:
    normalized = str(content_type or "").strip().lower()
    if not normalized:
        return None

    # Ignore MIME parameters like charset or codecs
    normalized = normalized.split(";", 1)[0].strip()
    return MICROLEARNING_AUDIO_CONTENT_TYPES.get(normalized)


def _validate_microlearning_audio_upload(uploaded_file: UploadFile, audio_bytes: bytes) -> dict[str, Any]:
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(audio_bytes) > MICROLEARNING_AUDIO_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Microlearning audio uploads must be 50 MB or smaller.",
        )

    filename = uploaded_file.filename or "audio.mp3"
    extension = Path(filename).suffix.lower()
    content_type = _normalize_microlearning_audio_content_type(uploaded_file.content_type)
    extension_content_type = MICROLEARNING_AUDIO_EXTENSION_CONTENT_TYPES.get(extension)
    if not extension_content_type and not content_type:
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio format. Upload MP3, WAV, M4A, OGG, WEBM, AAC, or FLAC audio.",
        )
    if content_type and extension_content_type and content_type != extension_content_type:
        raise HTTPException(
            status_code=400,
            detail="Uploaded audio file type does not match its filename extension.",
        )

    return {
        "filename": filename,
        "content_type": content_type or extension_content_type or "audio/mpeg",
        "extension": extension or mimetypes.guess_extension(content_type or "") or ".mp3",
        "file_size": len(audio_bytes),
    }


def _log_microlearning_audio_action(
    db: Session,
    *,
    user: User,
    module_id: str,
    action_type: str,
    file_name: Optional[str] = None,
    status_value: str = "success",
    error_detail: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    create_audit_log(
        db,
        user=user,
        action_type=action_type,
        module_name="Microlearning",
        entity_type="microlearning_audio",
        entity_id=module_id,
        description=f"Microlearning audio {action_type.replace('_', ' ')} {status_value}.",
        status=status_value,
        severity="warning" if status_value == "failed" else "info",
        trainer_id=user.id if user.role in [UserRole.TRAINER, UserRole.ADMIN] else None,
        trainee_id=user.id if user.role == UserRole.TRAINEE else None,
        metadata={
            "module_id": module_id,
            "file_name": file_name,
            "error_detail": error_detail,
            **(metadata or {}),
        },
    )


def _upsert_microlearning_audio_content_metadata(
    *,
    module: MicrolearningModule,
    trainer_id: str,
    audio_url: str,
    storage_path: str,
    bucket_name: str,
    mime_type: str,
    original_filename: str,
) -> None:
    supabase_client = get_supabase_client()
    if not supabase_client.is_available or supabase_client.client is None:
        logger.warning("Skipping audio_content upsert because Supabase client is unavailable.")
        return

    content_data = dict(module.content_data or {})
    transcript_text = _resolve_module_transcript_text(module)
    payload = {
        "module_id": module.id,
        "title": module.title or "Microlearning audio",
        "trainer_id": trainer_id,
        "url": audio_url,
        "storage_path": storage_path,
        "mime_type": mime_type,
        "transcript": transcript_text or None,
        "transcript_text": transcript_text or None,
        "summary_text": (
            content_data.get("summary_text")
            or content_data.get("audio_summary")
            or content_data.get("summary")
        ),
        "duration_seconds": module.audio_duration_seconds,
        "bucket_name": bucket_name,
        "original_filename": original_filename,
        "caption_data": content_data.get("caption_data"),
    }
    try:
        (
            supabase_client.client
            .table("audio_content")
            .upsert(payload, on_conflict="module_id")
            .execute()
        )
    except Exception:
        logger.warning("Unable to upsert audio_content metadata for module %s", module.id, exc_info=True)


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
    content_data = dict(module.content_data or {})
    if use_tts:
        configured_tts_media_type = str(content_data.get("tts_content_type") or "").strip()
        if configured_tts_media_type:
            return configured_tts_media_type

        guessed_tts_media_type, _ = mimetypes.guess_type((asset_url or "").split("?", 1)[0])
        if guessed_tts_media_type:
            return guessed_tts_media_type

        return "audio/wav"

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
    tts_content_type: Optional[str] = None,
    tts_format: Optional[str] = None,
    duration_seconds: Optional[float] = None,
    language_code: Optional[str] = None,
    original_filename: Optional[str] = None,
    content_type: Optional[str] = None,
    storage_path: Optional[str] = None,
    bucket_name: Optional[str] = None,
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
    if tts_content_type:
        content_data["tts_content_type"] = tts_content_type
    if tts_format:
        content_data["tts_format"] = tts_format

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
    if storage_path:
        content_data["audio_storage_path"] = storage_path
        content_data["signed_url_required"] = True
    if bucket_name:
        content_data["audio_bucket"] = bucket_name
    if transcript_provider:
        content_data["transcript_provider"] = transcript_provider
    if transcript_confidence is not None:
        content_data["transcript_confidence"] = round(float(transcript_confidence), 4)

    module.content_data = content_data


def _tts_content_type(audio_format: Optional[str]) -> str:
    return "audio/mpeg" if str(audio_format or "").strip().lower().lstrip(".") == "mp3" else "audio/wav"


def _storage_method_for_url(url: Optional[str], supabase_available: bool) -> str:
    normalized = str(url or "").strip()
    parsed_path = urlparse(normalized).path if normalized else ""
    if parsed_path.startswith("/media/") or "/media/" in parsed_path:
        return "local"
    return "supabase" if supabase_available else "local"


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


def _resolve_module_audio_storage_metadata(module: MicrolearningModule) -> dict[str, Any]:
    content_data = dict(module.content_data or {})
    audio_url = _resolve_module_audio_asset_url(module) or ""
    storage_path = str(content_data.get("audio_storage_path") or "").strip()
    bucket_name = str(content_data.get("audio_bucket") or "").strip()

    inferred_bucket, inferred_path = _resolve_supabase_public_asset(audio_url) if audio_url else (None, None)
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

    return {
        "audio_url": audio_url or None,
        "storage_path": storage_path or None,
        "bucket_name": bucket_name or None,
        "signed_url_required": bool(storage_path) and bool(content_data.get("signed_url_required", True)),
    }


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
    module_type: Optional[str] = None
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
    module_type: Optional[str] = None
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
    resolved_module_type = (payload.module_type or payload.category or "video").strip().lower()

    module = MicrolearningModule(
        id=str(uuid4()),
        title=payload.title,
        description=payload.description,
        category=payload.category,  # This will be Video, Quiz, etc.
        type=resolved_module_type,  # Keep type for backward compatibility
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
    db.flush()
    _sync_reading_module_config(db, module)
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
    if payload.module_type is not None:
        module.type = payload.module_type.strip().lower()
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
    _sync_reading_module_config(db, module)

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

    audio_bytes = await uploaded_file.read()
    upload_meta = _validate_microlearning_audio_upload(uploaded_file, audio_bytes)
    content_type = str(upload_meta["content_type"])
    filename = str(upload_meta["filename"])
    previous_audio_url = _resolve_module_audio_asset_url(module)
    previous_storage = _resolve_module_audio_storage_metadata(module)
    storage_filename = (
        f"{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}_{_sanitize_asset_name(filename)}"
    )
    lesson_id = str((module.content_data or {}).get("lesson_id") or module_id).strip() or module_id
    storage_path = f"microlearning/audio/{module_id}/{lesson_id}/{storage_filename}"
    bucket_name = None

    supabase_client = get_supabase_client()
    bucket_name = supabase_client.microlearning_bucket_name
    local_audio_path = supabase_client.save_local_media_backup(
        relative_path=storage_path,
        file_data=audio_bytes,
    )
    audio_url = supabase_client.upload_microlearning_audio(
        file_data=audio_bytes,
        module_id=module_id,
        trainer_id=current_user.id,
        filename=storage_filename,
        content_type=content_type,
        lesson_id=lesson_id,
        allow_local_fallback=True,
    )
    if not audio_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Microlearning audio storage could not save the audio asset to Supabase or local media fallback.",
        )

    resolved_bucket, resolved_path = _resolve_supabase_public_asset(audio_url)
    if resolved_bucket and resolved_path:
        bucket_name = resolved_bucket
        storage_path = resolved_path
    else:
        bucket_name = None
        storage_path = None

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
        storage_path=storage_path,
        bucket_name=bucket_name,
    )

    content_data = dict(module.content_data or {})
    content_data["lesson_id"] = lesson_id
    content_data["audio_file_size"] = int(upload_meta["file_size"])
    content_data["audio_uploaded_by"] = current_user.id
    content_data["audio_uploaded_at"] = datetime.utcnow().isoformat()
    if local_audio_path:
        content_data["audio_local_path"] = local_audio_path

    if not storage_path:
        content_data.pop("audio_storage_path", None)
        content_data.pop("audio_bucket", None)
        content_data["signed_url_required"] = False

    module.content_data = content_data
    signed_url = supabase_client.create_signed_storage_url(
        bucket_name=bucket_name,
        path=storage_path,
    ) if bucket_name and storage_path else audio_url or None

    result = {
        "audio_url": audio_url,
        "signed_url": signed_url,
        "storage_path": storage_path,
        "bucket_name": bucket_name,
        "filename": filename,
        "original_filename": filename,
        "content_type": content_type,
        "file_size": int(upload_meta["file_size"]),
        "lesson_id": lesson_id,
        "duration_seconds": estimated_duration,
        "local_audio_path": local_audio_path,
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
                        allow_local_fallback=False,
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
            
            if tts_result and tts_result.audio_bytes:
                tts_content_type = _tts_content_type(tts_result.format)
                tts_url = supabase_client.upload_microlearning_tts(
                    audio_data=tts_result.audio_bytes,
                    module_id=module_id,
                    audio_format=tts_result.format,
                    content_type=tts_content_type,
                )

                if tts_url:
                    module.audio_tts_url = tts_url
                    _sync_audio_content_data(
                        module,
                        tts_url=tts_url,
                        tts_content_type=tts_content_type,
                        tts_format=tts_result.format,
                        duration_seconds=module.audio_duration_seconds,
                        language_code=module.audio_language or "en-US",
                    )
                    result["tts_url"] = tts_url
                    result["tts_provider"] = tts_result.provider
                    result["tts_content_type"] = tts_content_type
                    result["tts_format"] = tts_result.format
                    logger.info(f"✓ TTS audio generated: {tts_result.provider}")
                else:
                    logger.warning(
                        "Could not save TTS for microlearning module %s. Supabase upload failed.",
                        module_id,
                    )
            elif tts_result and tts_result.error:
                logger.warning(f"TTS generation failed for module {module_id}: {tts_result.error}")
        except Exception as e:
            logger.warning(f"TTS generation failed for module {module_id}: {e}", exc_info=True)

    _upsert_microlearning_audio_content_metadata(
        module=module,
        trainer_id=current_user.id,
        audio_url=audio_url,
        storage_path=storage_path,
        bucket_name=bucket_name,
        mime_type=content_type,
        original_filename=filename,
    )

    db.commit()
    db.refresh(module)
    if previous_audio_url and previous_audio_url != audio_url:
        previous_path = previous_storage.get("storage_path")
        previous_bucket = previous_storage.get("bucket_name")
        if previous_path and previous_bucket:
            supabase_client.delete_storage_object(bucket_name=previous_bucket, path=previous_path)
        else:
            supabase_client.delete_by_public_url(previous_audio_url)
    _log_microlearning_audio_action(
        db,
        user=current_user,
        module_id=module_id,
        action_type="upload_audio" if not previous_audio_url else "replace_audio",
        file_name=filename,
        metadata={
            "bucket_name": bucket_name,
            "storage_path": storage_path,
            "file_size": int(upload_meta["file_size"]),
            "content_type": content_type,
            "lesson_id": lesson_id,
            "local_audio_path": local_audio_path,
        },
    )
    db.commit()

    return {
        "module_id": module_id,
        "message": "Audio uploaded successfully",
        **result,
    }


@router.delete("/modules/{module_id}/audio", response_model=SuccessResponse)
async def delete_module_audio(
    module_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    require_trainer(current_user)

    module = db.query(MicrolearningModule).filter(MicrolearningModule.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if current_user.role != UserRole.ADMIN and module.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have access to this module")

    content_data = dict(module.content_data or {})
    original_filename = str(content_data.get("audio_original_filename") or "").strip()
    audio_url = _resolve_module_audio_asset_url(module)
    storage_metadata = _resolve_module_audio_storage_metadata(module)
    supabase_client = get_supabase_client()

    deleted_storage_targets: list[str] = []
    storage_path = storage_metadata.get("storage_path")
    bucket_name = storage_metadata.get("bucket_name")
    if storage_path and bucket_name and supabase_client.delete_storage_object(bucket_name=bucket_name, path=storage_path):
        deleted_storage_targets.append(f"{bucket_name}/{storage_path}")
    elif audio_url and supabase_client.delete_by_public_url(audio_url):
        deleted_storage_targets.append(audio_url)

    for related_url_key in ("tts_url", "captions_url"):
        related_url = str(content_data.get(related_url_key) or "").strip()
        if related_url and supabase_client.delete_by_public_url(related_url):
            deleted_storage_targets.append(related_url)

    module.audio_url = None
    module.audio_tts_url = None
    module.audio_transcript = None
    module.audio_duration_seconds = None
    if module.content_url == audio_url:
        module.content_url = None

    for key in (
        "asset_url",
        "audio_url",
        "audio_content_id",
        "audio_storage_path",
        "audio_bucket",
        "audio_content_type",
        "audio_original_filename",
        "audio_file_size",
        "audio_uploaded_by",
        "audio_uploaded_at",
        "audio_summary",
        "summary",
        "summary_text",
        "tts_url",
        "captions_url",
        "caption_data",
        "content",
        "transcript",
        "transcript_text",
        "captions_text",
        "transcript_provider",
        "transcript_confidence",
        "live_caption_mode",
    ):
        content_data.pop(key, None)
    module.content_data = content_data

    try:
        if supabase_client.is_available and supabase_client.client is not None:
            supabase_client.client.table("audio_content").delete().eq("module_id", module_id).execute()
    except Exception:
        logger.warning("Unable to delete audio_content metadata for module %s", module_id, exc_info=True)

    db.add(module)
    db.commit()
    _log_microlearning_audio_action(
        db,
        user=current_user,
        module_id=module_id,
        action_type="delete_audio",
        file_name=original_filename,
        metadata={
            "deleted_storage_targets": deleted_storage_targets,
            "bucket_name": bucket_name,
            "storage_path": storage_path,
        },
    )
    db.commit()
    return SuccessResponse(message="Microlearning audio deleted.")


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
            allow_local_fallback=False,
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
        return {
            "module_id": module_id,
            "tts_url": None,
            "provider": "browser_fallback",
            "error": "No TTS providers available (Gemini API key or pyttsx3 not configured). Using browser fallback.",
        }

    # Generate TTS
    logger.info(f"Generating TTS for module {module_id}, transcript length: {len(module.audio_transcript)}")
    tts_result = text_to_speech_service.synthesize(
        text=module.audio_transcript,
        language_code=module.audio_language or "en-US",
    )

    if not tts_result or not tts_result.audio_bytes:
        error_msg = tts_result.error if tts_result else "Unknown TTS synthesis error"
        logger.error(f"TTS synthesis failed for module {module_id}: {error_msg}")
        return {
            "module_id": module_id,
            "tts_url": None,
            "provider": tts_result.provider if tts_result else "unknown",
            "error": f"Failed to generate speech: {error_msg}. Please try again or use browser fallback.",
        }

    supabase_client = get_supabase_client()
    tts_content_type = _tts_content_type(tts_result.format)
    tts_url = None
    try:
        tts_url = supabase_client.upload_microlearning_tts(
            audio_data=tts_result.audio_bytes,
            module_id=module_id,
            audio_format=tts_result.format,
            content_type=tts_content_type,
        )
        if tts_url and supabase_client.is_available:
            logger.info(f"TTS saved to Supabase: {tts_url}")
    except Exception as e:
        logger.warning(f"Failed to save TTS audio: {e}")
        tts_url = None

    if not tts_url:
        logger.error(f"Failed to save TTS for module {module_id}")
        return {
            "module_id": module_id,
            "tts_url": None,
            "provider": tts_result.provider,
            "format": tts_result.format,
            "content_type": tts_content_type,
            "error": "Generated speech could not be saved. Check Supabase storage or local media fallback settings.",
        }

    # Update module with TTS URL
    module.audio_tts_url = tts_url
    _sync_audio_content_data(
        module,
        tts_url=tts_url,
        tts_content_type=tts_content_type,
        tts_format=tts_result.format,
        duration_seconds=module.audio_duration_seconds,
        language_code=module.audio_language or "en-US",
    )
    db.commit()
    _log_microlearning_audio_action(
        db,
        user=current_user,
        module_id=module_id,
        action_type="generate_speech" if not force_regenerate else "regenerate_speech",
        file_name=Path(tts_url.split("?", 1)[0]).name,
        metadata={
            "tts_url": tts_url,
            "provider": tts_result.provider,
            "format": tts_result.format,
            "content_type": tts_content_type,
            "duration_seconds": tts_result.duration_seconds,
        },
    )
    db.commit()

    return {
        "module_id": module_id,
        "tts_url": tts_url,
        "provider": tts_result.provider,
        "format": tts_result.format,
        "content_type": tts_content_type,
        "duration_seconds": tts_result.duration_seconds,
        "storage_method": _storage_method_for_url(tts_url, supabase_client.is_available),
        "message": "TTS audio generated and saved successfully",
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
    storage_metadata = _resolve_module_audio_storage_metadata(module)
    supabase_client = get_supabase_client()
    signed_url = (
        supabase_client.create_signed_storage_url(
            bucket_name=storage_metadata["bucket_name"],
            path=storage_metadata["storage_path"],
        )
        if storage_metadata.get("storage_path") and storage_metadata.get("bucket_name")
        else None
    )
    if not signed_url:
        signed_url = resolved_audio_url

    result = {
        "module_id": module_id,
        "title": module.title,
        "audio_url": resolved_audio_url,
        "signed_url": signed_url,
        "storage_path": storage_metadata.get("storage_path"),
        "bucket_name": storage_metadata.get("bucket_name"),
        "signed_url_required": storage_metadata.get("signed_url_required"),
        "audio_duration_seconds": module.audio_duration_seconds,
        "audio_language": module.audio_language,
        "transcript": resolved_transcript,
        "summary_text": (
            content_data.get("summary_text")
            or content_data.get("audio_summary")
            or content_data.get("summary")
        ),
        "captions_url": content_data.get("captions_url"),
        "caption_data": content_data.get("caption_data"),
        "live_caption_mode": content_data.get("live_caption_mode"),
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
    assignments = filter_current_assignments(assignments)
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
