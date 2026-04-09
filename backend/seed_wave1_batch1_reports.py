"""
Repair and enrich report data for the live WAVE1 - BATCH 1 trainer batch.

This script writes directly to the active database configured through DATABASE_URL.
Run with:

    python -m backend.seed_wave1_batch1_reports
"""

from __future__ import annotations

from datetime import datetime, timedelta

from .database import SessionLocal
from .models import Batch, PracticeSession, Scenario, User, UserRole
from .routes.admin_routes import _ensure_practice_session

TARGET_BATCH_NAME = "WAVE1 - BATCH 1"
TARGET_TRAINER_EMAIL = "trainer@st.peterville.edu.ph"


def _word_feedback(*items: tuple[str, int, str, str]) -> list[dict[str, object]]:
    return [
        {
            "word": word,
            "score": score,
            "error_type": error_type,
            "color": color,
        }
        for word, score, error_type, color in items
    ]


def _seed_rows(reference_time: datetime) -> list[dict[str, object]]:
    day_one = (reference_time - timedelta(days=2)).replace(hour=9, minute=15, second=0, microsecond=0)
    day_two = (reference_time - timedelta(days=1)).replace(hour=14, minute=10, second=0, microsecond=0)

    return [
        {
            "trainee_email": "mcureta@fatima.edu.ph",
            "scenario_title": "Account Verification and Refund Inquiry",
            "transcription": "April report seed 1: I verified the account, confirmed the callback details, and explained the refund steps clearly before the next update.",
            "overall_score": 86.8,
            "accuracy_score": 84.0,
            "fluency_score": 88.0,
            "clarity_score": 87.0,
            "keyword_adherence_score": 86.0,
            "soft_skills_score": 89.0,
            "response_duration": 98,
            "filler_words": [],
            "keyword_hits": ["verify", "callback", "refund", "update"],
            "created_at": day_one,
            "word_feedback": _word_feedback(
                ("verify", 78, "Word stress", "yellow"),
                ("callback", 82, "TH sound", "yellow"),
                ("refund", 91, "None", "green"),
            ),
            "coaching_focus": ["pronunciation consistency", "clear ownership phrasing"],
        },
        {
            "trainee_email": "mcureta@fatima.edu.ph",
            "scenario_title": "Service Outage Escalation Call",
            "transcription": "April report seed 2: I understand the outage impact, I will troubleshoot first, create the escalation ticket, and set the next callback window today.",
            "overall_score": 89.4,
            "accuracy_score": 88.0,
            "fluency_score": 90.0,
            "clarity_score": 89.0,
            "keyword_adherence_score": 87.0,
            "soft_skills_score": 93.0,
            "response_duration": 113,
            "filler_words": ["um"],
            "keyword_hits": ["troubleshoot", "ticket", "callback"],
            "created_at": day_two,
            "word_feedback": _word_feedback(
                ("troubleshoot", 80, "Final consonant", "yellow"),
                ("ticket", 83, "Word stress", "yellow"),
                ("callback", 90, "None", "green"),
            ),
            "coaching_focus": ["pacing balance", "escalation ownership"],
        },
        {
            "trainee_email": "sample.trainee1@stpetervelle.edu.ph",
            "scenario_title": "Account Verification and Refund Inquiry",
            "transcription": "April report seed 3: I checked the account details, verified the transaction, and explained the refund policy together with the follow-up timing.",
            "overall_score": 81.6,
            "accuracy_score": 81.0,
            "fluency_score": 79.0,
            "clarity_score": 82.0,
            "keyword_adherence_score": 80.0,
            "soft_skills_score": 86.0,
            "response_duration": 104,
            "filler_words": ["uh"],
            "keyword_hits": ["verify", "refund", "policy"],
            "created_at": day_one + timedelta(hours=1),
            "word_feedback": _word_feedback(
                ("policy", 77, "Vowel length", "yellow"),
                ("transaction", 79, "Word stress", "yellow"),
                ("refund", 89, "None", "green"),
            ),
            "coaching_focus": ["grammar control", "next-step phrasing"],
        },
        {
            "trainee_email": "sample.trainee1@stpetervelle.edu.ph",
            "scenario_title": "Service Outage Escalation Call",
            "transcription": "April report seed 4: I understand the outage concern, I will document the issue, troubleshoot with you now, and keep the escalation moving.",
            "overall_score": 84.9,
            "accuracy_score": 84.0,
            "fluency_score": 83.0,
            "clarity_score": 85.0,
            "keyword_adherence_score": 83.0,
            "soft_skills_score": 89.0,
            "response_duration": 116,
            "filler_words": [],
            "keyword_hits": ["document", "troubleshoot", "escalation"],
            "created_at": day_two + timedelta(hours=1),
            "word_feedback": _word_feedback(
                ("issue", 80, "TH sound", "yellow"),
                ("escalation", 82, "Word stress", "yellow"),
                ("document", 90, "None", "green"),
            ),
            "coaching_focus": ["confidence in escalation wording", "steady pacing"],
        },
        {
            "trainee_email": "sample.trainee2@stpetervelle.edu.ph",
            "scenario_title": "Service Outage Escalation Call",
            "transcription": "April report seed 5: I know the outage is affecting your work, so I will troubleshoot the line, create the ticket, and stay accountable for the update.",
            "overall_score": 92.1,
            "accuracy_score": 91.0,
            "fluency_score": 92.0,
            "clarity_score": 91.0,
            "keyword_adherence_score": 92.0,
            "soft_skills_score": 95.0,
            "response_duration": 121,
            "filler_words": [],
            "keyword_hits": ["troubleshoot", "ticket", "update"],
            "created_at": day_one + timedelta(hours=2),
            "word_feedback": _word_feedback(
                ("ticket", 88, "Word stress", "yellow"),
                ("update", 91, "None", "green"),
                ("accountable", 90, "None", "green"),
            ),
            "coaching_focus": ["maintain pronunciation consistency", "strong ownership"],
        },
        {
            "trainee_email": "sample.trainee2@stpetervelle.edu.ph",
            "scenario_title": "Account Verification and Refund Inquiry",
            "transcription": "April report seed 6: I verified the account, confirmed the refund path, and explained the expected timeline together with the next update.",
            "overall_score": 90.6,
            "accuracy_score": 89.0,
            "fluency_score": 91.0,
            "clarity_score": 90.0,
            "keyword_adherence_score": 90.0,
            "soft_skills_score": 93.0,
            "response_duration": 97,
            "filler_words": [],
            "keyword_hits": ["verify", "refund", "timeline", "update"],
            "created_at": day_two + timedelta(hours=2),
            "word_feedback": _word_feedback(
                ("timeline", 84, "Final consonant", "yellow"),
                ("verify", 89, "None", "green"),
                ("refund", 90, "None", "green"),
            ),
            "coaching_focus": ["sustain clarity on next steps"],
        },
        {
            "trainee_email": "simplekramateru14@gmail.com",
            "scenario_title": "Account Verification and Refund Inquiry",
            "transcription": "April report seed 7: I will verify the account first, review the refund concern, and walk through the next steps before I confirm the update time.",
            "overall_score": 74.8,
            "accuracy_score": 73.0,
            "fluency_score": 72.0,
            "clarity_score": 75.0,
            "keyword_adherence_score": 74.0,
            "soft_skills_score": 80.0,
            "response_duration": 109,
            "filler_words": ["um", "uh"],
            "keyword_hits": ["verify", "refund", "update"],
            "created_at": day_one + timedelta(hours=3),
            "word_feedback": _word_feedback(
                ("verify", 71, "Consonant cluster", "yellow"),
                ("update", 72, "Vowel length", "yellow"),
                ("refund", 84, "None", "green"),
            ),
            "coaching_focus": ["pacing discipline", "keyword confidence"],
        },
        {
            "trainee_email": "simplekramateru14@gmail.com",
            "scenario_title": "Service Outage Escalation Call",
            "transcription": "April report seed 8: I understand the outage issue, I will troubleshoot with you now, create the escalation ticket, and return with the update window.",
            "overall_score": 78.5,
            "accuracy_score": 77.0,
            "fluency_score": 76.0,
            "clarity_score": 78.0,
            "keyword_adherence_score": 79.0,
            "soft_skills_score": 82.0,
            "response_duration": 118,
            "filler_words": ["uh"],
            "keyword_hits": ["troubleshoot", "ticket", "update"],
            "created_at": day_two + timedelta(hours=3),
            "word_feedback": _word_feedback(
                ("troubleshoot", 74, "TH sound", "yellow"),
                ("ticket", 76, "Word stress", "yellow"),
                ("update", 87, "None", "green"),
            ),
            "coaching_focus": ["pronunciation cleanup", "steady customer pacing"],
        },
    ]


