"""
Certificate issuance helpers for completion-based and competency-based awards.
"""

import secrets
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models import (
    CertificateRecord,
    CertificationSettings,
    CompetencyVerdict,
    CourseAssignment,
    MCQAssessment,
    MCQCategory,
    MCQSubmission,
    PracticeSession,
    Scenario,
    User,
    UserRole,
)


def ensure_certification_settings(db: Session) -> CertificationSettings:
    settings = db.query(CertificationSettings).first()
    if not settings:
        settings = CertificationSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def build_template_snapshot(settings: CertificationSettings) -> dict:
    return {
        "institution_name": settings.institution_name,
        "address": settings.address,
        "contact_number": settings.contact_number,
        "contact_email": settings.contact_email,
        "logo_url": settings.logo_url,
        "dry_seal_url": settings.dry_seal_url,
        "manager_signature_url": settings.manager_signature_url,
        "registrar_name": settings.registrar_name,
        "signatory_title": settings.signatory_title,
        "certificate_prefix": settings.certificate_prefix,
        "certificate_title": settings.certificate_title,
        "certificate_subtitle": settings.certificate_subtitle,
        "certificate_intro": settings.certificate_intro,
        "certificate_outro": settings.certificate_outro,
        "certificate_footer": settings.certificate_footer,
        "unit_of_competency": settings.unit_of_competency,
    }


def resolve_issuer_id(
    db: Session,
    *,
    preferred_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
) -> str:
    if preferred_id and preferred_id != trainee_id:
        return preferred_id

    fallback_trainer = (
        db.query(User)
        .filter(User.role.in_([UserRole.ADMIN, UserRole.TRAINER]), User.is_active == True)
        .order_by(User.created_at.asc())
        .first()
    )
    if fallback_trainer:
        return fallback_trainer.id

    fallback_user = db.query(User).filter(User.id == trainee_id).first()
    if fallback_user:
        return fallback_user.id

    raise ValueError("No available issuer account found for certificate generation")


def _next_certificate_number(db: Session, settings: CertificationSettings) -> str:
    prefix = (settings.certificate_prefix or "SPV").strip().upper()
    year = datetime.utcnow().year
    count = (
        db.query(CertificateRecord)
        .filter(CertificateRecord.certificate_no.like(f"{prefix}-{year}-%"))
        .count()
    )
    return f"{prefix}-{year}-{count + 1:04d}"


def award_certificate(
    db: Session,
    *,
    trainee_id: str,
    issuer_id: str,
    source_type: str,
    source_id: str,
    achievement_title: str,
    achievement_type: str,
    remarks: Optional[str] = None,
    score: Optional[float] = None,
    practice_session_id: Optional[str] = None,
    mcq_assessment_id: Optional[str] = None,
    verdict_id: Optional[str] = None,
    issued_at: Optional[datetime] = None,
) -> tuple[CertificateRecord, bool]:
    existing = (
        db.query(CertificateRecord)
        .filter(
            CertificateRecord.trainee_id == trainee_id,
            CertificateRecord.source_type == source_type,
            CertificateRecord.source_id == source_id,
        )
        .first()
    )
    if existing:
        return existing, False

    settings = ensure_certification_settings(db)
    resolved_issuer_id = resolve_issuer_id(
        db,
        preferred_id=issuer_id,
        trainee_id=trainee_id,
    )

    verdict = None
    if verdict_id:
        verdict = db.query(CompetencyVerdict).filter(CompetencyVerdict.id == verdict_id).first()

    if not verdict:
        verdict = CompetencyVerdict(
            trainee_id=trainee_id,
            trainer_id=resolved_issuer_id,
            practice_session_id=practice_session_id,
            mcq_assessment_id=mcq_assessment_id,
            asr_score=float(score or 0.0) if practice_session_id else 0.0,
            mcq_score=float(score or 0.0) if mcq_assessment_id else 0.0,
            remarks=remarks,
            is_competent=achievement_type == "competency",
            decided_at=issued_at or datetime.utcnow(),
        )
        db.add(verdict)
        db.flush()

    certificate = CertificateRecord(
        certificate_no=_next_certificate_number(db, settings),
        verdict_id=verdict.id,
        trainee_id=trainee_id,
        trainer_id=resolved_issuer_id,
        unit_of_competency=achievement_title,
        kip_score=round(float(score or 0.0), 2),
        qr_token=secrets.token_urlsafe(18),
        source_type=source_type,
        source_id=source_id,
        achievement_type=achievement_type,
        template_snapshot=build_template_snapshot(settings),
        issued_at=issued_at or datetime.utcnow(),
    )
    db.add(certificate)
    db.flush()
    return certificate, True


