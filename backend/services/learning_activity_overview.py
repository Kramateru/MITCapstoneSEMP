from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from ..models import Batch, CallSimulationAssignment, CoachingLog, Scenario, SimSession, User
from .coaching import load_latest_coaching_logs, serialize_coaching_log


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def to_iso(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    return value.isoformat()


def in_range(
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


def format_batch_label(batch: Optional[Batch]) -> str:
    if not batch:
        return "Direct Assignment"
    if batch.wave_number is not None:
        return f"{batch.name} | Wave {batch.wave_number}"
    return batch.name


def resolve_primary_batch(
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


def trainee_matches_batch(
    trainee_id: str,
    batch_id: str,
    memberships: dict[str, list[Batch]],
) -> bool:
    return any(batch.id == batch_id for batch in memberships.get(trainee_id, []))


def performance_level(score_value: Optional[float]) -> Optional[str]:
    if score_value is None:
        return None
    if score_value >= 90:
        return "excellent"
    if score_value >= 75:
        return "healthy"
    if score_value >= 60:
        return "developing"
    return "at_risk"


def _average(values: list[float]) -> float:
    cleaned = [float(value) for value in values if value is not None]
    return round(sum(cleaned) / len(cleaned), 2) if cleaned else 0.0


def _coaching_summary_from_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    published_rows = [row for row in rows if row["status"] in {"sent", "acknowledged"}]
    acknowledged_count = sum(1 for row in published_rows if row["status"] == "acknowledged")
    pending_count = sum(1 for row in published_rows if row["status"] == "sent")
    draft_count = sum(1 for row in rows if row["status"] == "draft")
    competent_count = sum(1 for row in rows if row["competency_status"] == "competent")
    retake_required_count = sum(1 for row in rows if row["competency_status"] == "not_competent")

    return {
        "total_logs": len(rows),
        "published_logs": len(published_rows),
        "acknowledged_logs": acknowledged_count,
        "pending_logs": pending_count,
        "draft_logs": draft_count,
        "competent_logs": competent_count,
        "retake_required_logs": retake_required_count,
        "completion_rate": round((acknowledged_count / len(published_rows)) * 100.0, 2)
        if published_rows
        else 0.0,
        "average_minutes": _average(
            [float(row["coaching_minutes"] or 0.0) for row in rows if row.get("coaching_minutes") is not None]
        ),
    }


def collect_coaching_rows(
    db: Session,
    *,
    trainee_lookup: dict[str, User],
    trainee_batch_memberships: dict[str, list[Batch]],
    trainer_lookup: Optional[dict[str, User]] = None,
    batch_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
    trainer_id: Optional[str] = None,
    start_at: Optional[datetime] = None,
    end_at: Optional[datetime] = None,
) -> dict[str, Any]:
    trainee_ids = [current_trainee_id for current_trainee_id in trainee_lookup if current_trainee_id]
    if not trainee_ids:
        return {
            "rows": [],
            "recent_activity": [],
            "summary": _coaching_summary_from_rows([]),
            "notes_summary": [],
        }

    payload = load_latest_coaching_logs(db, trainee_ids=trainee_ids)
    recent_activity: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []

    for log in payload.get("logs") or []:
        serialized = serialize_coaching_log(log)
        current_trainee_id = normalize_text(serialized.get("trainee_id"))
        if current_trainee_id not in trainee_lookup:
            continue
        if trainee_id and current_trainee_id != trainee_id:
            continue
        if trainer_id and normalize_text(serialized.get("trainer_id")) != trainer_id:
            continue
        if batch_id and not trainee_matches_batch(current_trainee_id, batch_id, trainee_batch_memberships):
            continue

        activity_at_dt = getattr(log, "acknowledged_at", None) or getattr(log, "updated_at", None) or getattr(log, "created_at", None)
        if (start_at or end_at) and not in_range(activity_at_dt, start_at, end_at):
            continue

        batch = resolve_primary_batch(
            current_trainee_id,
            trainee_batch_memberships,
            preferred_batch_id=batch_id,
        )
        trainer_name = serialized.get("trainer_name")
        if not trainer_name and trainer_lookup and serialized.get("trainer_id"):
            trainer_name = getattr(trainer_lookup.get(str(serialized["trainer_id"])), "full_name", None)

        row = {
            "id": serialized["id"],
            "coaching_id": serialized["coaching_id"],
            "source_type": serialized.get("source_type"),
            "trainer_id": serialized.get("trainer_id"),
            "trainer_name": trainer_name,
            "trainee_id": current_trainee_id,
            "trainee_name": serialized.get("trainee_name"),
            "batch_id": batch.id if batch else None,
            "batch_label": format_batch_label(batch) if batch else "Direct Assignment",
            "scenario_title": serialized.get("scenario_title") or "Coaching",
            "status": serialized.get("status") or "draft",
            "competency_status": serialized.get("competency_status") or "pending",
            "strengths": serialized.get("strengths"),
            "opportunities": serialized.get("opportunities"),
            "action_plan": serialized.get("action_plan"),
            "trainer_remarks": serialized.get("trainer_remarks"),
            "coaching_minutes": int(serialized.get("coaching_minutes") or 0),
            "overall_score": float(serialized["overall_score"]) if serialized.get("overall_score") is not None else None,
            "created_at": to_iso(getattr(log, "created_at", None)),
            "acknowledged_at": to_iso(getattr(log, "acknowledged_at", None)),
            "activity_at": to_iso(activity_at_dt),
        }
        rows.append(row)

        if row["status"] == "sent":
            recent_activity.append(
                {
                    "id": f"coaching-sent-{row['id']}",
                    "activity_type": "coaching_sent",
                    "title": row["scenario_title"],
                    "detail": f"{row['trainee_name'] or 'Trainee'} has a coaching log waiting for acknowledgement.",
                    "trainer_id": row["trainer_id"],
                    "trainer_name": row["trainer_name"],
                    "trainee_id": row["trainee_id"],
                    "trainee_name": row["trainee_name"],
                    "batch_id": row["batch_id"],
                    "batch_label": row["batch_label"],
                    "status": row["status"],
                    "activity_at": row["activity_at"],
                }
            )
        elif row["status"] == "acknowledged":
            recent_activity.append(
                {
                    "id": f"coaching-acknowledged-{row['id']}",
                    "activity_type": "coaching_acknowledged",
                    "title": row["scenario_title"],
                    "detail": f"{row['trainee_name'] or 'Trainee'} acknowledged a coaching log.",
                    "trainer_id": row["trainer_id"],
                    "trainer_name": row["trainer_name"],
                    "trainee_id": row["trainee_id"],
                    "trainee_name": row["trainee_name"],
                    "batch_id": row["batch_id"],
                    "batch_label": row["batch_label"],
                    "status": row["status"],
                    "activity_at": row["activity_at"],
                }
            )

    rows.sort(
        key=lambda row: normalize_text(row.get("activity_at")),
        reverse=True,
    )
    recent_activity.sort(
        key=lambda row: normalize_text(row.get("activity_at")),
        reverse=True,
    )

    notes_summary = [
        {
            "id": row["id"],
            "coaching_id": row["coaching_id"],
            "trainer_name": row["trainer_name"],
            "trainee_name": row["trainee_name"],
            "scenario_title": row["scenario_title"],
            "status": row["status"],
            "competency_status": row["competency_status"],
            "feedback_summary": row["trainer_remarks"] or row["opportunities"] or row["strengths"] or "No feedback recorded yet.",
            "action_plan": row["action_plan"] or "No action plan recorded yet.",
            "activity_at": row["activity_at"],
        }
        for row in rows[:8]
    ]

    return {
        "rows": rows,
        "recent_activity": recent_activity,
        "summary": _coaching_summary_from_rows(rows),
        "notes_summary": notes_summary,
    }


def collect_call_simulation_rows(
    db: Session,
    *,
    trainee_lookup: dict[str, User],
    trainee_batch_memberships: dict[str, list[Batch]],
    trainer_lookup: Optional[dict[str, User]] = None,
    batch_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
    trainer_id: Optional[str] = None,
    start_at: Optional[datetime] = None,
    end_at: Optional[datetime] = None,
    completion_status: Optional[str] = None,
    performance_level_filter: Optional[str] = None,
) -> dict[str, Any]:
    trainee_ids = [current_trainee_id for current_trainee_id in trainee_lookup if current_trainee_id]
    if not trainee_ids:
        return {
            "rows": [],
            "recent_activity": [],
            "scenario_performance": [],
            "kpi_breakdown": [],
            "summary": {
                "assigned_count": 0,
                "pending_count": 0,
                "in_progress_count": 0,
                "completed_count": 0,
                "passed_count": 0,
                "failed_count": 0,
                "average_score": 0.0,
                "pass_rate": 0.0,
                "total_attempts": 0,
            },
        }

    assignment_query = (
        db.query(CallSimulationAssignment)
        .options(
            joinedload(CallSimulationAssignment.scenario),
            joinedload(CallSimulationAssignment.batch),
            joinedload(CallSimulationAssignment.trainee),
            joinedload(CallSimulationAssignment.trainer),
        )
        .filter(
            CallSimulationAssignment.trainee_id.in_(trainee_ids),
            CallSimulationAssignment.is_active.is_(True),
        )
    )
    if trainer_id:
        assignment_query = assignment_query.filter(CallSimulationAssignment.assigned_by == trainer_id)

    assignments = assignment_query.order_by(
        CallSimulationAssignment.updated_at.desc(),
        CallSimulationAssignment.assigned_at.desc(),
    ).all()

    filtered_assignments: list[CallSimulationAssignment] = []
    assignments_by_pair: dict[tuple[str, str], CallSimulationAssignment] = {}
    for assignment in assignments:
        current_trainee_id = normalize_text(assignment.trainee_id)
        if current_trainee_id not in trainee_lookup:
            continue
        if trainee_id and current_trainee_id != trainee_id:
            continue
        if batch_id and not trainee_matches_batch(current_trainee_id, batch_id, trainee_batch_memberships):
            if normalize_text(assignment.batch_id) != batch_id:
                continue
        pair_key = (current_trainee_id, assignment.scenario_id)
        if pair_key in assignments_by_pair:
            continue
        assignments_by_pair[pair_key] = assignment
        filtered_assignments.append(assignment)

    if not filtered_assignments:
        return {
            "rows": [],
            "recent_activity": [],
            "scenario_performance": [],
            "kpi_breakdown": [],
            "summary": {
                "assigned_count": 0,
                "pending_count": 0,
                "in_progress_count": 0,
                "completed_count": 0,
                "passed_count": 0,
                "failed_count": 0,
                "average_score": 0.0,
                "pass_rate": 0.0,
                "total_attempts": 0,
            },
        }

    scenario_ids = list({assignment.scenario_id for assignment in filtered_assignments if assignment.scenario_id})
    scenario_lookup = {
        scenario.id: scenario
        for scenario in db.query(Scenario).filter(Scenario.id.in_(scenario_ids or ["__none__"])).all()
    }
    sessions = (
        db.query(SimSession)
        .filter(
            SimSession.trainee_id.in_(trainee_ids),
            SimSession.scenario_id.in_(scenario_ids or ["__none__"]),
            SimSession.status.in_(["pending", "in_progress", "completed", "failed"]),
        )
        .order_by(SimSession.created_at.desc(), SimSession.attempt_number.desc())
        .all()
    )

    sessions_by_pair: dict[tuple[str, str], list[SimSession]] = defaultdict(list)
    for session in sessions:
        sessions_by_pair[(session.trainee_id, session.scenario_id)].append(session)

    latest_coaching_logs: dict[str, CoachingLog] = {}
    finished_session_ids = [
        session.id
        for session in sessions
        if session.status in {"completed", "failed"}
    ]
    if finished_session_ids:
        coaching_query = (
            db.query(CoachingLog)
            .filter(CoachingLog.sim_session_id.in_(finished_session_ids))
            .order_by(CoachingLog.updated_at.desc(), CoachingLog.created_at.desc())
            .all()
        )
        for log in coaching_query:
            if log.sim_session_id and log.sim_session_id not in latest_coaching_logs:
                latest_coaching_logs[log.sim_session_id] = log

    rows: list[dict[str, Any]] = []
    recent_activity: list[dict[str, Any]] = []
    completed_session_rows: list[dict[str, Any]] = []

    for assignment in filtered_assignments:
        current_trainee_id = normalize_text(assignment.trainee_id)
        pair_sessions = sessions_by_pair.get((current_trainee_id, assignment.scenario_id), [])
        latest_session = pair_sessions[0] if pair_sessions else None
        active_session = next((session for session in pair_sessions if session.status == "in_progress"), None)
        latest_finished_session = next(
            (session for session in pair_sessions if session.status in {"completed", "failed"}),
            None,
        )
        activity_dt = (
            getattr(active_session, "updated_at", None)
            or getattr(active_session, "started_at", None)
            or getattr(latest_finished_session, "completed_at", None)
            or getattr(latest_finished_session, "updated_at", None)
            or getattr(latest_session, "created_at", None)
            or assignment.updated_at
            or assignment.assigned_at
        )
        if (start_at or end_at) and not in_range(activity_dt, start_at, end_at):
            continue

        if active_session:
            current_completion_status = "in_progress"
            current_status = "in_progress"
            score_value = None
            is_passed = False
        elif latest_finished_session:
            current_completion_status = "completed"
            is_passed = bool(latest_finished_session.pass_fail)
            current_status = "passed" if is_passed else "failed"
            score_value = float(latest_finished_session.weighted_score or 0.0)
        else:
            current_completion_status = "pending"
            current_status = "pending"
            score_value = None
            is_passed = False

        if completion_status and current_completion_status != completion_status:
            continue
        if performance_level_filter and performance_level(score_value) != performance_level_filter:
            continue

        scope_batch = resolve_primary_batch(
            current_trainee_id,
            trainee_batch_memberships,
            preferred_batch_id=batch_id or normalize_text(assignment.batch_id) or None,
        )
        scenario = assignment.scenario or scenario_lookup.get(assignment.scenario_id)
        coaching_log = latest_coaching_logs.get(latest_finished_session.id) if latest_finished_session else None
        trainer_name = (
            getattr(assignment.trainer, "full_name", None)
            or getattr((trainer_lookup or {}).get(assignment.assigned_by), "full_name", None)
        )
        latest_attempt_number = int(
            max((session.attempt_number or 1) for session in pair_sessions)
        ) if pair_sessions else 0
        completed_attempts = [
            session for session in pair_sessions if session.status in {"completed", "failed"}
        ]
        assignment_max_attempts = int(getattr(assignment, "max_attempts", None) or 0)
        max_attempts = int(
            getattr(active_session or latest_finished_session or latest_session, "max_attempts", None)
            or assignment_max_attempts
            or 0
        )

        row = {
            "id": assignment.id,
            "assignment_id": assignment.id,
            "scenario_id": assignment.scenario_id,
            "scenario_title": scenario.title if scenario else "Call Simulation",
            "trainee_id": current_trainee_id,
            "trainee_name": getattr(assignment.trainee, "full_name", None) or getattr(trainee_lookup.get(current_trainee_id), "full_name", None),
            "batch_id": scope_batch.id if scope_batch else assignment.batch_id,
            "batch_label": format_batch_label(scope_batch) if scope_batch else "Direct Assignment",
            "assigned_by": assignment.assigned_by,
            "assigned_by_name": trainer_name,
            "assigned_at": to_iso(assignment.assigned_at),
            "completion_status": current_completion_status,
            "status": current_status,
            "score_value": score_value,
            "performance_level": performance_level(score_value),
            "is_passed": is_passed,
            "attempt_count": len(completed_attempts),
            "latest_attempt_number": latest_attempt_number,
            "max_attempts": max_attempts,
            "latest_session_id": latest_session.id if latest_session else None,
            "active_session_id": active_session.id if active_session else None,
            "activity_at": to_iso(activity_dt),
            "completed_at": to_iso(getattr(latest_finished_session, "completed_at", None)),
            "audio_duration_seconds": getattr(latest_finished_session, "audio_duration_seconds", None),
            "ai_feedback": getattr(latest_finished_session, "ai_feedback", None),
            "certificate_id": getattr(latest_finished_session, "certificate_id", None),
            "trainer_verdict_status": getattr(latest_finished_session, "trainer_verdict_status", None),
            "coaching_id": getattr(coaching_log, "coaching_id", None),
            "coaching_status": getattr(coaching_log, "status", None),
            "coaching_acknowledged_at": to_iso(getattr(coaching_log, "acknowledged_at", None)),
            "speech_to_text_accuracy": float(latest_finished_session.speech_to_text_accuracy)
            if latest_finished_session and latest_finished_session.speech_to_text_accuracy is not None
            else None,
            "grammar_score": float(latest_finished_session.grammar_score)
            if latest_finished_session and latest_finished_session.grammar_score is not None
            else None,
            "pronunciation_score": float(latest_finished_session.pronunciation_score)
            if latest_finished_session and latest_finished_session.pronunciation_score is not None
            else None,
            "pacing_score": float(latest_finished_session.pacing_score)
            if latest_finished_session and latest_finished_session.pacing_score is not None
            else None,
            "sentiment_score": float(latest_finished_session.sentiment_score)
            if latest_finished_session and latest_finished_session.sentiment_score is not None
            else None,
            "rate_of_speech": float(latest_finished_session.rate_of_speech)
            if latest_finished_session and latest_finished_session.rate_of_speech is not None
            else None,
            "dead_air_seconds": float(latest_finished_session.dead_air_seconds)
            if latest_finished_session and latest_finished_session.dead_air_seconds is not None
            else None,
            "final_attempt_locked": bool(
                latest_finished_session
                and not is_passed
                and max_attempts > 0
                and int(latest_finished_session.attempt_number or 0) >= max_attempts
            ),
        }
        rows.append(row)

        if latest_finished_session and score_value is not None:
            completed_session_rows.append(row)
            recent_activity.append(
                {
                    "id": f"call-simulation-completed-{latest_finished_session.id}",
                    "activity_type": "call_simulation_completed",
                    "title": row["scenario_title"],
                    "detail": f'{row["trainee_name"] or "Trainee"} completed an assigned Call Simulation scenario.',
                    "trainer_id": row["assigned_by"],
                    "trainer_name": row["assigned_by_name"],
                    "trainee_id": row["trainee_id"],
                    "trainee_name": row["trainee_name"],
                    "batch_id": row["batch_id"],
                    "batch_label": row["batch_label"],
                    "score": row["score_value"],
                    "status": row["status"],
                    "activity_at": row["completed_at"] or row["activity_at"],
                }
            )
        elif active_session:
            recent_activity.append(
                {
                    "id": f"call-simulation-started-{active_session.id}",
                    "activity_type": "call_simulation_started",
                    "title": row["scenario_title"],
                    "detail": f'{row["trainee_name"] or "Trainee"} is currently working on an assigned Call Simulation scenario.',
                    "trainer_id": row["assigned_by"],
                    "trainer_name": row["assigned_by_name"],
                    "trainee_id": row["trainee_id"],
                    "trainee_name": row["trainee_name"],
                    "batch_id": row["batch_id"],
                    "batch_label": row["batch_label"],
                    "status": row["status"],
                    "activity_at": row["activity_at"],
                }
            )

    rows.sort(
        key=lambda row: normalize_text(row.get("activity_at")),
        reverse=True,
    )
    recent_activity.sort(
        key=lambda row: normalize_text(row.get("activity_at")),
        reverse=True,
    )

    scenario_totals: dict[str, dict[str, Any]] = {}
    for row in rows:
        bucket = scenario_totals.setdefault(
            row["scenario_id"],
            {
                "scenario_id": row["scenario_id"],
                "scenario_title": row["scenario_title"],
                "assigned_count": 0,
                "completed_count": 0,
                "in_progress_count": 0,
                "pending_count": 0,
                "passed_count": 0,
                "scores": [],
                "attempt_counts": [],
                "latest_activity_at": None,
            },
        )
        bucket["assigned_count"] += 1
        if row["completion_status"] == "completed":
            bucket["completed_count"] += 1
        elif row["completion_status"] == "in_progress":
            bucket["in_progress_count"] += 1
        else:
            bucket["pending_count"] += 1
        if row["is_passed"]:
            bucket["passed_count"] += 1
        if row["score_value"] is not None:
            bucket["scores"].append(float(row["score_value"] or 0.0))
        if row["attempt_count"] is not None:
            bucket["attempt_counts"].append(float(row["attempt_count"] or 0.0))
        if row["activity_at"] and (
            bucket["latest_activity_at"] is None or str(row["activity_at"]) > str(bucket["latest_activity_at"])
        ):
            bucket["latest_activity_at"] = row["activity_at"]

    scenario_performance = []
    for bucket in scenario_totals.values():
        assigned_count = int(bucket["assigned_count"] or 0)
        completed_count = int(bucket["completed_count"] or 0)
        passed_count = int(bucket["passed_count"] or 0)
        pending_count = max(assigned_count - completed_count, 0)
        scenario_performance.append(
            {
                "scenario_id": bucket["scenario_id"],
                "scenario_title": bucket["scenario_title"],
                "assigned_count": assigned_count,
                "completed_count": completed_count,
                "in_progress_count": int(bucket["in_progress_count"] or 0),
                "pending_count": pending_count,
                "pass_rate": round((passed_count / completed_count) * 100.0, 2)
                if completed_count
                else 0.0,
                "average_score": _average(bucket["scores"]),
                "average_attempts": _average(bucket["attempt_counts"]),
                "latest_activity_at": bucket["latest_activity_at"],
            }
        )
    scenario_performance.sort(
        key=lambda row: (
            float(row["average_score"] or 0.0),
            float(row["pass_rate"] or 0.0),
            row["scenario_title"].lower(),
        ),
        reverse=True,
    )

    kpi_sources = completed_session_rows
    kpi_breakdown = [
        {"metric": "Speech To Text", "value": _average([row["speech_to_text_accuracy"] for row in kpi_sources if row["speech_to_text_accuracy"] is not None]), "unit": "%"},
        {"metric": "Grammar", "value": _average([row["grammar_score"] for row in kpi_sources if row["grammar_score"] is not None]), "unit": "%"},
        {"metric": "Pronunciation", "value": _average([row["pronunciation_score"] for row in kpi_sources if row["pronunciation_score"] is not None]), "unit": "%"},
        {"metric": "Pacing", "value": _average([row["pacing_score"] for row in kpi_sources if row["pacing_score"] is not None]), "unit": "%"},
        {"metric": "Sentiment", "value": _average([row["sentiment_score"] for row in kpi_sources if row["sentiment_score"] is not None]), "unit": "%"},
        {"metric": "Rate of Speech", "value": _average([row["rate_of_speech"] for row in kpi_sources if row["rate_of_speech"] is not None]), "unit": "wpm"},
        {"metric": "Dead Air", "value": _average([row["dead_air_seconds"] for row in kpi_sources if row["dead_air_seconds"] is not None]), "unit": "sec"},
    ]

    completed_count = sum(1 for row in rows if row["completion_status"] == "completed")
    passed_count = sum(1 for row in rows if row["is_passed"])
    assigned_count = len(rows)
    summary = {
        "assigned_count": assigned_count,
        "pending_count": max(assigned_count - completed_count, 0),
        "in_progress_count": sum(1 for row in rows if row["completion_status"] == "in_progress"),
        "completed_count": completed_count,
        "passed_count": passed_count,
        "failed_count": sum(1 for row in rows if row["completion_status"] == "completed" and not row["is_passed"]),
        "average_score": _average([row["score_value"] for row in rows if row["score_value"] is not None]),
        "pass_rate": round((passed_count / completed_count) * 100.0, 2) if completed_count else 0.0,
        "total_attempts": sum(max(int(row["attempt_count"] or 0), 0) for row in rows),
    }

    return {
        "rows": rows,
        "recent_activity": recent_activity,
        "scenario_performance": scenario_performance[:12],
        "kpi_breakdown": kpi_breakdown,
        "summary": summary,
    }
