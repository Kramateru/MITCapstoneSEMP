"""
Analytics Routes
Handles reporting, dashboards, and performance tracking
"""

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
)
from ..schemas import (
    BatchAnalyticsResponse,
    PerformanceMetricsResponse,
    TraineeProgressResponse,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ==================== Trainee Progress ====================


@router.get("/trainee/{trainee_id}/progress", response_model=TraineeProgressResponse)
async def get_trainee_progress(
    trainee_id: str,
    authorization: Optional[str] = None,
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
    authorization: Optional[str] = None,
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
    authorization: Optional[str] = None,
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
    authorization: Optional[str] = None,
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
    authorization: Optional[str] = None,
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
    authorization: Optional[str] = None,
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


# ==================== Export Functions ====================


@router.get("/export/trainee/{trainee_id}")
async def export_trainee_report(
    trainee_id: str,
    format: str = Query("json", pattern="^(json|csv)$"),
    authorization: Optional[str] = None,
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
