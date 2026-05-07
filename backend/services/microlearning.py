from __future__ import annotations

import random
import re
import uuid
from datetime import datetime
from typing import Any, Optional
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from ..models import (
    FeedbackType,
    MicrolearningAssessmentMethod,
    MicrolearningAssignment,
    MicrolearningModule,
    ScenarioDifficulty,
)
from .microlearning_catalog import (
    build_type_specific_exercises,
    normalize_module_type,
)


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _feedback_category_value(value: Any) -> str:
    normalized = str(_enum_value(value) or "").strip().lower()
    return normalized or FeedbackType.PRONUNCIATION.value


def _slug(value: str) -> str:
    return "-".join((value or "").strip().lower().split())


def _format_batch_label(batch: Any) -> Optional[str]:
    if not batch:
        return None

    batch_name = (getattr(batch, "name", None) or "").strip()
    wave_number = getattr(batch, "wave_number", None)

    if batch_name and wave_number is not None:
        return f"{batch_name} | Wave {wave_number}"
    if batch_name:
        return batch_name
    if wave_number is not None:
        return f"Wave {wave_number}"
    return None


_SUPABASE_PUBLIC_OBJECT_MARKER = "/storage/v1/object/public/"
_DIRECT_AUDIO_EXTENSIONS = (".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".webm")
_DIRECT_VIDEO_EXTENSIONS = (".mp4", ".webm", ".ogg", ".mov", ".m4v")


def _normalize_text_value(value: Any) -> str:
    return str(value or "").strip()


def _normalize_media_url(value: Any) -> str:
    return _normalize_text_value(value).split("#", 1)[0]


def _module_content_payload(module: Optional[MicrolearningModule]) -> dict[str, Any]:
    return dict(getattr(module, "content_data", None) or {})


def _has_known_media_extension(url: str, extensions: tuple[str, ...]) -> bool:
    normalized_url = _normalize_media_url(url)
    if not normalized_url:
        return False

    try:
        path = urlparse(normalized_url).path
    except Exception:
        path = normalized_url

    return path.lower().endswith(extensions)


def _looks_like_youtube_url(url: str) -> bool:
    normalized_url = _normalize_media_url(url).lower()
    if not normalized_url:
        return False

    return any(
        marker in normalized_url
        for marker in ("youtu.be/", "youtube.com/watch", "youtube.com/embed/", "youtube.com/shorts/")
    )


def _looks_like_supabase_storage_url(url: str) -> bool:
    return _SUPABASE_PUBLIC_OBJECT_MARKER in _normalize_media_url(url)


def _module_asset_url(module: Optional[MicrolearningModule]) -> str:
    content_data = _module_content_payload(module)
    for candidate in (
        getattr(module, "content_url", None),
        getattr(module, "audio_url", None),
        content_data.get("asset_url"),
        content_data.get("audio_url"),
    ):
        normalized = _normalize_media_url(candidate)
        if normalized:
            return normalized
    return ""


def get_module_media_state(module: Optional[MicrolearningModule]) -> dict[str, Any]:
    module_type = normalize_module_type(getattr(module, "type", None))
    content_data = _module_content_payload(module)
    asset_url = _module_asset_url(module)
    asset_storage_path = _normalize_text_value(content_data.get("asset_storage_path"))
    audio_storage_path = _normalize_text_value(content_data.get("audio_storage_path"))
    audio_content_id = _normalize_text_value(content_data.get("audio_content_id"))

    if module_type == "video":
        is_ready = bool(
            asset_storage_path
            or _looks_like_youtube_url(asset_url)
            or _looks_like_supabase_storage_url(asset_url)
            or _has_known_media_extension(asset_url, _DIRECT_VIDEO_EXTENSIONS)
        )
        return {
            "media_requirement": "video",
            "media_ready": is_ready,
            "media_status": (
                "Ready for assignment and trainee playback."
                if is_ready
                else "Upload or link a playable video before assigning this module."
            ),
            "asset_url": asset_url or None,
        }

    if module_type == "audio":
        is_ready = bool(
            audio_storage_path
            or audio_content_id
            or _looks_like_supabase_storage_url(asset_url)
            or _has_known_media_extension(asset_url, _DIRECT_AUDIO_EXTENSIONS)
        )
        return {
            "media_requirement": "audio",
            "media_ready": is_ready,
            "media_status": (
                "Ready for assignment and trainee playback."
                if is_ready
                else "Upload the lesson audio before assigning this module."
            ),
            "asset_url": asset_url or None,
        }

    return {
        "media_requirement": "none",
        "media_ready": True,
        "media_status": "No required media gate for this module type.",
        "asset_url": asset_url or None,
    }


def module_requires_media(module: Optional[MicrolearningModule]) -> bool:
    return get_module_media_state(module).get("media_requirement") in {"video", "audio"}


def module_has_required_media(module: Optional[MicrolearningModule]) -> bool:
    media_state = get_module_media_state(module)
    return bool(media_state.get("media_ready")) or media_state.get("media_requirement") == "none"


def assignment_is_current(assignment: Optional[MicrolearningAssignment]) -> bool:
    if not assignment:
        return False

    module = getattr(assignment, "module", None)
    if not module or not getattr(module, "is_active", False):
        return False

    assigned_by = _normalize_text_value(getattr(assignment, "assigned_by", None))
    module_owner = _normalize_text_value(getattr(module, "created_by", None))
    if assigned_by and module_owner and assigned_by != module_owner:
        return False

    batch = getattr(assignment, "batch", None)
    batch_owner = _normalize_text_value(getattr(batch, "created_by", None)) if batch else ""
    if batch and batch_owner and assigned_by and batch_owner != assigned_by:
        return False
    if batch and not bool(getattr(batch, "is_active", True)):
        return False

    trainee = getattr(assignment, "trainee", None)
    if trainee and not bool(getattr(trainee, "is_active", True)):
        return False
    if batch and trainee:
        active_trainee_batch_ids = {
            _normalize_text_value(getattr(trainee_batch, "id", None))
            for trainee_batch in (getattr(trainee, "batches", None) or [])
            if bool(getattr(trainee_batch, "is_active", True))
        }
        if _normalize_text_value(getattr(batch, "id", None)) not in active_trainee_batch_ids:
            return False

    if not module_has_required_media(module):
        return False

    return True


def _assignment_recency_key(assignment: Optional[MicrolearningAssignment]) -> tuple[datetime, datetime, datetime, datetime, str]:
    if not assignment:
        minimum = datetime.min
        return minimum, minimum, minimum, minimum, ""

    minimum = datetime.min
    return (
        getattr(assignment, "assigned_at", None) or minimum,
        getattr(assignment, "updated_at", None) or minimum,
        getattr(assignment, "completed_at", None) or minimum,
        getattr(assignment, "started_at", None) or minimum,
        str(getattr(assignment, "id", None) or ""),
    )


def filter_current_assignments(
    assignments: list[MicrolearningAssignment],
) -> list[MicrolearningAssignment]:
    """Keep only visible trainer-owned assignments and collapse stale duplicates."""
    visible_assignments = sorted(
        [assignment for assignment in assignments if assignment_is_current(assignment)],
        key=_assignment_recency_key,
        reverse=True,
    )
    latest_by_scope: set[tuple[str, str, str]] = set()
    filtered: list[MicrolearningAssignment] = []

    for assignment in visible_assignments:
        scope_key = (
            _normalize_text_value(getattr(assignment, "module_id", None)),
            _normalize_text_value(getattr(assignment, "trainee_id", None)),
            _normalize_text_value(getattr(assignment, "assigned_by", None)),
        )
        if not all(scope_key):
            continue
        if scope_key in latest_by_scope:
            continue
        latest_by_scope.add(scope_key)
        filtered.append(assignment)

    return filtered


_SPECIAL_RESPONSE_KEYS = {"__meta__"}
_KEYWORD_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "have",
    "i",
    "if",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "so",
    "that",
    "the",
    "their",
    "them",
    "this",
    "to",
    "we",
    "will",
    "with",
    "you",
    "your",
}


