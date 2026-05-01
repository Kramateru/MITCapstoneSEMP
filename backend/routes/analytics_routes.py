"""
Analytics Routes
Handles reporting, dashboards, and performance tracking
"""

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import (
    PracticeSession,
    User,
    UserRole,
    PerformanceMetrics,
    Batch,
    Scenario,
    Feedback,
    CertificateRecord,
    CoachingLog,
    KPIConfiguration,
    MicrolearningAssignment,
)
from ..services.supabase_auth_service import filter_to_supabase_active_users
from ..schemas import (
    BatchAnalyticsResponse,
    PerformanceMetricsResponse,
    TraineeProgressResponse,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

CATEGORY_METRICS = [
    ("Pronunciation", "accuracy_score"),
    ("Fluency", "fluency_score"),
    ("Clarity", "clarity_score"),
    ("Keyword Adherence", "keyword_adherence_score"),
    ("Soft Skills", "soft_skills_score"),
]

IMPROVEMENT_RECOMMENDATIONS = {
    "Pronunciation": "Focus on articulation drills and keyword enunciation practice.",
    "Fluency": "Practice pacing control and reduce filler words during live simulations.",
    "Pacing": "Practice pacing control and reduce filler words during live simulations.",
    "Clarity": "Tighten verification statements and make next-step explanations more explicit.",
    "Keyword Adherence": "Review the required keywords for each scenario before the next attempt.",
    "Grammar": "Review grammar patterns, sentence structure, and required knowledge keywords before the next attempt.",
    "Soft Skills": "Strengthen empathy language and proactive ownership statements.",
}


def _trainer_has_trainee_access(current_user: User, trainee: User) -> bool:
    if current_user.role != UserRole.TRAINER:
        return False

    return any(batch.created_by == current_user.id for batch in trainee.batches)


def _average(values: List[float]) -> float:
    cleaned = [float(value) for value in values if value is not None]
    return round(sum(cleaned) / len(cleaned), 2) if cleaned else 0.0


def _scores_for_sessions(sessions: List[PracticeSession], attribute: str) -> List[float]:
    scores: List[float] = []
    for session in sessions:
        value = getattr(session, attribute, None)
        if value is not None:
            scores.append(float(value))
    return scores


def _build_weekly_trend(sessions: List[PracticeSession], weeks: int = 6) -> List[dict]:
    today = datetime.utcnow().date()
    current_week_start = today - timedelta(days=today.weekday())
    buckets = []
    bucket_map = {}

    for offset in range(weeks - 1, -1, -1):
        week_start = current_week_start - timedelta(weeks=offset)
        bucket = {
            "label": week_start.strftime("%b %d"),
            "attempts": 0,
            "scores": [],
        }
        buckets.append(bucket)
        bucket_map[week_start] = bucket

    for session in sessions:
        if not session.created_at:
            continue
        week_start = session.created_at.date() - timedelta(days=session.created_at.weekday())
        bucket = bucket_map.get(week_start)
        if not bucket:
            continue
        bucket["attempts"] += 1
        if session.overall_score is not None:
            bucket["scores"].append(float(session.overall_score))

    return [
        {
            "label": bucket["label"],
            "avg_score": _average(bucket["scores"]),
            "attempts": bucket["attempts"],
        }
        for bucket in buckets
    ]


def _category_average_rows(sessions: List[PracticeSession], target_score: float) -> List[dict]:
    rows = []
    for label, attribute in CATEGORY_METRICS:
        average_score = _average(_scores_for_sessions(sessions, attribute))
        rows.append(
            {
                "label": label,
                "score": average_score,
                "target": round(float(target_score), 2),
            }
        )
    return rows


def _progress_state(sessions: List[PracticeSession]) -> str:
    ordered_scores = [float(s.overall_score) for s in sessions if s.overall_score is not None]
    if len(ordered_scores) < 2:
        return "stable"

    sample_size = min(3, len(ordered_scores))
    baseline = _average(ordered_scores[:sample_size])
    recent = _average(ordered_scores[-sample_size:])
    delta = recent - baseline

    if delta > 2:
        return "improving"
    if delta < -2:
        return "declining"
    return "stable"


def _microlearning_assignment_score(responses: object) -> float:
    if not isinstance(responses, dict):
        return 0.0

    completed_scores = [
        float(attempt.get("score") or 0.0)
        for attempt in responses.values()
        if isinstance(attempt, dict) and attempt.get("is_completed")
    ]
    return round(sum(completed_scores) / len(completed_scores), 2) if completed_scores else 0.0


def _resolve_period_range(
    *,
    month: Optional[int],
    year: Optional[int],
) -> tuple[Optional[datetime], Optional[datetime], str]:
    if month and year:
        from calendar import monthrange

        _, last_day = monthrange(year, month)
        return (
            datetime(year, month, 1),
            datetime(year, month, last_day, 23, 59, 59),
            f"{month}/{year}",
        )

    if year:
        return (
            datetime(year, 1, 1),
            datetime(year, 12, 31, 23, 59, 59),
            f"All Months {year}",
        )

    return None, None, "all_time"


# ==================== Trainee Progress ====================


@router.get("/trainee/{trainee_id}/progress", response_model=TraineeProgressResponse)
async def get_trainee_progress(
    trainee_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get trainee progress overview"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Check access (trainee sees own data, trainers/admins see all)
    if current_user.id != trainee_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Get trainee
    trainee = db.query(User).filter(User.id == trainee_id).first()
    if not trainee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trainee not found"
        )
    
    # Get practice sessions
    sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id == trainee_id
    ).order_by(PracticeSession.created_at.desc()).all()
    
    total_sessions = len(sessions)
    sessions_passed = sum((s.overall_score or 0) >= 70 for s in sessions)

    # Calculate average score (only count sessions with a score)
    scored = [s.overall_score for s in sessions if s.overall_score is not None]
    avg_score = sum(scored) / len(scored) if scored else 0.0

    latest_score = sessions[0].overall_score if sessions and sessions[0].overall_score is not None else None

    # Determine improvement trend using moving averages
    trend = "stable"
    if len(scored) >= 2:
        recent = scored[:3]
        older = scored[3:6]
        recent_avg = sum(recent) / len(recent) if recent else 0
        older_avg = sum(older) / len(older) if older else 0
        if recent_avg > older_avg:
            trend = "improving"
        elif recent_avg < older_avg:
            trend = "declining"
    
    return TraineeProgressResponse(
        trainee_id=trainee_id,
        trainee_name=trainee.full_name,
        total_sessions=total_sessions,
        sessions_passed=sessions_passed,
        current_average_score=avg_score,
        latest_session_score=latest_score,
        improvement_trend=trend,
        last_updated=datetime.utcnow()
    )


