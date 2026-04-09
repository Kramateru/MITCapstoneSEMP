import asyncio
import json
import logging
import os
import sys
from io import BytesIO
from pathlib import Path
from typing import Optional

# Configure logging early for import error handling
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    import azure.cognitiveservices.speech as speechsdk
    from azure.cognitiveservices.speech import (
        PronunciationAssessmentConfig,
        PronunciationAssessmentGradingSystem,
        PronunciationAssessmentGranularity,
    )

    AZURE_AVAILABLE = True
except ImportError as e:
    speechsdk = None
    PronunciationAssessmentConfig = None
    PronunciationAssessmentGradingSystem = None
    PronunciationAssessmentGranularity = None
    AZURE_AVAILABLE = False
    logger.warning(f"Azure Speech SDK not available: {e}. Pronunciation features disabled.")
except Exception as e:
    speechsdk = None
    PronunciationAssessmentConfig = None
    PronunciationAssessmentGradingSystem = None
    PronunciationAssessmentGranularity = None
    AZURE_AVAILABLE = False
    logger.error(f"Failed to initialize Azure Speech SDK: {e}. Pronunciation features disabled.", exc_info=True)

try:
    import google.genai as genai

    GEMINI_AVAILABLE = True
except ImportError as e:
    genai = None
    GEMINI_AVAILABLE = False
    logger.warning(f"Google GenAI SDK not available: {e}. Gemini features disabled.")
except Exception as e:
    genai = None
    GEMINI_AVAILABLE = False
    logger.error(f"Failed to initialize Google GenAI SDK: {e}. Gemini features disabled.", exc_info=True)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

try:
    from .env_loader import load_backend_environment, use_local_sqlite
except ImportError:
    from env_loader import load_backend_environment, use_local_sqlite

# Load environment variables using the shared backend resolution order.
load_backend_environment()
MEDIA_ROOT = Path(__file__).resolve().parent.parent / "media"
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

# Configure logging early for import error handling
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def validate_environment():
    """Validate all required environment variables exist and are properly configured"""
    required = {
        'SECRET_KEY': 'JWT signing key (must be >= 32 characters, not default)',
        'BACKEND_URL': 'Backend public URL for CORS',
    }

    if not use_local_sqlite():
        required['DATABASE_URL'] = 'PostgreSQL/Supabase database URL'
        required['SUPABASE_URL'] = 'Supabase project URL'
        required['SUPABASE_SERVICE_KEY'] = 'Supabase service account key'

    missing = []
    for var, description in required.items():
        if not os.getenv(var):
            missing.append(f"{var}: {description}")

    if missing:
        error_msg = "Missing required environment variables:\n" + "\n".join(missing)
        logger.error(error_msg)
        raise RuntimeError(error_msg)

    # Validate SECRET_KEY strength
    secret_key = os.getenv('SECRET_KEY')
    if secret_key == 'your-secret-key-change-in-production':
        raise RuntimeError("SECRET_KEY must be changed from default in production!")
    if len(secret_key) < 32:
        raise RuntimeError("SECRET_KEY must be at least 32 characters for security")

    # Validate URLs
    from urllib.parse import urlparse

    backend_url = os.getenv('BACKEND_URL')
    try:
        urlparse(backend_url)
    except Exception as e:
        raise RuntimeError(f"Invalid BACKEND_URL format: {e}")

    if not use_local_sqlite():
        supabase_url = os.getenv('SUPABASE_URL')
        try:
            urlparse(supabase_url)
        except Exception as e:
            raise RuntimeError(f"Invalid SUPABASE_URL format: {e}")

    logger.info("✓ Environment validation passed")


# Validate environment before starting
validate_environment()

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
    assessment_management_routes,
    microlearning_routes,
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
    sim_floor_routes,
    sim_floor_recordings,
)
from backend.database import Base, engine, SessionLocal
from backend.services.lob_catalog import (
    migrate_legacy_lob_references,
    sync_default_lob_catalog,
)
from backend.services.speech_pipeline import (
    SpeechPipelineController,
    SpeechPipelineError,
)

