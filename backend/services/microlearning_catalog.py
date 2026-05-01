from __future__ import annotations

import re
import uuid
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import (
    CertificateRecord,
    FeedbackType,
    MicrolearningAssignment,
    MicrolearningModule,
    MicrolearningTopicCategory,
    ScenarioDifficulty,
)

SUPPORTED_MICROLEARNING_TYPES = {
    "video",
    "quiz",
    "flashcard",
    "infographic",
    "case_study",
    "audio",
}

DEFAULT_FLASHCARD_PREVIEW_SECONDS = 10
DEFAULT_FLASHCARD_BLANK_SECONDS = 2
DEFAULT_FLASHCARD_ANSWER_TIME_LIMIT_SECONDS = 20

DEFAULT_TOPIC_CATEGORIES: list[dict[str, str]] = [
    {
        "name": "Bereavement Empathy",
        "description": "Compassion-first responses for grieving families and sensitive service calls.",
    },
    {
        "name": "Plan Sales and Routing",
        "description": "Safe handoff language for new plan inquiries and product routing.",
    },
    {
        "name": "Accounts and Billing",
        "description": "Payment posting, account updates, and ownership language for account care.",
    },
    {
        "name": "Claims and Documentation",
        "description": "Death claim triage, beneficiary verification, and document request phrasing.",
    },
    {
        "name": "Operations and Platform Support",
        "description": "Service coordination, CRM notes, and speech-platform support handoffs.",
    },
]

