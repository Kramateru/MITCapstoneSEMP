import json
import logging
import os
import sys
from io import BytesIO
from pathlib import Path
from typing import Optional

try:
    import azure.cognitiveservices.speech as speechsdk
    from azure.cognitiveservices.speech.assessment import (
        PronunciationAssessmentConfig,
        PronunciationAssessmentGradingSystem,
        PronunciationAssessmentGranularity,
    )
    AZURE_AVAILABLE = True
except Exception:
    speechsdk = None
    PronunciationAssessmentConfig = None
    PronunciationAssessmentGradingSystem = None
    PronunciationAssessmentGranularity = None
    AZURE_AVAILABLE = False
    import logging as _logging
    _logging.getLogger(__name__).info("Azure Speech SDK not installed; pronunciation features disabled")

try:
    import google.genai as genai
    GEMINI_AVAILABLE = True
except Exception:
    genai = None
    GEMINI_AVAILABLE = False
    import logging as _logging
    _logging.getLogger(__name__).info("Google GenAI not installed; Gemini features disabled")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

try:
    from .env_loader import load_backend_environment
except ImportError:
    from env_loader import load_backend_environment

# Load environment variables using the shared backend resolution order.
load_backend_environment()
MEDIA_ROOT = Path(__file__).resolve().parent.parent / "media"
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Gemini-related availability messaging.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    logger.info("Gemini API key detected for REST-based support features")
elif GEMINI_AVAILABLE:
    logger.warning("Gemini API key not found; Gemini features disabled")
else:
    logger.warning("Google GenAI SDK not installed; WebSocket Gemini features disabled")

# Support running from `backend/` as `uvicorn main:app`.
if __package__ in (None, ""):
    sys.path.append(str(Path(__file__).resolve().parent.parent))

# Import route modules
from backend.routes import (
    auth_routes,
    user_routes,
    scenario_routes,
    assessment_routes,
    analytics_routes,
    admin_routes,
    trainer_routes,
    trainee_routes,
    settings_routes,
    workspace_routes,
    export_routes,
    support_routes,
    certification_routes,
    notification_routes,
)
from backend.database import Base, engine, SessionLocal
from backend.services.lob_catalog import (
    migrate_legacy_lob_references,
    sync_default_lob_catalog,
)

app = FastAPI(
    title="Speech-Enabled BPO Platform",
    description="Comprehensive BPO training platform with speech assessment",
    version="2.0.0"
)

# Create database tables
Base.metadata.create_all(bind=engine)


def ensure_user_settings_columns() -> None:
    """Backfill settings columns for existing databases created before UI settings were added."""
    try:
        inspector = inspect(engine)
        existing_columns = {column["name"] for column in inspector.get_columns("user")}
    except Exception:
        logger.exception("Unable to inspect user table for settings migration")
        return

    if not existing_columns:
        return

    column_definitions = {
        "sidebar_state": "VARCHAR(20) DEFAULT 'default'",
        "big_font_scale": "FLOAT DEFAULT 1.0",
        "daltonism_mode": "VARCHAR(20) DEFAULT 'none'",
        "profile_image_url": "VARCHAR(500)",
        "ui_preferences": "JSONB DEFAULT '{}'::jsonb"
        if engine.dialect.name == "postgresql"
        else "JSON DEFAULT '{}'",
    }

    statements = [
        text(f'ALTER TABLE "user" ADD COLUMN {name} {definition}')
        for name, definition in column_definitions.items()
        if name not in existing_columns
    ]

    if not statements:
        return

    empty_json_literal = "'{}'::jsonb" if engine.dialect.name == "postgresql" else "'{}'"

    try:
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(statement)

            connection.execute(
                text(
                    'UPDATE "user" SET '
                    "sidebar_state = COALESCE(sidebar_state, 'default'), "
                    "big_font_scale = COALESCE(big_font_scale, 1.0), "
                    "daltonism_mode = COALESCE(daltonism_mode, 'none'), "
                    f"ui_preferences = COALESCE(ui_preferences, {empty_json_literal})"
                )
            )
        logger.info("Applied user settings schema backfill for existing databases")
    except Exception:
        logger.exception("Failed to backfill user settings columns")


ensure_user_settings_columns()


def ensure_microlearning_assessment_schema() -> None:
    """Backfill microlearning assessment method columns for existing databases."""
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
    except Exception:
        logger.exception("Unable to inspect microlearning tables for schema backfill")
        return

    if "microlearning_module" not in existing_tables:
        return

    current_columns = {
        column["name"]
        for column in inspector.get_columns("microlearning_module")
    }

    if "assessment_method_id" in current_columns:
        return

    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE microlearning_module "
                    "ADD COLUMN assessment_method_id VARCHAR(36)"
                )
            )
        logger.info("Applied microlearning assessment schema backfill")
    except Exception:
        logger.exception("Failed to backfill microlearning assessment schema")


