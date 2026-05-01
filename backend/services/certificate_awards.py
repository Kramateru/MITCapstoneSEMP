"""
Certificate issuance helpers for completion-based and competency-based awards.
"""

import re
import secrets
from datetime import datetime
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import (
    CallSimulationAssignment,
    CertificateRecord,
    CertificationSettings,
    CompetencyVerdict,
    MCQAssessment,
    MCQCategory,
    MCQSubmission,
    MicrolearningAssignment,
    Scenario,
    SimSession,
    User,
    UserRole,
)

SUPPORTED_ACTIVITY_CERTIFICATE_SOURCES = {
    "sim_floor_session",
    "call_simulation_session",
    "mcq_assessment",
    "mcq_assessment_completion",
    "microlearning_assignment",
}
LEGACY_MICROLEARNING_SOURCES = {"microlearning"}


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
    pattern = re.compile(rf"^{re.escape(prefix)}-{year}-(\d+)$")
    existing_numbers = (
        db.query(CertificateRecord.certificate_no)
        .filter(CertificateRecord.certificate_no.like(f"{prefix}-{year}-%"))
        .all()
    )

    highest_suffix = 0
    for (certificate_no,) in existing_numbers:
        match = pattern.match(str(certificate_no or "").strip().upper())
        if not match:
            continue
        try:
            highest_suffix = max(highest_suffix, int(match.group(1)))
        except ValueError:
            continue

    return f"{prefix}-{year}-{highest_suffix + 1:04d}"


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


def _microlearning_assignment_average_score(
    assignment: MicrolearningAssignment,
) -> float:
    responses = dict(assignment.responses or {})
    scores = [
        float(attempt.get("score") or 0.0)
        for attempt in responses.values()
        if isinstance(attempt, dict) and attempt.get("is_completed")
    ]
    if not scores:
        return 0.0
    return round(sum(scores) / len(scores), 2)


def _microlearning_assignment_has_active_source(
    assignment: MicrolearningAssignment,
) -> bool:
    module = getattr(assignment, "module", None)
    if not module or not bool(getattr(module, "is_active", False)):
        return False

    topic_category_id = getattr(module, "topic_category_id", None)
    if not topic_category_id:
        return True

    topic_category = getattr(module, "topic_category", None)
    return bool(topic_category and getattr(topic_category, "is_active", False))


def _microlearning_assignment_is_passed(
    assignment: MicrolearningAssignment,
) -> bool:
    module = getattr(assignment, "module", None)
    if not module or not _microlearning_assignment_has_active_source(assignment):
        return False

    exercises = list(module.exercises or [])
    if not exercises:
        return False

    completed_count = sum(
        1
        for attempt in dict(assignment.responses or {}).values()
        if isinstance(attempt, dict) and attempt.get("is_completed")
    )
    if completed_count < len(exercises):
        return False

    return _microlearning_assignment_average_score(assignment) >= float(
        getattr(module, "passing_score", 0) or 0
    )


def _normalize_certificate_source_type(source_type: Optional[str]) -> Optional[str]:
    if not source_type:
        return None
    if source_type in LEGACY_MICROLEARNING_SOURCES:
        return "microlearning_assignment"
    return source_type


def _sim_session_has_active_source(
    db: Session,
    session: Optional[SimSession],
) -> bool:
    if not session:
        return False

    scenario = getattr(session, "scenario", None)
    if not scenario:
        scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
    if not scenario or not bool(getattr(scenario, "is_published", False)):
        return False

    active_assignment = (
        db.query(CallSimulationAssignment.id)
        .filter(
            CallSimulationAssignment.trainee_id == session.trainee_id,
            CallSimulationAssignment.scenario_id == session.scenario_id,
            CallSimulationAssignment.is_active == True,
        )
        .first()
    )
    return bool(active_assignment)