BPO_MICROLEARNING_LIBRARY: list[dict[str, Any]] = [
    {
        "title": "Bereavement First Response",
        "description": "A coach-led video module that teaches the first thirty seconds of a compassionate bereavement call.",
        "module_type": "video",
        "topic_category": "Bereavement Empathy",
        "feedback_category": FeedbackType.EMPATHY,
        "duration_minutes": 5,
        "passing_score": 80,
        "skill_focus": "Compassionate opening statements for grieving callers",
        "difficulty": ScenarioDifficulty.BASIC,
        "content_url": "https://www.youtube.com/watch?v=1Evwgu369Jw",
        "content_data": {
            "asset_url": "https://www.youtube.com/watch?v=1Evwgu369Jw",
            "practice_prompt": "The caller says, 'My mother passed away this morning, and I do not know what to do with her St. Peter plan.' Deliver a calm, compassionate first response.",
            "required_keywords": ["sorry", "help", "verify", "next step"],
            "sample_answer": "I am very sorry for your loss. I will help you through this, verify the plan details, and explain the next step clearly.",
        },
    },
    {
        "title": "Active Listening for Grieving Families",
        "description": "An infographic module that reinforces supportive phrases to use and phrases to avoid during sensitive memorial-service calls.",
        "module_type": "infographic",
        "topic_category": "Bereavement Empathy",
        "feedback_category": FeedbackType.EMPATHY,
        "duration_minutes": 3,
        "passing_score": 80,
        "skill_focus": "Reflective listening before process talk",
        "difficulty": ScenarioDifficulty.BASIC,
        "content_data": {
            "power_phrases": [
                "I am sorry for your loss, and I will guide you step by step.",
                "What I hear is that your family needs immediate support today.",
                "Let me confirm the details first so I can give you the right next step.",
            ],
            "wall_phrases": [
                "You just need to send the documents.",
                "That is not my department.",
                "Please call back when you have everything ready.",
            ],
            "reflection_prompt": "Rewrite a cold document-request line into a compassionate listening statement for a bereaved beneficiary.",
            "required_keywords": ["sorry", "support", "next step"],
            "sample_answer": "I am sorry for your loss, and I will support you by reviewing the requirement with you and explaining the next step.",
        },
    },
    {
        "title": "New Plan Inquiry Routing: St. Anne or St. Bernadette",
        "description": "A routing quiz that trains agents to acknowledge a new-plan inquiry and direct the caller to Sales without guessing plan prices.",
        "module_type": "quiz",
        "topic_category": "Plan Sales and Routing",
        "feedback_category": FeedbackType.CLARITY,
        "duration_minutes": 4,
        "passing_score": 85,
        "skill_focus": "Safe routing for new plan purchase questions",
        "difficulty": ScenarioDifficulty.BASIC,
        "content_data": {
            "questions": [
                {
                    "title": "Choose the safest routing response",
                    "question": "A caller asks, 'How much is the St. Anne plan, and should I choose St. Bernadette instead?' Which response is best?",
                    "options": [
                        "The St. Bernadette plan is always better, so I suggest that one.",
                        "I can help capture your details and route you to our Sales team, who can explain the St. Anne and St. Bernadette plan options accurately.",
                        "I am not sure about the plans, so please search the website later.",
                    ],
                    "correct_option": "I can help capture your details and route you to our Sales team, who can explain the St. Anne and St. Bernadette plan options accurately.",
                    "option_feedback": {
                        "The St. Bernadette plan is always better, so I suggest that one.": "This guesses at plan fit and may provide inaccurate guidance.",
                        "I can help capture your details and route you to our Sales team, who can explain the St. Anne and St. Bernadette plan options accurately.": "Correct. It acknowledges the inquiry, avoids guessing, and routes to Sales.",
                        "I am not sure about the plans, so please search the website later.": "This drops ownership and does not provide a supported handoff.",
                    },
                }
            ]
        },
    },
    {
        "title": "Payment Posting Update Script",
        "description": "Flashcards that coach agents on how to explain payment status, posting windows, and when to route to Customer Accounts.",
        "module_type": "flashcard",
        "topic_category": "Accounts and Billing",
        "feedback_category": FeedbackType.CLARITY,
        "duration_minutes": 6,
        "passing_score": 75,
        "skill_focus": "Explaining payment checks in a clear sequence",
        "difficulty": ScenarioDifficulty.BASIC,
        "content_data": {
            "cards": [
                {
                    "front": "What should you confirm before giving a payment posting update?",
                    "back": "Verify the plan or account number, confirm the payment channel and payment date, review the ledger status, and provide the next routing step if posting is still pending.",
                    "mastery_prompt": "Write the customer-facing explanation for checking a payment that has not posted yet.",
                    "required_keywords": ["verify", "payment date", "ledger", "customer accounts"],
                    "mastery_answer": "I will verify your plan details, confirm the payment date, review the ledger, and if the posting is still pending I will route this to Customer Accounts.",
                },
                {
                    "front": "When should a payment concern be routed to Customer Accounts?",
                    "back": "Route the case when the payment reference is available but the ledger is still unresolved after the normal posting window.",
                    "mastery_prompt": "Explain when you will transfer the customer to Customer Accounts.",
                    "required_keywords": ["payment reference", "posting window", "customer accounts"],
                    "mastery_answer": "If the payment reference is complete and the posting window has already passed, I will route your case to Customer Accounts for a detailed review.",
                },
            ]
        },
    },
    {
        "title": "Death Claim Urgency Triage",
        "description": "A case study that teaches claim urgency handling, empathy, and warm transfer language for bereavement cases.",
        "module_type": "case_study",
        "topic_category": "Claims and Documentation",
        "feedback_category": FeedbackType.EMPATHY,
        "duration_minutes": 7,
        "passing_score": 80,
        "skill_focus": "Urgent death-claim triage with ownership",
        "difficulty": ScenarioDifficulty.INTERMEDIATE,
        "content_data": {
            "transcript": "Caller: My father passed away last night, and I need to know how to claim the benefit. Agent: Please email the documents first. Caller: I do not even know where to send them.",
            "root_cause_question": "What is the first coaching point the trainer should highlight?",
            "root_cause_options": [
                "The agent should have ended the call quickly to avoid delay.",
                "The agent skipped empathy and failed to route the urgent concern to Claims & Benefits.",
                "The caller should have prepared the complete documents before calling.",
            ],
            "root_cause_answer": "The agent skipped empathy and failed to route the urgent concern to Claims & Benefits.",
            "analysis_prompt": "Write the recovery line the agent should have used after hearing about the death claim.",
            "required_keywords": ["sorry", "claims", "requirements", "next step"],
            "sample_answer": "I am sorry for your loss. I will route you to our Claims team, review the requirements with you, and explain the next step before the handoff.",
        },
    },
    {
        "title": "Beneficiary Verification Essentials",
        "description": "A verification quiz that trains agents to protect customer data before discussing benefits or claim processing.",
        "module_type": "quiz",
        "topic_category": "Claims and Documentation",
        "feedback_category": FeedbackType.CLARITY,
        "duration_minutes": 4,
        "passing_score": 80,
        "skill_focus": "Secure beneficiary verification before disclosure",
        "difficulty": ScenarioDifficulty.BASIC,
        "content_data": {
            "questions": [
                {
                    "title": "Choose the best verification response",
                    "question": "Which statement is safest before discussing a death claim or benefit status?",
                    "options": [
                        "I can tell you everything now because you sound like a family member.",
                        "For security, I will first verify the planholder details and your relationship to the account before I discuss the claim.",
                        "Please give me any available name and I will read the entire record.",
                    ],
                    "correct_option": "For security, I will first verify the planholder details and your relationship to the account before I discuss the claim.",
                    "option_feedback": {
                        "I can tell you everything now because you sound like a family member.": "This skips required verification and risks unauthorized disclosure.",
                        "For security, I will first verify the planholder details and your relationship to the account before I discuss the claim.": "Correct. It protects the record while staying clear and professional.",
                        "Please give me any available name and I will read the entire record.": "This offers disclosure without proper identity validation.",
                    },
                }
            ]
        },
    },
    {
        "title": "Service Schedule Coordination Notes",
        "description": "Flashcards that coach agents to document chapel or service arrangements in a clean, complete customer note.",
        "module_type": "flashcard",
        "topic_category": "Operations and Platform Support",
        "feedback_category": FeedbackType.GRAMMAR,
        "duration_minutes": 5,
        "passing_score": 75,
        "skill_focus": "Clear one-sentence coordination notes",
        "difficulty": ScenarioDifficulty.INTERMEDIATE,
        "content_data": {
            "cards": [
                {
                    "front": "What should a strong chapel coordination note include?",
                    "back": "Include the service date and time, branch or chapel location, contact person, callback number, and any family request that affects the service flow.",
                    "mastery_prompt": "Draft a one-sentence customer note for a chapel scheduling update.",
                    "required_keywords": ["service date", "chapel", "contact", "callback"],
                    "mastery_answer": "Customer confirmed the service date, chapel location, contact person, and callback number, and the family request was noted for follow-up.",
                }
            ]
        },
    },
    {
        "title": "TTS-Safe Benefit Update Delivery",
        "description": "A pronunciation-focused video module for calm, clean delivery that stays friendly to text-to-speech and live voice support.",
        "module_type": "video",
        "topic_category": "Operations and Platform Support",
        "feedback_category": FeedbackType.PRONUNCIATION,
        "duration_minutes": 4,
        "passing_score": 80,
        "skill_focus": "Clear spoken delivery for sensitive support updates",
        "difficulty": ScenarioDifficulty.INTERMEDIATE,
        "content_url": "https://www.youtube.com/watch?v=U3CWxNGNn3k",
        "content_data": {
            "asset_url": "https://www.youtube.com/watch?v=U3CWxNGNn3k",
            "practice_prompt": "Say a short update that explains the family will receive a reference number, claim review guidance, and the next callback window.",
            "required_keywords": ["reference number", "claim review", "callback"],
            "sample_answer": "I will provide your reference number, explain the claim review process, and confirm the callback window for the next update.",
        },
    },
    {
        "title": "Compassionate Document Request Phrases",
        "description": "An infographic module that trains agents to request claim requirements without sounding abrupt or dismissive.",
        "module_type": "infographic",
        "topic_category": "Claims and Documentation",
        "feedback_category": FeedbackType.EMPATHY,
        "duration_minutes": 3,
        "passing_score": 80,
        "skill_focus": "Compassionate requirement collection",
        "difficulty": ScenarioDifficulty.BASIC,
        "content_data": {
            "power_phrases": [
                "I will review the requirement with you one item at a time.",
                "Let me explain why each document is needed for the claim review.",
                "If a document is not available today, I will guide you on the next best step.",
            ],
            "wall_phrases": [
                "Just submit all the documents first.",
                "That is incomplete, so we cannot help yet.",
                "You need to figure out the requirements on your own.",
            ],
            "reflection_prompt": "Rewrite a harsh document request into a supportive requirement explanation.",
            "required_keywords": ["review", "document", "guide", "next step"],
            "sample_answer": "I will review each document with you, guide you through any missing item, and explain the next step for the claim.",
        },
    },
    {
        "title": "Speech Platform Issue Handoff",
        "description": "A case study that trains agents to capture clear bug details and route platform issues to IT Support without losing ownership.",
        "module_type": "case_study",
        "topic_category": "Operations and Platform Support",
        "feedback_category": FeedbackType.CLARITY,
        "duration_minutes": 7,
        "passing_score": 80,
        "skill_focus": "Platform issue documentation and IT routing",
        "difficulty": ScenarioDifficulty.INTERMEDIATE,
        "content_data": {
            "transcript": "Caller: The speech platform keeps freezing whenever I open the trainee report. Agent: Please try again later. Caller: This is the third time it happened today.",
            "root_cause_question": "What is the strongest coaching point for the agent?",
            "root_cause_options": [
                "The agent should have routed the issue to IT Support after capturing the error details and impact.",
                "The agent should have ignored the bug and focused on call time.",
                "The caller should have restarted the computer without any support.",
            ],
            "root_cause_answer": "The agent should have routed the issue to IT Support after capturing the error details and impact.",
            "analysis_prompt": "Write the handoff line the agent should have used for the speech-platform issue.",
            "required_keywords": ["error", "it support", "details", "ticket"],
            "sample_answer": "I am sorry for the repeated issue. I will capture the error details now and route this to IT Support so a ticket can be raised for follow-up.",
        },
    },
]


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower())
    return normalized.strip("-") or "microlearning"


