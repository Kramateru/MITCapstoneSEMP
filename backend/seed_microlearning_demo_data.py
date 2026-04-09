"""
Seed trainer-facing microlearning demo data for a selected batch.

This script is idempotent:
- seeds the default 10-module trainer library
- assigns a configurable subset of modules to one trainer batch
- creates sample trainee attempts so trainer and trainee reports show scores

Optional environment variables:
- MICROLEARNING_TRAINER_ID
- MICROLEARNING_TRAINER_EMAIL
- MICROLEARNING_BATCH_ID
- MICROLEARNING_BATCH_NAME
- MICROLEARNING_TRAINEE_EMAIL
- MICROLEARNING_ASSIGNMENT_COUNT (default: 3)
"""

from __future__ import annotations

import os
from typing import Any, Optional

from .database import Base, SessionLocal, engine
from .models import Batch, MicrolearningAssignment, MicrolearningModule, User, UserRole
from .seed_microlearning import _ensure_microlearning_schema, _resolve_target_trainer
from .seed_supabase import _ensure_certification_schema
from .services.microlearning import (
    ensure_module_exercises,
    evaluate_exercise_submission,
    refresh_assignment_progress,
)
from .services.microlearning_catalog import (
    BPO_MICROLEARNING_LIBRARY,
    seed_bpo_microlearning_library,
)


def _resolve_target_batch(db, *, trainer_id: str) -> Batch:
    batch_id = (os.getenv("MICROLEARNING_BATCH_ID") or "").strip()
    batch_name = (os.getenv("MICROLEARNING_BATCH_NAME") or "").strip().lower()

    query = db.query(Batch).filter(Batch.created_by == trainer_id)

    batch: Optional[Batch] = None
    if batch_id:
        batch = query.filter(Batch.id == batch_id).first()
    elif batch_name:
        candidates = query.all()
        batch = next((row for row in candidates if (row.name or "").strip().lower() == batch_name), None)
    else:
        candidates = query.order_by(Batch.wave_number.asc(), Batch.name.asc()).all()
        batch = next(
            (
                row
                for row in candidates
                if any(user.role == UserRole.TRAINEE for user in (row.users or []))
            ),
            None,
        )

    if not batch:
        raise RuntimeError("No trainer-owned batch with trainees was found for demo seeding.")

    return batch


def _resolve_batch_trainees(batch: Batch) -> list[User]:
    trainees = [user for user in (batch.users or []) if user.role == UserRole.TRAINEE]
    if not trainees:
        raise RuntimeError("The selected batch has no trainee users.")
    return trainees


def _resolve_primary_trainee(batch_trainees: list[User]) -> User:
    trainee_email = (os.getenv("MICROLEARNING_TRAINEE_EMAIL") or "").strip().lower()
    if trainee_email:
        for trainee in batch_trainees:
            if (trainee.email or "").strip().lower() == trainee_email:
                return trainee
        raise RuntimeError(
            f"Trainee '{trainee_email}' was not found in the selected batch."
        )
    return batch_trainees[0]


def _selected_module_titles(limit: int) -> list[str]:
    ordered_titles = [definition["title"] for definition in BPO_MICROLEARNING_LIBRARY]
    return ordered_titles[: max(1, limit)]


def _load_trainer_modules(
    db,
    *,
    trainer_id: str,
    titles: list[str],
) -> list[MicrolearningModule]:
    modules = (
        db.query(MicrolearningModule)
        .filter(
            MicrolearningModule.created_by == trainer_id,
            MicrolearningModule.is_active == True,
        )
        .all()
    )
    module_by_title = {(module.title or "").strip().lower(): module for module in modules}
    resolved: list[MicrolearningModule] = []
    for title in titles:
        module = module_by_title.get(title.strip().lower())
        if not module:
            raise RuntimeError(f"Seeded module '{title}' was not found for the target trainer.")
        resolved.append(module)
    return resolved


def _ensure_assignment(
    db,
    *,
    module: MicrolearningModule,
    trainee: User,
    trainer_id: str,
    batch_id: str,
) -> tuple[MicrolearningAssignment, bool]:
    assignment = (
        db.query(MicrolearningAssignment)
        .filter(
            MicrolearningAssignment.module_id == module.id,
            MicrolearningAssignment.trainee_id == trainee.id,
            MicrolearningAssignment.assigned_by == trainer_id,
        )
        .first()
    )
    created = False
    if assignment:
        assignment.batch_id = batch_id
        assignment.is_mandatory = True
        assignment.notes = assignment.notes or "Seeded microlearning demo assignment."
        return assignment, created

    assignment = MicrolearningAssignment(
        module_id=module.id,
        trainee_id=trainee.id,
        assigned_by=trainer_id,
        batch_id=batch_id,
        is_mandatory=True,
        notes="Seeded microlearning demo assignment.",
        responses={},
    )
    assignment.module = module
    refresh_assignment_progress(assignment)
    db.add(assignment)
    created = True
    return assignment, created


