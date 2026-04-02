"""
Seed the active database with the trainer-owned sample dataset.

Run with the desired DATABASE_URL already loaded. In this repo, that means:
- local SQLite for local verification
- Supabase Postgres when using the root .env value
"""

from sqlalchemy import inspect, text

from .database import Base, SessionLocal, engine
from .default_credentials import ADMIN_EMAIL, ADMIN_PASSWORD
from .models import Batch, CoachingLog, Course, MCQAssessment, MCQCategory, User, UserRole, Workspace
from .routes.admin_routes import _ensure_user, _seed_sample_dataset
from .services.mcq_samples import ensure_trainer_language_assessment_samples
from .services.workspace_seed import seed_workspace_library


def _ensure_user_settings_columns() -> None:
    inspector = inspect(engine)
    existing_columns = {column["name"] for column in inspector.get_columns("user")}
    if not existing_columns:
        return

    column_definitions = {
        "sidebar_state": "VARCHAR(20) DEFAULT 'default'",
        "big_font_scale": "FLOAT DEFAULT 1.0",
        "daltonism_mode": "VARCHAR(20) DEFAULT 'none'",
        "ui_preferences": "JSONB DEFAULT '{}'::jsonb"
        if engine.dialect.name == "postgresql"
        else "JSON DEFAULT '{}'",
    }
    empty_json_literal = "'{}'::jsonb" if engine.dialect.name == "postgresql" else "'{}'"

    with engine.begin() as connection:
        for name, definition in column_definitions.items():
            if name not in existing_columns:
                connection.execute(text(f'ALTER TABLE "user" ADD COLUMN {name} {definition}'))

        connection.execute(
            text(
                'UPDATE "user" SET '
                "sidebar_state = COALESCE(sidebar_state, 'default'), "
                "big_font_scale = COALESCE(big_font_scale, 1.0), "
                "daltonism_mode = COALESCE(daltonism_mode, 'none'), "
                f"ui_preferences = COALESCE(ui_preferences, {empty_json_literal})"
            )
        )


