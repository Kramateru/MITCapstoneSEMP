"""
Reading Assessment Routes
API endpoints for creating reading modules, recording assessments, and retrieving results.
"""

import asyncio
import re

from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import Any, Optional
from datetime import datetime
import logging

from ..database import get_db
from ..models import User, MicrolearningModule, MicrolearningAssignment
from ..models_reading import ReadingAttempt, ReadingWordAnalysis, ReadingModuleConfig, ReadingPronunciationIssue
from ..auth_utils import get_current_user
from ..services import audio_transcription
from ..services.reading_assessment import ReadingPronunciationAnalyzer, PronunciationScore
from ..services.certificate_awards import award_certificate
from ..services.microlearning import (
    MICROLEARNING_RESULT_SUMMARY_KEY,
    ensure_assignment_result_summary,
    ensure_module_exercises,
    refresh_assignment_progress,
    serialize_assignment_summary,
)
from ..supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trainee/reading", tags=["reading-assessment"])


def get_transcription_service():
    """Resolve the shared transcription service lazily at runtime.

    This avoids a brittle import-time dependency on a single symbol export.
    The route should keep booting even if the service helper is missing from
    one import path, and it should fall back to the module singleton instance.
    """
    service_factory = getattr(audio_transcription, "get_transcription_service", None)
    if callable(service_factory):
        return service_factory()

    service = getattr(audio_transcription, "speech_to_text_service", None)
    if service is not None:
        return service

    raise RuntimeError("Audio transcription service is unavailable.")


def _role_value(user: User) -> str:
    return getattr(getattr(user, "role", None), "value", str(getattr(user, "role", "")))


