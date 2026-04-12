"""
Sim Floor routes.
Handles trainer scenario management, KPI configuration, trainee sessions,
Supabase-backed audio uploads, coaching notes, and analytics.
"""

from __future__ import annotations

import io
import logging
import os
import uuid
from collections import defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any, Optional

import pandas as pd
import requests
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse, FileResponse
from openpyxl import Workbook
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import (
    Batch,
    BatchKPIConfig,
    BatchScenarioMapping,
    CertificateRecord,
    CoachingLog,
    Scenario,
    ScenarioFlow,
    SimFloorAssignment,
    ScenarioVariation,
    SimSession,
    User,
    UserRole,
)
from ..schemas import (
    BatchKPIConfigCreate,
    BatchKPIConfigResponse,
    SimFloorScenarioAssignmentSummary,
    SimFloorScenarioStepResponse,
    BatchKPIConfigUpdate,
    BatchScenarioMappingCreate,
    BulkUploadResponse,
    SimFloorScenarioCreate,
    SimFloorScenarioResponse,
    SimFloorScenarioUpdate,
    SimSessionCompleteRequest,
    SimSessionCoachingNoteUpdate,
    SimSessionCreate,
    SimSessionResponse,
    SimSessionStartResponse,
    SimSessionTrainerVerdictUpdate,
    SimSessionTurnResponse,
    ScenarioVariationCreate,
    ScenarioVariationResponse,
    ScenarioVariationUpdate,
    SuccessResponse,
)
from ..services.certificate_awards import (
    award_certificate,
    prune_trainee_activity_certificates,
    sync_trainee_completion_certificates,
)
from ..services.coaching import generate_coaching_id, normalize_competency_status
from ..services.speech_assessment import assess_audio_submission, normalize_text, tokenize_text
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/api/sim-floor", tags=["sim-floor"])
logger = logging.getLogger(__name__)

DEFAULT_PASSING_SCORE = 90.0
DEFAULT_MAX_ATTEMPTS = 99
TURN_REPEAT_PROMPT = "Repeat, I can't understand what you're saying."
MIN_SCRIPT_SIMILARITY_FOR_PROGRESS = 0.58
MIN_STT_ACCURACY_FOR_PROGRESS = 55.0
MIN_KEYWORD_COVERAGE_FOR_PROGRESS = 0.34


def _require_trainer(current_user: User) -> None:
    if current_user.role not in [UserRole.ADMIN, UserRole.TRAINER]:
        raise HTTPException(status_code=403, detail="Trainer access required")


def _require_trainee(current_user: User) -> None:
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")


def _normalize_keyword_list(keywords: Optional[list[str]]) -> list[str]:
    return [keyword.strip() for keyword in (keywords or []) if keyword and keyword.strip()]


def _find_keyword_matches(text: str, keywords: Optional[list[str]]) -> list[str]:
    if not text or not keywords:
        return []
    normalized_text = text.lower()
    matches = {
        keyword.strip()
        for keyword in keywords
        if keyword and keyword.strip() and keyword.strip().lower() in normalized_text
    }
    return sorted(matches)


def _detect_forbidden_words(text: str, keywords: Optional[list[str]]) -> list[str]:
    return _find_keyword_matches(text, keywords)


def _score_aht(actual_seconds: int, target_seconds: int) -> float:
    if target_seconds <= 0:
        return 100.0
    if actual_seconds <= target_seconds:
        return 100.0
    overage_ratio = (actual_seconds - target_seconds) / target_seconds
    return round(max(0.0, 100.0 - (overage_ratio * 100.0)), 2)


def _score_target_delta(actual: float, target: float, penalty_multiplier: float = 100.0) -> float:
    if target <= 0:
        return 100.0
    delta_ratio = abs(actual - target) / target
    return round(max(0.0, 100.0 - (delta_ratio * penalty_multiplier)), 2)


def _score_dead_air(dead_air_seconds: float, target_dead_air_seconds: float) -> float:
    if target_dead_air_seconds <= 0:
        return 100.0 if dead_air_seconds <= 0 else 0.0
    if dead_air_seconds <= target_dead_air_seconds:
        return 100.0
    overage_ratio = (dead_air_seconds - target_dead_air_seconds) / target_dead_air_seconds
    return round(max(0.0, 100.0 - (overage_ratio * 55.0)), 2)


def _score_behavioral_hits(hit_count: int, keywords: Optional[list[str]]) -> float:
    normalized_keywords = _normalize_keyword_list(keywords)
    if not normalized_keywords:
        return 100.0
    target_hits = max(1, min(3, len(normalized_keywords)))
    return round(min(100.0, (hit_count / target_hits) * 100.0), 2)


def _estimate_dead_air_seconds(word_feedback: list[dict[str, Any]], response_duration: float) -> float:
    timed_words = []
    for item in word_feedback or []:
        start = item.get("start")
        end = item.get("end")
        if isinstance(start, (int, float)) and isinstance(end, (int, float)):
            timed_words.append((float(start), float(end)))

    if not timed_words or response_duration <= 0:
        return 0.0

    timed_words.sort(key=lambda item: item[0])
    dead_air = 0.0
    previous_end = 0.0
    for start, end in timed_words:
        gap = max(0.0, start - previous_end)
        if gap > 0.75:
            dead_air += gap
        previous_end = max(previous_end, end)

    tail_gap = max(0.0, response_duration - previous_end)
    if tail_gap > 1.0:
        dead_air += tail_gap

    return round(dead_air, 2)


def _total_kpi_weight(config: BatchKPIConfigCreate | BatchKPIConfigUpdate | BatchKPIConfig) -> float:
    return round(
        float(getattr(config, "speech_to_text_weight", 0.0) or 0.0)
        + float(getattr(config, "aht_weight", 0.0) or 0.0)
        + float(getattr(config, "rate_of_speech_weight", 0.0) or 0.0)
        + float(getattr(config, "dead_air_weight", 0.0) or 0.0)
        + float(getattr(config, "empathy_statements_weight", 0.0) or 0.0)
        + float(getattr(config, "probing_questions_weight", 0.0) or 0.0)
        + float(getattr(config, "grammar_weight", 0.0) or 0.0)
        + float(getattr(config, "pronunciation_weight", 0.0) or 0.0)
        + float(getattr(config, "pacing_weight", 0.0) or 0.0),
        2,
    )


def _validate_kpi_weights(config: BatchKPIConfigCreate | BatchKPIConfigUpdate | BatchKPIConfig) -> None:
    total_weight = _total_kpi_weight(config)
    if total_weight < 95.0 or total_weight > 105.0:
        raise HTTPException(
            status_code=400,
            detail=f"KPI weights should total about 100%. Current total: {total_weight}%",
        )


def _average(values: list[float]) -> float:
    cleaned = [float(value) for value in values if value is not None]
    return round(sum(cleaned) / len(cleaned), 2) if cleaned else 0.0


def _format_asr_provider_label(provider: Optional[str]) -> str:
    labels = {
        "google_speech_to_text": "Google Speech-to-Text",
        "openai_whisper": "OpenAI Whisper",
        "heuristic_fallback": "Transcript Assist Fallback",
    }
    normalized = (provider or "").strip().lower()
    return labels.get(normalized, normalized.replace("_", " ").title() or "Unknown ASR")


def _estimate_script_duration_seconds(script: str) -> float:
    tokens = tokenize_text(script or "")
    if not tokens:
        return 1.5
    # Simulated member turns do not have reliable duration metadata, so estimate from word count.
    return round(max(1.5, len(tokens) / 2.6), 2)


def _phrase_similarity(left: str, right: str) -> float:
    normalized_left = normalize_text(left or "")
    normalized_right = normalize_text(right or "")
    if not normalized_left or not normalized_right:
        return 0.0
    return SequenceMatcher(None, normalized_left, normalized_right).ratio()


def _phrase_present(transcript: str, phrase: str) -> bool:
    normalized_transcript = normalize_text(transcript or "")
    normalized_phrase = normalize_text(phrase or "")
    if not normalized_transcript or not normalized_phrase:
        return False

    if normalized_phrase in normalized_transcript:
        return True

    phrase_tokens = [token for token in tokenize_text(normalized_phrase) if len(token) > 2]
    if not phrase_tokens:
        return False

    transcript_tokens = set(tokenize_text(normalized_transcript))
    matched_tokens = sum(1 for token in phrase_tokens if token in transcript_tokens)
    coverage = matched_tokens / len(phrase_tokens)
    return coverage >= 0.6 or _phrase_similarity(normalized_transcript, normalized_phrase) >= 0.55


def _extract_closing_spiel(steps: list[SimFloorScenarioStepResponse]) -> str:
    closing_step = next(
        (
            step
            for step in reversed(steps)
            if step.actor == "csr" and (step.is_closing or step.script)
        ),
        None,
    )
    return (closing_step.script or "").strip() if closing_step else ""


def _determine_repeat_requirement(
    *,
    transcript: str,
    step: SimFloorScenarioStepResponse,
    evaluation: dict[str, Any],
    assessment: dict[str, Any],
    matched_keywords: list[str],
) -> tuple[bool, Optional[str], float]:
    cleaned_transcript = normalize_text(transcript or "")
    cleaned_script = normalize_text(step.script or "")
    similarity = _phrase_similarity(cleaned_transcript, cleaned_script) if cleaned_transcript and cleaned_script else 0.0

    if not cleaned_transcript:
        return True, "No recognizable speech was detected for this spiel.", similarity

    if assessment.get("status") != "completed":
        fallback_reason = str(assessment.get("error") or "").strip() or "Speech recognition could not validate the spiel."
        return True, fallback_reason, similarity

    speech_accuracy = float(evaluation.get("speech_to_text_accuracy") or 0.0)
    required_keywords = _normalize_keyword_list(step.expected_keywords)
    keyword_coverage = (
        len(matched_keywords) / len(required_keywords)
        if required_keywords
        else 1.0
    )

    accuracy_failed = speech_accuracy < MIN_STT_ACCURACY_FOR_PROGRESS
    similarity_failed = similarity < MIN_SCRIPT_SIMILARITY_FOR_PROGRESS
    keyword_failed = bool(required_keywords) and keyword_coverage < MIN_KEYWORD_COVERAGE_FOR_PROGRESS

    strong_script_match = similarity >= 0.82
    enough_keyword_coverage = not required_keywords or keyword_coverage >= MIN_KEYWORD_COVERAGE_FOR_PROGRESS
    should_repeat = (
        not strong_script_match
        and (
            similarity < 0.46
            or (similarity_failed and accuracy_failed)
            or (keyword_failed and similarity < 0.74)
        )
    )

    if not should_repeat and enough_keyword_coverage:
        return False, None, similarity

    reasons: list[str] = []
    if similarity_failed:
        reasons.append("the saved response did not follow the scripted spiel closely enough")
    if accuracy_failed:
        reasons.append("the recognized words were still too far from the target script")
    if keyword_failed:
        reasons.append("required keywords were missing")

    reason_text = "; ".join(reasons) if reasons else "the response needs to be repeated"
    return True, reason_text[0].upper() + reason_text[1:], similarity


def _build_keyword_compliance_summary(
    transcript: str,
    steps: list[SimFloorScenarioStepResponse],
) -> dict[str, Any]:
    required_items = [
        {
            "id": "thank_you_for_calling",
            "label": "Thank you for calling",
            "required_phrase": "Thank you for calling",
        },
        {
            "id": "how_can_i_help",
            "label": "How can I help",
            "required_phrase": "How can I help",
        },
    ]

    closing_spiel = _extract_closing_spiel(steps)
    if closing_spiel:
        required_items.append(
            {
                "id": "closing_spiel",
                "label": "Closing spiel",
                "required_phrase": closing_spiel,
            }
        )

    matched_count = 0
    items: list[dict[str, Any]] = []
    for item in required_items:
        matched = _phrase_present(transcript, item["required_phrase"])
        matched_count += 1 if matched else 0
        items.append(
            {
                **item,
                "matched": matched,
            }
        )

    total_required = len(items)
    score = round((matched_count / total_required) * 100.0, 2) if total_required else 100.0
    missing = [item["label"] for item in items if not item["matched"]]

    return {
        "score": score,
        "matched_count": matched_count,
        "total_required": total_required,
        "missing": missing,
        "items": items,
    }


def _heuristic_sentiment_score(transcript: str) -> float:
    positive_tokens = {
        "thank",
        "glad",
        "happy",
        "help",
        "assist",
        "resolved",
        "appreciate",
        "sorry",
        "certainly",
        "absolutely",
    }
    negative_tokens = {
        "can't",
        "cannot",
        "won't",
        "problem",
        "issue",
        "delay",
        "angry",
        "upset",
        "frustrated",
        "no",
    }
    tokens = tokenize_text(transcript or "")
    if not tokens:
        return 0.0

    positive_hits = sum(1 for token in tokens if token in positive_tokens)
    negative_hits = sum(1 for token in tokens if token in negative_tokens)
    raw_score = (positive_hits - negative_hits) / max(len(tokens), 1)
    return round(max(-1.0, min(1.0, raw_score * 5.0)), 3)


