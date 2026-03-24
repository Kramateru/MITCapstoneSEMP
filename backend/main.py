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

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables (prefer repo root .env)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
)
from backend.database import Base, engine, SessionLocal
from backend.models import User, UserRole  # Import models to create tables
from backend import auth_utils
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


def ensure_demo_users() -> None:
    """Ensure demo users exist with known credentials for local dev."""
    demo_users = [
        {
            "email": "admin@stpeterville.edu.ph",
            "password": "Admin@SPV",
            "full_name": "Admin User",
            "role": UserRole.ADMIN,
            "lob": "Administration",
            "department": "Management",
        },
        {
            "email": "trainer@st.peterville.edu.ph",
            "password": "Trainer@123",
            "full_name": "Trainer User",
            "role": UserRole.TRAINER,
            "lob": "Training",
            "department": "Operations",
        },
        {
            "email": "mcureta@fatima.edu.ph",
            "password": "SPVTrainee2026",
            "full_name": "Trainee User",
            "role": UserRole.TRAINEE,
            "lob": "Training",
            "department": "Operations",
        },
    ]

    db = SessionLocal()
    try:
        for demo in demo_users:
            user = db.query(User).filter(User.email == demo["email"]).first()
            if user:
                user.full_name = demo["full_name"]
                user.role = demo["role"]
                user.is_active = True
                user.lob = user.lob or demo["lob"]
                user.department = user.department or demo["department"]
                # Ensure demo passwords are usable in local dev
                try:
                    password_ok = auth_utils.verify_password(
                        demo["password"],
                        user.password_hash,
                    )
                except Exception:
                    password_ok = False
                if not password_ok:
                    user.password_hash = auth_utils.hash_password(demo["password"])
            else:
                db.add(
                    User(
                        email=demo["email"],
                        full_name=demo["full_name"],
                        password_hash=auth_utils.hash_password(demo["password"]),
                        role=demo["role"],
                        is_active=True,
                        lob=demo["lob"],
                        department=demo["department"],
                    )
                )
        db.commit()
    finally:
        db.close()


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

# Seed demo users for local dev
ensure_demo_users()
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
    """WebSocket endpoint for real-time speech streaming and pronunciation assessment."""
    await websocket.accept()
    logger.info("Client connected to speech endpoint")

    reference_text = None
    audio_buffer = bytearray()

    try:
        while True:
            # Receive data from React (either text or audio)
            data = await websocket.receive_text()

            try:
                message = json.loads(data)

                # If it's initialization with reference text
                if message.get("type") == "init":
                    reference_text = message.get("reference_text")
                    logger.info(f"Reference text set: {reference_text}")
                    await websocket.send_json(
                        {"status": "ready", "reference_text": reference_text}
                    )

                # If it's streaming control
                elif message.get("type") == "start":
                    audio_buffer = bytearray()
                    logger.info("Audio streaming started")

                elif message.get("type") == "stop":
                    # Process the complete audio buffer
                    if audio_buffer:
                        logger.info(f"Processing {len(audio_buffer)} bytes of audio")
                        result = assess_pronunciation(
                            bytes(audio_buffer), reference_text=reference_text
                        )
                        await websocket.send_json(result)
                    else:
                        await websocket.send_json(
                            {
                                "status": "error",
                                "error": "No audio data received",
                            }
                        )
                    audio_buffer = bytearray()

            except json.JSONDecodeError:
                # If it's not JSON, try to treat it as raw audio bytes
                try:
                    # Try to decode as base64 audio data
                    if isinstance(data, str) and data.startswith("data:audio"):
                        # Handle base64 encoded audio
                        audio_b64 = data.split(",")[1]
                        import base64

                        audio_bytes = base64.b64decode(audio_b64)
                        audio_buffer.extend(audio_bytes)
                        logger.info(f"Received {len(audio_bytes)} bytes of audio")
                except Exception as e:
                    logger.error(f"Error processing audio data: {e}")

    except WebSocketDisconnect:
        logger.info("Client disconnected")

    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        try:
            await websocket.send_json(
                {
                    "status": "error",
                    "error": str(e),
                }
            )
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