ensure_microlearning_assessment_schema()


def ensure_user_dismissed_notifications_column() -> None:
    """Backfill dismissed_notifications column for existing databases."""
    try:
        inspector = inspect(engine)
        existing_columns = {column["name"] for column in inspector.get_columns("user")}
    except Exception:
        logger.exception("Unable to inspect user table for dismissed_notifications migration")
        return

    if "dismissed_notifications" in existing_columns:
        return

    json_definition = (
        "JSONB DEFAULT '[]'::jsonb"
        if engine.dialect.name == "postgresql"
        else "JSON DEFAULT '[]'"
    )

    try:
        with engine.begin() as connection:
            connection.execute(
                text(f'ALTER TABLE "user" ADD COLUMN dismissed_notifications {json_definition}')
            )
        logger.info("Applied user dismissed_notifications schema backfill")
    except Exception:
        logger.exception("Failed to backfill dismissed_notifications column")


ensure_user_dismissed_notifications_column()


def ensure_certification_schema() -> None:
    """Backfill certificate settings and certificate record columns for older databases."""
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
    except Exception:
        logger.exception("Unable to inspect certification tables for schema backfill")
        return

    json_definition = (
        "JSONB DEFAULT '{}'::jsonb"
        if engine.dialect.name == "postgresql"
        else "JSON DEFAULT '{}'"
    )
    empty_json_literal = "'{}'::jsonb" if engine.dialect.name == "postgresql" else "'{}'"

    certification_columns = {
        "signatory_title": "VARCHAR(255) DEFAULT 'Authorized Signatory'",
        "certificate_prefix": "VARCHAR(50) DEFAULT 'SPV'",
        "certificate_title": "VARCHAR(255) DEFAULT 'Certificate of Completion'",
        "certificate_subtitle": "VARCHAR(255) DEFAULT 'Issued for completed trainee tasks and assessments'",
        "certificate_intro": "TEXT DEFAULT 'This certificate is proudly presented to'",
        "certificate_outro": (
            "TEXT DEFAULT 'for successfully completing the training requirement shown below "
            "through St. Peter Velle Technical Training Center, Inc.'"
        ),
        "certificate_footer": (
            "TEXT DEFAULT 'This certificate is stored in the platform database and may be "
            "verified through the official certificate record.'"
        ),
    }

    certificate_record_columns = {
        "source_type": "VARCHAR(50) DEFAULT 'competency_verdict'",
        "source_id": "VARCHAR(36)",
        "achievement_type": "VARCHAR(50) DEFAULT 'completion'",
        "template_snapshot": json_definition,
    }
    coaching_log_columns = {
        "competency_status": "VARCHAR(20) DEFAULT 'pending'",
    }

    try:
        with engine.begin() as connection:
            if "certification_settings" in existing_tables:
                current_columns = {
                    column["name"]
                    for column in inspector.get_columns("certification_settings")
                }
                for name, definition in certification_columns.items():
                    if name not in current_columns:
                        connection.execute(
                            text(
                                f'ALTER TABLE certification_settings ADD COLUMN {name} {definition}'
                            )
                        )

                connection.execute(
                    text(
                        "UPDATE certification_settings SET "
                        "signatory_title = COALESCE(signatory_title, 'Authorized Signatory'), "
                        "certificate_prefix = COALESCE(certificate_prefix, 'SPV'), "
                        "certificate_title = COALESCE(certificate_title, 'Certificate of Completion'), "
                        "certificate_subtitle = COALESCE(certificate_subtitle, 'Issued for completed trainee tasks and assessments'), "
                        "certificate_intro = COALESCE(certificate_intro, 'This certificate is proudly presented to'), "
                        "certificate_outro = COALESCE(certificate_outro, 'for successfully completing the training requirement shown below through St. Peter Velle Technical Training Center, Inc.'), "
                        "certificate_footer = COALESCE(certificate_footer, 'This certificate is stored in the platform database and may be verified through the official certificate record.')"
                    )
                )

            if "certificate_record" in existing_tables:
                current_columns = {
                    column["name"]
                    for column in inspector.get_columns("certificate_record")
                }
                for name, definition in certificate_record_columns.items():
                    if name not in current_columns:
                        connection.execute(
                            text(
                                f'ALTER TABLE certificate_record ADD COLUMN {name} {definition}'
                            )
                        )

                connection.execute(
                    text(
                        "UPDATE certificate_record SET "
                        "source_type = COALESCE(source_type, 'competency_verdict'), "
                        "source_id = COALESCE(source_id, verdict_id), "
                        "achievement_type = COALESCE(achievement_type, 'competency'), "
                        f"template_snapshot = COALESCE(template_snapshot, {empty_json_literal})"
                    )
                )

            if "coaching_log" in existing_tables:
                current_columns = {
                    column["name"] for column in inspector.get_columns("coaching_log")
                }
                for name, definition in coaching_log_columns.items():
                    if name not in current_columns:
                        connection.execute(
                            text(f"ALTER TABLE coaching_log ADD COLUMN {name} {definition}")
                        )

                connection.execute(
                    text(
                        "UPDATE coaching_log SET "
                        "competency_status = COALESCE(competency_status, 'pending')"
                    )
                )
        logger.info("Applied certification schema backfill for existing databases")
    except Exception:
        logger.exception("Failed to backfill certification schema")