app = FastAPI(
    title="Speech-Enabled BPO Platform",
    description="Comprehensive BPO training platform with speech assessment",
    version="2.0.0",
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
        "lob": "VARCHAR(100)",
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

    empty_json_literal = (
        "'{}'::jsonb" if engine.dialect.name == "postgresql" else "'{}'"
    )

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


def ensure_supabase_realtime_publication() -> None:
    """Register realtime-dependent tables in the Supabase publication when available."""
    if engine.dialect.name != "postgresql":
        return

    desired_tables = {
        "sim_session",
        "certificate_record",
        "coaching_log",
        "sim_floor_assignment",
    }

    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        publishable_tables = sorted(desired_tables.intersection(existing_tables))
        if not publishable_tables:
            return

        with engine.begin() as connection:
            publication_exists = connection.execute(
                text("select 1 from pg_publication where pubname = 'supabase_realtime'")
            ).first()
            if not publication_exists:
                logger.info("Supabase realtime publication not found; skipping publication sync")
                return

            existing_publication_tables = {
                row.tablename
                for row in connection.execute(
                    text(
                        "select tablename from pg_publication_tables "
                        "where pubname = 'supabase_realtime' and schemaname = 'public'"
                    )
                )
            }

            for table_name in publishable_tables:
                if table_name in existing_publication_tables:
                    continue
                connection.execute(
                    text(f"alter publication supabase_realtime add table public.{table_name}")
                )

        logger.info(
            "Ensured Supabase realtime publication includes: %s",
            ", ".join(publishable_tables),
        )
    except Exception:
        logger.exception("Unable to synchronize Supabase realtime publication")


ensure_supabase_realtime_publication()


def ensure_microlearning_assessment_schema() -> None:
    """Backfill microlearning module columns for existing databases."""
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
    except Exception:
        logger.exception("Unable to inspect microlearning tables for schema backfill")
        return

    if "microlearning_module" not in existing_tables:
        return

    current_columns = {
        column["name"] for column in inspector.get_columns("microlearning_module")
    }
    json_definition = (
        "JSONB DEFAULT '{}'::jsonb"
        if engine.dialect.name == "postgresql"
        else "JSON DEFAULT '{}'"
    )
    empty_json_literal = (
        "'{}'::jsonb" if engine.dialect.name == "postgresql" else "'{}'"
    )

    statements = []
    if "type" not in current_columns:
        statements.append(
            text(
                "ALTER TABLE microlearning_module "
                "ADD COLUMN type VARCHAR(50) DEFAULT 'video'"
            )
        )
    if "content_data" not in current_columns:
        statements.append(
            text(
                "ALTER TABLE microlearning_module "
                f"ADD COLUMN content_data {json_definition}"
            )
        )
    if "passing_score" not in current_columns:
        statements.append(
            text(
                "ALTER TABLE microlearning_module "
                "ADD COLUMN passing_score INTEGER DEFAULT 75"
            )
        )
    if "assessment_method_id" not in current_columns:
        statements.append(
            text(
                "ALTER TABLE microlearning_module "
                "ADD COLUMN assessment_method_id VARCHAR(36)"
            )
        )

    if not statements:
        return

    try:
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(statement)
            connection.execute(
                text(
                    "UPDATE microlearning_module SET "
                    "type = COALESCE(type, 'video'), "
                    f"content_data = COALESCE(content_data, {empty_json_literal}), "
                    "passing_score = COALESCE(passing_score, 75)"
                )
            )
        logger.info("Applied microlearning module schema backfill")
    except Exception:
        logger.exception("Failed to backfill microlearning module schema")


def ensure_microlearning_assignment_schema() -> None:
    """Backfill certificate_id column for microlearning assignments."""
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
    except Exception:
        logger.exception("Unable to inspect microlearning tables for assignment schema backfill")
        return

    if "microlearning_assignment" not in existing_tables:
        return

    try:
        current_columns = {
            column["name"] for column in inspector.get_columns("microlearning_assignment")
        }
    except Exception:
        logger.exception("Unable to inspect microlearning_assignment columns for schema backfill")
        return

    if "certificate_id" in current_columns:
        return

    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE microlearning_assignment "
                    "ADD COLUMN certificate_id VARCHAR(36)"
                )
            )
        logger.info("Applied microlearning assignment certificate_id schema backfill")
    except Exception:
        logger.exception("Failed to backfill microlearning assignment certificate_id column")