ASSESSMENT_METHOD_DEFINITIONS: list[dict[str, Any]] = [
    {
        "slug": "performance-simulation",
        "name": 'Performance-Based "Simulation" (The Virtual Sandbox)',
        "summary": "Two-minute sandbox drills that make the agent perform the task instead of only describing it.",
        "method_description": (
            "The agent navigates a mock CRM while handling a live customer prompt. "
            "The lesson focuses on how well they talk, type, and move through the workflow at the same time."
        ),
        "measures": [
            "Talk-to-Type multitasking ratio",
            "CRM navigation speed",
            "Data-entry accuracy",
        ],
        "examples": [
            {
                "title": "CRM Verification Sprint",
                "description": (
                    "A short sandbox lesson where the trainee verifies customer identity, logs the call, "
                    "and confirms the next step without losing pace."
                ),
                "category": FeedbackType.CLARITY,
                "duration_minutes": 4,
                "skill_focus": "Talk-to-Type ratio during customer verification",
                "difficulty": ScenarioDifficulty.INTERMEDIATE,
            },
            {
                "title": "Ticket Routing Sandbox",
                "description": (
                    "A multitasking lesson that checks routing speed, note-taking quality, and navigation accuracy "
                    "while the trainee handles a live service issue."
                ),
                "category": FeedbackType.FLUENCY,
                "duration_minutes": 4,
                "skill_focus": "Navigation speed and accurate ticket notes",
                "difficulty": ScenarioDifficulty.ADVANCED,
            },
        ],
    },
    {
        "slug": "speech-voice-ai",
        "name": 'Speech & Voice AI (The "Speech Enabler" Method)',
        "summary": "Voice-response lessons that evaluate how the agent sounds, not just what they say.",
        "method_description": (
            "The trainee records a short response to a customer prompt, and the lesson evaluates pacing, tone, "
            "pronunciation, and spoken empathy markers."
        ),
        "measures": [
            "Rate of speech (WPM)",
            "Sentiment and tone",
            "Pronunciation and syllable stress",
        ],
        "examples": [
            {
                "title": "Empathy Tone Calibration",
                "description": (
                    "A guided voice-response lesson for upset-customer scenarios with emphasis on calm tone and empathy."
                ),
                "category": FeedbackType.EMPATHY,
                "duration_minutes": 3,
                "skill_focus": "Tone, empathy, and controlled pacing",
                "difficulty": ScenarioDifficulty.BASIC,
            },
            {
                "title": "Technical Pronunciation Stress Check",
                "description": (
                    "A V&A lesson that practices clear pronunciation of technical product and billing terms."
                ),
                "category": FeedbackType.PRONUNCIATION,
                "duration_minutes": 3,
                "skill_focus": "Correct stress on technical terms",
                "difficulty": ScenarioDifficulty.INTERMEDIATE,
            },
        ],
    },
    {
        "slug": "thin-slicing-case-studies",
        "name": '"Thin-Slicing" Case Studies',
        "summary": "Rapid yes-or-no judgment lessons that break large compliance rules into small decision slices.",
        "method_description": (
            "The trainee reviews a short call snippet or transaction snapshot and decides whether the action is a breach, "
            "then explains the right next move."
        ),
        "measures": [
            "Rapid compliance judgment",
            "Policy knowledge",
            "Decision quality under time pressure",
        ],
        "examples": [
            {
                "title": "Compliance Snapshot: Refund Waiver",
                "description": (
                    "A thin-slice lesson that asks the trainee to spot whether a waived fee violates refund policy."
                ),
                "category": FeedbackType.CLARITY,
                "duration_minutes": 2,
                "skill_focus": "Yes/No compliance recognition",
                "difficulty": ScenarioDifficulty.INTERMEDIATE,
            },
            {
                "title": "Fraud Flag Thin Slice",
                "description": (
                    "A case-study lesson that checks whether a screenshot and short transcript reveal a verification breach."
                ),
                "category": FeedbackType.GRAMMAR,
                "duration_minutes": 2,
                "skill_focus": "Breach recognition from short evidence slices",
                "difficulty": ScenarioDifficulty.ADVANCED,
            },
        ],
    },
    {
        "slug": "spaced-repetition-quizzing",
        "name": "Spaced Repetition Quizzing (Gamified)",
        "summary": "Short recurring lessons that revisit the same knowledge over time so trainees retain it longer.",
        "method_description": (
            "The lesson acts like a question-of-the-day drill. The same topic comes back in slightly harder forms "
            "to strengthen long-term memory."
        ),
        "measures": [
            "Long-term retention",
            "Recall speed",
            "Progressive product knowledge mastery",
        ],
        "examples": [
            {
                "title": "Question of the Day: Billing Codes",
                "description": (
                    "A spaced-repetition lesson that reviews the same billing-code rule with short daily recall checks."
                ),
                "category": FeedbackType.GRAMMAR,
                "duration_minutes": 2,
                "skill_focus": "Retention of billing and adjustment rules",
                "difficulty": ScenarioDifficulty.BASIC,
            },
            {
                "title": "Product Recall Ladder: Plan Features",
                "description": (
                    "A gamified recall lesson that revisits product features with slightly harder checks each round."
                ),
                "category": FeedbackType.CLARITY,
                "duration_minutes": 2,
                "skill_focus": "Retention of plan features and customer-facing benefits",
                "difficulty": ScenarioDifficulty.INTERMEDIATE,
            },
        ],
    },
    {
        "slug": "confidence-based-assessment",
        "name": "Confidence-Based Assessment",
        "summary": "Lessons that capture both the answer and the trainee's certainty so confident errors are visible.",
        "method_description": (
            'The trainee answers the question and then reflects on confidence using "I am Certain," '
            '"I am Guessing," or "I am Unsure." This highlights risky confident mistakes.'
        ),
        "measures": [
            "Confident error risk",
            "Knowledge-checking behavior",
            "Decision confidence calibration",
        ],
        "examples": [
            {
                "title": "Confident Error Watch: Refund Eligibility",
                "description": (
                    "A lesson that checks whether the trainee answers a refund question correctly and recognizes when to verify."
                ),
                "category": FeedbackType.CLARITY,
                "duration_minutes": 3,
                "skill_focus": "Confident error detection in policy answers",
                "difficulty": ScenarioDifficulty.INTERMEDIATE,
            },
            {
                "title": "Certainty Meter: Escalation Policy",
                "description": (
                    "A lesson that measures whether the trainee is accurate and honest about confidence in escalation rules."
                ),
                "category": FeedbackType.EMPATHY,
                "duration_minutes": 3,
                "skill_focus": "Confidence calibration before giving policy guidance",
                "difficulty": ScenarioDifficulty.ADVANCED,
            },
        ],
    },
]


