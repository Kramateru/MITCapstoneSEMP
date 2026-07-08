"""
Legacy entry point for retired trainer-facing microlearning demo data.

This script is retained only to make the deprecation explicit.

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
    raise RuntimeError(
        "Microlearning demo seeding has been retired. "
        "Create trainer-owned categories, modules, and assignments from the application instead."
    )


if __name__ == "__main__":
    seed()