@router.get("/trainee/{trainee_id}/sessions", response_model=List[dict])
async def get_trainee_session_history(
    trainee_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get trainee's practice session history"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Check access
    if current_user.id != trainee_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id == trainee_id
    ).order_by(PracticeSession.created_at.desc()).offset(skip).limit(limit).all()
    
    result = []
    for session in sessions:
        scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
        result.append({
            "id": session.id,
            "scenario_id": session.scenario_id,
            "scenario_title": scenario.title if scenario else "Unknown",
            "attempt_number": session.attempt_number,
            "overall_score": session.overall_score,
            "accuracy_score": session.accuracy_score,
            "fluency_score": session.fluency_score,
            "created_at": session.created_at,
            "status": session.status
        })
    
    return result


@router.get("/trainee/{trainee_id}/metrics", response_model=List[PerformanceMetricsResponse])
async def get_trainee_metrics(
    trainee_id: str,
    period: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    days: int = Query(30, ge=1, le=365),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get trainee performance metrics"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Check access
    if current_user.id != trainee_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    metrics = db.query(PerformanceMetrics).filter(
        PerformanceMetrics.user_id == trainee_id,
        PerformanceMetrics.period == period,
        PerformanceMetrics.metric_date >= datetime.utcnow() - timedelta(days=days)
    ).order_by(PerformanceMetrics.metric_date.desc()).all()
    
    return [PerformanceMetricsResponse.from_orm(m) for m in metrics]


# ==================== Batch Analytics ====================


@router.get("/batch/{batch_id}", response_model=BatchAnalyticsResponse)
async def get_batch_analytics(
    batch_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get analytics for entire batch"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Get batch
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch not found"
        )
    
    # Check access (trainer/admin only)
    if current_user.role == UserRole.TRAINEE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainer or admin access required"
        )
    if current_user.role == UserRole.TRAINER and batch.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This batch does not belong to your trainer account",
        )
    
    # Get all trainees in batch
    trainees = [u for u in batch.users if u.role == UserRole.TRAINEE]
    total_trainees = len(trainees)
    
    # Get all sessions for batch trainees
    trainee_ids = [t.id for t in trainees]
    sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id.in_(trainee_ids)
    ).all()
    
    total_sessions = len(sessions)
    sessions_passed = sum((s.overall_score or 0) >= 70 for s in sessions)
    
    # Calculate batch average score
    if sessions and any(s.overall_score for s in sessions):
        avg_batch_score = sum(s.overall_score for s in sessions if s.overall_score) / len([s for s in sessions if s.overall_score])
    else:
        avg_batch_score = 0.0
    
    passing_rate = (sessions_passed / total_sessions * 100) if total_sessions > 0 else 0.0
    
    # Get top performers and needs improvement
    trainee_progress = []
    for trainee in trainees:
        trainee_sessions = [s for s in sessions if s.user_id == trainee.id]
        if trainee_sessions and any(s.overall_score for s in trainee_sessions):
            avg_score = sum(s.overall_score for s in trainee_sessions if s.overall_score) / len([s for s in trainee_sessions if s.overall_score])
        else:
            avg_score = 0.0
        
        latest_score = trainee_sessions[0].overall_score if trainee_sessions and trainee_sessions[0].overall_score else None
        
        trainee_progress.append(TraineeProgressResponse(
            trainee_id=trainee.id,
            trainee_name=trainee.full_name,
            total_sessions=len(trainee_sessions),
            sessions_passed=sum((s.overall_score or 0) >= 70 for s in trainee_sessions),
            current_average_score=avg_score,
            latest_session_score=latest_score,
            improvement_trend="stable",
            last_updated=datetime.utcnow()
        ))
    
    # Sort by score
    trainee_progress.sort(key=lambda x: x.current_average_score, reverse=True)
    top_performers = trainee_progress[:3]
    needs_improvement = trainee_progress[-3:] if len(trainee_progress) > 3 else []
    
    return BatchAnalyticsResponse(
        batch_id=batch_id,
        batch_name=batch.name,
        total_trainees=total_trainees,
        sessions_completed=total_sessions,
        average_batch_score=avg_batch_score,
        passing_rate=passing_rate,
        top_performers=top_performers,
        needs_improvement=needs_improvement
    )


# ==================== Dashboard Overview ====================


@router.get("/dashboard/trainer", response_model=dict)
async def get_trainer_dashboard(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get trainer dashboard with assignments and batch performance"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role != UserRole.TRAINER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainer access required"
        )
    
    # Get trainer's batches
    batches = db.query(Batch).filter(Batch.created_by == current_user.id).all()
    
    dashboard_data = {
        "trainer_id": current_user.id,
        "trainer_name": current_user.full_name,
        "batches": []
    }
    
    for batch in batches:
        # Get batch analytics
        trainee_ids = [u.id for u in batch.users if u.role == UserRole.TRAINEE]
        sessions = db.query(PracticeSession).filter(
            PracticeSession.user_id.in_(trainee_ids)
        ).all()
        
        avg_batch_score = 0.0
        if sessions and any(s.overall_score for s in sessions):
            avg_batch_score = sum(s.overall_score for s in sessions if s.overall_score) / len([s for s in sessions if s.overall_score])
        
        dashboard_data["batches"].append({
            "batch_id": batch.id,
            "batch_name": batch.name,
            "trainee_count": len([u for u in batch.users if u.role == UserRole.TRAINEE]),
            "sessions_completed": len(sessions),
            "average_score": avg_batch_score
        })
    
    return dashboard_data