def _assessment_method_lookup() -> dict[str, dict[str, Any]]:
    return {
        method["slug"]: method
        for method in ASSESSMENT_METHOD_DEFINITIONS
    }


def _build_exercise(
    *,
    title: str,
    exercise_type: str,
    prompt: str,
    options: Optional[list[str]] = None,
    correct_option: Optional[str] = None,
    required_keywords: Optional[list[str]] = None,
    tips: Optional[list[str]] = None,
    explanation: Optional[str] = None,
    sample_answer: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "type": exercise_type,
        "prompt": prompt,
        "options": options or [],
        "correct_option": correct_option,
        "required_keywords": required_keywords or [],
        "tips": tips or [],
        "explanation": explanation,
        "sample_answer": sample_answer,
    }


def _generate_category_exercises(
    category: FeedbackType | str,
    *,
    title: Optional[str] = None,
    skill_focus: Optional[str] = None,
) -> list[dict[str, Any]]:
    category_value = _feedback_category_value(category)
    focus = skill_focus or title or "customer communication"

    templates: dict[str, list[dict[str, Any]]] = {
        FeedbackType.PRONUNCIATION.value: [
            _build_exercise(
                title="Best Pronunciation Choice",
                exercise_type="multiple_choice",
                prompt=f"Choose the clearest way to say a key phrase related to {focus}.",
                options=[
                    "I can absolutely help you with that today.",
                    "I can, um, help you with that maybe today.",
                    "Help you with that, yeah, I can.",
                ],
                correct_option="I can absolutely help you with that today.",
                explanation="Lead with a complete, confident sentence and avoid filler words.",
            ),
            _build_exercise(
                title="Keyword Practice",
                exercise_type="keyword_response",
                prompt=f"Write a short response that sounds clear and confident for {focus}.",
                required_keywords=["help", "today", "confirm"],
                tips=["Keep the sentence short.", "Use natural pacing words."],
                sample_answer="I can help you today, and I will confirm the next step clearly.",
            ),
            _build_exercise(
                title="Customer Reassurance Line",
                exercise_type="keyword_response",
                prompt="Draft a reassurance line with crisp pronunciation cues.",
                required_keywords=["understand", "assist", "next step"],
                tips=["Avoid slang.", "Say the next action explicitly."],
                sample_answer="I understand the issue, I can assist you, and I will explain the next step.",
            ),
        ],
        FeedbackType.FLUENCY.value: [
            _build_exercise(
                title="Smooth Delivery Choice",
                exercise_type="multiple_choice",
                prompt=f"Pick the response that sounds the most fluent for {focus}.",
                options=[
                    "Let me check that for you and walk you through the update.",
                    "Let me, uh, check that and maybe walk you through it.",
                    "Checking it now, okay, then maybe update after.",
                ],
                correct_option="Let me check that for you and walk you through the update.",
                explanation="Fluent responses flow without hesitation and keep a clear sequence.",
            ),
            _build_exercise(
                title="Flow Builder",
                exercise_type="keyword_response",
                prompt="Write a response that uses a smooth transition from problem to solution.",
                required_keywords=["check", "update", "solution"],
                tips=["Link ideas with 'and' or 'then'.", "Avoid restarting the sentence."],
                sample_answer="I will check the account, give you an update, and explain the best solution.",
            ),
            _build_exercise(
                title="Call Closing Script",
                exercise_type="keyword_response",
                prompt="Create a fluent closing statement for the call.",
                required_keywords=["summary", "thank you", "assist"],
                tips=["Keep the order logical.", "End with a warm close."],
                sample_answer="To summarize, I have completed the update. Thank you for your time, and I am happy to assist again.",
            ),
        ],
        FeedbackType.GRAMMAR.value: [
            _build_exercise(
                title="Correct Grammar Choice",
                exercise_type="multiple_choice",
                prompt="Choose the grammatically correct customer support response.",
                options=[
                    "I have updated your request and sent the confirmation email.",
                    "I has updated your request and send the confirmation email.",
                    "I updated your request and sends confirmation email.",
                ],
                correct_option="I have updated your request and sent the confirmation email.",
                explanation="Use consistent verb tense and agreement.",
            ),
            _build_exercise(
                title="Sentence Repair",
                exercise_type="keyword_response",
                prompt="Write a grammatically correct response confirming a completed action.",
                required_keywords=["updated", "confirmation", "email"],
                tips=["Use a subject and a complete verb phrase."],
                sample_answer="I have updated your request, and the confirmation email has been sent.",
            ),
            _build_exercise(
                title="Professional Follow-up",
                exercise_type="keyword_response",
                prompt="Compose a professional follow-up sentence for the customer.",
                required_keywords=["review", "issue", "contact"],
                tips=["Use complete sentences.", "Avoid fragments."],
                sample_answer="If you review the issue again and need more help, please contact us anytime.",
            ),
        ],
        FeedbackType.EMPATHY.value: [
            _build_exercise(
                title="Empathy Statement Choice",
                exercise_type="multiple_choice",
                prompt="Choose the response that best shows empathy.",
                options=[
                    "I understand how frustrating that must feel, and I will help you.",
                    "That is the policy, so you need to wait.",
                    "Okay, I saw the problem.",
                ],
                correct_option="I understand how frustrating that must feel, and I will help you.",
                explanation="Strong empathy acknowledges the feeling and pairs it with support.",
            ),
            _build_exercise(
                title="Acknowledge the Concern",
                exercise_type="keyword_response",
                prompt="Write an empathetic response for a frustrated customer.",
                required_keywords=["understand", "frustrating", "help"],
                tips=["Acknowledge emotion first.", "Then offer action."],
                sample_answer="I understand this is frustrating, and I am here to help you resolve it.",
            ),
            _build_exercise(
                title="Reassurance Script",
                exercise_type="keyword_response",
                prompt="Create a reassurance message after apologizing.",
                required_keywords=["sorry", "support", "next step"],
                tips=["Keep the tone calm and human."],
                sample_answer="I am sorry for the trouble. I will support you and explain the next step clearly.",
            ),
        ],
        FeedbackType.CLARITY.value: [
            _build_exercise(
                title="Clear Instruction Choice",
                exercise_type="multiple_choice",
                prompt="Pick the clearest set of instructions for the customer.",
                options=[
                    "Please open the app, tap Settings, and select Reset Password.",
                    "Go in there somewhere and reset it from the settings area.",
                    "Maybe open the app and look around for password options.",
                ],
                correct_option="Please open the app, tap Settings, and select Reset Password.",
                explanation="Clarity comes from direct steps in the right order.",
            ),
            _build_exercise(
                title="Step-by-Step Response",
                exercise_type="keyword_response",
                prompt="Write a clear set of support instructions.",
                required_keywords=["open", "select", "confirm"],
                tips=["Use action verbs.", "Keep the order simple."],
                sample_answer="Open the app, select Settings, and confirm the change on the final screen.",
            ),
            _build_exercise(
                title="Next-Step Summary",
                exercise_type="keyword_response",
                prompt="Summarize the next step in one clear sentence.",
                required_keywords=["next step", "email", "confirm"],
                tips=["State what happens next.", "Avoid extra details."],
                sample_answer="Your next step is to open the email and confirm the request.",
            ),
        ],
    }

    return templates.get(category_value, templates[FeedbackType.PRONUNCIATION.value])