def normalize_module_type(value: Optional[str]) -> str:
    normalized = slugify(value or "quiz").replace("-", "_")
    if normalized not in SUPPORTED_MICROLEARNING_TYPES:
        return "quiz"
    return normalized


def serialize_topic_category(category: MicrolearningTopicCategory) -> dict[str, Any]:
    return {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
        "is_active": bool(category.is_active),
        "created_at": category.created_at,
        "updated_at": category.updated_at,
    }


def _normalize_question_type(value: Optional[str]) -> str:
    normalized = slugify(value or "open_ended").replace("-", "_")
    return "multiple_choice" if normalized == "multiple_choice" else "open_ended"


def _clean_string_list(values: Any) -> list[str]:
    if isinstance(values, str):
        raw_values = re.split(r"[\n,]", values)
    else:
        raw_values = list(values or [])

    cleaned: list[str] = []
    for value in raw_values:
        text = str(value or "").strip()
        if text:
            cleaned.append(text)
    return cleaned


def _coerce_positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _build_authored_question_exercise(
    question: dict[str, Any],
    *,
    index: int,
    fallback_title: str,
    fallback_prompt: str,
    default_tips: list[str],
    include_timestamp: bool = False,
) -> dict[str, Any]:
    question_type = _normalize_question_type(question.get("type"))
    options = _clean_string_list(question.get("options"))
    correct_option = question.get("correct_option") or question.get("correct")
    exercise_type = "multiple_choice" if question_type == "multiple_choice" else "keyword_response"

    exercise = {
        "id": str(uuid.uuid4()),
        "title": question.get("title") or f"{fallback_title} {index}",
        "type": exercise_type,
        "prompt": question.get("question") or fallback_prompt,
        "options": options if exercise_type == "multiple_choice" else [],
        "correct_option": correct_option if exercise_type == "multiple_choice" else None,
        "required_keywords": _clean_string_list(question.get("required_keywords")),
        "tips": _clean_string_list(question.get("tips")) or default_tips,
        "sample_answer": (question.get("sample_answer") or "").strip() or None,
        "enable_stt": bool(question.get("stt_enabled") or question.get("enable_stt")),
    }

    if include_timestamp:
        exercise["timestamp"] = question.get("timestamp", 0)

    return exercise


