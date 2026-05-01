"""
Gemini AI Evaluation Service for Call Simulation
Evaluates trainee performance based on transcript, script accuracy, grammar, soft skills, and KPIs.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

try:
    from google import genai
    from google.genai import types

    GEMINI_AVAILABLE = True
except ImportError:
    genai = None
    types = None
    GEMINI_AVAILABLE = False

from ..config_validation import normalize_env_value

logger = logging.getLogger(__name__)


class GeminiEvaluationEngine:
    """Gemini-powered evaluation engine for call simulation feedback."""

    def __init__(self) -> None:
        self.api_key = normalize_env_value(os.getenv("GEMINI_API_KEY"))
        self.client = None
        if GEMINI_AVAILABLE and self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as exc:
                logger.warning("Failed to initialize Gemini client: %s", exc)
                self.client = None

    def is_available(self) -> bool:
        return bool(GEMINI_AVAILABLE and self.client and self.api_key)

    def evaluate(
        self,
        transcript: str,
        script_flow: list[dict[str, Any]],
        target_kpis: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        """
        Evaluate trainee performance using Gemini API.

        Args:
            transcript: Full conversation transcript
            script_flow: The expected script flow with suggested CSR scripts
            target_kpis: Target KPIs for evaluation

        Returns:
            Evaluation result dictionary with scores and feedback
        """
        if not self.is_available():
            return self._fallback_evaluation(transcript, script_flow, target_kpis)

        # Build the evaluation prompt
        prompt = self._build_evaluation_prompt(transcript, script_flow, target_kpis)

        try:
            response = self.client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    response_mime_type="application/json",
                    system_instruction=self._get_system_instruction(),
                ),
            )

            if response.text:
                return json.loads(response.text)

        except Exception as e:
            logger.error(f"Gemini evaluation failed: {e}")

        return self._fallback_evaluation(transcript, script_flow, target_kpis)

    def _get_system_instruction(self) -> str:
        """Get the system instruction for the evaluation prompt."""
        return """You are an expert BPO call quality evaluator. Your role is to analyze call transcripts 
and provide detailed, actionable feedback for trainee development.

Evaluate the following aspects:
1. SCRIPT ACCURACY: How well did the trainee follow the suggested CSR script?
2. GRAMMAR & PRONUNCIATION: Identify any grammar issues or pronunciation errors (from STT output)
3. SOFT SKILLS: Evaluate pacing, empathy, tone, and professional demeanor
4. PACING & AHT: Analyze speaking pace and average handle time

Provide your evaluation in JSON format with the following structure:
{
    "overallSummary": "Brief overall summary of performance",
    "totalScore": 0-100,
    "passingScore": 80,
    "passed": true/false,
    "scriptAccuracy": {
        "score": 0-100,
        "strengths": ["list of what the trainee did well"],
        "misses": ["list of what was missed or incorrect"]
    },
    "grammarAndPronunciation": {
        "score": 0-100,
        "notes": ["list of specific issues found"]
    },
    "softSkills": {
        "score": 0-100,
        "notes": ["observations about tone, empathy, pacing"]
    },
    "pacingAndAht": {
        "ahtSeconds": actual handle time in seconds,
        "notes": ["observations about pace"]
    },
    "coachingTips": ["specific actionable tips for improvement"]
}

Be objective, constructive, and specific in your feedback."""

    def _build_evaluation_prompt(
        self,
        transcript: str,
        script_flow: list[dict[str, Any]],
        target_kpis: dict[str, Any],
    ) -> str:
        """Build the evaluation prompt with transcript and context."""

        # Format script flow for the prompt
        script_steps = "\n".join([
            f"Step {i+1}: CSR should say: '{step.get('suggested_csr_script', '')}' | Member responds: '{step.get('member_response_text', '')}' (Points: {step.get('point_value', 0)})"
            for i, step in enumerate(script_flow)
        ])

        # Format target KPIs
        kpi_text = "\n".join([f"- {k}: {v}" for k, v in target_kpis.items()]) if target_kpis else "No specific KPIs defined"

        prompt = f"""Please evaluate this BPO call simulation transcript.

## Expected Script Flow:
{script_steps}

## Target KPIs:
{kpi_text}

## Full Transcript:
{transcript}

## Task:
Analyze the transcript above and provide a detailed evaluation following the JSON structure specified in your instructions. Focus on:
1. How closely the trainee followed the suggested CSR scripts
2. Grammar and pronunciation issues (note: this is from speech-to-text, so some errors may be STT artifacts)
3. Soft skills like empathy, tone, and professionalism
4. Pacing and overall call duration

Provide specific, actionable coaching tips that will help the trainee improve."""

        return prompt

    def _fallback_evaluation(
        self,
        transcript: str,
        script_flow: list[dict[str, Any]],
        target_kpis: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Fallback evaluation when Gemini is not available.
        Performs basic keyword matching and scoring.
        """
        # Basic keyword matching for script accuracy
        csr_steps = [s for s in script_flow if s.get("suggested_csr_script")]
        matched_keywords = 0
        total_keywords = 0

        transcript_lower = transcript.lower()

        for step in csr_steps:
            keywords = step.get("expected_keywords", [])
            if keywords:
                total_keywords += len(keywords)
                for kw in keywords:
                    if kw.lower() in transcript_lower:
                        matched_keywords += 1

        keyword_score = (matched_keywords / total_keywords * 100) if total_keywords > 0 else 0

        # Calculate total possible points
        total_points = sum(step.get("point_value", 0) for step in script_flow)

        return {
            "overallSummary": "Evaluation completed with basic scoring. For detailed feedback, please enable Gemini API.",
            "totalScore": round(keyword_score, 2),
            "passingScore": 80,
            "passed": keyword_score >= 80,
            "scriptAccuracy": {
                "score": round(keyword_score, 2),
                "strengths": ["Completed the call simulation"],
                "misses": ["Full evaluation requires Gemini API"],
            },
            "grammarAndPronunciation": {
                "score": 75,
                "notes": ["Basic scoring only - enable Gemini for detailed analysis"],
            },
            "softSkills": {
                "score": 75,
                "notes": ["Basic scoring only - enable Gemini for detailed analysis"],
            },
            "pacingAndAht": {
                "ahtSeconds": 0,
                "notes": ["Timing data not available in fallback mode"],
            },
            "coachingTips": [
                "Enable Gemini API for comprehensive evaluation",
                "Practice speaking clearly and at a moderate pace",
                "Follow the suggested script more closely",
            ],
            "provider": "fallback",
        }


# Singleton instance
_evaluation_engine: Optional[GeminiEvaluationEngine] = None


def get_evaluation_engine() -> GeminiEvaluationEngine:
    """Get the singleton evaluation engine instance."""
    global _evaluation_engine
    if _evaluation_engine is None:
        _evaluation_engine = GeminiEvaluationEngine()
    return _evaluation_engine


async def generate_evaluation_feedback(
    evaluation_data: dict[str, Any],
) -> dict[str, Any]:
    """
    Generate evaluation feedback for a call simulation session.

    Args:
        evaluation_data: Dictionary containing transcript, script_flow, and target_kpis

    Returns:
        Evaluation result with scores and feedback
    """
    engine = get_evaluation_engine()

    transcript = evaluation_data.get("transcript", "")
    script_flow = evaluation_data.get("script_flow", [])
    target_kpis = evaluation_data.get("target_kpis", {})

    return engine.evaluate(transcript, script_flow, target_kpis)