def ensure_microlearning_topic_category_schema() -> None:
    """Backfill topic category linkage for microlearning modules."""
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
    except Exception:
        logger.exception("Unable to inspect microlearning tables for topic category backfill")
        return

    if "microlearning_module" not in existing_tables:
        return

    try:
        current_columns = {
            column["name"] for column in inspector.get_columns("microlearning_module")
        }
    except Exception:
        logger.exception("Unable to inspect microlearning_module columns for topic category backfill")
        return

    if "topic_category_id" in current_columns:
        return

    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE microlearning_module "
                    "ADD COLUMN topic_category_id VARCHAR(36)"
                )
            )
        logger.info("Applied microlearning topic category schema backfill")
    except Exception:
        logger.exception("Failed to backfill microlearning topic category schema")


ensure_microlearning_assessment_schema()
ensure_microlearning_assignment_schema()
ensure_microlearning_topic_category_schema()


def ensure_user_dismissed_notifications_column() -> None:
    """Backfill dismissed_notifications column for existing databases."""
    try:
        inspector = inspect(engine)
        existing_columns = {column["name"] for column in inspector.get_columns("user")}
    except Exception:
        logger.exception(
            "Unable to inspect user table for dismissed_notifications migration"
        )
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
                text(
                    f'ALTER TABLE "user" ADD COLUMN dismissed_notifications {json_definition}'
                )
            )
        logger.info("Applied user dismissed_notifications schema backfill")
    except Exception:
        logger.exception("Failed to backfill dismissed_notifications column")


ensure_user_dismissed_notifications_column()


def ensure_batch_schema() -> None:
    """Backfill batch columns used by trainer assignment workflows."""
    try:
        inspector = inspect(engine)
        existing_columns = {column["name"] for column in inspector.get_columns("batch")}
    except Exception:
        logger.exception("Unable to inspect batch table for schema backfill")
        return

    statements = []
    if "is_active" not in existing_columns:
        statements.append(
            text('ALTER TABLE "batch" ADD COLUMN is_active BOOLEAN DEFAULT TRUE')
        )
    if "start_date" not in existing_columns:
        statements.append(
            text('ALTER TABLE "batch" ADD COLUMN start_date DATE')
        )
    if "end_date" not in existing_columns:
        statements.append(
            text('ALTER TABLE "batch" ADD COLUMN end_date DATE')
        )

    if not statements:
        return

    try:
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(statement)
            connection.execute(
                text('UPDATE "batch" SET is_active = COALESCE(is_active, TRUE)')
            )
        logger.info("Applied batch schema backfill")
    except Exception:
        logger.exception("Failed to backfill batch schema")


ensure_batch_schema()