@router.get("/dashboard/admin", response_model=dict)
async def get_admin_dashboard(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get admin dashboard with system-wide analytics"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Get system statistics
    total_users = db.query(User).count()
    total_trainees = db.query(User).filter(User.role == UserRole.TRAINEE).count()
    total_trainers = db.query(User).filter(User.role == UserRole.TRAINER).count()
    
    total_sessions = db.query(PracticeSession).count()
    sessions_passed = db.query(PracticeSession).filter(
        PracticeSession.overall_score >= 70
    ).count()
    
    overall_passing_rate = (sessions_passed / total_sessions * 100) if total_sessions > 0 else 0.0
    
    return {
        "system_stats": {
            "total_users": total_users,
            "total_trainees": total_trainees,
            "total_trainers": total_trainers,
            "total_sessions": total_sessions,
            "sessions_passed": sessions_passed,
            "overall_passing_rate": overall_passing_rate
        }
    }


@router.get("/admin/performance-hub")
async def get_admin_performance_hub(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get platform-wide performance analytics sourced from real trainee session data."""
    current_user = await auth_utils.get_current_user(authorization, db)

    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    all_trainees = (
        db.query(User)
        .filter(User.role == UserRole.TRAINEE, User.is_active == True)
        .all()
    )
    trainees = filter_to_supabase_active_users(db, all_trainees)
    active_trainee_count = len(trainees)
    trainee_lookup = {trainee.id: trainee for trainee in trainees}
    trainee_ids = list(trainee_lookup.keys())

    sessions = []
    if trainee_ids:
        sessions = (
            db.query(PracticeSession)
            .filter(PracticeSession.user_id.in_(trainee_ids))
            .order_by(PracticeSession.created_at.asc())
            .all()
        )

    scored_sessions = [float(session.overall_score) for session in sessions if session.overall_score is not None]
    sessions_passed = sum((session.overall_score or 0) >= 70 for session in sessions)
    trainee_ids_with_activity = {session.user_id for session in sessions}
    kpi_config = db.query(KPIConfiguration).first()
    target_score = float(kpi_config.passing_score) if kpi_config else 75.0

    sessions_by_user: dict[str, List[PracticeSession]] = {}
    lob_buckets: dict[str, dict] = {}
    for trainee in trainees:
        lob_name = trainee.lob or "Unassigned"
        lob_bucket = lob_buckets.setdefault(
            lob_name,
            {"name": lob_name, "user_ids": set(), "scores": [], "sessions": 0},
        )
        lob_bucket["user_ids"].add(trainee.id)

    for session in sessions:
        sessions_by_user.setdefault(session.user_id, []).append(session)
        trainee = trainee_lookup.get(session.user_id)
        if not trainee:
            continue
        lob_name = trainee.lob if trainee and trainee.lob else "Unassigned"
        lob_bucket = lob_buckets.setdefault(
            lob_name,
            {"name": lob_name, "user_ids": set(), "scores": [], "sessions": 0},
        )
        lob_bucket["user_ids"].add(trainee.id)
        lob_bucket["sessions"] += 1
        if session.overall_score is not None:
            lob_bucket["scores"].append(float(session.overall_score))

    leaderboard = []
    for trainee in trainees:
        trainee_sessions = sessions_by_user.get(trainee.id, [])
        leaderboard.append(
            {
                "trainee_id": trainee.id,
                "trainee_name": trainee.full_name,
                "lob": trainee.lob or "Unassigned",
                "average_score": _average(
                    [float(session.overall_score) for session in trainee_sessions if session.overall_score is not None]
                ),
                "session_count": len(trainee_sessions),
                "latest_session_at": trainee_sessions[-1].created_at if trainee_sessions else None,
            }
        )

    leaderboard.sort(
        key=lambda item: (item["average_score"], item["session_count"]),
        reverse=True,
    )

    all_trainers = (
        db.query(User)
        .filter(User.role == UserRole.TRAINER, User.is_active.is_(True))
        .all()
    )
    trainers = filter_to_supabase_active_users(db, all_trainers)
    trainer_lookup = {trainer.id: trainer for trainer in trainers}
    batches_by_trainer: dict[str, list[Batch]] = {trainer.id: [] for trainer in trainers}
    batch_ids_with_activity_by_trainer: dict[str, set[str]] = {trainer.id: set() for trainer in trainers}
    trainee_ids_by_trainer: dict[str, set[str]] = {trainer.id: set() for trainer in trainers}

    for batch in db.query(Batch).filter(Batch.created_by.isnot(None), Batch.is_active.is_(True)).all():
        if batch.created_by not in trainer_lookup:
            continue
        batch_trainee_ids = {
            trainee.id
            for trainee in batch.users
            if trainee.role == UserRole.TRAINEE and trainee.is_active and trainee.id in trainee_lookup
        }
        if not batch_trainee_ids:
            continue
        batches_by_trainer.setdefault(batch.created_by, []).append(batch)
        trainer_trainee_ids = trainee_ids_by_trainer.setdefault(batch.created_by, set())
        trainer_trainee_ids.update(batch_trainee_ids)
        if batch_trainee_ids & trainee_ids_with_activity:
            batch_ids_with_activity_by_trainer.setdefault(batch.created_by, set()).add(batch.id)

    certification_counts = {
        trainer_id: count
        for trainer_id, count in (
            db.query(CertificateRecord.trainer_id, func.count(CertificateRecord.id))
            .join(User, User.id == CertificateRecord.trainee_id)
            .filter(
                CertificateRecord.trainer_id.isnot(None),
                CertificateRecord.trainer_id.in_(list(trainer_lookup.keys()) or ["__none__"]),
                User.role == UserRole.TRAINEE,
                User.is_active.is_(True),
                User.id.in_(trainee_ids or ["__none__"]),
            )
            .group_by(CertificateRecord.trainer_id)
            .all()
        )
    }

    trainer_analytics = []
    for trainer in trainers:
        managed_trainee_ids = trainee_ids_by_trainer.get(trainer.id, set())
        trainer_sessions = [
            session for session in sessions if session.user_id in managed_trainee_ids
        ]
        certification_count = certification_counts.get(trainer.id, 0)
        trainer_session_scores = [
            float(session.overall_score)
            for session in trainer_sessions
            if session.overall_score is not None
        ]
        trainer_sessions_passed = sum(
            (session.overall_score or 0) >= 70 for session in trainer_sessions
        )

        trainer_analytics.append(
            {
                "trainer_id": trainer.id,
                "trainer_name": trainer.full_name,
                "batches_managed": len(batches_by_trainer.get(trainer.id, [])),
                "total_trainees": len(managed_trainee_ids),
                "avg_batch_performance": _average(trainer_session_scores),
                "pass_rate": round(
                    (
                        trainer_sessions_passed / len(trainer_sessions) * 100
                    )
                    if trainer_sessions
                    else 0.0,
                    2,
                ),
                "total_sessions": len(trainer_sessions),
                "certifications_issued": certification_count,
                "last_activity": trainer_sessions[-1].created_at if trainer_sessions else None,
            }
        )

    trainer_analytics.sort(
        key=lambda item: (
            item["avg_batch_performance"],
            item["pass_rate"],
            item["total_sessions"],
            item["trainer_name"],
        ),
        reverse=True,
    )

    trainer_microlearning_buckets = {
        trainer.id: {
            "trainer_id": trainer.id,
            "trainer_name": trainer.full_name,
            "assignment_count": 0,
            "completed_count": 0,
            "certified_count": 0,
            "scores": [],
        }
        for trainer in trainers
    }
    trainer_coaching_buckets = {
        trainer.id: {
            "trainer_id": trainer.id,
            "trainer_name": trainer.full_name,
            "total_logs": 0,
            "sent_count": 0,
            "acknowledged_count": 0,
            "draft_count": 0,
            "competent_count": 0,
            "not_competent_count": 0,
        }
        for trainer in trainers
    }

    if trainer_lookup and trainee_ids:
        trainer_ids = list(trainer_lookup.keys())
        microlearning_assignments = (
            db.query(MicrolearningAssignment)
            .filter(
                MicrolearningAssignment.assigned_by.in_(trainer_ids),
                MicrolearningAssignment.trainee_id.in_(trainee_ids),
            )
            .all()
        )
        for assignment in microlearning_assignments:
            bucket = trainer_microlearning_buckets.get(assignment.assigned_by)
            if not bucket:
                continue
            bucket["assignment_count"] += 1
            if assignment.status in {"completed", "certified"}:
                bucket["completed_count"] += 1
            if assignment.certificate_id:
                bucket["certified_count"] += 1

            score = _microlearning_assignment_score(assignment.responses)
            if score > 0:
                bucket["scores"].append(score)

        coaching_logs = (
            db.query(CoachingLog)
            .filter(
                CoachingLog.trainer_id.in_(trainer_ids),
                CoachingLog.trainee_id.in_(trainee_ids),
            )
            .all()
        )
        for log in coaching_logs:
            bucket = trainer_coaching_buckets.get(log.trainer_id)
            if not bucket:
                continue
            bucket["total_logs"] += 1
            if log.status == "acknowledged":
                bucket["acknowledged_count"] += 1
            elif log.status == "sent":
                bucket["sent_count"] += 1
            elif log.status == "draft":
                bucket["draft_count"] += 1

            if log.competency_status == "competent":
                bucket["competent_count"] += 1
            elif log.competency_status == "not_competent":
                bucket["not_competent_count"] += 1

    trainer_microlearning = [
        {
            "trainer_id": bucket["trainer_id"],
            "trainer_name": bucket["trainer_name"],
            "assignment_count": bucket["assignment_count"],
            "completed_count": bucket["completed_count"],
            "certified_count": bucket["certified_count"],
            "average_score": _average(bucket["scores"]),
            "completion_rate": round(
                (bucket["completed_count"] / bucket["assignment_count"] * 100)
                if bucket["assignment_count"]
                else 0.0,
                2,
            ),
            "certification_rate": round(
                (bucket["certified_count"] / bucket["assignment_count"] * 100)
                if bucket["assignment_count"]
                else 0.0,
                2,
            ),
        }
        for bucket in trainer_microlearning_buckets.values()
    ]
    trainer_microlearning.sort(
        key=lambda item: (
            item["assignment_count"],
            item["certified_count"],
            item["completion_rate"],
            item["trainer_name"],
        ),
        reverse=True,
    )

    trainer_coaching = [
        {
            "trainer_id": bucket["trainer_id"],
            "trainer_name": bucket["trainer_name"],
            "total_logs": bucket["total_logs"],
            "sent_count": bucket["sent_count"],
            "acknowledged_count": bucket["acknowledged_count"],
            "draft_count": bucket["draft_count"],
            "competent_count": bucket["competent_count"],
            "not_competent_count": bucket["not_competent_count"],
            "acknowledgment_rate": round(
                (bucket["acknowledged_count"] / bucket["total_logs"] * 100)
                if bucket["total_logs"]
                else 0.0,
                2,
            ),
        }
        for bucket in trainer_coaching_buckets.values()
    ]
    trainer_coaching.sort(
        key=lambda item: (
            item["total_logs"],
            item["acknowledged_count"],
            item["acknowledgment_rate"],
            item["trainer_name"],
        ),
        reverse=True,
    )

    return {
        "summary": {
            "total_trainees": active_trainee_count,
            "total_trainers": len(trainers),
            "average_performance": _average(scored_sessions),
            "certifications_issued": sum(certification_counts.values()),
            "total_sessions": len(sessions),
            "avg_session_duration": _average(
                [float(session.response_duration) for session in sessions if session.response_duration is not None]
            ),
            "asr_confidence": _average(
                [
                    float(session.transcription_confidence) * 100
                    for session in sessions
                    if session.transcription_confidence is not None
                ]
            ),
            "completion_rate": round(
                (len(trainee_ids_with_activity) / active_trainee_count * 100) if active_trainee_count else 0.0,
                2,
            ),
            "pass_rate": round(
                (sessions_passed / len(sessions) * 100) if sessions else 0.0,
                2,
            ),
            "avg_retries": _average(
                [float(session.attempt_number) for session in sessions if session.attempt_number is not None]
            ),
            "target_score": round(target_score, 2),
        },
        "performance_trend": _build_weekly_trend(sessions, weeks=6),
        "category_scores": [
            {"name": row["label"], "value": row["score"]}
            for row in _category_average_rows(sessions, target_score)
        ],
        "lob_breakdown": [
            {
                "name": bucket["name"],
                "agents": len(bucket["user_ids"]),
                "avgScore": _average(bucket["scores"]),
                "sessions": bucket["sessions"],
            }
            for bucket in sorted(
                lob_buckets.values(),
                key=lambda item: (item["sessions"], len(item["user_ids"]), item["name"]),
                reverse=True,
            )
        ],
        "leaderboard": leaderboard[:6],
        "trainer_analytics": trainer_analytics,
        "trainer_microlearning": trainer_microlearning,
        "trainer_coaching": trainer_coaching,
    }


@router.get("/trainer/performance-hub")
async def get_trainer_performance_hub(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get trainer-facing performance analytics from the trainer's real trainee cohort."""
    current_user = await auth_utils.get_current_user(authorization, db)

    if current_user.role != UserRole.TRAINER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainer access required",
        )

    batches = (
        db.query(Batch)
        .filter(Batch.created_by == current_user.id, Batch.is_active.is_(True))
        .all()
    )

    candidate_trainee_lookup: dict[str, User] = {}
    for batch in batches:
        for user in batch.users:
            if user.role != UserRole.TRAINEE or not user.is_active:
                continue
            candidate_trainee_lookup[user.id] = user

    active_trainees = filter_to_supabase_active_users(
        db,
        list(candidate_trainee_lookup.values()),
    )
    trainee_lookup = {trainee.id: trainee for trainee in active_trainees}
    batch_names_by_trainee: dict[str, List[str]] = {trainee_id: [] for trainee_id in trainee_lookup}
    for batch in batches:
        for user in batch.users:
            if user.id not in trainee_lookup:
                continue
            if batch.name not in batch_names_by_trainee[user.id]:
                batch_names_by_trainee[user.id].append(batch.name)

    trainee_ids = list(trainee_lookup.keys())
    sessions = []
    if trainee_ids:
        sessions = (
            db.query(PracticeSession)
            .filter(PracticeSession.user_id.in_(trainee_ids))
            .order_by(PracticeSession.created_at.asc())
            .all()
        )

    sessions_by_user: dict[str, List[PracticeSession]] = {}
    scenario_buckets: dict[str, dict] = {}
    for session in sessions:
        sessions_by_user.setdefault(session.user_id, []).append(session)
        scenario_name = session.scenario.title if session.scenario else "Unknown Scenario"
        bucket = scenario_buckets.setdefault(
            scenario_name,
            {"scenario": scenario_name, "scores": [], "sessions": 0, "passed": 0},
        )
        bucket["sessions"] += 1
        if session.overall_score is not None:
            bucket["scores"].append(float(session.overall_score))
        if (session.overall_score or 0) >= 70:
            bucket["passed"] += 1

    kpi_config = db.query(KPIConfiguration).first()
    target_score = float(kpi_config.passing_score) if kpi_config else 75.0

    batch_comparison = []
    for batch in batches:
        batch_trainees = [
            user
            for user in batch.users
            if user.id in trainee_lookup
        ]
        batch_trainee_ids = {trainee.id for trainee in batch_trainees}
        if not batch_trainee_ids:
            continue
        batch_sessions = [session for session in sessions if session.user_id in batch_trainee_ids]
        batch_comparison.append(
            {
                "batch": batch.name,
                "score": _average(
                    [float(session.overall_score) for session in batch_sessions if session.overall_score is not None]
                ),
                "sessions": len(batch_sessions),
                "trainees": len(batch_trainees),
                "pass_rate": round(
                    (
                        sum((session.overall_score or 0) >= 70 for session in batch_sessions)
                        / len(batch_sessions)
                        * 100
                    )
                    if batch_sessions
                    else 0.0,
                    2,
                ),
            }
        )

    scenario_breakdown = sorted(
        [
            {
                "scenario": bucket["scenario"],
                "avg_score": _average(bucket["scores"]),
                "sessions": bucket["sessions"],
                "pass_rate": round(
                    (bucket["passed"] / bucket["sessions"] * 100) if bucket["sessions"] else 0.0,
                    2,
                ),
            }
            for bucket in scenario_buckets.values()
        ],
        key=lambda row: (row["sessions"], row["avg_score"], row["scenario"]),
        reverse=True,
    )[:6]

    trainee_rows = []
    for trainee_id, trainee in trainee_lookup.items():
        trainee_sessions = sessions_by_user.get(trainee_id, [])
        trainee_rows.append(
            {
                "trainee_id": trainee_id,
                "trainee_name": trainee.full_name,
                "batch_name": ", ".join(batch_names_by_trainee.get(trainee_id, [])) or "Unassigned",
                "avg_score": _average(
                    [float(session.overall_score) for session in trainee_sessions if session.overall_score is not None]
                ),
                "session_count": len(trainee_sessions),
                "pass_rate": round(
                    (
                        sum((session.overall_score or 0) >= 70 for session in trainee_sessions)
                        / len(trainee_sessions)
                        * 100
                    )
                    if trainee_sessions
                    else 0.0,
                    2,
                ),
                "trend": _progress_state(trainee_sessions),
            }
        )

    trainee_rows.sort(key=lambda row: (row["avg_score"], row["session_count"]), reverse=True)

    total_sessions = len(sessions)
    sessions_passed = sum((session.overall_score or 0) >= 70 for session in sessions)

    return {
        "summary": {
            "active_batches": len(batch_comparison),
            "total_trainees": len(trainee_lookup),
            "total_sessions": total_sessions,
            "average_score": _average(
                [float(session.overall_score) for session in sessions if session.overall_score is not None]
            ),
            "pass_rate": round((sessions_passed / total_sessions * 100) if total_sessions else 0.0, 2),
            "avg_response_duration": _average(
                [float(session.response_duration) for session in sessions if session.response_duration is not None]
            ),
            "asr_confidence": _average(
                [
                    float(session.transcription_confidence) * 100
                    for session in sessions
                    if session.transcription_confidence is not None
                ]
            ),
            "verified_rate": round(
                (sum(1 for session in sessions if session.is_verified) / total_sessions * 100)
                if total_sessions
                else 0.0,
                2,
            ),
        },
        "weekly_progress": _build_weekly_trend(sessions, weeks=6),
        "category_scores": [
            {
                "category": row["label"],
                "score": row["score"],
                "target": row["target"],
            }
            for row in _category_average_rows(sessions, target_score)
        ],
        "batch_comparison": batch_comparison,
        "scenario_breakdown": scenario_breakdown,
        "top_performers": trainee_rows[:5],
        "needs_attention": sorted(trainee_rows, key=lambda row: (row["avg_score"], row["session_count"]))[:5],
    }


@router.get("/trainee/performance-hub")
async def get_trainee_performance_hub(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Get trainee-facing performance analytics from the trainee's own database records."""
    current_user = await auth_utils.get_current_user(authorization, db)

    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trainee access required",
        )

    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .order_by(PracticeSession.created_at.asc())
        .all()
    )

    overall_scores = [float(session.overall_score) for session in sessions if session.overall_score is not None]
    kpi_config = db.query(KPIConfiguration).first()
    target_score = float(kpi_config.passing_score) if kpi_config else 75.0
    category_rows = _category_average_rows(sessions, target_score)
    best_category = max(category_rows, key=lambda row: row["score"]) if sessions and category_rows else None
    sample_size = min(3, len(overall_scores)) if overall_scores else 0
    improvement_from_start = 0.0
    if sample_size:
        improvement_from_start = round(
            _average(overall_scores[-sample_size:]) - _average(overall_scores[:sample_size]),
            2,
        )

    recent_sessions = list(reversed(sessions[-5:]))
    improvement_areas = [
        {
            "category": row["label"],
            "current": row["score"],
            "target": row["target"],
            "recommendation": IMPROVEMENT_RECOMMENDATIONS[row["label"]],
        }
        for row in sorted(category_rows, key=lambda item: item["score"])
        if row["score"] < row["target"]
    ]
    if not improvement_areas:
        improvement_areas = [
            {
                "category": row["label"],
                "current": row["score"],
                "target": row["target"],
                "recommendation": IMPROVEMENT_RECOMMENDATIONS[row["label"]],
            }
            for row in sorted(category_rows, key=lambda item: item["score"])[:2]
        ]

    return {
        "summary": {
            "current_avg_score": _average(overall_scores),
            "best_category": best_category["label"] if best_category else "No scored category yet",
            "best_category_score": best_category["score"] if best_category else 0.0,
            "certifications": db.query(CertificateRecord).filter(CertificateRecord.trainee_id == current_user.id).count(),
            "improvement_from_start": improvement_from_start,
        },
        "weekly_scores": [
            {"week": point["label"], "score": point["avg_score"]}
            for point in _build_weekly_trend(sessions, weeks=6)
        ],
        "category_scores": [
            {
                "category": row["label"],
                "score": row["score"],
                "target": row["target"],
            }
            for row in category_rows
        ],
        "radar_data": [
            {
                "subject": row["label"],
                "score": row["score"],
                "fullMark": 100,
            }
            for row in category_rows
        ],
        "recent_activity": [
            {
                "scenario": session.scenario.title if session.scenario else "Unknown Scenario",
                "score": round(float(session.overall_score or 0), 2),
                "date": session.created_at.isoformat() if session.created_at else None,
            }
            for session in recent_sessions
        ],
        "improvement_areas": improvement_areas[:3],
    }