def generate_assessment_method_exercises(
    assessment_method_slug: str,
    *,
    title: Optional[str] = None,
    skill_focus: Optional[str] = None,
) -> list[dict[str, Any]]:
    focus = skill_focus or title or "customer communication"

    templates: dict[str, list[dict[str, Any]]] = {
        "performance-simulation": [
            _build_exercise(
                title="Sandbox Action Sequence",
                exercise_type="multiple_choice",
                prompt=f"In the {focus} simulation, which sequence best balances speaking and CRM updates?",
                options=[
                    "Greet, verify the customer, open the correct CRM screen, and summarize the action taken.",
                    "Open multiple tabs first, then ask the customer why they called.",
                    "Promise a fix immediately and type the notes after the call ends.",
                ],
                correct_option="Greet, verify the customer, open the correct CRM screen, and summarize the action taken.",
                explanation="The best simulation answer keeps the workflow ordered while protecting note accuracy.",
            ),
            _build_exercise(
                title="Live Note Capture",
                exercise_type="keyword_response",
                prompt="Write the note you would log while still speaking to the customer.",
                required_keywords=["verified", "issue", "next step"],
                tips=["Keep the note short.", "Capture the action and next step."],
                sample_answer="Customer verified, issue documented, and next step confirmed before transfer.",
            ),
            _build_exercise(
                title="Talk-to-Type Reflection",
                exercise_type="keyword_response",
                prompt="Explain how you would avoid falling behind in the CRM during the simulation.",
                required_keywords=["listen", "document", "confirm"],
                tips=["Balance active listening with short entries."],
                sample_answer="I listen first, document only the key facts, and confirm the next step before moving on.",
            ),
        ],
        "speech-voice-ai": [
            _build_exercise(
                title="Best Voice Delivery",
                exercise_type="multiple_choice",
                prompt=f"Which spoken response best matches the voice goal for {focus}?",
                options=[
                    "I understand how frustrating that is, and I will stay with you while we fix it.",
                    "Okay, give me a second because I am checking things now.",
                    "That is the process, so please wait while I review the issue.",
                ],
                correct_option="I understand how frustrating that is, and I will stay with you while we fix it.",
                explanation="The strongest response pairs empathy with a calm, supportive tone.",
            ),
            _build_exercise(
                title="Thirty-Second Voice Response",
                exercise_type="keyword_response",
                prompt="Draft a 30-second spoken response that sounds calm, clear, and human.",
                required_keywords=["understand", "help", "today"],
                tips=["Aim for a natural pace.", "Avoid robotic phrasing."],
                sample_answer="I understand the issue, and I will help you today by walking through the best next step.",
            ),
            _build_exercise(
                title="Pronunciation Anchor",
                exercise_type="keyword_response",
                prompt="Write one line that clearly stresses a technical term the customer must understand.",
                required_keywords=["confirm", "account", "status"],
                tips=["Use clean syllable stress and short phrases."],
                sample_answer="I will confirm your account status first, then explain what happens next.",
            ),
        ],
        "thin-slicing-case-studies": [
            _build_exercise(
                title="Compliance Breach Check",
                exercise_type="multiple_choice",
                prompt=f"A 15-second snippet shows the agent skipped one required disclosure during {focus}. Is this a breach?",
                options=[
                    "Yes, it is a compliance breach.",
                    "No, because the call was short.",
                    "No, because the customer did not complain.",
                ],
                correct_option="Yes, it is a compliance breach.",
                explanation="Thin-slice case studies reward fast rule recognition, not hindsight excuses.",
            ),
            _build_exercise(
                title="Why or Why Not",
                exercise_type="keyword_response",
                prompt="Explain the policy reason for your decision in one or two sentences.",
                required_keywords=["policy", "disclosure", "required"],
                tips=["Reference the rule directly."],
                sample_answer="The policy requires the disclosure before the action is completed, so skipping it creates a breach.",
            ),
            _build_exercise(
                title="Corrective Next Step",
                exercise_type="keyword_response",
                prompt="State the immediate next step the agent should take after spotting the breach.",
                required_keywords=["pause", "correct", "document"],
                tips=["Use direct action words."],
                sample_answer="Pause the workflow, correct the missing step, and document the breach for review.",
            ),
        ],
        "spaced-repetition-quizzing": [
            _build_exercise(
                title="Question of the Day",
                exercise_type="multiple_choice",
                prompt=f"For today's {focus} recall check, which answer is correct?",
                options=[
                    "Give the customer the approved policy detail and confirm the next action.",
                    "Share a partial answer and suggest they call back later.",
                    "Guess the answer if the queue is busy.",
                ],
                correct_option="Give the customer the approved policy detail and confirm the next action.",
                explanation="Spaced repetition reinforces the exact approved answer repeatedly over time.",
            ),
            _build_exercise(
                title="Daily Recall",
                exercise_type="keyword_response",
                prompt="Write the one-sentence answer the trainee should remember tomorrow.",
                required_keywords=["policy", "confirm", "next step"],
                tips=["Keep it short enough to recall quickly."],
                sample_answer="Follow the approved policy, confirm the detail, and state the next step clearly.",
            ),
            _build_exercise(
                title="Difficulty Bump",
                exercise_type="keyword_response",
                prompt="Now answer the same topic in a slightly harder version with one added detail.",
                required_keywords=["policy", "customer", "follow-up"],
                tips=["Add one extra detail without losing clarity."],
                sample_answer="Use the approved policy, explain it to the customer, and include the follow-up action.",
            ),
        ],
        "confidence-based-assessment": [
            _build_exercise(
                title="Knowledge Check",
                exercise_type="multiple_choice",
                prompt=f"Choose the best answer for this {focus} policy question.",
                options=[
                    "Verify the rule in the knowledge base before confirming the answer to the customer.",
                    "Answer immediately if you think you remember it.",
                    "Tell the customer the first likely answer so the call moves faster.",
                ],
                correct_option="Verify the rule in the knowledge base before confirming the answer to the customer.",
                explanation="Confidence-based checks reward accuracy and the right verification behavior.",
            ),
            _build_exercise(
                title="Confidence Statement",
                exercise_type="keyword_response",
                prompt=(
                    'Write the answer you would give, then end the response with one of these exact phrases: '
                    '"I am Certain," "I am Guessing," or "I am Unsure."'
                ),
                required_keywords=["i am"],
                tips=["Be honest about your confidence.", "Mention verification when needed."],
                sample_answer="I would verify the refund rule first before answering the customer. I am Unsure.",
            ),
            _build_exercise(
                title="Confident Error Reflection",
                exercise_type="keyword_response",
                prompt="Explain why being confidently wrong is risky in this scenario.",
                required_keywords=["incorrect", "customer", "check"],
                tips=["Mention business risk and the need to check."],
                sample_answer="A confidently incorrect answer misleads the customer, so I should check the knowledge base first.",
            ),
        ],
    }

    return templates.get(
        assessment_method_slug,
        templates["speech-voice-ai"],
    )