def _payload_value(payload: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in payload:
            return payload.get(key)
    return default


def _strip_rich_text(value: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", value or "", flags=re.IGNORECASE)
    text = re.sub(r"</p\s*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _word_count(value: str) -> int:
    return len(re.findall(r"\b[\w']+\b", value or ""))


def _reading_stats(value: str) -> dict[str, Any]:
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


def _reading_config_difficulty(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"basic", "beginner"}:
        return "beginner"
    if normalized == "advanced":
        return "advanced"
    return "intermediate"


def _module_difficulty_value(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"beginner", "basic"}:
        return "basic"
    if normalized == "advanced":
        return "advanced"
    return "intermediate"


def _reading_content_from_module(module: MicrolearningModule, config: Optional[ReadingModuleConfig] = None) -> str:
    if config and config.reading_content:
        return config.reading_content
    content = dict(module.content_data or {})
    return (
        content.get("reading_passage")
        or content.get("reading_content")
        or content.get("content")
        or ""
    )


def _reading_settings_from_module(module: MicrolearningModule, config: Optional[ReadingModuleConfig] = None) -> dict[str, Any]:
    content = dict(module.content_data or {})
    reading_config = dict(content.get("reading_config") or {})
    ai_config = dict(content.get("ai_configuration") or reading_config.get("ai_configuration") or {})
    configured_max_attempts = (config.max_attempts if config else None)
    if configured_max_attempts is None:
        configured_max_attempts = reading_config.get("max_attempts")
    if configured_max_attempts is None:
        configured_max_attempts = 3
    return {
        "reading_title": (config.reading_title if config else None) or content.get("reading_title") or module.title,
        "reading_category": (config.reading_category if config else None) or content.get("reading_category") or module.category,
        "difficulty": (config.difficulty if config else None) or content.get("difficulty") or getattr(module, "difficulty", "intermediate"),
        "language": (config.language if config else None) or content.get("language") or content.get("audio_language") or "en-US",
        "instructions": (config.instructions if config else None) or content.get("instructions") or "Read the assigned passage aloud clearly and naturally.",
        "description": (config.description if config else None) or module.description,
        "max_attempts": int(configured_max_attempts),
        "time_limit_seconds": (config.time_limit_seconds if config else None) or reading_config.get("time_limit_seconds"),
        "allow_replay": bool((config.allow_replay if config else None) if config else reading_config.get("allow_replay", True)),
        "allow_pause": bool((config.allow_pause if config else None) if config else reading_config.get("allow_pause", True)),
        "auto_submit": bool((config.auto_submit if config else None) if config else reading_config.get("auto_submit", False)),
        "manual_review_required": bool(
            (config.manual_review_required if config else None)
            if config
            else reading_config.get("manual_review_required", False)
        ),
        "thresholds": {
            "passing_score": float(getattr(module, "passing_score", 0) or 0),
            "minimum_pronunciation_score": float(
                (config.minimum_pronunciation_score if config else None)
                or reading_config.get("minimum_pronunciation_score")
                or 0
            ),
            "minimum_accuracy_score": float(
                (config.minimum_accuracy_score if config else None)
                or reading_config.get("minimum_accuracy_score")
                or 0
            ),
            "minimum_completeness_score": float(
                (config.minimum_completeness_score if config else None)
                or reading_config.get("minimum_completeness_score")
                or 0
            ),
            "minimum_fluency_score": float(
                (config.minimum_fluency_score if config else None)
                or reading_config.get("minimum_fluency_score")
                or 0
            ),
        },
        "ai_configuration": ai_config or {
            "voice_assessment_enabled": True,
            "pronunciation": True,
            "fluency": True,
            "accuracy": True,
            "completeness": True,
            "confidence": True,
            "word_analysis": True,
            "mispronounced_words": True,
            "sound_analysis": True,
            "suggestions": True,
        },
    }


def _passes_thresholds(score: PronunciationScore, passing_score: float, thresholds: dict[str, Any]) -> bool:
    required_correct_words = int((score.total_words * passing_score + 99) // 100) if score.total_words else 0
    return (
        score.correct_words >= required_correct_words
        and score.pronunciation_accuracy >= float(thresholds.get("minimum_pronunciation_score") or 0)
        and score.word_accuracy >= float(thresholds.get("minimum_accuracy_score") or 0)
        and score.completeness_score >= float(thresholds.get("minimum_completeness_score") or 0)
        and score.fluency_score >= float(thresholds.get("minimum_fluency_score") or 0)
    )


def _required_correct_words(total_words: int, passing_score: float) -> int:
    return int((total_words * passing_score + 99) // 100) if total_words else 0


def _serialize_attempt_summary(attempt: ReadingAttempt) -> dict[str, Any]:
    trainee = getattr(attempt, "trainee", None)
    module = getattr(attempt, "module", None)
    previous_attempt = None
    return {
        "id": attempt.id,
        "module_id": attempt.module_id,
        "module_title": getattr(module, "title", None),
        "trainee_id": attempt.trainee_id,
        "trainee_name": getattr(trainee, "full_name", None),
        "attempt_number": attempt.attempt_number,
        "status": attempt.status,
        "passed": attempt.status == "passed",
        "overall_score": float(attempt.overall_score or 0),
        "pronunciation_score": float(attempt.pronunciation_score or 0),
        "accuracy": float(attempt.accuracy_score or 0),
        "fluency": float(attempt.fluency_score or 0),
        "completeness": float(attempt.completeness_score or 0),
        "confidence": float(attempt.confidence_score or 0),
        "passing_score": float(attempt.passing_score or 0),
        "total_words": int(attempt.total_words or 0),
        "correct_words": int(attempt.correct_words or 0),
        "required_correct_words": _required_correct_words(
            int(attempt.total_words or 0),
            float(attempt.passing_score or 0),
        ),
        "mispronounced_words": int(attempt.mispronounced_words or 0),
        "omitted_words": int(attempt.omitted_words or 0),
        "extra_words": int(attempt.extra_words or 0),
        "repeated_words": int(attempt.repeated_words or 0),
        "words_per_minute": float(attempt.words_per_minute or 0),
        "duration_seconds": float(attempt.audio_duration_seconds or 0),
        "audio_url": attempt.audio_url,
        "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
        "created_at": attempt.created_at.isoformat() if attempt.created_at else None,
        "strengths": attempt.strengths,
        "improvement_areas": attempt.improvement_areas,
        "recommendations": attempt.recommendations,
        "common_issues": attempt.most_common_issues or {},
        "improvement": previous_attempt,
    }


def _average(values: list[float]) -> float:
    clean = [value for value in values if isinstance(value, (int, float))]
    return round(sum(clean) / len(clean), 2) if clean else 0.0


@router.post("/modules")
async def create_reading_module(
    *,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    payload: dict[str, Any] = Body(...),
):
    """
    Create a new Reading microlearning module.
    Only trainers can create modules.
    """
    if _role_value(user) not in {"trainer", "admin"}:
        raise HTTPException(status_code=403, detail="Only trainers can create modules.")

    title = str(_payload_value(payload, "title", "module_title", default="")).strip()
    reading_title = str(_payload_value(payload, "reading_title", "readingTitle", default=title)).strip() or title
    description = str(_payload_value(payload, "description", default="")).strip() or None
    reading_rich_content = str(_payload_value(
        payload,
        "reading_rich_content",
        "readingRichContent",
        "reading_markup",
        "readingMarkup",
        "reading_content",
        "readingContent",
        "reading_passage",
        "readingPassage",
        default="",
    ))
    reading_content = _strip_rich_text(reading_rich_content)
    passing_score = int(_payload_value(payload, "passing_score", "passingScore", default=85))
    instructions = str(_payload_value(payload, "instructions", default="")).strip() or "Read the passage aloud clearly and naturally."
    max_attempts = int(_payload_value(payload, "max_attempts", "maxAttempts", default=3))
    difficulty = str(_payload_value(payload, "difficulty", default="intermediate")).strip().lower() or "intermediate"
    config_difficulty = _reading_config_difficulty(difficulty)
    language = str(_payload_value(payload, "language", default="en-US")).strip() or "en-US"
    reading_category = str(_payload_value(payload, "reading_category", "readingCategory", default="BPO pronunciation")).strip()
    estimated_time_payload = _payload_value(payload, "estimated_reading_time", "estimatedReadingTime", "duration_minutes")
    time_limit_seconds = _payload_value(payload, "time_limit_seconds", "timeLimitSeconds", default=None)

    if not title:
        raise HTTPException(status_code=400, detail="Module title is required.")
    if not reading_content:
        raise HTTPException(status_code=400, detail="Reading passage is required.")
    if passing_score < 1 or passing_score > 100:
        raise HTTPException(status_code=400, detail="Passing score must be between 1 and 100.")
    
    passage_stats = _reading_stats(reading_content)
    word_count = passage_stats["word_count"]
    estimated_time = int(estimated_time_payload or passage_stats["estimated_reading_time_minutes"])
    reading_config = {
        "max_attempts": max(0, min(10, max_attempts)),
        "time_limit_seconds": int(time_limit_seconds) if time_limit_seconds else None,
        "allow_replay": bool(_payload_value(payload, "allow_replay", "allowReplay", default=True)),
        "allow_pause": bool(_payload_value(payload, "allow_pause", "allowPause", default=True)),
        "auto_submit": bool(_payload_value(payload, "auto_submit", "autoSubmit", default=False)),
        "manual_review_required": bool(_payload_value(payload, "manual_review_required", "manualReviewRequired", default=False)),
        "minimum_pronunciation_score": float(_payload_value(payload, "minimum_pronunciation_score", "minimumPronunciationScore", default=0) or 0),
        "minimum_accuracy_score": float(_payload_value(payload, "minimum_accuracy", "minimumAccuracy", "minimum_accuracy_score", default=0) or 0),
        "minimum_completeness_score": float(_payload_value(payload, "minimum_completeness", "minimumCompleteness", "minimum_completeness_score", default=0) or 0),
        "minimum_fluency_score": float(_payload_value(payload, "minimum_fluency", "minimumFluency", "minimum_fluency_score", default=0) or 0),
    }
    ai_configuration = {
        "voice_assessment_enabled": True,
        "pronunciation": True,
        "fluency": True,
        "accuracy": True,
        "completeness": True,
        "confidence": True,
        "word_analysis": True,
        "mispronounced_words": True,
        "sound_analysis": True,
        "suggestions": True,
        **dict(_payload_value(payload, "ai_configuration", "aiConfiguration", default={}) or {}),
    }
    
    # Create module
    module = MicrolearningModule(
        title=title,
        description=description or f"Read aloud and receive pronunciation feedback.",
        type="reading",
        category="pronunciation",
        passing_score=passing_score,
        duration_minutes=estimated_time,
        difficulty=_module_difficulty_value(difficulty),
        content_data={
            "reading_title": reading_title,
            "reading_category": reading_category,
            "reading_content": reading_content,
            "reading_passage": reading_content,
            "reading_rich_content": reading_rich_content.strip() or reading_content,
            "word_count": word_count,
            "sentence_count": passage_stats["sentence_count"],
            "paragraph_count": passage_stats["paragraph_count"],
            "reading_level": passage_stats["reading_level"],
            "estimated_reading_time_minutes": estimated_time,
            "instructions": instructions,
            "language": language,
            "reading_config": reading_config,
            "ai_configuration": ai_configuration,
            "max_attempts": reading_config["max_attempts"],
            "difficulty": config_difficulty,
        },
        created_by=user.id,
        exercises=[{
            "id": "reading-pronunciation",
            "title": "Pronunciation Reading",
            "type": "speech_reading",
            "prompt": "Read the assigned passage aloud.",
            "sample_answer": reading_content,
            "required_keywords": [],
            "enable_stt": True,
            "point_value": 10,
        }],
    )
    
    db.add(module)
    db.flush()
    
    # Create reading-specific config
    config = ReadingModuleConfig(
        module_id=module.id,
        reading_title=reading_title,
        reading_category=reading_category,
        reading_content=reading_content,
        word_count=word_count,
        sentence_count=passage_stats["sentence_count"],
        paragraph_count=passage_stats["paragraph_count"],
        reading_level=passage_stats["reading_level"],
        estimated_reading_time_minutes=estimated_time,
        instructions=instructions,
        max_attempts=reading_config["max_attempts"],
        time_limit_seconds=reading_config["time_limit_seconds"],
        allow_replay=1 if reading_config["allow_replay"] else 0,
        allow_pause=1 if reading_config["allow_pause"] else 0,
        auto_submit=1 if reading_config["auto_submit"] else 0,
        manual_review_required=1 if reading_config["manual_review_required"] else 0,
        minimum_pronunciation_score=reading_config["minimum_pronunciation_score"],
        minimum_accuracy_score=reading_config["minimum_accuracy_score"],
        minimum_completeness_score=reading_config["minimum_completeness_score"],
        minimum_fluency_score=reading_config["minimum_fluency_score"],
        language=language,
        description=description,
        ai_configuration=ai_configuration,
        difficulty=config_difficulty,
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
    if _role_value(user) != "trainee":
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
    settings = _reading_settings_from_module(module, config)
    max_attempts = settings["max_attempts"]
    
    attempt_count = db.query(ReadingAttempt).filter_by(
        module_id=module_id,
        trainee_id=user.id,
    ).count()
    
    if max_attempts > 0 and attempt_count >= max_attempts:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum attempts ({max_attempts}) reached for this module."
        )
    
    # Create attempt
    attempt = ReadingAttempt(
        module_id=module_id,
        trainee_id=user.id,
        attempt_number=attempt_count + 1,
        expected_text=_reading_content_from_module(module, config),
        passing_score=module.passing_score,
        status="in_progress",
    )
    
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    
    return {
        "attempt_id": attempt.id,
        "attempt_number": attempt.attempt_number,
        "reading_content": attempt.expected_text,
        "reading_title": settings["reading_title"],
        "instructions": settings["instructions"],
        "word_count": config.word_count if config else _word_count(attempt.expected_text),
        "sentence_count": config.sentence_count if config else _reading_stats(attempt.expected_text)["sentence_count"],
        "paragraph_count": config.paragraph_count if config else _reading_stats(attempt.expected_text)["paragraph_count"],
        "reading_level": config.reading_level if config else _reading_stats(attempt.expected_text)["reading_level"],
        "passing_score": float(module.passing_score or 0),
        "settings": settings,
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
    extension = ".webm"
    if file.filename and "." in file.filename:
        extension = "." + file.filename.rsplit(".", 1)[-1].lower()
    content_type = file.content_type or "audio/webm"
    storage_path = f"reading/{attempt.module_id}/{user.id}/{attempt_id}/recording{extension}"
    
    audio_url = supabase.upload_microlearning_binary(
        module_id=user.id,
        trainer_id=attempt.module_id,
        filename=f"{attempt_id}/recording{extension}",
        file_data=file_bytes,
        content_type=content_type,
        folder="reading",
        allow_local_fallback=True,
    )
    
    if not audio_url:
        raise HTTPException(status_code=503, detail="Failed to upload audio.")
    
    # Update attempt
    attempt.audio_storage_path = storage_path
    attempt.audio_url = audio_url
    attempt.audio_duration_seconds = None
    attempt.analysis_json = {
        **(attempt.analysis_json or {}),
        "uploaded_audio_bytes": len(file_bytes),
        "audio_content_type": content_type,
    }
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
        audio_bytes = await asyncio.to_thread(transcription_service._read_audio_url, attempt.audio_url)
        transcription_result = await asyncio.to_thread(
            transcription_service.transcribe,
            audio_bytes=audio_bytes,
            language_code=_reading_settings_from_module(attempt.module).get("language", "en-US"),
            mime_type=(attempt.analysis_json or {}).get("audio_content_type", "audio/webm"),
        )
        if not transcription_result or not transcription_result.text:
            raise RuntimeError("Transcription failed")
        transcript = transcription_result.text
        attempt.audio_transcript = transcript
        
        # Step 2: Analyze pronunciation
        analyzer = ReadingPronunciationAnalyzer()
        alignment, score = analyzer.analyze_pronunciation(
            expected_text=attempt.expected_text,
            audio_transcript=transcript,
            provider_words=transcription_result.words,
            duration_seconds=transcription_result.duration_seconds,
        )
        
        # Step 3: Store results
        attempt.total_words = score.total_words
        attempt.correct_words = score.correct_words
        attempt.mispronounced_words = score.mispronounced_words
        attempt.omitted_words = score.omitted_words
        attempt.extra_words = score.extra_words
        attempt.repeated_words = score.repeated_words
        attempt.pronunciation_score = score.pronunciation_accuracy
        attempt.overall_score = score.overall_score
        attempt.accuracy_score = score.word_accuracy
        attempt.fluency_score = score.fluency_score
        attempt.completeness_score = score.completeness_score
        attempt.confidence_score = score.confidence_score
        attempt.words_per_minute = score.words_per_minute
        attempt.audio_duration_seconds = score.duration_seconds or attempt.audio_duration_seconds
        
        # Determine pass/fail
        settings = _reading_settings_from_module(attempt.module)
        passed = _passes_thresholds(score, float(attempt.passing_score), settings["thresholds"])
        attempt.status = "passed" if passed else "failed"
        attempt.completed_at = datetime.utcnow()
        
        # Generate feedback
        common_issues = analyzer.extract_common_issues(alignment)
        speech_timing = analyzer._extract_speech_timing(transcription_result.words or [])
        if speech_timing:
            common_issues["long_pauses"] = speech_timing.get("long_pauses", [])
            common_issues["long_pause_count"] = speech_timing.get("long_pause_count", 0)
        attempt.most_common_issues = common_issues
        attempt.strengths = analyzer.generate_strengths_feedback(alignment, score)
        attempt.improvement_areas = analyzer.generate_improvement_feedback(
            alignment, common_issues, score
        )
        attempt.recommendations = analyzer.generate_recommendations(common_issues)
        attempt.score_breakdown = {
            "overall_score": score.overall_score,
            "pronunciation_score": score.pronunciation_accuracy,
            "accuracy": score.word_accuracy,
            "sentence_accuracy": score.sentence_accuracy,
            "fluency": score.fluency_score,
            "completeness": score.completeness_score,
            "confidence": score.confidence_score,
            "words_per_minute": score.words_per_minute,
            "required_correct_words": int((score.total_words * float(attempt.passing_score) + 99) // 100) if score.total_words else 0,
        }
        attempt.analysis_json = {
            **(attempt.analysis_json or {}),
            "provider": transcription_result.provider,
            "provider_confidence": transcription_result.confidence,
            "provider_words": transcription_result.words or [],
            "speech_timing": speech_timing,
            "common_issues": common_issues,
            "ai_configuration": settings.get("ai_configuration"),
        }
        
        # Step 4: Store word-by-word analysis
        db.query(ReadingWordAnalysis).filter_by(attempt_id=attempt_id).delete()
        db.query(ReadingPronunciationIssue).filter_by(attempt_id=attempt_id).delete()
        for word_alignment in alignment:
            word_analysis = ReadingWordAnalysis(
                attempt_id=attempt_id,
                word_index=word_alignment.word_index,
                expected_word=word_alignment.expected_word,
                spoken_word=word_alignment.spoken_word,
                status=word_alignment.status,
                confidence=word_alignment.confidence,
                phoneme_data=word_alignment.phoneme_data,
                feedback=word_alignment.feedback,
            )
            db.add(word_analysis)

        for item in common_issues.get("sound_analysis", []):
            db.add(ReadingPronunciationIssue(
                attempt_id=attempt_id,
                issue_type="sound",
                issue_text=item.get("sound") or "sound",
                occurrence_count=int(item.get("issue_count") or 1),
                severity="high" if float(item.get("accuracy") or 0) < 75 else "medium",
                examples=item,
            ))

        _sync_microlearning_assignment_from_attempt(db, user=user, attempt=attempt, score=score, passed=passed)
        
        db.commit()
        db.refresh(attempt)
        
        logger.info(
            f"Processed reading attempt {attempt_id}: "
            f"score={score.overall_score:.1f}%, passed={passed}"
        )
        
        return {
            "attempt_id": attempt.id,
            "status": attempt.status,
            "score": float(attempt.overall_score or 0),
            "overall_score": float(attempt.overall_score or 0),
            "pronunciation_score": float(attempt.pronunciation_score or 0),
            "accuracy": float(attempt.accuracy_score or 0),
            "fluency": float(attempt.fluency_score or 0),
            "completeness": float(attempt.completeness_score or 0),
            "confidence": float(attempt.confidence_score or 0),
            "passing_score": float(attempt.passing_score),
            "passed": passed,
            "word_count": attempt.total_words,
            "correct": attempt.correct_words,
            "correct_words": attempt.correct_words,
            "mispronounced": attempt.mispronounced_words,
            "mispronounced_words": attempt.mispronounced_words,
            "omitted": attempt.omitted_words,
            "omitted_words": attempt.omitted_words,
            "extra": attempt.extra_words,
            "extra_words": attempt.extra_words,
            "repeated_words": attempt.repeated_words,
            "words_per_minute": float(attempt.words_per_minute or 0),
            "duration_seconds": float(attempt.audio_duration_seconds or 0),
            "score_breakdown": attempt.score_breakdown,
            "common_issues": attempt.most_common_issues,
            "strengths": attempt.strengths,
            "improvement_areas": attempt.improvement_areas,
            "recommendations": attempt.recommendations,
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
        "overall_score": float(attempt.overall_score) if attempt.overall_score else None,
        "pronunciation_score": float(attempt.pronunciation_score) if attempt.pronunciation_score else None,
        "accuracy": float(attempt.accuracy_score) if attempt.accuracy_score else None,
        "fluency": float(attempt.fluency_score) if attempt.fluency_score else None,
        "completeness": float(attempt.completeness_score) if attempt.completeness_score else None,
        "confidence": float(attempt.confidence_score) if attempt.confidence_score else None,
        "passing_score": float(attempt.passing_score),
        "passed": attempt.status == "passed",
        "word_count": attempt.total_words,
        "correct_words": attempt.correct_words,
        "mispronounced_words": attempt.mispronounced_words,
        "omitted_words": attempt.omitted_words,
        "extra_words": attempt.extra_words,
        "repeated_words": attempt.repeated_words,
        "words_per_minute": float(attempt.words_per_minute or 0),
        "duration_seconds": float(attempt.audio_duration_seconds or 0),
        "transcript": attempt.audio_transcript,
        "audio_url": attempt.audio_url,
        "strengths": attempt.strengths,
        "improvement_areas": attempt.improvement_areas,
        "recommendations": attempt.recommendations,
        "common_issues": attempt.most_common_issues,
        "score_breakdown": attempt.score_breakdown,
        "word_analysis": [
            {
                "word_index": wa.word_index,
                "expected_word": wa.expected_word,
                "spoken_word": wa.spoken_word,
                "status": wa.status,
                "confidence": float(wa.confidence) if wa.confidence else None,
                "phoneme_data": wa.phoneme_data,
                "feedback": wa.feedback,
            }
            for wa in word_analysis
        ],
        "created_at": attempt.created_at.isoformat() if attempt.created_at else None,
        "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
    }


@router.get("/trainer/report")
async def get_trainer_reading_report(
    module_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
    *,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trainer-facing pronunciation reading analytics across owned modules."""
    if _role_value(user) not in {"trainer", "admin"}:
        raise HTTPException(status_code=403, detail="Trainer access required.")

    query = (
        db.query(ReadingAttempt)
        .join(MicrolearningModule, ReadingAttempt.module_id == MicrolearningModule.id)
        .filter(MicrolearningModule.type == "reading")
    )
    if _role_value(user) != "admin":
        query = query.filter(MicrolearningModule.created_by == user.id)
    if module_id:
        query = query.filter(ReadingAttempt.module_id == module_id)
    if trainee_id:
        query = query.filter(ReadingAttempt.trainee_id == trainee_id)

    attempts = query.order_by(ReadingAttempt.created_at.desc()).all()
    attempt_ids = [attempt.id for attempt in attempts]
    completed_attempts = [
        attempt for attempt in attempts
        if attempt.status in {"passed", "failed", "completed"}
    ]

    word_rows = (
        db.query(ReadingWordAnalysis)
        .filter(ReadingWordAnalysis.attempt_id.in_(attempt_ids))
        .all()
        if attempt_ids
        else []
    )
    sound_rows = (
        db.query(ReadingPronunciationIssue)
        .filter(
            ReadingPronunciationIssue.attempt_id.in_(attempt_ids),
            ReadingPronunciationIssue.issue_type.in_(["sound", "phoneme"]),
        )
        .all()
        if attempt_ids
        else []
    )

    difficult_word_counts: dict[str, dict[str, Any]] = {}
    for row in word_rows:
        if row.status not in {"mispronounced", "omitted", "uncertain"} or not row.expected_word:
            continue
        bucket = difficult_word_counts.setdefault(
            row.expected_word,
            {
                "word": row.expected_word,
                "issue_count": 0,
                "mispronounced": 0,
                "skipped": 0,
                "average_confidence_values": [],
                "examples": [],
            },
        )
        bucket["issue_count"] += 1
        if row.status == "omitted":
            bucket["skipped"] += 1
        else:
            bucket["mispronounced"] += 1
        if row.confidence is not None:
            bucket["average_confidence_values"].append(float(row.confidence))
        if len(bucket["examples"]) < 5:
            bucket["examples"].append({
                "expected": row.expected_word,
                "recognized": row.spoken_word,
                "status": row.status,
                "sound_issue": (row.phoneme_data or {}).get("sound"),
            })

    difficult_words = []
    for bucket in difficult_word_counts.values():
        values = bucket.pop("average_confidence_values")
        difficult_words.append({
            **bucket,
            "average_confidence": round(_average(values) * 100, 2) if values else 0,
        })
    difficult_words.sort(key=lambda item: item["issue_count"], reverse=True)

    difficult_sound_counts: dict[str, dict[str, Any]] = {}
    for row in sound_rows:
        sound = row.issue_text or "Unknown"
        bucket = difficult_sound_counts.setdefault(
            sound,
            {"sound": sound, "issue_count": 0, "examples": []},
        )
        bucket["issue_count"] += int(row.occurrence_count or 1)
        if len(bucket["examples"]) < 5:
            bucket["examples"].append(row.examples or {})
    difficult_sounds = sorted(
        difficult_sound_counts.values(),
        key=lambda item: item["issue_count"],
        reverse=True,
    )

    trainee_buckets: dict[str, dict[str, Any]] = {}
    for attempt in completed_attempts:
        trainee = getattr(attempt, "trainee", None)
        trainee_key = attempt.trainee_id
        bucket = trainee_buckets.setdefault(
            trainee_key,
            {
                "trainee_id": trainee_key,
                "trainee_name": getattr(trainee, "full_name", None),
                "attempts": 0,
                "passed": 0,
                "scores": [],
                "pronunciation": [],
                "fluency": [],
                "confidence": [],
                "latest_completed_at": None,
            },
        )
        bucket["attempts"] += 1
        bucket["passed"] += 1 if attempt.status == "passed" else 0
        bucket["scores"].append(float(attempt.overall_score or 0))
        bucket["pronunciation"].append(float(attempt.pronunciation_score or 0))
        bucket["fluency"].append(float(attempt.fluency_score or 0))
        bucket["confidence"].append(float(attempt.confidence_score or 0))
        if attempt.completed_at and (
            not bucket["latest_completed_at"]
            or attempt.completed_at.isoformat() > bucket["latest_completed_at"]
        ):
            bucket["latest_completed_at"] = attempt.completed_at.isoformat()

    trainee_rows = []
    for bucket in trainee_buckets.values():
        attempts_count = int(bucket["attempts"] or 0)
        trainee_rows.append({
            "trainee_id": bucket["trainee_id"],
            "trainee_name": bucket["trainee_name"],
            "attempts": attempts_count,
            "passed": int(bucket["passed"] or 0),
            "pass_rate": round((int(bucket["passed"] or 0) / attempts_count) * 100, 2) if attempts_count else 0,
            "average_score": _average(bucket["scores"]),
            "average_pronunciation": _average(bucket["pronunciation"]),
            "average_fluency": _average(bucket["fluency"]),
            "average_confidence": _average(bucket["confidence"]),
            "latest_completed_at": bucket["latest_completed_at"],
        })
    top_performers = sorted(trainee_rows, key=lambda item: item["average_score"], reverse=True)[:10]
    needs_improvement = sorted(
        [item for item in trainee_rows if item["pass_rate"] < 100 or item["average_score"] < 75],
        key=lambda item: (item["pass_rate"], item["average_score"]),
    )[:10]

    scores = [float(attempt.overall_score or 0) for attempt in completed_attempts]
    pronunciation_scores = [float(attempt.pronunciation_score or 0) for attempt in completed_attempts]
    fluency_scores = [float(attempt.fluency_score or 0) for attempt in completed_attempts]
    confidence_scores = [float(attempt.confidence_score or 0) for attempt in completed_attempts]
    passed_count = sum(1 for attempt in completed_attempts if attempt.status == "passed")
    trend_buckets: dict[str, dict[str, Any]] = {}
    for attempt in completed_attempts:
        bucket_date = (attempt.completed_at or attempt.created_at or datetime.utcnow()).date().isoformat()
        bucket = trend_buckets.setdefault(
            bucket_date,
            {"date": bucket_date, "scores": [], "pronunciation": [], "accuracy": [], "fluency": [], "attempts": 0},
        )
        bucket["attempts"] += 1
        bucket["scores"].append(float(attempt.overall_score or 0))
        bucket["pronunciation"].append(float(attempt.pronunciation_score or 0))
        bucket["accuracy"].append(float(attempt.accuracy_score or 0))
        bucket["fluency"].append(float(attempt.fluency_score or 0))
    trend_over_time = [
        {
            "date": bucket["date"],
            "attempts": bucket["attempts"],
            "average_score": _average(bucket["scores"]),
            "average_pronunciation": _average(bucket["pronunciation"]),
            "average_accuracy": _average(bucket["accuracy"]),
            "average_fluency": _average(bucket["fluency"]),
        }
        for bucket in sorted(trend_buckets.values(), key=lambda item: item["date"])
    ]

    return {
        "summary": {
            "attempt_count": len(attempts),
            "completed_attempt_count": len(completed_attempts),
            "passed_count": passed_count,
            "failed_count": len(completed_attempts) - passed_count,
            "pass_rate": round((passed_count / len(completed_attempts)) * 100, 2) if completed_attempts else 0,
            "average_score": _average(scores),
            "average_pronunciation": _average(pronunciation_scores),
            "average_fluency": _average(fluency_scores),
            "average_confidence": _average(confidence_scores),
            "trainee_count": len(trainee_rows),
        },
        "top_performing_trainees": top_performers,
        "needs_improvement": needs_improvement,
        "most_difficult_words": difficult_words[:20],
        "most_difficult_sounds": difficult_sounds[:20],
        "trend_over_time": trend_over_time,
        "attempts": [_serialize_attempt_summary(attempt) for attempt in attempts[:100]],
    }


@router.get("/trainer/modules/{module_id}/attempts")
async def get_trainer_module_attempts(
    module_id: str,
    trainee_id: Optional[str] = None,
    *,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trainer view of every saved attempt for a reading module."""
    if _role_value(user) not in {"trainer", "admin"}:
        raise HTTPException(status_code=403, detail="Trainer access required.")

    module = db.query(MicrolearningModule).filter_by(id=module_id, type="reading").first()
    if not module:
        raise HTTPException(status_code=404, detail="Reading module not found.")
    if _role_value(user) != "admin" and module.created_by != user.id:
        raise HTTPException(status_code=403, detail="Unauthorized.")

    query = db.query(ReadingAttempt).filter_by(module_id=module_id)
    if trainee_id:
        query = query.filter(ReadingAttempt.trainee_id == trainee_id)

    attempts = query.order_by(ReadingAttempt.trainee_id, ReadingAttempt.attempt_number).all()
    return {
        "module_id": module_id,
        "module_title": module.title,
        "attempts": [_serialize_attempt_summary(attempt) for attempt in attempts],
    }


def _sync_microlearning_assignment_from_attempt(
    db: Session,
    *,
    user: User,
    attempt: ReadingAttempt,
    score: PronunciationScore,
    passed: bool,
) -> None:
    assignment = (
        db.query(MicrolearningAssignment)
        .filter_by(module_id=attempt.module_id, trainee_id=user.id)
        .first()
    )
    if not assignment or not assignment.module:
        return

    ensure_module_exercises(assignment.module)
    exercises = assignment.module.exercises or []
    if not exercises:
        return

    exercise = dict(exercises[0])
    exercise_id = str(exercise.get("id") or "reading-pronunciation")
    points_possible = float(exercise.get("point_value") or 10)
    assignment_score = score.overall_score
    if not passed:
        assignment_score = min(
            score.overall_score,
            max(0.0, float(attempt.passing_score or 0) - 0.01),
        )
    points_earned = round((assignment_score / 100.0) * points_possible, 2)
    responses = dict(assignment.responses or {})
    responses.pop(MICROLEARNING_RESULT_SUMMARY_KEY, None)
    responses[exercise_id] = {
        "id": exercise_id,
        "response_text": attempt.audio_transcript,
        "selected_option": None,
        "correct_answer": attempt.expected_text,
        "input_mode": "speech",
        "reading_attempt_id": attempt.id,
        "audio_url": attempt.audio_url,
        "response_duration": float(attempt.audio_duration_seconds or 0),
        "overall_score": score.overall_score,
        "accuracy_percentage": score.word_accuracy,
        "score": assignment_score,
        "points_earned": points_earned,
        "points_possible": points_possible,
        "feedback": attempt.improvement_areas or "Pronunciation reading assessment completed.",
        "result_status": "passed" if passed else "failed",
        "status": "answered",
        "is_completed": True,
        "assessment_data": attempt.analysis_json,
        "submitted_at": datetime.utcnow().isoformat(),
    }
    assignment.responses = responses
    refresh_assignment_progress(assignment)
    summary = serialize_assignment_summary(assignment)

    if summary.get("is_passed") and not assignment.certificate_id:
        certificate, _ = award_certificate(
            db,
            trainee_id=user.id,
            issuer_id=assignment.assigned_by,
            source_type="microlearning_assignment",
            source_id=assignment.id,
            achievement_title=assignment.module.title,
            achievement_type="microlearning",
            remarks=f"Completed reading pronunciation assessment: {assignment.module.title}",
            score=float(summary.get("average_score") or 0.0),
            issued_at=assignment.completed_at or datetime.utcnow(),
        )
        assignment.certificate_id = certificate.id
        assignment.status = "certified"

    ensure_assignment_result_summary(assignment)


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

    history_rows = []
    previous_score: Optional[float] = None
    for attempt in attempts:
        score = float(attempt.overall_score or attempt.pronunciation_score or 0) if attempt.completed_at else None
        history_rows.append({
            "id": attempt.id,
            "attempt_number": attempt.attempt_number,
            "status": attempt.status,
            "score": score,
            "overall_score": float(attempt.overall_score or 0),
            "accuracy": float(attempt.accuracy_score or 0),
            "fluency": float(attempt.fluency_score or 0),
            "confidence": float(attempt.confidence_score or 0),
            "passed": attempt.status == "passed",
            "words_per_minute": float(attempt.words_per_minute or 0),
            "duration_seconds": float(attempt.audio_duration_seconds or 0),
            "improvement": round(score - previous_score, 2) if score is not None and previous_score is not None else None,
            "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
            "created_at": attempt.created_at.isoformat() if attempt.created_at else None,
        })
        if score is not None:
            previous_score = score
    
    return {
        "module_id": module_id,
        "total_attempts": len(attempts),
        "attempts": history_rows,
    }