# ==================== Export Functions ====================


@router.get("/export/trainee/{trainee_id}")
async def export_trainee_report(
    trainee_id: str,
    format: str = Query("json", pattern="^(json|csv)$"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Export trainee progress report"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Check access
    if current_user.id != trainee_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Get trainee data
    trainee = db.query(User).filter(User.id == trainee_id).first()
    if not trainee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trainee not found"
        )
    
    sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id == trainee_id
    ).order_by(PracticeSession.created_at.desc()).all()
    
    return {
        "trainee_name": trainee.full_name,
        "trainee_email": trainee.email,
        "export_date": datetime.utcnow().isoformat(),
        "sessions": [
            {
                "session_id": s.id,
                "scenario_id": s.scenario_id,
                "overall_score": s.overall_score,
                "accuracy": s.accuracy_score,
                "fluency": s.fluency_score,
                "clarity": s.clarity_score,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "status": s.status
            }
            for s in sessions
        ]
    }


# ==================== Advanced Reporting ====================


@router.get("/reports/batch/{batch_id}/pronunciation-errors")
async def get_batch_pronunciation_errors(
    batch_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get summary of pronunciation errors for entire batch - instantaneous, no manual tallying"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Check access
    if current_user.role == UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainer access required")
    if current_user.role == UserRole.TRAINER and batch.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    trainee_ids = [u.id for u in batch.users if u.role == UserRole.TRAINEE]
    sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id.in_(trainee_ids)
    ).all()
    
    # Aggregate pronunciation errors
    error_summary = {
        "total_sessions": len(sessions),
        "batch_name": batch.name,
        "wave_number": batch.wave_number,
        "common_errors": [],
        "trainee_errors": {},
        "average_pronunciation_score": 0.0,
        "trainees_below_threshold": []
    }
    
    all_word_feedbacks = []
    pronunciation_scores = []
    
    for session in sessions:
        if session.accuracy_score is not None:
            pronunciation_scores.append(float(session.accuracy_score))
        
        # Extract word-level errors from assessment_data
        if session.word_feedback:
            all_word_feedbacks.extend(session.word_feedback)
        
        trainee = db.query(User).filter(User.id == session.user_id).first()
        trainee_name = trainee.full_name if trainee else "Unknown"
        
        if trainee_name not in error_summary["trainee_errors"]:
            error_summary["trainee_errors"][trainee_name] = {
                "trainee_id": session.user_id,
                "sessions_count": 0,
                "avg_pronunciation": 0.0,
                "errors": []
            }
        
        error_summary["trainee_errors"][trainee_name]["sessions_count"] += 1
        if session.accuracy_score is not None:
            error_summary["trainee_errors"][trainee_name]["avg_pronunciation"] = session.accuracy_score
    
    # Count error types
    error_counts = {}
    for feedback in all_word_feedbacks:
        if isinstance(feedback, dict) and "error_type" in feedback:
            error_type = feedback["error_type"]
            if error_type not in error_counts:
                error_counts[error_type] = {"count": 0, "examples": []}
            error_counts[error_type]["count"] += 1
            if "word" in feedback and len(error_counts[error_type]["examples"]) < 5:
                error_counts[error_type]["examples"].append(feedback["word"])
    
    error_summary["common_errors"] = [
        {"error_type": k, "frequency": v["count"], "examples": v["examples"]}
        for k, v in sorted(error_counts.items(), key=lambda x: x[1]["count"], reverse=True)
    ]
    
    error_summary["average_pronunciation_score"] = _average(pronunciation_scores)
    
    # Find trainees below threshold (70)
    for trainee_name, data in error_summary["trainee_errors"].items():
        if data["avg_pronunciation"] < 70:
            error_summary["trainees_below_threshold"].append({
                "name": trainee_name,
                "score": data["avg_pronunciation"],
                "sessions": data["sessions_count"]
            })
    
    error_summary["trainees_below_threshold"].sort(key=lambda x: x["score"])
    error_summary["trainee_errors"] = dict(sorted(
        error_summary["trainee_errors"].items(),
        key=lambda x: x[1]["avg_pronunciation"]
    ))
    
    return error_summary


