from __future__ import annotations

from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..default_credentials import SAMPLE_TRAINEE_ACCOUNTS
from ..models import (
    Batch,
    CertificateRecord,
    CoachingLog,
    CompetencyVerdict,
    Course,
    CourseAssignment,
    Feedback,
    MCQAssessment,
    MCQCategory,
    MCQSubmission,
    PracticeSession,
    Scenario,
    User,
)
from .microlearning_catalog import cleanup_seeded_microlearning_library

SAMPLE_SCENARIO_TITLES = (
    "Billing Dispute Resolution",
    "Service Outage Escalation Call",
    "Account Verification and Refund Inquiry",
)
SAMPLE_BATCH_NAMES = ("Wave 1 - Sample Cohort",)
SAMPLE_COURSE_NAMES = ("BPO Foundations - Sample Course",)
SAMPLE_MCQ_ASSESSMENT_TITLES = ("Wave 1 Readiness Check",)


def _lowered_values(values: tuple[str, ...] | list[str]) -> list[str]:
    return [value.strip().lower() for value in values if value and value.strip()]


def cleanup_legacy_sample_dataset(db: Session) -> dict[str, Any]:
    """Remove the retired sample/demo dataset from the active database."""

    microlearning_summary = cleanup_seeded_microlearning_library(db)

    sample_user_emails = _lowered_values(
        [account["email"] for account in SAMPLE_TRAINEE_ACCOUNTS]
    )
    sample_scenario_titles = _lowered_values(list(SAMPLE_SCENARIO_TITLES))
    sample_batch_names = _lowered_values(list(SAMPLE_BATCH_NAMES))
    sample_course_names = _lowered_values(list(SAMPLE_COURSE_NAMES))
    sample_assessment_titles = _lowered_values(list(SAMPLE_MCQ_ASSESSMENT_TITLES))

    sample_users = (
        db.query(User)
        .filter(func.lower(User.email).in_(sample_user_emails))
        .all()
        if sample_user_emails
        else []
    )
    sample_user_ids = {user.id for user in sample_users}

    sample_scenarios = (
        db.query(Scenario)
        .filter(func.lower(Scenario.title).in_(sample_scenario_titles))
        .all()
        if sample_scenario_titles
        else []
    )
    sample_scenario_ids = {scenario.id for scenario in sample_scenarios}

    practice_session_conditions = []
    if sample_user_ids:
        practice_session_conditions.append(PracticeSession.user_id.in_(sample_user_ids))
    if sample_scenario_ids:
        practice_session_conditions.append(PracticeSession.scenario_id.in_(sample_scenario_ids))
    sample_practice_sessions = (
        db.query(PracticeSession)
        .filter(or_(*practice_session_conditions))
        .all()
        if practice_session_conditions
        else []
    )
    sample_practice_session_ids = {
        practice_session.id for practice_session in sample_practice_sessions
    }

    sample_feedback = (
        db.query(Feedback)
        .filter(Feedback.practice_session_id.in_(sample_practice_session_ids))
        .all()
        if sample_practice_session_ids
        else []
    )

    coaching_conditions = []
    if sample_practice_session_ids:
        coaching_conditions.append(CoachingLog.practice_session_id.in_(sample_practice_session_ids))
    if sample_user_ids:
        coaching_conditions.append(CoachingLog.trainee_id.in_(sample_user_ids))
    sample_coaching_logs = (
        db.query(CoachingLog).filter(or_(*coaching_conditions)).all()
        if coaching_conditions
        else []
    )

    sample_batches = (
        db.query(Batch)
        .filter(func.lower(Batch.name).in_(sample_batch_names))
        .all()
        if sample_batch_names
        else []
    )
    sample_batch_ids = {batch.id for batch in sample_batches}

    sample_courses = (
        db.query(Course)
        .filter(func.lower(Course.name).in_(sample_course_names))
        .all()
        if sample_course_names
        else []
    )
    sample_course_ids = {course.id for course in sample_courses}

    assignment_conditions = []
    if sample_batch_ids:
        assignment_conditions.append(CourseAssignment.batch_id.in_(sample_batch_ids))
    if sample_course_ids:
        assignment_conditions.append(CourseAssignment.course_id.in_(sample_course_ids))
    if sample_user_ids:
        assignment_conditions.append(CourseAssignment.user_id.in_(sample_user_ids))
    sample_course_assignments = (
        db.query(CourseAssignment).filter(or_(*assignment_conditions)).all()
        if assignment_conditions
        else []
    )

    sample_assessments = (
        db.query(MCQAssessment)
        .filter(func.lower(MCQAssessment.title).in_(sample_assessment_titles))
        .all()
        if sample_assessment_titles
        else []
    )
    sample_assessment_ids = {assessment.id for assessment in sample_assessments}
    sample_category_ids = {
        assessment.category_id
        for assessment in sample_assessments
        if assessment.category_id
    }

    submission_conditions = []
    if sample_assessment_ids:
        submission_conditions.append(MCQSubmission.assessment_id.in_(sample_assessment_ids))
    if sample_user_ids:
        submission_conditions.append(MCQSubmission.trainee_id.in_(sample_user_ids))
    sample_submissions = (
        db.query(MCQSubmission).filter(or_(*submission_conditions)).all()
        if submission_conditions
        else []
    )

    verdict_conditions = []
    if sample_user_ids:
        verdict_conditions.append(CompetencyVerdict.trainee_id.in_(sample_user_ids))
    if sample_practice_session_ids:
        verdict_conditions.append(CompetencyVerdict.practice_session_id.in_(sample_practice_session_ids))
    if sample_assessment_ids:
        verdict_conditions.append(CompetencyVerdict.mcq_assessment_id.in_(sample_assessment_ids))
    sample_verdicts = (
        db.query(CompetencyVerdict).filter(or_(*verdict_conditions)).all()
        if verdict_conditions
        else []
    )
    sample_verdict_ids = {verdict.id for verdict in sample_verdicts}

    certificate_conditions = [
        func.lower(CertificateRecord.certificate_no).like("cl-2026-sample-%"),
        func.lower(CertificateRecord.qr_token).like("seed-%"),
    ]
    if sample_user_ids:
        certificate_conditions.append(CertificateRecord.trainee_id.in_(sample_user_ids))
    if sample_verdict_ids:
        certificate_conditions.append(CertificateRecord.verdict_id.in_(sample_verdict_ids))
    sample_certificates = db.query(CertificateRecord).filter(or_(*certificate_conditions)).all()

    linked_categories = (
        db.query(MCQCategory)
        .filter(MCQCategory.id.in_(sample_category_ids))
        .all()
        if sample_category_ids
        else []
    )
    sample_categories: list[MCQCategory] = []
    for category in linked_categories:
        remaining_assessments = (
            db.query(MCQAssessment)
            .filter(
                MCQAssessment.category_id == category.id,
                ~MCQAssessment.id.in_(sample_assessment_ids),
            )
            .count()
            if sample_assessment_ids
            else 0
        )
        if remaining_assessments == 0:
            sample_categories.append(category)

    for batch in sample_batches:
        batch.users = []

    for user in sample_users:
        user.batches = []

    for course in sample_courses:
        course.assessment_categories = []

    for scenario in sample_scenarios:
        scenario.assessment_categories = []

    for row in sample_feedback:
        db.delete(row)
    for row in sample_coaching_logs:
        db.delete(row)
    for row in sample_course_assignments:
        db.delete(row)
    for row in sample_submissions:
        db.delete(row)
    for row in sample_certificates:
        db.delete(row)
    for row in sample_verdicts:
        db.delete(row)
    for row in sample_assessments:
        db.delete(row)
    for row in sample_categories:
        db.delete(row)
    for row in sample_practice_sessions:
        db.delete(row)
    for row in sample_courses:
        db.delete(row)
    for row in sample_scenarios:
        db.delete(row)
    for row in sample_batches:
        db.delete(row)
    for row in sample_users:
        db.delete(row)

    db.flush()

    summary = {
        "sample_users_deleted": len(sample_users),
        "sample_batches_deleted": len(sample_batches),
        "sample_courses_deleted": len(sample_courses),
        "sample_course_assignments_deleted": len(sample_course_assignments),
        "sample_scenarios_deleted": len(sample_scenarios),
        "sample_practice_sessions_deleted": len(sample_practice_sessions),
        "sample_feedback_deleted": len(sample_feedback),
        "sample_coaching_logs_deleted": len(sample_coaching_logs),
        "sample_mcq_assessments_deleted": len(sample_assessments),
        "sample_mcq_categories_deleted": len(sample_categories),
        "sample_mcq_submissions_deleted": len(sample_submissions),
        "sample_competency_verdicts_deleted": len(sample_verdicts),
        "sample_certificates_deleted": len(sample_certificates),
        **{f"microlearning_{key}": value for key, value in microlearning_summary.items()},
    }
    summary["changed"] = any(
        bool(value) for key, value in summary.items() if key != "changed"
    )
    return summary
