"""
Seed the active database with the default BPO microlearning pack only.

Run with the desired DATABASE_URL already loaded. In this repo, that means:
- local SQLite for local verification
- Supabase Postgres when using the root .env value

Optional environment variables:
- MICROLEARNING_TRAINER_ID
- MICROLEARNING_TRAINER_EMAIL
"""

import os

from sqlalchemy import inspect, text

from .database import Base, SessionLocal, engine
from .default_credentials import TRAINER_EMAIL, TRAINER_PASSWORD
from .models import User, UserRole
from .routes.admin_routes import _ensure_user
from .seed_supabase import _ensure_certification_schema
from .services.microlearning_catalog import seed_bpo_microlearning_library


def _ensure_microlearning_schema() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    json_definition = (
        "JSONB DEFAULT '{}'::jsonb"
        if engine.dialect.name == "postgresql"
        else "JSON DEFAULT '{}'"
    )
    empty_json_literal = "'{}'::jsonb" if engine.dialect.name == "postgresql" else "'{}'"

    with engine.begin() as connection:
        if "microlearning_module" in existing_tables:
            module_columns = {
                column["name"] for column in inspector.get_columns("microlearning_module")
            }
            if "type" not in module_columns:
                connection.execute(
                    text(
                        "ALTER TABLE microlearning_module "
                        "ADD COLUMN type VARCHAR(50) DEFAULT 'video'"
                    )
                )
            if "content_data" not in module_columns:
                connection.execute(
                    text(
                        "ALTER TABLE microlearning_module "
                        f"ADD COLUMN content_data {json_definition}"
                    )
                )
            if "passing_score" not in module_columns:
                connection.execute(
                    text(
                        "ALTER TABLE microlearning_module "
                        "ADD COLUMN passing_score INTEGER DEFAULT 75"
                    )
                )
            if "topic_category_id" not in module_columns:
                connection.execute(
                    text(
                        "ALTER TABLE microlearning_module "
                        "ADD COLUMN topic_category_id VARCHAR(36)"
                    )
                )
            connection.execute(
                text(
                    "UPDATE microlearning_module SET "
                    "type = COALESCE(type, 'video'), "
                    f"content_data = COALESCE(content_data, {empty_json_literal}), "
                    "passing_score = COALESCE(passing_score, 75)"
                )
            )

        if "microlearning_assignment" in existing_tables:
            assignment_columns = {
                column["name"]
                for column in inspector.get_columns("microlearning_assignment")
            }
            if "certificate_id" not in assignment_columns:
                connection.execute(
                    text(
                        "ALTER TABLE microlearning_assignment "
                        "ADD COLUMN certificate_id VARCHAR(36)"
                    )
                )


def _resolve_target_trainer(db):
    trainer_id = (os.getenv("MICROLEARNING_TRAINER_ID") or "").strip()
    trainer_email = (os.getenv("MICROLEARNING_TRAINER_EMAIL") or TRAINER_EMAIL).strip().lower()

    trainer = None
    created = False

    if trainer_id:
        trainer = db.query(User).filter(User.id == trainer_id).first()
        if not trainer:
            raise RuntimeError(f"Trainer with id '{trainer_id}' was not found.")
    elif trainer_email:
        trainer = db.query(User).filter(User.email == trainer_email).first()

    if trainer:
        if trainer.role != UserRole.TRAINER:
            raise RuntimeError(
                f"User '{trainer.email}' exists but is not a trainer account."
            )
        return trainer, created

    trainer, created = _ensure_user(
        db,
        email=trainer_email or TRAINER_EMAIL,
        full_name="Trainer User",
        role=UserRole.TRAINER,
        password=TRAINER_PASSWORD,
        lob="Customer Service",
        department="Operations",
    )
    db.flush()
    return trainer, created


def seed():
    Base.metadata.create_all(bind=engine)
    _ensure_certification_schema()
    _ensure_microlearning_schema()

    db = SessionLocal()
    try:
        trainer, trainer_created = _resolve_target_trainer(db)
        summary = seed_bpo_microlearning_library(db, trainer_id=trainer.id)
        db.commit()

        result = {
            "trainer_id": trainer.id,
            "trainer_email": trainer.email,
            "trainer_created": trainer_created,
            **summary,
        }

        print("Microlearning seed completed.")
        for key, value in result.items():
            print(f"{key}: {value}")
        return result
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
