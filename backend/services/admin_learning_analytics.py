from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, selectinload

from ..models import (
    Batch,
    CertificateRecord,
    MCQAssessment,
    MCQCategory,
    MCQSubmission,
    MicrolearningAssignment,
    MicrolearningModule,
    User,
    UserRole,
)
from .microlearning import (
    filter_current_assignments,
    refresh_assignment_progress,
    serialize_assignment_summary,
)
from .trainer_learning_analytics import (
    _assessment_activity_at,
    _average,
    _bounds_from_dates,
    _build_score_distribution,
    _exercise_filter_key,
    _format_batch_label,
    _in_range,
    _module_activity_at,
    _normalize_text,
    _resolve_primary_batch,
    _to_iso,
    _trainee_matches_batch,
)


def _module_completion_status(status: str) -> str:
    normalized = _normalize_text(status).lower()
    if normalized in {"completed", "certified"}:
        return "completed"
    if normalized == "in_progress":
        return "in_progress"
    return "pending"


def _assessment_completion_status(score_percentage: Optional[float]) -> str:
    return "completed" if score_percentage is not None else "pending"


def _performance_level(score_value: Optional[float]) -> Optional[str]:
    if score_value is None:
        return None
    if score_value >= 90:
        return "excellent"
    if score_value >= 75:
        return "healthy"
    if score_value >= 60:
        return "developing"
    return "at_risk"


def _matches_completion_status(value: str, selected: Optional[str]) -> bool:
    if not selected:
        return True
    return value == selected


def _matches_performance_level(score_value: Optional[float], selected: Optional[str]) -> bool:
    if not selected:
        return True
    return _performance_level(score_value) == selected


def _sorted_unique_names(values: set[str]) -> list[str]:
    return sorted((value for value in values if value), key=lambda value: value.lower())


