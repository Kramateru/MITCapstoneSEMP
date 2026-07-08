from __future__ import annotations

import random
import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from ..models import (
    FeedbackType,
    MicrolearningAssessmentMethod,
    MicrolearningAssignment,
    MicrolearningFlashcardResult,
    MicrolearningModule,
    ScenarioDifficulty,
)
from .gemini_evaluation import (
    score_microlearning_open_response,
    summarize_microlearning_assignment_performance,
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
MICROLEARNING_MULTIPLE_CHOICE_POINTS = 2.0
MICROLEARNING_OPEN_ENDED_POINTS = 10.0
MICROLEARNING_FLASHCARD_POINTS = 10.0
MICROLEARNING_FLASHCARD_STUDY_SECONDS = 30
MICROLEARNING_FLASHCARD_BLANK_SECONDS = 0
MICROLEARNING_FLASHCARD_ANSWER_SECONDS = 60
MICROLEARNING_FLASHCARD_RUNTIME_KEY = "flashcard_runtime"
MICROLEARNING_RESULT_SUMMARY_KEY = "__result_summary__"


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


_SPECIAL_RESPONSE_KEYS = {"__meta__", MICROLEARNING_RESULT_SUMMARY_KEY}
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


def _replace_assignment_meta(assignment: MicrolearningAssignment, meta: dict[str, Any]) -> None:
    responses = dict(assignment.responses or {})
    if meta:
        responses["__meta__"] = meta
    else:
        responses.pop("__meta__", None)
    assignment.responses = responses


def _assignment_result_summary(assignment: MicrolearningAssignment) -> dict[str, Any]:
    responses = dict(assignment.responses or {})
    summary = responses.get(MICROLEARNING_RESULT_SUMMARY_KEY)
    return dict(summary) if isinstance(summary, dict) else {}


def _set_assignment_result_summary(assignment: MicrolearningAssignment, summary: dict[str, Any]) -> None:
    responses = dict(assignment.responses or {})
    if summary:
        responses[MICROLEARNING_RESULT_SUMMARY_KEY] = summary
    else:
        responses.pop(MICROLEARNING_RESULT_SUMMARY_KEY, None)
    assignment.responses = responses


def _parse_datetime_value(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if not value:
        return None

    text_value = str(value).strip()
    if not text_value:
        return None

    try:
        return datetime.fromisoformat(text_value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _seconds_remaining(deadline: datetime, now: datetime) -> int:
    return max(0, int((deadline - now).total_seconds() + 0.999))


def _is_flashcard_module(module: Optional[MicrolearningModule]) -> bool:
    return normalize_module_type(getattr(module, "type", None)) == "flashcard"


def _flashcard_exercises(assignment: MicrolearningAssignment) -> list[dict[str, Any]]:
    return [
        dict(exercise or {})
        for exercise in ((assignment.module.exercises or []) if assignment.module else [])
        if str((exercise or {}).get("type") or "").strip().lower() == "flashcard_recall"
    ]


def _normalized_flashcard_tips(study_seconds: int, answer_seconds: int) -> list[str]:
    return [
        f"Study both sides during the {study_seconds}-second study window.",
        f"The prompt stays visible while the answer auto-saves after {answer_seconds} seconds.",
    ]


def _normalize_flashcard_exercise_payloads(
    exercises: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], bool]:
    normalized_exercises: list[dict[str, Any]] = []
    did_change = False

    for exercise in exercises:
        exercise_type = str((exercise or {}).get("type") or "").strip().lower()
        if exercise_type != "flashcard_recall":
            normalized_exercises.append(exercise)
            continue

        normalized = dict(exercise or {})
        normalized["study_time_seconds"] = MICROLEARNING_FLASHCARD_STUDY_SECONDS
        normalized["preview_seconds"] = MICROLEARNING_FLASHCARD_STUDY_SECONDS
        normalized["blank_seconds"] = MICROLEARNING_FLASHCARD_BLANK_SECONDS
        normalized["answer_time_seconds"] = MICROLEARNING_FLASHCARD_ANSWER_SECONDS
        normalized["answer_time_limit_seconds"] = MICROLEARNING_FLASHCARD_ANSWER_SECONDS
        normalized["tips"] = _normalized_flashcard_tips(
            MICROLEARNING_FLASHCARD_STUDY_SECONDS,
            MICROLEARNING_FLASHCARD_ANSWER_SECONDS,
        )
        normalized_exercises.append(normalized)
        if normalized != exercise:
            did_change = True

    return normalized_exercises, did_change


def _flashcard_attempt_status_counts(assignment: MicrolearningAssignment) -> dict[str, int]:
    counts = {"answered": 0, "timed_out": 0, "unanswered": 0}
    flashcard_ids = {str(exercise.get("id")) for exercise in _flashcard_exercises(assignment) if exercise.get("id")}
    for exercise_id, attempt in _response_entries(assignment):
        if str(exercise_id) not in flashcard_ids:
            continue
        status = str(attempt.get("status") or "").strip().lower()
        if status in counts:
            counts[status] += 1
    return counts


def _flashcard_runtime_meta(assignment: MicrolearningAssignment) -> dict[str, Any]:
    meta = _assignment_meta(assignment)
    runtime = meta.get(MICROLEARNING_FLASHCARD_RUNTIME_KEY)
    return dict(runtime) if isinstance(runtime, dict) else {}


def _set_flashcard_runtime_meta(assignment: MicrolearningAssignment, runtime: Optional[dict[str, Any]]) -> None:
    meta = _assignment_meta(assignment)
    if runtime:
        meta[MICROLEARNING_FLASHCARD_RUNTIME_KEY] = runtime
    else:
        meta.pop(MICROLEARNING_FLASHCARD_RUNTIME_KEY, None)
    _replace_assignment_meta(assignment, meta)


def _flashcard_completion_counts(
    exercises: list[dict[str, Any]],
    responses: dict[str, Any],
) -> tuple[int, int]:
    completed_cards = 0
    for exercise in exercises:
        exercise_id = str(exercise.get("id") or "")
        attempt = responses.get(exercise_id)
        if isinstance(attempt, dict) and attempt.get("is_completed"):
            completed_cards += 1
    total_cards = len(exercises)
    return completed_cards, total_cards


def _first_incomplete_flashcard_index(
    exercises: list[dict[str, Any]],
    responses: dict[str, Any],
    *,
    start_index: int = 0,
) -> Optional[int]:
    for index in range(max(0, start_index), len(exercises)):
        exercise_id = str(exercises[index].get("id") or "")
        attempt = responses.get(exercise_id)
        if not (isinstance(attempt, dict) and attempt.get("is_completed")):
            return index
    return None


def _build_flashcard_runtime_view(
    assignment: MicrolearningAssignment,
    *,
    exercises: list[dict[str, Any]],
    current_index: Optional[int],
    study_started_at: Optional[datetime],
    now: Optional[datetime] = None,
    phase_override: Optional[str] = None,
) -> dict[str, Any]:
    now = now or datetime.utcnow()
    responses = dict(assignment.responses or {})
    completed_cards, total_cards = _flashcard_completion_counts(exercises, responses)
    progress_percentage = round((completed_cards / total_cards) * 100, 2) if total_cards else 0.0

    if current_index is None or current_index < 0 or current_index >= total_cards:
        return {
            "enabled": True,
            "phase": phase_override or ("completed" if total_cards else "not_started"),
            "current_exercise_id": None,
            "current_card_index": None,
            "current_card_number": None,
            "current_card_title": None,
            "current_prompt_side": None,
            "study_time_seconds": MICROLEARNING_FLASHCARD_STUDY_SECONDS,
            "answer_time_seconds": MICROLEARNING_FLASHCARD_ANSWER_SECONDS,
            "study_started_at": None,
            "answer_started_at": None,
            "answer_deadline_at": None,
            "phase_started_at": None,
            "phase_deadline_at": None,
            "seconds_remaining": 0,
            "phase_duration_seconds": 0,
            "completed_cards": completed_cards,
            "remaining_cards": max(0, total_cards - completed_cards),
            "total_cards": total_cards,
            "progress_percentage": progress_percentage,
        }

    current_exercise = exercises[current_index]
    study_anchor = study_started_at or now
    answer_started_at = study_anchor + timedelta(seconds=MICROLEARNING_FLASHCARD_STUDY_SECONDS)
    answer_deadline_at = answer_started_at + timedelta(seconds=MICROLEARNING_FLASHCARD_ANSWER_SECONDS)

    if phase_override in {"not_started", "completed"}:
        return {
            "enabled": True,
            "phase": phase_override,
            "current_exercise_id": current_exercise.get("id"),
            "current_card_index": current_index,
            "current_card_number": current_index + 1,
            "current_card_title": current_exercise.get("title"),
            "current_prompt_side": "back",
            "study_time_seconds": MICROLEARNING_FLASHCARD_STUDY_SECONDS,
            "answer_time_seconds": MICROLEARNING_FLASHCARD_ANSWER_SECONDS,
            "study_started_at": None,
            "answer_started_at": None,
            "answer_deadline_at": None,
            "phase_started_at": None,
            "phase_deadline_at": None,
            "seconds_remaining": 0,
            "phase_duration_seconds": 0,
            "completed_cards": completed_cards,
            "remaining_cards": max(0, total_cards - completed_cards),
            "total_cards": total_cards,
            "progress_percentage": progress_percentage,
        }

    if phase_override:
        phase = phase_override
    elif now < answer_started_at:
        phase = "study"
    elif now < answer_deadline_at:
        phase = "answer"
    else:
        phase = "expired"

    if phase == "study":
        phase_started_at = study_anchor
        phase_deadline_at = answer_started_at
        phase_duration_seconds = MICROLEARNING_FLASHCARD_STUDY_SECONDS
    else:
        phase_started_at = answer_started_at
        phase_deadline_at = answer_deadline_at
        phase_duration_seconds = MICROLEARNING_FLASHCARD_ANSWER_SECONDS

    return {
        "enabled": True,
        "phase": phase,
        "current_exercise_id": current_exercise.get("id"),
        "current_card_index": current_index,
        "current_card_number": current_index + 1,
        "current_card_title": current_exercise.get("title"),
        "current_prompt_side": "back",
        "study_time_seconds": MICROLEARNING_FLASHCARD_STUDY_SECONDS,
        "answer_time_seconds": MICROLEARNING_FLASHCARD_ANSWER_SECONDS,
        "study_started_at": study_anchor.isoformat(),
        "answer_started_at": answer_started_at.isoformat(),
        "answer_deadline_at": answer_deadline_at.isoformat(),
        "phase_started_at": phase_started_at.isoformat(),
        "phase_deadline_at": phase_deadline_at.isoformat(),
        "seconds_remaining": _seconds_remaining(phase_deadline_at, now),
        "phase_duration_seconds": phase_duration_seconds,
        "completed_cards": completed_cards,
        "remaining_cards": max(0, total_cards - completed_cards),
        "total_cards": total_cards,
        "progress_percentage": progress_percentage,
    }


def _upsert_flashcard_result(
    db: Session,
    assignment: MicrolearningAssignment,
    exercise: dict[str, Any],
    attempt: dict[str, Any],
    *,
    flashcard_index: int,
    study_started_at: datetime,
) -> None:
    answer_started_at = study_started_at + timedelta(seconds=MICROLEARNING_FLASHCARD_STUDY_SECONDS)
    answer_deadline_at = answer_started_at + timedelta(seconds=MICROLEARNING_FLASHCARD_ANSWER_SECONDS)
    answered_at = _parse_datetime_value(
        attempt.get("answered_at") or attempt.get("submitted_at")
    ) or answer_deadline_at
    attempt_number = _current_attempt_number(assignment)
    flashcard_id = str(exercise.get("id") or "")

    result = (
        db.query(MicrolearningFlashcardResult)
        .filter(
            MicrolearningFlashcardResult.assignment_id == assignment.id,
            MicrolearningFlashcardResult.flashcard_id == flashcard_id,
            MicrolearningFlashcardResult.attempt_number == attempt_number,
        )
        .first()
    )
    if not result:
        result = MicrolearningFlashcardResult(
            assignment_id=assignment.id,
            module_id=assignment.module_id,
            trainee_id=assignment.trainee_id,
            flashcard_id=flashcard_id,
            attempt_number=attempt_number,
        )
        db.add(result)

    result.module_id = assignment.module_id
    result.trainee_id = assignment.trainee_id
    result.flashcard_order = flashcard_index + 1
    result.prompt = str(exercise.get("prompt") or "").strip() or None
    result.front_text = str(exercise.get("front") or "").strip() or None
    result.back_text = str(exercise.get("back") or "").strip() or None
    result.answer_text = str(attempt.get("response_text") or "").strip() or None
    result.selected_choice = str(attempt.get("selected_option") or "").strip() or None
    result.revealed_side = str(attempt.get("revealed_side") or "").strip() or None
    result.study_time_seconds = int(
        attempt.get("study_time_seconds") or MICROLEARNING_FLASHCARD_STUDY_SECONDS
    )
    result.answer_time_seconds = int(
        attempt.get("answer_time_seconds") or MICROLEARNING_FLASHCARD_ANSWER_SECONDS
    )
    result.status = str(attempt.get("status") or "unanswered").strip().lower() or "unanswered"
    result.score = float(attempt.get("score") or 0.0)
    result.points_earned = float(attempt.get("points_earned") or 0.0)
    result.points_possible = float(attempt.get("points_possible") or 0.0)
    result.started_study_at = study_started_at
    result.answer_started_at = answer_started_at
    result.answer_deadline_at = answer_deadline_at
    result.answered_at = answered_at


def persist_flashcard_attempt_result(
    db: Session,
    assignment: MicrolearningAssignment,
    *,
    exercise_id: str,
    attempt: dict[str, Any],
    study_started_at: datetime,
) -> None:
    exercises = _flashcard_exercises(assignment)
    for index, exercise in enumerate(exercises):
        if str(exercise.get("id") or "") == str(exercise_id or ""):
            _upsert_flashcard_result(
                db,
                assignment,
                exercise,
                attempt,
                flashcard_index=index,
                study_started_at=study_started_at,
            )
            return


def update_flashcard_assignment_runtime_progress(
    assignment: MicrolearningAssignment,
    *,
    exercise_id: str,
    draft_response_text: Optional[str] = None,
    revealed_side: Optional[str] = None,
    now: Optional[datetime] = None,
) -> Optional[dict[str, Any]]:
    if not _is_flashcard_module(assignment.module):
        return None

    now = now or datetime.utcnow()
    exercises = _flashcard_exercises(assignment)
    responses = dict(assignment.responses or {})
    first_incomplete_index = _first_incomplete_flashcard_index(exercises, responses)
    if first_incomplete_index is None:
        _set_flashcard_runtime_meta(assignment, None)
        return get_flashcard_session_state(assignment, now=now)

    target_index = first_incomplete_index
    for index, exercise in enumerate(exercises):
        if str(exercise.get("id") or "") == str(exercise_id or ""):
            target_index = index
            break

    if target_index != first_incomplete_index:
        target_index = first_incomplete_index

    target_exercise_id = str(exercises[target_index].get("id") or "")
    runtime = _flashcard_runtime_meta(assignment)
    existing_study_started_at = _parse_datetime_value(runtime.get("study_started_at"))
    next_runtime = {
        "current_exercise_id": target_exercise_id,
        "current_index": target_index,
        "study_started_at": (
            existing_study_started_at.isoformat()
            if existing_study_started_at and str(runtime.get("current_exercise_id") or "") == target_exercise_id
            else now.isoformat()
        ),
        "updated_at": now.isoformat(),
        "draft_response_text": (
            str(draft_response_text)
            if draft_response_text is not None
            else str(runtime.get("draft_response_text") or "")
        ),
        "revealed_side": (
            str(revealed_side or "").strip().lower()
            or str(runtime.get("revealed_side") or "").strip().lower()
            or "back"
        ),
    }
    _set_flashcard_runtime_meta(assignment, next_runtime)
    return get_flashcard_session_state(assignment, now=now)


def get_flashcard_session_state(
    assignment: MicrolearningAssignment,
    *,
    now: Optional[datetime] = None,
) -> Optional[dict[str, Any]]:
    if not _is_flashcard_module(assignment.module):
        return None

    now = now or datetime.utcnow()
    exercises = _flashcard_exercises(assignment)
    if not exercises:
        return {
            "enabled": True,
            "phase": "not_started",
            "current_exercise_id": None,
            "current_card_index": None,
            "current_card_number": None,
            "current_card_title": None,
            "current_prompt_side": None,
            "revealed_side": None,
            "draft_response_text": "",
            "study_time_seconds": MICROLEARNING_FLASHCARD_STUDY_SECONDS,
            "answer_time_seconds": MICROLEARNING_FLASHCARD_ANSWER_SECONDS,
            "study_started_at": None,
            "answer_started_at": None,
            "answer_deadline_at": None,
            "phase_started_at": None,
            "phase_deadline_at": None,
            "seconds_remaining": 0,
            "phase_duration_seconds": 0,
            "completed_cards": 0,
            "remaining_cards": 0,
            "total_cards": 0,
            "progress_percentage": 0.0,
        }

    responses = dict(assignment.responses or {})
    first_incomplete_index = _first_incomplete_flashcard_index(exercises, responses)
    if assignment.started_at is None:
        session_state = _build_flashcard_runtime_view(
            assignment,
            exercises=exercises,
            current_index=first_incomplete_index,
            study_started_at=None,
            now=now,
            phase_override="not_started",
        )
        session_state["revealed_side"] = "back"
        session_state["draft_response_text"] = ""
        return session_state

    if first_incomplete_index is None:
        session_state = _build_flashcard_runtime_view(
            assignment,
            exercises=exercises,
            current_index=None,
            study_started_at=None,
            now=now,
            phase_override="completed",
        )
        session_state["revealed_side"] = None
        session_state["draft_response_text"] = ""
        return session_state

    runtime = _flashcard_runtime_meta(assignment)
    current_exercise_id = str(runtime.get("current_exercise_id") or "")
    current_index = None
    for index, exercise in enumerate(exercises):
        if str(exercise.get("id") or "") == current_exercise_id:
            current_index = index
            break

    if current_index is None:
        current_index = first_incomplete_index

    study_started_at = _parse_datetime_value(runtime.get("study_started_at")) or now
    session_state = _build_flashcard_runtime_view(
        assignment,
        exercises=exercises,
        current_index=current_index,
        study_started_at=study_started_at,
        now=now,
    )
    session_state["revealed_side"] = str(runtime.get("revealed_side") or "back").strip().lower() or "back"
    session_state["draft_response_text"] = str(runtime.get("draft_response_text") or "")
    return session_state


def start_flashcard_assignment_runtime(
    assignment: MicrolearningAssignment,
    *,
    now: Optional[datetime] = None,
) -> Optional[dict[str, Any]]:
    if not _is_flashcard_module(assignment.module):
        return None

    now = now or datetime.utcnow()
    exercises = _flashcard_exercises(assignment)
    responses = dict(assignment.responses or {})
    first_incomplete_index = _first_incomplete_flashcard_index(exercises, responses)
    if first_incomplete_index is None:
        _set_flashcard_runtime_meta(assignment, None)
        return get_flashcard_session_state(assignment, now=now)

    has_completed_cards = any(
        isinstance(responses.get(str(exercise.get("id") or "")), dict)
        and responses.get(str(exercise.get("id") or "")).get("is_completed")
        for exercise in exercises
    )
    start_anchor = (
        assignment.started_at
        if assignment.started_at is not None and not has_completed_cards
        else now
    )
    _set_flashcard_runtime_meta(
        assignment,
        {
            "current_exercise_id": exercises[first_incomplete_index].get("id"),
            "current_index": first_incomplete_index,
            "study_started_at": start_anchor.isoformat(),
            "updated_at": now.isoformat(),
            "draft_response_text": "",
            "revealed_side": "back",
        },
    )
    return get_flashcard_session_state(assignment, now=now)


def advance_flashcard_assignment_runtime(
    assignment: MicrolearningAssignment,
    *,
    next_start_at: datetime,
) -> Optional[dict[str, Any]]:
    if not _is_flashcard_module(assignment.module):
        return None

    exercises = _flashcard_exercises(assignment)
    responses = dict(assignment.responses or {})
    next_index = _first_incomplete_flashcard_index(exercises, responses)
    if next_index is None:
        _set_flashcard_runtime_meta(assignment, None)
        return get_flashcard_session_state(assignment, now=next_start_at)

    _set_flashcard_runtime_meta(
        assignment,
        {
            "current_exercise_id": exercises[next_index].get("id"),
            "current_index": next_index,
            "study_started_at": next_start_at.isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "draft_response_text": "",
            "revealed_side": "back",
        },
    )
    return get_flashcard_session_state(assignment, now=next_start_at)


def sync_flashcard_assignment_runtime(
    db: Session,
    assignment: MicrolearningAssignment,
    *,
    now: Optional[datetime] = None,
) -> bool:
    if not _is_flashcard_module(assignment.module):
        return False

    now = now or datetime.utcnow()
    exercises = _flashcard_exercises(assignment)
    if not exercises:
        _set_flashcard_runtime_meta(assignment, None)
        return False

    if assignment.started_at is None:
        _set_flashcard_runtime_meta(assignment, None)
        return False

    responses = dict(assignment.responses or {})
    first_incomplete_index = _first_incomplete_flashcard_index(exercises, responses)
    if first_incomplete_index is None:
        _set_flashcard_runtime_meta(assignment, None)
        refresh_assignment_progress(assignment)
        return False

    runtime = _flashcard_runtime_meta(assignment)
    current_exercise_id = str(runtime.get("current_exercise_id") or "")
    current_index = None
    for index, exercise in enumerate(exercises):
        if str(exercise.get("id") or "") == current_exercise_id:
            current_index = index
            break

    did_change = False
    study_started_at = _parse_datetime_value(runtime.get("study_started_at"))

    if current_index is None:
        seed_time = assignment.started_at if first_incomplete_index == 0 else now
        _set_flashcard_runtime_meta(
            assignment,
            {
                "current_exercise_id": exercises[first_incomplete_index].get("id"),
                "current_index": first_incomplete_index,
                "study_started_at": seed_time.isoformat(),
                "updated_at": now.isoformat(),
                "draft_response_text": "",
                "revealed_side": "back",
            },
        )
        responses = dict(assignment.responses or {})
        current_index = first_incomplete_index
        study_started_at = seed_time
        did_change = True

    if current_index != first_incomplete_index and first_incomplete_index is not None:
        current_index = first_incomplete_index
        study_started_at = now
        _set_flashcard_runtime_meta(
            assignment,
            {
                "current_exercise_id": exercises[current_index].get("id"),
                "current_index": current_index,
                "study_started_at": study_started_at.isoformat(),
                "updated_at": now.isoformat(),
                "draft_response_text": "",
                "revealed_side": "back",
            },
        )
        responses = dict(assignment.responses or {})
        did_change = True

    if study_started_at is None:
        study_started_at = now
        _set_flashcard_runtime_meta(
            assignment,
            {
                "current_exercise_id": exercises[current_index].get("id"),
                "current_index": current_index,
                "study_started_at": study_started_at.isoformat(),
                "updated_at": now.isoformat(),
                "draft_response_text": "",
                "revealed_side": "back",
            },
        )
        responses = dict(assignment.responses or {})
        did_change = True

    while current_index is not None and current_index < len(exercises):
        current_exercise = exercises[current_index]
        answer_deadline_at = study_started_at + timedelta(
            seconds=MICROLEARNING_FLASHCARD_STUDY_SECONDS + MICROLEARNING_FLASHCARD_ANSWER_SECONDS
        )
        if now < answer_deadline_at:
            break

        exercise_id = str(current_exercise.get("id") or "")
        current_attempt = responses.get(exercise_id)
        if not (isinstance(current_attempt, dict) and current_attempt.get("is_completed")):
            draft_response_text = str(runtime.get("draft_response_text") or "")
            revealed_side = str(runtime.get("revealed_side") or "back").strip().lower() or "back"
            timed_out_attempt = evaluate_exercise_submission(
                current_exercise,
                response_text=draft_response_text or None,
                selected_option=None,
                input_mode="typed",
                revealed_side=revealed_side,
                study_time_seconds=MICROLEARNING_FLASHCARD_STUDY_SECONDS,
                answer_time_seconds=MICROLEARNING_FLASHCARD_ANSWER_SECONDS,
                answer_status="timed_out" if draft_response_text.strip() else "unanswered",
                answered_at=answer_deadline_at,
                timer_expired=True,
                mark_completed=True,
            )
            responses[exercise_id] = timed_out_attempt
            assignment.responses = responses
            responses = dict(assignment.responses or {})
            _upsert_flashcard_result(
                db,
                assignment,
                current_exercise,
                timed_out_attempt,
                flashcard_index=current_index,
                study_started_at=study_started_at,
            )
            did_change = True

        next_index = _first_incomplete_flashcard_index(exercises, responses, start_index=current_index + 1)
        if next_index is None:
            _set_flashcard_runtime_meta(assignment, None)
            refresh_assignment_progress(assignment)
            return True

        current_index = next_index
        study_started_at = answer_deadline_at
        _set_flashcard_runtime_meta(
            assignment,
            {
                "current_exercise_id": exercises[current_index].get("id"),
                "current_index": current_index,
                "study_started_at": study_started_at.isoformat(),
                "updated_at": now.isoformat(),
                "draft_response_text": "",
                "revealed_side": "back",
            },
        )
        responses = dict(assignment.responses or {})
        did_change = True

    refresh_assignment_progress(assignment)
    return did_change


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


def _exercise_point_value(exercise: dict[str, Any]) -> float:
    exercise_type = str(exercise.get("type") or "").strip().lower()
    if exercise_type == "multiple_choice":
        return MICROLEARNING_MULTIPLE_CHOICE_POINTS
    if exercise_type == "flashcard_recall":
        return MICROLEARNING_FLASHCARD_POINTS
    return MICROLEARNING_OPEN_ENDED_POINTS


def _normalized_percentage_from_points(points_earned: float, points_possible: float) -> float:
    if points_possible <= 0:
        return 0.0
    return round((points_earned / points_possible) * 100, 2)


def _coerce_attempt_points(
    exercise: dict[str, Any],
    attempt: dict[str, Any],
) -> tuple[float, float]:
    points_possible = _exercise_point_value(exercise)
    if not attempt.get("is_completed"):
        return 0.0, points_possible

    raw_points_earned = attempt.get("points_earned")
    try:
        if raw_points_earned is not None:
            points_earned = float(raw_points_earned)
            return max(0.0, min(points_possible, points_earned)), points_possible
    except (TypeError, ValueError):
        pass

    try:
        legacy_score = float(attempt.get("score") or 0.0)
    except (TypeError, ValueError):
        legacy_score = 0.0

    legacy_points = round((max(0.0, min(100.0, legacy_score)) / 100.0) * points_possible, 2)
    return legacy_points, points_possible


def _exercise_result_label(
    exercise: dict[str, Any],
    attempt: dict[str, Any],
) -> str:
    if not attempt.get("is_completed"):
        return "incorrect"

    exercise_type = str(exercise.get("type") or "").strip().lower()
    if exercise_type == "multiple_choice":
        correct_option = str(exercise.get("correct_option") or "").strip()
        selected_option = str(attempt.get("selected_option") or "").strip()
        return "correct" if correct_option and selected_option == correct_option else "incorrect"

    response_text = str(attempt.get("response_text") or "").strip()
    return "needs_review" if response_text else "incorrect"


def _exercise_correct_answer(
    exercise: dict[str, Any],
    attempt: Optional[dict[str, Any]] = None,
) -> str:
    exercise_type = str(exercise.get("type") or "").strip().lower()
    if exercise_type == "multiple_choice":
        return str(exercise.get("correct_option") or "").strip()
    if exercise_type == "flashcard_recall":
        revealed_side = str((attempt or {}).get("revealed_side") or "").strip().lower()
        if revealed_side == "front":
            return str(exercise.get("front") or "").strip()
        if revealed_side == "back":
            return str(exercise.get("back") or "").strip()
        return str(exercise.get("sample_answer") or exercise.get("back") or exercise.get("front") or "").strip()
    return str(exercise.get("sample_answer") or "").strip()


def build_assignment_result_breakdown(
    assignment: MicrolearningAssignment,
) -> list[dict[str, Any]]:
    exercises = (assignment.module.exercises or []) if assignment.module else []
    responses = dict(assignment.responses or {})
    breakdown: list[dict[str, Any]] = []

    for index, exercise in enumerate(exercises):
        exercise_id = str(exercise.get("id") or "")
        attempt = responses.get(exercise_id)
        if not isinstance(attempt, dict):
            continue

        points_earned, points_possible = _coerce_attempt_points(exercise, attempt)
        trainee_answer = str(attempt.get("selected_option") or attempt.get("response_text") or "").strip()
        breakdown.append(
            {
                "question_number": index + 1,
                "question_id": exercise_id,
                "title": str(exercise.get("title") or "").strip(),
                "prompt": str(exercise.get("prompt") or "").strip(),
                "type": str(exercise.get("type") or "").strip().lower(),
                "trainee_answer": trainee_answer,
                "correct_answer": str(attempt.get("correct_answer") or _exercise_correct_answer(exercise, attempt)).strip(),
                "question_result": str(attempt.get("result_status") or _exercise_result_label(exercise, attempt)).strip().lower(),
                "score": float(attempt.get("score") or 0.0),
                "points_earned": points_earned,
                "points_possible": points_possible,
                "feedback": str(attempt.get("feedback") or "").strip(),
                "submitted_at": attempt.get("submitted_at"),
                "matched_keywords": [
                    str(keyword or "").strip()
                    for keyword in (attempt.get("matched_keywords") or [])
                    if str(keyword or "").strip()
                ],
                "missing_keywords": [
                    str(keyword or "").strip()
                    for keyword in (attempt.get("missing_keywords") or [])
                    if str(keyword or "").strip()
                ],
            }
        )

    return breakdown


def ensure_assignment_result_summary(
    assignment: MicrolearningAssignment,
) -> dict[str, Any]:
    module = getattr(assignment, "module", None)
    exercises = (module.exercises or []) if module else []
    if not module or not exercises:
        return {}

    if int(assignment.completed_exercises or 0) < len(exercises):
        return {}

    attempt_number = _current_attempt_number(assignment)
    existing_summary = _assignment_result_summary(assignment)
    if existing_summary.get("attempt_number") == attempt_number:
        return existing_summary

    breakdown = build_assignment_result_breakdown(assignment)
    percentage_score = _assignment_average_score(assignment)
    points_earned, points_possible = _assignment_point_totals(assignment)
    passing_score = float(getattr(module, "passing_score", 0) or 0)
    passed = _assignment_is_passed(assignment)
    ai_summary = summarize_microlearning_assignment_performance(
        module_title=str(getattr(module, "title", None) or "Microlearning Module"),
        module_type=str(normalize_module_type(getattr(module, "type", None)) or "module"),
        percentage_score=percentage_score,
        passing_score=passing_score,
        passed=passed,
        breakdown=breakdown,
    )

    summary = {
        "attempt_number": attempt_number,
        "module_id": getattr(module, "id", None),
        "module_title": getattr(module, "title", None),
        "module_type": normalize_module_type(getattr(module, "type", None)),
        "total_score": points_earned,
        "points_earned": points_earned,
        "points_possible": points_possible,
        "percentage_score": percentage_score,
        "passing_score": passing_score,
        "status": "passed" if passed else "failed",
        "submitted_at": (
            assignment.completed_at.isoformat()
            if isinstance(assignment.completed_at, datetime)
            else datetime.utcnow().isoformat()
        ),
        "overall_summary": str(ai_summary.get("overallSummary") or "").strip(),
        "strengths": [str(item or "").strip() for item in (ai_summary.get("strengths") or []) if str(item or "").strip()],
        "weak_areas": [str(item or "").strip() for item in (ai_summary.get("weakAreas") or []) if str(item or "").strip()],
        "improvement_opportunities": [
            str(item or "").strip()
            for item in (ai_summary.get("improvementOpportunities") or [])
            if str(item or "").strip()
        ],
        "recommended_next_steps": [
            str(item or "").strip()
            for item in (ai_summary.get("recommendedNextSteps") or [])
            if str(item or "").strip()
        ],
        "explanation": str(ai_summary.get("explanation") or "").strip(),
        "provider": str(ai_summary.get("provider") or "fallback"),
        "breakdown": breakdown,
    }
    _set_assignment_result_summary(assignment, summary)
    return summary


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
    exercises_by_id = {
        str(exercise.get("id")): exercise
        for exercise in ((assignment.module.exercises or []) if assignment.module else [])
        if exercise.get("id")
    }
    points_earned = 0.0
    points_possible = 0.0
    for exercise_id, attempt in _response_entries(assignment):
        if not attempt.get("is_completed"):
            continue
        exercise = exercises_by_id.get(str(exercise_id))
        if not exercise:
            continue
        earned, possible = _coerce_attempt_points(exercise, attempt)
        points_earned += earned
        points_possible += possible

    if points_possible <= 0:
        return 0.0
    return _normalized_percentage_from_points(points_earned, points_possible)


def _assignment_point_totals(assignment: MicrolearningAssignment) -> tuple[float, float]:
    exercises_by_id = {
        str(exercise.get("id")): exercise
        for exercise in ((assignment.module.exercises or []) if assignment.module else [])
        if exercise.get("id")
    }
    points_earned = 0.0
    points_possible = 0.0
    for exercise_id, attempt in _response_entries(assignment):
        if not attempt.get("is_completed"):
            continue
        exercise = exercises_by_id.get(str(exercise_id))
        if not exercise:
            continue
        earned, possible = _coerce_attempt_points(exercise, attempt)
        points_earned += earned
        points_possible += possible

    return round(points_earned, 2), round(points_possible, 2)


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

    did_change = False
    if module.exercises:
        existing_exercises = list(module.exercises or [])
        normalized_exercises, normalized_changed = _normalize_flashcard_exercise_payloads(existing_exercises)
        if normalized_changed:
            module.exercises = normalized_exercises
            did_change = True
        return did_change

    module.exercises = build_type_specific_exercises(
        normalize_module_type(getattr(module, "type", None)),
        module.content_data or {},
        title=module.title,
        skill_focus=module.skill_focus,
    )
    generated_exercises = list(module.exercises or [])
    normalized_exercises, normalized_changed = _normalize_flashcard_exercise_payloads(generated_exercises)
    if normalized_changed:
        module.exercises = normalized_exercises
    return bool(module.exercises) or normalized_changed


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
    points_earned, points_possible = _assignment_point_totals(assignment)
    is_passed = _assignment_is_passed(assignment)
    retake_count = _get_retake_count(assignment)
    flashcard_status_counts = _flashcard_attempt_status_counts(assignment)
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
        "points_earned": points_earned,
        "points_possible": points_possible,
        "flashcard_answered_count": flashcard_status_counts["answered"],
        "flashcard_timed_out_count": flashcard_status_counts["timed_out"],
        "flashcard_unanswered_count": flashcard_status_counts["unanswered"],
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


def serialize_assignment_detail(
    assignment: MicrolearningAssignment,
    *,
    include_exercises: bool = True,
) -> dict[str, Any]:
    module = assignment.module
    media_state = get_module_media_state(module)
    result_summary = _assignment_result_summary(assignment) or None
    content_data = dict(module.content_data or {}) if module else {}
    question_payload_keys = {
        "questions",
        "quiz_questions",
        "video_questions",
        "video_timestamp_questions",
        "infographic_questions",
        "practice_prompt",
    }
    exercises = []
    responses = dict(assignment.responses or {})

    for exercise in ((module.exercises or []) if module and include_exercises else []):
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
                "tips": [],
                "explanation": exercise.get("explanation"),
                "option_feedback": exercise.get("option_feedback") or {},
                "sample_answer": exercise.get("sample_answer"),
                "point_value": _exercise_point_value(exercise),
                "front": exercise.get("front"),
                "back": exercise.get("back"),
                "study_time_seconds": exercise.get("study_time_seconds"),
                "preview_seconds": exercise.get("preview_seconds"),
                "blank_seconds": exercise.get("blank_seconds"),
                "answer_time_seconds": exercise.get("answer_time_seconds"),
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
            "content_data": {
                key: value
                for key, value in content_data.items()
                if key not in question_payload_keys
            } if module else {},
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
        "flashcard_session": get_flashcard_session_state(assignment),
        "exercises": exercises,
        "result_summary": result_summary,
    }


def evaluate_exercise_submission(
    exercise: dict[str, Any],
    *,
    response_text: Optional[str],
    selected_option: Optional[str],
    input_mode: Optional[str] = None,
    revealed_side: Optional[str] = None,
    study_time_seconds: Optional[int] = None,
    answer_time_seconds: Optional[int] = None,
    answer_status: Optional[str] = None,
    answered_at: Optional[Any] = None,
    timer_expired: bool = False,
    mark_completed: Optional[bool] = None,
) -> dict[str, Any]:
    exercise_type = (exercise.get("type") or "").strip().lower()
    normalized_text = (response_text or "").strip()
    normalized_option = (selected_option or "").strip()

    if exercise_type == "multiple_choice":
        correct_option = (exercise.get("correct_option") or "").strip()
        option_feedback = dict(exercise.get("option_feedback") or {})
        points_possible = _exercise_point_value(exercise)
        points_earned = points_possible if normalized_option and normalized_option == correct_option else 0.0
        score = _normalized_percentage_from_points(points_earned, points_possible)
        feedback = option_feedback.get(normalized_option) or exercise.get("explanation") or (
            "Correct answer selected."
            if score == 100.0
            else f"The strongest answer is: {correct_option or 'not available'}."
        )
        return {
            "id": exercise.get("id") or _slug(exercise.get("title") or "exercise"),
            "response_text": response_text,
            "selected_option": selected_option,
            "correct_answer": correct_option,
            "result_status": "correct" if score == 100.0 else "incorrect",
            "input_mode": input_mode or "selection",
            "score": score,
            "points_earned": points_earned,
            "points_possible": points_possible,
            "feedback": feedback,
            "is_completed": bool(normalized_option),
            "submitted_at": datetime.utcnow().isoformat(),
        }

    if exercise_type == "flashcard_recall":
        revealed = (revealed_side or "").strip().lower()
        front = (exercise.get("front") or "").strip()
        back = (exercise.get("back") or "").strip()
        expected_answer = front if revealed == "front" else back if revealed == "back" else ""
        points_possible = _exercise_point_value(exercise)
        resolved_answered_at = _parse_datetime_value(answered_at) or datetime.utcnow()
        completed_answer_status = str(answer_status or "").strip().lower()
        flashcard_sample_answer = (
            expected_answer
            if expected_answer
            else (exercise.get("sample_answer") or "").strip()
        )
        if revealed == "front":
            required_keywords = _dedupe_preserving_order(_tokenize_text(front))[:6]
        else:
            required_keywords = _derive_required_keywords(exercise)

        response_lower = normalized_text.lower()
        matched_keywords = [keyword for keyword in required_keywords if keyword in response_lower]
        missing_keywords = [keyword for keyword in required_keywords if keyword not in matched_keywords]
        response_tokens = set(_tokenize_text(normalized_text))
        sample_tokens = set(_tokenize_text(flashcard_sample_answer))
        similarity_score = (
            round((len(response_tokens & sample_tokens) / len(sample_tokens)) * 100, 2)
            if sample_tokens
            else 0.0
        )

        if normalized_text:
            ai_assessment = score_microlearning_open_response(
                prompt=str(exercise.get("prompt") or ""),
                sample_answer=flashcard_sample_answer,
                trainee_response=normalized_text,
                required_keywords=required_keywords,
                max_points=int(points_possible),
            )
            points_earned = round(max(0.0, min(points_possible, float(ai_assessment.get("score") or 0.0))), 2)
            feedback = str(ai_assessment.get("feedback") or "").strip()
            if not feedback:
                feedback = "Flashcard response reviewed against the target answer."
            ai_provider = str(ai_assessment.get("provider") or "fallback")
            ai_matched_keywords = [
                str(keyword or "").strip().lower()
                for keyword in (ai_assessment.get("matched_keywords") or [])
                if str(keyword or "").strip()
            ]
            ai_missing_keywords = [
                str(keyword or "").strip().lower()
                for keyword in (ai_assessment.get("missing_keywords") or [])
                if str(keyword or "").strip()
            ]
            if ai_matched_keywords:
                matched_keywords = _dedupe_preserving_order(ai_matched_keywords)
            if ai_missing_keywords:
                missing_keywords = _dedupe_preserving_order(ai_missing_keywords)
        else:
            points_earned = 0.0
            if timer_expired:
                feedback = "No answer was submitted before the answer timer expired."
            else:
                feedback = "Type your flashcard answer before the answer timer expires."
            ai_provider = None

        if not completed_answer_status:
            if timer_expired and normalized_text:
                completed_answer_status = "timed_out"
            elif timer_expired:
                completed_answer_status = "unanswered"
            elif normalized_text:
                completed_answer_status = "answered"
            else:
                completed_answer_status = "unanswered"

        is_completed = bool(normalized_text)
        if mark_completed is not None:
            is_completed = bool(mark_completed)
        elif timer_expired:
            is_completed = True

        return {
            "id": exercise.get("id") or _slug(exercise.get("title") or "exercise"),
            "response_text": response_text,
            "selected_option": selected_option,
            "correct_answer": flashcard_sample_answer,
            "input_mode": input_mode or "typed",
            "revealed_side": revealed or None,
            "status": completed_answer_status,
            "study_time_seconds": int(
                study_time_seconds or MICROLEARNING_FLASHCARD_STUDY_SECONDS
            ),
            "answer_time_seconds": int(
                answer_time_seconds or MICROLEARNING_FLASHCARD_ANSWER_SECONDS
            ),
            "answered_at": resolved_answered_at.isoformat(),
            "timer_expired": bool(timer_expired),
            "matched_keywords": matched_keywords,
            "missing_keywords": missing_keywords,
            "score": _normalized_percentage_from_points(points_earned, points_possible),
            "points_earned": points_earned,
            "points_possible": points_possible,
            "feedback": feedback,
            "expected_answer_length": len(flashcard_sample_answer),
            "sample_similarity": similarity_score,
            "ai_provider": ai_provider,
            "result_status": "needs_review" if normalized_text else "incorrect",
            "is_completed": is_completed,
            "submitted_at": resolved_answered_at.isoformat(),
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

    points_possible = _exercise_point_value(exercise)

    if normalized_text:
        ai_assessment = score_microlearning_open_response(
            prompt=str(exercise.get("prompt") or ""),
            sample_answer=sample_answer,
            trainee_response=normalized_text,
            required_keywords=required_keywords,
            max_points=int(points_possible),
        )
        points_earned = round(max(0.0, min(points_possible, float(ai_assessment.get("score") or 0.0))), 2)
        feedback = str(ai_assessment.get("feedback") or "").strip()
        if not feedback:
            feedback = "Response reviewed against the trainer sample answer."
        ai_provider = str(ai_assessment.get("provider") or "fallback")
        ai_matched_keywords = [
            str(keyword or "").strip().lower()
            for keyword in (ai_assessment.get("matched_keywords") or [])
            if str(keyword or "").strip()
        ]
        ai_missing_keywords = [
            str(keyword or "").strip().lower()
            for keyword in (ai_assessment.get("missing_keywords") or [])
            if str(keyword or "").strip()
        ]
        if ai_matched_keywords:
            matched_keywords = _dedupe_preserving_order(ai_matched_keywords)
        if ai_missing_keywords:
            missing_keywords = _dedupe_preserving_order(ai_missing_keywords)
    else:
        points_earned = 0.0
        feedback = "Response saved successfully."
        ai_provider = None

    score = _normalized_percentage_from_points(points_earned, points_possible)

    return {
        "id": exercise.get("id") or _slug(exercise.get("title") or "exercise"),
        "response_text": response_text,
        "selected_option": selected_option,
        "correct_answer": sample_answer,
        "input_mode": input_mode or "typed",
        "matched_keywords": matched_keywords,
        "missing_keywords": missing_keywords,
        "score": score,
        "points_earned": points_earned,
        "points_possible": points_possible,
        "feedback": feedback,
        "sample_similarity": similarity_score,
        "ai_provider": ai_provider,
        "result_status": "needs_review" if normalized_text else "incorrect",
        "is_completed": bool(normalized_text),
        "submitted_at": datetime.utcnow().isoformat(),
    }