def build_type_specific_exercises(
    module_type: Optional[str],
    content_data: Optional[dict[str, Any]],
    *,
    title: Optional[str] = None,
    skill_focus: Optional[str] = None,
) -> list[dict[str, Any]]:
    normalized_type = normalize_module_type(module_type)
    content = dict(content_data or {})
    focus = skill_focus or title or "customer communication"
    exercises: list[dict[str, Any]] = []

    if normalized_type == "video":
        video_questions = (
            content.get("video_timestamp_questions")
            or content.get("questions")
            or content.get("video_questions")
            or []
        )
        for i, question in enumerate(video_questions, start=1):
            exercises.append(
                _build_authored_question_exercise(
                    dict(question or {}),
                    index=i,
                    fallback_title="Video Question",
                    fallback_prompt=f"Respond to the scenario shown in {title or 'the lesson'}.",
                    default_tips=["Review the assigned video lesson first.", "Tie your answer to the key idea from the lesson."],
                )
            )
        if exercises:
            return exercises

        prompt = content.get("practice_prompt") or f"Respond to the scenario shown in {title or 'the lesson'}."
        exercises.append(
            {
                "id": str(uuid.uuid4()),
                "title": "Practice Prompt",
                "type": "keyword_response",
                "prompt": prompt,
                "required_keywords": list(content.get("required_keywords") or []),
                "tips": ["Acknowledge the concern first.", "State the next step clearly."],
                "sample_answer": content.get("sample_answer"),
                "enable_stt": content.get("enable_stt_video", False),
            }
        )
        return exercises

    if normalized_type == "quiz":
        questions = content.get("questions") or content.get("quiz_questions") or []
        for index, question in enumerate(questions, start=1):
            option_feedback = dict(question.get("option_feedback") or {})
            correct_option = question.get("correct_option") or question.get("correct")
            exercises.append(
                {
                    "id": str(uuid.uuid4()),
                    "title": question.get("title") or f"Quiz Question {index}",
                    "type": "multiple_choice",
                    "prompt": question.get("question") or f"Answer the quiz question for {focus}.",
                    "options": list(question.get("options") or []),
                    "correct_option": correct_option,
                    "option_feedback": option_feedback,
                    "explanation": option_feedback.get(correct_option) or question.get("explanation"),
                    "sample_answer": option_feedback.get(correct_option),
                }
            )
        return exercises

    if normalized_type == "flashcard":
        default_preview_seconds = _coerce_positive_int(
            content.get("preview_seconds") or content.get("review_seconds"),
            DEFAULT_FLASHCARD_PREVIEW_SECONDS,
        )
        default_blank_seconds = _coerce_positive_int(
            content.get("blank_seconds"),
            DEFAULT_FLASHCARD_BLANK_SECONDS,
        )
        default_answer_time_limit_seconds = _coerce_positive_int(
            content.get("answer_time_limit_seconds") or content.get("recall_time_limit_seconds"),
            DEFAULT_FLASHCARD_ANSWER_TIME_LIMIT_SECONDS,
        )

        for index, card in enumerate(content.get("cards") or [], start=1):
            preview_seconds = _coerce_positive_int(
                card.get("preview_seconds"),
                default_preview_seconds,
            )
            blank_seconds = _coerce_positive_int(
                card.get("blank_seconds"),
                default_blank_seconds,
            )
            answer_time_limit_seconds = _coerce_positive_int(
                card.get("answer_time_limit_seconds") or card.get("recall_time_limit_seconds"),
                default_answer_time_limit_seconds,
            )
            exercises.append(
                {
                    "id": str(uuid.uuid4()),
                    "title": card.get("title") or f"Flashcard Recall {index}",
                    "type": "flashcard_recall",
                    "prompt": card.get("mastery_prompt")
                    or "Memorize both sides of the card, then type the hidden side exactly.",
                    "front": (card.get("front") or "").strip(),
                    "back": (card.get("back") or "").strip(),
                    "preview_seconds": preview_seconds,
                    "blank_seconds": blank_seconds,
                    "answer_time_limit_seconds": answer_time_limit_seconds,
                    "required_keywords": _clean_string_list(card.get("required_keywords")),
                    "tips": [
                        f"Study both sides during the {preview_seconds}-second preview.",
                        f"When one side stays visible, type the hidden side within {answer_time_limit_seconds} seconds.",
                    ],
                    "sample_answer": (card.get("mastery_answer") or card.get("back") or "").strip() or None,
                }
            )
        return exercises

    if normalized_type == "infographic":
        infographic_questions = (
            content.get("questions")
            or content.get("infographic_questions")
            or []
        )
        for index, question in enumerate(infographic_questions, start=1):
            exercises.append(
                _build_authored_question_exercise(
                    dict(question or {}),
                    index=index,
                    fallback_title="Knowledge Check",
                    fallback_prompt=f"Summarize the strongest takeaway from {title or 'this infographic'}.",
                    default_tips=["Study the assigned visual first.", "Use the best evidence from the infographic."],
                )
            )
        if exercises:
            return exercises

        exercises.append(
            {
                "id": str(uuid.uuid4()),
                "title": "Reflection Response",
                "type": "keyword_response",
                "prompt": content.get("reflection_prompt") or f"Summarize the strongest takeaway from {title or 'this infographic'}.",
                "required_keywords": list(content.get("required_keywords") or []),
                "tips": ["Use a power phrase.", "End with a clear action."],
                "sample_answer": content.get("sample_answer"),
            }
        )
        return exercises

    if normalized_type == "case_study":
        case_study_questions = (
            content.get("questions")
            or content.get("case_study_questions")
            or []
        )
        for index, question in enumerate(case_study_questions, start=1):
            exercises.append(
                _build_authored_question_exercise(
                    dict(question or {}),
                    index=index,
                    fallback_title="Case Study Question",
                    fallback_prompt=f"Write the corrective response for the {focus} case.",
                    default_tips=["Reference the assigned scenario details.", "Keep the response tied to the case facts."],
                )
            )
        if exercises:
            return exercises

        if content.get("root_cause_question"):
            option_feedback = dict(content.get("root_cause_feedback") or {})
            exercises.append(
                {
                    "id": str(uuid.uuid4()),
                    "title": "Root Cause Check",
                    "type": "multiple_choice",
                    "prompt": content.get("root_cause_question"),
                    "options": list(content.get("root_cause_options") or []),
                    "correct_option": content.get("root_cause_answer"),
                    "option_feedback": option_feedback,
                    "explanation": option_feedback.get(content.get("root_cause_answer")),
                    "sample_answer": option_feedback.get(content.get("root_cause_answer")),
                }
            )

        exercises.append(
            {
                "id": str(uuid.uuid4()),
                "title": "Corrective Analysis",
                "type": "keyword_response",
                "prompt": content.get("analysis_prompt") or f"Write the corrective response for the {focus} case.",
                "required_keywords": list(content.get("required_keywords") or []),
                "tips": ["Acknowledge the issue.", "Take ownership before the next step."],
                "sample_answer": content.get("sample_answer"),
                "enable_stt": content.get("enable_stt_case_study", False),
            }
        )
        return exercises

    if normalized_type == "audio":
        audio_questions = (
            content.get("questions")
            or content.get("audio_questions")
            or content.get("case_study_questions")
            or []
        )
        for index, question in enumerate(audio_questions, start=1):
            exercises.append(
                _build_authored_question_exercise(
                    dict(question or {}),
                    index=index,
                    fallback_title="Audio Question",
                    fallback_prompt=f"Listen to the assigned audio and answer the question for {focus}.",
                    default_tips=[
                        "Replay the uploaded audio before answering.",
                        "Use the transcript or captions to support the strongest answer.",
                    ],
                )
            )
        if exercises:
            return exercises

        transcript = (
            content.get("transcript")
            or content.get("captions_text")
            or content.get("content")
            or ""
        )
        fallback_prompt = (
            content.get("analysis_prompt")
            or f"Listen to the assigned audio and summarize the strongest response for {focus}."
        )
        exercises.append(
            {
                "id": str(uuid.uuid4()),
                "title": "Listening Response",
                "type": "keyword_response",
                "prompt": fallback_prompt,
                "required_keywords": list(content.get("required_keywords") or []),
                "tips": [
                    "Replay the audio if you need to confirm the caller concern.",
                    "Use the transcript to support the clearest answer.",
                ],
                "sample_answer": content.get("sample_answer") or transcript or None,
                "enable_stt": content.get("enable_stt_audio", True),
            }
        )
        return exercises

    return exercises