ensure_certification_schema()


def ensure_default_lob_catalog() -> None:
    """Keep the active LOB catalog aligned with the supported production list."""
    for attempt in range(1, 3):
        db = SessionLocal()
        try:
            catalog_summary = sync_default_lob_catalog(db, deactivate_missing=True)
            migration_summary = migrate_legacy_lob_references(db)
            db.commit()
            logger.info(
                "LOB catalog synced: created=%s updated=%s deactivated=%s migrated=%s",
                catalog_summary["created"],
                catalog_summary["updated"],
                catalog_summary["deactivated"],
                migration_summary,
            )
            return
        except Exception:
            db.rollback()
            if attempt == 2:
                logger.exception("Failed to sync default LOB catalog")
            else:
                logger.info("LOB catalog sync attempt %s failed; retrying once.", attempt)
        finally:
            db.close()

# Add CORS middleware to allow requests from React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL instead
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/media", StaticFiles(directory=str(MEDIA_ROOT)), name="media")

ensure_default_lob_catalog()

# Include route blueprints
app.include_router(auth_routes.router)
app.include_router(user_routes.router)
app.include_router(scenario_routes.router)
app.include_router(assessment_routes.router)
app.include_router(analytics_routes.router)
app.include_router(admin_routes.router)
app.include_router(trainer_routes.router)
app.include_router(trainee_routes.router)
app.include_router(settings_routes.router)
app.include_router(workspace_routes.router)
app.include_router(export_routes.router)
app.include_router(support_routes.router)
app.include_router(certification_routes.router)
app.include_router(notification_routes.router)

# Azure Speech Configuration
SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "your_key_here")
SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "eastus")
if AZURE_AVAILABLE:
    SPEECH_CONFIG = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    SPEECH_CONFIG.speech_recognition_language = "en-US"
else:
    SPEECH_CONFIG = None


