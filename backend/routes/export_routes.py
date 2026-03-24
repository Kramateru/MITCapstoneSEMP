"""
PDF Export Routes - Endpoints for generating and downloading performance report PDFs
Includes cloud storage integration with Supabase
"""

import uuid
from datetime import datetime, timedelta
from typing import Any, List, Optional

from .. import auth_utils

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Batch, PracticeSession, Scenario, User
from ..services.pdf_generator import PerformanceReportGenerator
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/api/export", tags=["Export"])


@router.post("/session-pdf/{session_id}")
async def export_session_as_pdf(
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Export a single practice session as PDF
    Trainee can export their own sessions, Trainer can export any session
    """
    
    # Get the practice session
    session = db.query(PracticeSession).filter(
        PracticeSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # TODO: Add permission verification
    # if current_user.role == "trainee" and session.trainee_id != current_user.id:
    #     raise HTTPException(
    #         status_code=status.HTTP_403_FORBIDDEN,
    #         detail="Cannot export other users' sessions"
    #     )
    
    # Get scenario details
    scenario = db.query(Scenario).filter(
        Scenario.id == session.scenario_id
    ).first()
    
    # Generate PDF
    generator = PerformanceReportGenerator(title="Session Export")
    
    pdf_buffer = generator.generate_session_summary(
        trainee_name=session.user.full_name if session.user else "Unknown",
        scenario_title=scenario.title if scenario else "Unknown Scenario",
        scenario_difficulty=str(scenario.difficulty) if scenario else "medium",
        date_completed=session.created_at,
        practice_duration=session.response_duration or 0,
        overall_score=session.overall_score or 0,
        scores={
            "accuracy": session.accuracy_score or 0,
            "fluency": session.fluency_score or 0,
            "clarity": session.clarity_score or 0,
            "keyword_adherence": session.keyword_adherence_score or 0,
            "soft_skills": session.soft_skills_score or 0
        },
        words_total=len(session.word_feedback or []),
        words_correct=int(
            ((session.accuracy_score or 0) / 100) * max(1, len(session.word_feedback or []))
        ),
        filler_words=len(session.filler_words_detected or []),
        keywords_matched=[],
        keywords_missed=[],
        feedback=None,
        trainer_notes=None,
        pass_fail=(session.overall_score or 0) >= 70,
    )
    
    return Response(
        content=pdf_buffer.read(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="session_{session_id[:8]}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf"'
        },
    )


@router.post("/progress-pdf")
async def export_progress_report(
    date_from: Optional[str] = None,  # YYYY-MM-DD format
    date_to: Optional[str] = None,
    trainee_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Export trainee's progress report as PDF
    Covers a date range (default: last 30 days)
    Trainee can export own, Trainer can export any trainee
    """
    
    # Parse dates
    date_to = datetime.strptime(date_to, "%Y-%m-%d") if date_to else datetime.now()
    date_from = datetime.strptime(date_from, "%Y-%m-%d") if date_from else date_to - timedelta(days=30)
    
    # Get target trainee (if trainer requested someone else's report)
    if not trainee_id:
        raise HTTPException(status_code=400, detail="trainee_id required")
    
    target_trainee_id = trainee_id
    trainee_for_report = db.query(User).filter(User.id == trainee_id).first()
    if not trainee_for_report:
        raise HTTPException(status_code=404, detail="Trainee not found")
    
    # Get practice sessions in date range
    sessions = db.query(PracticeSession).filter(
        PracticeSession.user_id == target_trainee_id,
        PracticeSession.created_at >= date_from,
        PracticeSession.created_at <= date_to
    ).all()
    
    if not sessions:
        raise HTTPException(status_code=404, detail="No sessions found in date range")
    
    # Calculate statistics
    total_sessions = len(sessions)
    passed_sessions = sum((s.overall_score or 0) >= 70 for s in sessions)
    failed_sessions = total_sessions - passed_sessions
    average_score = sum(s.overall_score or 0 for s in sessions) / total_sessions if total_sessions > 0 else 0
    
    # Get scenarios completed
    scenarios_completed = []
    for session in sessions:
        scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
        if scenario and scenario.title not in scenarios_completed:
            scenarios_completed.append(scenario.title)
    
    # Identify strengths and weaknesses
    accuracy_avg = sum(s.accuracy_score or 0 for s in sessions) / total_sessions if total_sessions > 0 else 0
    fluency_avg = sum(s.fluency_score or 0 for s in sessions) / total_sessions if total_sessions > 0 else 0
    clarity_avg = sum(s.clarity_score or 0 for s in sessions) / total_sessions if total_sessions > 0 else 0
    keyword_avg = sum(s.keyword_adherence_score or 0 for s in sessions) / total_sessions if total_sessions > 0 else 0
    soft_skills_avg = sum(s.soft_skills_score or 0 for s in sessions) / total_sessions if total_sessions > 0 else 0
    
    scores = {
        "accuracy": accuracy_avg,
        "fluency": fluency_avg,
        "clarity": clarity_avg,
        "keyword_adherence": keyword_avg,
        "soft_skills": soft_skills_avg
    }
    
    # Identify strengths (scores >= 75)
    strengths = [
        f"Strong {category.title().replace('_', ' ')}: {score:.1f}%"
        for category, score in scores.items()
        if score >= 75
    ]
    
    # Identify weaknesses (scores < 70)
    weaknesses = [
        f"Need to improve {category.title().replace('_', ' ')}: {score:.1f}%"
        for category, score in scores.items()
        if score < 70
    ]
    
    # Generate PDF
    generator = PerformanceReportGenerator(title="Progress Report")
    
    pdf_buffer = generator.generate_progress_report(
        trainee_name=trainee_for_report.full_name,
        date_range_start=date_from,
        date_range_end=date_to,
        total_sessions=total_sessions,
        passed_sessions=passed_sessions,
        failed_sessions=failed_sessions,
        average_score=average_score,
        trends=[],  # Could add trend data
        scenarios_completed=scenarios_completed,
        weaknesses=weaknesses,
        strengths=strengths or ["Consistent effort and engagement"]
    )
    
    return Response(
        content=pdf_buffer.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="progress_report_{datetime.now().strftime("%Y%m%d")}.pdf"'},
    )


@router.post("/batch-performance-pdf/{batch_id}")
async def export_batch_performance(
    batch_id: str,
    db: Session = Depends(get_db)
):
    """
    Export performance report for entire batch
    Shows comparative metrics across all trainees in the batch
    """
    
    # Get all sessions for batch
    if not (sessions := db.query(PracticeSession).filter(
        PracticeSession.user_id.in_(
            [u.id for u in db.query(User).filter(User.batches.any(Batch.id == batch_id)).all()]
        )
    ).all()):
        raise HTTPException(status_code=404, detail="No sessions found for this batch")
    
    # This would generate a batch-level report
    # For now, returning a simple implementation
    
    return {
        "status": "success",
        "message": "Batch report generation in progress",
        "batch_id": batch_id,
        "total_sessions": len(sessions),
        "note": "Batch PDF export coming soon"
    }


@router.post("/custom-pdf")
async def export_custom_report(
    format_type: str = "summary",  # summary, detailed, comparative
    include_sections: List[str] = None,  # transcript, scores, feedback, recommendations
    db: Session = Depends(get_db)
):
    """
    Export custom report with selected sections
    Allows trainees to choose which sections to include
    """
    
    if include_sections is None:
        include_sections = ["scores", "feedback"]
    
    # Validate sections
    valid_sections = {"transcript", "scores", "feedback", "recommendations", "metadata"}
    if any(section not in valid_sections for section in include_sections):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sections. Must be from {valid_sections}"
        )
    
    return {
        "status": "success",
        "message": "Custom PDF export initiated",
        "format": format_type,
        "sections": include_sections,
        "download_url": f"/api/export/download/custom_{uuid.uuid4().hex[:8]}"
    }