def seed_wave1_batch1_reports() -> dict[str, object]:
    db = SessionLocal()
    try:
        trainer = (
            db.query(User)
            .filter(User.email == TARGET_TRAINER_EMAIL, User.role == UserRole.TRAINER)
            .first()
        )
        if not trainer:
            raise RuntimeError(f"Trainer not found: {TARGET_TRAINER_EMAIL}")

        batch = (
            db.query(Batch)
            .filter(Batch.name == TARGET_BATCH_NAME, Batch.created_by == trainer.id)
            .first()
        )
        if not batch:
            raise RuntimeError(f"Batch not found for trainer: {TARGET_BATCH_NAME}")

        scenario_lookup = {
            scenario.title: scenario
            for scenario in db.query(Scenario)
            .filter(Scenario.title.in_([
                "Account Verification and Refund Inquiry",
                "Service Outage Escalation Call",
            ]))
            .all()
        }
        if len(scenario_lookup) < 2:
            raise RuntimeError("Required scenarios were not found in the active database")

        batch_trainees = {
            trainee.email: trainee
            for trainee in batch.users
            if trainee.role == UserRole.TRAINEE
        }

        created_sessions = 0
        updated_sessions = 0
        attempt_tracker: dict[str, int] = {}

        for trainee in batch_trainees.values():
            current_attempt = (
                db.query(PracticeSession)
                .filter(PracticeSession.user_id == trainee.id)
                .count()
            )
            attempt_tracker[trainee.id] = current_attempt

        for row in _seed_rows(datetime.now()):
            trainee = batch_trainees.get(str(row["trainee_email"]))
            if not trainee:
                raise RuntimeError(f"Trainee not found in {TARGET_BATCH_NAME}: {row['trainee_email']}")

            scenario = scenario_lookup.get(str(row["scenario_title"]))
            if not scenario:
                raise RuntimeError(f"Scenario not found: {row['scenario_title']}")

            existing_session = (
                db.query(PracticeSession)
                .filter(
                    PracticeSession.user_id == trainee.id,
                    PracticeSession.scenario_id == scenario.id,
                    PracticeSession.transcription == str(row["transcription"]),
                )
                .first()
            )
            if existing_session:
                attempt_number = existing_session.attempt_number or attempt_tracker[trainee.id]
            else:
                attempt_tracker[trainee.id] += 1
                attempt_number = attempt_tracker[trainee.id]

            session, created = _ensure_practice_session(
                db,
                user_id=trainee.id,
                scenario_id=scenario.id,
                transcription=str(row["transcription"]),
                overall_score=float(row["overall_score"]),
                accuracy_score=float(row["accuracy_score"]),
                fluency_score=float(row["fluency_score"]),
                clarity_score=float(row["clarity_score"]),
                keyword_adherence_score=float(row["keyword_adherence_score"]),
                soft_skills_score=float(row["soft_skills_score"]),
                response_duration=int(row["response_duration"]),
                filler_words=list(row["filler_words"]),
                keyword_hits=list(row["keyword_hits"]),
                attempt_number=attempt_number,
                created_at=row["created_at"],
                transcription_confidence=0.96,
            )

            session.word_feedback = list(row["word_feedback"])
            session.assessment_data = {
                "summary": "Wave 1 batch report enrichment data",
                "keyword_hits": list(row["keyword_hits"]),
                "coaching_focus": list(row["coaching_focus"]),
                "report_seed": True,
            }
            session.status = "completed"
            session.is_verified = True

            if created:
                created_sessions += 1
            else:
                updated_sessions += 1

        db.commit()

        return {
            "batch": batch.name,
            "trainer": trainer.email,
            "created_sessions": created_sessions,
            "updated_sessions": updated_sessions,
            "trainee_count": len(batch_trainees),
        }
    finally:
        db.close()


def main() -> None:
    result = seed_wave1_batch1_reports()
    print("Wave 1 batch report data ready.")
    for key, value in result.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