@router.get("/reports/batch/{batch_id}/improvement-areas")
async def get_batch_improvement_areas(
    batch_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get improvement needs for grammar, pronunciation, pacing, and soft skills"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Check access  
    if current_user.role == UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainer access required")
    if current_user.role == UserRole.TRAINER and batch.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    trainee_ids = [u.id for u in batch.users if u.role == UserRole.TRAINEE]
    sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id.in_(trainee_ids)
    ).all()
    
    # Calculate improvement areas
    improvement_data = {
        "batch_name": batch.name,
        "total_trainees": len(trainee_ids),
        "improvement_categories": [
            {
                "category": "Pronunciation (Accuracy)",
                "average": _average([s.accuracy_score for s in sessions if s.accuracy_score is not None]),
                "below_threshold_count": sum(1 for s in sessions if s.accuracy_score and s.accuracy_score < 70),
                "recommendation": IMPROVEMENT_RECOMMENDATIONS["Pronunciation"]
            },
            {
                "category": "Pacing (Fluency)",
                "average": _average([s.fluency_score for s in sessions if s.fluency_score is not None]),
                "below_threshold_count": sum(1 for s in sessions if s.fluency_score and s.fluency_score < 70),
                "recommendation": IMPROVEMENT_RECOMMENDATIONS["Fluency"]
            },
            {
                "category": "Clarity",
                "average": _average([s.clarity_score for s in sessions if s.clarity_score is not None]),
                "below_threshold_count": sum(1 for s in sessions if s.clarity_score and s.clarity_score < 70),
                "recommendation": IMPROVEMENT_RECOMMENDATIONS["Clarity"]
            },
            {
                "category": "Grammar & Keywords",
                "average": _average([s.keyword_adherence_score for s in sessions if s.keyword_adherence_score is not None]),
                "below_threshold_count": sum(1 for s in sessions if s.keyword_adherence_score and s.keyword_adherence_score < 70),
                "recommendation": IMPROVEMENT_RECOMMENDATIONS["Keyword Adherence"]
            },
            {
                "category": "Soft Skills",
                "average": _average([s.soft_skills_score for s in sessions if s.soft_skills_score is not None]),
                "below_threshold_count": sum(1 for s in sessions if s.soft_skills_score and s.soft_skills_score < 70),
                "recommendation": IMPROVEMENT_RECOMMENDATIONS["Soft Skills"]
            }
        ],
        "improvement_by_trainee": []
    }
    
    # Get per-trainee improvement areas
    sessions_by_trainee = {}
    for session in sessions:
        if session.user_id not in sessions_by_trainee:
            sessions_by_trainee[session.user_id] = []
        sessions_by_trainee[session.user_id].append(session)
    
    for trainee_id, trainee_sessions in sessions_by_trainee.items():
        trainee = db.query(User).filter(User.id == trainee_id).first()
        trainee_name = trainee.full_name if trainee else "Unknown"
        
        categories = [
            ("Pronunciation", "accuracy_score"),
            ("Pacing", "fluency_score"),
            ("Clarity", "clarity_score"),
            ("Grammar", "keyword_adherence_score"),
            ("Soft Skills", "soft_skills_score")
        ]
        
        weak_areas = []
        for category_name, score_attr in categories:
            scores = [getattr(s, score_attr) for s in trainee_sessions if getattr(s, score_attr) is not None]
            avg = _average(scores)
            if avg < 70:
                weak_areas.append({
                    "category": category_name,
                    "score": avg,
                    "recommendation": IMPROVEMENT_RECOMMENDATIONS.get(category_name, "")
                })
        
        weak_areas.sort(key=lambda x: x["score"])
        
        improvement_data["improvement_by_trainee"].append({
            "trainee_id": trainee_id,
            "trainee_name": trainee_name,
            "weak_areas": weak_areas,
            "sessions_completed": len(trainee_sessions)
        })
    
    return improvement_data