def _build_sample_attempt(exercise: dict[str, Any]) -> dict[str, Any]:
    if (exercise.get("type") or "").strip().lower() == "multiple_choice":
        return evaluate_exercise_submission(
            exercise,
            response_text=None,
            selected_option=exercise.get("correct_option"),
            input_mode="selection",
        )

    response_text = (
        exercise.get("sample_answer")
        or " ".join(exercise.get("required_keywords") or [])
        or "Sample response saved."
    )
    return evaluate_exercise_submission(
        exercise,
        response_text=response_text,
        selected_option=None,
        input_mode="typed",
    )


def _seed_assignment_attempts(
    assignment: MicrolearningAssignment,
    *,
    complete_all: bool,
) -> bool:
    module = assignment.module
    if not module:
        return False

    ensure_module_exercises(module)
    exercises = list(module.exercises or [])
    if not exercises:
        return False

    existing_responses = dict(assignment.responses or {})
    if complete_all and len(existing_responses) >= len(exercises):
        refresh_assignment_progress(assignment)
        return False

    if not complete_all and existing_responses:
        refresh_assignment_progress(assignment)
        return False

    selected_exercises = exercises if complete_all else exercises[:1]
    for exercise in selected_exercises:
        existing_responses[exercise["id"]] = _build_sample_attempt(exercise)

    assignment.responses = existing_responses
    refresh_assignment_progress(assignment)
    return True


def seed() -> dict[str, Any]:
    Base.metadata.create_all(bind=engine)
    _ensure_certification_schema()
    _ensure_microlearning_schema()

    db = SessionLocal()
    try:
        trainer, trainer_created = _resolve_target_trainer(db)
        library_summary = seed_bpo_microlearning_library(db, trainer_id=trainer.id)

        batch = _resolve_target_batch(db, trainer_id=trainer.id)
        batch_trainees = _resolve_batch_trainees(batch)
        primary_trainee = _resolve_primary_trainee(batch_trainees)

        assignment_limit = int(os.getenv("MICROLEARNING_ASSIGNMENT_COUNT") or "3")
        modules = _load_trainer_modules(
            db,
            trainer_id=trainer.id,
            titles=_selected_module_titles(assignment_limit),
        )

        assignments_created = 0
        for trainee in batch_trainees:
            for module in modules:
                assignment, created = _ensure_assignment(
                    db,
                    module=module,
                    trainee=trainee,
                    trainer_id=trainer.id,
                    batch_id=batch.id,
                )
                assignments_created += 1 if created else 0

        db.flush()

        sample_attempts_seeded = 0
        primary_assignments = (
            db.query(MicrolearningAssignment)
            .filter(
                MicrolearningAssignment.assigned_by == trainer.id,
                MicrolearningAssignment.trainee_id == primary_trainee.id,
                MicrolearningAssignment.batch_id == batch.id,
            )
            .all()
        )
        assignment_by_module_id = {
            assignment.module_id: assignment for assignment in primary_assignments
        }

        if modules:
            completed_assignment = assignment_by_module_id.get(modules[0].id)
            if completed_assignment and _seed_assignment_attempts(
                completed_assignment,
                complete_all=True,
            ):
                sample_attempts_seeded += 1

        partial_module = next(
            (module for module in modules if len(module.exercises or []) > 1),
            None,
        )
        if partial_module:
            partial_assignment = assignment_by_module_id.get(partial_module.id)
            if partial_assignment and _seed_assignment_attempts(
                partial_assignment,
                complete_all=False,
            ):
                sample_attempts_seeded += 1

        db.commit()

        result = {
            "trainer_email": trainer.email,
            "trainer_created": trainer_created,
            "batch_name": batch.name,
            "batch_id": batch.id,
            "batch_trainee_count": len(batch_trainees),
            "primary_trainee_email": primary_trainee.email,
            "assigned_module_count": len(modules),
            "assignments_created": assignments_created,
            "sample_attempt_sets_seeded": sample_attempts_seeded,
            **library_summary,
        }

        print("Microlearning demo seed completed.")
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