def _ensure_certification_schema() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
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

    with engine.begin() as connection:
        if "certification_settings" in existing_tables:
            current_columns = {
                column["name"]
                for column in inspector.get_columns("certification_settings")
            }
            for name, definition in certification_columns.items():
                if name not in current_columns:
                    connection.execute(
                        text(f"ALTER TABLE certification_settings ADD COLUMN {name} {definition}")
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
                column["name"] for column in inspector.get_columns("certificate_record")
            }
            for name, definition in certificate_record_columns.items():
                if name not in current_columns:
                    connection.execute(
                        text(f"ALTER TABLE certificate_record ADD COLUMN {name} {definition}")
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


def seed(reset_sample_scenarios: bool = False) -> dict:
    Base.metadata.create_all(bind=engine)
    _ensure_user_settings_columns()
    _ensure_certification_schema()

    db = SessionLocal()
    try:
        admin_user, _ = _ensure_user(
            db,
            email=ADMIN_EMAIL,
            full_name="Admin User",
            role=UserRole.ADMIN,
            password=ADMIN_PASSWORD,
            lob="Customer Service",
            department="Management",
            language_dialect="en-US",
        )
        db.commit()

        result = _seed_sample_dataset(
            db,
            admin_user=admin_user,
            reset_sample_scenarios=reset_sample_scenarios,
        )

        sample_bank_summary = {
            "created_categories": 0,
            "updated_categories": 0,
            "created_questions": 0,
            "updated_questions": 0,
        }
        workspace_summary = {
            "created_workspaces": 0,
            "seeded_workspaces": 0,
            "seeded_empathy_statements": 0,
            "seeded_probing_questions": 0,
            "seeded_forbidden_words": 0,
            "seeded_required_keywords": 0,
        }
        sample_trainers = (
            db.query(User)
            .filter(User.role == UserRole.TRAINER, User.is_active == True)
            .order_by(User.created_at.asc())
            .all()
        )
        for trainer in sample_trainers:
            trainer_summary = ensure_trainer_language_assessment_samples(
                db,
                trainer_id=trainer.id,
            )
            for key in sample_bank_summary:
                sample_bank_summary[key] += int(trainer_summary.get(key, 0))

            workspace = (
                db.query(Workspace)
                .filter(Workspace.trainer_id == trainer.id)
                .order_by(Workspace.created_at.asc())
                .first()
            )
            if not workspace:
                workspace = Workspace(
                    name="Trainer Workspace",
                    trainer_id=trainer.id,
                    empathy_statements=[],
                    probing_questions=[],
                    forbidden_words=[],
                    required_keywords=[],
                )
                db.add(workspace)
                db.flush()
                workspace_summary["created_workspaces"] += 1

            seeded_counts = seed_workspace_library(
                workspace,
                added_by_user_id=trainer.id,
                force=True,
            )
            if seeded_counts["changed"]:
                workspace_summary["seeded_workspaces"] += 1
                workspace_summary["seeded_empathy_statements"] += int(
                    seeded_counts["seeded_empathy_statements"]
                )
                workspace_summary["seeded_probing_questions"] += int(
                    seeded_counts["seeded_probing_questions"]
                )
                workspace_summary["seeded_forbidden_words"] += int(
                    seeded_counts["seeded_forbidden_words"]
                )
                workspace_summary["seeded_required_keywords"] += int(
                    seeded_counts["seeded_required_keywords"]
                )

        db.commit()
        result["summary"].update(
            {
                "trainer_mcq_sample_categories_created": sample_bank_summary["created_categories"],
                "trainer_mcq_sample_categories_updated": sample_bank_summary["updated_categories"],
                "trainer_mcq_sample_questions_created": sample_bank_summary["created_questions"],
                "trainer_mcq_sample_questions_updated": sample_bank_summary["updated_questions"],
                "trainer_workspaces_created": workspace_summary["created_workspaces"],
                "trainer_workspaces_seeded": workspace_summary["seeded_workspaces"],
                "workspace_empathy_statements_seeded": workspace_summary["seeded_empathy_statements"],
                "workspace_probing_questions_seeded": workspace_summary["seeded_probing_questions"],
                "workspace_forbidden_words_seeded": workspace_summary["seeded_forbidden_words"],
                "workspace_required_keywords_seeded": workspace_summary["seeded_required_keywords"],
            }
        )

        print("Seed complete.")
        print("Summary:")
        for key, value in result["summary"].items():
            print(f"  {key}: {value}")

        print("Credentials:")
        for role, credential in result["credentials"].items():
            print(f"  {role}: {credential['email']} / {credential['password']}")

        print("Ownership:")
        trainer_emails = [
            "trainer@st.peterville.edu.ph",
            "trainer2@st.peterville.edu.ph",
        ]
        for trainer_email in trainer_emails:
            trainer = db.query(User).filter(User.email == trainer_email).first()
            if not trainer:
                continue

            print(f"  {trainer_email}")
            batches = (
                db.query(Batch)
                .filter(Batch.created_by == trainer.id)
                .order_by(Batch.wave_number.asc(), Batch.name.asc())
                .all()
            )
            for batch in batches:
                trainees = sorted(
                    user.email
                    for user in batch.users
                    if user.role == UserRole.TRAINEE
                )
                print(f"    batch: {batch.name} -> {trainees}")

            courses = (
                db.query(Course)
                .filter(Course.created_by == trainer.id)
                .order_by(Course.name.asc())
                .all()
            )
            print(f"    courses: {[course.name for course in courses]}")

            assessments = (
                db.query(MCQAssessment)
                .filter(MCQAssessment.assigned_by == trainer.id)
                .order_by(MCQAssessment.title.asc())
                .all()
            )
            print(f"    assessments: {[assessment.title for assessment in assessments]}")
            trainer_categories = (
                db.query(MCQCategory)
                .filter(MCQCategory.created_by == trainer.id, MCQCategory.is_active == True)
                .order_by(MCQCategory.name.asc())
                .all()
            )
            print(f"    mcq_categories: {[category.name for category in trainer_categories]}")

            workspace = (
                db.query(Workspace)
                .filter(Workspace.trainer_id == trainer.id)
                .order_by(Workspace.created_at.asc())
                .first()
            )
            if workspace:
                print(
                    "    workspace_library: "
                    f"empathy={len(workspace.empathy_statements or [])}, "
                    f"probing={len(workspace.probing_questions or [])}, "
                    f"forbidden={len(workspace.forbidden_words or [])}, "
                    f"required_keywords={len(workspace.required_keywords or [])}"
                )

            coaching_logs = (
                db.query(CoachingLog)
                .filter(CoachingLog.trainer_id == trainer.id)
                .count()
            )
            print(f"    coaching_logs: {coaching_logs}")

        return result
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