def _is_supported_certificate_record(
    db: Session,
    certificate: CertificateRecord,
) -> bool:
    normalized_source_type = _normalize_certificate_source_type(certificate.source_type)
    if not normalized_source_type or not certificate.source_id:
        return False

    if normalized_source_type in {"sim_floor_session", "call_simulation_session"}:
        session = db.query(SimSession).filter(SimSession.id == certificate.source_id).first()
        verdict_status = (session.trainer_verdict_status or "").lower() if session else ""
        return bool(
            session
            and session.trainee_id == certificate.trainee_id
            and _sim_session_has_active_source(db, session)
            and verdict_status != "retake"
            and (verdict_status == "competent" or bool(session.pass_fail))
        )

    if normalized_source_type == "mcq_assessment":
        trainee = db.query(User).filter(User.id == certificate.trainee_id).first()
        if not trainee:
            return False

        active_assessment_ids = {
            assessment.id
            for assessment in _get_active_mcq_assessments_for_trainee(db, trainee)
        }
        if certificate.source_id not in active_assessment_ids:
            return False

        submission = (
            db.query(MCQSubmission)
            .filter(
                MCQSubmission.assessment_id == certificate.source_id,
                MCQSubmission.trainee_id == certificate.trainee_id,
            )
            .first()
        )
        return bool(submission and submission.is_passed)

    if normalized_source_type == "mcq_assessment_completion":
        trainee = db.query(User).filter(User.id == certificate.trainee_id).first()
        return bool(
            trainee
            and certificate.source_id == certificate.trainee_id
            and _trainee_has_passed_all_active_mcq_assessments(db, trainee)
        )

    if normalized_source_type == "microlearning_assignment":
        assignment = (
            db.query(MicrolearningAssignment)
            .filter(
                MicrolearningAssignment.id == certificate.source_id,
                MicrolearningAssignment.trainee_id == certificate.trainee_id,
            )
            .first()
        )
        return bool(
            assignment
            and _microlearning_assignment_has_active_source(assignment)
            and _microlearning_assignment_is_passed(assignment)
        )

    return False


def _mcq_completion_assignment_title(
    trainee: User,
) -> str:
    active_batches = [batch for batch in trainee.batches if getattr(batch, "is_active", True)]
    if len(active_batches) == 1:
        batch = active_batches[0]
        if batch.wave_number is not None:
            return f"{batch.name} Wave {batch.wave_number} Assessment Completion"
        return f"{batch.name} Assessment Completion"
    return "Trainer-Assigned Assessment Completion"


def _get_active_mcq_assessments_for_trainee(
    db: Session,
    trainee: User,
) -> list[MCQAssessment]:
    batch_ids = [batch.id for batch in trainee.batches if getattr(batch, "is_active", True)]
    filters = [MCQAssessment.assigned_user_id == trainee.id]
    if batch_ids:
        filters.append(MCQAssessment.assigned_batch_id.in_(batch_ids))

    return (
        db.query(MCQAssessment)
        .filter(
            MCQAssessment.is_active == True,
            or_(*filters),
        )
        .all()
    )


def _get_passed_active_mcq_submission_map(
    db: Session,
    trainee: User,
) -> tuple[list[MCQAssessment], dict[str, MCQSubmission]]:
    active_assessments = _get_active_mcq_assessments_for_trainee(db, trainee)
    if not active_assessments:
        return [], {}

    assessment_ids = [assessment.id for assessment in active_assessments]
    passed_rows = (
        db.query(MCQSubmission)
        .filter(
            MCQSubmission.trainee_id == trainee.id,
            MCQSubmission.assessment_id.in_(assessment_ids),
            MCQSubmission.is_passed == True,
        )
        .all()
    )
    return active_assessments, {row.assessment_id: row for row in passed_rows}


def _trainee_has_passed_all_active_mcq_assessments(
    db: Session,
    trainee: User,
) -> bool:
    active_assessments, passed_by_assessment = _get_passed_active_mcq_submission_map(
        db,
        trainee,
    )
    return bool(active_assessments) and all(
        assessment.id in passed_by_assessment for assessment in active_assessments
    )


def _sync_mcq_completion_certificate(
    db: Session,
    trainee: User,
) -> tuple[Optional[CertificateRecord], bool]:
    active_assessments, passed_by_assessment = _get_passed_active_mcq_submission_map(
        db,
        trainee,
    )
    if not active_assessments:
        return None, False

    if any(assessment.id not in passed_by_assessment for assessment in active_assessments):
        return None, False

    passed_rows = list(passed_by_assessment.values())
    if not passed_rows:
        return None, False

    latest_submission = max(
        passed_rows,
        key=lambda row: row.submitted_at or datetime.utcnow(),
    )
    average_score = round(
        sum(float(row.score_percentage or 0.0) for row in passed_rows) / max(len(passed_rows), 1),
        2,
    )

    return award_certificate(
        db,
        trainee_id=trainee.id,
        issuer_id=active_assessments[0].assigned_by,
        source_type="mcq_assessment_completion",
        source_id=trainee.id,
        achievement_title=_mcq_completion_assignment_title(trainee),
        achievement_type="completion",
        remarks=f"Completed {len(active_assessments)} trainer-assigned assessments.",
        score=average_score,
        issued_at=latest_submission.submitted_at,
    )