def ensure_trainer_topic_categories(
    db: Session,
    *,
    trainer_id: str,
    seeds: Optional[list[dict[str, str]]] = None,
) -> list[MicrolearningTopicCategory]:
    definitions = seeds or DEFAULT_TOPIC_CATEGORIES
    existing = (
        db.query(MicrolearningTopicCategory)
        .filter(MicrolearningTopicCategory.created_by == trainer_id)
        .all()
    )
    existing_by_slug = {category.slug: category for category in existing}
    results: list[MicrolearningTopicCategory] = []

    for definition in definitions:
        slug = slugify(definition["name"])
        category = existing_by_slug.get(slug)
        if category:
            category.name = definition["name"]
            category.description = definition.get("description")
            category.is_active = True
        else:
            category = MicrolearningTopicCategory(
                name=definition["name"],
                slug=slug,
                description=definition.get("description"),
                created_by=trainer_id,
                is_active=True,
            )
            db.add(category)
        results.append(category)

    db.flush()
    return results


def seed_bpo_microlearning_library(
    db: Session,
    *,
    trainer_id: str,
) -> dict[str, int]:
    categories = ensure_trainer_topic_categories(db, trainer_id=trainer_id)
    category_lookup = {category.name: category for category in categories}

    existing_modules = (
        db.query(MicrolearningModule)
        .filter(MicrolearningModule.created_by == trainer_id)
        .all()
    )
    existing_by_title = {
        (module.title or "").strip().lower(): module
        for module in existing_modules
    }

    created_modules = 0
    updated_modules = 0

    for definition in BPO_MICROLEARNING_LIBRARY:
        title_key = definition["title"].strip().lower()
        module = existing_by_title.get(title_key)
        topic_category = category_lookup.get(definition["topic_category"])
        exercises = build_type_specific_exercises(
            definition["module_type"],
            definition["content_data"],
            title=definition["title"],
            skill_focus=definition.get("skill_focus"),
        )

        if module:
            module.description = definition.get("description")
            module.category = definition["feedback_category"].name
            module.type = definition["module_type"]
            module.duration_minutes = int(definition.get("duration_minutes") or 3)
            module.content_data = dict(definition.get("content_data") or {})
            module.passing_score = int(definition.get("passing_score") or 75)
            module.skill_focus = definition.get("skill_focus")
            module.content_url = definition.get("content_url")
            module.exercises = exercises
            module.difficulty = definition.get("difficulty") or ScenarioDifficulty.BASIC
            module.topic_category_id = topic_category.id if topic_category else None
            module.is_active = True
            updated_modules += 1
            continue

        module = MicrolearningModule(
            title=definition["title"],
            description=definition.get("description"),
            category=definition["feedback_category"].name,
            type=definition["module_type"],
            duration_minutes=int(definition.get("duration_minutes") or 3),
            content_data=dict(definition.get("content_data") or {}),
            passing_score=int(definition.get("passing_score") or 75),
            skill_focus=definition.get("skill_focus"),
            content_url=definition.get("content_url"),
            exercises=exercises,
            difficulty=definition.get("difficulty") or ScenarioDifficulty.BASIC,
            topic_category_id=topic_category.id if topic_category else None,
            created_by=trainer_id,
            is_active=True,
        )
        db.add(module)
        created_modules += 1

    db.flush()
    return {
        "categories_seeded": len(categories),
        "modules_created": created_modules,
        "modules_updated": updated_modules,
    }