@router.get("/reports/batch/{batch_id}/progress-graphs")
async def get_batch_progress_graphs(
    batch_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get progress graph data for batch showing trends over time"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Check access
    if current_user.role == UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainer access required")
    if current_user.role == UserRole.TRAINER and batch.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    trainee_ids = [u.id for u in batch.users if u.role == UserRole.TRAINEE]
    sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id.in_(trainee_ids)
    ).order_by(PracticeSession.created_at).all()
    
    # Build weekly trend
    weekly_trend = _build_weekly_trend(sessions, weeks=8)
    
    # Build category scores over time (weekly averages)
    today = datetime.utcnow().date()
    current_week_start = today - timedelta(days=today.weekday())
    
    category_trends = {}
    for label, attribute in CATEGORY_METRICS:
        category_trends[label] = []
        
        for offset in range(7, -1, -1):
            week_start = current_week_start - timedelta(weeks=offset)
            week_end = week_start + timedelta(days=6)
            
            week_sessions = [
                s for s in sessions
                if s.created_at and week_start <= s.created_at.date() <= week_end
            ]
            
            scores = [getattr(s, attribute) for s in week_sessions if getattr(s, attribute) is not None]
            avg = _average(scores)
            
            category_trends[label].append({
                "week": week_start.strftime("%b %d"),
                "score": avg
            })
    
    # Build trainee progress data
    trainee_progress_data = []
    for trainee_id in trainee_ids:
        trainee = db.query(User).filter(User.id == trainee_id).first()
        trainee_sessions = [s for s in sessions if s.user_id == trainee_id]
        
        if trainee_sessions:
            trainee_progress_data.append({
                "trainee_id": trainee_id,
                "trainee_name": trainee.full_name if trainee else "Unknown",
                "scores": [
                    {
                        "date": s.created_at.strftime("%Y-%m-%d") if s.created_at else "",
                        "score": s.overall_score or 0
                    }
                    for s in trainee_sessions
                ]
            })
    
    return {
        "batch_name": batch.name,
        "weekly_trend": weekly_trend,
        "category_trends": category_trends,
        "trainee_progress": trainee_progress_data
    }