def _build_admin_ai_analysis(
    *,
    scope_label: str,
    summary: dict[str, Any],
    trainer_rows: list[dict[str, Any]],
    batch_rows: list[dict[str, Any]],
    weakest_modules: list[dict[str, Any]],
    weakest_areas: list[dict[str, Any]],
    exercise_rows: list[dict[str, Any]],
    improvement_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    overall_score = float(summary.get("overall_score") or 0.0)
    completion_rate = float(summary.get("completion_rate") or 0.0)
    pass_rate = float(summary.get("pass_rate") or 0.0)
    average_assessment_score = float(summary.get("average_assessment_score") or 0.0)
    average_exercise_score = float(summary.get("average_exercise_score") or 0.0)

    best_trainer = max(
        trainer_rows,
        key=lambda row: (
            float(row.get("overall_score") or 0.0),
            float(row.get("completion_rate") or 0.0),
            row.get("trainer_name") or "",
        ),
        default=None,
    )
    weakest_trainer = min(
        trainer_rows,
        key=lambda row: (
            float(row.get("overall_score") or 0.0),
            float(row.get("completion_rate") or 0.0),
            row.get("trainer_name") or "",
        ),
        default=None,
    )
    best_batch = max(
        batch_rows,
        key=lambda row: (
            float(row.get("overall_score") or 0.0),
            float(row.get("completion_rate") or 0.0),
            row.get("batch_label") or "",
        ),
        default=None,
    )
    weakest_batch = min(
        batch_rows,
        key=lambda row: (
            float(row.get("overall_score") or 0.0),
            float(row.get("completion_rate") or 0.0),
            row.get("batch_label") or "",
        ),
        default=None,
    )
    weakest_module = weakest_modules[0] if weakest_modules else None
    weakest_area = weakest_areas[0] if weakest_areas else None
    weakest_exercise = exercise_rows[0] if exercise_rows else None
    improvement_focus = improvement_rows[0] if improvement_rows else None

    if average_assessment_score >= average_exercise_score and average_assessment_score >= 80:
        strongest_signal = "assessment retention"
    elif average_exercise_score >= 80:
        strongest_signal = "exercise execution"
    elif completion_rate >= pass_rate:
        strongest_signal = "learning follow-through"
    else:
        strongest_signal = "foundational engagement"

    overview = (
        f"AI Analysis: {scope_label} is currently strongest in {strongest_signal}, with an overall learning score of "
        f"{overall_score:.1f}%, completion at {completion_rate:.1f}%, and pass performance at {pass_rate:.1f}%."
    )

    trainer_effectiveness: list[str] = []
    if best_trainer:
        trainer_effectiveness.append(
            f'{best_trainer["trainer_name"]} is currently leading the trainer cohort with an overall score of '
            f'{float(best_trainer.get("overall_score") or 0.0):.1f}% across '
            f'{int(best_trainer.get("assigned_items") or 0)} tracked learning items.'
        )
    if weakest_trainer and best_trainer and weakest_trainer["trainer_id"] != best_trainer["trainer_id"]:
        trainer_effectiveness.append(
            f'{weakest_trainer["trainer_name"]} is the lowest trainer performer right now, with completion at '
            f'{float(weakest_trainer.get("completion_rate") or 0.0):.1f}% and overall score at '
            f'{float(weakest_trainer.get("overall_score") or 0.0):.1f}%.'
        )
    if not trainer_effectiveness:
        trainer_effectiveness.append(
            "Trainer effectiveness patterns will sharpen as more trainer-owned assignments and trainee results are recorded."
        )

    batch_performance: list[str] = []
    if best_batch:
        batch_performance.append(
            f'{best_batch["batch_label"]} is currently the strongest batch with an overall learning score of '
            f'{float(best_batch.get("overall_score") or 0.0):.1f}% and completion at '
            f'{float(best_batch.get("completion_rate") or 0.0):.1f}%.'
        )
    if weakest_batch and best_batch and weakest_batch["batch_id"] != best_batch["batch_id"]:
        batch_performance.append(
            f'{weakest_batch["batch_label"]} is the weakest batch signal, with pass performance at '
            f'{float(weakest_batch.get("pass_rate") or 0.0):.1f}% and overall score at '
            f'{float(weakest_batch.get("overall_score") or 0.0):.1f}%.'
        )
    if not batch_performance:
        batch_performance.append(
            "Batch comparison insights will expand as more scoped learning records accumulate."
        )

    module_and_assessment: list[str] = []
    if weakest_module:
        module_and_assessment.append(
            f'The weakest module is "{weakest_module["module_title"]}" with completion at '
            f'{float(weakest_module.get("completion_rate") or 0.0):.1f}% and average score at '
            f'{float(weakest_module.get("average_score") or 0.0):.1f}%.'
        )
    if weakest_area:
        module_and_assessment.append(
            f'The weakest assessment area is "{weakest_area["category_name"]}" with average score at '
            f'{float(weakest_area.get("average_score") or 0.0):.1f}% and pass rate at '
            f'{float(weakest_area.get("pass_rate") or 0.0):.1f}%.'
        )
    if not module_and_assessment:
        module_and_assessment.append(
            "Module and assessment performance are currently balanced with no major outlier domain."
        )

    exercise_performance: list[str] = []
    if weakest_exercise:
        exercise_performance.append(
            f'"{weakest_exercise["exercise_title"]}" in "{weakest_exercise["module_title"]}" is the weakest exercise signal, '
            f'with average score at {float(weakest_exercise.get("average_score") or 0.0):.1f}% and completion at '
            f'{float(weakest_exercise.get("completion_rate") or 0.0):.1f}%.'
        )
    if average_exercise_score >= 80:
        exercise_performance.append(
            f'Exercise performance is otherwise healthy at {average_exercise_score:.1f}%, which suggests trainees can apply the trainer-authored practice tasks.'
        )
    elif not weakest_exercise:
        exercise_performance.append(
            "Exercise-level insights will appear after trainees generate more practical attempt data."
        )

    weak_areas: list[str] = []
    if improvement_focus:
        weak_areas.append(
            f'{improvement_focus["trainee_name"]} is the clearest improvement case, with overall score at '
            f'{float(improvement_focus.get("overall_score") or 0.0):.1f}% and completion at '
            f'{float(improvement_focus.get("completion_rate") or 0.0):.1f}%.'
        )
    if completion_rate < 70:
        weak_areas.append(
            "Completion is lagging behind the expected standard, so pending work is a bigger risk than score variance right now."
        )
    if pass_rate < 75:
        weak_areas.append(
            "Pass performance is below the desired benchmark, which suggests current reinforcement is not yet closing the weakest skill gaps."
        )
    if not weak_areas:
        weak_areas.append(
            "There are no major risk clusters yet, but maintaining assignment follow-through will protect the current score profile."
        )

    opportunities: list[str] = []
    if weakest_batch:
        opportunities.append(
            f'Opportunity: focus the next admin review on {weakest_batch["batch_label"]}, where completion and pass performance are both trailing the stronger batches.'
        )
    if weakest_trainer:
        opportunities.append(
            f'Opportunity: review {weakest_trainer["trainer_name"]} assignment pacing, module selection, and assessment follow-up to lift the slower learner cohort.'
        )
    if weakest_module:
        opportunities.append(
            f'Opportunity: revisit "{weakest_module["module_title"]}" for exercise difficulty, clarity, or reinforcement material before the next assignment cycle.'
        )
    if not opportunities:
        opportunities.append(
            "Opportunity: keep expanding the current strongest learning pattern into the next assignment wave while results remain stable."
        )

    recommended_actions: list[str] = []
    if weakest_area:
        recommended_actions.append(
            f'Recommended action: audit the "{weakest_area["category_name"]}" assessment items and align them with coaching and module reinforcement.'
        )
    if weakest_exercise:
        recommended_actions.append(
            f'Recommended action: simplify or better scaffold "{weakest_exercise["exercise_title"]}" and monitor the next attempt cycle before scaling it further.'
        )
    if completion_rate < 70:
        recommended_actions.append(
            "Recommended action: prioritize pending learners and unfinished assignments first, because improved completion will expand the scoring sample and reduce blind spots."
        )
    if pass_rate < 75:
        recommended_actions.append(
            "Recommended action: run a targeted remediation cycle for the weakest batch and trainer combination before issuing another broad assessment wave."
        )
    if not recommended_actions:
        recommended_actions.append(
            "Recommended action: maintain the current pacing, then raise difficulty gradually for the highest-performing batches and trainees."
        )

    return {
        "overview": overview,
        "trainer_effectiveness": trainer_effectiveness[:3],
        "batch_performance": batch_performance[:3],
        "module_and_assessment": module_and_assessment[:3],
        "exercise_performance": exercise_performance[:3],
        "weak_areas": weak_areas[:3],
        "opportunities": opportunities[:4],
        "recommended_actions": recommended_actions[:4],
    }


def build_admin_learning_insights(
    db: Session,
    *,
    trainer_id: Optional[str] = None,
    batch_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
    module_id: Optional[str] = None,
    assessment_id: Optional[str] = None,
    exercise_id: Optional[str] = None,
    completion_status: Optional[str] = None,
    performance_level: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict[str, Any]:
    trainers = (
        db.query(User)
        .filter(User.role == UserRole.TRAINER, User.is_active.is_(True))
        .order_by(User.full_name.asc())
        .all()
    )
    trainer_lookup = {trainer.id: trainer for trainer in trainers}
    if trainer_id and trainer_id not in trainer_lookup:
        raise ValueError("Trainer not found")

    batches = (
        db.query(Batch)
        .filter(Batch.is_active.is_(True))
        .order_by(Batch.wave_number.is_(None), Batch.wave_number.asc(), Batch.name.asc())
        .all()
    )
    batch_lookup = {batch.id: batch for batch in batches}
    if batch_id and batch_id not in batch_lookup:
        raise ValueError("Batch not found")

    trainees = (
        db.query(User)
        .filter(User.role == UserRole.TRAINEE, User.is_active.is_(True))
        .order_by(User.full_name.asc())
        .all()
    )
    trainee_lookup = {trainee.id: trainee for trainee in trainees}
    if trainee_id and trainee_id not in trainee_lookup:
        raise ValueError("Trainee not found")

    trainee_batch_memberships: dict[str, list[Batch]] = defaultdict(list)
    trainer_ids_by_trainee: dict[str, set[str]] = defaultdict(set)
    for batch in batches:
        for batch_trainee in batch.users:
            if batch_trainee.role != UserRole.TRAINEE or not bool(getattr(batch_trainee, "is_active", True)):
                continue
            trainee_batch_memberships[batch_trainee.id].append(batch)
            if batch.created_by:
                trainer_ids_by_trainee[batch_trainee.id].add(batch.created_by)

    modules = (
        db.query(MicrolearningModule)
        .options(selectinload(MicrolearningModule.topic_category))
        .filter(MicrolearningModule.is_active.is_(True))
        .order_by(MicrolearningModule.title.asc())
        .all()
    )
    module_lookup = {module.id: module for module in modules}
    if module_id and module_id not in module_lookup:
        raise ValueError("Module not found")

    exercise_options: list[dict[str, Any]] = []
    exercise_option_lookup: dict[str, dict[str, Any]] = {}
    for module in modules:
        for exercise in module.exercises or []:
            exercise_row_id = _normalize_text(exercise.get("id"))
            if not exercise_row_id:
                continue
            option = {
                "id": _exercise_filter_key(module.id, exercise_row_id),
                "exercise_id": exercise_row_id,
                "title": _normalize_text(exercise.get("title")) or _normalize_text(exercise.get("prompt")) or "Exercise",
                "type": _normalize_text(exercise.get("type")) or "exercise",
                "module_id": module.id,
                "module_title": module.title,
                "created_by": module.created_by,
                "created_by_name": getattr(trainer_lookup.get(module.created_by), "full_name", None),
            }
            exercise_options.append(option)
            exercise_option_lookup[option["id"]] = option
    exercise_options.sort(key=lambda row: (row["module_title"].lower(), row["title"].lower()))
    if exercise_id and exercise_id not in exercise_option_lookup:
        raise ValueError("Exercise not found")

    assessments = (
        db.query(MCQAssessment)
        .filter(MCQAssessment.is_active.is_(True))
        .order_by(MCQAssessment.updated_at.desc(), MCQAssessment.created_at.desc())
        .all()
    )
    assessment_lookup = {assessment.id: assessment for assessment in assessments}
    if assessment_id and assessment_id not in assessment_lookup:
        raise ValueError("Assessment not found")

    category_ids = list({assessment.category_id for assessment in assessments if assessment.category_id})
    categories = (
        db.query(MCQCategory)
        .filter(MCQCategory.id.in_(category_ids))
        .all()
        if category_ids
        else []
    )
    category_lookup = {category.id: category for category in categories}

    assessment_ids = [assessment.id for assessment in assessments]
    submissions = (
        db.query(MCQSubmission)
        .filter(MCQSubmission.assessment_id.in_(assessment_ids or ["__none__"]))
        .all()
        if assessment_ids
        else []
    )
    submissions_by_assessment: dict[str, dict[str, MCQSubmission]] = defaultdict(dict)
    for submission in submissions:
        submissions_by_assessment[submission.assessment_id][submission.trainee_id] = submission
        assessment = assessment_lookup.get(submission.assessment_id)
        if assessment and assessment.assigned_by:
            trainer_ids_by_trainee[submission.trainee_id].add(assessment.assigned_by)

    mcq_certificates = (
        db.query(CertificateRecord)
        .filter(
            CertificateRecord.source_type == "mcq_assessment",
            CertificateRecord.source_id.in_(assessment_ids or ["__none__"]),
        )
        .all()
        if assessment_ids
        else []
    )
    mcq_certificates_by_assessment: dict[str, dict[str, CertificateRecord]] = defaultdict(dict)
    for certificate in mcq_certificates:
        mcq_certificates_by_assessment[certificate.source_id][certificate.trainee_id] = certificate

    module_domain_enabled = not assessment_id or bool(module_id or exercise_id)
    assessment_domain_enabled = not (module_id or exercise_id) or bool(assessment_id)
    start_at, end_at = _bounds_from_dates(start_date, end_date)

    microlearning_assignments = (
        db.query(MicrolearningAssignment)
        .options(
            selectinload(MicrolearningAssignment.module).selectinload(MicrolearningModule.topic_category),
            selectinload(MicrolearningAssignment.batch),
            selectinload(MicrolearningAssignment.trainee).selectinload(User.batches),
            selectinload(MicrolearningAssignment.trainer),
            selectinload(MicrolearningAssignment.certificate),
        )
        .filter(MicrolearningAssignment.trainee_id.in_(list(trainee_lookup.keys()) or ["__none__"]))
        .all()
    )
    microlearning_assignments = filter_current_assignments(microlearning_assignments)

    trainer_ids_by_module: dict[str, set[str]] = defaultdict(set)
    module_assignment_rows: list[dict[str, Any]] = []
    exercise_attempt_rows: list[dict[str, Any]] = []
    recent_activity: list[dict[str, Any]] = []

    for assignment in microlearning_assignments:
        refresh_assignment_progress(assignment)
        summary = serialize_assignment_summary(assignment)
        summary_module_id = _normalize_text(summary.get("module_id"))
        summary_trainee_id = _normalize_text(summary.get("user_id"))
        if not summary_trainee_id or summary_trainee_id not in trainee_lookup:
            continue
        if not module_domain_enabled:
            continue
        if trainee_id and summary_trainee_id != trainee_id:
            continue
        if batch_id and not _trainee_matches_batch(summary_trainee_id, batch_id, trainee_batch_memberships):
            if _normalize_text(summary.get("batch_id")) != batch_id:
                continue
        if module_id and summary_module_id != module_id:
            continue

        module = assignment.module
        module_creator_id = getattr(module, "created_by", None)
        row_trainer_id = assignment.assigned_by or module_creator_id or getattr(assignment.batch, "created_by", None)
        if trainer_id and trainer_id not in {
            row_trainer_id,
            module_creator_id,
            getattr(assignment.batch, "created_by", None),
        }:
            continue

        module_exercises = list(module.exercises or []) if module else []
        exercise_keys = {
            _exercise_filter_key(summary_module_id, _normalize_text(exercise.get("id")))
            for exercise in module_exercises
            if _normalize_text(exercise.get("id"))
        }
        if exercise_id and exercise_id not in exercise_keys:
            continue

        activity_at = _module_activity_at(assignment)
        if (start_at or end_at) and not _in_range(activity_at, start_at, end_at):
            continue

        completion_state = _module_completion_status(_normalize_text(summary.get("status")))
        score_value = float(summary.get("average_score") or 0.0) if int(summary.get("completed_exercises") or 0) > 0 else None
        if not _matches_completion_status(completion_state, completion_status):
            continue
        if not _matches_performance_level(score_value, performance_level):
            continue

        scope_batch = _resolve_primary_batch(
            summary_trainee_id,
            trainee_batch_memberships,
            preferred_batch_id=batch_id or _normalize_text(summary.get("batch_id")) or None,
        )
        row = {
            "id": summary["id"],
            "module_id": summary_module_id,
            "module_title": summary.get("module_title") or summary.get("title"),
            "module_type": summary.get("module_type"),
            "topic_category_name": summary.get("topic_category_name"),
            "trainee_id": summary_trainee_id,
            "trainee_name": summary.get("trainee_name"),
            "batch_id": scope_batch.id if scope_batch else summary.get("batch_id"),
            "batch_label": _format_batch_label(scope_batch) if scope_batch else (summary.get("batch_label") or "Direct Assignment"),
            "status": summary.get("status"),
            "completion_status": completion_state,
            "completion_percentage": float(summary.get("completion_percentage") or 0.0),
            "average_score": float(summary.get("average_score") or 0.0),
            "score_value": score_value,
            "performance_level": _performance_level(score_value),
            "is_passed": bool(summary.get("is_passed")),
            "attempt_number": int(summary.get("attempt_number") or 0),
            "retake_count": int(summary.get("retake_count") or 0),
            "exercise_count": int(summary.get("exercise_count") or 0),
            "completed_exercises": int(summary.get("completed_exercises") or 0),
            "assigned_at": _to_iso(assignment.assigned_at),
            "started_at": _to_iso(assignment.started_at),
            "completed_at": _to_iso(assignment.completed_at),
            "activity_at": _to_iso(activity_at),
            "certificate_id": summary.get("certificate_id"),
            "certificate_no": summary.get("certificate_no"),
            "assigned_by": assignment.assigned_by,
            "assigned_by_name": getattr(trainer_lookup.get(assignment.assigned_by), "full_name", None),
            "module_created_by": module_creator_id,
            "module_created_by_name": getattr(trainer_lookup.get(module_creator_id), "full_name", None),
        }
        module_assignment_rows.append(row)

        if row_trainer_id:
            trainer_ids_by_module[summary_module_id].add(row_trainer_id)
            trainer_ids_by_trainee[summary_trainee_id].add(row_trainer_id)

        if assignment.completed_at:
            recent_activity.append(
                {
                    "id": f"module-completed-{assignment.id}",
                    "activity_type": "module_completed",
                    "title": row["module_title"],
                    "detail": f'{row["trainee_name"] or "Trainee"} completed a trainer-assigned microlearning module.',
                    "trainer_id": row["assigned_by"] or row["module_created_by"],
                    "trainer_name": row["assigned_by_name"] or row["module_created_by_name"],
                    "trainee_id": row["trainee_id"],
                    "trainee_name": row["trainee_name"],
                    "batch_id": row["batch_id"],
                    "batch_label": row["batch_label"],
                    "score": row["average_score"],
                    "status": row["status"],
                    "activity_at": row["completed_at"],
                }
            )
        elif assignment.started_at:
            recent_activity.append(
                {
                    "id": f"module-started-{assignment.id}",
                    "activity_type": "module_started",
                    "title": row["module_title"],
                    "detail": f'{row["trainee_name"] or "Trainee"} started a trainer-assigned microlearning module.',
                    "trainer_id": row["assigned_by"] or row["module_created_by"],
                    "trainer_name": row["assigned_by_name"] or row["module_created_by_name"],
                    "trainee_id": row["trainee_id"],
                    "trainee_name": row["trainee_name"],
                    "batch_id": row["batch_id"],
                    "batch_label": row["batch_label"],
                    "score": row["average_score"],
                    "status": row["status"],
                    "activity_at": row["started_at"],
                }
            )

        responses = dict(assignment.responses or {})
        for exercise in module_exercises:
            exercise_row_id = _normalize_text(exercise.get("id"))
            if not exercise_row_id:
                continue
            filter_key = _exercise_filter_key(summary_module_id, exercise_row_id)
            if exercise_id and filter_key != exercise_id:
                continue
            attempt = responses.get(exercise_row_id)
            if not isinstance(attempt, dict):
                continue
            submitted_at_value = _normalize_text(attempt.get("submitted_at"))
            submitted_at = None
            if submitted_at_value:
                try:
                    submitted_at = datetime.fromisoformat(submitted_at_value.replace("Z", "+00:00"))
                except ValueError:
                    submitted_at = None
            if (start_at or end_at) and submitted_at and not _in_range(submitted_at, start_at, end_at):
                continue
            attempt_score = float(attempt.get("score") or 0.0)
            exercise_attempt_rows.append(
                {
                    "exercise_filter_id": filter_key,
                    "exercise_id": exercise_row_id,
                    "exercise_title": _normalize_text(exercise.get("title")) or _normalize_text(exercise.get("prompt")) or "Exercise",
                    "exercise_type": _normalize_text(exercise.get("type")) or "exercise",
                    "module_id": summary_module_id,
                    "module_title": row["module_title"],
                    "trainee_id": row["trainee_id"],
                    "trainee_name": row["trainee_name"],
                    "batch_id": row["batch_id"],
                    "batch_label": row["batch_label"],
                    "trainer_id": row["assigned_by"] or row["module_created_by"],
                    "trainer_name": row["assigned_by_name"] or row["module_created_by_name"],
                    "score": attempt_score,
                    "performance_level": _performance_level(attempt_score),
                    "status": _normalize_text(attempt.get("status")) or ("completed" if attempt.get("is_completed") else "pending"),
                    "study_time_seconds": int(attempt.get("study_time_seconds") or 0),
                    "answer_time_seconds": int(attempt.get("answer_time_seconds") or 0),
                    "answered_at": _normalize_text(attempt.get("answered_at")) or None,
                    "timer_expired": bool(attempt.get("timer_expired")),
                    "is_completed": bool(attempt.get("is_completed")),
                    "submitted_at": submitted_at_value or None,
                    "attempt_number": int(row["attempt_number"] or 0),
                }
            )

    assessment_rows: list[dict[str, Any]] = []
    trainer_ids_by_assessment: dict[str, set[str]] = defaultdict(set)
    for assessment in assessments:
        if not assessment_domain_enabled:
            continue
        if assessment_id and assessment.id != assessment_id:
            continue
        if trainer_id and assessment.assigned_by != trainer_id:
            continue

        if assessment.assigned_batch_id:
            target_batch = batch_lookup.get(assessment.assigned_batch_id)
            if not target_batch:
                continue
            target_trainees = [
                trainee
                for trainee in target_batch.users
                if trainee.role == UserRole.TRAINEE
                and bool(getattr(trainee, "is_active", True))
                and trainee.id in trainee_lookup
            ]
        elif assessment.assigned_user_id and assessment.assigned_user_id in trainee_lookup:
            target_batch = _resolve_primary_batch(
                assessment.assigned_user_id,
                trainee_batch_memberships,
                preferred_batch_id=batch_id,
            )
            target_trainees = [trainee_lookup[assessment.assigned_user_id]]
        else:
            continue

        category = category_lookup.get(assessment.category_id)
        question_count = len(list(dict.fromkeys(assessment.question_ids or [])))
        for assessment_trainee in target_trainees:
            if trainee_id and assessment_trainee.id != trainee_id:
                continue
            if batch_id and not _trainee_matches_batch(assessment_trainee.id, batch_id, trainee_batch_memberships):
                continue

            submission = submissions_by_assessment.get(assessment.id, {}).get(assessment_trainee.id)
            activity_at = _assessment_activity_at(assessment, submission)
            if (start_at or end_at) and not _in_range(activity_at, start_at, end_at):
                continue

            score_percentage = float(submission.score_percentage or 0.0) if submission else None
            completion_state = _assessment_completion_status(score_percentage)
            if not _matches_completion_status(completion_state, completion_status):
                continue
            if not _matches_performance_level(score_percentage, performance_level):
                continue

            scope_batch = _resolve_primary_batch(
                assessment_trainee.id,
                trainee_batch_memberships,
                preferred_batch_id=batch_id or assessment.assigned_batch_id,
            )
            certificate = mcq_certificates_by_assessment.get(assessment.id, {}).get(assessment_trainee.id)
            row = {
                "id": f"{assessment.id}:{assessment_trainee.id}",
                "assessment_id": assessment.id,
                "assessment_title": assessment.title,
                "category_id": assessment.category_id,
                "category_name": category.name if category else "Assessment",
                "trainee_id": assessment_trainee.id,
                "trainee_name": assessment_trainee.full_name,
                "batch_id": scope_batch.id if scope_batch else assessment.assigned_batch_id,
                "batch_label": _format_batch_label(scope_batch) if scope_batch else "Direct Assignment",
                "assigned_at": _to_iso(assessment.created_at),
                "submitted_at": _to_iso(submission.submitted_at) if submission else None,
                "activity_at": _to_iso(activity_at),
                "status": "completed" if submission else "pending",
                "completion_status": completion_state,
                "is_passed": bool(submission.is_passed) if submission else False,
                "score_percentage": score_percentage,
                "score_value": score_percentage,
                "performance_level": _performance_level(score_percentage),
                "attempt_count": int(submission.attempt_count or 0) if submission else 0,
                "question_count": question_count,
                "passing_threshold": float(category.passing_threshold or 90.0) if category else 90.0,
                "certificate_id": certificate.id if certificate else None,
                "certificate_no": certificate.certificate_no if certificate else None,
                "due_date": _to_iso(assessment.due_date),
                "assigned_by": assessment.assigned_by,
                "assigned_by_name": getattr(trainer_lookup.get(assessment.assigned_by), "full_name", None),
            }
            assessment_rows.append(row)
            trainer_ids_by_assessment[assessment.id].add(assessment.assigned_by)
            trainer_ids_by_trainee[assessment_trainee.id].add(assessment.assigned_by)

            if submission:
                recent_activity.append(
                    {
                        "id": f"assessment-submitted-{assessment.id}-{assessment_trainee.id}",
                        "activity_type": "assessment_submitted",
                        "title": assessment.title,
                        "detail": f'{assessment_trainee.full_name} submitted a trainer-assigned assessment.',
                        "trainer_id": assessment.assigned_by,
                        "trainer_name": getattr(trainer_lookup.get(assessment.assigned_by), "full_name", None),
                        "trainee_id": assessment_trainee.id,
                        "trainee_name": assessment_trainee.full_name,
                        "batch_id": row["batch_id"],
                        "batch_label": row["batch_label"],
                        "score": score_percentage,
                        "status": "passed" if row["is_passed"] else "failed",
                        "activity_at": row["submitted_at"],
                    }
                )

    module_ids_in_scope = {row["module_id"] for row in module_assignment_rows if row.get("module_id")}
    assessment_ids_in_scope = {row["assessment_id"] for row in assessment_rows if row.get("assessment_id")}
    trainer_ids_in_scope = {
        trainer_key
        for trainer_key in [trainer_id] if trainer_key
    } | {
        row["assigned_by"]
        for row in module_assignment_rows
        if row.get("assigned_by")
    } | {
        row["module_created_by"]
        for row in module_assignment_rows
        if row.get("module_created_by")
    } | {
        row["assigned_by"]
        for row in assessment_rows
        if row.get("assigned_by")
    }
    batch_ids_in_scope = {row["batch_id"] for row in [*module_assignment_rows, *assessment_rows] if row.get("batch_id")}
    trainee_ids_in_scope = {row["trainee_id"] for row in [*module_assignment_rows, *assessment_rows] if row.get("trainee_id")}

    visible_trainers = [
        trainer
        for trainer in trainers
        if (not trainer_id or trainer.id == trainer_id)
        and (trainer.id in trainer_ids_in_scope or trainer.id in {batch.created_by for batch in batches if batch.id in batch_ids_in_scope})
    ]
    if trainer_id and trainer_id in trainer_lookup and not visible_trainers:
        visible_trainers = [trainer_lookup[trainer_id]]

    visible_batches = [
        batch
        for batch in batches
        if (not trainer_id or batch.created_by == trainer_id)
        and (not batch_id or batch.id == batch_id)
        and (batch.id in batch_ids_in_scope or batch.id == batch_id)
    ]
    if batch_id and batch_id in batch_lookup and not visible_batches:
        visible_batches = [batch_lookup[batch_id]]

    visible_trainees = [
        trainee
        for trainee in trainees
        if (not trainee_id or trainee.id == trainee_id)
        and (not batch_id or _trainee_matches_batch(trainee.id, batch_id, trainee_batch_memberships))
        and (not trainer_id or trainer_id in trainer_ids_by_trainee.get(trainee.id, set()))
        and (trainee.id in trainee_ids_in_scope or trainee.id == trainee_id)
    ]
    if trainee_id and trainee_id in trainee_lookup and not visible_trainees:
        visible_trainees = [trainee_lookup[trainee_id]]

    trainer_options = [
        {
            "id": trainer.id,
            "name": trainer.full_name,
            "email": trainer.email,
            "batch_count": sum(1 for batch in batches if batch.created_by == trainer.id),
            "trainee_count": sum(
                1
                for current_trainee in trainees
                if trainer.id in trainer_ids_by_trainee.get(current_trainee.id, set())
            ),
        }
        for trainer in trainers
    ]
    batch_options = [
        {
            "id": batch.id,
            "label": _format_batch_label(batch),
            "trainer_id": batch.created_by,
            "trainer_name": getattr(trainer_lookup.get(batch.created_by), "full_name", None),
            "trainee_count": sum(
                1
                for current_trainee in batch.users
                if current_trainee.role == UserRole.TRAINEE and bool(getattr(current_trainee, "is_active", True))
            ),
        }
        for batch in batches
    ]
    trainee_options = []
    for current_trainee in trainees:
        memberships = trainee_batch_memberships.get(current_trainee.id, [])
        trainer_ids_for_trainee = trainer_ids_by_trainee.get(current_trainee.id, set())
        trainee_options.append(
            {
                "id": current_trainee.id,
                "name": current_trainee.full_name,
                "email": current_trainee.email,
                "batch_ids": [batch.id for batch in memberships],
                "batch_labels": [_format_batch_label(batch) for batch in memberships],
                "trainer_ids": sorted(trainer_ids_for_trainee),
                "trainer_names": _sorted_unique_names(
                    {
                        getattr(trainer_lookup.get(current_trainer_id), "full_name", "")
                        for current_trainer_id in trainer_ids_for_trainee
                    }
                ),
            }
        )
    trainee_options.sort(key=lambda row: row["name"].lower())

    module_options = [
        {
            "id": module.id,
            "title": module.title,
            "module_type": module.type,
            "topic_category_name": getattr(module.topic_category, "name", None),
            "created_by": module.created_by,
            "created_by_name": getattr(trainer_lookup.get(module.created_by), "full_name", None),
        }
        for module in modules
    ]
    assessment_options = [
        {
            "id": assessment.id,
            "title": assessment.title,
            "category_name": getattr(category_lookup.get(assessment.category_id), "name", "Assessment"),
            "assigned_by": assessment.assigned_by,
            "assigned_by_name": getattr(trainer_lookup.get(assessment.assigned_by), "full_name", None),
            "assigned_batch_id": assessment.assigned_batch_id,
            "assigned_user_id": assessment.assigned_user_id,
        }
        for assessment in assessments
    ]

    all_scores = [
        float(row["score_value"])
        for row in module_assignment_rows
        if row["score_value"] is not None
    ] + [
        float(row["score_percentage"])
        for row in assessment_rows
        if row["score_percentage"] is not None
    ]

    trainee_metric_map: dict[str, dict[str, Any]] = {}
    for current_trainee in visible_trainees:
        current_batch = _resolve_primary_batch(
            current_trainee.id,
            trainee_batch_memberships,
            preferred_batch_id=batch_id,
        )
        trainee_metric_map[current_trainee.id] = {
            "trainee_id": current_trainee.id,
            "trainee_name": current_trainee.full_name,
            "batch_id": current_batch.id if current_batch else None,
            "batch_label": _format_batch_label(current_batch) if current_batch else "Direct Assignment",
            "trainer_names": set(),
            "module_scores": [],
            "assessment_scores": [],
            "module_assigned": 0,
            "module_completed": 0,
            "module_passed": 0,
            "assessment_assigned": 0,
            "assessment_completed": 0,
            "assessment_passed": 0,
            "total_attempts": 0,
            "latest_activity_at": None,
        }

    for row in module_assignment_rows:
        metrics = trainee_metric_map.setdefault(
            row["trainee_id"],
            {
                "trainee_id": row["trainee_id"],
                "trainee_name": row["trainee_name"],
                "batch_id": row["batch_id"],
                "batch_label": row["batch_label"],
                "trainer_names": set(),
                "module_scores": [],
                "assessment_scores": [],
                "module_assigned": 0,
                "module_completed": 0,
                "module_passed": 0,
                "assessment_assigned": 0,
                "assessment_completed": 0,
                "assessment_passed": 0,
                "total_attempts": 0,
                "latest_activity_at": None,
            },
        )
        if row.get("assigned_by_name"):
            metrics["trainer_names"].add(row["assigned_by_name"])
        elif row.get("module_created_by_name"):
            metrics["trainer_names"].add(row["module_created_by_name"])
        metrics["module_assigned"] += 1
        metrics["total_attempts"] += max(int(row["attempt_number"] or 0), 0)
        if row["activity_at"] and (
            metrics["latest_activity_at"] is None or str(row["activity_at"]) > str(metrics["latest_activity_at"])
        ):
            metrics["latest_activity_at"] = row["activity_at"]
        if row["score_value"] is not None:
            metrics["module_scores"].append(float(row["score_value"] or 0.0))
        if row["completion_status"] == "completed":
            metrics["module_completed"] += 1
        if row["is_passed"]:
            metrics["module_passed"] += 1

    for row in assessment_rows:
        metrics = trainee_metric_map.setdefault(
            row["trainee_id"],
            {
                "trainee_id": row["trainee_id"],
                "trainee_name": row["trainee_name"],
                "batch_id": row["batch_id"],
                "batch_label": row["batch_label"],
                "trainer_names": set(),
                "module_scores": [],
                "assessment_scores": [],
                "module_assigned": 0,
                "module_completed": 0,
                "module_passed": 0,
                "assessment_assigned": 0,
                "assessment_completed": 0,
                "assessment_passed": 0,
                "total_attempts": 0,
                "latest_activity_at": None,
            },
        )
        if row.get("assigned_by_name"):
            metrics["trainer_names"].add(row["assigned_by_name"])
        metrics["assessment_assigned"] += 1
        metrics["total_attempts"] += max(int(row["attempt_count"] or 0), 0)
        if row["activity_at"] and (
            metrics["latest_activity_at"] is None or str(row["activity_at"]) > str(metrics["latest_activity_at"])
        ):
            metrics["latest_activity_at"] = row["activity_at"]
        if row["score_percentage"] is not None:
            metrics["assessment_completed"] += 1
            metrics["assessment_scores"].append(float(row["score_percentage"] or 0.0))
            if row["is_passed"]:
                metrics["assessment_passed"] += 1

    trainee_ranking = []
    for metrics in trainee_metric_map.values():
        total_assigned = metrics["module_assigned"] + metrics["assessment_assigned"]
        total_completed = metrics["module_completed"] + metrics["assessment_completed"]
        total_passed = metrics["module_passed"] + metrics["assessment_passed"]
        overall_score = _average(metrics["module_scores"] + metrics["assessment_scores"])
        completion_rate = round((total_completed / total_assigned) * 100.0, 2) if total_assigned else 0.0
        pass_rate = round((total_passed / total_completed) * 100.0, 2) if total_completed else 0.0
        trainee_ranking.append(
            {
                "trainee_id": metrics["trainee_id"],
                "trainee_name": metrics["trainee_name"],
                "batch_id": metrics["batch_id"],
                "batch_label": metrics["batch_label"],
                "trainer_names": _sorted_unique_names(metrics["trainer_names"]),
                "overall_score": overall_score,
                "performance_level": _performance_level(overall_score),
                "average_exercise_score": _average(metrics["module_scores"]),
                "average_assessment_score": _average(metrics["assessment_scores"]),
                "module_completion_rate": round(
                    (metrics["module_completed"] / metrics["module_assigned"]) * 100.0,
                    2,
                )
                if metrics["module_assigned"]
                else 0.0,
                "completion_rate": completion_rate,
                "pass_rate": pass_rate,
                "module_assigned": metrics["module_assigned"],
                "module_completed": metrics["module_completed"],
                "assessment_assigned": metrics["assessment_assigned"],
                "assessment_completed": metrics["assessment_completed"],
                "total_attempts": metrics["total_attempts"],
                "latest_activity_at": metrics["latest_activity_at"],
            }
        )

    trainee_ranking = [
        row
        for row in trainee_ranking
        if (
            row["module_assigned"] > 0
            or row["assessment_assigned"] > 0
            or row["latest_activity_at"] is not None
        )
    ]
    trainee_ranking.sort(
        key=lambda row: (
            float(row["overall_score"] or 0.0),
            float(row["completion_rate"] or 0.0),
            row["trainee_name"].lower(),
        ),
        reverse=True,
    )

    batch_metric_map: dict[str, dict[str, Any]] = {}
    for current_batch in visible_batches:
        batch_metric_map[current_batch.id] = {
            "batch_id": current_batch.id,
            "batch_label": _format_batch_label(current_batch),
            "trainer_id": current_batch.created_by,
            "trainer_name": getattr(trainer_lookup.get(current_batch.created_by), "full_name", None),
            "trainee_ids": {
                trainee.id
                for trainee in current_batch.users
                if trainee.role == UserRole.TRAINEE and bool(getattr(trainee, "is_active", True))
            },
            "module_scores": [],
            "assessment_scores": [],
            "module_assigned": 0,
            "module_completed": 0,
            "module_passed": 0,
            "assessment_assigned": 0,
            "assessment_completed": 0,
            "assessment_passed": 0,
            "total_attempts": 0,
        }

    for row in module_assignment_rows:
        current_batch_id = _normalize_text(row.get("batch_id"))
        if current_batch_id not in batch_metric_map:
            continue
        metrics = batch_metric_map[current_batch_id]
        metrics["module_assigned"] += 1
        metrics["total_attempts"] += max(int(row["attempt_number"] or 0), 0)
        if row["score_value"] is not None:
            metrics["module_scores"].append(float(row["score_value"] or 0.0))
        if row["completion_status"] == "completed":
            metrics["module_completed"] += 1
        if row["is_passed"]:
            metrics["module_passed"] += 1

    for row in assessment_rows:
        current_batch_id = _normalize_text(row.get("batch_id"))
        if current_batch_id not in batch_metric_map:
            continue
        metrics = batch_metric_map[current_batch_id]
        metrics["assessment_assigned"] += 1
        metrics["total_attempts"] += max(int(row["attempt_count"] or 0), 0)
        if row["score_percentage"] is not None:
            metrics["assessment_completed"] += 1
            metrics["assessment_scores"].append(float(row["score_percentage"] or 0.0))
            if row["is_passed"]:
                metrics["assessment_passed"] += 1

    batch_comparison = []
    for metrics in batch_metric_map.values():
        total_assigned = metrics["module_assigned"] + metrics["assessment_assigned"]
        total_completed = metrics["module_completed"] + metrics["assessment_completed"]
        total_passed = metrics["module_passed"] + metrics["assessment_passed"]
        batch_comparison.append(
            {
                "batch_id": metrics["batch_id"],
                "batch_label": metrics["batch_label"],
                "trainer_id": metrics["trainer_id"],
                "trainer_name": metrics["trainer_name"],
                "trainee_count": len(metrics["trainee_ids"]),
                "assigned_items": total_assigned,
                "completed_items": total_completed,
                "completion_rate": round((total_completed / total_assigned) * 100.0, 2)
                if total_assigned
                else 0.0,
                "pass_rate": round((total_passed / total_completed) * 100.0, 2)
                if total_completed
                else 0.0,
                "average_exercise_score": _average(metrics["module_scores"]),
                "average_assessment_score": _average(metrics["assessment_scores"]),
                "overall_score": _average(metrics["module_scores"] + metrics["assessment_scores"]),
                "performance_level": _performance_level(_average(metrics["module_scores"] + metrics["assessment_scores"])),
                "total_attempts": metrics["total_attempts"],
            }
        )
    batch_comparison.sort(
        key=lambda row: (
            float(row["overall_score"] or 0.0),
            float(row["completion_rate"] or 0.0),
            row["batch_label"].lower(),
        ),
        reverse=True,
    )

    trainer_metric_map: dict[str, dict[str, Any]] = {}
    for current_trainer in visible_trainers:
        trainer_metric_map[current_trainer.id] = {
            "trainer_id": current_trainer.id,
            "trainer_name": current_trainer.full_name,
            "trainee_ids": set(),
            "batch_ids": {batch.id for batch in batches if batch.created_by == current_trainer.id},
            "created_module_ids": {
                module.id
                for module in modules
                if module.created_by == current_trainer.id and (not module_ids_in_scope or module.id in module_ids_in_scope)
            },
            "module_scores": [],
            "assessment_scores": [],
            "module_assigned": 0,
            "module_completed": 0,
            "module_passed": 0,
            "assessment_assigned": 0,
            "assessment_completed": 0,
            "assessment_passed": 0,
            "certificate_ids": set(),
            "total_attempts": 0,
        }

    for row in module_assignment_rows:
        current_trainer_id = row.get("assigned_by") or row.get("module_created_by")
        if current_trainer_id not in trainer_metric_map:
            if not current_trainer_id or current_trainer_id not in trainer_lookup:
                continue
            trainer_metric_map[current_trainer_id] = {
                "trainer_id": current_trainer_id,
                "trainer_name": trainer_lookup[current_trainer_id].full_name,
                "trainee_ids": set(),
                "batch_ids": set(),
                "created_module_ids": set(),
                "module_scores": [],
                "assessment_scores": [],
                "module_assigned": 0,
                "module_completed": 0,
                "module_passed": 0,
                "assessment_assigned": 0,
                "assessment_completed": 0,
                "assessment_passed": 0,
                "certificate_ids": set(),
                "total_attempts": 0,
            }
        metrics = trainer_metric_map[current_trainer_id]
        metrics["trainee_ids"].add(row["trainee_id"])
        if row.get("batch_id"):
            metrics["batch_ids"].add(row["batch_id"])
        if row.get("module_created_by") == current_trainer_id:
            metrics["created_module_ids"].add(row["module_id"])
        metrics["module_assigned"] += 1
        metrics["total_attempts"] += max(int(row["attempt_number"] or 0), 0)
        if row["score_value"] is not None:
            metrics["module_scores"].append(float(row["score_value"] or 0.0))
        if row["completion_status"] == "completed":
            metrics["module_completed"] += 1
        if row["is_passed"]:
            metrics["module_passed"] += 1
        if row.get("certificate_id"):
            metrics["certificate_ids"].add(row["certificate_id"])

    for row in assessment_rows:
        current_trainer_id = row.get("assigned_by")
        if current_trainer_id not in trainer_metric_map:
            if not current_trainer_id or current_trainer_id not in trainer_lookup:
                continue
            trainer_metric_map[current_trainer_id] = {
                "trainer_id": current_trainer_id,
                "trainer_name": trainer_lookup[current_trainer_id].full_name,
                "trainee_ids": set(),
                "batch_ids": set(),
                "created_module_ids": set(),
                "module_scores": [],
                "assessment_scores": [],
                "module_assigned": 0,
                "module_completed": 0,
                "module_passed": 0,
                "assessment_assigned": 0,
                "assessment_completed": 0,
                "assessment_passed": 0,
                "certificate_ids": set(),
                "total_attempts": 0,
            }
        metrics = trainer_metric_map[current_trainer_id]
        metrics["trainee_ids"].add(row["trainee_id"])
        if row.get("batch_id"):
            metrics["batch_ids"].add(row["batch_id"])
        metrics["assessment_assigned"] += 1
        metrics["total_attempts"] += max(int(row["attempt_count"] or 0), 0)
        if row["score_percentage"] is not None:
            metrics["assessment_completed"] += 1
            metrics["assessment_scores"].append(float(row["score_percentage"] or 0.0))
            if row["is_passed"]:
                metrics["assessment_passed"] += 1
        if row.get("certificate_id"):
            metrics["certificate_ids"].add(row["certificate_id"])

    trainer_comparison = []
    for metrics in trainer_metric_map.values():
        total_assigned = metrics["module_assigned"] + metrics["assessment_assigned"]
        total_completed = metrics["module_completed"] + metrics["assessment_completed"]
        total_passed = metrics["module_passed"] + metrics["assessment_passed"]
        trainer_comparison.append(
            {
                "trainer_id": metrics["trainer_id"],
                "trainer_name": metrics["trainer_name"],
                "trainee_count": len(metrics["trainee_ids"]),
                "batch_count": len(metrics["batch_ids"]),
                "trainer_created_modules": len(metrics["created_module_ids"]),
                "assigned_items": total_assigned,
                "completed_items": total_completed,
                "completion_rate": round((total_completed / total_assigned) * 100.0, 2)
                if total_assigned
                else 0.0,
                "pass_rate": round((total_passed / total_completed) * 100.0, 2)
                if total_completed
                else 0.0,
                "average_exercise_score": _average(metrics["module_scores"]),
                "average_assessment_score": _average(metrics["assessment_scores"]),
                "overall_score": _average(metrics["module_scores"] + metrics["assessment_scores"]),
                "performance_level": _performance_level(_average(metrics["module_scores"] + metrics["assessment_scores"])),
                "certificates_issued": len(metrics["certificate_ids"]),
                "total_attempts": metrics["total_attempts"],
            }
        )
    trainer_comparison.sort(
        key=lambda row: (
            float(row["overall_score"] or 0.0),
            float(row["completion_rate"] or 0.0),
            row["trainer_name"].lower(),
        ),
        reverse=True,
    )

    module_progress_lookup: dict[str, dict[str, Any]] = {}
    for row in module_assignment_rows:
        module_bucket = module_progress_lookup.setdefault(
            row["module_id"],
            {
                "module_id": row["module_id"],
                "module_title": row["module_title"],
                "module_type": row["module_type"],
                "topic_category_name": row["topic_category_name"],
                "created_by": row["module_created_by"],
                "created_by_name": row["module_created_by_name"],
                "assigned_count": 0,
                "completed_count": 0,
                "pending_count": 0,
                "in_progress_count": 0,
                "passed_count": 0,
                "scores": [],
                "latest_activity_at": None,
            },
        )
        module_bucket["assigned_count"] += 1
        if row["completion_status"] == "completed":
            module_bucket["completed_count"] += 1
        elif row["completion_status"] == "in_progress":
            module_bucket["in_progress_count"] += 1
        else:
            module_bucket["pending_count"] += 1
        if row["is_passed"]:
            module_bucket["passed_count"] += 1
        if row["score_value"] is not None:
            module_bucket["scores"].append(float(row["score_value"] or 0.0))
        if row["activity_at"] and (
            module_bucket["latest_activity_at"] is None
            or str(row["activity_at"]) > str(module_bucket["latest_activity_at"])
        ):
            module_bucket["latest_activity_at"] = row["activity_at"]

    module_progress = []
    for module_bucket in module_progress_lookup.values():
        assigned_count = int(module_bucket["assigned_count"] or 0)
        completed_count = int(module_bucket["completed_count"] or 0)
        passed_count = int(module_bucket["passed_count"] or 0)
        average_score = _average(module_bucket["scores"])
        module_progress.append(
            {
                "module_id": module_bucket["module_id"],
                "module_title": module_bucket["module_title"],
                "module_type": module_bucket["module_type"],
                "topic_category_name": module_bucket["topic_category_name"],
                "created_by": module_bucket["created_by"],
                "created_by_name": module_bucket["created_by_name"],
                "assigned_count": assigned_count,
                "completed_count": completed_count,
                "pending_count": int(module_bucket["pending_count"] or 0),
                "in_progress_count": int(module_bucket["in_progress_count"] or 0),
                "completion_rate": round((completed_count / assigned_count) * 100.0, 2)
                if assigned_count
                else 0.0,
                "pass_rate": round((passed_count / completed_count) * 100.0, 2)
                if completed_count
                else 0.0,
                "average_score": average_score,
                "performance_level": _performance_level(average_score),
                "latest_activity_at": module_bucket["latest_activity_at"],
            }
        )
    module_progress.sort(
        key=lambda row: (
            float(row["completion_rate"] or 0.0),
            float(row["average_score"] or 0.0),
            row["module_title"].lower(),
        ),
    )
    weakest_modules = module_progress[:5]

    assessment_performance_lookup: dict[str, dict[str, Any]] = {}
    assessment_area_lookup: dict[str, dict[str, Any]] = {}
    for row in assessment_rows:
        assessment_bucket = assessment_performance_lookup.setdefault(
            row["assessment_id"],
            {
                "assessment_id": row["assessment_id"],
                "assessment_title": row["assessment_title"],
                "category_id": row["category_id"],
                "category_name": row["category_name"],
                "assigned_by": row["assigned_by"],
                "assigned_by_name": row["assigned_by_name"],
                "assigned_count": 0,
                "completed_count": 0,
                "passed_count": 0,
                "scores": [],
            },
        )
        assessment_bucket["assigned_count"] += 1
        if row["score_percentage"] is not None:
            assessment_bucket["completed_count"] += 1
            assessment_bucket["scores"].append(float(row["score_percentage"] or 0.0))
            if row["is_passed"]:
                assessment_bucket["passed_count"] += 1

        category_key = _normalize_text(row.get("category_id")) or _normalize_text(row.get("category_name"))
        category_bucket = assessment_area_lookup.setdefault(
            category_key,
            {
                "category_id": row.get("category_id"),
                "category_name": row.get("category_name"),
                "assigned_count": 0,
                "completed_count": 0,
                "passed_count": 0,
                "scores": [],
            },
        )
        category_bucket["assigned_count"] += 1
        if row["score_percentage"] is not None:
            category_bucket["completed_count"] += 1
            category_bucket["scores"].append(float(row["score_percentage"] or 0.0))
            if row["is_passed"]:
                category_bucket["passed_count"] += 1

    assessment_performance = []
    for bucket in assessment_performance_lookup.values():
        completed_count = int(bucket["completed_count"] or 0)
        average_score = _average(bucket["scores"])
        assessment_performance.append(
            {
                "assessment_id": bucket["assessment_id"],
                "assessment_title": bucket["assessment_title"],
                "category_id": bucket["category_id"],
                "category_name": bucket["category_name"],
                "assigned_by": bucket["assigned_by"],
                "assigned_by_name": bucket["assigned_by_name"],
                "assigned_count": int(bucket["assigned_count"] or 0),
                "completed_count": completed_count,
                "average_score": average_score,
                "performance_level": _performance_level(average_score),
                "pass_rate": round((int(bucket["passed_count"] or 0) / completed_count) * 100.0, 2)
                if completed_count
                else 0.0,
            }
        )
    assessment_performance.sort(
        key=lambda row: (
            float(row["average_score"] or 0.0),
            float(row["pass_rate"] or 0.0),
            row["assessment_title"].lower(),
        )
    )

    weakest_assessment_areas = []
    for bucket in assessment_area_lookup.values():
        completed_count = int(bucket["completed_count"] or 0)
        average_score = _average(bucket["scores"])
        weakest_assessment_areas.append(
            {
                "category_id": bucket["category_id"],
                "category_name": bucket["category_name"],
                "assigned_count": int(bucket["assigned_count"] or 0),
                "completed_count": completed_count,
                "average_score": average_score,
                "performance_level": _performance_level(average_score),
                "pass_rate": round((int(bucket["passed_count"] or 0) / completed_count) * 100.0, 2)
                if completed_count
                else 0.0,
            }
        )
    weakest_assessment_areas.sort(
        key=lambda row: (
            float(row["average_score"] or 0.0),
            float(row["pass_rate"] or 0.0),
            row["category_name"].lower(),
        )
    )

    exercise_totals: dict[str, dict[str, Any]] = {}
    for row in module_assignment_rows:
        module = module_lookup.get(row["module_id"])
        if not module:
            continue
        for exercise in module.exercises or []:
            exercise_row_id = _normalize_text(exercise.get("id"))
            if not exercise_row_id:
                continue
            filter_key = _exercise_filter_key(row["module_id"], exercise_row_id)
            if exercise_id and filter_key != exercise_id:
                continue
            bucket = exercise_totals.setdefault(
                filter_key,
                {
                    "exercise_filter_id": filter_key,
                    "exercise_id": exercise_row_id,
                    "exercise_title": _normalize_text(exercise.get("title")) or _normalize_text(exercise.get("prompt")) or "Exercise",
                    "exercise_type": _normalize_text(exercise.get("type")) or "exercise",
                    "module_id": row["module_id"],
                    "module_title": row["module_title"],
                    "trainer_ids": set(),
                    "trainer_names": set(),
                    "assigned_count": 0,
                    "attempt_count": 0,
                    "completed_attempts": 0,
                    "scores": [],
                },
            )
            bucket["assigned_count"] += 1
            if row.get("assigned_by"):
                bucket["trainer_ids"].add(row["assigned_by"])
            if row.get("assigned_by_name"):
                bucket["trainer_names"].add(row["assigned_by_name"])

    for attempt_row in exercise_attempt_rows:
        bucket = exercise_totals.get(attempt_row["exercise_filter_id"])
        if not bucket:
            continue
        bucket["attempt_count"] += 1
        if attempt_row["is_completed"]:
            bucket["completed_attempts"] += 1
        bucket["scores"].append(float(attempt_row["score"] or 0.0))

    exercise_performance = []
    for bucket in exercise_totals.values():
        assigned_count = int(bucket["assigned_count"] or 0)
        attempt_count = int(bucket["attempt_count"] or 0)
        average_score = _average(bucket["scores"])
        exercise_performance.append(
            {
                "exercise_filter_id": bucket["exercise_filter_id"],
                "exercise_id": bucket["exercise_id"],
                "exercise_title": bucket["exercise_title"],
                "exercise_type": bucket["exercise_type"],
                "module_id": bucket["module_id"],
                "module_title": bucket["module_title"],
                "trainer_ids": sorted(bucket["trainer_ids"]),
                "trainer_names": _sorted_unique_names(bucket["trainer_names"]),
                "assigned_count": assigned_count,
                "attempt_count": attempt_count,
                "completion_rate": round((int(bucket["completed_attempts"] or 0) / assigned_count) * 100.0, 2)
                if assigned_count
                else 0.0,
                "average_score": average_score,
                "performance_level": _performance_level(average_score),
            }
        )
    exercise_performance.sort(
        key=lambda row: (
            float(row["average_score"] or 0.0),
            float(row["completion_rate"] or 0.0),
            row["module_title"].lower(),
            row["exercise_title"].lower(),
        )
    )

    trainees_needing_improvement = [
        row
        for row in trainee_ranking
        if float(row["overall_score"] or 0.0) < 75.0
        or float(row["completion_rate"] or 0.0) < 65.0
        or float(row["pass_rate"] or 0.0) < 70.0
    ]
    trainees_needing_improvement.sort(
        key=lambda row: (
            float(row["overall_score"] or 0.0),
            float(row["completion_rate"] or 0.0),
            row["trainee_name"].lower(),
        )
    )

    module_completed_count = sum(1 for row in module_assignment_rows if row["completion_status"] == "completed")
    module_in_progress_count = sum(1 for row in module_assignment_rows if row["completion_status"] == "in_progress")
    module_pending_count = sum(1 for row in module_assignment_rows if row["completion_status"] == "pending")
    module_passed_count = sum(1 for row in module_assignment_rows if row["is_passed"])
    assessment_completed_count = sum(1 for row in assessment_rows if row["score_percentage"] is not None)
    assessment_pending_count = len(assessment_rows) - assessment_completed_count
    assessment_passed_count = sum(1 for row in assessment_rows if row["is_passed"])

    total_assigned_items = len(module_assignment_rows) + len(assessment_rows)
    total_completed_items = module_completed_count + assessment_completed_count
    total_passed_items = module_passed_count + assessment_passed_count
    overall_score = _average(all_scores)

    completion_breakdown = [
        {"label": "Pending", "count": module_pending_count + assessment_pending_count},
        {"label": "In Progress", "count": module_in_progress_count},
        {"label": "Completed", "count": module_completed_count + assessment_completed_count},
    ]
    performance_breakdown = []
    for level in ["excellent", "healthy", "developing", "at_risk"]:
        performance_breakdown.append(
            {
                "level": level,
                "label": level.replace("_", " ").title(),
                "count": sum(1 for value in all_scores if _performance_level(value) == level),
            }
        )

    summary = {
        "total_trainers": len(visible_trainers) if visible_trainers else (1 if trainer_id else 0),
        "total_batches": len(visible_batches) if visible_batches else (1 if batch_id else 0),
        "total_trainees": len(visible_trainees) if visible_trainees else (1 if trainee_id else 0),
        "trainer_created_modules": len(module_ids_in_scope),
        "assigned_module_records": len(module_assignment_rows),
        "assigned_assessment_records": len(assessment_rows),
        "completed_modules": module_completed_count,
        "in_progress_modules": module_in_progress_count,
        "pending_modules": module_pending_count,
        "completed_assessments": assessment_completed_count,
        "pending_assessments": assessment_pending_count,
        "completion_rate": round((total_completed_items / total_assigned_items) * 100.0, 2)
        if total_assigned_items
        else 0.0,
        "average_assessment_score": _average(
            [float(row["score_percentage"]) for row in assessment_rows if row["score_percentage"] is not None]
        ),
        "average_exercise_score": _average(
            [float(row["score_value"]) for row in module_assignment_rows if row["score_value"] is not None]
        ),
        "overall_score": overall_score,
        "pass_rate": round((total_passed_items / total_completed_items) * 100.0, 2)
        if total_completed_items
        else 0.0,
        "total_attempts": sum(max(int(row["attempt_number"] or 0), 0) for row in module_assignment_rows)
        + sum(max(int(row["attempt_count"] or 0), 0) for row in assessment_rows),
        "passed_modules": module_passed_count,
        "passed_assessments": assessment_passed_count,
        "certificates_issued": len(
            {
                certificate_id
                for certificate_id in [
                    *[row.get("certificate_id") for row in module_assignment_rows],
                    *[row.get("certificate_id") for row in assessment_rows],
                ]
                if certificate_id
            }
        ),
    }

    recent_activity.sort(
        key=lambda row: _normalize_text(row.get("activity_at")),
        reverse=True,
    )

    scope_parts: list[str] = []
    if trainer_id:
        scope_parts.append(trainer_lookup[trainer_id].full_name)
    if batch_id:
        scope_parts.append(_format_batch_label(batch_lookup[batch_id]))
    if trainee_id:
        scope_parts.append(trainee_lookup[trainee_id].full_name)
    if module_id:
        scope_parts.append(module_lookup[module_id].title)
    if assessment_id:
        scope_parts.append(assessment_lookup[assessment_id].title)
    if exercise_id:
        scope_parts.append(exercise_option_lookup[exercise_id]["title"])
    if completion_status:
        scope_parts.append(completion_status.replace("_", " ").title())
    if performance_level:
        scope_parts.append(performance_level.replace("_", " ").title())
    if start_date or end_date:
        scope_parts.append("Date filtered")
    scope_label = " / ".join(scope_parts) if scope_parts else "All Admin Learning Data"

    return {
        "scope": {
            "trainer_id": trainer_id,
            "batch_id": batch_id,
            "trainee_id": trainee_id,
            "module_id": module_id,
            "assessment_id": assessment_id,
            "exercise_id": exercise_id,
            "completion_status": completion_status,
            "performance_level": performance_level,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "label": scope_label,
        },
        "filters": {
            "trainers": trainer_options,
            "batches": batch_options,
            "trainees": trainee_options,
            "modules": module_options,
            "assessments": assessment_options,
            "exercises": exercise_options,
        },
        "summary": summary,
        "completion_breakdown": completion_breakdown,
        "performance_breakdown": performance_breakdown,
        "trainer_comparison": trainer_comparison,
        "top_trainers": trainer_comparison[:5],
        "at_risk_trainers": sorted(
            trainer_comparison,
            key=lambda row: (
                float(row["overall_score"] or 0.0),
                float(row["completion_rate"] or 0.0),
                row["trainer_name"].lower(),
            ),
        )[:5],
        "batch_comparison": batch_comparison,
        "top_batches": batch_comparison[:5],
        "at_risk_batches": sorted(
            batch_comparison,
            key=lambda row: (
                float(row["overall_score"] or 0.0),
                float(row["completion_rate"] or 0.0),
                row["batch_label"].lower(),
            ),
        )[:5],
        "trainee_ranking": trainee_ranking[:20],
        "score_distribution": _build_score_distribution(all_scores),
        "module_progress": sorted(
            module_progress,
            key=lambda row: (
                float(row["completion_rate"] or 0.0),
                float(row["average_score"] or 0.0),
                row["module_title"].lower(),
            ),
            reverse=True,
        )[:20],
        "weakest_modules": weakest_modules,
        "assessment_performance": assessment_performance[:20],
        "weakest_assessment_areas": weakest_assessment_areas[:8],
        "exercise_performance": exercise_performance[:20],
        "trainees_needing_improvement": trainees_needing_improvement[:12],
        "recent_activity": recent_activity[:16],
        "module_assignments": sorted(
            module_assignment_rows,
            key=lambda row: _normalize_text(row.get("activity_at")),
            reverse=True,
        )[:80],
        "assessment_results": sorted(
            assessment_rows,
            key=lambda row: _normalize_text(row.get("activity_at")),
            reverse=True,
        )[:80],
        "ai_analysis": _build_admin_ai_analysis(
            scope_label=scope_label,
            summary=summary,
            trainer_rows=trainer_comparison,
            batch_rows=batch_comparison,
            weakest_modules=weakest_modules,
            weakest_areas=weakest_assessment_areas,
            exercise_rows=exercise_performance,
            improvement_rows=trainees_needing_improvement,
        ),
    }