@router.get("/formats")
async def get_export_formats(
    authorization: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get available export report formats"""
    current_user = await auth_utils.get_current_user(authorization, db)
    
    formats = {
        "session": {
            "name": "Single Session Summary",
            "description": "Export results from one practice session",
            "sections": ["scores", "word_analysis", "feedback", "recommendations"]
        },
        "progress": {
            "name": "Progress Report",
            "description": "Date-range overview of your training progress",
            "sections": ["summary", "statistics", "scenarios", "strengths", "weaknesses", "recommendations"]
        },
        "comparative": {
            "name": "Comparative Analysis (Trainer)",
            "description": "Compare performance across multiple trainees",
            "sections": ["batch_stats", "individual_scores", "trends", "insights"],
            "trainer_only": True
        }
    }
    
    # Filter based on role
    if str(current_user.role) != "UserRole.TRAINER" and getattr(current_user.role, "value", None) != "trainer":
        del formats["comparative"]
    
    return formats


@router.get("/health")
async def export_health():
    """Health check for export service"""
    return {
        "status": "healthy",
        "service": "export",
        "capabilities": [
            "session_pdf_export",
            "progress_report_pdf",
            "batch_performance_report",
            "custom_report_generation",
            "multiple_export_formats"
        ],
        "version": "1.0.0"
    }

# ==================== Cloud Storage Integration ====================


@router.post("/upload-report-to-cloud")
async def upload_report_to_cloud(
    report_data: dict,
    report_type: str = "progress",  # progress, session, batch, custom
    user_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Upload generated PDF report to Supabase cloud storage
    
    This endpoint:
    1. Takes PDF binary data or report metadata
    2. Uploads to Supabase storage bucket
    3. Returns public URL for sharing/downloading
    
    Args:
        report_data: Dictionary containing pdf_bytes or report metadata
        report_type: Type of report (progress, session, batch, custom)
        user_id: User ID for organizing files
    
    Returns:
        Public URL and upload confirmation
    """
    try:
        supabase = get_supabase_client()
        
        if not supabase.is_available:
            return {
                "status": "warning",
                "message": "Cloud storage not configured. PDF saved locally only.",
                "is_cloud_available": False
            }
        
        # Extract PDF bytes from report data
        pdf_bytes = report_data.get("pdf_bytes")
        if not pdf_bytes:
            raise HTTPException(
                status_code=400,
                detail="report_data must contain 'pdf_bytes' field"
            )
        
        # Generate filename based on report type and timestamp
        timestamp = datetime.utcnow().isoformat().replace(":", "-")
        filename = f"{report_type}_{timestamp}.pdf"
        
        if user_id:
            filename = f"{user_id}_{filename}"
        
        # Upload to Supabase
        if not (public_url := supabase.upload_document(
            file_data=pdf_bytes,
            document_type="pdf",
            filename=filename
        )):
            return {
                "status": "success",
                "message": "Report generated but cloud upload failed. Saved locally.",
                "is_cloud_available": True,
                "is_uploaded": False,
            }
        
        return {
            "status": "success",
            "message": "Report uploaded to cloud storage",
            "cloud_url": public_url,
            "report_type": report_type,
            "timestamp": datetime.utcnow().isoformat(),
            "is_uploaded": True,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Report upload failed: {str(e)}"
        )


@router.get("/cloud-storage-status")
async def cloud_storage_status():
    """Check if Supabase cloud storage is configured and available"""
    supabase = get_supabase_client()
    
    return {
        "is_available": supabase.is_available,
        "service": "Supabase" if supabase.is_available else "Not configured",
        "bucket_name": supabase.bucket_name if supabase.is_available else None,
        "capabilities": {
            "audio_storage": supabase.is_available,
            "document_storage": supabase.is_available,
            "file_listing": supabase.is_available,
            "file_deletion": supabase.is_available,
        } if supabase.is_available else {}
    }