@router.get("/reports/batch/{batch_id}/monthly-report")
async def get_batch_monthly_report(
    batch_id: str,
    month: int = Query(None, ge=1, le=12),
    year: int = Query(None, ge=2020),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get monthly performance report for entire batch"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Check access
    if current_user.role == UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainer access required")
    if current_user.role == UserRole.TRAINER and batch.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = datetime.utcnow()
    active_year = year or now.year
    active_month = month
    if active_month is None and year is None:
        active_month = now.month

    start_date, end_date, period_label = _resolve_period_range(
        month=active_month,
        year=active_year,
    )
    
    trainee_ids = [u.id for u in batch.users if u.role == UserRole.TRAINEE]
    sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id.in_(trainee_ids),
        PracticeSession.created_at >= start_date,
        PracticeSession.created_at <= end_date
    ).all()
    
    # Monthly summary
    monthly_report = {
        "batch_name": batch.name,
        "month": period_label,
        "summary": {
            "total_sessions": len(sessions),
            "total_trainees": len(trainee_ids),
            "average_score": _average([s.overall_score for s in sessions if s.overall_score is not None]),
            "pass_rate": (sum(1 for s in sessions if s.overall_score and s.overall_score >= 70) / len(sessions) * 100) if sessions else 0,
            "improvement_vs_last_month": 0.0  # Will be calculated if previous month has data
        },
        "trainee_reports": []
    }
    
    # Per-trainee monthly report
    for trainee_id in trainee_ids:
        trainee = db.query(User).filter(User.id == trainee_id).first()
        trainee_sessions = [s for s in sessions if s.user_id == trainee_id]
        
        scores = [s.overall_score for s in trainee_sessions if s.overall_score is not None]
        
        trainee_report = {
            "trainee_id": trainee_id,
            "trainee_name": trainee.full_name if trainee else "Unknown",
            "sessions_count": len(trainee_sessions),
            "average_score": _average(scores),
            "highest_score": max(scores) if scores else 0,
            "lowest_score": min(scores) if scores else 0,
            "pass_sessions": sum(1 for s in trainee_sessions if s.overall_score and s.overall_score >= 70),
            "category_averages": {
                "pronunciation": _average([s.accuracy_score for s in trainee_sessions if s.accuracy_score is not None]),
                "pacing": _average([s.fluency_score for s in trainee_sessions if s.fluency_score is not None]),
                "clarity": _average([s.clarity_score for s in trainee_sessions if s.clarity_score is not None]),
                "grammar": _average([s.keyword_adherence_score for s in trainee_sessions if s.keyword_adherence_score is not None]),
                "soft_skills": _average([s.soft_skills_score for s in trainee_sessions if s.soft_skills_score is not None])
            }
        }
        
        monthly_report["trainee_reports"].append(trainee_report)
    
    monthly_report["trainee_reports"].sort(key=lambda x: x["average_score"], reverse=True)
    
    return monthly_report


