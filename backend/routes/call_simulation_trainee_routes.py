"""
Call Simulation API Routes
Handles trainee call simulation sessions with AI member interactions,
Gemini-powered evaluation, and certificate generation.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import User, UserRole
from ..services.gemini_evaluation import generate_evaluation_feedback
from ..services.tts_service import text_to_speech
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/api/call-simulation", tags=["call-simulation"])
logger = logging.getLogger(__name__)


# ==================== Pydantic Schemas ====================


class ScriptFlowStep(BaseModel):
    """A single step in the call scenario script flow"""
    step_id: str
    suggested_csr_script: str
    member_response_text: str
    point_value: float = 0
    expected_keywords: Optional[list[str]] = None
    member_audio_url: Optional[str] = None
    csr_step_number: Optional[int] = None
    member_step_number: Optional[int] = None


class CallScenarioCreate(BaseModel):
    """Schema for creating a call scenario (Trainer)"""
    topic: str
    title: Optional[str] = None
    description: Optional[str] = None
    target_kpis: dict[str, Any] = Field(default_factory=dict)
    script_flow: list[ScriptFlowStep]
    ringer_audio_url: Optional[str] = None
    hold_audio_url: Optional[str] = None
    difficulty: str = "intermediate"
    estimated_duration_seconds: int = 300
    passing_score: float = 80.0
    is_published: bool = False
    is_active: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class CallScenarioResponse(BaseModel):
    """Response schema for a call scenario"""
    id: str
    trainer_id: str
    topic: str
    title: Optional[str]
    description: Optional[str]
    target_kpis: dict[str, Any]
    script_flow: list[dict[str, Any]]
    ringer_audio_url: Optional[str]
    hold_audio_url: Optional[str]
    difficulty: str
    estimated_duration_seconds: int
    passing_score: float
    is_published: bool
    is_active: bool
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class CallSimulationStartRequest(BaseModel):
    """Request to start a call simulation session"""
    call_scenario_id: str


class CallSimulationTurnRequest(BaseModel):
    """Request to record a turn in the call simulation"""
    session_id: str
    step_index: int
    step_id: str
    speaker: str  # 'csr' or 'member'
    suggested_csr_script: Optional[str] = None
    trainee_transcript: Optional[str] = None
    member_response: Optional[str] = None
    turn_duration_seconds: int = 0


class CallSimulationHoldRequest(BaseModel):
    """Request to hold/resume the call"""
    session_id: str
    action: str  # 'hold' or 'resume'


class CallSimulationCompleteRequest(BaseModel):
    """Request to complete a call simulation and get AI evaluation"""
    session_id: str


class CallSimulationSessionResponse(BaseModel):
    """Response for a call simulation session"""
    id: str
    trainee_id: str
    call_scenario_id: str
    status: str
    current_step_index: int
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    total_duration_seconds: int
    transcript_log: list[dict[str, Any]]
    full_transcript: Optional[str]
    total_score: float
    script_accuracy_score: float
    grammar_score: float
    pronunciation_score: float
    soft_skills_score: float
    pacing_score: float
    ai_evaluation: Optional[dict[str, Any]]
    ai_feedback: Optional[str]
    passed: bool
    certificate_id: Optional[str]


class EvaluationPromptData(BaseModel):
    """Data to send to Gemini for evaluation"""
    transcript: str
    script_flow: list[dict[str, Any]]
    target_kpis: dict[str, Any]


# ==================== Helper Functions ====================


def _require_trainer(current_user: User) -> None:
    """Ensure user has trainer or admin role"""
    if current_user.role not in [UserRole.ADMIN, UserRole.TRAINER]:
        raise HTTPException(status_code=403, detail="Trainer access required")


def _require_trainee(current_user: User) -> None:
    """Ensure user has trainee role"""
    if current_user.role != UserRole.TRAINEE:
        raise HTTPException(status_code=403, detail="Trainee access required")


def _build_transcript_from_turns(turns: list[dict]) -> str:
    """Build a readable transcript from turn data"""
    lines = []
    for turn in turns:
        speaker = "CSR (Trainee)" if turn.get("speaker") == "csr" else "Member (AI)"
        if turn.get("speaker") == "csr":
            text = turn.get("trainee_transcript", "")
        else:
            text = turn.get("member_response", "")
        lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def _calculate_step_score(turn: dict, script_flow: list[dict]) -> float:
    """Calculate score for a single step based on keyword matching"""
    if not turn.get("trainee_transcript") or turn.get("speaker") != "csr":
        return 0
    
    # Find the corresponding script flow step
    step_id = turn.get("step_id")
    target_step = next((s for s in script_flow if s.get("step_id") == step_id), None)
    if not target_step:
        return 0
    
    # Check expected keywords
    expected_keywords = target_step.get("expected_keywords", [])
    if not expected_keywords:
        return target_step.get("point_value", 0)
    
    transcript = turn.get("trainee_transcript", "").lower()
    matched = sum(1 for kw in expected_keywords if kw.lower() in transcript)
    match_ratio = matched / len(expected_keywords) if expected_keywords else 0
    
    return target_step.get("point_value", 0) * match_ratio


# ==================== Trainee Routes ====================


@router.get("/scenarios", response_model=list[CallScenarioResponse])
async def get_available_scenarios(
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get all published call scenarios available for trainees.
    """
    _require_trainee(current_user)
    
    supabase = get_supabase_client()
    response = supabase.table("call_scenarios").select("*").eq("is_published", True).eq("is_active", True).execute()
    
    return response.data or []