def ensure_sim_floor_session_schema() -> None:
    """Backfill Sim Floor session columns for existing databases."""
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
    except Exception:
        logger.exception("Unable to inspect Sim Floor tables for schema backfill")
        return

    if "sim_session" not in existing_tables:
        return

    try:
        existing_columns = {
            column["name"] for column in inspector.get_columns("sim_session")
        }
    except Exception:
        logger.exception("Unable to inspect sim_session columns for schema backfill")
        return

    json_definition = (
        "JSONB DEFAULT '[]'::jsonb"
        if engine.dialect.name == "postgresql"
        else "JSON DEFAULT '[]'"
    )
    json_object_definition = (
        "JSONB DEFAULT '{}'::jsonb"
        if engine.dialect.name == "postgresql"
        else "JSON DEFAULT '{}'"
    )

    statements = []
    if "coaching_notes" not in existing_columns:
        statements.append(
            text("ALTER TABLE sim_session ADD COLUMN coaching_notes TEXT")
        )
    if "transcript_log" not in existing_columns:
        statements.append(
            text(f"ALTER TABLE sim_session ADD COLUMN transcript_log {json_definition}")
        )
    if "turn_logs" not in existing_columns:
        statements.append(
            text(f"ALTER TABLE sim_session ADD COLUMN turn_logs {json_definition}")
        )
    if "trainer_verdict_status" not in existing_columns:
        statements.append(
            text("ALTER TABLE sim_session ADD COLUMN trainer_verdict_status VARCHAR(30) DEFAULT 'pending'")
        )
    if "trainer_verdict_notes" not in existing_columns:
        statements.append(
            text("ALTER TABLE sim_session ADD COLUMN trainer_verdict_notes TEXT")
        )
    if "trainer_evaluated_by" not in existing_columns:
        statements.append(
            text("ALTER TABLE sim_session ADD COLUMN trainer_evaluated_by VARCHAR(36)")
        )
    if "trainer_evaluated_at" not in existing_columns:
        statements.append(
            text("ALTER TABLE sim_session ADD COLUMN trainer_evaluated_at TIMESTAMP")
        )
    if "certificate_id" not in existing_columns:
        statements.append(
            text("ALTER TABLE sim_session ADD COLUMN certificate_id VARCHAR(36)")
        )
    if "sentiment_score" not in existing_columns:
        statements.append(
            text("ALTER TABLE sim_session ADD COLUMN sentiment_score FLOAT")
        )
    if "keyword_compliance" not in existing_columns:
        statements.append(
            text(f"ALTER TABLE sim_session ADD COLUMN keyword_compliance {json_object_definition}")
        )

    if not statements:
        return

    try:
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(statement)
        logger.info("Applied Sim Floor session schema backfill")
    except Exception:
        logger.exception("Failed to backfill Sim Floor session schema")


ensure_sim_floor_session_schema()


def ensure_sim_floor_scenario_schema() -> None:
    """Backfill Scenario and ScenarioFlow fields for multi-turn Sim Floor sessions."""
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
    except Exception:
        logger.exception("Unable to inspect Sim Floor scenario tables for schema backfill")
        return

    json_object_definition = (
        "JSONB DEFAULT '{}'::jsonb"
        if engine.dialect.name == "postgresql"
        else "JSON DEFAULT '{}'"
    )

    try:
        with engine.begin() as connection:
            if "scenario" in existing_tables:
                scenario_columns = {
                    column["name"] for column in inspector.get_columns("scenario")
                }
                scenario_statements = []
                if "member_profile" not in scenario_columns:
                    scenario_statements.append(
                        text(f"ALTER TABLE scenario ADD COLUMN member_profile {json_object_definition}")
                    )
                if "cxone_metadata" not in scenario_columns:
                    scenario_statements.append(
                        text(f"ALTER TABLE scenario ADD COLUMN cxone_metadata {json_object_definition}")
                    )
                if "sim_floor_config" not in scenario_columns:
                    scenario_statements.append(
                        text(f"ALTER TABLE scenario ADD COLUMN sim_floor_config {json_object_definition}")
                    )
                if "ringer_audio_url" not in scenario_columns:
                    scenario_statements.append(
                        text("ALTER TABLE scenario ADD COLUMN ringer_audio_url VARCHAR(500)")
                    )
                if "hold_audio_url" not in scenario_columns:
                    scenario_statements.append(
                        text("ALTER TABLE scenario ADD COLUMN hold_audio_url VARCHAR(500)")
                    )
                for statement in scenario_statements:
                    connection.execute(statement)

            if "scenario_flow" in existing_tables:
                flow_columns = {
                    column["name"] for column in inspector.get_columns("scenario_flow")
                }
                flow_statements = []
                if "speaker_role" not in flow_columns:
                    flow_statements.append(
                        text("ALTER TABLE scenario_flow ADD COLUMN speaker_role VARCHAR(20) DEFAULT 'member'")
                    )
                if "speaker_label" not in flow_columns:
                    flow_statements.append(
                        text("ALTER TABLE scenario_flow ADD COLUMN speaker_label VARCHAR(100)")
                    )
                if "step_metadata" not in flow_columns:
                    flow_statements.append(
                        text(f"ALTER TABLE scenario_flow ADD COLUMN step_metadata {json_object_definition}")
                    )
                for statement in flow_statements:
                    connection.execute(statement)
        logger.info("Applied Sim Floor scenario schema backfill")
    except Exception:
        logger.exception("Failed to backfill Sim Floor scenario schema")