def generate_default_exercises(
    category: FeedbackType | str,
    *,
    title: Optional[str] = None,
    skill_focus: Optional[str] = None,
    assessment_method_slug: Optional[str] = None,
) -> list[dict[str, Any]]:
    if assessment_method_slug:
        return generate_assessment_method_exercises(
            assessment_method_slug,
            title=title,
            skill_focus=skill_focus,
        )

    return _generate_category_exercises(
        category,
        title=title,
        skill_focus=skill_focus,
    )


def ensure_assessment_method_catalog(
    db: Session,
) -> list[MicrolearningAssessmentMethod]:
    slugs = [method["slug"] for method in ASSESSMENT_METHOD_DEFINITIONS]
    existing_rows = (
        db.query(MicrolearningAssessmentMethod)
        .filter(MicrolearningAssessmentMethod.slug.in_(slugs))
        .all()
    )
    existing_by_slug = {
        row.slug: row
        for row in existing_rows
    }

    methods: list[MicrolearningAssessmentMethod] = []
    for definition in ASSESSMENT_METHOD_DEFINITIONS:
        row = existing_by_slug.get(definition["slug"])
        if row:
            row.name = definition["name"]
            row.summary = definition["summary"]
            row.method_description = definition["method_description"]
            row.measures = definition["measures"]
            row.is_active = True
            row.updated_at = datetime.utcnow()
        else:
            row = MicrolearningAssessmentMethod(
                slug=definition["slug"],
                name=definition["name"],
                summary=definition["summary"],
                method_description=definition["method_description"],
                measures=definition["measures"],
                is_active=True,
            )
            db.add(row)
        methods.append(row)

    db.flush()
    return methods