def _analyze_sentiment_score(transcript: str) -> float:
    if not transcript or not transcript.strip():
        return 0.0

    api_key = (
        os.getenv("GOOGLE_NATURAL_LANGUAGE_API_KEY")
        or os.getenv("GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
    )
    if api_key:
        try:
            response = requests.post(
                "https://language.googleapis.com/v1/documents:analyzeSentiment",
                params={"key": api_key},
                json={
                    "document": {
                        "type": "PLAIN_TEXT",
                        "language": "en",
                        "content": transcript,
                    },
                    "encodingType": "UTF8",
                },
                timeout=25,
            )
            response.raise_for_status()
            payload = response.json()
            document_sentiment = payload.get("documentSentiment") or {}
            score = document_sentiment.get("score")
            if isinstance(score, (int, float)):
                return round(max(-1.0, min(1.0, float(score))), 3)
        except Exception as exc:
            logger.warning("Google Natural Language sentiment fallback engaged: %s", exc)

    return _heuristic_sentiment_score(transcript)


def _sentiment_label(score: float) -> str:
    if score >= 0.3:
        return "positive"
    if score <= -0.3:
        return "at_risk"
    return "neutral"


def _build_default_kpi_config(batch_id: Optional[str] = None) -> BatchKPIConfig:
    return BatchKPIConfig(
        id="default-sim-floor-kpi",
        batch_id=batch_id or "default-batch",
        speech_to_text_weight=25.0,
        aht_weight=20.0,
        rate_of_speech_weight=15.0,
        dead_air_weight=15.0,
        empathy_statements_weight=10.0,
        probing_questions_weight=10.0,
        grammar_weight=2.5,
        pronunciation_weight=1.0,
        pacing_weight=1.0,
        forbidden_words_penalty=5.0,
        passing_score=DEFAULT_PASSING_SCORE,
        forbidden_words=[],
        empathy_keywords=[],
        probing_keywords=[],
        target_aht_seconds=120,
        target_ros_words_per_min=150.0,
        target_dead_air_seconds=3.0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


def _get_effective_kpi_config(db: Session, batch_id: Optional[str]) -> BatchKPIConfig:
    if not batch_id:
        return _build_default_kpi_config()

    config = db.query(BatchKPIConfig).filter(BatchKPIConfig.batch_id == batch_id).first()
    if config:
        return config
    return _build_default_kpi_config(batch_id=batch_id)


def _calculate_weighted_score(
    *,
    speech_to_text_accuracy: float,
    aht_score: float,
    rate_of_speech_score: float,
    dead_air_score: float,
    empathy_score: float,
    probing_score: float,
    grammar_score: float,
    pronunciation_score: float,
    pacing_score: float,
    forbidden_word_penalty: float,
    kpi_config: BatchKPIConfig,
) -> float:
    weighted = (
        speech_to_text_accuracy * (float(kpi_config.speech_to_text_weight or 0.0) / 100.0)
        + aht_score * (float(kpi_config.aht_weight or 0.0) / 100.0)
        + rate_of_speech_score * (float(kpi_config.rate_of_speech_weight or 0.0) / 100.0)
        + dead_air_score * (float(kpi_config.dead_air_weight or 0.0) / 100.0)
        + empathy_score * (float(kpi_config.empathy_statements_weight or 0.0) / 100.0)
        + probing_score * (float(kpi_config.probing_questions_weight or 0.0) / 100.0)
        + grammar_score * (float(kpi_config.grammar_weight or 0.0) / 100.0)
        + pronunciation_score * (float(kpi_config.pronunciation_weight or 0.0) / 100.0)
        + pacing_score * (float(kpi_config.pacing_weight or 0.0) / 100.0)
    )
    return round(max(0.0, weighted - forbidden_word_penalty), 2)


def _build_scenario_assignment_summaries(
    db: Session,
    scenario_id: str,
    mappings: Optional[list[BatchScenarioMapping]] = None,
) -> list[SimFloorScenarioAssignmentSummary]:
    active_mappings = mappings
    if active_mappings is None:
        active_mappings = (
            db.query(BatchScenarioMapping)
            .filter(
                BatchScenarioMapping.scenario_id == scenario_id,
                BatchScenarioMapping.is_active == True,
            )
            .order_by(BatchScenarioMapping.assigned_at.desc())
            .all()
        )

    if not active_mappings:
        return []

    batch_ids = [mapping.batch_id for mapping in active_mappings]
    batches = {
        batch.id: batch
        for batch in db.query(Batch).filter(Batch.id.in_(batch_ids)).all()
    }
    sessions = (
        db.query(SimSession)
        .filter(
            SimSession.scenario_id == scenario_id,
            SimSession.batch_id.in_(batch_ids),
            SimSession.status.in_(["completed", "failed"]),
        )
        .all()
    )
    sessions_by_batch: dict[str, list[SimSession]] = defaultdict(list)
    for session in sessions:
        if session.batch_id:
            sessions_by_batch[session.batch_id].append(session)

    summaries: list[SimFloorScenarioAssignmentSummary] = []
    for mapping in active_mappings:
        batch = batches.get(mapping.batch_id)
        if not batch:
            continue

        batch_sessions = sessions_by_batch.get(batch.id, [])
        completed_sessions = len(batch_sessions)
        passed_sessions = sum(1 for session in batch_sessions if session.pass_fail)
        latest_completed_at = max(
            (
                session.completed_at or session.created_at
                for session in batch_sessions
                if session.completed_at or session.created_at
            ),
            default=None,
        )
        summaries.append(
            SimFloorScenarioAssignmentSummary(
                batch_id=batch.id,
                batch_name=batch.name,
                wave_number=batch.wave_number,
                assigned_at=mapping.assigned_at,
                trainee_count=len([user for user in batch.users if user.role == UserRole.TRAINEE]),
                completed_sessions=completed_sessions,
                passed_sessions=passed_sessions,
                average_score=round(
                    sum(float(session.weighted_score or 0.0) for session in batch_sessions) / completed_sessions,
                    1,
                )
                if completed_sessions
                else 0.0,
                pass_rate=round((passed_sessions / completed_sessions) * 100.0, 1)
                if completed_sessions
                else 0.0,
                latest_completed_at=latest_completed_at,
            )
        )

    return summaries


def _aggregate_assignment_summaries(
    summaries: list[SimFloorScenarioAssignmentSummary],
) -> dict[str, Any]:
    completed_sessions = sum(summary.completed_sessions for summary in summaries)
    passed_sessions = sum(summary.passed_sessions for summary in summaries)
    latest_completed_at = max(
        (summary.latest_completed_at for summary in summaries if summary.latest_completed_at),
        default=None,
    )
    return {
        "member_count": sum(summary.trainee_count for summary in summaries),
        "completed_sessions": completed_sessions,
        "passed_sessions": passed_sessions,
        "average_score": round(
            sum(summary.average_score * summary.completed_sessions for summary in summaries)
            / completed_sessions,
            1,
        )
        if completed_sessions
        else 0.0,
        "pass_rate": round((passed_sessions / completed_sessions) * 100.0, 1)
        if completed_sessions
        else 0.0,
        "latest_completed_at": latest_completed_at,
    }


def _resolve_sim_floor_assignment_trainer_id(
    db: Session,
    *,
    mapping: Optional[BatchScenarioMapping] = None,
    scenario: Optional[Scenario] = None,
    batch: Optional[Batch] = None,
) -> Optional[str]:
    candidate_ids = [
        mapping.assigned_by if mapping else None,
        scenario.created_by if scenario else None,
        batch.created_by if batch else None,
    ]
    for candidate_id in candidate_ids:
        if candidate_id:
            return candidate_id

    fallback_trainer = (
        db.query(User)
        .filter(
            User.role.in_([UserRole.ADMIN, UserRole.TRAINER]),
            User.is_active == True,
        )
        .order_by(User.created_at.asc())
        .first()
    )
    return fallback_trainer.id if fallback_trainer else None


def _upsert_sim_floor_assignment(
    *,
    assignment: Optional[SimFloorAssignment],
    scenario_id: str,
    trainee_id: str,
    trainer_id: str,
    batch_id: Optional[str],
    assigned_at: Optional[datetime],
) -> tuple[SimFloorAssignment, bool]:
    created = assignment is None
    if assignment is None:
        assignment = SimFloorAssignment(
            id=str(uuid.uuid4()),
            scenario_id=scenario_id,
            trainee_id=trainee_id,
            assigned_by=trainer_id,
            batch_id=batch_id,
            assigned_at=assigned_at or datetime.utcnow(),
            is_active=True,
        )
        return assignment, True

    changed = False
    next_assigned_at = assigned_at or assignment.assigned_at or datetime.utcnow()
    if assignment.assigned_by != trainer_id:
        assignment.assigned_by = trainer_id
        changed = True
    if assignment.batch_id != batch_id:
        assignment.batch_id = batch_id
        changed = True
    if assignment.assigned_at != next_assigned_at:
        assignment.assigned_at = next_assigned_at
        changed = True
    if not assignment.is_active:
        assignment.is_active = True
        changed = True

    return assignment, changed or created


def _sync_sim_floor_assignments_for_scenario(
    db: Session,
    scenario_id: str,
) -> bool:
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        return False

    existing_assignments = (
        db.query(SimFloorAssignment)
        .filter(SimFloorAssignment.scenario_id == scenario_id)
        .all()
    )
    assignment_lookup = {
        assignment.trainee_id: assignment for assignment in existing_assignments
    }

    if not scenario.is_published:
        did_change = False
        for assignment in existing_assignments:
            if assignment.is_active:
                assignment.is_active = False
                did_change = True
        return did_change

    mappings = (
        db.query(BatchScenarioMapping)
        .filter(
            BatchScenarioMapping.scenario_id == scenario_id,
            BatchScenarioMapping.is_active == True,
        )
        .order_by(BatchScenarioMapping.assigned_at.desc())
        .all()
    )
    if not mappings:
        did_change = False
        for assignment in existing_assignments:
            if assignment.is_active:
                assignment.is_active = False
                did_change = True
        return did_change

    batches = {
        batch.id: batch
        for batch in db.query(Batch)
        .filter(Batch.id.in_([mapping.batch_id for mapping in mappings] or ["__none__"]))
        .all()
    }

    active_trainee_ids: set[str] = set()
    did_change = False
    for mapping in mappings:
        batch = batches.get(mapping.batch_id)
        if not batch:
            continue

        trainer_id = _resolve_sim_floor_assignment_trainer_id(
            db,
            mapping=mapping,
            scenario=scenario,
            batch=batch,
        )
        if not trainer_id:
            continue

        for trainee in batch.users:
            if trainee.role != UserRole.TRAINEE or not trainee.is_active:
                continue
            if trainee.id in active_trainee_ids:
                continue

            active_trainee_ids.add(trainee.id)
            assignment, changed = _upsert_sim_floor_assignment(
                assignment=assignment_lookup.get(trainee.id),
                scenario_id=scenario_id,
                trainee_id=trainee.id,
                trainer_id=trainer_id,
                batch_id=batch.id,
                assigned_at=mapping.assigned_at,
            )
            if assignment_lookup.get(trainee.id) is None:
                db.add(assignment)
                assignment_lookup[trainee.id] = assignment
            did_change = did_change or changed

    for trainee_id, assignment in assignment_lookup.items():
        if trainee_id in active_trainee_ids:
            continue
        if assignment.is_active:
            assignment.is_active = False
            did_change = True

    return did_change


def _sync_sim_floor_assignments_for_trainee(
    db: Session,
    trainee: User,
) -> bool:
    existing_assignments = (
        db.query(SimFloorAssignment)
        .filter(SimFloorAssignment.trainee_id == trainee.id)
        .all()
    )
    assignment_lookup = {
        assignment.scenario_id: assignment for assignment in existing_assignments
    }

    batch_lookup = {batch.id: batch for batch in trainee.batches if batch.id}
    if not batch_lookup:
        did_change = False
        for assignment in existing_assignments:
            if assignment.is_active:
                assignment.is_active = False
                did_change = True
        return did_change

    mappings = (
        db.query(BatchScenarioMapping)
        .join(Scenario, Scenario.id == BatchScenarioMapping.scenario_id)
        .filter(
            BatchScenarioMapping.batch_id.in_(list(batch_lookup.keys())),
            BatchScenarioMapping.is_active == True,
            Scenario.is_published == True,
        )
        .order_by(BatchScenarioMapping.assigned_at.desc())
        .all()
    )
    scenario_lookup = {
        scenario.id: scenario
        for scenario in db.query(Scenario)
        .filter(Scenario.id.in_([mapping.scenario_id for mapping in mappings] or ["__none__"]))
        .all()
    }

    latest_mapping_by_scenario: dict[str, BatchScenarioMapping] = {}
    for mapping in mappings:
        if mapping.scenario_id not in latest_mapping_by_scenario:
            latest_mapping_by_scenario[mapping.scenario_id] = mapping

    active_scenario_ids: set[str] = set()
    did_change = False
    for scenario_id, mapping in latest_mapping_by_scenario.items():
        scenario = scenario_lookup.get(scenario_id)
        batch = batch_lookup.get(mapping.batch_id)
        if not scenario or not batch:
            continue

        trainer_id = _resolve_sim_floor_assignment_trainer_id(
            db,
            mapping=mapping,
            scenario=scenario,
            batch=batch,
        )
        if not trainer_id:
            continue

        active_scenario_ids.add(scenario_id)
        assignment, changed = _upsert_sim_floor_assignment(
            assignment=assignment_lookup.get(scenario_id),
            scenario_id=scenario_id,
            trainee_id=trainee.id,
            trainer_id=trainer_id,
            batch_id=batch.id,
            assigned_at=mapping.assigned_at,
        )
        if assignment_lookup.get(scenario_id) is None:
            db.add(assignment)
            assignment_lookup[scenario_id] = assignment
        did_change = did_change or changed

    for scenario_id, assignment in assignment_lookup.items():
        if scenario_id in active_scenario_ids:
            continue
        if assignment.is_active:
            assignment.is_active = False
            did_change = True

    return did_change


def _get_latest_sim_session_coaching_logs(
    db: Session,
    session_ids: list[str],
) -> dict[str, CoachingLog]:
    if not session_ids:
        return {}

    logs = (
        db.query(CoachingLog)
        .filter(CoachingLog.sim_session_id.in_(session_ids))
        .order_by(CoachingLog.created_at.desc(), CoachingLog.updated_at.desc())
        .all()
    )
    latest_logs: dict[str, CoachingLog] = {}
    for log in logs:
        if log.sim_session_id and log.sim_session_id not in latest_logs:
            latest_logs[log.sim_session_id] = log
    return latest_logs


def _upsert_sim_session_coaching_log(
    db: Session,
    *,
    session: SimSession,
    trainer_id: str,
    notes: Optional[str],
    verdict_status: str,
) -> Optional[CoachingLog]:
    normalized_verdict = (verdict_status or "pending").strip().lower()
    normalized_notes = (notes or "").strip()
    requested_status = "sent" if normalized_verdict in {"competent", "retake"} else "draft"
    existing_logs = (
        db.query(CoachingLog)
        .filter(CoachingLog.sim_session_id == session.id)
        .order_by(CoachingLog.updated_at.desc(), CoachingLog.created_at.desc())
        .all()
    )
    if normalized_verdict == "pending" and not normalized_notes:
        for existing_log in existing_logs:
            db.delete(existing_log)
        return None

    log = existing_logs[0] if existing_logs else None
    if not log:
        log = CoachingLog(
            coaching_id=generate_coaching_id(db),
            trainer_id=trainer_id,
            trainee_id=session.trainee_id,
            sim_session_id=session.id,
            source_type="sim_floor_session",
        )
        db.add(log)
    else:
        for duplicate_log in existing_logs[1:]:
            db.delete(duplicate_log)

    log.source_type = "sim_floor_session"
    log.trainer_id = trainer_id
    log.trainee_id = session.trainee_id
    log.sim_session_id = session.id
    log.practice_session_id = None
    log.batch_name = session.batch.name if session.batch else None
    log.lob = session.scenario.lob if session.scenario else None
    log.coaching_minutes = log.coaching_minutes or 15
    log.trainer_remarks = normalized_notes or None
    log.status = requested_status
    log.competency_status = normalize_competency_status(
        "not_competent" if normalized_verdict == "retake" else normalized_verdict
    )
    log.updated_at = datetime.utcnow()
    if requested_status != "acknowledged":
        log.acknowledged_at = None
    return log


def _summarize_sim_session_coaching(
    latest_logs: dict[str, CoachingLog],
) -> dict[str, int]:
    logs = list(latest_logs.values())
    return {
        "total_logs": len(logs),
        "pending_acknowledgement": sum(1 for log in logs if log.status == "sent"),
        "acknowledged": sum(1 for log in logs if log.status == "acknowledged"),
        "draft_logs": sum(1 for log in logs if log.status == "draft"),
        "competent": sum(
            1
            for log in logs
            if normalize_competency_status(log.competency_status) == "competent"
        ),
        "not_competent": sum(
            1
            for log in logs
            if normalize_competency_status(log.competency_status) == "not_competent"
        ),
    }


def _normalize_json_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _serialize_flow_step(step: ScenarioFlow) -> SimFloorScenarioStepResponse:
    actor = (step.speaker_role or "").strip().lower()
    if not actor:
        actor = "csr" if step.step_type == "agent_response" else "member"

    script = (
        step.expected_response
        if actor == "csr"
        else step.prompt_text
    ) or ""

    return SimFloorScenarioStepResponse(
        id=step.id,
        step_number=int(step.step_number or 0),
        actor=actor,
        speaker_label=step.speaker_label,
        script=script,
        expected_keywords=list(step.expected_keywords_for_step or []),
        audio_url=step.prompt_audio,
        response_time_limit=step.response_time_limit,
        is_closing=bool(step.is_closing),
        metadata=_normalize_json_object(step.step_metadata),
    )


def _build_scenario_steps(
    scenario: Scenario,
    *,
    variations: Optional[list[ScenarioVariation]] = None,
) -> list[SimFloorScenarioStepResponse]:
    ordered_flow_steps = sorted(
        list(getattr(scenario, "flow_steps", []) or []),
        key=lambda step: (step.step_number or 0, step.created_at or datetime.utcnow()),
    )
    if ordered_flow_steps:
        return [_serialize_flow_step(step) for step in ordered_flow_steps]

    active_variations = variations or [
        variation for variation in getattr(scenario, "variations", []) or []
        if variation.is_active
    ]
    fallback_steps: list[SimFloorScenarioStepResponse] = []
    if scenario.opening_prompt:
        fallback_steps.append(
            SimFloorScenarioStepResponse(
                step_number=1,
                actor="member",
                speaker_label="Member",
                script=scenario.opening_prompt,
                expected_keywords=[],
                audio_url=scenario.opening_prompt_audio,
                metadata={},
            )
        )
    if active_variations:
        fallback_steps.append(
            SimFloorScenarioStepResponse(
                step_number=len(fallback_steps) + 1,
                actor="csr",
                speaker_label="CSR",
                script=active_variations[0].script,
                expected_keywords=list(scenario.expected_keywords or []),
                metadata={},
            )
        )
    elif scenario.opening_prompt:
        fallback_steps.append(
            SimFloorScenarioStepResponse(
                step_number=len(fallback_steps) + 1,
                actor="csr",
                speaker_label="CSR",
                script=scenario.opening_prompt,
                expected_keywords=list(scenario.expected_keywords or []),
                metadata={},
            )
        )
    return fallback_steps


def _serialize_scenario(
    db: Session,
    scenario: Scenario,
    *,
    batch: Optional[Batch] = None,
    mapping: Optional[BatchScenarioMapping] = None,
    variations: Optional[list[ScenarioVariation]] = None,
    highlighted_batch_id: Optional[str] = None,
) -> SimFloorScenarioResponse:
    active_variations = variations
    if active_variations is None:
        active_variations = [variation for variation in scenario.variations if variation.is_active]
    steps = _build_scenario_steps(scenario, variations=active_variations)

    assignment_summaries = _build_scenario_assignment_summaries(db, scenario.id)
    aggregate_summary = _aggregate_assignment_summaries(assignment_summaries)
    highlighted_summary = None
    if highlighted_batch_id:
        highlighted_summary = next(
            (
                summary
                for summary in assignment_summaries
                if summary.batch_id == highlighted_batch_id
            ),
            None,
        )
    if highlighted_summary is None and batch:
        highlighted_summary = next(
            (
                summary
                for summary in assignment_summaries
                if summary.batch_id == batch.id
            ),
            None,
        )

    summary_source = highlighted_summary
    if summary_source is None and assignment_summaries:
        summary_source = assignment_summaries[0]

    return SimFloorScenarioResponse(
        id=scenario.id,
        title=scenario.title,
        description=scenario.description,
        opening_prompt=scenario.opening_prompt,
        difficulty=scenario.difficulty,
        purpose=scenario.purpose,
        expected_keywords=list(scenario.expected_keywords or []),
        estimated_duration=scenario.estimated_duration,
        member_profile=_normalize_json_object(scenario.member_profile),
        cxone_metadata=_normalize_json_object(scenario.cxone_metadata),
        sim_floor_config=_normalize_json_object(scenario.sim_floor_config),
        ringer_audio_url=scenario.ringer_audio_url,
        hold_audio_url=scenario.hold_audio_url,
        batch_id=(summary_source.batch_id if summary_source else batch.id if batch else None),
        batch_name=(summary_source.batch_name if summary_source else batch.name if batch else None),
        assigned_at=(summary_source.assigned_at if summary_source else mapping.assigned_at if mapping else None),
        is_published=bool(scenario.is_published),
        is_draft=bool(scenario.is_draft),
        variations_count=len(active_variations),
        variations=[
            ScenarioVariationResponse.model_validate(variation)
            for variation in active_variations
        ],
        steps_count=len(steps),
        steps=steps,
        assigned_batches=assignment_summaries,
        member_count=summary_source.trainee_count if summary_source else aggregate_summary["member_count"],
        completed_sessions=summary_source.completed_sessions if summary_source else aggregate_summary["completed_sessions"],
        passed_sessions=summary_source.passed_sessions if summary_source else aggregate_summary["passed_sessions"],
        average_score=summary_source.average_score if summary_source else aggregate_summary["average_score"],
        pass_rate=summary_source.pass_rate if summary_source else aggregate_summary["pass_rate"],
        latest_completed_at=(
            summary_source.latest_completed_at if summary_source else aggregate_summary["latest_completed_at"]
        ),
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
    )


def _get_trainer_batch_ids(db: Session, current_user: User) -> list[str]:
    if current_user.role == UserRole.ADMIN:
        return [batch_id for (batch_id,) in db.query(Batch.id).all()]
    return [
        batch_id
        for (batch_id,) in db.query(Batch.id)
        .filter(Batch.created_by == current_user.id)
        .all()
    ]


def _get_accessible_batch(db: Session, current_user: User, batch_id: str) -> Batch:
    query = db.query(Batch).filter(Batch.id == batch_id)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Batch.created_by == current_user.id)
    batch = query.first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


def _get_accessible_scenario(db: Session, current_user: User, scenario_id: str) -> Scenario:
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if current_user.role == UserRole.ADMIN:
        return scenario

    trainer_batch_ids = _get_trainer_batch_ids(db, current_user)
    has_batch_mapping = (
        db.query(BatchScenarioMapping)
        .filter(
            BatchScenarioMapping.scenario_id == scenario_id,
            BatchScenarioMapping.batch_id.in_(trainer_batch_ids or ["__none__"]),
        )
        .first()
        is not None
    )
    if scenario.created_by != current_user.id and not has_batch_mapping:
        raise HTTPException(status_code=403, detail="Access denied")

    return scenario


def _get_accessible_session(db: Session, current_user: User, session_id: str) -> SimSession:
    session = db.query(SimSession).filter(SimSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if current_user.role == UserRole.TRAINEE and session.trainee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if current_user.role in [UserRole.TRAINER, UserRole.ADMIN]:
        if current_user.role == UserRole.ADMIN:
            return session

        trainer_batch_ids = set(_get_trainer_batch_ids(db, current_user))
        if session.batch_id not in trainer_batch_ids:
            raise HTTPException(status_code=403, detail="Access denied")

    return session


def _evaluate_submission(
    *,
    transcript: str,
    audio_duration_seconds: int,
    kpi_config: BatchKPIConfig,
    assessment: Optional[dict[str, Any]] = None,
    overrides: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    assessment = assessment or {}
    overrides = overrides or {}
    scores = assessment.get("scores") or {}

    transcript_confidence = float(
        overrides.get("transcript_confidence")
        if overrides.get("transcript_confidence") is not None
        else assessment.get("transcription_confidence") or 0.0
    )

    provider_confidence_score = float(
        overrides.get("speech_to_text_accuracy")
        if overrides.get("speech_to_text_accuracy") is not None
        else scores.get("transcription_confidence") or (transcript_confidence * 100.0)
    )
    alignment_accuracy = float(assessment.get("accuracy_percentage") or 0.0)
    if overrides.get("speech_to_text_accuracy") is not None:
        speech_to_text_accuracy = float(overrides["speech_to_text_accuracy"])
    elif provider_confidence_score or alignment_accuracy:
        speech_to_text_accuracy = round(
            (provider_confidence_score * 0.55) + (alignment_accuracy * 0.45),
            2,
        )
    else:
        speech_to_text_accuracy = 0.0

    rate_of_speech = overrides.get("rate_of_speech")
    if rate_of_speech is None:
        rate_of_speech = scores.get("speech_rate_wpm")
    if rate_of_speech is None and transcript and audio_duration_seconds > 0:
        rate_of_speech = round(
            (len(transcript.split()) / max(audio_duration_seconds, 1)) * 60.0,
            2,
        )
    rate_of_speech = float(rate_of_speech or 0.0)

    dead_air_seconds = overrides.get("dead_air_seconds")
    if dead_air_seconds is None:
        dead_air_seconds = _estimate_dead_air_seconds(
            assessment.get("word_feedback") or [],
            float(audio_duration_seconds),
        )
    dead_air_seconds = float(dead_air_seconds or 0.0)

    grammar_score = float(
        overrides.get("grammar_score")
        if overrides.get("grammar_score") is not None
        else scores.get("grammar_precision") or 0.0
    )
    pronunciation_score = float(
        overrides.get("pronunciation_score")
        if overrides.get("pronunciation_score") is not None
        else scores.get("phonetic_accuracy") or alignment_accuracy or 0.0
    )

    fluency_score = float(scores.get("fluency") or 0.0)
    ros_score = _score_target_delta(
        rate_of_speech,
        float(kpi_config.target_ros_words_per_min or 150.0),
        penalty_multiplier=95.0,
    ) if rate_of_speech > 0 else 0.0
    pacing_score = float(
        overrides.get("pacing_score")
        if overrides.get("pacing_score") is not None
        else round((fluency_score + ros_score) / 2.0, 2)
        if (fluency_score or ros_score)
        else 0.0
    )

    empathy_matches = _find_keyword_matches(transcript, kpi_config.empathy_keywords)
    probing_matches = _find_keyword_matches(transcript, kpi_config.probing_keywords)
    forbidden_matches = sorted(
        set(
            _detect_forbidden_words(transcript, kpi_config.forbidden_words)
            + list(overrides.get("detected_forbidden_words") or [])
        )
    )

    aht_actual = int(round(audio_duration_seconds))
    aht_target = int(kpi_config.target_aht_seconds or 120)
    aht_score = _score_aht(aht_actual, aht_target)
    dead_air_score = _score_dead_air(
        dead_air_seconds,
        float(kpi_config.target_dead_air_seconds or 3.0),
    )
    empathy_score = _score_behavioral_hits(
        len(empathy_matches),
        kpi_config.empathy_keywords,
    )
    probing_score = _score_behavioral_hits(
        len(probing_matches),
        kpi_config.probing_keywords,
    )
    forbidden_penalty = min(
        100.0,
        len(forbidden_matches) * float(kpi_config.forbidden_words_penalty or 0.0),
    )

    weighted_score = _calculate_weighted_score(
        speech_to_text_accuracy=speech_to_text_accuracy,
        aht_score=aht_score,
        rate_of_speech_score=ros_score,
        dead_air_score=dead_air_score,
        empathy_score=empathy_score,
        probing_score=probing_score,
        grammar_score=grammar_score,
        pronunciation_score=pronunciation_score,
        pacing_score=pacing_score,
        forbidden_word_penalty=forbidden_penalty,
        kpi_config=kpi_config,
    )

    pass_fail = weighted_score >= float(kpi_config.passing_score or DEFAULT_PASSING_SCORE)

    return {
        "transcript_confidence": transcript_confidence,
        "speech_to_text_accuracy": speech_to_text_accuracy,
        "aht_actual": aht_actual,
        "aht_score": aht_score,
        "aht_target": aht_target,
        "rate_of_speech": rate_of_speech,
        "rate_of_speech_score": ros_score,
        "dead_air_seconds": dead_air_seconds,
        "dead_air_score": dead_air_score,
        "empathy_matches": empathy_matches,
        "empathy_count": len(empathy_matches),
        "empathy_score": empathy_score,
        "probing_matches": probing_matches,
        "probing_count": len(probing_matches),
        "probing_score": probing_score,
        "grammar_score": grammar_score,
        "pronunciation_score": pronunciation_score,
        "pacing_score": pacing_score,
        "forbidden_matches": forbidden_matches,
        "forbidden_penalty": forbidden_penalty,
        "weighted_score": weighted_score,
        "pass_fail": pass_fail,
    }


def _build_ai_feedback(
    *,
    evaluation: dict[str, Any],
    kpi_config: BatchKPIConfig,
    assessment: Optional[dict[str, Any]] = None,
    fallback_message: Optional[str] = None,
) -> str:
    parts: list[str] = []
    passing_score = float(kpi_config.passing_score or DEFAULT_PASSING_SCORE)
    weighted_score = float(evaluation.get("weighted_score") or 0.0)

    if fallback_message:
        parts.append(fallback_message)
    elif evaluation.get("pass_fail"):
        parts.append(
            f"Passed with {weighted_score:.1f}%. Keep the same structure and control on the next attempt."
        )
    else:
        parts.append(
            f"Scored {weighted_score:.1f}%. Retake required to reach {passing_score:.0f}%."
        )

    if evaluation.get("forbidden_matches"):
        parts.append(
            "Forbidden words detected: "
            + ", ".join(evaluation["forbidden_matches"][:5])
            + "."
        )

    if not evaluation.get("empathy_count") and _normalize_keyword_list(kpi_config.empathy_keywords):
        parts.append("Add at least one empathy statement before moving into resolution.")

    if not evaluation.get("probing_count") and _normalize_keyword_list(kpi_config.probing_keywords):
        parts.append("Use more probing questions to confirm the customer's exact need.")

    keyword_compliance = _normalize_json_object(evaluation.get("keyword_compliance"))
    missing_items = list(keyword_compliance.get("missing") or [])
    if missing_items:
        parts.append(
            "Missing required call phrases: " + ", ".join(missing_items[:3]) + "."
        )

    sentiment_score = evaluation.get("sentiment_score")
    if isinstance(sentiment_score, (int, float)):
        parts.append(
            f"Sentiment score {float(sentiment_score):.2f} ({_sentiment_label(float(sentiment_score))})."
        )

    coaching_tips = list((assessment or {}).get("coaching_tips") or [])
    if coaching_tips:
        parts.append("Focus next on: " + " ".join(coaching_tips[:2]))

    if not parts:
        parts.append("Session completed.")

    return " ".join(part.strip() for part in parts if part and part.strip())


def _apply_evaluation_to_session(
    *,
    session: SimSession,
    transcript: str,
    audio_url: Optional[str],
    audio_duration_seconds: int,
    evaluation: dict[str, Any],
    ai_feedback: str,
    completed_at: Optional[datetime] = None,
) -> None:
    session.audio_url = audio_url
    session.audio_duration_seconds = audio_duration_seconds
    session.transcript = transcript
    session.transcript_confidence = evaluation.get("transcript_confidence")
    session.completed_at = completed_at or datetime.utcnow()
    session.status = "completed" if evaluation.get("pass_fail") else "failed"
    session.speech_to_text_accuracy = evaluation.get("speech_to_text_accuracy")
    session.aht_target = evaluation.get("aht_target")
    session.aht_actual = evaluation.get("aht_actual")
    session.rate_of_speech = evaluation.get("rate_of_speech")
    session.dead_air_seconds = evaluation.get("dead_air_seconds")
    session.empathy_statements_count = evaluation.get("empathy_count", 0)
    session.probing_questions_count = evaluation.get("probing_count", 0)
    session.grammar_score = evaluation.get("grammar_score")
    session.pronunciation_score = evaluation.get("pronunciation_score")
    session.pacing_score = evaluation.get("pacing_score")
    session.sentiment_score = evaluation.get("sentiment_score")
    session.keyword_compliance = _normalize_json_object(evaluation.get("keyword_compliance"))
    session.forbidden_words_count = len(evaluation.get("forbidden_matches") or [])
    session.forbidden_words_detected = evaluation.get("forbidden_matches") or []
    session.forbidden_word_penalty_applied = evaluation.get("forbidden_penalty", 0.0)
    session.weighted_score = evaluation.get("weighted_score")
    session.pass_fail = bool(evaluation.get("pass_fail"))
    session.ai_feedback = ai_feedback


def _replace_scenario_steps(
    db: Session,
    *,
    scenario: Scenario,
    steps: list[Any],
) -> list[ScenarioFlow]:
    existing_steps = (
        db.query(ScenarioFlow)
        .filter(ScenarioFlow.scenario_id == scenario.id)
        .all()
    )
    for step in existing_steps:
        db.delete(step)
    db.flush()

    created_steps: list[ScenarioFlow] = []
    for index, step in enumerate(sorted(steps, key=lambda item: item.step_number), start=1):
        actor = (step.actor or "").strip().lower()
        speaker_label = (step.speaker_label or ("CSR" if actor == "csr" else "Member")).strip()
        keywords = _normalize_keyword_list(getattr(step, "expected_keywords", []) or [])
        metadata = _normalize_json_object(getattr(step, "metadata", None))
        created = ScenarioFlow(
            id=str(uuid.uuid4()),
            scenario_id=scenario.id,
            step_number=index,
            step_type="agent_response" if actor == "csr" else "customer_prompt",
            prompt_text=step.script.strip() if actor != "csr" else None,
            prompt_audio=step.audio_url,
            expected_response=step.script.strip() if actor == "csr" else None,
            expected_keywords_for_step=keywords,
            speaker_role=actor or ("csr" if step.step_number % 2 == 0 else "member"),
            speaker_label=speaker_label,
            is_closing=bool(getattr(step, "is_closing", False)),
            response_time_limit=getattr(step, "response_time_limit", None),
            step_metadata=metadata,
        )
        db.add(created)
        created_steps.append(created)
    db.flush()
    return created_steps


def _session_turn_logs(session: SimSession) -> list[dict[str, Any]]:
    return list(session.turn_logs or []) if isinstance(session.turn_logs, list) else []


def _session_transcript_log(session: SimSession) -> list[dict[str, Any]]:
    return list(session.transcript_log or []) if isinstance(session.transcript_log, list) else []


def _selected_csr_turns_for_scoring(session: SimSession) -> list[dict[str, Any]]:
    grouped_turns: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in _session_turn_logs(session):
        if str(item.get("actor", "")).lower() != "csr":
            continue
        step_number = int(item.get("step_number") or 0)
        if step_number <= 0:
            continue
        grouped_turns[step_number].append(item)

    selected_turns: list[dict[str, Any]] = []
    for step_number in sorted(grouped_turns):
        attempts = grouped_turns[step_number]
        accepted_attempts = [item for item in attempts if bool(item.get("accepted_for_progress"))]
        selected_turns.append((accepted_attempts or attempts)[-1])
    return selected_turns


def _aggregate_turn_based_evaluation(
    *,
    session: SimSession,
    kpi_config: BatchKPIConfig,
) -> tuple[str, int, dict[str, Any], str]:
    csr_turns = _selected_csr_turns_for_scoring(session)
    combined_transcript = " ".join(
        str(item.get("transcript") or item.get("text") or "").strip()
        for item in csr_turns
        if str(item.get("transcript") or item.get("text") or "").strip()
    ).strip()
    spoken_turn_duration = int(round(sum(float(item.get("duration_seconds") or 0.0) for item in csr_turns)))

    if not csr_turns:
        evaluation = _evaluate_submission(
            transcript=combined_transcript,
            audio_duration_seconds=0,
            kpi_config=kpi_config,
            overrides={
                "speech_to_text_accuracy": 0.0,
                "rate_of_speech": 0.0,
                "dead_air_seconds": 0.0,
                "grammar_score": 0.0,
                "pronunciation_score": 0.0,
                "pacing_score": 0.0,
            },
        )
        evaluation["weighted_score"] = 0.0
        evaluation["pass_fail"] = False
        ai_feedback = _build_ai_feedback(
            evaluation=evaluation,
            kpi_config=kpi_config,
            fallback_message="No CSR turn was recorded for this attempt.",
        )
        return combined_transcript, spoken_turn_duration, evaluation, ai_feedback

    speech_accuracy = _average([float(item.get("speech_to_text_accuracy") or 0.0) for item in csr_turns])
    grammar_score = _average([float(item.get("grammar_score") or 0.0) for item in csr_turns])
    pronunciation_score = _average([float(item.get("pronunciation_score") or 0.0) for item in csr_turns])
    pacing_score = _average([float(item.get("pacing_score") or 0.0) for item in csr_turns])
    dead_air_seconds = round(sum(float(item.get("dead_air_seconds") or 0.0) for item in csr_turns), 2)
    total_words = len(combined_transcript.split())
    rate_of_speech = round((total_words / max(spoken_turn_duration, 1)) * 60.0, 2) if spoken_turn_duration else 0.0

    evaluation = _evaluate_submission(
        transcript=combined_transcript,
        audio_duration_seconds=spoken_turn_duration,
        kpi_config=kpi_config,
        overrides={
            "speech_to_text_accuracy": speech_accuracy,
            "rate_of_speech": rate_of_speech,
            "dead_air_seconds": dead_air_seconds,
            "grammar_score": grammar_score,
            "pronunciation_score": pronunciation_score,
            "pacing_score": pacing_score,
            "detected_forbidden_words": sorted(
                {
                    word
                    for item in csr_turns
                    for word in list(item.get("forbidden_matches") or [])
                }
            ),
        },
    )
    session_level_duration = int(
        round(
            float(session.audio_duration_seconds or 0.0)
            or sum(float(item.get("duration_seconds") or 0.0) for item in _session_turn_logs(session))
            or spoken_turn_duration
        )
    )
    evaluation["aht_actual"] = session_level_duration
    evaluation["aht_score"] = _score_aht(
        session_level_duration,
        int(kpi_config.target_aht_seconds or evaluation.get("aht_target") or 120),
    )
    evaluation["weighted_score"] = _calculate_weighted_score(
        speech_to_text_accuracy=float(evaluation.get("speech_to_text_accuracy") or 0.0),
        aht_score=float(evaluation.get("aht_score") or 0.0),
        rate_of_speech_score=float(evaluation.get("rate_of_speech_score") or 0.0),
        dead_air_score=float(evaluation.get("dead_air_score") or 0.0),
        empathy_score=float(evaluation.get("empathy_score") or 0.0),
        probing_score=float(evaluation.get("probing_score") or 0.0),
        grammar_score=float(evaluation.get("grammar_score") or 0.0),
        pronunciation_score=float(evaluation.get("pronunciation_score") or 0.0),
        pacing_score=float(evaluation.get("pacing_score") or 0.0),
        forbidden_word_penalty=float(evaluation.get("forbidden_penalty") or 0.0),
        kpi_config=kpi_config,
    )
    evaluation["pass_fail"] = evaluation["weighted_score"] >= float(
        kpi_config.passing_score or DEFAULT_PASSING_SCORE
    )
    ai_feedback = _build_ai_feedback(
        evaluation=evaluation,
        kpi_config=kpi_config,
    )
    return combined_transcript, session_level_duration, evaluation, ai_feedback


def _failed_kpi_counts(
    sessions: list[SimSession],
    batch_kpi_config: Optional[BatchKPIConfig] = None,
) -> dict[str, int]:
    kpi_config = batch_kpi_config or _build_default_kpi_config()
    target_ros = float(kpi_config.target_ros_words_per_min or 150.0)
    target_dead_air = float(kpi_config.target_dead_air_seconds or 3.0)

    return {
        "speech_to_text_accuracy": sum(
            1
            for session in sessions
            if session.speech_to_text_accuracy is not None
            and session.speech_to_text_accuracy < 80
        ),
        "grammar": sum(
            1
            for session in sessions
            if session.grammar_score is not None and session.grammar_score < 80
        ),
        "pronunciation": sum(
            1
            for session in sessions
            if session.pronunciation_score is not None
            and session.pronunciation_score < 80
        ),
        "pacing": sum(
            1
            for session in sessions
            if session.pacing_score is not None and session.pacing_score < 80
        ),
        "aht": sum(
            1
            for session in sessions
            if session.aht_actual is not None
            and session.aht_target is not None
            and session.aht_actual > session.aht_target
        ),
        "rate_of_speech": sum(
            1
            for session in sessions
            if session.rate_of_speech is not None
            and _score_target_delta(session.rate_of_speech, target_ros, 95.0) < 80
        ),
        "dead_air": sum(
            1
            for session in sessions
            if session.dead_air_seconds is not None and session.dead_air_seconds > target_dead_air
        ),
        "empathy": sum(1 for session in sessions if (session.empathy_statements_count or 0) == 0),
        "probing": sum(1 for session in sessions if (session.probing_questions_count or 0) == 0),
        "forbidden_words": sum(1 for session in sessions if (session.forbidden_words_count or 0) > 0),
    }


def _resolve_report_period(
    *,
    month: Optional[int],
    year: Optional[int],
) -> tuple[Optional[datetime], Optional[datetime], str]:
    active_year = year or datetime.utcnow().year

    if month:
        from calendar import monthrange

        _, last_day = monthrange(active_year, month)
        return (
            datetime(active_year, month, 1),
            datetime(active_year, month, last_day, 23, 59, 59),
            datetime(active_year, month, 1).strftime("%B %Y"),
        )

    if year:
        return (
            datetime(active_year, 1, 1),
            datetime(active_year, 12, 31, 23, 59, 59),
            f"All Months {active_year}",
        )

    return None, None, "All Time"


# ==================== Trainer Scenario Management ====================


@router.post("/scenarios", response_model=SimFloorScenarioResponse, status_code=201)
async def create_sim_floor_scenario(
    scenario_data: SimFloorScenarioCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    batch = _get_accessible_batch(db, current_user, scenario_data.batch_id)

    new_scenario = Scenario(
        id=str(uuid.uuid4()),
        title=scenario_data.title.strip(),
        description=scenario_data.description,
        purpose=scenario_data.purpose,
        difficulty=scenario_data.difficulty,
        lob=batch.lob,
        opening_prompt=scenario_data.opening_prompt.strip(),
        expected_keywords=_normalize_keyword_list(scenario_data.expected_keywords),
        estimated_duration=scenario_data.estimated_duration,
        member_profile=_normalize_json_object(scenario_data.member_profile),
        cxone_metadata=_normalize_json_object(scenario_data.cxone_metadata),
        sim_floor_config=_normalize_json_object(scenario_data.sim_floor_config),
        ringer_audio_url=scenario_data.ringer_audio_url,
        hold_audio_url=scenario_data.hold_audio_url,
        created_by=current_user.id,
        is_published=True,
        is_draft=False,
    )
    db.add(new_scenario)
    db.flush()

    mapping = BatchScenarioMapping(
        id=str(uuid.uuid4()),
        batch_id=batch.id,
        scenario_id=new_scenario.id,
        assigned_by=current_user.id,
        is_active=True,
    )
    db.add(mapping)

    created_variations: list[ScenarioVariation] = []
    for variation_data in scenario_data.variations:
        variation = ScenarioVariation(
            id=str(uuid.uuid4()),
            scenario_id=new_scenario.id,
            actor_name=variation_data.actor_name.strip(),
            script=variation_data.script.strip(),
            score=variation_data.score,
            branching_logic=variation_data.branching_logic,
            is_active=True,
        )
        db.add(variation)
        created_variations.append(variation)

    if scenario_data.steps:
        _replace_scenario_steps(
            db,
            scenario=new_scenario,
            steps=scenario_data.steps,
        )

    db.flush()
    _sync_sim_floor_assignments_for_scenario(db, new_scenario.id)
    db.commit()
    db.refresh(new_scenario)
    db.refresh(mapping)

    return _serialize_scenario(
        db,
        new_scenario,
        batch=batch,
        mapping=mapping,
        variations=created_variations,
        highlighted_batch_id=batch.id,
    )


@router.get("/scenarios", response_model=list[SimFloorScenarioResponse])
async def list_trainer_scenarios(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    if current_user.role == UserRole.ADMIN:
        scenarios = (
            db.query(Scenario)
            .filter(Scenario.is_published == True)
            .order_by(Scenario.updated_at.desc())
            .all()
        )
    else:
        trainer_batch_ids = _get_trainer_batch_ids(db, current_user)
        mapped_scenario_ids = [
            scenario_id
            for (scenario_id,) in db.query(BatchScenarioMapping.scenario_id)
            .filter(
                BatchScenarioMapping.batch_id.in_(trainer_batch_ids or ["__none__"]),
                BatchScenarioMapping.is_active == True,
            )
            .distinct()
            .all()
        ]
        created_scenario_ids = [
            scenario_id
            for (scenario_id,) in db.query(Scenario.id)
            .filter(
                Scenario.created_by == current_user.id,
                Scenario.is_published == True,
            )
            .all()
        ]
        accessible_ids = sorted(set(mapped_scenario_ids + created_scenario_ids))
        if not accessible_ids:
            return []
        scenarios = (
            db.query(Scenario)
            .filter(Scenario.id.in_(accessible_ids))
            .order_by(Scenario.updated_at.desc())
            .all()
        )

    payload: list[SimFloorScenarioResponse] = []
    for scenario in scenarios:
        variations = (
            db.query(ScenarioVariation)
            .filter(
                ScenarioVariation.scenario_id == scenario.id,
                ScenarioVariation.is_active == True,
            )
            .order_by(ScenarioVariation.created_at.asc())
            .all()
        )
        payload.append(_serialize_scenario(db, scenario, variations=variations))

    return payload


@router.get("/batch/{batch_id}/scenarios", response_model=list[SimFloorScenarioResponse])
async def get_batch_scenarios(
    batch_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    batch = _get_accessible_batch(db, current_user, batch_id)

    mappings = (
        db.query(BatchScenarioMapping)
        .filter(
            BatchScenarioMapping.batch_id == batch_id,
            BatchScenarioMapping.is_active == True,
        )
        .order_by(BatchScenarioMapping.assigned_at.desc())
        .all()
    )

    results: list[SimFloorScenarioResponse] = []
    for mapping in mappings:
        scenario = db.query(Scenario).filter(Scenario.id == mapping.scenario_id).first()
        if not scenario:
            continue
        variations = (
            db.query(ScenarioVariation)
            .filter(
                ScenarioVariation.scenario_id == scenario.id,
                ScenarioVariation.is_active == True,
            )
            .all()
        )
        results.append(
            _serialize_scenario(
                db,
                scenario,
                batch=batch,
                mapping=mapping,
                variations=variations,
                highlighted_batch_id=batch.id,
            )
        )

    return results


@router.get("/scenarios/{scenario_id}", response_model=SimFloorScenarioResponse)
async def get_sim_floor_scenario(
    scenario_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    scenario = _get_accessible_scenario(db, current_user, scenario_id)

    mapping = (
        db.query(BatchScenarioMapping)
        .filter(
            BatchScenarioMapping.scenario_id == scenario.id,
            BatchScenarioMapping.is_active == True,
        )
        .order_by(BatchScenarioMapping.assigned_at.desc())
        .first()
    )
    batch = db.query(Batch).filter(Batch.id == mapping.batch_id).first() if mapping else None
    variations = (
        db.query(ScenarioVariation)
        .filter(
            ScenarioVariation.scenario_id == scenario.id,
            ScenarioVariation.is_active == True,
        )
        .order_by(ScenarioVariation.created_at.asc())
        .all()
    )
    return _serialize_scenario(
        db,
        scenario,
        batch=batch,
        mapping=mapping,
        variations=variations,
        highlighted_batch_id=batch.id if batch else None,
    )


@router.put("/scenarios/{scenario_id}", response_model=SimFloorScenarioResponse)
async def update_sim_floor_scenario(
    scenario_id: str,
    scenario_update: SimFloorScenarioUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    scenario = _get_accessible_scenario(db, current_user, scenario_id)

    if scenario_update.title is not None:
        scenario.title = scenario_update.title.strip()
    if scenario_update.description is not None:
        scenario.description = scenario_update.description
    if scenario_update.opening_prompt is not None:
        scenario.opening_prompt = scenario_update.opening_prompt.strip()
    if scenario_update.difficulty is not None:
        scenario.difficulty = scenario_update.difficulty
    if scenario_update.purpose is not None:
        scenario.purpose = scenario_update.purpose
    if scenario_update.expected_keywords is not None:
        scenario.expected_keywords = _normalize_keyword_list(scenario_update.expected_keywords)
    if scenario_update.estimated_duration is not None:
        scenario.estimated_duration = scenario_update.estimated_duration
    if scenario_update.member_profile is not None:
        scenario.member_profile = _normalize_json_object(scenario_update.member_profile)
    if scenario_update.cxone_metadata is not None:
        scenario.cxone_metadata = _normalize_json_object(scenario_update.cxone_metadata)
    if scenario_update.sim_floor_config is not None:
        scenario.sim_floor_config = _normalize_json_object(scenario_update.sim_floor_config)
    if scenario_update.ringer_audio_url is not None:
        scenario.ringer_audio_url = scenario_update.ringer_audio_url
    if scenario_update.hold_audio_url is not None:
        scenario.hold_audio_url = scenario_update.hold_audio_url
    if scenario_update.is_published is not None:
        scenario.is_published = scenario_update.is_published
        scenario.is_draft = not scenario_update.is_published

    active_mapping = (
        db.query(BatchScenarioMapping)
        .filter(
            BatchScenarioMapping.scenario_id == scenario.id,
            BatchScenarioMapping.is_active == True,
        )
        .order_by(BatchScenarioMapping.assigned_at.desc())
        .first()
    )
    batch = db.query(Batch).filter(Batch.id == active_mapping.batch_id).first() if active_mapping else None

    if scenario_update.batch_id:
        batch = _get_accessible_batch(db, current_user, scenario_update.batch_id)
        existing_mapping = (
            db.query(BatchScenarioMapping)
            .filter(
                BatchScenarioMapping.scenario_id == scenario.id,
                BatchScenarioMapping.batch_id == batch.id,
            )
            .first()
        )
        if existing_mapping:
            existing_mapping.is_active = True
            existing_mapping.assigned_by = current_user.id
            existing_mapping.assigned_at = datetime.utcnow()
            active_mapping = existing_mapping
        else:
            active_mapping = BatchScenarioMapping(
                id=str(uuid.uuid4()),
                batch_id=batch.id,
                scenario_id=scenario.id,
                assigned_by=current_user.id,
                is_active=True,
            )
            db.add(active_mapping)

        scenario.lob = batch.lob

    if scenario_update.variations is not None:
        existing_variations = (
            db.query(ScenarioVariation)
            .filter(ScenarioVariation.scenario_id == scenario.id)
            .all()
        )
        for variation in existing_variations:
            variation.is_active = False

        for variation_data in scenario_update.variations:
            db.add(
                ScenarioVariation(
                    id=str(uuid.uuid4()),
                    scenario_id=scenario.id,
                    actor_name=variation_data.actor_name.strip(),
                    script=variation_data.script.strip(),
                    score=variation_data.score,
                    branching_logic=variation_data.branching_logic,
                    is_active=True,
                )
            )

    if scenario_update.steps is not None:
        _replace_scenario_steps(
            db,
            scenario=scenario,
            steps=scenario_update.steps,
        )

    db.flush()
    _sync_sim_floor_assignments_for_scenario(db, scenario.id)
    db.commit()
    db.refresh(scenario)

    variations = (
        db.query(ScenarioVariation)
        .filter(
            ScenarioVariation.scenario_id == scenario.id,
            ScenarioVariation.is_active == True,
        )
        .order_by(ScenarioVariation.created_at.asc())
        .all()
    )
    if active_mapping and not batch:
        batch = db.query(Batch).filter(Batch.id == active_mapping.batch_id).first()

    return _serialize_scenario(
        db,
        scenario,
        batch=batch,
        mapping=active_mapping,
        variations=variations,
        highlighted_batch_id=batch.id if batch else None,
    )


@router.delete("/scenarios/{scenario_id}", response_model=SuccessResponse)
async def delete_sim_floor_scenario(
    scenario_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    scenario = _get_accessible_scenario(db, current_user, scenario_id)

    scenario.is_published = False
    scenario.is_draft = True

    mappings = (
        db.query(BatchScenarioMapping)
        .filter(BatchScenarioMapping.scenario_id == scenario.id)
        .all()
    )
    for mapping in mappings:
        mapping.is_active = False

    variations = (
        db.query(ScenarioVariation)
        .filter(ScenarioVariation.scenario_id == scenario.id)
        .all()
    )
    for variation in variations:
        variation.is_active = False

    _sync_sim_floor_assignments_for_scenario(db, scenario.id)
    db.commit()
    return SuccessResponse(message="Scenario archived successfully")


# ==================== Variation Management ====================


@router.post("/variations", response_model=ScenarioVariationResponse, status_code=201)
async def create_variation(
    variation_data: ScenarioVariationCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    _get_accessible_scenario(db, current_user, variation_data.scenario_id)

    new_variation = ScenarioVariation(
        id=str(uuid.uuid4()),
        scenario_id=variation_data.scenario_id,
        actor_name=variation_data.actor_name.strip(),
        script=variation_data.script.strip(),
        score=variation_data.score,
        branching_logic=variation_data.branching_logic,
        is_active=True,
    )
    db.add(new_variation)
    db.commit()
    db.refresh(new_variation)
    return ScenarioVariationResponse.model_validate(new_variation)


@router.get("/variations/{variation_id}", response_model=ScenarioVariationResponse)
async def get_variation(
    variation_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    variation = db.query(ScenarioVariation).filter(ScenarioVariation.id == variation_id).first()
    if not variation:
        raise HTTPException(status_code=404, detail="Variation not found")

    _get_accessible_scenario(db, current_user, variation.scenario_id)
    return ScenarioVariationResponse.model_validate(variation)


@router.put("/variations/{variation_id}", response_model=ScenarioVariationResponse)
async def update_variation(
    variation_id: str,
    variation_update: ScenarioVariationUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    variation = db.query(ScenarioVariation).filter(ScenarioVariation.id == variation_id).first()
    if not variation:
        raise HTTPException(status_code=404, detail="Variation not found")

    _get_accessible_scenario(db, current_user, variation.scenario_id)

    if variation_update.actor_name is not None:
        variation.actor_name = variation_update.actor_name.strip()
    if variation_update.script is not None:
        variation.script = variation_update.script.strip()
    if variation_update.score is not None:
        variation.score = variation_update.score
    if variation_update.branching_logic is not None:
        variation.branching_logic = variation_update.branching_logic
    if variation_update.is_active is not None:
        variation.is_active = variation_update.is_active

    db.commit()
    db.refresh(variation)
    return ScenarioVariationResponse.model_validate(variation)


@router.delete("/variations/{variation_id}", response_model=SuccessResponse)
async def delete_variation(
    variation_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    variation = db.query(ScenarioVariation).filter(ScenarioVariation.id == variation_id).first()
    if not variation:
        raise HTTPException(status_code=404, detail="Variation not found")

    _get_accessible_scenario(db, current_user, variation.scenario_id)
    variation.is_active = False
    db.commit()
    return SuccessResponse(message="Variation archived successfully")


@router.get("/scenarios/{scenario_id}/variations", response_model=list[ScenarioVariationResponse])
async def list_variations(
    scenario_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    _get_accessible_scenario(db, current_user, scenario_id)

    variations = (
        db.query(ScenarioVariation)
        .filter(
            ScenarioVariation.scenario_id == scenario_id,
            ScenarioVariation.is_active == True,
        )
        .order_by(ScenarioVariation.created_at.asc())
        .all()
    )
    return [ScenarioVariationResponse.model_validate(variation) for variation in variations]


# ==================== Batch Mapping ====================


@router.post("/batch-mapping", response_model=BatchScenarioMappingCreate)
async def create_batch_mapping(
    mapping_data: BatchScenarioMappingCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    _get_accessible_batch(db, current_user, mapping_data.batch_id)
    _get_accessible_scenario(db, current_user, mapping_data.scenario_id)

    existing = (
        db.query(BatchScenarioMapping)
        .filter(
            BatchScenarioMapping.batch_id == mapping_data.batch_id,
            BatchScenarioMapping.scenario_id == mapping_data.scenario_id,
        )
        .first()
    )
    if existing:
        existing.is_active = True
        existing.assigned_by = current_user.id
        existing.assigned_at = datetime.utcnow()
    else:
        db.add(
            BatchScenarioMapping(
                id=str(uuid.uuid4()),
                batch_id=mapping_data.batch_id,
                scenario_id=mapping_data.scenario_id,
                assigned_by=current_user.id,
                is_active=True,
            )
        )

    db.flush()
    _sync_sim_floor_assignments_for_scenario(db, mapping_data.scenario_id)
    db.commit()
    return BatchScenarioMappingCreate(
        batch_id=mapping_data.batch_id,
        scenario_id=mapping_data.scenario_id,
    )


# ==================== KPI Configuration ====================


@router.post("/kpi-config", response_model=BatchKPIConfigResponse, status_code=201)
async def create_kpi_config(
    config_data: BatchKPIConfigCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    _get_accessible_batch(db, current_user, config_data.batch_id)
    _validate_kpi_weights(config_data)

    existing = (
        db.query(BatchKPIConfig)
        .filter(BatchKPIConfig.batch_id == config_data.batch_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="KPI config already exists for this batch")

    new_config = BatchKPIConfig(
        id=str(uuid.uuid4()),
        batch_id=config_data.batch_id,
        speech_to_text_weight=config_data.speech_to_text_weight,
        aht_weight=config_data.aht_weight,
        rate_of_speech_weight=config_data.rate_of_speech_weight,
        dead_air_weight=config_data.dead_air_weight,
        empathy_statements_weight=config_data.empathy_statements_weight,
        probing_questions_weight=config_data.probing_questions_weight,
        grammar_weight=config_data.grammar_weight,
        pronunciation_weight=config_data.pronunciation_weight,
        pacing_weight=config_data.pacing_weight,
        forbidden_words_penalty=config_data.forbidden_words_penalty,
        passing_score=config_data.passing_score,
        forbidden_words=_normalize_keyword_list(config_data.forbidden_words),
        empathy_keywords=_normalize_keyword_list(config_data.empathy_keywords),
        probing_keywords=_normalize_keyword_list(config_data.probing_keywords),
        target_aht_seconds=config_data.target_aht_seconds,
        target_ros_words_per_min=config_data.target_ros_words_per_min,
        target_dead_air_seconds=config_data.target_dead_air_seconds,
    )
    db.add(new_config)
    db.commit()
    db.refresh(new_config)
    return BatchKPIConfigResponse.model_validate(new_config)


@router.get("/kpi-config/{batch_id}", response_model=BatchKPIConfigResponse)
async def get_kpi_config(
    batch_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    if current_user.role in [UserRole.ADMIN, UserRole.TRAINER]:
        _get_accessible_batch(db, current_user, batch_id)
    elif current_user.role == UserRole.TRAINEE:
        if batch_id not in {batch.id for batch in current_user.batches}:
            raise HTTPException(status_code=403, detail="Access denied")

    config = db.query(BatchKPIConfig).filter(BatchKPIConfig.batch_id == batch_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="KPI config not found")
    return BatchKPIConfigResponse.model_validate(config)


@router.put("/kpi-config/{batch_id}", response_model=BatchKPIConfigResponse)
async def update_kpi_config(
    batch_id: str,
    config_update: BatchKPIConfigUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    _get_accessible_batch(db, current_user, batch_id)

    config = db.query(BatchKPIConfig).filter(BatchKPIConfig.batch_id == batch_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="KPI config not found")

    update_data = config_update.model_dump(exclude_unset=True)
    list_fields = {"forbidden_words", "empathy_keywords", "probing_keywords"}
    for field, value in update_data.items():
        setattr(config, field, _normalize_keyword_list(value) if field in list_fields else value)

    _validate_kpi_weights(config)
    db.commit()
    db.refresh(config)
    return BatchKPIConfigResponse.model_validate(config)


# ==================== Bulk Upload ====================


@router.post("/bulk-upload", response_model=BulkUploadResponse)
async def bulk_upload_scenarios(
    batch_id: str,
    scenario_title: str,
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    batch = _get_accessible_batch(db, current_user, batch_id)

    try:
        contents = await file.read()
        filename = (file.filename or "").lower()
        if filename.endswith(".csv"):
            dataframe = pd.read_csv(io.BytesIO(contents))
        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            dataframe = pd.read_excel(io.BytesIO(contents))
        else:
            try:
                dataframe = pd.read_csv(io.BytesIO(contents))
            except Exception:
                dataframe = pd.read_excel(io.BytesIO(contents))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Error reading upload. Provide a valid CSV or Excel file: {exc}",
        ) from exc

    required_columns = ["Actor", "Script", "Score"]
    missing_columns = [column for column in required_columns if column not in dataframe.columns]
    if missing_columns:
        raise HTTPException(status_code=400, detail=f"Missing columns: {missing_columns}")

    first_row_script = ""
    for _, row in dataframe.iterrows():
        candidate_script = str(row.get("Script", "")).strip()
        if candidate_script:
            first_row_script = candidate_script
            break

    new_scenario = Scenario(
        id=str(uuid.uuid4()),
        title=scenario_title.strip(),
        description=f"Bulk uploaded scenario - {scenario_title.strip()}",
        opening_prompt=first_row_script or "Bulk uploaded Sim Floor scenario",
        created_by=current_user.id,
        difficulty=None,
        purpose=None,
        lob=batch.lob,
        member_profile={
            "name": "Sample Member",
            "member_id": "SIM-001",
            "plan_type": "Healthy Benefits Plus",
            "verification_status": "Pending",
            "problem_statement": "Follow the uploaded script until the mock call is completed.",
        },
        cxone_metadata={
            "workspace_label": "MAX Mock Call",
            "crm_section": "Member Details",
            "source_template": file.filename,
        },
        sim_floor_config={
            "source": "bulk_upload",
            "use_google_asr": True,
            "template_columns": list(dataframe.columns),
        },
        is_published=True,
        is_draft=False,
    )
    db.add(new_scenario)
    db.flush()

    db.add(
        BatchScenarioMapping(
            id=str(uuid.uuid4()),
            batch_id=batch.id,
            scenario_id=new_scenario.id,
            assigned_by=current_user.id,
            is_active=True,
        )
    )

    variations_created = 0
    failed_rows = 0
    errors: list[str] = []
    uploaded_steps: list[dict[str, Any]] = []

    for index, row in dataframe.iterrows():
        actor = str(row.get("Actor", "")).strip()
        script = str(row.get("Script", "")).strip()
        score_value = row.get("Score", 0)
        branching_logic = (
            str(row.get("Branching Logic", "")).strip()
            if "Branching Logic" in dataframe.columns and row.get("Branching Logic") is not None
            else None
        )

        if not actor or not script:
            failed_rows += 1
            errors.append(f"Row {index + 2}: Actor and Script are required.")
            continue

        try:
            score = float(score_value)
        except Exception:
            failed_rows += 1
            errors.append(f"Row {index + 2}: Score must be numeric.")
            continue

        actor_key = actor.strip().lower()
        uploaded_steps.append(
            {
                "step_number": len(uploaded_steps) + 1,
                "actor": "csr" if actor_key == "csr" else "member",
                "speaker_label": actor.strip(),
                "script": script,
                "expected_keywords": [],
                "audio_url": None,
                "response_time_limit": None,
                "is_closing": False,
                "metadata": {
                    "score": max(0.0, min(score, 5.0)),
                    "branching_logic": branching_logic,
                    "source_row": index + 2,
                },
            }
        )

        if actor_key == "csr":
            db.add(
                ScenarioVariation(
                    id=str(uuid.uuid4()),
                    scenario_id=new_scenario.id,
                    actor_name=actor,
                    script=script,
                    score=max(0.0, min(score, 5.0)),
                    branching_logic=branching_logic,
                    is_active=True,
                )
            )
            variations_created += 1

    if uploaded_steps:
        class _StepProxy:
            def __init__(self, payload: dict[str, Any]) -> None:
                for key, value in payload.items():
                    setattr(self, key, value)

        _replace_scenario_steps(
            db,
            scenario=new_scenario,
            steps=[_StepProxy(step) for step in uploaded_steps],
        )

    db.commit()

    return BulkUploadResponse(
        scenario_id=new_scenario.id,
        variations_created=variations_created,
        failed_rows=failed_rows,
        errors=errors,
    )


@router.get("/bulk-upload-template")
async def get_bulk_upload_template(
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    rows = [
        ["Actor", "Script", "Score", "Branching Logic"],
        [
            "Angry Customer",
            "I understand the frustration, and I will review your billing dispute right now.",
            5,
            "if customer mentions refund -> branch_refund",
        ],
        [
            "Neutral Customer",
            "Thank you for raising that concern. May I ask for your account number first?",
            4,
            "if verified -> branch_resolution",
        ],
    ]

    if format == "csv":
        csv_lines = [
            ",".join(
                '"' + str(value).replace('"', '""') + '"' if isinstance(value, str) else str(value)
                for value in row
            )
            for row in rows
        ]
        return Response(
            content="\n".join(csv_lines),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=sim-floor-template.csv"},
        )

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Scenarios"
    for row in rows:
        worksheet.append(row)

    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=sim-floor-template.xlsx"},
    )


# ==================== Trainer Asset Uploads ====================


@router.post("/assets/audio")
async def upload_sim_floor_audio_asset(
    asset_kind: str = Form(...),
    scenario_id: Optional[str] = Form(None),
    step_number: Optional[int] = Form(None),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    normalized_asset_kind = (asset_kind or "").strip().lower()
    allowed_asset_kinds = {"member-step", "ringer", "hold"}
    if normalized_asset_kind not in allowed_asset_kinds:
        raise HTTPException(status_code=400, detail="Unsupported Sim Floor audio asset type")

    scenario_segment = "draft"
    if scenario_id:
        scenario = _get_accessible_scenario(db, current_user, scenario_id)
        scenario_segment = scenario.id

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio asset is empty")

    mime_type = (file.content_type or "").strip().lower()
    if mime_type and not mime_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Only audio files can be uploaded for Sim Floor assets")

    original_name = file.filename or "sim-floor-audio"
    base_name, extension = os.path.splitext(original_name)
    safe_extension = extension if extension else ".mp3"
    normalized_base = "".join(
        character.lower() if character.isalnum() else "-"
        for character in (base_name or "sim-floor-audio")
    ).strip("-") or "sim-floor-audio"
    step_prefix = (
        f"step-{max(int(step_number or 0), 0):02d}_"
        if normalized_asset_kind == "member-step" and step_number
        else ""
    )
    storage_leaf = (
        f"{step_prefix}{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}_{normalized_base}{safe_extension}"
    )

    supabase = get_supabase_client()
    audio_url = None
    if supabase.is_available:
        audio_url = supabase.upload_sim_floor_asset(
            file_data=file_bytes,
            trainer_id=current_user.id,
            scenario_id=scenario_segment,
            asset_kind=normalized_asset_kind,
            filename=storage_leaf,
            content_type=file.content_type or "audio/mpeg",
        )

    if not audio_url:
        local_audio_dir = os.path.join(
            os.getcwd(),
            "media",
            "sim-floor-assets",
            current_user.id,
            scenario_segment,
            normalized_asset_kind,
        )
        os.makedirs(local_audio_dir, exist_ok=True)
        local_filepath = os.path.join(local_audio_dir, storage_leaf)
        with open(local_filepath, "wb") as local_file:
            local_file.write(file_bytes)
        audio_url = (
            f"/media/sim-floor-assets/{current_user.id}/{scenario_segment}/{normalized_asset_kind}/{storage_leaf}"
        )

    return {
        "audio_url": audio_url,
        "asset_kind": normalized_asset_kind,
        "filename": storage_leaf,
        "scenario_id": scenario_segment,
    }


# ==================== Trainee Simulation ====================


@router.get("/available")
async def get_available_scenarios(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainee(current_user)

    did_sync_assignments = _sync_sim_floor_assignments_for_trainee(db, current_user)
    sync_trainee_completion_certificates(db, current_user.id)
    deleted_certificates = prune_trainee_activity_certificates(db, current_user.id)
    if did_sync_assignments or deleted_certificates:
        db.commit()

    assignments = (
        db.query(SimFloorAssignment)
        .filter(
            SimFloorAssignment.trainee_id == current_user.id,
            SimFloorAssignment.is_active == True,
        )
        .order_by(SimFloorAssignment.assigned_at.desc(), SimFloorAssignment.updated_at.desc())
        .all()
    )
    if not assignments:
        return {"scenarios": []}

    scenario_ids = [assignment.scenario_id for assignment in assignments]
    trainer_ids = [assignment.assigned_by for assignment in assignments if assignment.assigned_by]
    batch_ids = [assignment.batch_id for assignment in assignments if assignment.batch_id]
    scenarios = {
        scenario.id: scenario
        for scenario in db.query(Scenario)
        .filter(
            Scenario.id.in_(scenario_ids),
            Scenario.is_published == True,
        )
        .all()
    }
    trainers = {
        trainer.id: trainer
        for trainer in db.query(User)
        .filter(User.id.in_(trainer_ids or ["__none__"]))
        .all()
    }
    batches = {
        batch.id: batch
        for batch in db.query(Batch)
        .filter(Batch.id.in_(batch_ids or ["__none__"]))
        .all()
    }
    mappings = (
        db.query(BatchScenarioMapping)
        .filter(
            BatchScenarioMapping.scenario_id.in_(scenario_ids),
            BatchScenarioMapping.is_active == True,
        )
        .all()
    )

    scenarios_payload: list[dict[str, Any]] = []
    for assignment in assignments:
        scenario = scenarios.get(assignment.scenario_id)
        if not scenario:
            continue

        assigned_batches = _build_scenario_assignment_summaries(
            db,
            scenario.id,
            mappings=[
                candidate
                for candidate in mappings
                if candidate.scenario_id == scenario.id
            ],
        )
        variation_count = (
            db.query(ScenarioVariation)
            .filter(
                ScenarioVariation.scenario_id == scenario.id,
                ScenarioVariation.is_active == True,
            )
            .count()
        )
        latest_session = (
            db.query(SimSession)
            .filter(
                SimSession.trainee_id == current_user.id,
                SimSession.scenario_id == scenario.id,
            )
            .order_by(SimSession.created_at.desc())
            .first()
        )
        scenarios_payload.append(
            {
                "id": scenario.id,
                "assignment_id": assignment.id,
                "assigned_at": assignment.assigned_at.isoformat() if assignment.assigned_at else None,
                "assigned_by_id": assignment.assigned_by,
                "assigned_by_name": trainers.get(assignment.assigned_by).full_name
                if trainers.get(assignment.assigned_by)
                else None,
                "assignment_batch_id": assignment.batch_id,
                "assignment_batch_name": batches.get(assignment.batch_id).name
                if batches.get(assignment.batch_id)
                else None,
                "title": scenario.title,
                "description": scenario.description,
                "difficulty": scenario.difficulty.value if scenario.difficulty else None,
                "variation_count": variation_count,
                "steps_count": len(_build_scenario_steps(scenario)),
                "assigned_batches": [
                    {
                        "batch_id": summary.batch_id,
                        "batch_name": summary.batch_name,
                        "wave_number": summary.wave_number,
                        "assigned_at": summary.assigned_at.isoformat() if summary.assigned_at else None,
                    }
                    for summary in assigned_batches
                ],
                "attempt_count": (
                    db.query(SimSession)
                    .filter(
                        SimSession.trainee_id == current_user.id,
                        SimSession.scenario_id == scenario.id,
                    )
                    .count()
                ),
                "retake_required": bool(latest_session and latest_session.trainer_verdict_status == "retake"),
                "competent": bool(latest_session and latest_session.trainer_verdict_status == "competent"),
                "latest_score": float(latest_session.weighted_score or 0.0) if latest_session else 0.0,
            }
        )

    return {"scenarios": scenarios_payload}


@router.post("/start", response_model=SimSessionStartResponse)
async def start_simulation(
    session_data: SimSessionCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainee(current_user)

    scenario = (
        db.query(Scenario)
        .filter(
            Scenario.id == session_data.scenario_id,
            Scenario.is_published == True,
        )
        .first()
    )
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    did_sync_assignments = _sync_sim_floor_assignments_for_trainee(db, current_user)
    if did_sync_assignments:
        db.flush()

    assignment = (
        db.query(SimFloorAssignment)
        .filter(
            SimFloorAssignment.trainee_id == current_user.id,
            SimFloorAssignment.scenario_id == scenario.id,
            SimFloorAssignment.is_active == True,
        )
        .order_by(SimFloorAssignment.assigned_at.desc(), SimFloorAssignment.updated_at.desc())
        .first()
    )

    trainee_batch_ids = {batch.id for batch in current_user.batches}
    active_mappings = (
        db.query(BatchScenarioMapping)
        .filter(
            BatchScenarioMapping.scenario_id == scenario.id,
            BatchScenarioMapping.is_active == True,
        )
        .all()
    )
    accessible_batch_ids = [mapping.batch_id for mapping in active_mappings if mapping.batch_id in trainee_batch_ids]
    if assignment and assignment.batch_id:
        accessible_batch_ids = list(dict.fromkeys([assignment.batch_id, *accessible_batch_ids]))
    if not accessible_batch_ids:
        raise HTTPException(status_code=403, detail="Scenario is not assigned to your trainee workspace")

    batch_id = (
        session_data.batch_id
        if session_data.batch_id in accessible_batch_ids
        else assignment.batch_id
        if assignment and assignment.batch_id in accessible_batch_ids
        else accessible_batch_ids[0]
    )
    kpi_config = db.query(BatchKPIConfig).filter(BatchKPIConfig.batch_id == batch_id).first()

    variation = (
        db.query(ScenarioVariation)
        .filter(
            ScenarioVariation.scenario_id == scenario.id,
            ScenarioVariation.is_active == True,
        )
        .order_by(func.random())
        .first()
    )

    new_session = SimSession(
        id=str(uuid.uuid4()),
        trainee_id=current_user.id,
        scenario_id=scenario.id,
        scenario_variation_id=variation.id if variation else None,
        batch_id=batch_id,
        status="in_progress",
        current_step=1,
        started_at=datetime.utcnow(),
        aht_target=(kpi_config.target_aht_seconds if kpi_config else 120),
        attempt_number=1,
        max_attempts=DEFAULT_MAX_ATTEMPTS,
        pass_fail=False,
        transcript_log=[],
        turn_logs=[],
        trainer_verdict_status="pending",
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    effective_kpi = kpi_config or _build_default_kpi_config(batch_id=batch_id)
    return SimSessionStartResponse(
        session_id=new_session.id,
        scenario_title=scenario.title,
        scenario_description=scenario.description,
        opening_prompt=scenario.opening_prompt,
        current_step=int(new_session.current_step or 1),
        variation=ScenarioVariationResponse.model_validate(variation) if variation else None,
        kpi_config=BatchKPIConfigResponse.model_validate(effective_kpi),
        passing_score=float(effective_kpi.passing_score or DEFAULT_PASSING_SCORE),
        member_profile=_normalize_json_object(scenario.member_profile),
        cxone_metadata=_normalize_json_object(scenario.cxone_metadata),
        sim_floor_config=_normalize_json_object(scenario.sim_floor_config),
        ringer_audio_url=scenario.ringer_audio_url,
        hold_audio_url=scenario.hold_audio_url,
        steps=_build_scenario_steps(scenario),
    )


@router.get("/session/{session_id}", response_model=SimSessionResponse)
async def get_session(
    session_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    session = _get_accessible_session(db, current_user, session_id)
    return SimSessionResponse.model_validate(session)


@router.post("/session/{session_id}/turn", response_model=SimSessionTurnResponse)
async def submit_session_turn(
    session_id: str,
    step_number: int = Form(...),
    file: UploadFile = File(...),
    audio_duration_seconds: float = Form(...),
    live_transcript: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainee(current_user)
    session = _get_accessible_session(db, current_user, session_id)

    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="Session not in progress")

    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    steps = _build_scenario_steps(scenario)
    step = next((item for item in steps if item.step_number == step_number), None)
    if not step:
        raise HTTPException(status_code=404, detail="Scenario step not found")
    if step.actor != "csr":
        raise HTTPException(status_code=400, detail="Only CSR turns can be recorded")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

    original_name = file.filename or f"turn-{step_number}.webm"
    _, extension = os.path.splitext(original_name)
    safe_extension = extension if extension else ".webm"
    storage_leaf = f"step-{step_number}_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}{safe_extension}"

    supabase = get_supabase_client()
    audio_url = None
    if supabase.is_available:
        audio_url = supabase.upload_sim_floor_audio(
            file_data=file_bytes,
            trainee_id=current_user.id,
            scenario_id=scenario.id,
            session_id=session.id,
            filename=storage_leaf,
            content_type=file.content_type or "audio/webm",
        )

    if not audio_url:
        local_audio_dir = os.path.join(
            os.getcwd(),
            "media",
            "sim-floor-recordings",
            current_user.id,
            scenario.id,
            session.id,
        )
        os.makedirs(local_audio_dir, exist_ok=True)
        local_filepath = os.path.join(local_audio_dir, storage_leaf)
        with open(local_filepath, "wb") as local_file:
            local_file.write(file_bytes)
        audio_url = f"/media/sim-floor-recordings/{current_user.id}/{scenario.id}/{session.id}/{storage_leaf}"

    class _StepScenario:
        title = scenario.title
        expected_keywords = list(step.expected_keywords or [])
        flow_steps: list[Any] = []
        opening_prompt = step.script

    assessment = assess_audio_submission(
        audio_bytes=file_bytes,
        filename=original_name,
        mime_type=file.content_type or "audio/webm",
        scenario=_StepScenario(),
        reference_text=step.script,
        fallback_transcript=(live_transcript or None),
        response_duration=float(audio_duration_seconds),
        user_dialect=current_user.language_dialect,
    )
    asr_provider = str(assessment.get("provider") or "").strip() or None
    transcript_confidence = float(assessment.get("transcription_confidence") or 0.0)

    transcript = (
        assessment.get("transcription")
        or assessment.get("text")
        or live_transcript
        or ""
    ).strip()
    kpi_config = _get_effective_kpi_config(db, session.batch_id)
    duration_seconds = max(float(audio_duration_seconds or 0.0), 0.0)
    evaluation = _evaluate_submission(
        transcript=transcript,
        audio_duration_seconds=int(round(duration_seconds)),
        kpi_config=kpi_config,
        assessment=assessment if assessment.get("status") == "completed" else None,
        overrides=None if assessment.get("status") == "completed" else {
            "speech_to_text_accuracy": 0.0,
            "rate_of_speech": 0.0,
            "dead_air_seconds": duration_seconds,
            "grammar_score": 0.0,
            "pronunciation_score": 0.0,
            "pacing_score": 0.0,
        },
    )
    ai_feedback = _build_ai_feedback(
        evaluation=evaluation,
        kpi_config=kpi_config,
        assessment=assessment if assessment.get("status") == "completed" else None,
        fallback_message=assessment.get("error") if assessment.get("status") != "completed" else None,
    )
    matched_keywords = assessment.get("matched_keywords") or _find_keyword_matches(transcript, step.expected_keywords)
    requires_repeat, repeat_reason, script_similarity = _determine_repeat_requirement(
        transcript=transcript,
        step=step,
        evaluation=evaluation,
        assessment=assessment,
        matched_keywords=list(matched_keywords),
    )

    turn_logs = _session_turn_logs(session)
    transcript_log = _session_transcript_log(session)
    step_attempt_number = (
        len([item for item in turn_logs if int(item.get("step_number") or 0) == step.step_number]) + 1
    )

    turn_log = {
        "turn_attempt_id": str(uuid.uuid4()),
        "turn_attempt_number": step_attempt_number,
        "step_number": step.step_number,
        "actor": "csr",
        "speaker_label": step.speaker_label or "CSR",
        "expected_script": step.script,
        "expected_keywords": list(step.expected_keywords or []),
        "transcript": transcript,
        "audio_url": audio_url,
        "duration_seconds": round(duration_seconds, 2),
        "asr_provider": asr_provider,
        "asr_provider_label": _format_asr_provider_label(asr_provider),
        "transcript_confidence": transcript_confidence,
        "matched_keywords": list(matched_keywords),
        "speech_to_text_accuracy": float(evaluation.get("speech_to_text_accuracy") or 0.0),
        "grammar_score": float(evaluation.get("grammar_score") or 0.0),
        "pronunciation_score": float(evaluation.get("pronunciation_score") or 0.0),
        "pacing_score": float(evaluation.get("pacing_score") or 0.0),
        "rate_of_speech": float(evaluation.get("rate_of_speech") or 0.0),
        "dead_air_seconds": float(evaluation.get("dead_air_seconds") or 0.0),
        "forbidden_matches": list(evaluation.get("forbidden_matches") or []),
        "ai_feedback": ai_feedback,
        "accepted_for_progress": not requires_repeat,
        "requires_repeat": requires_repeat,
        "repeat_prompt": TURN_REPEAT_PROMPT if requires_repeat else None,
        "repeat_reason": repeat_reason,
        "script_similarity": round(script_similarity * 100.0, 2),
        "created_at": datetime.utcnow().isoformat(),
    }
    turn_logs.append(turn_log)
    transcript_log.append(
        {
            "turn_attempt_id": turn_log["turn_attempt_id"],
            "turn_attempt_number": step_attempt_number,
            "step_number": step.step_number,
            "actor": "csr",
            "speaker_label": step.speaker_label or "CSR",
            "text": transcript,
            "transcript": transcript,
            "audio_url": audio_url,
            "expected_script": step.script,
            "asr_provider": asr_provider,
            "transcript_confidence": transcript_confidence,
            "matched_keywords": list(matched_keywords),
            "duration_seconds": round(duration_seconds, 2),
            "accepted_for_progress": not requires_repeat,
            "requires_repeat": requires_repeat,
            "repeat_prompt": TURN_REPEAT_PROMPT if requires_repeat else None,
            "repeat_reason": repeat_reason,
            "script_similarity": round(script_similarity * 100.0, 2),
            "created_at": datetime.utcnow().isoformat(),
        }
    )
    turn_logs.sort(
        key=lambda item: (
            int(item.get("step_number") or 0),
            int(item.get("turn_attempt_number") or 0),
        )
    )
    transcript_log.sort(
        key=lambda item: (
            int(item.get("step_number") or 0),
            int(item.get("turn_attempt_number") or 0),
        )
    )

    progress_next_step = next((item.step_number for item in steps if item.step_number > step.step_number), None)
    next_step = step.step_number if requires_repeat else progress_next_step
    session.turn_logs = turn_logs
    session.transcript_log = transcript_log
    session.current_step = next_step or step.step_number
    session.audio_url = audio_url
    session.audio_duration_seconds = int(round(sum(float(item.get("duration_seconds") or 0.0) for item in turn_logs)))
    db.commit()
    db.refresh(session)

    return SimSessionTurnResponse(
        session_id=session.id,
        step_number=step.step_number,
        transcript=transcript,
        audio_url=audio_url,
        duration_seconds=round(duration_seconds, 2),
        asr_provider=asr_provider,
        asr_provider_label=_format_asr_provider_label(asr_provider),
        transcript_confidence=transcript_confidence,
        matched_keywords=list(turn_log["matched_keywords"]),
        speech_to_text_accuracy=float(turn_log["speech_to_text_accuracy"]),
        grammar_score=float(turn_log["grammar_score"]),
        pronunciation_score=float(turn_log["pronunciation_score"]),
        pacing_score=float(turn_log["pacing_score"]),
        rate_of_speech=float(turn_log["rate_of_speech"]),
        dead_air_seconds=float(turn_log["dead_air_seconds"]),
        ai_feedback=ai_feedback,
        requires_repeat=requires_repeat,
        repeat_prompt=TURN_REPEAT_PROMPT if requires_repeat else None,
        repeat_reason=repeat_reason,
        script_similarity=round(script_similarity * 100.0, 2),
        next_step=next_step,
        is_complete=(not requires_repeat and progress_next_step is None),
        transcript_log=transcript_log,
        turn_logs=turn_logs,
    )


@router.post("/session/{session_id}/recording")
async def upload_session_recording(
    session_id: str,
    file: UploadFile = File(...),
    audio_duration_seconds: Optional[float] = Form(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainee(current_user)
    session = _get_accessible_session(db, current_user, session_id)

    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded session recording is empty")

    original_name = file.filename or "session-recording.wav"
    _, extension = os.path.splitext(original_name)
    safe_extension = extension if extension else ".wav"
    storage_leaf = f"session_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}{safe_extension}"

    supabase = get_supabase_client()
    audio_url = None
    if supabase.is_available:
        audio_url = supabase.upload_sim_floor_audio(
            file_data=file_bytes,
            trainee_id=current_user.id,
            scenario_id=scenario.id,
            session_id=session.id,
            filename=storage_leaf,
            content_type=file.content_type or "audio/wav",
        )

    if not audio_url:
        local_audio_dir = os.path.join(
            os.getcwd(),
            "media",
            "sim-floor-recordings",
            current_user.id,
            scenario.id,
            session.id,
        )
        os.makedirs(local_audio_dir, exist_ok=True)
        local_filepath = os.path.join(local_audio_dir, storage_leaf)
        with open(local_filepath, "wb") as local_file:
            local_file.write(file_bytes)
        audio_url = f"/media/sim-floor-recordings/{current_user.id}/{scenario.id}/{session.id}/{storage_leaf}"

    session.audio_url = audio_url
    if audio_duration_seconds is not None:
        session.audio_duration_seconds = int(round(max(audio_duration_seconds, 0.0)))
    db.commit()

    return {
        "audio_url": audio_url,
        "audio_duration_seconds": session.audio_duration_seconds,
    }


@router.post("/session/{session_id}/finalize", response_model=SimSessionResponse)
async def finalize_session(
    session_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainee(current_user)
    session = _get_accessible_session(db, current_user, session_id)

    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="Session not in progress")

    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    kpi_config = _get_effective_kpi_config(db, session.batch_id)
    transcript, total_duration, evaluation, ai_feedback = _aggregate_turn_based_evaluation(
        session=session,
        kpi_config=kpi_config,
    )
    scenario_steps = _build_scenario_steps(scenario)
    keyword_compliance = _build_keyword_compliance_summary(transcript, scenario_steps)
    sentiment_score = _analyze_sentiment_score(transcript)
    evaluation["keyword_compliance"] = keyword_compliance
    evaluation["sentiment_score"] = sentiment_score
    ai_feedback = _build_ai_feedback(
        evaluation=evaluation,
        kpi_config=kpi_config,
    )

    full_transcript_log: list[dict[str, Any]] = []
    turn_lookup = {
        int(item.get("step_number") or 0): item
        for item in _selected_csr_turns_for_scoring(session)
    }
    existing_transcript_lookup = {
        int(item.get("step_number") or 0): item
        for item in _session_transcript_log(session)
    }
    timeline_cursor = 0.0
    for step in scenario_steps:
        existing_entry = existing_transcript_lookup.get(step.step_number, {})
        if step.actor == "csr":
            turn = turn_lookup.get(step.step_number, {})
            duration_seconds = round(
                float(turn.get("duration_seconds") or _estimate_script_duration_seconds(turn.get("transcript") or step.script)),
                2,
            )
            full_transcript_log.append(
                {
                    "step_number": step.step_number,
                    "actor": "csr",
                    "speaker_label": step.speaker_label or "CSR",
                    "text": turn.get("transcript") or "",
                    "transcript": turn.get("transcript") or "",
                    "audio_url": turn.get("audio_url"),
                    "expected_script": step.script,
                    "matched_keywords": list(turn.get("matched_keywords") or []),
                    "duration_seconds": duration_seconds,
                    "timeline_start_seconds": round(timeline_cursor, 2),
                    "timeline_end_seconds": round(timeline_cursor + duration_seconds, 2),
                    "coach_note": existing_entry.get("coach_note"),
                }
            )
        else:
            duration_seconds = round(_estimate_script_duration_seconds(step.script), 2)
            full_transcript_log.append(
                {
                    "step_number": step.step_number,
                    "actor": step.actor,
                    "speaker_label": step.speaker_label or "Member",
                    "text": step.script,
                    "transcript": step.script,
                    "audio_url": step.audio_url,
                    "duration_seconds": duration_seconds,
                    "timeline_start_seconds": round(timeline_cursor, 2),
                    "timeline_end_seconds": round(timeline_cursor + duration_seconds, 2),
                    "coach_note": existing_entry.get("coach_note"),
                }
            )
        timeline_cursor += duration_seconds
    session.transcript_log = full_transcript_log

    _apply_evaluation_to_session(
        session=session,
        transcript=transcript,
        audio_url=session.audio_url or next((item.get("audio_url") for item in _session_turn_logs(session) if item.get("audio_url")), None),
        audio_duration_seconds=total_duration,
        evaluation=evaluation,
        ai_feedback=ai_feedback,
    )
    db.commit()
    db.refresh(session)
    return SimSessionResponse.model_validate(session)


@router.post("/session/{session_id}/submit", response_model=SimSessionResponse)
async def submit_session_audio(
    session_id: str,
    file: UploadFile = File(...),
    audio_duration_seconds: float = Form(...),
    live_transcript: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainee(current_user)
    session = _get_accessible_session(db, current_user, session_id)

    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="Session not in progress")

    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
    variation = (
        db.query(ScenarioVariation)
        .filter(ScenarioVariation.id == session.scenario_variation_id)
        .first()
        if session.scenario_variation_id
        else None
    )
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

    original_name = file.filename or "sim-floor-recording.webm"
    _, extension = os.path.splitext(original_name)
    safe_extension = extension if extension else ".webm"
    storage_filename = (
        f"{current_user.id}/{session.id}_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}{safe_extension}"
    )
    
    # Attempt to upload audio - try Supabase first, then fall back to local storage
    audio_url = None
    supabase = get_supabase_client()
    
    # Try Supabase storage
    if supabase.is_available:
        audio_url = supabase.upload_audio(
            file_data=file_bytes,
            user_id=current_user.id,
            filename=storage_filename,
            content_type=file.content_type or "audio/webm",
        )
        if audio_url:
            logger.info(f"✓ Audio uploaded to Supabase for session {session.id}")
        else:
            logger.warning(f"Supabase upload failed for session {session.id}, attempting local storage")
    
    # Fallback to local storage if Supabase unavailable or failed
    if not audio_url:
        try:
            local_audio_dir = os.path.join(os.getcwd(), "media", "sim-floor-recordings", current_user.id)
            os.makedirs(local_audio_dir, exist_ok=True)
            
            local_filename = f"{session.id}_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}{safe_extension}"
            local_filepath = os.path.join(local_audio_dir, local_filename)
            
            with open(local_filepath, "wb") as f:
                f.write(file_bytes)
            
            # Generate local URL path (will be served by backend)
            audio_url = f"/api/sim-floor/recordings/{current_user.id}/{local_filename}"
            logger.info(f"✓ Audio stored locally for session {session.id}: {audio_url}")
        except Exception as e:
            logger.error(f"Failed to store audio locally: {e}")
            audio_url = None  # Continue without audio URL

    # Log audio status
    if audio_url:
        logger.info(f"Session {session.id} audio available at: {audio_url}")
    else:
        logger.warning(f"Session {session.id} has no audio URL - storage may have failed")

    reference_text = variation.script if variation and variation.script else None
    assessment = assess_audio_submission(
        audio_bytes=file_bytes,
        filename=original_name,
        mime_type=file.content_type or "audio/webm",
        scenario=scenario,
        reference_text=reference_text,
        fallback_transcript=(live_transcript or None),
        response_duration=float(audio_duration_seconds),
        user_dialect=current_user.language_dialect,
    )

    transcript = (
        assessment.get("transcription")
        or assessment.get("text")
        or live_transcript
        or ""
    ).strip()
    kpi_config = _get_effective_kpi_config(db, session.batch_id)
    duration_seconds = int(round(audio_duration_seconds))
    fallback_message = None

    if assessment.get("status") != "completed":
        fallback_message = assessment.get("error") or "No recognizable speech was detected."
        evaluation = _evaluate_submission(
            transcript=transcript,
            audio_duration_seconds=duration_seconds,
            kpi_config=kpi_config,
            overrides={
                "speech_to_text_accuracy": 0.0,
                "rate_of_speech": 0.0,
                "dead_air_seconds": float(duration_seconds),
                "grammar_score": 0.0,
                "pronunciation_score": 0.0,
                "pacing_score": 0.0,
                "transcript_confidence": float(assessment.get("transcription_confidence") or 0.0),
            },
        )
        evaluation["weighted_score"] = 0.0
        evaluation["pass_fail"] = False
    else:
        evaluation = _evaluate_submission(
            transcript=transcript,
            audio_duration_seconds=duration_seconds,
            kpi_config=kpi_config,
            assessment=assessment,
        )

    evaluation["keyword_compliance"] = _build_keyword_compliance_summary(
        transcript,
        _build_scenario_steps(scenario),
    )
    evaluation["sentiment_score"] = _analyze_sentiment_score(transcript)
    ai_feedback = _build_ai_feedback(
        evaluation=evaluation,
        kpi_config=kpi_config,
        assessment=assessment if assessment.get("status") == "completed" else None,
        fallback_message=fallback_message if assessment.get("status") != "completed" else None,
    )

    _apply_evaluation_to_session(
        session=session,
        transcript=transcript,
        audio_url=audio_url,
        audio_duration_seconds=duration_seconds,
        evaluation=evaluation,
        ai_feedback=ai_feedback,
    )

    db.commit()
    db.refresh(session)
    return SimSessionResponse.model_validate(session)


@router.post("/session/{session_id}/complete", response_model=SimSessionResponse)
async def complete_session(
    session_id: str,
    payload: SimSessionCompleteRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainee(current_user)
    session = _get_accessible_session(db, current_user, session_id)

    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="Session not in progress")

    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()
    kpi_config = _get_effective_kpi_config(db, session.batch_id)
    evaluation = _evaluate_submission(
        transcript=payload.transcript,
        audio_duration_seconds=payload.audio_duration_seconds,
        kpi_config=kpi_config,
        overrides={
            "speech_to_text_accuracy": payload.speech_to_text_accuracy,
            "rate_of_speech": payload.rate_of_speech,
            "dead_air_seconds": payload.dead_air_seconds,
            "grammar_score": payload.grammar_score,
            "pronunciation_score": payload.pronunciation_score,
            "pacing_score": payload.pacing_score,
            "detected_forbidden_words": payload.detected_forbidden_words,
        },
    )
    if scenario:
        evaluation["keyword_compliance"] = _build_keyword_compliance_summary(
            payload.transcript,
            _build_scenario_steps(scenario),
        )
    evaluation["sentiment_score"] = _analyze_sentiment_score(payload.transcript)
    ai_feedback = payload.ai_feedback or _build_ai_feedback(
        evaluation=evaluation,
        kpi_config=kpi_config,
    )

    _apply_evaluation_to_session(
        session=session,
        transcript=payload.transcript,
        audio_url=payload.audio_url,
        audio_duration_seconds=payload.audio_duration_seconds,
        evaluation=evaluation,
        ai_feedback=ai_feedback,
    )
    session.transcript_log = payload.transcript_log or session.transcript_log
    session.turn_logs = payload.turn_logs or session.turn_logs
    db.commit()
    db.refresh(session)
    return SimSessionResponse.model_validate(session)


@router.post("/session/{session_id}/retake", response_model=SimSessionResponse)
async def retake_session(
    session_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainee(current_user)
    session = _get_accessible_session(db, current_user, session_id)

    if session.pass_fail:
        raise HTTPException(status_code=400, detail="Passed sessions do not require retakes")
    if session.attempt_number >= session.max_attempts:
        raise HTTPException(status_code=400, detail="Maximum attempts reached")

    variation = (
        db.query(ScenarioVariation)
        .filter(
            ScenarioVariation.scenario_id == session.scenario_id,
            ScenarioVariation.is_active == True,
        )
        .order_by(func.random())
        .first()
    )

    new_session = SimSession(
        id=str(uuid.uuid4()),
        trainee_id=current_user.id,
        scenario_id=session.scenario_id,
        scenario_variation_id=variation.id if variation else None,
        batch_id=session.batch_id,
        status="in_progress",
        current_step=1,
        started_at=datetime.utcnow(),
        aht_target=session.aht_target,
        attempt_number=session.attempt_number + 1,
        max_attempts=session.max_attempts,
        pass_fail=False,
        transcript_log=[],
        turn_logs=[],
        trainer_verdict_status="pending",
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return SimSessionResponse.model_validate(new_session)


@router.get("/session/{session_id}/can-retake")
async def check_retake_status(
    session_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    session = _get_accessible_session(db, current_user, session_id)
    return {
        "can_retake": not session.pass_fail and session.attempt_number < session.max_attempts,
        "attempt_number": session.attempt_number,
        "max_attempts": session.max_attempts,
        "passed": session.pass_fail,
    }


# ==================== Coaching ====================


@router.get("/coaching/interactions")
async def get_interaction_history(
    batch_id: Optional[str] = Query(None),
    trainee_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    trainer_batch_ids = set(_get_trainer_batch_ids(db, current_user))
    query = db.query(SimSession).filter(SimSession.status.in_(["completed", "failed"]))

    if current_user.role != UserRole.ADMIN:
        if not trainer_batch_ids:
            return {"sessions": []}
        query = query.filter(SimSession.batch_id.in_(trainer_batch_ids))

    if batch_id:
        if current_user.role != UserRole.ADMIN and batch_id not in trainer_batch_ids:
            raise HTTPException(status_code=403, detail="Access denied")
        query = query.filter(SimSession.batch_id == batch_id)

    if trainee_id:
        query = query.filter(SimSession.trainee_id == trainee_id)

    sessions = (
        query.order_by(SimSession.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    scenario_map = {
        scenario.id: scenario
        for scenario in db.query(Scenario)
        .filter(Scenario.id.in_([session.scenario_id for session in sessions] or ["__none__"]))
        .all()
    }
    trainee_map = {
        user.id: user
        for user in db.query(User)
        .filter(User.id.in_([session.trainee_id for session in sessions] or ["__none__"]))
        .all()
    }
    latest_coaching_logs = _get_latest_sim_session_coaching_logs(
        db,
        [session.id for session in sessions],
    )

    payload = []
    for session in sessions:
        scenario = scenario_map.get(session.scenario_id)
        trainee = trainee_map.get(session.trainee_id)
        coaching_log = latest_coaching_logs.get(session.id)
        payload.append(
            {
                "id": session.id,
                "trainee_id": session.trainee_id,
                "trainee_name": trainee.full_name if trainee else "Unknown",
                "scenario_title": scenario.title if scenario else "Unknown",
                "score": session.weighted_score or 0.0,
                "pass_fail": session.pass_fail,
                "attempt_number": session.attempt_number,
                "audio_url": session.audio_url,
                "transcript": session.transcript,
                "transcript_log": session.transcript_log or [],
                "turn_logs": session.turn_logs or [],
                "ai_feedback": session.ai_feedback,
                "coaching_notes": session.coaching_notes,
                "grammar_score": session.grammar_score,
                "pronunciation_score": session.pronunciation_score,
                "pacing_score": session.pacing_score,
                "sentiment_score": session.sentiment_score,
                "keyword_compliance": session.keyword_compliance or {},
                "speech_to_text_accuracy": session.speech_to_text_accuracy,
                "rate_of_speech": session.rate_of_speech,
                "dead_air_seconds": session.dead_air_seconds,
                "forbidden_words_count": session.forbidden_words_count,
                "trainer_verdict_status": session.trainer_verdict_status or "pending",
                "trainer_verdict_notes": session.trainer_verdict_notes,
                "trainer_evaluated_at": session.trainer_evaluated_at.isoformat() if session.trainer_evaluated_at else None,
                "certificate_id": session.certificate_id,
                "coaching_id": coaching_log.coaching_id if coaching_log else None,
                "coaching_status": coaching_log.status if coaching_log else None,
                "coaching_acknowledged_at": coaching_log.acknowledged_at.isoformat() if coaching_log and coaching_log.acknowledged_at else None,
                "created_at": session.created_at.isoformat() if session.created_at else None,
            }
        )

    return {"sessions": payload}


@router.put("/coaching/interactions/{session_id}/notes", response_model=SimSessionResponse)
async def update_coaching_notes(
    session_id: str,
    note_update: SimSessionCoachingNoteUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    session = _get_accessible_session(db, current_user, session_id)
    session.coaching_notes = note_update.notes.strip()
    _upsert_sim_session_coaching_log(
        db,
        session=session,
        trainer_id=current_user.id,
        notes=session.coaching_notes,
        verdict_status=session.trainer_verdict_status or "pending",
    )
    db.commit()
    db.refresh(session)
    return SimSessionResponse.model_validate(session)


@router.put("/coaching/interactions/{session_id}/verdict", response_model=SimSessionResponse)
async def update_trainer_verdict(
    session_id: str,
    verdict_update: SimSessionTrainerVerdictUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    session = _get_accessible_session(db, current_user, session_id)
    scenario = db.query(Scenario).filter(Scenario.id == session.scenario_id).first()

    normalized_status = (verdict_update.verdict_status or "").strip().lower()
    if normalized_status in {"not_competent", "not-competent", "retake_required"}:
        normalized_status = "retake"
    if normalized_status not in {"pending", "competent", "retake"}:
        raise HTTPException(status_code=400, detail="Invalid verdict status")

    session.trainer_verdict_status = normalized_status
    session.trainer_verdict_notes = (verdict_update.notes or "").strip() or None
    if session.trainer_verdict_notes:
        session.coaching_notes = session.trainer_verdict_notes
    session.trainer_evaluated_by = current_user.id
    session.trainer_evaluated_at = datetime.utcnow()

    existing_certificate = (
        db.query(CertificateRecord)
        .filter(
            CertificateRecord.source_type == "sim_floor_session",
            CertificateRecord.source_id == session.id,
        )
        .first()
    )

    if normalized_status == "competent":
        certificate, _ = award_certificate(
            db,
            trainee_id=session.trainee_id,
            issuer_id=current_user.id,
            source_type="sim_floor_session",
            source_id=session.id,
            achievement_title=scenario.title if scenario else "Sim Floor Scenario",
            achievement_type="competency",
            remarks=session.trainer_verdict_notes,
            score=float(session.weighted_score or 0.0),
            issued_at=session.trainer_evaluated_at,
        )
        session.certificate_id = certificate.id
    else:
        session.certificate_id = None
        if existing_certificate:
            db.delete(existing_certificate)

    _upsert_sim_session_coaching_log(
        db,
        session=session,
        trainer_id=current_user.id,
        notes=session.trainer_verdict_notes or session.coaching_notes,
        verdict_status=normalized_status,
    )

    db.commit()
    db.refresh(session)
    return SimSessionResponse.model_validate(session)


# ==================== Analytics ====================


@router.get("/analytics/live")
async def get_live_analytics(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)

    trainer_batch_ids = _get_trainer_batch_ids(db, current_user)
    active_query = db.query(SimSession).filter(SimSession.status == "in_progress")
    complete_query = db.query(SimSession).filter(SimSession.status.in_(["completed", "failed"]))
    if current_user.role != UserRole.ADMIN:
        if not trainer_batch_ids:
            return {
                "active_simulations": 0,
                "completed_today": 0,
                "pass_rate": 0.0,
                "total_passed": 0,
                "total_failed": 0,
                "pass_fail_by_batch": [],
                "top_failed_kpis": {},
                "coaching_summary": _summarize_sim_session_coaching({}),
            }
        active_query = active_query.filter(SimSession.batch_id.in_(trainer_batch_ids))
        complete_query = complete_query.filter(SimSession.batch_id.in_(trainer_batch_ids))

    active_count = active_query.count()

    today = datetime.utcnow().date()
    completed_today = (
        complete_query.filter(func.date(SimSession.created_at) == today).count()
    )

    completed_sessions = complete_query.all()
    latest_coaching_logs = _get_latest_sim_session_coaching_logs(
        db,
        [session.id for session in completed_sessions],
    )
    total_passed = sum(1 for session in completed_sessions if session.pass_fail)
    total_failed = sum(1 for session in completed_sessions if not session.pass_fail)
    total_sessions = total_passed + total_failed
    pass_rate = round((total_passed / total_sessions) * 100.0, 1) if total_sessions else 0.0

    batch_map = {
        batch.id: batch
        for batch in db.query(Batch)
        .filter(Batch.id.in_(list({session.batch_id for session in completed_sessions if session.batch_id}) or ["__none__"]))
        .all()
    }
    grouped_by_batch: dict[str, list[SimSession]] = defaultdict(list)
    for session in completed_sessions:
        if session.batch_id:
            grouped_by_batch[session.batch_id].append(session)

    pass_fail_by_batch = []
    for batch_id_value, sessions in grouped_by_batch.items():
        passed = sum(1 for session in sessions if session.pass_fail)
        failed = len(sessions) - passed
        batch = batch_map.get(batch_id_value)
        pass_fail_by_batch.append(
            {
                "batch_id": batch_id_value,
                "batch_name": batch.name if batch else "Unknown Batch",
                "passed": passed,
                "failed": failed,
                "pass_rate": round((passed / len(sessions)) * 100.0, 1) if sessions else 0.0,
            }
        )

    live_failed_kpis = _failed_kpi_counts(completed_sessions)

    return {
        "active_simulations": active_count,
        "completed_today": completed_today,
        "pass_rate": pass_rate,
        "total_passed": total_passed,
        "total_failed": total_failed,
        "pass_fail_by_batch": sorted(
            pass_fail_by_batch,
            key=lambda item: item["batch_name"].lower(),
        ),
        "top_failed_kpis": live_failed_kpis,
        "coaching_summary": _summarize_sim_session_coaching(latest_coaching_logs),
    }


@router.get("/analytics/batch/{batch_id}")
async def get_batch_analytics(
    batch_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    batch = _get_accessible_batch(db, current_user, batch_id)

    sessions = (
        db.query(SimSession)
        .filter(
            SimSession.batch_id == batch_id,
            SimSession.status.in_(["completed", "failed"]),
        )
        .order_by(SimSession.created_at.asc())
        .all()
    )

    if not sessions:
        return {
            "batch_id": batch_id,
            "batch_name": batch.name,
            "total_sessions": 0,
            "avg_score": 0.0,
            "pass_rate": 0.0,
            "retakes": 0,
            "total_attempts": 0,
            "top_failed_kpis": {},
            "score_trends": [],
            "ai_feedback_trends": [],
            "attempts_by_trainee": [],
            "coaching_summary": _summarize_sim_session_coaching({}),
        }

    kpi_config = _get_effective_kpi_config(db, batch_id)
    latest_coaching_logs = _get_latest_sim_session_coaching_logs(
        db,
        [session.id for session in sessions],
    )
    total_sessions = len(sessions)
    total_attempts = sum(session.attempt_number or 1 for session in sessions)
    retakes = sum(max((session.attempt_number or 1) - 1, 0) for session in sessions)
    passed = sum(1 for session in sessions if session.pass_fail)
    avg_score = round(
        sum(float(session.weighted_score or 0.0) for session in sessions) / total_sessions,
        1,
    )
    pass_rate = round((passed / total_sessions) * 100.0, 1)

    score_trend_groups: dict[str, list[SimSession]] = defaultdict(list)
    for session in sessions:
        label = session.completed_at.strftime("%b %d") if session.completed_at else session.created_at.strftime("%b %d")
        score_trend_groups[label].append(session)

    score_trends = []
    ai_feedback_trends = []
    for label, grouped_sessions in score_trend_groups.items():
        score_trends.append(
            {
                "date": label,
                "avg_score": round(
                    sum(float(session.weighted_score or 0.0) for session in grouped_sessions)
                    / len(grouped_sessions),
                    1,
                ),
                "sessions": len(grouped_sessions),
            }
        )
        ai_feedback_trends.append(
            {
                "date": label,
                "grammar": round(
                    sum(float(session.grammar_score or 0.0) for session in grouped_sessions)
                    / len(grouped_sessions),
                    1,
                ),
                "pronunciation": round(
                    sum(float(session.pronunciation_score or 0.0) for session in grouped_sessions)
                    / len(grouped_sessions),
                    1,
                ),
                "pacing": round(
                    sum(float(session.pacing_score or 0.0) for session in grouped_sessions)
                    / len(grouped_sessions),
                    1,
                ),
            }
        )

    trainee_map = {
        user.id: user
        for user in db.query(User)
        .filter(User.id.in_([session.trainee_id for session in sessions] or ["__none__"]))
        .all()
    }
    attempts_by_trainee_groups: dict[str, list[SimSession]] = defaultdict(list)
    for session in sessions:
        attempts_by_trainee_groups[session.trainee_id].append(session)

    attempts_by_trainee = []
    for trainee_id, grouped_sessions in attempts_by_trainee_groups.items():
        trainee = trainee_map.get(trainee_id)
        latest_session = grouped_sessions[-1]
        attempts_by_trainee.append(
            {
                "trainee_id": trainee_id,
                "trainee_name": trainee.full_name if trainee else "Unknown",
                "total_sessions": len(grouped_sessions),
                "total_attempts": sum(session.attempt_number or 1 for session in grouped_sessions),
                "avg_score": round(
                    sum(float(session.weighted_score or 0.0) for session in grouped_sessions)
                    / len(grouped_sessions),
                    1,
                ),
                "latest_score": round(float(latest_session.weighted_score or 0.0), 1),
                "latest_pass_fail": bool(latest_session.pass_fail),
            }
        )

    return {
        "batch_id": batch_id,
        "batch_name": batch.name,
        "total_sessions": total_sessions,
        "avg_score": avg_score,
        "pass_rate": pass_rate,
        "retakes": retakes,
        "total_attempts": total_attempts,
        "top_failed_kpis": _failed_kpi_counts(sessions, batch_kpi_config=kpi_config),
        "score_trends": score_trends,
        "ai_feedback_trends": ai_feedback_trends,
        "coaching_summary": _summarize_sim_session_coaching(latest_coaching_logs),
        "attempts_by_trainee": sorted(
            attempts_by_trainee,
            key=lambda item: item["trainee_name"].lower(),
        ),
    }


# ==================== Reporting ====================


@router.get("/reports/batch/{batch_id}")
async def get_batch_report(
    batch_id: str,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    _require_trainer(current_user)
    batch = _get_accessible_batch(db, current_user, batch_id)
    start_date, end_date, period_label = _resolve_report_period(month=month, year=year)

    trainees = [user for user in batch.users if user.role == UserRole.TRAINEE]
    trainee_ids = [user.id for user in trainees]
    did_prune_certificates = False
    for trainee_id in trainee_ids:
        sync_trainee_completion_certificates(db, trainee_id)
        did_prune_certificates = (
            prune_trainee_activity_certificates(db, trainee_id) > 0
            or did_prune_certificates
        )
    if did_prune_certificates:
        db.commit()

    session_query = db.query(SimSession).filter(
        SimSession.batch_id == batch_id,
        SimSession.status.in_(["completed", "failed"]),
    )
    if start_date and end_date:
        session_query = session_query.filter(
            SimSession.created_at >= start_date,
            SimSession.created_at <= end_date,
        )
    sessions = session_query.order_by(SimSession.created_at.desc()).all()

    mappings = (
        db.query(BatchScenarioMapping)
        .filter(
            BatchScenarioMapping.batch_id == batch_id,
            BatchScenarioMapping.is_active == True,
        )
        .order_by(BatchScenarioMapping.assigned_at.desc())
        .all()
    )
    scenario_ids = [mapping.scenario_id for mapping in mappings]
    scenarios = {
        scenario.id: scenario
        for scenario in db.query(Scenario).filter(Scenario.id.in_(scenario_ids or ["__none__"])).all()
    }
    variations_by_scenario: dict[str, list[ScenarioVariation]] = defaultdict(list)
    for variation in (
        db.query(ScenarioVariation)
        .filter(
            ScenarioVariation.scenario_id.in_(scenario_ids or ["__none__"]),
            ScenarioVariation.is_active == True,
        )
        .order_by(ScenarioVariation.created_at.asc())
        .all()
    ):
        variations_by_scenario[variation.scenario_id].append(variation)

    sessions_by_scenario: dict[str, list[SimSession]] = defaultdict(list)
    sessions_by_trainee: dict[str, list[SimSession]] = defaultdict(list)
    for session in sessions:
        sessions_by_scenario[session.scenario_id].append(session)
        sessions_by_trainee[session.trainee_id].append(session)

    scenario_performance = []
    for mapping in mappings:
        scenario = scenarios.get(mapping.scenario_id)
        if not scenario:
            continue
        scenario_sessions = sessions_by_scenario.get(scenario.id, [])
        completed_sessions = len(scenario_sessions)
        passed_sessions = sum(1 for session in scenario_sessions if session.pass_fail)
        unique_takers = len({session.trainee_id for session in scenario_sessions})
        variations = variations_by_scenario.get(scenario.id, [])
        scenario_performance.append(
            {
                "scenario_id": scenario.id,
                "title": scenario.title,
                "members_assigned": len(trainee_ids),
                "unique_takers": unique_takers,
                "csr_response_count": len(variations),
                "variation_scores": [
                    {
                        "actor_name": variation.actor_name,
                        "score": variation.score,
                    }
                    for variation in variations
                ],
                "completed_sessions": completed_sessions,
                "passed_sessions": passed_sessions,
                "average_score": round(
                    sum(float(session.weighted_score or 0.0) for session in scenario_sessions) / completed_sessions,
                    1,
                )
                if completed_sessions
                else 0.0,
                "pass_rate": round((passed_sessions / completed_sessions) * 100.0, 1)
                if completed_sessions
                else 0.0,
                "latest_attempt_at": max(
                    (
                        session.completed_at or session.created_at
                        for session in scenario_sessions
                        if session.completed_at or session.created_at
                    ),
                    default=None,
                ),
            }
        )

    trainee_performance = []
    for trainee in trainees:
        trainee_sessions = sessions_by_trainee.get(trainee.id, [])
        completed_sessions = len(trainee_sessions)
        passed_sessions = sum(1 for session in trainee_sessions if session.pass_fail)
        trainee_performance.append(
            {
                "trainee_id": trainee.id,
                "trainee_name": trainee.full_name,
                "total_sessions": completed_sessions,
                "retakes": sum(max((session.attempt_number or 1) - 1, 0) for session in trainee_sessions),
                "average_score": round(
                    sum(float(session.weighted_score or 0.0) for session in trainee_sessions) / completed_sessions,
                    1,
                )
                if completed_sessions
                else 0.0,
                "pass_rate": round((passed_sessions / completed_sessions) * 100.0, 1)
                if completed_sessions
                else 0.0,
                "latest_attempt_at": max(
                    (
                        session.completed_at or session.created_at
                        for session in trainee_sessions
                        if session.completed_at or session.created_at
                    ),
                    default=None,
                ),
            }
        )

    total_sessions = len(sessions)
    passed_sessions = sum(1 for session in sessions if session.pass_fail)
    report_kpi_config = _get_effective_kpi_config(db, batch_id)
    latest_coaching_logs = _get_latest_sim_session_coaching_logs(
        db,
        [session.id for session in sessions],
    )

    return {
        "batch_id": batch.id,
        "batch_name": batch.name,
        "wave_number": batch.wave_number,
        "period": period_label,
        "summary": {
            "total_trainees": len(trainees),
            "active_scenarios": len(scenario_performance),
            "total_sessions": total_sessions,
            "average_score": round(
                sum(float(session.weighted_score or 0.0) for session in sessions) / total_sessions,
                1,
            )
            if total_sessions
            else 0.0,
            "pass_rate": round((passed_sessions / total_sessions) * 100.0, 1)
            if total_sessions
            else 0.0,
            "retakes": sum(max((session.attempt_number or 1) - 1, 0) for session in sessions),
            "passing_score": float(report_kpi_config.passing_score or DEFAULT_PASSING_SCORE),
        },
        "kpi_scores": {
            "speech_to_text_accuracy": _average(
                [float(session.speech_to_text_accuracy) for session in sessions if session.speech_to_text_accuracy is not None]
            ),
            "grammar": _average(
                [float(session.grammar_score) for session in sessions if session.grammar_score is not None]
            ),
            "pronunciation": _average(
                [float(session.pronunciation_score) for session in sessions if session.pronunciation_score is not None]
            ),
            "pacing": _average(
                [float(session.pacing_score) for session in sessions if session.pacing_score is not None]
            ),
            "rate_of_speech": _average(
                [float(session.rate_of_speech) for session in sessions if session.rate_of_speech is not None]
            ),
            "dead_air": _average(
                [float(session.dead_air_seconds) for session in sessions if session.dead_air_seconds is not None]
            ),
        },
        "top_failed_kpis": _failed_kpi_counts(sessions, batch_kpi_config=report_kpi_config),
        "coaching_summary": _summarize_sim_session_coaching(latest_coaching_logs),
        "scenario_performance": sorted(
            scenario_performance,
            key=lambda item: (item["completed_sessions"], item["title"].lower()),
            reverse=True,
        ),
        "trainee_performance": sorted(
            trainee_performance,
            key=lambda item: (item["average_score"], item["trainee_name"].lower()),
            reverse=True,
        ),
    }


@router.get("/reports/trainee/{trainee_id}")
async def get_trainee_report(
    trainee_id: str,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    current_user = await auth_utils.get_current_user(authorization, db)
    if current_user.role == UserRole.TRAINEE and current_user.id != trainee_id:
        raise HTTPException(status_code=403, detail="Access denied")

    trainee = db.query(User).filter(User.id == trainee_id, User.role == UserRole.TRAINEE).first()
    if not trainee:
        raise HTTPException(status_code=404, detail="Trainee not found")

    if current_user.role == UserRole.TRAINER:
        trainer_batch_ids = set(_get_trainer_batch_ids(db, current_user))
        trainee_batch_ids = {batch.id for batch in trainee.batches}
        if not trainer_batch_ids.intersection(trainee_batch_ids):
            raise HTTPException(status_code=403, detail="Access denied")

    sync_trainee_completion_certificates(db, trainee_id)
    if prune_trainee_activity_certificates(db, trainee_id):
        db.commit()

    start_date, end_date, period_label = _resolve_report_period(month=month, year=year)
    query = db.query(SimSession).filter(
        SimSession.trainee_id == trainee_id,
        SimSession.status.in_(["completed", "failed"]),
    )
    if start_date and end_date:
        query = query.filter(
            SimSession.created_at >= start_date,
            SimSession.created_at <= end_date,
        )
    sessions = query.order_by(SimSession.created_at.desc()).all()

    scenario_ids = [session.scenario_id for session in sessions if session.scenario_id]
    scenario_titles = {
        scenario.id: scenario.title
        for scenario in db.query(Scenario).filter(Scenario.id.in_(scenario_ids or ["__none__"])).all()
    }

    sessions_by_scenario: dict[str, list[SimSession]] = defaultdict(list)
    for session in sessions:
        sessions_by_scenario[session.scenario_id].append(session)

    scenario_performance = []
    for scenario_id, scenario_sessions in sessions_by_scenario.items():
        completed_sessions = len(scenario_sessions)
        passed_sessions = sum(1 for session in scenario_sessions if session.pass_fail)
        scenario_performance.append(
            {
                "scenario_id": scenario_id,
                "title": scenario_titles.get(scenario_id, "Unknown Scenario"),
                "attempts": completed_sessions,
                "average_score": round(
                    sum(float(session.weighted_score or 0.0) for session in scenario_sessions) / completed_sessions,
                    1,
                )
                if completed_sessions
                else 0.0,
                "best_score": round(
                    max(float(session.weighted_score or 0.0) for session in scenario_sessions),
                    1,
                )
                if completed_sessions
                else 0.0,
                "pass_rate": round((passed_sessions / completed_sessions) * 100.0, 1)
                if completed_sessions
                else 0.0,
                "latest_attempt_at": max(
                    (
                        session.completed_at or session.created_at
                        for session in scenario_sessions
                        if session.completed_at or session.created_at
                    ),
                    default=None,
                ),
            }
        )

    total_sessions = len(sessions)
    passed_sessions = sum(1 for session in sessions if session.pass_fail)
    batch_id = sessions[0].batch_id if sessions else next((batch.id for batch in trainee.batches), None)
    report_kpi_config = _get_effective_kpi_config(db, batch_id)
    latest_coaching_logs = _get_latest_sim_session_coaching_logs(
        db,
        [session.id for session in sessions],
    )
    sim_floor_certificates = (
        db.query(CertificateRecord)
        .filter(
            CertificateRecord.trainee_id == trainee_id,
            CertificateRecord.source_type == "sim_floor_session",
        )
        .order_by(CertificateRecord.issued_at.desc())
        .all()
    )

    return {
        "trainee_id": trainee.id,
        "trainee_name": trainee.full_name,
        "period": period_label,
        "summary": {
            "total_sessions": total_sessions,
            "average_score": round(
                sum(float(session.weighted_score or 0.0) for session in sessions) / total_sessions,
                1,
            )
            if total_sessions
            else 0.0,
            "pass_rate": round((passed_sessions / total_sessions) * 100.0, 1)
            if total_sessions
            else 0.0,
            "retakes": sum(max((session.attempt_number or 1) - 1, 0) for session in sessions),
            "latest_score": round(float(sessions[0].weighted_score or 0.0), 1) if sessions else 0.0,
            "passing_score": float(report_kpi_config.passing_score or DEFAULT_PASSING_SCORE),
            "assigned_batches": [
                {
                    "batch_id": batch.id,
                    "batch_name": batch.name,
                    "wave_number": batch.wave_number,
                }
                for batch in trainee.batches
                if current_user.role != UserRole.TRAINER or batch.created_by == current_user.id
            ],
        },
        "kpi_scores": {
            "speech_to_text_accuracy": _average(
                [float(session.speech_to_text_accuracy) for session in sessions if session.speech_to_text_accuracy is not None]
            ),
            "grammar": _average(
                [float(session.grammar_score) for session in sessions if session.grammar_score is not None]
            ),
            "pronunciation": _average(
                [float(session.pronunciation_score) for session in sessions if session.pronunciation_score is not None]
            ),
            "pacing": _average(
                [float(session.pacing_score) for session in sessions if session.pacing_score is not None]
            ),
            "rate_of_speech": _average(
                [float(session.rate_of_speech) for session in sessions if session.rate_of_speech is not None]
            ),
            "dead_air": _average(
                [float(session.dead_air_seconds) for session in sessions if session.dead_air_seconds is not None]
            ),
        },
        "top_failed_kpis": _failed_kpi_counts(sessions, batch_kpi_config=report_kpi_config),
        "coaching_summary": _summarize_sim_session_coaching(latest_coaching_logs),
        "scenario_performance": sorted(
            scenario_performance,
            key=lambda item: (item["average_score"], item["title"].lower()),
            reverse=True,
        ),
        "recent_sessions": [
            {
                "session_id": session.id,
                "scenario_title": scenario_titles.get(session.scenario_id, "Unknown Scenario"),
                "score": float(session.weighted_score or 0.0),
                "status": "Passed" if session.pass_fail else "Retake Required",
                "attempt_number": session.attempt_number,
                "created_at": session.created_at.isoformat() if session.created_at else None,
                "audio_url": session.audio_url,
                "trainer_verdict_status": session.trainer_verdict_status or "pending",
                "certificate_id": session.certificate_id,
                "coaching_id": latest_coaching_logs.get(session.id).coaching_id if latest_coaching_logs.get(session.id) else None,
                "coaching_status": latest_coaching_logs.get(session.id).status if latest_coaching_logs.get(session.id) else None,
                "coaching_acknowledged_at": latest_coaching_logs.get(session.id).acknowledged_at.isoformat() if latest_coaching_logs.get(session.id) and latest_coaching_logs.get(session.id).acknowledged_at else None,
            }
            for session in sessions[:10]
        ],
        "coaching_logs": [
            {
                "id": log.id,
                "coaching_id": log.coaching_id,
                "sim_session_id": log.sim_session_id,
                "status": log.status,
                "competency_status": normalize_competency_status(log.competency_status),
                "trainer_remarks": log.trainer_remarks,
                "acknowledged_at": log.acknowledged_at.isoformat() if log.acknowledged_at else None,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in latest_coaching_logs.values()
        ],
        "certificates": [
            {
                "certificate_id": certificate.id,
                "certificate_no": certificate.certificate_no,
                "scenario_session_id": certificate.source_id,
                "issued_at": certificate.issued_at.isoformat() if certificate.issued_at else None,
            }
            for certificate in sim_floor_certificates
        ],
    }