ensure_sim_floor_scenario_schema()


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
    empty_json_literal = (
        "'{}'::jsonb" if engine.dialect.name == "postgresql" else "'{}'"
    )

    certification_columns = {
        "logo_url": "TEXT",
        "manager_signature_url": "TEXT",
        "dry_seal_url": "TEXT",
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
        "source_type": "VARCHAR(30) DEFAULT 'practice_session'",
        "sim_session_id": "VARCHAR(36)",
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
                                f"ALTER TABLE certification_settings ADD COLUMN {name} {definition}"
                            )
                        )
                    elif (
                        engine.dialect.name == "postgresql"
                        and name in {"logo_url", "manager_signature_url", "dry_seal_url"}
                    ):
                        column_info = next(
                            column
                            for column in inspector.get_columns("certification_settings")
                            if column["name"] == name
                        )
                        if "VARCHAR" in str(column_info["type"]).upper():
                            connection.execute(
                                text(
                                    f"ALTER TABLE certification_settings ALTER COLUMN {name} TYPE TEXT"
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
                                f"ALTER TABLE certificate_record ADD COLUMN {name} {definition}"
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
                            text(
                                f"ALTER TABLE coaching_log ADD COLUMN {name} {definition}"
                            )
                        )

                connection.execute(
                    text(
                        "UPDATE coaching_log SET "
                        "source_type = COALESCE(source_type, CASE WHEN sim_session_id IS NOT NULL THEN 'sim_floor_session' ELSE 'practice_session' END), "
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
                logger.info(
                    "LOB catalog sync attempt %s failed; retrying once.", attempt
                )
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

# Ensure admin user exists
def ensure_admin_user():
    from backend.database import SessionLocal
    from backend.models import User, UserRole
    from backend import auth_utils
    from backend.default_credentials import ADMIN_EMAIL, ADMIN_PASSWORD
    
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if not existing:
            admin = User(
                email=ADMIN_EMAIL,
                full_name="Admin User",
                password_hash=auth_utils.hash_password(ADMIN_PASSWORD),
                role=UserRole.ADMIN,
                is_active=True,
                lob="Administration",
                department="Management"
            )
            db.add(admin)
            db.commit()
            logger.info("Admin user created: %s", ADMIN_EMAIL)
        else:
            logger.info("Admin user already exists")
    except Exception as e:
        logger.exception("Failed to ensure admin user: %s", e)
    finally:
        db.close()

ensure_admin_user()

# Add shutdown event to clean up database connections
@app.on_event("shutdown")
def shutdown_event():
    """Clean up database connection pool on shutdown"""
    from backend.database import SessionLocal
    SessionLocal.remove()
    logger.info("Database connection pool cleaned up")

# Include route blueprints
app.include_router(auth_routes.router)
app.include_router(user_routes.router)
app.include_router(scenario_routes.router)
app.include_router(assessment_routes.router)
app.include_router(assessment_management_routes.router)
app.include_router(microlearning_routes.router)
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
app.include_router(sim_floor_routes.router)
app.include_router(sim_floor_recordings.router)

# Azure Speech Configuration
SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "your_key_here")
SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "eastus")
if AZURE_AVAILABLE:
    SPEECH_CONFIG = speechsdk.SpeechConfig(
        subscription=SPEECH_KEY, region=SPEECH_REGION
    )
    SPEECH_CONFIG.speech_recognition_language = "en-US"
else:
    SPEECH_CONFIG = None

VOICE_PIPELINE_CONTROLLER = SpeechPipelineController()


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
    """WebSocket endpoint for the voice controller pipeline."""
    await websocket.accept()
    logger.info("Client connected to speech endpoint")

    try:
        await websocket.send_json(
            {
                "status": "ready",
                "pipeline": {
                    "stages": ["audio_in", "asr", "processing", "tts", "audio_out"],
                    "supports_audio_output": VOICE_PIPELINE_CONTROLLER.tts_engine.is_available(),
                    "processor_uses_gemini": bool(os.getenv("GEMINI_API_KEY")),
                },
            }
        )

        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                logger.error("Invalid JSON received")
                await websocket.send_json(
                    {"status": "error", "error": "Invalid JSON payload."}
                )
                continue

            message_type = str(message.get("type") or "").strip().lower()
            history = message.get("history")
            history_payload = history if isinstance(history, list) else None

            raw_context_hint = (
                message.get("context_hint")
                or message.get("context")
                or message.get("prompt")
            )
            context_hint = (
                raw_context_hint.strip()
                if isinstance(raw_context_hint, str) and raw_context_hint.strip()
                else None
            )
            voice_name = (
                message.get("voice_name")
                if isinstance(message.get("voice_name"), str)
                else None
            )
            user_dialect = (
                message.get("user_dialect")
                if isinstance(message.get("user_dialect"), str)
                else None
            )
            fallback_transcript = (
                message.get("fallback_transcript")
                if isinstance(message.get("fallback_transcript"), str)
                else None
            )
            synthesize = message.get("synthesize", True) is not False

            try:
                if message_type == "audio":
                    audio_data = message.get("audio")
                    if not isinstance(audio_data, str) or not audio_data.strip():
                        await websocket.send_json(
                            {
                                "status": "error",
                                "error": "Audio messages must include a base64 audio payload in 'audio'.",
                            }
                        )
                        continue

                    await websocket.send_json(
                        {"status": "processing", "stage": "asr"}
                    )
                    result = await asyncio.to_thread(
                        VOICE_PIPELINE_CONTROLLER.process_audio_turn,
                        encoded_audio=audio_data,
                        mime_type=(
                            message.get("mime_type")
                            if isinstance(message.get("mime_type"), str)
                            else "audio/webm"
                        ),
                        context_hint=context_hint,
                        history=history_payload,
                        synthesize=synthesize,
                        voice_name=voice_name,
                        fallback_transcript=fallback_transcript,
                        user_dialect=user_dialect,
                    )

                    await websocket.send_json(
                        {
                            "status": "response",
                            "transcript": result["transcript"],
                            "text": result["reply_text"],
                            "audio": result["audio_base64"],
                            "audio_mime_type": result["audio_mime_type"],
                            "pipeline": result["pipeline"],
                        }
                    )
                elif message_type == "text":
                    text = message.get("text")
                    if not isinstance(text, str) or not text.strip():
                        await websocket.send_json(
                            {
                                "status": "error",
                                "error": "Text messages must include a non-empty 'text' value.",
                            }
                        )
                        continue

                    await websocket.send_json(
                        {"status": "processing", "stage": "processing"}
                    )
                    result = await asyncio.to_thread(
                        VOICE_PIPELINE_CONTROLLER.process_text_turn,
                        text=text,
                        context_hint=context_hint,
                        history=history_payload,
                        synthesize=synthesize,
                        voice_name=voice_name,
                    )

                    await websocket.send_json(
                        {
                            "status": "response",
                            "transcript": result["transcript"],
                            "text": result["reply_text"],
                            "audio": result["audio_base64"],
                            "audio_mime_type": result["audio_mime_type"],
                            "pipeline": result["pipeline"],
                        }
                    )
                else:
                    await websocket.send_json(
                        {
                            "status": "error",
                            "error": "Unsupported message type. Use 'audio' or 'text'.",
                        }
                    )
            except SpeechPipelineError as exc:
                logger.warning("Speech pipeline error: %s", exc)
                await websocket.send_json({"status": "error", "error": str(exc)})

    except WebSocketDisconnect:
        logger.info("Client disconnected")

    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        try:
            await websocket.send_json({"status": "error", "error": str(e)})
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