def ensure_assessment_method_examples(
    db: Session,
    *,
    trainer_id: str,
) -> dict[str, Any]:
    methods = ensure_assessment_method_catalog(db)
    method_by_slug = {method.slug: method for method in methods}
    method_ids = [method.id for method in methods]

    existing_modules = (
        db.query(MicrolearningModule)
        .filter(
            MicrolearningModule.created_by == trainer_id,
            MicrolearningModule.assessment_method_id.in_(method_ids),
            MicrolearningModule.is_active == True,
        )
        .all()
        if method_ids
        else []
    )
    existing_by_key = {
        (
            module.assessment_method_id,
            (module.title or "").strip().lower(),
        ): module
        for module in existing_modules
    }

    created = 0
    updated = 0
    saved_modules: list[MicrolearningModule] = []

    for definition in ASSESSMENT_METHOD_DEFINITIONS:
        method = method_by_slug[definition["slug"]]
        for example in definition["examples"]:
            key = (
                method.id,
                example["title"].strip().lower(),
            )
            module = existing_by_key.get(key)
            exercises = generate_default_exercises(
                example["category"],
                title=example["title"],
                skill_focus=example.get("skill_focus"),
                assessment_method_slug=method.slug,
            )

            if module:
                module.description = example["description"]
                module.category = example["category"].name
                module.duration_minutes = example["duration_minutes"]
                module.skill_focus = example.get("skill_focus")
                module.content_url = example.get("content_url")
                module.difficulty = example["difficulty"]
                module.assessment_method_id = method.id
                module.exercises = exercises
                module.is_active = True
                updated += 1
            else:
                module = MicrolearningModule(
                    title=example["title"],
                    description=example["description"],
                    category=example["category"].name,
                    duration_minutes=example["duration_minutes"],
                    skill_focus=example.get("skill_focus"),
                    content_url=example.get("content_url"),
                    difficulty=example["difficulty"],
                    assessment_method_id=method.id,
                    exercises=exercises,
                    created_by=trainer_id,
                    is_active=True,
                )
                db.add(module)
                created += 1

            saved_modules.append(module)

    db.flush()
    return {
        "created_modules": created,
        "updated_modules": updated,
        "methods": [serialize_assessment_method(method) for method in methods],
        "modules": [serialize_microlearning_module(module) for module in saved_modules],
    }


def serialize_assessment_method(
    method: MicrolearningAssessmentMethod,
    *,
    lesson_count: int = 0,
) -> dict[str, Any]:
    definition = _assessment_method_lookup().get(method.slug, {})
    examples = definition.get("examples") or []
    return {
        "id": method.id,
        "slug": method.slug,
        "name": method.name,
        "summary": method.summary,
        "method_description": method.method_description,
        "measures": list(method.measures or []),
        "lesson_count": lesson_count,
        "required_example_count": len(examples),
        "example_titles": [example.get("title") for example in examples if example.get("title")],
        "created_at": method.created_at,
        "updated_at": method.updated_at,
    }


def _response_entries(assignment: MicrolearningAssignment) -> list[tuple[str, dict[str, Any]]]:
    responses = dict(assignment.responses or {})
    entries: list[tuple[str, dict[str, Any]]] = []
    for exercise_id, attempt in responses.items():
        if exercise_id in _SPECIAL_RESPONSE_KEYS:
            continue
        if isinstance(attempt, dict):
            entries.append((exercise_id, attempt))
    return entries


def _assignment_meta(assignment: MicrolearningAssignment) -> dict[str, Any]:
    responses = dict(assignment.responses or {})
    meta = responses.get("__meta__")
    return dict(meta) if isinstance(meta, dict) else {}


def _set_assignment_meta(assignment: MicrolearningAssignment, **updates: Any) -> None:
    responses = dict(assignment.responses or {})
    meta = _assignment_meta(assignment)
    meta.update(updates)
    responses["__meta__"] = meta
    assignment.responses = responses


def _get_retake_count(assignment: MicrolearningAssignment) -> int:
    try:
        return int(_assignment_meta(assignment).get("retake_count") or 0)
    except (TypeError, ValueError):
        return 0


def _current_attempt_number(assignment: MicrolearningAssignment) -> int:
    return _get_retake_count(assignment) + 1