def prune_trainee_activity_certificates(db: Session, trainee_id: str) -> int:
    certificates = (
        db.query(CertificateRecord)
        .filter(CertificateRecord.trainee_id == trainee_id)
        .all()
    )

    deleted_count = 0
    for certificate in certificates:
        normalized_source_type = _normalize_certificate_source_type(certificate.source_type)
        if normalized_source_type != certificate.source_type:
            certificate.source_type = normalized_source_type

        linked_sim_session = None
        linked_assignment = None
        if normalized_source_type in {"sim_floor_session", "call_simulation_session"} and certificate.source_id:
            linked_sim_session = (
                db.query(SimSession)
                .filter(SimSession.id == certificate.source_id)
                .first()
            )
        elif normalized_source_type == "microlearning_assignment" and certificate.source_id:
            linked_assignment = (
                db.query(MicrolearningAssignment)
                .filter(MicrolearningAssignment.id == certificate.source_id)
                .first()
            )

        if normalized_source_type not in SUPPORTED_ACTIVITY_CERTIFICATE_SOURCES:
            if linked_sim_session and linked_sim_session.certificate_id == certificate.id:
                linked_sim_session.certificate_id = None
            if linked_assignment and linked_assignment.certificate_id == certificate.id:
                linked_assignment.certificate_id = None
            db.delete(certificate)
            deleted_count += 1
            continue

        if not _is_supported_certificate_record(db, certificate):
            if linked_sim_session and linked_sim_session.certificate_id == certificate.id:
                linked_sim_session.certificate_id = None
            if linked_assignment and linked_assignment.certificate_id == certificate.id:
                linked_assignment.certificate_id = None
            db.delete(certificate)
            deleted_count += 1

    return deleted_count


def sync_trainee_completion_certificates(db: Session, trainee_id: str) -> list[CertificateRecord]:
    created_certificates: list[CertificateRecord] = []

    trainee = db.query(User).filter(User.id == trainee_id).first()
    if not trainee:
        return created_certificates

    submissions = (
        db.query(MCQSubmission, MCQAssessment)
        .join(MCQAssessment, MCQAssessment.id == MCQSubmission.assessment_id)
        .filter(MCQSubmission.trainee_id == trainee_id)
        .all()
    )
    active_assessment_ids = {
        assessment.id
        for assessment in _get_active_mcq_assessments_for_trainee(db, trainee)
    }
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
        if not submission.is_passed:
            continue
        if assessment.id not in active_assessment_ids:
            continue
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

    completion_certificate, completion_created = _sync_mcq_completion_certificate(db, trainee)
    if completion_certificate and completion_created:
        created_certificates.append(completion_certificate)

    microlearning_assignments = (
        db.query(MicrolearningAssignment)
        .filter(MicrolearningAssignment.trainee_id == trainee_id)
        .order_by(MicrolearningAssignment.updated_at.desc())
        .all()
    )
    did_update_microlearning_assignments = False
    for assignment in microlearning_assignments:
        if not _microlearning_assignment_has_active_source(assignment):
            continue
        if not _microlearning_assignment_is_passed(assignment):
            continue

        module = getattr(assignment, "module", None)
        if not module:
            continue

        certificate, created = award_certificate(
            db,
            trainee_id=trainee_id,
            issuer_id=assignment.assigned_by,
            source_type="microlearning_assignment",
            source_id=assignment.id,
            achievement_title=module.title,
            achievement_type="microlearning",
            remarks=f"Completed microlearning module: {module.title}",
            score=_microlearning_assignment_average_score(assignment),
            issued_at=assignment.completed_at or assignment.updated_at or assignment.assigned_at,
        )
        if assignment.certificate_id != certificate.id:
            assignment.certificate_id = certificate.id
            did_update_microlearning_assignments = True
        if assignment.status != "certified":
            assignment.status = "certified"
            did_update_microlearning_assignments = True
        if created:
            created_certificates.append(certificate)

    deleted_certificates = prune_trainee_activity_certificates(db, trainee_id)

    if created_certificates or did_update_microlearning_assignments or deleted_certificates:
        db.commit()

    return created_certificates
