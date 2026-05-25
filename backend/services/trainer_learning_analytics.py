from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time
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
from .learning_activity_overview import (
    collect_call_simulation_rows,
    collect_coaching_rows,
)
from .supabase_auth_service import filter_to_supabase_active_users

LOW_SCORE_INTERVENTION_THRESHOLD = 75.0


def _average(values: list[float]) -> float:
    cleaned = [float(value) for value in values if value is not None]
    return round(sum(cleaned) / len(cleaned), 2) if cleaned else 0.0


def _to_iso(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    return value.isoformat()


def _bounds_from_dates(
    start_date: Optional[date],
    end_date: Optional[date],
) -> tuple[Optional[datetime], Optional[datetime]]:
    start_at = datetime.combine(start_date, time.min) if start_date else None
    end_at = datetime.combine(end_date, time.max) if end_date else None
    return start_at, end_at


def _in_range(
    value: Optional[datetime],
    start_at: Optional[datetime],
    end_at: Optional[datetime],
) -> bool:
    if not value:
        return start_at is None and end_at is None
    if start_at and value < start_at:
        return False
    if end_at and value > end_at:
        return False
    return True


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _feedback_label(value: Any) -> str:
    normalized = _normalize_text(value).replace("_", " ")
    return normalized.title() if normalized else "Uncategorized"


def _format_batch_label(batch: Optional[Batch]) -> str:
    if not batch:
        return "Direct Assignment"
    if batch.wave_number is not None:
        return f"{batch.name} | Wave {batch.wave_number}"
    return batch.name


def _exercise_filter_key(module_id: str, exercise_id: str) -> str:
    return f"{module_id}:{exercise_id}"


def _pluralize(value: int, singular: str, plural: Optional[str] = None) -> str:
    return singular if int(value or 0) == 1 else (plural or f"{singular}s")


def _count_intervention_needed_activities(
    *,
    module_assignment_rows: list[dict[str, Any]],
    assessment_rows: list[dict[str, Any]],
    call_simulation_rows: list[dict[str, Any]],
    coaching_notes: Optional[list[dict[str, Any]]] = None,
) -> int:
    module_flags = sum(
        1
        for row in module_assignment_rows
        if (
            int(row.get("attempt_number") or 0) > 1
            or (
                int(row.get("completed_exercises") or 0) > 0
                and float(row.get("average_score") or 0.0) < LOW_SCORE_INTERVENTION_THRESHOLD
            )
            or (
                _normalize_text(row.get("status")).lower() in {"completed", "certified"}
                and not bool(row.get("is_passed"))
            )
        )
    )
    assessment_flags = sum(
        1
        for row in assessment_rows
        if (
            int(row.get("attempt_count") or 0) > 1
            or (
                row.get("score_percentage") is not None
                and float(row.get("score_percentage") or 0.0) < LOW_SCORE_INTERVENTION_THRESHOLD
            )
            or (
                row.get("score_percentage") is not None
                and not bool(row.get("is_passed"))
            )
        )
    )
    call_simulation_flags = sum(
        1
        for row in call_simulation_rows
        if (
            max(
                int(row.get("attempt_count") or 0),
                int(row.get("latest_attempt_number") or 0),
            ) > 1
            or (
                row.get("score_value") is not None
                and float(row.get("score_value") or 0.0) < LOW_SCORE_INTERVENTION_THRESHOLD
            )
            or (
                _normalize_text(row.get("completion_status")).lower() == "completed"
                and not bool(row.get("is_passed"))
            )
        )
    )
    coaching_flags = sum(
        1
        for row in (coaching_notes or [])
        if (
            _normalize_text(row.get("status")).lower() != "acknowledged"
            or _normalize_text(row.get("competency_status")).lower()
            in {"pending", "not_competent", "retake_required"}
        )
    )
    return module_flags + assessment_flags + call_simulation_flags + coaching_flags


def _dedupe_notes(values: list[str], limit: int) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = _normalize_text(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
        if len(deduped) >= limit:
            break
    return deduped


def _metric_lookup(rows: list[dict[str, Any]], metric_name: str) -> Optional[dict[str, Any]]:
    normalized_metric_name = _normalize_text(metric_name).lower()
    for row in rows:
        if _normalize_text(row.get("metric")).lower() == normalized_metric_name:
            return row
    return None


def _format_metric_value(value: Optional[float], unit: str) -> str:
    numeric_value = float(value or 0.0)
    if unit == "wpm":
        return f"{numeric_value:.1f} wpm"
    if unit == "sec":
        return f"{numeric_value:.1f} sec"
    return f"{numeric_value:.1f}%"


def _build_call_simulation_kpi_coaching_notes(
    *,
    call_simulation_rows: list[dict[str, Any]],
    call_simulation_kpis: list[dict[str, Any]],
    coaching_notes: list[dict[str, Any]],
) -> list[str]:
    notes: list[str] = []

    weakest_scenario = next(
        iter(
            sorted(
                [
                    row
                    for row in call_simulation_rows
                    if int(row.get("assigned_count") or 0) > 0 and int(row.get("completed_count") or 0) > 0
                ],
                key=lambda row: (
                    float(row.get("average_score") or 0.0),
                    float(row.get("pass_rate") or 0.0),
                    _normalize_text(row.get("scenario_title")).lower(),
                ),
            )
        ),
        None,
    )
    if weakest_scenario and (
        float(weakest_scenario.get("average_score") or 0.0) < 80.0
        or float(weakest_scenario.get("pass_rate") or 0.0) < 75.0
    ):
        notes.append(
            f'Call Simulation coaching should start with "{weakest_scenario.get("scenario_title")}", '
            f'where average score is {float(weakest_scenario.get("average_score") or 0.0):.1f}% and pass rate is '
            f'{float(weakest_scenario.get("pass_rate") or 0.0):.1f}%.'
        )

    low_percent_metrics = sorted(
        [
            row
            for row in call_simulation_kpis
            if _normalize_text(row.get("unit")) == "%" and float(row.get("value") or 0.0) < 82.0
        ],
        key=lambda row: (
            float(row.get("value") or 0.0),
            _normalize_text(row.get("metric")).lower(),
        ),
    )
    for row in low_percent_metrics[:2]:
        metric_name = _normalize_text(row.get("metric")) or "KPI"
        metric_value = float(row.get("value") or 0.0)
        if metric_name == "Speech To Text":
            notes.append(
                f"Speech To Text is averaging {metric_value:.1f}%, so trainees need clearer articulation and stronger verification checkpoints during mock calls."
            )
        elif metric_name == "Grammar":
            notes.append(
                f"Grammar is averaging {metric_value:.1f}%, which suggests sentence control and response structure still need coached repetition."
            )
        elif metric_name == "Pronunciation":
            notes.append(
                f"Pronunciation is averaging {metric_value:.1f}%, so call coaching should reinforce clarity, enunciation, and slower phrase shaping."
            )
        elif metric_name == "Pacing":
            notes.append(
                f"Pacing is averaging {metric_value:.1f}%, which points to call-control drift and a need for tighter transitions between probing and resolution."
            )
        elif metric_name == "Sentiment":
            notes.append(
                f"Sentiment is averaging {metric_value:.1f}%, so empathy, acknowledgement statements, and confident reassurance should be reinforced."
            )

    rate_of_speech = _metric_lookup(call_simulation_kpis, "Rate of Speech")
    if rate_of_speech:
        rate_of_speech_value = float(rate_of_speech.get("value") or 0.0)
        if rate_of_speech_value > 0 and rate_of_speech_value < 135.0:
            notes.append(
                f"Rate of Speech is averaging {_format_metric_value(rate_of_speech_value, 'wpm')}, which is slower than the target coaching range and may weaken call momentum."
            )
        elif rate_of_speech_value > 175.0:
            notes.append(
                f"Rate of Speech is averaging {_format_metric_value(rate_of_speech_value, 'wpm')}, which is faster than the target coaching range and may reduce clarity."
            )

    dead_air = _metric_lookup(call_simulation_kpis, "Dead Air")
    if dead_air:
        dead_air_value = float(dead_air.get("value") or 0.0)
        if dead_air_value > 3.0:
            notes.append(
                f"Dead Air is averaging {_format_metric_value(dead_air_value, 'sec')}, so trainees should rehearse bridging language and next-step ownership to reduce silence."
            )

    if coaching_notes:
        coaching_note = coaching_notes[0]
        feedback_summary = _normalize_text(coaching_note.get("feedback_summary"))
        action_plan = _normalize_text(coaching_note.get("action_plan"))
        if feedback_summary or action_plan:
            trainee_name = coaching_note.get("trainee_name") or "the trainee"
            scenario_title = coaching_note.get("scenario_title") or "Call Simulation"
            parts = [f'Latest coaching for {trainee_name} on "{scenario_title}"']
            if feedback_summary:
                parts.append(feedback_summary.rstrip("."))
            if action_plan:
                parts.append(f"Next step: {action_plan.rstrip('.')}")
            notes.append(". ".join(parts) + ".")

    if not notes:
        notes.append(
            "Call Simulation KPI patterns are currently stable, so keep reinforcing the same call flow while monitoring the next scored attempt set."
        )

    return _dedupe_notes(notes, 4)


def _module_activity_at(assignment: MicrolearningAssignment) -> Optional[datetime]:
    return (
        assignment.completed_at
        or assignment.updated_at
        or assignment.started_at
        or assignment.assigned_at
    )


def _assessment_activity_at(
    assessment: MCQAssessment,
    submission: Optional[MCQSubmission],
) -> Optional[datetime]:
    return (
        getattr(submission, "submitted_at", None)
        or assessment.updated_at
        or assessment.created_at
    )


def _build_score_distribution(values: list[float]) -> list[dict[str, Any]]:
    buckets = [
        ("0-59", 0, 60),
        ("60-69", 60, 70),
        ("70-79", 70, 80),
        ("80-89", 80, 90),
        ("90-100", 90, 101),
    ]
    distribution = []
    for label, lower, upper in buckets:
        count = sum(1 for value in values if lower <= float(value) < upper)
        distribution.append(
            {
                "range_label": label,
                "count": count,
            }
        )
    return distribution


def _trainer_scope(
    db: Session,
    *,
    trainer: User,
) -> dict[str, Any]:
    batches = (
        db.query(Batch)
        .filter(Batch.created_by == trainer.id, Batch.is_active == True)
        .order_by(Batch.wave_number.is_(None), Batch.wave_number.asc(), Batch.name.asc())
        .all()
    )
    batch_lookup = {batch.id: batch for batch in batches}
    candidate_trainee_lookup: dict[str, User] = {}
    trainee_lookup: dict[str, User] = {}
    trainee_batch_memberships: dict[str, list[Batch]] = defaultdict(list)

    for batch in batches:
        for trainee in batch.users:
            if trainee.role != UserRole.TRAINEE or not bool(getattr(trainee, "is_active", True)):
                continue
            candidate_trainee_lookup[trainee.id] = trainee

    active_trainee_lookup = {
        current_trainee.id: current_trainee
        for current_trainee in filter_to_supabase_active_users(
            db,
            list(candidate_trainee_lookup.values()),
        )
    }

    for batch in batches:
        for trainee in batch.users:
            current_trainee = active_trainee_lookup.get(trainee.id)
            if not current_trainee:
                continue
            trainee_lookup[current_trainee.id] = current_trainee
            trainee_batch_memberships[current_trainee.id].append(batch)

    return {
        "batches": batches,
        "batch_lookup": batch_lookup,
        "trainee_lookup": trainee_lookup,
        "trainee_batch_memberships": trainee_batch_memberships,
    }


def _resolve_primary_batch(
    trainee_id: str,
    memberships: dict[str, list[Batch]],
    preferred_batch_id: Optional[str] = None,
) -> Optional[Batch]:
    batches = memberships.get(trainee_id, [])
    if preferred_batch_id:
        for batch in batches:
            if batch.id == preferred_batch_id:
                return batch
    return batches[0] if batches else None


def _trainee_matches_batch(
    trainee_id: str,
    batch_id: str,
    memberships: dict[str, list[Batch]],
) -> bool:
    return any(batch.id == batch_id for batch in memberships.get(trainee_id, []))


def _build_ai_analysis(
    *,
    scope_label: str,
    summary: dict[str, Any],
    weakest_modules: list[dict[str, Any]],
    weakest_areas: list[dict[str, Any]],
    trainee_ranking: list[dict[str, Any]],
    improvement_rows: list[dict[str, Any]],
    batch_rows: list[dict[str, Any]],
    exercise_rows: list[dict[str, Any]],
    assessment_rows: list[dict[str, Any]],
    call_simulation_rows: list[dict[str, Any]],
    call_simulation_kpis: list[dict[str, Any]],
    coaching_notes: list[dict[str, Any]],
) -> dict[str, Any]:
    completion_rate = float(summary.get("completion_rate") or 0.0)
    pass_rate = float(summary.get("pass_rate") or 0.0)
    average_assessment_score = float(summary.get("average_assessment_score") or 0.0)
    average_exercise_score = float(summary.get("average_exercise_score") or 0.0)
    average_call_simulation_score = float(summary.get("average_call_simulation_score") or 0.0)
    coaching_completion_rate = float(summary.get("coaching_completion_rate") or 0.0)
    pending_coaching_logs = int(summary.get("pending_coaching_logs") or 0)

    strongest_signal = "module follow-through"
    if average_assessment_score >= average_exercise_score and average_assessment_score >= 80:
        strongest_signal = "assessment accuracy"
    elif average_call_simulation_score >= max(average_assessment_score, average_exercise_score) and average_call_simulation_score >= 80:
        strongest_signal = "call simulation execution"
    elif average_exercise_score >= 80:
        strongest_signal = "exercise execution"

    weakest_module = weakest_modules[0] if weakest_modules else None
    weakest_area = weakest_areas[0] if weakest_areas else None
    improvement_focus = improvement_rows[0] if improvement_rows else None
    top_trainee = trainee_ranking[0] if trainee_ranking else None
    top_batch = batch_rows[0] if batch_rows else None
    weakest_batch = next(
        iter(
            sorted(
                batch_rows,
                key=lambda row: (
                    float(row.get("overall_score") or 0.0),
                    float(row.get("completion_rate") or 0.0),
                    _normalize_text(row.get("batch_label")).lower(),
                ),
            )
        ),
        None,
    )
    weakest_exercise = next(
        iter(
            sorted(
                exercise_rows,
                key=lambda row: (
                    float(row.get("average_score") or 0.0),
                    float(row.get("completion_rate") or 0.0),
                    _normalize_text(row.get("module_title")).lower(),
                    _normalize_text(row.get("exercise_title")).lower(),
                ),
            )
        ),
        None,
    )
    weakest_assessment_attempt = next(
        iter(
            sorted(
                [
                    row
                    for row in assessment_rows
                    if row.get("score_percentage") is not None and not bool(row.get("is_passed"))
                ],
                key=lambda row: (
                    float(row.get("score_percentage") or 0.0),
                    -int(row.get("attempt_count") or 0),
                    _normalize_text(row.get("assessment_title")).lower(),
                ),
            )
        ),
        None,
    )

    headline = (
        f"AI Analysis: {scope_label} is showing {strongest_signal} as the clearest strength, "
        f"with a completion rate of {completion_rate:.1f}% and a pass rate of {pass_rate:.1f}%."
    )

    strengths: list[str] = []
    if top_trainee:
        strengths.append(
            f"{top_trainee['trainee_name']} is currently setting the pace with an overall learning score of "
            f"{float(top_trainee['overall_score'] or 0.0):.1f}%."
        )
    if top_batch:
        strengths.append(
            f'{top_batch["batch_label"]} is the strongest batch right now, with completion at '
            f'{float(top_batch.get("completion_rate") or 0.0):.1f}% and overall score at '
            f'{float(top_batch.get("overall_score") or 0.0):.1f}%.'
        )
    if average_assessment_score >= 80:
        strengths.append(
            f"Assessment accuracy is healthy at {average_assessment_score:.1f}%, which suggests knowledge checks are being retained."
        )
    if average_call_simulation_score >= 80:
        strengths.append(
            f"Call Simulation handling is stable at {average_call_simulation_score:.1f}%, which suggests trainees are carrying knowledge into realistic practice."
        )
    if average_exercise_score >= 80:
        strengths.append(
            f"Exercise performance is stable at {average_exercise_score:.1f}%, indicating trainees can apply the trainer-authored practice tasks."
        )
    if not strengths:
        strengths.append(
            "Participation is beginning to build, but the strongest performance pattern is still emerging from the current assignment set."
        )
    strengths = _dedupe_notes(strengths, 4)

    weak_areas: list[str] = []
    if weakest_module:
        weak_areas.append(
            f'The weakest module is "{weakest_module["module_title"]}" with a completion rate of '
            f'{float(weakest_module.get("completion_rate") or 0.0):.1f}% and an average exercise score of '
            f'{float(weakest_module.get("average_score") or 0.0):.1f}%.'
        )
    if weakest_area:
        weak_areas.append(
            f'The lowest assessment area is "{weakest_area["category_name"]}" with an average score of '
            f'{float(weakest_area.get("average_score") or 0.0):.1f}% and a pass rate of '
            f'{float(weakest_area.get("pass_rate") or 0.0):.1f}%.'
        )
    if improvement_focus:
        weak_areas.append(
            f'{improvement_focus["trainee_name"]} needs focused support because the current completion rate is '
            f'{float(improvement_focus.get("completion_rate") or 0.0):.1f}% and the pass rate is '
            f'{float(improvement_focus.get("pass_rate") or 0.0):.1f}%.'
        )
    if pending_coaching_logs > 0:
        weak_areas.append(
            f"{pending_coaching_logs} coaching log(s) are still waiting for acknowledgement, which can slow the retake and remediation cycle."
        )
    if not weak_areas:
        weak_areas.append(
            "There are no major risk clusters yet, but keeping assignment completion moving upward will protect the current pass rate."
        )
    weak_areas = _dedupe_notes(weak_areas, 4)

    opportunities: list[str] = []
    if weakest_batch and top_batch and weakest_batch.get("batch_id") != top_batch.get("batch_id"):
        opportunities.append(
            f'Opportunity: focus the next batch intervention on {weakest_batch["batch_label"]}, where completion is '
            f'{float(weakest_batch.get("completion_rate") or 0.0):.1f}% and overall score is '
            f'{float(weakest_batch.get("overall_score") or 0.0):.1f}%.'
        )
    if weakest_module:
        opportunities.append(
            f'Opportunity: refresh the learning path for "{weakest_module["module_title"]}" before assigning the next module wave.'
        )
    if weakest_area:
        opportunities.append(
            f'Opportunity: tighten coaching and item review around "{weakest_area["category_name"]}" to improve assessment reliability.'
        )
    if improvement_focus:
        opportunities.append(
            f'Opportunity: bring {improvement_focus["trainee_name"]} into a short remediation loop before performance drift widens further.'
        )
    if not opportunities:
        opportunities.append(
            "Opportunity: keep scaling the current strongest learning pattern while results remain stable."
        )
    opportunities = _dedupe_notes(opportunities, 4)

    weak_modules_categories: list[str] = []
    if weakest_module:
        weak_modules_categories.append(
            f'Weak module: "{weakest_module["module_title"]}" is converting poorly, with completion at '
            f'{float(weakest_module.get("completion_rate") or 0.0):.1f}% and pass rate at '
            f'{float(weakest_module.get("pass_rate") or 0.0):.1f}%.'
        )
    if weakest_area:
        weak_modules_categories.append(
            f'Weak category: "{weakest_area["category_name"]}" is the lowest assessment signal at '
            f'{float(weakest_area.get("average_score") or 0.0):.1f}% average score and '
            f'{float(weakest_area.get("pass_rate") or 0.0):.1f}% pass rate.'
        )
    if improvement_focus:
        weak_modules_categories.append(
            f'Priority trainee: {improvement_focus["trainee_name"]} is below target with completion at '
            f'{float(improvement_focus.get("completion_rate") or 0.0):.1f}% and pass rate at '
            f'{float(improvement_focus.get("pass_rate") or 0.0):.1f}%.'
        )
    if not weak_modules_categories:
        weak_modules_categories.append(
            "No weak module or category trend is standing out yet in the selected trainer scope."
        )
    weak_modules_categories = _dedupe_notes(weak_modules_categories, 4)

    assessment_improvement_notes: list[str] = []
    if weakest_area:
        assessment_improvement_notes.append(
            f'Assessment improvement note: strengthen "{weakest_area["category_name"]}" with targeted review, because the current average score is '
            f'{float(weakest_area.get("average_score") or 0.0):.1f}% across '
            f'{int(weakest_area.get("completed_count") or 0)} completed result{"" if int(weakest_area.get("completed_count") or 0) == 1 else "s"}.'
        )
    if weakest_assessment_attempt:
        assessment_improvement_notes.append(
            f'Assessment improvement note: {weakest_assessment_attempt.get("trainee_name") or "A trainee"} should revisit '
            f'"{weakest_assessment_attempt.get("assessment_title")}" after coaching on {weakest_assessment_attempt.get("category_name")}, '
            f'because the latest score is {float(weakest_assessment_attempt.get("score_percentage") or 0.0):.1f}% after '
            f'{int(weakest_assessment_attempt.get("attempt_count") or 0)} {_pluralize(int(weakest_assessment_attempt.get("attempt_count") or 0), "attempt")}.'
        )
    if not assessment_improvement_notes:
        assessment_improvement_notes.append(
            "Assessment improvement note: current assessment performance is steady, so keep reinforcing the same question-bank alignment and review rhythm."
        )
    assessment_improvement_notes = _dedupe_notes(assessment_improvement_notes, 4)

    exercise_improvement_notes: list[str] = []
    if weakest_exercise:
        exercise_improvement_notes.append(
            f'Exercise improvement note: "{weakest_exercise["exercise_title"]}" inside "{weakest_exercise["module_title"]}" needs clearer scaffolding because '
            f'average score is {float(weakest_exercise.get("average_score") or 0.0):.1f}% and completion is '
            f'{float(weakest_exercise.get("completion_rate") or 0.0):.1f}%.'
        )
    if weakest_module:
        exercise_improvement_notes.append(
            f'Exercise improvement note: rebuild the practice path around "{weakest_module["module_title"]}" so trainees can finish more of the required exercise set before the next assignment.'
        )
    if not exercise_improvement_notes:
        exercise_improvement_notes.append(
            "Exercise improvement note: practical exercise performance is holding steady, so keep the current exercise design and monitor the next attempt cycle."
        )
    exercise_improvement_notes = _dedupe_notes(exercise_improvement_notes, 4)

    call_simulation_kpi_coaching_notes = _build_call_simulation_kpi_coaching_notes(
        call_simulation_rows=call_simulation_rows,
        call_simulation_kpis=call_simulation_kpis,
        coaching_notes=coaching_notes,
    )

    actions: list[str] = []
    if weakest_module:
        actions.append(
            f'Recommended action: re-open "{weakest_module["module_title"]}", reinforce the lowest-scoring exercise, '
            "and require a short retake cycle before assigning the next module."
        )
    if weakest_area:
        actions.append(
            f'Recommended action: review the question bank and coaching coverage for "{weakest_area["category_name"]}" '
            "before issuing another assessment wave."
        )
    if completion_rate < 70:
        actions.append(
            "Recommended action: follow up with pending trainees first, because completion volume is now a larger risk than scoring quality."
        )
    if coaching_completion_rate < 75 and pending_coaching_logs > 0:
        actions.append(
            "Recommended action: close the open coaching loop first so trainees can acknowledge guidance and move into the next retake or reinforcement step."
        )
    if pass_rate < 75:
        actions.append(
            "Recommended action: keep the next assignments tightly targeted to the weakest module and lowest assessment category instead of broad reassignment."
        )
    if not actions:
        actions.append(
            "Recommended action: maintain the current pacing, then challenge the strongest trainees with a fresh assessment or higher-difficulty module."
        )
    recommended_next_action = _dedupe_notes(actions, 4)

    betterment_notes: list[str] = []
    if improvement_focus:
        betterment_notes.append(
            f'Betterment note: coach {improvement_focus["trainee_name"]} on consistent assignment follow-through first, then move into a targeted retake on the weakest module or category.'
        )
    if weakest_area:
        betterment_notes.append(
            f'Betterment note: use short reinforcement drills for "{weakest_area["category_name"]}" so agents can convert coached knowledge into stronger assessment accuracy.'
        )
    if average_call_simulation_score < 80:
        betterment_notes.append(
            "Betterment note: add one more coached mock-call repetition focused on active listening, call control, and problem resolution before the next live KPI check."
        )
    if pending_coaching_logs > 0:
        betterment_notes.append(
            f"Betterment note: close the {pending_coaching_logs} open coaching {_pluralize(pending_coaching_logs, 'acknowledgement')} so trainees can act on the guidance without delay."
        )
    if not betterment_notes:
        betterment_notes.append(
            "Betterment note: keep the same reinforcement rhythm and raise the next assignment difficulty gradually for the most stable trainees."
        )
    betterment_notes = _dedupe_notes(betterment_notes, 4)

    return {
        "headline": headline,
        "strengths": strengths,
        "opportunities": opportunities,
        "weak_modules_categories": weak_modules_categories,
        "assessment_improvement_notes": assessment_improvement_notes,
        "exercise_improvement_notes": exercise_improvement_notes,
        "call_simulation_kpi_coaching_notes": call_simulation_kpi_coaching_notes,
        "recommended_next_action": recommended_next_action,
        "betterment_notes": betterment_notes,
        "weak_areas": weak_areas,
        "recommended_actions": recommended_next_action,
    }


def build_trainer_learning_insights(
    db: Session,
    *,
    trainer: User,
    batch_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
    module_id: Optional[str] = None,
    assessment_id: Optional[str] = None,
    exercise_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict[str, Any]:
    scope = _trainer_scope(db, trainer=trainer)
    batches: list[Batch] = scope["batches"]
    batch_lookup: dict[str, Batch] = scope["batch_lookup"]
    trainee_lookup: dict[str, User] = scope["trainee_lookup"]
    trainee_batch_memberships: dict[str, list[Batch]] = scope["trainee_batch_memberships"]

    if batch_id and batch_id not in batch_lookup:
        raise ValueError("Batch not found")
    if trainee_id and trainee_id not in trainee_lookup:
        raise ValueError("Trainee not found")

    modules = (
        db.query(MicrolearningModule)
        .options(selectinload(MicrolearningModule.topic_category))
        .filter(
            MicrolearningModule.created_by == trainer.id,
            MicrolearningModule.is_active == True,
        )
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
            filter_key = _exercise_filter_key(module.id, exercise_row_id)
            option = {
                "id": filter_key,
                "exercise_id": exercise_row_id,
                "title": _normalize_text(exercise.get("title")) or _normalize_text(exercise.get("prompt")) or "Exercise",
                "type": _normalize_text(exercise.get("type")) or "exercise",
                "module_id": module.id,
                "module_title": module.title,
            }
            exercise_options.append(option)
            exercise_option_lookup[filter_key] = option
    exercise_options.sort(key=lambda row: (row["module_title"].lower(), row["title"].lower()))
    if exercise_id and exercise_id not in exercise_option_lookup:
        raise ValueError("Exercise not found")

    trainer_trainee_ids = set(trainee_lookup.keys())
    trainer_batch_ids = set(batch_lookup.keys())

    assessments = (
        db.query(MCQAssessment)
        .filter(
            MCQAssessment.assigned_by == trainer.id,
            MCQAssessment.is_active == True,
        )
        .order_by(MCQAssessment.updated_at.desc(), MCQAssessment.created_at.desc())
        .all()
    )
    filtered_assessments: list[MCQAssessment] = []
    for assessment in assessments:
        if assessment.assigned_batch_id and assessment.assigned_batch_id in trainer_batch_ids:
            filtered_assessments.append(assessment)
            continue
        if assessment.assigned_user_id and assessment.assigned_user_id in trainer_trainee_ids:
            filtered_assessments.append(assessment)
    assessments = filtered_assessments
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
        .filter(MicrolearningAssignment.assigned_by == trainer.id)
        .all()
    )
    microlearning_assignments = filter_current_assignments(microlearning_assignments)

    module_assignment_rows: list[dict[str, Any]] = []
    exercise_attempt_rows: list[dict[str, Any]] = []
    recent_activity: list[dict[str, Any]] = []

    for assignment in microlearning_assignments:
        refresh_assignment_progress(assignment)
        summary = serialize_assignment_summary(assignment)
        summary_module_id = _normalize_text(summary.get("module_id"))
        summary_trainee_id = _normalize_text(summary.get("user_id"))
        if not module_domain_enabled:
            continue
        if batch_id and not _trainee_matches_batch(summary_trainee_id, batch_id, trainee_batch_memberships):
            continue
        if trainee_id and summary_trainee_id != trainee_id:
            continue
        if module_id and summary_module_id != module_id:
            continue

        module = assignment.module
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
            "completion_percentage": float(summary.get("completion_percentage") or 0.0),
            "average_score": float(summary.get("average_score") or 0.0),
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
        }
        module_assignment_rows.append(row)

        if assignment.completed_at:
            recent_activity.append(
                {
                    "id": f"module-completed-{assignment.id}",
                    "activity_type": "module_completed",
                    "title": row["module_title"],
                    "detail": f'{row["trainee_name"] or "Trainee"} completed a trainer-assigned microlearning module.',
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
                    "score": float(attempt.get("score") or 0.0),
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
    for assessment in assessments:
        if not assessment_domain_enabled:
            continue
        if assessment_id and assessment.id != assessment_id:
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
            if batch_id and not _trainee_matches_batch(assessment_trainee.id, batch_id, trainee_batch_memberships):
                continue
            if trainee_id and assessment_trainee.id != trainee_id:
                continue

            submission = submissions_by_assessment.get(assessment.id, {}).get(assessment_trainee.id)
            activity_at = _assessment_activity_at(assessment, submission)
            if (start_at or end_at) and not _in_range(activity_at, start_at, end_at):
                continue

            scope_batch = _resolve_primary_batch(
                assessment_trainee.id,
                trainee_batch_memberships,
                preferred_batch_id=batch_id or assessment.assigned_batch_id,
            )
            certificate = mcq_certificates_by_assessment.get(assessment.id, {}).get(assessment_trainee.id)
            score_percentage = float(submission.score_percentage or 0.0) if submission else 0.0
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
                "is_passed": bool(submission.is_passed) if submission else False,
                "score_percentage": score_percentage if submission else None,
                "attempt_count": int(submission.attempt_count or 0) if submission else 0,
                "question_count": question_count,
                "passing_threshold": float(category.passing_threshold or 90.0) if category else 90.0,
                "certificate_id": certificate.id if certificate else None,
                "certificate_no": certificate.certificate_no if certificate else None,
                "due_date": _to_iso(assessment.due_date),
            }
            assessment_rows.append(row)
            if submission:
                recent_activity.append(
                    {
                        "id": f"assessment-submitted-{assessment.id}-{assessment_trainee.id}",
                        "activity_type": "assessment_submitted",
                        "title": assessment.title,
                        "detail": f'{assessment_trainee.full_name} submitted a trainer-assigned assessment.',
                        "trainee_id": assessment_trainee.id,
                        "trainee_name": assessment_trainee.full_name,
                        "batch_id": row["batch_id"],
                        "batch_label": row["batch_label"],
                        "score": score_percentage,
                        "status": "passed" if row["is_passed"] else "failed",
                        "activity_at": row["submitted_at"],
                    }
                )

    call_simulation_bundle = collect_call_simulation_rows(
        db,
        trainee_lookup=trainee_lookup,
        trainee_batch_memberships=trainee_batch_memberships,
        trainer_lookup={trainer.id: trainer},
        batch_id=batch_id,
        trainee_id=trainee_id,
        trainer_id=trainer.id,
        start_at=start_at,
        end_at=end_at,
    )
    call_simulation_rows: list[dict[str, Any]] = call_simulation_bundle["rows"]
    recent_activity.extend(call_simulation_bundle["recent_activity"])

    coaching_bundle = collect_coaching_rows(
        db,
        trainee_lookup=trainee_lookup,
        trainee_batch_memberships=trainee_batch_memberships,
        trainer_lookup={trainer.id: trainer},
        batch_id=batch_id,
        trainee_id=trainee_id,
        trainer_id=trainer.id,
        start_at=start_at,
        end_at=end_at,
    )
    coaching_rows: list[dict[str, Any]] = coaching_bundle["rows"]
    recent_activity.extend(coaching_bundle["recent_activity"])
    coaching_summary = coaching_bundle["summary"]
    coaching_notes_summary = coaching_bundle["notes_summary"]

    batch_ids_in_scope = {
        row["batch_id"]
        for row in [*module_assignment_rows, *assessment_rows, *call_simulation_rows, *coaching_rows]
        if row.get("batch_id")
    }
    tracked_trainee_ids = {
        row["trainee_id"]
        for row in [*module_assignment_rows, *assessment_rows, *call_simulation_rows, *coaching_rows]
        if row.get("trainee_id")
    }
    module_ids_in_scope = {row["module_id"] for row in module_assignment_rows if row.get("module_id")}
    assessment_ids_in_scope = {row["assessment_id"] for row in assessment_rows if row.get("assessment_id")}

    visible_batches = [
        batch
        for batch in batches
        if (not batch_id or batch.id == batch_id)
        and (batch.id in batch_ids_in_scope or batch.id == batch_id)
    ]
    if batch_id and batch_id in batch_lookup and not visible_batches:
        visible_batches = [batch_lookup[batch_id]]

    batch_options = [
        {
            "id": batch.id,
            "label": _format_batch_label(batch),
            "trainee_count": sum(
                1
                for current_trainee_id in tracked_trainee_ids
                if _trainee_matches_batch(current_trainee_id, batch.id, trainee_batch_memberships)
            ),
        }
        for batch in visible_batches
    ]

    visible_trainees = [
        current_trainee
        for current_trainee in trainee_lookup.values()
        if (not trainee_id or current_trainee.id == trainee_id)
        and (not batch_id or _trainee_matches_batch(current_trainee.id, batch_id, trainee_batch_memberships))
        and (current_trainee.id in tracked_trainee_ids or current_trainee.id == trainee_id)
    ]
    if trainee_id and trainee_id in trainee_lookup and not visible_trainees:
        visible_trainees = [trainee_lookup[trainee_id]]

    trainee_options = []
    for current_trainee in visible_trainees:
        memberships = trainee_batch_memberships.get(current_trainee.id, [])
        trainee_options.append(
            {
                "id": current_trainee.id,
                "name": current_trainee.full_name,
                "email": current_trainee.email,
                "batch_ids": [batch.id for batch in memberships],
                "batch_labels": [_format_batch_label(batch) for batch in memberships],
            }
        )
    trainee_options.sort(key=lambda row: row["name"].lower())

    module_options = [
        {
            "id": module.id,
            "title": module.title,
            "module_type": module.type,
            "topic_category_name": getattr(module.topic_category, "name", None),
        }
        for module in modules
        if module.id in module_ids_in_scope or module.id == module_id
    ]
    assessment_options = []
    for assessment in assessments:
        if assessment.id not in assessment_ids_in_scope and assessment.id != assessment_id:
            continue
        category = category_lookup.get(assessment.category_id)
        assessment_options.append(
            {
                "id": assessment.id,
                "title": assessment.title,
                "category_name": category.name if category else "Assessment",
                "assigned_batch_id": assessment.assigned_batch_id,
                "assigned_user_id": assessment.assigned_user_id,
            }
        )
    filtered_exercise_options = [
        option
        for option in exercise_options
        if option["id"] == exercise_id
        or option["module_id"] == module_id
        or option["module_id"] in module_ids_in_scope
    ]

    all_scores = [
        float(row["average_score"])
        for row in module_assignment_rows
        if int(row["completed_exercises"] or 0) > 0
    ] + [
        float(row["score_percentage"])
        for row in assessment_rows
        if row["score_percentage"] is not None
    ] + [
        float(row["score_value"])
        for row in call_simulation_rows
        if row["score_value"] is not None
    ]

    trainee_metric_map: dict[str, dict[str, Any]] = {}
    for current_trainee in trainee_lookup.values():
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
            "module_scores": [],
            "assessment_scores": [],
            "call_scores": [],
            "module_assigned": 0,
            "module_completed": 0,
            "module_passed": 0,
            "assessment_assigned": 0,
            "assessment_completed": 0,
            "assessment_passed": 0,
            "call_assigned": 0,
            "call_completed": 0,
            "call_passed": 0,
            "pending_coaching": 0,
            "acknowledged_coaching": 0,
            "retake_coaching": 0,
            "total_attempts": 0,
            "latest_activity_at": None,
        }

    for row in module_assignment_rows:
        metrics = trainee_metric_map.get(row["trainee_id"])
        if not metrics:
            continue
        metrics["module_assigned"] += 1
        metrics["total_attempts"] += max(int(row["attempt_number"] or 0), 0)
        if row["activity_at"] and (
            metrics["latest_activity_at"] is None or str(row["activity_at"]) > str(metrics["latest_activity_at"])
        ):
            metrics["latest_activity_at"] = row["activity_at"]
        if row["completed_exercises"] > 0:
            metrics["module_scores"].append(float(row["average_score"] or 0.0))
        if row["status"] in {"completed", "certified"}:
            metrics["module_completed"] += 1
        if row["is_passed"]:
            metrics["module_passed"] += 1

    for row in assessment_rows:
        metrics = trainee_metric_map.get(row["trainee_id"])
        if not metrics:
            continue
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

    for row in call_simulation_rows:
        metrics = trainee_metric_map.get(row["trainee_id"])
        if not metrics:
            continue
        metrics["call_assigned"] += 1
        metrics["total_attempts"] += max(int(row["attempt_count"] or 0), 0)
        if row["activity_at"] and (
            metrics["latest_activity_at"] is None or str(row["activity_at"]) > str(metrics["latest_activity_at"])
        ):
            metrics["latest_activity_at"] = row["activity_at"]
        if row["score_value"] is not None:
            metrics["call_scores"].append(float(row["score_value"] or 0.0))
        if row["completion_status"] == "completed":
            metrics["call_completed"] += 1
        if row["is_passed"]:
            metrics["call_passed"] += 1

    for row in coaching_rows:
        metrics = trainee_metric_map.get(row["trainee_id"])
        if not metrics:
            continue
        if row["status"] == "sent":
            metrics["pending_coaching"] += 1
        if row["status"] == "acknowledged":
            metrics["acknowledged_coaching"] += 1
        if row["competency_status"] == "not_competent":
            metrics["retake_coaching"] += 1
        if row["activity_at"] and (
            metrics["latest_activity_at"] is None or str(row["activity_at"]) > str(metrics["latest_activity_at"])
        ):
            metrics["latest_activity_at"] = row["activity_at"]

    trainee_ranking = []
    for metrics in trainee_metric_map.values():
        total_assigned = metrics["module_assigned"] + metrics["assessment_assigned"] + metrics["call_assigned"]
        total_completed = metrics["module_completed"] + metrics["assessment_completed"] + metrics["call_completed"]
        total_passed = metrics["module_passed"] + metrics["assessment_passed"] + metrics["call_passed"]
        overall_score = _average(metrics["module_scores"] + metrics["assessment_scores"] + metrics["call_scores"])
        completion_rate = round((total_completed / total_assigned) * 100.0, 2) if total_assigned else 0.0
        pass_rate = round((total_passed / total_completed) * 100.0, 2) if total_completed else 0.0
        pending_items = max(total_assigned - total_completed, 0)
        failed_items = max(total_completed - total_passed, 0)
        repeated_attempts = max(int(metrics["total_attempts"] or 0) - total_completed, 0)
        intervention_needed = (
            failed_items > 0
            or repeated_attempts > 0
            or overall_score < 75.0
            or int(metrics["pending_coaching"] or 0) > 0
            or int(metrics["retake_coaching"] or 0) > 0
        )
        trainee_ranking.append(
            {
                "trainee_id": metrics["trainee_id"],
                "trainee_name": metrics["trainee_name"],
                "batch_id": metrics["batch_id"],
                "batch_label": metrics["batch_label"],
                "overall_score": overall_score,
                "average_exercise_score": _average(metrics["module_scores"]),
                "average_assessment_score": _average(metrics["assessment_scores"]),
                "average_call_simulation_score": _average(metrics["call_scores"]),
                "module_completion_rate": round(
                    (metrics["module_completed"] / metrics["module_assigned"]) * 100.0,
                    2,
                )
                if metrics["module_assigned"]
                else 0.0,
                "call_simulation_completion_rate": round(
                    (metrics["call_completed"] / metrics["call_assigned"]) * 100.0,
                    2,
                )
                if metrics["call_assigned"]
                else 0.0,
                "completion_rate": completion_rate,
                "pass_rate": pass_rate,
                "module_assigned": metrics["module_assigned"],
                "module_completed": metrics["module_completed"],
                "module_passed": metrics["module_passed"],
                "assessment_assigned": metrics["assessment_assigned"],
                "assessment_completed": metrics["assessment_completed"],
                "assessment_passed": metrics["assessment_passed"],
                "call_simulation_assigned": metrics["call_assigned"],
                "call_simulation_completed": metrics["call_completed"],
                "call_simulation_passed": metrics["call_passed"],
                "pending_coaching": metrics["pending_coaching"],
                "acknowledged_coaching": metrics["acknowledged_coaching"],
                "retake_coaching": metrics["retake_coaching"],
                "pending_items": pending_items,
                "failed_items": failed_items,
                "repeated_attempts": repeated_attempts,
                "intervention_needed": intervention_needed,
                "total_attempts": metrics["total_attempts"],
                "latest_activity_at": metrics["latest_activity_at"],
            }
        )

    trainee_ranking = [
        row
        for row in trainee_ranking
        if (not batch_id or row["batch_id"] == batch_id)
        and (not trainee_id or row["trainee_id"] == trainee_id)
        and (
            row["module_assigned"] > 0
            or row["assessment_assigned"] > 0
            or row["call_simulation_assigned"] > 0
            or row["pending_coaching"] > 0
            or row["acknowledged_coaching"] > 0
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
    for batch in batches:
        if batch_id and batch.id != batch_id:
            continue
        batch_metric_map[batch.id] = {
            "batch_id": batch.id,
            "batch_label": _format_batch_label(batch),
            "trainee_ids": {
                trainee.id
                for trainee in batch.users
                if trainee.role == UserRole.TRAINEE and bool(getattr(trainee, "is_active", True))
            },
            "module_scores": [],
            "assessment_scores": [],
            "call_scores": [],
            "module_assigned": 0,
            "module_completed": 0,
            "module_passed": 0,
            "assessment_assigned": 0,
            "assessment_completed": 0,
            "assessment_passed": 0,
            "call_assigned": 0,
            "call_completed": 0,
            "call_passed": 0,
            "total_attempts": 0,
        }

    for row in module_assignment_rows:
        current_batch_id = _normalize_text(row.get("batch_id"))
        if current_batch_id not in batch_metric_map:
            continue
        metrics = batch_metric_map[current_batch_id]
        metrics["module_assigned"] += 1
        metrics["total_attempts"] += max(int(row["attempt_number"] or 0), 0)
        if row["completed_exercises"] > 0:
            metrics["module_scores"].append(float(row["average_score"] or 0.0))
        if row["status"] in {"completed", "certified"}:
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

    for row in call_simulation_rows:
        current_batch_id = _normalize_text(row.get("batch_id"))
        if current_batch_id not in batch_metric_map:
            continue
        metrics = batch_metric_map[current_batch_id]
        metrics["call_assigned"] += 1
        metrics["total_attempts"] += max(int(row["attempt_count"] or 0), 0)
        if row["score_value"] is not None:
            metrics["call_scores"].append(float(row["score_value"] or 0.0))
        if row["completion_status"] == "completed":
            metrics["call_completed"] += 1
        if row["is_passed"]:
            metrics["call_passed"] += 1

    batch_comparison = []
    for metrics in batch_metric_map.values():
        total_assigned = metrics["module_assigned"] + metrics["assessment_assigned"] + metrics["call_assigned"]
        total_completed = metrics["module_completed"] + metrics["assessment_completed"] + metrics["call_completed"]
        total_passed = metrics["module_passed"] + metrics["assessment_passed"] + metrics["call_passed"]
        pending_items = max(total_assigned - total_completed, 0)
        failed_items = max(total_completed - total_passed, 0)
        repeated_attempts = max(int(metrics["total_attempts"] or 0) - total_completed, 0)
        batch_comparison.append(
            {
                "batch_id": metrics["batch_id"],
                "batch_label": metrics["batch_label"],
                "trainee_count": len(metrics["trainee_ids"]),
                "assigned_items": total_assigned,
                "completed_items": total_completed,
                "pending_items": pending_items,
                "failed_items": failed_items,
                "completion_rate": round((total_completed / total_assigned) * 100.0, 2)
                if total_assigned
                else 0.0,
                "pass_rate": round((total_passed / total_completed) * 100.0, 2)
                if total_completed
                else 0.0,
                "average_exercise_score": _average(metrics["module_scores"]),
                "average_assessment_score": _average(metrics["assessment_scores"]),
                "average_call_simulation_score": _average(metrics["call_scores"]),
                "overall_score": _average(metrics["module_scores"] + metrics["assessment_scores"] + metrics["call_scores"]),
                "repeated_attempts": repeated_attempts,
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

    module_progress_lookup: dict[str, dict[str, Any]] = {}
    for row in module_assignment_rows:
        module_bucket = module_progress_lookup.setdefault(
            row["module_id"],
            {
                "module_id": row["module_id"],
                "module_title": row["module_title"],
                "module_type": row["module_type"],
                "topic_category_name": row["topic_category_name"],
                "assigned_count": 0,
                "completed_count": 0,
                "pending_count": 0,
                "passed_count": 0,
                "scores": [],
                "latest_activity_at": None,
            },
        )
        module_bucket["assigned_count"] += 1
        if row["status"] in {"completed", "certified"}:
            module_bucket["completed_count"] += 1
        else:
            module_bucket["pending_count"] += 1
        if row["is_passed"]:
            module_bucket["passed_count"] += 1
        if row["completed_exercises"] > 0:
            module_bucket["scores"].append(float(row["average_score"] or 0.0))
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
        module_progress.append(
            {
                "module_id": module_bucket["module_id"],
                "module_title": module_bucket["module_title"],
                "module_type": module_bucket["module_type"],
                "topic_category_name": module_bucket["topic_category_name"],
                "assigned_count": assigned_count,
                "completed_count": completed_count,
                "pending_count": int(module_bucket["pending_count"] or 0),
                "completion_rate": round((completed_count / assigned_count) * 100.0, 2)
                if assigned_count
                else 0.0,
                "pass_rate": round((passed_count / completed_count) * 100.0, 2)
                if completed_count
                else 0.0,
                "average_score": _average(module_bucket["scores"]),
                "latest_activity_at": module_bucket["latest_activity_at"],
            }
        )
    module_progress.sort(
        key=lambda row: (
            float(row["completion_rate"] or 0.0),
            float(row["average_score"] or 0.0),
            row["module_title"].lower(),
        ),
        reverse=True,
    )
    weakest_modules = sorted(
        module_progress,
        key=lambda row: (
            float(row["completion_rate"] or 0.0),
            float(row["average_score"] or 0.0),
            row["module_title"].lower(),
        ),
    )
    weakest_modules = weakest_modules[:5]

    assessment_area_lookup: dict[str, dict[str, Any]] = {}
    for row in assessment_rows:
        category_key = _normalize_text(row.get("category_id")) or _normalize_text(row.get("category_name"))
        bucket = assessment_area_lookup.setdefault(
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
        bucket["assigned_count"] += 1
        if row["score_percentage"] is not None:
            bucket["completed_count"] += 1
            bucket["scores"].append(float(row["score_percentage"] or 0.0))
            if row["is_passed"]:
                bucket["passed_count"] += 1

    weakest_assessment_areas = []
    for bucket in assessment_area_lookup.values():
        completed_count = int(bucket["completed_count"] or 0)
        weakest_assessment_areas.append(
            {
                "category_id": bucket["category_id"],
                "category_name": bucket["category_name"],
                "assigned_count": int(bucket["assigned_count"] or 0),
                "completed_count": completed_count,
                "average_score": _average(bucket["scores"]),
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
                    "assigned_count": 0,
                    "attempt_count": 0,
                    "completed_attempts": 0,
                    "scores": [],
                },
            )
            bucket["assigned_count"] += 1

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
        exercise_performance.append(
            {
                "exercise_filter_id": bucket["exercise_filter_id"],
                "exercise_id": bucket["exercise_id"],
                "exercise_title": bucket["exercise_title"],
                "exercise_type": bucket["exercise_type"],
                "module_id": bucket["module_id"],
                "module_title": bucket["module_title"],
                "assigned_count": assigned_count,
                "attempt_count": attempt_count,
                "completion_rate": round((int(bucket["completed_attempts"] or 0) / assigned_count) * 100.0, 2)
                if assigned_count
                else 0.0,
                "average_score": _average(bucket["scores"]),
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
    weakest_exercise_rows = exercise_performance[:5]
    exercise_performance.sort(
        key=lambda row: (
            float(row["average_score"] or 0.0),
            float(row["completion_rate"] or 0.0),
            row["module_title"].lower(),
            row["exercise_title"].lower(),
        ),
        reverse=True,
    )

    trainees_needing_improvement = [
        row
        for row in trainee_ranking
        if int(row.get("failed_items") or 0) > 0
        or int(row.get("repeated_attempts") or 0) > 0
        or float(row["overall_score"] or 0.0) < 75.0
        or int(row["pending_coaching"] or 0) > 0
        or int(row["retake_coaching"] or 0) > 0
    ]
    trainees_needing_improvement.sort(
        key=lambda row: (
            float(row["overall_score"] or 0.0),
            float(row["completion_rate"] or 0.0),
            row["trainee_name"].lower(),
        )
    )

    module_completed_count = sum(
        1 for row in module_assignment_rows if row["status"] in {"completed", "certified"}
    )
    module_passed_count = sum(1 for row in module_assignment_rows if row["is_passed"])
    module_pending_count = len(module_assignment_rows) - module_completed_count
    assessment_completed_count = sum(1 for row in assessment_rows if row["score_percentage"] is not None)
    assessment_passed_count = sum(1 for row in assessment_rows if row["is_passed"])
    call_simulation_completed_count = sum(1 for row in call_simulation_rows if row["completion_status"] == "completed")
    call_simulation_passed_count = sum(1 for row in call_simulation_rows if row["is_passed"])
    call_simulation_pending_count = len(call_simulation_rows) - call_simulation_completed_count
    call_simulation_in_progress_count = sum(1 for row in call_simulation_rows if row["completion_status"] == "in_progress")

    total_assigned_items = len(module_assignment_rows) + len(assessment_rows) + len(call_simulation_rows)
    total_completed_items = module_completed_count + assessment_completed_count + call_simulation_completed_count
    total_passed_items = module_passed_count + assessment_passed_count + call_simulation_passed_count
    failed_items = max(total_completed_items - total_passed_items, 0)
    pending_items = max(total_assigned_items - total_completed_items, 0)
    total_attempts = (
        sum(max(int(row["attempt_number"] or 0), 0) for row in module_assignment_rows)
        + sum(max(int(row["attempt_count"] or 0), 0) for row in assessment_rows)
        + sum(max(int(row["attempt_count"] or 0), 0) for row in call_simulation_rows)
    )
    repeated_attempts = max(total_attempts - total_completed_items, 0)
    overall_score = _average(all_scores)

    summary = {
        "trainer_created_modules": len(modules),
        "trainer_assigned_modules": len({row["module_id"] for row in module_assignment_rows}),
        "total_trainees": len(tracked_trainee_ids),
        "assigned_module_records": len(module_assignment_rows),
        "assigned_assessment_records": len(assessment_rows),
        "assigned_call_simulation_records": len(call_simulation_rows),
        "completed_modules": module_completed_count,
        "pending_modules": module_pending_count,
        "completed_call_simulations": call_simulation_completed_count,
        "pending_call_simulations": call_simulation_pending_count,
        "in_progress_call_simulations": call_simulation_in_progress_count,
        "pending_items": pending_items,
        "failed_items": failed_items,
        "completion_rate": round((total_completed_items / total_assigned_items) * 100.0, 2)
        if total_assigned_items
        else 0.0,
        "average_assessment_score": _average(
            [float(row["score_percentage"]) for row in assessment_rows if row["score_percentage"] is not None]
        ),
        "average_exercise_score": _average(
            [
                float(row["average_score"])
                for row in module_assignment_rows
                if int(row["completed_exercises"] or 0) > 0
            ]
        ),
        "average_call_simulation_score": _average(
            [float(row["score_value"]) for row in call_simulation_rows if row["score_value"] is not None]
        ),
        "pass_rate": round((total_passed_items / total_completed_items) * 100.0, 2)
        if total_completed_items
        else 0.0,
        "overall_score": overall_score,
        "call_simulation_pass_rate": round(
            (call_simulation_passed_count / call_simulation_completed_count) * 100.0,
            2,
        )
        if call_simulation_completed_count
        else 0.0,
        "total_attempts": total_attempts,
        "repeated_attempts": repeated_attempts,
        "active_trainees": sum(
            1
            for row in trainee_ranking
            if row["latest_activity_at"] is not None
        ),
        "published_coaching_logs": int(coaching_summary.get("published_logs") or 0),
        "pending_coaching_logs": int(coaching_summary.get("pending_logs") or 0),
        "acknowledged_coaching_logs": int(coaching_summary.get("acknowledged_logs") or 0),
        "coaching_completion_rate": float(coaching_summary.get("completion_rate") or 0.0),
        "intervention_needed_count": _count_intervention_needed_activities(
            module_assignment_rows=module_assignment_rows,
            assessment_rows=assessment_rows,
            call_simulation_rows=call_simulation_rows,
            coaching_notes=coaching_notes_summary,
        ),
        "passed_modules": module_passed_count,
        "passed_assessments": assessment_passed_count,
        "passed_call_simulations": call_simulation_passed_count,
        "completed_assessments": assessment_completed_count,
    }

    recent_activity.sort(
        key=lambda row: _normalize_text(row.get("activity_at")),
        reverse=True,
    )

    scope_parts = []
    if batch_id:
        scope_parts.append(_format_batch_label(batch_lookup.get(batch_id)))
    if trainee_id:
        scope_parts.append(trainee_lookup[trainee_id].full_name)
    if module_id:
        scope_parts.append(module_lookup[module_id].title)
    if assessment_id:
        scope_parts.append(assessment_lookup[assessment_id].title)
    if exercise_id:
        scope_parts.append(exercise_option_lookup[exercise_id]["title"])
    scope_label = " / ".join(scope_parts) if scope_parts else "Trainer scope"

    return {
        "scope": {
            "batch_id": batch_id,
            "trainee_id": trainee_id,
            "module_id": module_id,
            "assessment_id": assessment_id,
            "exercise_id": exercise_id,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "label": scope_label,
        },
        "filters": {
            "batches": batch_options,
            "trainees": trainee_options,
            "modules": module_options,
            "assessments": assessment_options,
            "exercises": filtered_exercise_options,
        },
        "summary": summary,
        "batch_comparison": batch_comparison,
        "trainee_ranking": trainee_ranking[:12],
        "score_distribution": _build_score_distribution(all_scores),
        "module_progress": module_progress[:12],
        "weakest_modules": weakest_modules,
        "weakest_assessment_areas": weakest_assessment_areas[:5],
        "exercise_performance": exercise_performance[:12],
        "call_simulation_performance": call_simulation_bundle["scenario_performance"],
        "call_simulation_kpi_breakdown": call_simulation_bundle["kpi_breakdown"],
        "call_simulation_results": sorted(
            call_simulation_rows,
            key=lambda row: _normalize_text(row.get("activity_at")),
            reverse=True,
        )[:50],
        "coaching_summary": coaching_summary,
        "coaching_notes_summary": coaching_notes_summary,
        "trainees_needing_improvement": trainees_needing_improvement[:10],
        "recent_activity": recent_activity[:12],
        "module_assignments": sorted(
            module_assignment_rows,
            key=lambda row: _normalize_text(row.get("activity_at")),
            reverse=True,
        )[:50],
        "assessment_results": sorted(
            assessment_rows,
            key=lambda row: _normalize_text(row.get("activity_at")),
            reverse=True,
        )[:50],
        "ai_analysis": _build_ai_analysis(
            scope_label=scope_label,
            summary=summary,
            weakest_modules=weakest_modules,
            weakest_areas=weakest_assessment_areas,
            trainee_ranking=trainee_ranking,
            improvement_rows=trainees_needing_improvement,
            batch_rows=batch_comparison,
            exercise_rows=weakest_exercise_rows,
            assessment_rows=assessment_rows,
            call_simulation_rows=call_simulation_bundle["scenario_performance"],
            call_simulation_kpis=call_simulation_bundle["kpi_breakdown"],
            coaching_notes=coaching_notes_summary,
        ),
    }