def _normalize_exact_text(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _tokenize_text(value: Optional[str]) -> list[str]:
    tokens = re.findall(r"[A-Za-z0-9']+", str(value or "").lower())
    return [
        token
        for token in tokens
        if len(token) > 2 and token not in _KEYWORD_STOP_WORDS
    ]


def _dedupe_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _derive_required_keywords(exercise: dict[str, Any]) -> list[str]:
    explicit_keywords = [
        str(keyword or "").strip().lower()
        for keyword in (exercise.get("required_keywords") or [])
        if str(keyword or "").strip()
    ]
    if explicit_keywords:
        return _dedupe_preserving_order(explicit_keywords)

    sample_answer = (exercise.get("sample_answer") or "").strip()
    if not sample_answer:
        return []

    return _dedupe_preserving_order(_tokenize_text(sample_answer))[:6]


def _exercise_options_for_current_attempt(
    assignment: MicrolearningAssignment,
    exercise: dict[str, Any],
) -> list[str]:
    options = [str(option or "") for option in (exercise.get("options") or []) if str(option or "").strip()]
    if len(options) < 2:
        return options

    shuffler = random.Random(
        f"{assignment.id}:{_current_attempt_number(assignment)}:{exercise.get('id') or exercise.get('title')}"
    )
    shuffled = list(options)
    shuffler.shuffle(shuffled)
    return shuffled


def reset_assignment_for_retake(assignment: MicrolearningAssignment) -> None:
    next_retake_count = _get_retake_count(assignment) + 1
    assignment.responses = {
        "__meta__": {
            "retake_count": next_retake_count,
            "reset_at": datetime.utcnow().isoformat(),
        }
    }
    assignment.status = "assigned"
    assignment.completion_percentage = 0.0
    assignment.completed_exercises = 0
    assignment.started_at = None
    assignment.completed_at = None


def _assignment_average_score(assignment: MicrolearningAssignment) -> float:
    completed_scores = [
        float(attempt.get("score") or 0.0)
        for _, attempt in _response_entries(assignment)
        if attempt.get("is_completed")
    ]
    if not completed_scores:
        return 0.0
    return round(sum(completed_scores) / len(completed_scores), 2)


def _assignment_is_passed(assignment: MicrolearningAssignment) -> bool:
    module = getattr(assignment, "module", None)
    passing_score = float(getattr(module, "passing_score", 0) or 0)
    if not module:
        return False
    if int(assignment.completed_exercises or 0) < len(module.exercises or []):
        return False
    return _assignment_average_score(assignment) >= passing_score


def serialize_microlearning_module(
    module: MicrolearningModule,
    *,
    assignment_count: int = 0,
) -> dict[str, Any]:
    assessment_method = getattr(module, "assessment_method", None)
    topic_category = getattr(module, "topic_category", None)
    media_state = get_module_media_state(module)
    return {
        "id": module.id,
        "title": module.title,
        "description": module.description,
        "category": _feedback_category_value(module.category),
        "module_type": normalize_module_type(getattr(module, "type", None)),
        "duration_minutes": module.duration_minutes,
        "passing_score": int(getattr(module, "passing_score", 0) or 0),
        "skill_focus": module.skill_focus,
        "content_url": module.content_url or module.audio_url,
        "content_data": module.content_data or {},
        "audio_url": module.audio_url,
        "audio_transcript": module.audio_transcript,
        "audio_tts_url": module.audio_tts_url,
        "audio_duration_seconds": module.audio_duration_seconds,
        "audio_language": module.audio_language,
        "difficulty": _enum_value(module.difficulty),
        "topic_category_id": getattr(topic_category, "id", None) or module.topic_category_id,
        "topic_category_name": getattr(topic_category, "name", None),
        "topic_category_slug": getattr(topic_category, "slug", None),
        "topic_category_description": getattr(topic_category, "description", None),
        "assessment_method_id": getattr(assessment_method, "id", None) or module.assessment_method_id,
        "assessment_method_slug": getattr(assessment_method, "slug", None),
        "assessment_method_name": getattr(assessment_method, "name", None),
        "assessment_method_summary": getattr(assessment_method, "summary", None),
        "assessment_measures": list(getattr(assessment_method, "measures", None) or []),
        "exercise_count": len(module.exercises or []),
        "exercises": module.exercises or [],
        "assignment_count": int(assignment_count or 0),
        "media_requirement": media_state.get("media_requirement"),
        "media_ready": bool(media_state.get("media_ready")),
        "media_status": media_state.get("media_status"),
        "created_at": module.created_at,
    }


def ensure_module_exercises(module: Optional[MicrolearningModule]) -> bool:
    if not module:
        return False

    if module.exercises:
        return False

    module.exercises = build_type_specific_exercises(
        normalize_module_type(getattr(module, "type", None)),
        module.content_data or {},
        title=module.title,
        skill_focus=module.skill_focus,
    )
    return bool(module.exercises)


def refresh_assignment_progress(assignment: MicrolearningAssignment) -> None:
    exercises = (assignment.module.exercises or []) if assignment.module else []
    total_exercises = len(exercises)
    completed_exercises = sum(
        1 for _, attempt in _response_entries(assignment) if attempt.get("is_completed")
    )

    if completed_exercises > 0 and assignment.started_at is None:
        assignment.started_at = datetime.utcnow()

    assignment.completed_exercises = completed_exercises
    assignment.completion_percentage = (
        round((completed_exercises / total_exercises) * 100, 2) if total_exercises else 0.0
    )

    if completed_exercises == 0:
        assignment.status = "in_progress" if assignment.started_at else "assigned"
        assignment.completed_at = None
        return

    if total_exercises and completed_exercises >= total_exercises:
        assignment.status = "certified" if assignment.certificate_id else "completed"
        if assignment.completed_at is None:
            assignment.completed_at = datetime.utcnow()
        return

    assignment.status = "in_progress"
    assignment.completed_at = None


def serialize_assignment_summary(assignment: MicrolearningAssignment) -> dict[str, Any]:
    module = assignment.module
    assessment_method = getattr(module, "assessment_method", None) if module else None
    topic_category = getattr(module, "topic_category", None) if module else None
    batch = getattr(assignment, "batch", None)
    trainee = getattr(assignment, "trainee", None)
    trainer = getattr(assignment, "trainer", None)
    certificate = getattr(assignment, "certificate", None)
    average_score = _assignment_average_score(assignment)
    is_passed = _assignment_is_passed(assignment)
    retake_count = _get_retake_count(assignment)
    can_retake = (
        assignment.status in {"completed", "certified"}
        and not is_passed
        and not assignment.certificate_id
    )
    return {
        "id": assignment.id,
        "module_id": assignment.module_id,
        "title": module.title if module else None,
        "description": module.description if module else None,
        "category": _feedback_category_value(module.category) if module else None,
        "module_type": normalize_module_type(getattr(module, "type", None)) if module else None,
        "skill_focus": module.skill_focus if module else None,
        "duration_minutes": module.duration_minutes if module else None,
        "passing_score": int(getattr(module, "passing_score", 0) or 0) if module else 0,
        "difficulty": _enum_value(module.difficulty) if module else None,
        "content_url": (module.content_url or module.audio_url) if module else None,
        "status": assignment.status,
        "completion_percentage": float(assignment.completion_percentage or 0.0),
        "average_score": average_score,
        "is_passed": is_passed,
        "can_retake": can_retake,
        "retake_count": retake_count,
        "attempt_number": _current_attempt_number(assignment),
        "exercise_count": len(module.exercises or []) if module else 0,
        "completed_exercises": int(assignment.completed_exercises or 0),
        "assigned_at": assignment.assigned_at,
        "started_at": assignment.started_at,
        "due_date": assignment.due_date,
        "completed_at": assignment.completed_at,
        "notes": assignment.notes,
        "is_mandatory": bool(assignment.is_mandatory),
        "certificate_id": assignment.certificate_id,
        "certificate_no": getattr(certificate, "certificate_no", None),
        "certificate_issued_at": getattr(certificate, "issued_at", None),
        "user_id": assignment.trainee_id,
        "trainee_name": getattr(trainee, "full_name", None),
        "module_title": module.title if module else None,
        "module_category": _feedback_category_value(module.category) if module else None,
        "topic_category_id": getattr(topic_category, "id", None) or getattr(module, "topic_category_id", None),
        "topic_category_name": getattr(topic_category, "name", None),
        "topic_category_slug": getattr(topic_category, "slug", None),
        "assessment_method_id": getattr(assessment_method, "id", None),
        "assessment_method_slug": getattr(assessment_method, "slug", None),
        "assessment_method_name": getattr(assessment_method, "name", None),
        "batch_id": assignment.batch_id,
        "batch_name": getattr(batch, "name", None),
        "batch_wave_number": getattr(batch, "wave_number", None),
        "batch_label": _format_batch_label(batch),
        "batch_lob": getattr(batch, "lob", None),
        "assigned_by": assignment.assigned_by,
        "assigned_by_name": getattr(trainer, "full_name", None),
    }


def serialize_assignment_detail(assignment: MicrolearningAssignment) -> dict[str, Any]:
    module = assignment.module
    media_state = get_module_media_state(module)
    exercises = []
    responses = dict(assignment.responses or {})

    for exercise in ((module.exercises or []) if module else []):
        attempt = responses.get(exercise.get("id"))
        exercise_type = exercise.get("type")
        exercises.append(
            {
                "id": exercise.get("id"),
                "title": exercise.get("title"),
                "type": exercise_type,
                "prompt": exercise.get("prompt"),
                "options": _exercise_options_for_current_attempt(assignment, exercise)
                if exercise_type == "multiple_choice"
                else (exercise.get("options") or []),
                "required_keywords": exercise.get("required_keywords") or [],
                "tips": exercise.get("tips") or [],
                "explanation": exercise.get("explanation"),
                "option_feedback": exercise.get("option_feedback") or {},
                "sample_answer": exercise.get("sample_answer"),
                "front": exercise.get("front"),
                "back": exercise.get("back"),
                "preview_seconds": exercise.get("preview_seconds"),
                "blank_seconds": exercise.get("blank_seconds"),
                "answer_time_limit_seconds": exercise.get("answer_time_limit_seconds"),
                "enable_stt": bool(exercise.get("enable_stt")),
                "timestamp": exercise.get("timestamp"),
                "attempt": attempt,
            }
        )

    return {
        "assignment": serialize_assignment_summary(assignment),
        "module": {
            "id": module.id if module else None,
            "module_type": normalize_module_type(getattr(module, "type", None)) if module else None,
            "category": _feedback_category_value(module.category) if module else None,
            "content_data": module.content_data or {} if module else {},
            "passing_score": int(getattr(module, "passing_score", 0) or 0) if module else 0,
            "content_url": (module.content_url or module.audio_url) if module else None,
            "audio_url": module.audio_url if module else None,
            "audio_transcript": module.audio_transcript if module else None,
            "audio_tts_url": module.audio_tts_url if module else None,
            "audio_duration_seconds": module.audio_duration_seconds if module else None,
            "audio_language": module.audio_language if module else None,
            "captions_url": (
                ((module.content_data or {}).get("captions_url")) if module else None
            ),
            "media_requirement": media_state.get("media_requirement"),
            "media_ready": bool(media_state.get("media_ready")),
            "media_status": media_state.get("media_status"),
        },
        "exercises": exercises,
    }


def evaluate_exercise_submission(
    exercise: dict[str, Any],
    *,
    response_text: Optional[str],
    selected_option: Optional[str],
    input_mode: Optional[str] = None,
    revealed_side: Optional[str] = None,
) -> dict[str, Any]:
    exercise_type = (exercise.get("type") or "").strip().lower()
    normalized_text = (response_text or "").strip()
    normalized_option = (selected_option or "").strip()

    if exercise_type == "multiple_choice":
        correct_option = (exercise.get("correct_option") or "").strip()
        option_feedback = dict(exercise.get("option_feedback") or {})
        score = 100.0 if normalized_option and normalized_option == correct_option else 0.0
        feedback = option_feedback.get(normalized_option) or exercise.get("explanation") or (
            "Correct answer selected."
            if score == 100.0
            else f"The strongest answer is: {correct_option or 'not available'}."
        )
        return {
            "id": exercise.get("id") or _slug(exercise.get("title") or "exercise"),
            "response_text": response_text,
            "selected_option": selected_option,
            "input_mode": input_mode or "selection",
            "score": score,
            "feedback": feedback,
            "is_completed": bool(normalized_option),
            "submitted_at": datetime.utcnow().isoformat(),
        }

    if exercise_type == "flashcard_recall":
        revealed = (revealed_side or "").strip().lower()
        front = (exercise.get("front") or "").strip()
        back = (exercise.get("back") or "").strip()
        expected_answer = front if revealed == "front" else back if revealed == "back" else ""
        is_correct = bool(expected_answer) and _normalize_exact_text(normalized_text) == _normalize_exact_text(expected_answer)
        feedback = (
            "Correct. You recalled the selected side exactly."
            if is_correct
            else "Not yet. Review both sides again, then type the selected side exactly to continue."
        )
        return {
            "id": exercise.get("id") or _slug(exercise.get("title") or "exercise"),
            "response_text": response_text,
            "selected_option": selected_option,
            "input_mode": input_mode or "typed",
            "revealed_side": revealed or None,
            "score": 100.0 if is_correct else 0.0,
            "feedback": feedback,
            "expected_answer_length": len(expected_answer),
            "is_completed": is_correct,
            "submitted_at": datetime.utcnow().isoformat(),
        }

    required_keywords = _derive_required_keywords(exercise)
    response_lower = normalized_text.lower()
    matched_keywords = [keyword for keyword in required_keywords if keyword in response_lower]
    missing_keywords = [keyword for keyword in required_keywords if keyword not in matched_keywords]
    keyword_score = (
        round((len(matched_keywords) / len(required_keywords)) * 100, 2)
        if required_keywords
        else 0.0
    )

    sample_answer = (exercise.get("sample_answer") or "").strip()
    response_tokens = set(_tokenize_text(normalized_text))
    sample_tokens = set(_tokenize_text(sample_answer))
    similarity_score = (
        round((len(response_tokens & sample_tokens) / len(sample_tokens)) * 100, 2)
        if sample_tokens
        else 0.0
    )

    if required_keywords and sample_tokens:
        score = round(keyword_score * 0.7 + similarity_score * 0.3, 2)
    elif required_keywords:
        score = keyword_score
    elif sample_tokens:
        score = similarity_score
    else:
        score = 100.0 if normalized_text else 0.0

    if required_keywords or sample_tokens:
        if missing_keywords:
            feedback = (
                "Matched trainer expectations: "
                + ", ".join(matched_keywords or ["none"])
                + ". Missing focus terms: "
                + ", ".join(missing_keywords)
                + "."
            )
        elif score >= 85:
            feedback = "Strong response. Your answer closely matches the trainer's expected answer."
        elif score >= 60:
            feedback = "Partially correct. Review the trainer sample answer and include the missing key ideas next time."
        else:
            feedback = "Your answer needs more of the trainer's key points. Review the sample answer and try again if needed."
    else:
        feedback = "Response saved successfully."

    return {
        "id": exercise.get("id") or _slug(exercise.get("title") or "exercise"),
        "response_text": response_text,
        "selected_option": selected_option,
        "input_mode": input_mode or "typed",
        "matched_keywords": matched_keywords,
        "missing_keywords": missing_keywords,
        "score": score,
        "feedback": feedback,
        "sample_similarity": similarity_score,
        "is_completed": bool(normalized_text),
        "submitted_at": datetime.utcnow().isoformat(),
    }