@router.get("/reports/trainee/{trainee_id}/detailed-report")
async def get_trainee_detailed_report(
    trainee_id: str,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Get comprehensive detailed report for individual trainee"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    # Check access
    if current_user.id != trainee_id and current_user.role not in [UserRole.ADMIN, UserRole.TRAINER]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    trainee = db.query(User).filter(User.id == trainee_id).first()
    if not trainee:
        raise HTTPException(status_code=404, detail="Trainee not found")

    if current_user.id != trainee_id and current_user.role == UserRole.TRAINER:
        if not _trainer_has_trainee_access(current_user, trainee):
            raise HTTPException(status_code=403, detail="Access denied")

    start_date, end_date, period_label = _resolve_period_range(
        month=month,
        year=year,
    )

    session_query = db.query(PracticeSession).filter(
        PracticeSession.user_id == trainee_id
    )
    if start_date:
        session_query = session_query.filter(
            PracticeSession.created_at >= start_date,
            PracticeSession.created_at <= end_date,
        )

    sessions = session_query.order_by(PracticeSession.created_at).all()
    accessible_batches = list(trainee.batches or [])
    if current_user.role == UserRole.TRAINER:
        accessible_batches = [
            batch for batch in accessible_batches if batch.created_by == current_user.id
        ]

    scenario_titles = {}
    scenario_ids = {session.scenario_id for session in sessions if session.scenario_id}
    if scenario_ids:
        scenario_titles = {
            scenario.id: scenario.title
            for scenario in db.query(Scenario).filter(Scenario.id.in_(scenario_ids)).all()
        }
    
    # Overall metrics
    scores = [s.overall_score for s in sessions if s.overall_score is not None]
    
    detailed_report = {
        "trainee_id": trainee_id,
        "trainee_name": trainee.full_name,
        "trainee_email": trainee.email,
        "report_generated": datetime.utcnow().isoformat(),
        "report_period": period_label,
        "assigned_batches": [
            {
                "id": batch.id,
                "name": batch.name,
                "wave_number": batch.wave_number,
                "lob": batch.lob,
            }
            for batch in accessible_batches
        ],
        "overall_metrics": {
            "total_sessions": len(sessions),
            "average_score": _average(scores),
            "highest_score": max(scores) if scores else 0,
            "lowest_score": min(scores) if scores else 0,
            "pass_sessions": sum(1 for s in sessions if s.overall_score and s.overall_score >= 70),
            "fail_sessions": sum(1 for s in sessions if s.overall_score and s.overall_score < 70),
            "pass_rate": (sum(1 for s in sessions if s.overall_score and s.overall_score >= 70) / len(sessions) * 100) if sessions else 0
        },
        "category_breakdown": [
            {
                "category": "Pronunciation (Accuracy)",
                "average": _average([s.accuracy_score for s in sessions if s.accuracy_score is not None]),
                "highest": max([s.accuracy_score for s in sessions if s.accuracy_score is not None], default=0),
                "lowest": min([s.accuracy_score for s in sessions if s.accuracy_score is not None], default=0)
            },
            {
                "category": "Pacing (Fluency)",
                "average": _average([s.fluency_score for s in sessions if s.fluency_score is not None]),
                "highest": max([s.fluency_score for s in sessions if s.fluency_score is not None], default=0),
                "lowest": min([s.fluency_score for s in sessions if s.fluency_score is not None], default=0)
            },
            {
                "category": "Clarity",
                "average": _average([s.clarity_score for s in sessions if s.clarity_score is not None]),
                "highest": max([s.clarity_score for s in sessions if s.clarity_score is not None], default=0),
                "lowest": min([s.clarity_score for s in sessions if s.clarity_score is not None], default=0)
            },
            {
                "category": "Grammar & Keywords",
                "average": _average([s.keyword_adherence_score for s in sessions if s.keyword_adherence_score is not None]),
                "highest": max([s.keyword_adherence_score for s in sessions if s.keyword_adherence_score is not None], default=0),
                "lowest": min([s.keyword_adherence_score for s in sessions if s.keyword_adherence_score is not None], default=0)
            },
            {
                "category": "Soft Skills",
                "average": _average([s.soft_skills_score for s in sessions if s.soft_skills_score is not None]),
                "highest": max([s.soft_skills_score for s in sessions if s.soft_skills_score is not None], default=0),
                "lowest": min([s.soft_skills_score for s in sessions if s.soft_skills_score is not None], default=0)
            }
        ],
        "progress_trend": _progress_state(sessions),
        "recent_sessions": [
            {
                "session_id": s.id,
                "scenario": scenario_titles.get(s.scenario_id, "Unknown") if s.scenario_id else "Unknown",
                "score": s.overall_score,
                "date": s.created_at.isoformat() if s.created_at else "",
                "status": "Passed" if (s.overall_score and s.overall_score >= 70) else "Failed"
            }
            for s in sessions[-10:]
        ]
    }
    
    return detailed_report


@router.get("/reports/filter-data")
async def filter_report_data(
    report_type: str = Query("batch", pattern="^(batch|trainee)$"),
    batch_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
    metric_type: str = Query("pronunciation", pattern="^(pronunciation|grammar|pacing|clarity|soft_skills|overall)$"),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Filter and retrieve specific report data based on criteria"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    if report_type == "batch" and batch_id:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        
        if current_user.role == UserRole.TRAINER and batch.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        trainee_ids = [u.id for u in batch.users if u.role == UserRole.TRAINEE]
        
        # Apply date filter if provided
        start_date, end_date, period_label = _resolve_period_range(
            month=month,
            year=year,
        )
        
        query = db.query(PracticeSession).filter(PracticeSession.user_id.in_(trainee_ids))
        if start_date:
            query = query.filter(PracticeSession.created_at >= start_date, PracticeSession.created_at <= end_date)
        
        sessions = query.all()
        
        # Filter by metric type
        metric_map = {
            "pronunciation": "accuracy_score",
            "grammar": "keyword_adherence_score",
            "pacing": "fluency_score",
            "clarity": "clarity_score",
            "soft_skills": "soft_skills_score",
            "overall": "overall_score"
        }
        
        metric_attr = metric_map[metric_type]
        filtered_data = [
            {
                "trainee_id": s.user_id,
                "trainee_name": db.query(User).filter(User.id == s.user_id).first().full_name,
                "score": getattr(s, metric_attr),
                "date": s.created_at.isoformat() if s.created_at else "",
                "scenario": db.query(Scenario).filter(Scenario.id == s.scenario_id).first().title if s.scenario_id else ""
            }
            for s in sessions if getattr(s, metric_attr) is not None
        ]
        
        return {
            "batch_id": batch_id,
            "batch_name": batch.name,
            "metric_type": metric_type,
            "period": period_label,
            "data_points": filtered_data,
            "summary": {
                "count": len(filtered_data),
                "average": _average([d["score"] for d in filtered_data]) if filtered_data else 0
            }
        }
    
    elif report_type == "trainee" and trainee_id:
        trainee = db.query(User).filter(User.id == trainee_id).first()
        if not trainee:
            raise HTTPException(status_code=404, detail="Trainee not found")
        
        if current_user.id != trainee_id and current_user.role not in [UserRole.ADMIN, UserRole.TRAINER]:
            raise HTTPException(status_code=403, detail="Access denied")
        if current_user.role == UserRole.TRAINER and not _trainer_has_trainee_access(current_user, trainee):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Apply date filter if provided
        start_date, end_date, period_label = _resolve_period_range(
            month=month,
            year=year,
        )
        
        query = db.query(PracticeSession).filter(PracticeSession.user_id == trainee_id)
        if start_date:
            query = query.filter(PracticeSession.created_at >= start_date, PracticeSession.created_at <= end_date)
        
        sessions = query.all()
        
        metric_map = {
            "pronunciation": "accuracy_score",
            "grammar": "keyword_adherence_score",
            "pacing": "fluency_score",
            "clarity": "clarity_score",
            "soft_skills": "soft_skills_score",
            "overall": "overall_score"
        }
        
        metric_attr = metric_map[metric_type]
        filtered_data = [
            {
                "score": getattr(s, metric_attr),
                "date": s.created_at.isoformat() if s.created_at else "",
                "scenario": db.query(Scenario).filter(Scenario.id == s.scenario_id).first().title if s.scenario_id else "",
                "attempt": s.attempt_number
            }
            for s in sessions if getattr(s, metric_attr) is not None
        ]
        
        return {
            "trainee_id": trainee_id,
            "trainee_name": trainee.full_name,
            "metric_type": metric_type,
            "period": period_label,
            "data_points": filtered_data,
            "summary": {
                "count": len(filtered_data),
                "average": _average([d["score"] for d in filtered_data]) if filtered_data else 0
            }
        }
    
    raise HTTPException(status_code=400, detail="Invalid report parameters")
