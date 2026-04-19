from __future__ import annotations

import re
import uuid
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models import (
    FeedbackType,
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
}

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
            }
        )
        return exercises

    if normalized_type == "quiz":
        for index, question in enumerate(content.get("questions") or [], start=1):
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
        for index, card in enumerate(content.get("cards") or [], start=1):
            exercises.append(
                {
                    "id": str(uuid.uuid4()),
                    "title": card.get("title") or f"Flashcard Check {index}",
                    "type": "keyword_response",
                    "prompt": card.get("mastery_prompt") or f"Explain the correct answer for: {card.get('front') or focus}",
                    "required_keywords": list(card.get("required_keywords") or []),
                    "tips": ["Use a complete sentence.", "Keep the sequence in the right order."],
                    "sample_answer": card.get("mastery_answer") or card.get("back"),
                }
            )
        return exercises

    if normalized_type == "infographic":
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
            module.category = definition["feedback_category"]
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
            category=definition["feedback_category"],
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