def cleanup_seeded_microlearning_library(
    db: Session,
    *,
    trainer_id: Optional[str] = None,
) -> dict[str, int]:
    """Permanently remove the legacy seeded microlearning pack from the database."""
    seeded_category_names = {
        (definition.get("name") or "").strip().lower()
        for definition in DEFAULT_TOPIC_CATEGORIES
        if (definition.get("name") or "").strip()
    }
    seeded_module_titles = {
        (definition.get("title") or "").strip().lower()
        for definition in BPO_MICROLEARNING_LIBRARY
        if (definition.get("title") or "").strip()
    }

    category_query = db.query(MicrolearningTopicCategory)
    module_query = db.query(MicrolearningModule)
    if trainer_id:
        category_query = category_query.filter(
            MicrolearningTopicCategory.created_by == trainer_id
        )
        module_query = module_query.filter(MicrolearningModule.created_by == trainer_id)

    categories = (
        category_query.filter(
            func.lower(MicrolearningTopicCategory.name).in_(seeded_category_names)
        ).all()
        if seeded_category_names
        else []
    )
    category_ids = {category.id for category in categories}

    seeded_modules = (
        module_query.filter(
            func.lower(MicrolearningModule.title).in_(seeded_module_titles)
        ).all()
        if seeded_module_titles
        else []
    )
    seeded_module_ids = {module.id for module in seeded_modules}

    modules_uncategorized = 0
    if category_ids:
        linked_modules = (
            module_query.filter(MicrolearningModule.topic_category_id.in_(category_ids)).all()
        )
        for module in linked_modules:
            if module.id in seeded_module_ids:
                continue
            module.topic_category_id = None
            module.topic_category = None
            modules_uncategorized += 1

    assignments = (
        db.query(MicrolearningAssignment)
        .filter(MicrolearningAssignment.module_id.in_(seeded_module_ids))
        .all()
        if seeded_module_ids
        else []
    )
    assignment_ids = {assignment.id for assignment in assignments}
    certificate_ids = {
        assignment.certificate_id
        for assignment in assignments
        if assignment.certificate_id
    }

    certificates: list[CertificateRecord] = []
    if assignment_ids:
        certificates.extend(
            db.query(CertificateRecord)
            .filter(
                CertificateRecord.source_type == "microlearning",
                CertificateRecord.source_id.in_(assignment_ids),
            )
            .all()
        )
    if certificate_ids:
        existing_certificate_ids = {certificate.id for certificate in certificates}
        certificates.extend(
            certificate
            for certificate in (
                db.query(CertificateRecord)
                .filter(CertificateRecord.id.in_(certificate_ids))
                .all()
            )
            if certificate.id not in existing_certificate_ids
        )

    for assignment in assignments:
        db.delete(assignment)

    for certificate in certificates:
        db.delete(certificate)

    for module in seeded_modules:
        db.delete(module)

    for category in categories:
        db.delete(category)

    db.flush()
    return {
        "categories_deleted": len(categories),
        "seeded_modules_deleted": len(seeded_modules),
        "seeded_assignments_deleted": len(assignments),
        "seeded_certificates_deleted": len(certificates),
        "modules_uncategorized": modules_uncategorized,
    }