@router.get("/scenarios/{scenario_id}", response_model=CallScenarioResponse)
async def get_scenario(
    scenario_id: str,
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get a specific call scenario by ID.
    """
    _require_trainee(current_user)
    
    supabase = get_supabase_client()
    response = supabase.table("call_scenarios").select("*").eq("id", scenario_id).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    return response.data[0]


@router.post("/sessions/start")
async def start_call_simulation(
    request: CallSimulationStartRequest,
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Start a new call simulation session for a trainee.
    """
    _require_trainee(current_user)
    
    supabase = get_supabase_client()
    
    # Verify scenario exists and is published
    scenario_response = supabase.table("call_scenarios").select("*").eq("id", request.call_scenario_id).execute()
    if not scenario_response.data:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    scenario = scenario_response.data[0]
    
    # Create new session
    session_data = {
        "trainee_id": str(current_user.id),
        "call_scenario_id": request.call_scenario_id,
        "status": "ringing",
        "current_step_index": 0,
        "started_at": datetime.utcnow().isoformat(),
        "transcript_log": [],
        "total_score": 0,
    }
    
    session_response = supabase.table("call_simulation_sessions").insert(session_data).execute()
    
    if not session_response.data:
        raise HTTPException(status_code=500, detail="Failed to create session")
    
    session = session_response.data[0]
    
    return {
        "session_id": session["id"],
        "scenario": {
            "id": scenario["id"],
            "topic": scenario["topic"],
            "description": scenario.get("description"),
            "script_flow": scenario["script_flow"],
            "target_kpis": scenario.get("target_kpis", {}),
            "ringer_audio_url": scenario.get("ringer_audio_url"),
            "hold_audio_url": scenario.get("hold_audio_url"),
            "passing_score": scenario.get("passing_score", 80),
        },
        "status": "ringing",
        "current_step_index": 0,
    }


@router.post("/sessions/turn")
async def record_turn(
    request: CallSimulationTurnRequest,
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Record a turn in the call simulation (trainee speaks or AI member responds).
    """
    _require_trainee(current_user)
    
    supabase = get_supabase_client()
    
    # Get session and verify ownership
    session_response = supabase.table("call_simulation_sessions").select("*").eq("id", request.session_id).execute()
    if not session_response.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_response.data[0]
    if session["trainee_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to access this session")
    
    # Get scenario for script flow
    scenario_response = supabase.table("call_scenarios").select("script_flow").eq("id", session["call_scenario_id"]).execute()
    if not scenario_response.data:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    script_flow = scenario_response.data[0].get("script_flow", [])
    
    # Calculate step score if trainee spoke
    step_score = 0
    if request.speaker == "csr" and request.trainee_transcript:
        step_score = _calculate_step_score(request.dict(), script_flow)
    
    # Create turn record
    turn_data = {
        "session_id": request.session_id,
        "step_index": request.step_index,
        "step_id": request.step_id,
        "speaker": request.speaker,
        "suggested_csr_script": request.suggested_csr_script,
        "trainee_transcript": request.trainee_transcript,
        "member_response": request.member_response,
        "point_value": next((s.get("point_value", 0) for s in script_flow if s.get("step_id") == request.step_id), 0),
        "turn_duration_seconds": request.turn_duration_seconds,
        "step_score": step_score,
    }
    
    turn_response = supabase.table("call_simulation_turns").insert(turn_data).execute()
    
    # Update session transcript log
    transcript_entry = {
        "step_index": request.step_index,
        "step_id": request.step_id,
        "speaker": request.speaker,
        "text": request.trainee_transcript or request.member_response or "",
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    current_log = session.get("transcript_log", [])
    current_log.append(transcript_entry)
    
    # Update session status
    new_status = "on_hold" if request.speaker == "csr" else "in_progress"
    
    supabase.table("call_simulation_sessions").update({
        "transcript_log": current_log,
        "status": new_status,
        "current_step_index": request.step_index,
    }).eq("id", request.session_id).execute()
    
    return {
        "success": True,
        "turn_id": turn_response.data[0]["id"] if turn_response.data else None,
        "step_score": step_score,
    }


@router.post("/sessions/hold")
async def hold_resume_call(
    request: CallSimulationHoldRequest,
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Hold or resume the call. When holding, trigger TTS for member response.
    """
    _require_trainee(current_user)
    
    supabase = get_supabase_client()
    
    # Get session
    session_response = supabase.table("call_simulation_sessions").select("*").eq("id", request.session_id).execute()
    if not session_response.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_response.data[0]
    if session["trainee_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get scenario
    scenario_response = supabase.table("call_scenarios").select("script_flow, hold_audio_url").eq("id", session["call_scenario_id"]).execute()
    if not scenario_response.data:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    scenario = scenario_response.data[0]
    script_flow = scenario.get("script_flow", [])
    
    if request.action == "hold":
        # Update status to on_hold
        supabase.table("call_simulation_sessions").update({"status": "on_hold"}).eq("id", request.session_id).execute()
        
        # Get current step's member response for TTS
        current_step_index = session.get("current_step_index", 0)
        if current_step_index < len(script_flow):
            current_step = script_flow[current_step_index]
            member_response_text = current_step.get("member_response_text", "")
            
            return {
                "action": "hold",
                "member_response_text": member_response_text,
                "hold_audio_url": scenario.get("hold_audio_url"),
                "next_step_index": current_step_index + 1,
            }
        
        return {"action": "hold", "member_response_text": None}
    
    elif request.action == "resume":
        # Update status to in_progress
        supabase.table("call_simulation_sessions").update({"status": "in_progress"}).eq("id", request.session_id).execute()
        
        # Get next step's CSR script
        current_step_index = session.get("current_step_index", 0)
        next_step = script_flow[current_step_index] if current_step_index < len(script_flow) else None
        
        return {
            "action": "resume",
            "next_step": next_step,
            "is_complete": current_step_index >= len(script_flow),
        }
    
    raise HTTPException(status_code=400, detail="Invalid action. Use 'hold' or 'resume'")


@router.post("/sessions/complete")
async def complete_call_simulation(
    request: CallSimulationCompleteRequest,
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Complete the call simulation and trigger AI evaluation via Gemini.
    """
    _require_trainee(current_user)
    
    supabase = get_supabase_client()
    
    # Get session
    session_response = supabase.table("call_simulation_sessions").select("*").eq("id", request.session_id).execute()
    if not session_response.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_response.data[0]
    if session["trainee_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get scenario and turns
    scenario_response = supabase.table("call_scenarios").select("*").eq("id", session["call_scenario_id"]).execute()
    if not scenario_response.data:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    scenario = scenario_response.data[0]
    turns_response = supabase.table("call_simulation_turns").select("*").eq("session_id", request.session_id).order("step_index").execute()
    turns = turns_response.data or []
    
    # Build full transcript
    full_transcript = _build_transcript_from_turns(turns)
    
    # Calculate scores
    total_possible = sum(step.get("point_value", 0) for step in scenario.get("script_flow", []))
    earned_score = sum(turn.get("step_score", 0) for turn in turns if turn.get("speaker") == "csr")
    total_score = (earned_score / total_possible * 100) if total_possible > 0 else 0
    
    # Get AI evaluation from Gemini
    evaluation_data = EvaluationPromptData(
        transcript=full_transcript,
        script_flow=scenario.get("script_flow", []),
        target_kpis=scenario.get("target_kpis", {}),
    )
    
    try:
        ai_evaluation = await generate_evaluation_feedback(evaluation_data.dict())
    except Exception as e:
        logger.error(f"Gemini evaluation failed: {e}")
        ai_evaluation = None

    script_accuracy = (
        (ai_evaluation or {}).get("scriptAccuracy")
        or (ai_evaluation or {}).get("script_accuracy")
        or {}
    )
    grammar_and_pronunciation = (
        (ai_evaluation or {}).get("grammarAndPronunciation")
        or (ai_evaluation or {}).get("grammar_and_pronunciation")
        or {}
    )
    soft_skills = (
        (ai_evaluation or {}).get("softSkills")
        or (ai_evaluation or {}).get("soft_skills")
        or {}
    )
    pacing_and_aht = (
        (ai_evaluation or {}).get("pacingAndAht")
        or (ai_evaluation or {}).get("pacing_and_aht")
        or {}
    )
    
    # Determine pass/fail
    passing_score = scenario.get("passing_score", 80)
    passed = total_score >= passing_score
    
    # Update session with results
    update_data = {
        "status": "completed",
        "ended_at": datetime.utcnow().isoformat(),
        "total_duration_seconds": int((datetime.utcnow() - datetime.fromisoformat(session["started_at"])).total_seconds()),
        "full_transcript": full_transcript,
        "total_score": total_score,
        "script_accuracy_score": script_accuracy.get("score", 0),
        "grammar_score": grammar_and_pronunciation.get("score", 0),
        "pronunciation_score": grammar_and_pronunciation.get("score", 0),
        "soft_skills_score": soft_skills.get("score", 0),
        "pacing_score": pacing_and_aht.get("score", 0),
        "ai_evaluation": ai_evaluation,
        "ai_feedback": (ai_evaluation or {}).get("overallSummary") or (ai_evaluation or {}).get("overall_summary"),
        "passed": passed,
    }
    
    supabase.table("call_simulation_sessions").update(update_data).eq("id", request.session_id).execute()
    
    # Generate certificate if passed
    certificate_id = None
    if passed:
        cert_data = {
            "session_id": request.session_id,
            "scenario_id": session["call_scenario_id"],
            "call_scenario_id": session["call_scenario_id"],
            "trainee_id": str(current_user.id),
            "trainee_name": current_user.full_name,
            "scenario_topic": scenario["topic"],
            "total_score": total_score,
            "passing_score": passing_score,
            "certificate_title": f"Certificate of Competency - {scenario['topic']}",
            "feedback_report": ai_evaluation or {},
            "updated_at": datetime.utcnow().isoformat(),
        }
        cert_response = supabase.table("call_simulation_certificates").upsert(
            cert_data,
            on_conflict="session_id",
        ).execute()
        if cert_response.data:
            certificate_id = cert_response.data[0]["id"]
            supabase.table("call_simulation_sessions").update({"certificate_id": certificate_id}).eq("id", request.session_id).execute()
    
    return {
        "session_id": request.session_id,
        "total_score": total_score,
        "passing_score": passing_score,
        "passed": passed,
        "ai_evaluation": ai_evaluation,
        "certificate_id": certificate_id,
        "full_transcript": full_transcript,
    }


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get the current state of a call simulation session.
    """
    _require_trainee(current_user)
    
    supabase = get_supabase_client()
    response = supabase.table("call_simulation_sessions").select("*").eq("id", session_id).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = response.data[0]
    if session["trainee_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return session


@router.get("/sessions")
async def get_trainee_sessions(
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(10, ge=1, le=50),
):
    """
    Get all call simulation sessions for the current trainee.
    """
    _require_trainee(current_user)
    
    supabase = get_supabase_client()
    response = supabase.table("call_simulation_sessions").select("*").eq("trainee_id", str(current_user.id)).order("created_at", desc=True).limit(limit).execute()
    
    return response.data or []


@router.post("/tts")
async def synthesize_speech(
    text: str = Query(...),
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Convert text to speech using TTS service.
    """
    _require_trainee(current_user)
    
    try:
        audio_result = await text_to_speech(text)
        return {
            "audio_url": audio_result.get("audio_url"),
            "audio_base64": audio_result.get("audio_base64"),
            "duration": audio_result.get("duration"),
        }
    except Exception as e:
        logger.error(f"TTS failed: {e}")
        raise HTTPException(status_code=500, detail="Text-to-speech failed")