def assess_pronunciation(
    audio_bytes: bytes, reference_text: Optional[str] = None
) -> dict:
    """
    Assess pronunciation using Azure Speech Service with Pronunciation Assessment.

    Args:
        audio_bytes: PCM 16-bit 16kHz audio data
        reference_text: The text the user should read (for pronunciation assessment)

    Returns:
        Dictionary with transcription, pronunciation scores, and word-level feedback
    """
    if not AZURE_AVAILABLE:
        return {"status": "error", "error": "Azure Speech SDK not available"}

    try:
        # Create a push audio input stream
        push_stream = speechsdk.audio.PushAudioInputStream()
        push_stream.write(audio_bytes)
        push_stream.close()

        # Create audio configuration
        audio_config = speechsdk.audio.AudioConfig(stream=push_stream)

        # Initialize pronunciation assessment config
        if reference_text:
            # Full pronunciation assessment with reference text
            assessment_config = PronunciationAssessmentConfig(
                reference_text=reference_text,
                grading_system=PronunciationAssessmentGradingSystem.HundredMark,
                granularity=PronunciationAssessmentGranularity.Word,
            )
            assessment_config.enable_miscue(True)  # Detect mispronounced words
        else:
            # Speech recognition only (no assessment)
            assessment_config = None

        # Create speech recognizer
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=SPEECH_CONFIG, audio_config=audio_config
        )

        # Apply pronunciation assessment if configured
        if assessment_config:
            assessment_config.apply_on(recognizer)

        # Recognize speech
        logger.info("Starting speech recognition...")
        result = recognizer.recognize_once()

        # Process the result
        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            logger.info(f"Recognized text: {result.text}")

            response = {
                "status": "success",
                "text": result.text,
                "reference_text": reference_text,
            }

            # Parse pronunciation assessment if available
            if assessment_config and result.properties:
                try:
                    json_result = result.properties.get(
                        speechsdk.PropertyId.SpeechServiceResponse_JsonResult
                    )
                    if json_result:
                        pronunciation_result = json.loads(json_result)
                        logger.info(f"Pronunciation Assessment: {pronunciation_result}")

                        # Extract overall scores
                        nbest = pronunciation_result.get("NBest", [{}])[0]
                        response["overall_scores"] = {
                            "accuracy": nbest.get("PronunciationAssessment", {}).get(
                                "AccuracyScore", 0
                            ),
                            "fluency": nbest.get("PronunciationAssessment", {}).get(
                                "FluencyScore", 0
                            ),
                            "completeness": nbest.get(
                                "PronunciationAssessment", {}
                            ).get("CompletenessScore", 0),
                            "prosody": nbest.get("PronunciationAssessment", {}).get(
                                "ProsodyScore", 0
                            ),
                        }

                        # Extract word-level feedback
                        words = []
                        for word_info in nbest.get("Words", []):
                            word_assessment = word_info.get(
                                "PronunciationAssessment", {}
                            )
                            words.append(
                                {
                                    "word": word_info.get("Word", ""),
                                    "accuracy": word_assessment.get("AccuracyScore", 0),
                                    "error_type": word_assessment.get(
                                        "ErrorType", "None"
                                    ),
                                }
                            )

                        response["words"] = words
                except Exception as e:
                    logger.warning(f"Error parsing pronunciation assessment: {e}")
            else:
                # Basic confidence score from recognition
                response["overall_scores"] = {
                    "accuracy": 0,
                    "fluency": 0,
                    "completeness": 0,
                    "prosody": 0,
                }
                response["words"] = []

            return response

        elif result.reason == speechsdk.ResultReason.NoMatch:
            logger.warning("No speech detected")
            return {
                "status": "no_match",
                "text": None,
                "error": "No speech detected. Please speak clearly.",
                "overall_scores": {
                    "accuracy": 0,
                    "fluency": 0,
                    "completeness": 0,
                    "prosody": 0,
                },
                "words": [],
            }

        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            error_message = f"Error: {cancellation.reason}"
            if cancellation.error_details:
                error_message += f" - {cancellation.error_details}"
            logger.error(error_message)
            return {
                "status": "error",
                "text": None,
                "error": error_message,
                "overall_scores": {
                    "accuracy": 0,
                    "fluency": 0,
                    "completeness": 0,
                    "prosody": 0,
                },
                "words": [],
            }

    except Exception as e:
        error_message = f"Speech assessment error: {str(e)}"
        logger.error(error_message)
        return {
            "status": "error",
            "text": None,
            "error": error_message,
            "overall_scores": {
                "accuracy": 0,
                "fluency": 0,
                "completeness": 0,
                "prosody": 0,
            },
            "words": [],
        }


@app.websocket("/ws/speech")
async def speech_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time speech streaming with Gemini Live API."""
    await websocket.accept()
    logger.info("Client connected to speech endpoint")

    if not GEMINI_AVAILABLE or not os.getenv("GEMINI_API_KEY"):
        await websocket.send_json({
            "status": "error",
            "error": "Gemini API not configured"
        })
        return

    try:
        # Create Gemini Live session
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        chat = model.start_chat()

        await websocket.send_json({"status": "ready"})

        while True:
            # Receive data from React
            data = await websocket.receive_text()

            try:
                message = json.loads(data)

                if message.get("type") == "audio":
                    # Process audio with Gemini
                    audio_data = message.get("audio")
                    if audio_data:
                        # Send audio to Gemini
                        response = chat.send_message([
                            "Listen to this audio and respond as a customer service AI:",
                            {"mime_type": "audio/webm", "data": audio_data}
                        ])
                        
                        # Send response back
                        await websocket.send_json({
                            "status": "response",
                            "text": response.text,
                            "audio": None  # For now, text only
                        })

                elif message.get("type") == "text":
                    # Handle text input
                    text = message.get("text")
                    if text:
                        response = chat.send_message(text)
                        await websocket.send_json({
                            "status": "response",
                            "text": response.text
                        })

            except json.JSONDecodeError:
                logger.error("Invalid JSON received")

    except WebSocketDisconnect:
        logger.info("Client disconnected")

    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        try:
            await websocket.send_json({
                "status": "error",
                "error": str(e)
            })
        except:
            pass


from fastapi.responses import RedirectResponse

@app.get("/")
async def root():
    # when the backend is browsed directly, redirect to the frontend
    # development server if available; otherwise return basic JSON.
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    if frontend_url:
        return RedirectResponse(url=frontend_url)
    return {
        "message": "Speech-Enabled BPO Platform Backend",
        "version": "2.0.0",
        "features": [
            "speech-recognition",
            "pronunciation-assessment",
            "word-level-scoring",
        ],
        "endpoints": {
            "webSocket": "/ws/speech",
            "docs": "/docs",
        },
    }