def issue_certificate_for_verdict(
    db: Session,
    *,
    verdict: CompetencyVerdict,
    achievement_title: str,
) -> tuple[CertificateRecord, bool]:
    existing = db.query(CertificateRecord).filter(CertificateRecord.verdict_id == verdict.id).first()
    if existing:
        return existing, False

    return award_certificate(
        db,
        trainee_id=verdict.trainee_id,
        issuer_id=verdict.trainer_id,
        source_type="competency_verdict",
        source_id=verdict.id,
        achievement_title=achievement_title,
        achievement_type="competency",
        remarks=verdict.remarks,
        score=round((float(verdict.asr_score or 0.0) + float(verdict.mcq_score or 0.0)) / 2, 2),
        practice_session_id=verdict.practice_session_id,
        mcq_assessment_id=verdict.mcq_assessment_id,
        verdict_id=verdict.id,
        issued_at=verdict.decided_at,
    )


def sync_trainee_completion_certificates(db: Session, trainee_id: str) -> list[CertificateRecord]:
    created_certificates: list[CertificateRecord] = []

    trainee = db.query(User).filter(User.id == trainee_id).first()
    if not trainee:
        return created_certificates

    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == trainee_id)
        .order_by(PracticeSession.created_at.desc())
        .all()
    )
    latest_session_by_scenario: dict[str, PracticeSession] = {}
    for session in sessions:
        if session.scenario_id not in latest_session_by_scenario:
            latest_session_by_scenario[session.scenario_id] = session

    scenarios = (
        db.query(Scenario)
        .filter(Scenario.id.in_(list(latest_session_by_scenario.keys())))
        .all()
        if latest_session_by_scenario
        else []
    )
    scenario_lookup = {scenario.id: scenario for scenario in scenarios}

    for scenario_id, session in latest_session_by_scenario.items():
        scenario = scenario_lookup.get(scenario_id)
        certificate, created = award_certificate(
            db,
            trainee_id=trainee_id,
            issuer_id=scenario.created_by if scenario else None,
            source_type="scenario_task",
            source_id=scenario_id,
            achievement_title=scenario.title if scenario else "Completed Scenario Task",
            achievement_type="task",
            remarks=f"Completed scenario task: {scenario.title if scenario else 'Scenario'}",
            score=float(session.overall_score or 0.0),
            practice_session_id=session.id,
            issued_at=session.created_at,
        )
        if created:
            created_certificates.append(certificate)

    submissions = (
        db.query(MCQSubmission, MCQAssessment)
        .join(MCQAssessment, MCQAssessment.id == MCQSubmission.assessment_id)
        .filter(MCQSubmission.trainee_id == trainee_id)
        .all()
    )
    category_ids = {
        assessment.category_id for _, assessment in submissions if assessment.category_id
    }
    category_lookup = {
        category.id: category
        for category in (
            db.query(MCQCategory).filter(MCQCategory.id.in_(list(category_ids))).all()
            if category_ids
            else []
        )
    }
    for submission, assessment in submissions:
        category = category_lookup.get(assessment.category_id)
        certificate, created = award_certificate(
            db,
            trainee_id=trainee_id,
            issuer_id=assessment.assigned_by,
            source_type="mcq_assessment",
            source_id=assessment.id,
            achievement_title=category.name if category else assessment.title,
            achievement_type="assessment",
            remarks=f"Completed assessment: {assessment.title}",
            score=float(submission.score_percentage or 0.0),
            mcq_assessment_id=assessment.id,
            issued_at=submission.submitted_at,
        )
        if created:
            created_certificates.append(certificate)

    completed_assignments = (
        db.query(CourseAssignment)
        .filter(
            CourseAssignment.user_id == trainee_id,
            CourseAssignment.is_completed == True,
        )
        .all()
    )
    for assignment in completed_assignments:
        if not assignment.course:
            continue
        certificate, created = award_certificate(
            db,
            trainee_id=trainee_id,
            issuer_id=assignment.assigned_by,
            source_type="course_assignment",
            source_id=assignment.id,
            achievement_title=assignment.course.name,
            achievement_type="task",
            remarks=f"Completed training task: {assignment.course.name}",
            score=float(assignment.completion_percentage or 0.0),
            issued_at=assignment.updated_at or assignment.assigned_at,
        )
        if created:
            created_certificates.append(certificate)

    if created_certificates:
        db.commit()

    return created_certificates
