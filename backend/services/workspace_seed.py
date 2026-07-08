"""
Default NLP libraries for trainer workspaces.

The data is stored in the workspace JSON columns, so the same payload works for
both local SQLite and Supabase Postgres.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
import uuid

from ..models import Workspace

_SEED_NAMESPACE = uuid.UUID("4cfcf6e5-34b8-4bd8-93f8-f2ef7b89c2b5")
_SEED_VERSION = "2026-04-01"

_EMPATHY_SEEDS = [
    ("Thank you for reaching out about this today.", "greeting"),
    ("I appreciate you bringing this concern to us right away.", "greeting"),
    ("Thank you for staying with me while I review the details.", "greeting"),
    ("I am here to help you work through this step by step.", "greeting"),
    ("I can hear how frustrating this situation has been for you.", "acknowledgment"),
    ("I understand why this delay would be concerning.", "acknowledgment"),
    ("I can see why you would want this resolved as soon as possible.", "acknowledgment"),
    ("I understand this issue has interrupted your day.", "acknowledgment"),
    ("You were right to contact us about this concern.", "validation"),
    ("Your concern is completely valid, and I am reviewing it carefully.", "validation"),
    ("That makes sense, especially given the impact on your account.", "validation"),
    ("It is understandable that you expected a smoother experience.", "validation"),
    ("I am sorry you had to repeat the issue before reaching a resolution.", "apology"),
    ("I apologize for the inconvenience this has caused you today.", "apology"),
    ("I am sorry for the confusion around the update on your case.", "apology"),
    ("I apologize that this took longer than it should have.", "apology"),
    ("I will stay with you until we complete the next best step.", "reassurance"),
    ("Let me take ownership of this and guide you through the process.", "reassurance"),
    ("I will check the details carefully and keep you updated.", "reassurance"),
    ("We can work through this together step by step.", "reassurance"),
    ("I want to make sure you leave this conversation with a clear answer.", "reassurance"),
    ("I will summarize everything before we end the call so nothing is missed.", "reassurance"),
]

_PROBING_SEEDS = [
    (
        "Could you walk me through exactly what happened before the error appeared?",
        "clarification",
        "Customer Service",
        "easy",
    ),
    (
        "What message or prompt did you see on the screen when the issue occurred?",
        "clarification",
        "Technical Support",
        "easy",
    ),
    (
        "Which account, order, or service was affected by the problem?",
        "clarification",
        "Customer Service",
        "easy",
    ),
    (
        "When did you first notice the issue, and is it still happening now?",
        "clarification",
        "Technical Support",
        "medium",
    ),
    (
        "What were you trying to do just before this happened?",
        "clarification",
        "Technical Support",
        "easy",
    ),
    (
        "Did anything change on the account before this concern started?",
        "root_cause",
        "Billing",
        "medium",
    ),
    (
        "Has this happened before, or is this the first time you have seen it?",
        "root_cause",
        "Customer Service",
        "easy",
    ),
    (
        "Are you experiencing this on one device only or on multiple devices?",
        "root_cause",
        "Technical Support",
        "medium",
    ),
    (
        "Was the issue triggered after a payment, update, reset, or recent change?",
        "root_cause",
        "Billing",
        "medium",
    ),
    (
        "Which browser, app version, or channel were you using when this occurred?",
        "root_cause",
        "Technical Support",
        "hard",
    ),
    (
        "Have you already tried any troubleshooting steps before contacting us today?",
        "follow_up",
        "Technical Support",
        "easy",
    ),
    (
        "Were you able to receive any confirmation email, text message, or receipt?",
        "follow_up",
        "Customer Service",
        "medium",
    ),
    (
        "Is the concern affecting every transaction, or only one specific case?",
        "follow_up",
        "Billing",
        "medium",
    ),
    (
        "What result are you expecting once we complete this request for you?",
        "follow_up",
        "Customer Service",
        "medium",
    ),
    (
        "Is there any deadline or appointment connected to this issue that we should note?",
        "follow_up",
        "Retention",
        "hard",
    ),
    (
        "If I involve another team, what callback number should we use for updates?",
        "escalation",
        "Customer Service",
        "easy",
    ),
    (
        "What is the best time window for us to reach you if the case needs follow-up?",
        "escalation",
        "Customer Service",
        "easy",
    ),
    (
        "Would you prefer updates by phone or email if this requires an escalation?",
        "escalation",
        "Customer Service",
        "easy",
    ),
    (
        "Is there any supporting detail you want documented before I hand this to the next team?",
        "escalation",
        "Customer Service",
        "medium",
    ),
    (
        "What outcome would make this escalation feel fully resolved from your side?",
        "escalation",
        "Retention",
        "hard",
    ),
]

_FORBIDDEN_SEEDS = [
    ("calm down", "Offensive", "high", "I understand this is frustrating."),
    ("whatever", "Offensive", "high", "I understand your concern."),
    ("obviously", "Offensive", "medium", "What I can confirm is"),
    ("you should have", "Offensive", "medium", "What we can do next is"),
    ("that is not my job", "Offensive", "high", "Let me connect you with the right team."),
    ("just wait", "Offensive", "medium", "Thank you for your patience while I check."),
    ("i do not know", "Jargon", "medium", "Let me verify that for you."),
    ("asap", "Jargon", "low", "as quickly as possible"),
    ("backend", "Jargon", "low", "internal system"),
    ("sla", "Jargon", "medium", "service timeline"),
    ("tier 2", "Jargon", "medium", "specialized support team"),
    ("system glitch", "Jargon", "low", "system issue"),
    ("invalid credentials", "Jargon", "low", "sign-in details did not match"),
    ("password", "Confidential", "high", "Please do not share your password."),
    ("pin", "Confidential", "high", "Please do not share your PIN."),
    ("cvv", "Confidential", "high", "Please do not share the card security code."),
    ("full card number", "Confidential", "high", "We only need the safe verification details."),
    ("competitor offer", "Competitor", "low", "available plan or alternative option"),
]

_KEYWORD_SEEDS = [
    ("understand", "high", "Use when acknowledging frustration or inconvenience.", 1.5),
    ("help", "high", "Use to show ownership and support.", 1.4),
    ("assist", "medium", "Professional support language during live assistance.", 1.1),
    ("verify", "high", "Use before changing account or billing details.", 1.5),
    ("confirm", "high", "Repeat the requested action or verified details.", 1.4),
    ("account", "high", "Reference the correct customer record or profile.", 1.3),
    ("review", "medium", "Describe active investigation or checking of records.", 1.1),
    ("update", "medium", "Explain the latest case status or progress.", 1.0),
    ("resolve", "high", "State the intended outcome of the interaction.", 1.4),
    ("today", "medium", "Show urgency and ownership during the current contact.", 1.0),
    ("next step", "high", "Explain what happens after the current interaction.", 1.4),
    ("reference number", "high", "Provide a trackable case or ticket identifier.", 1.3),
    ("case number", "medium", "Alternative tracking reference for support cases.", 1.1),
    ("security", "high", "Use during verification reminders and safe handling language.", 1.3),
    ("billing", "medium", "Use when discussing invoices, charges, or adjustments.", 1.1),
    ("documented", "medium", "Confirm that notes were saved on the account.", 1.0),
    ("email", "medium", "Clarify outbound confirmation or follow-up channel.", 1.0),
    ("support", "medium", "Reinforce availability of help and follow-up.", 1.0),
    ("follow-up", "medium", "Set expectations on next contact or monitoring.", 1.0),
    ("summary", "medium", "Close the interaction with a recap of actions.", 1.0),
    ("thank you", "high", "Use professional gratitude at the close of the interaction.", 1.2),
    ("patience", "medium", "Acknowledge the customer's time while you investigate.", 1.0),
]


def _seed_id(kind: str, value: str) -> str:
    normalized = " ".join(value.strip().lower().split())
    return str(uuid.uuid5(_SEED_NAMESPACE, f"{kind}:{normalized}"))


def build_default_workspace_library(
    added_by_user_id: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    seeded_at = datetime.utcnow().isoformat()

    empathy_statements = [
        {
            "id": _seed_id("empathy", statement),
            "statement": statement,
            "category": category,
            "language": "en",
            "is_approved": True,
            "usage_count": 0,
            "added_by_user_id": added_by_user_id,
            "added_at": seeded_at,
            "seeded_from": "default_workspace_library",
            "seed_version": _SEED_VERSION,
        }
        for statement, category in _EMPATHY_SEEDS
    ]

    probing_questions = [
        {
            "id": _seed_id("probing", question),
            "question": question,
            "context": context,
            "department": department,
            "difficulty": difficulty,
            "is_approved": True,
            "added_by_user_id": added_by_user_id,
            "added_at": seeded_at,
            "seeded_from": "default_workspace_library",
            "seed_version": _SEED_VERSION,
        }
        for question, context, department, difficulty in _PROBING_SEEDS
    ]

    forbidden_words = [
        {
            "id": _seed_id("forbidden", word),
            "word": word,
            "reason": reason,
            "severity": severity,
            "replacement": replacement,
            "is_active": True,
            "added_by_user_id": added_by_user_id,
            "added_at": seeded_at,
            "seeded_from": "default_workspace_library",
            "seed_version": _SEED_VERSION,
        }
        for word, reason, severity, replacement in _FORBIDDEN_SEEDS
    ]

    required_keywords = [
        {
            "id": _seed_id("keyword", keyword),
            "keyword": keyword,
            "importance": importance,
            "context": context,
            "score_impact": score_impact,
            "added_by_user_id": added_by_user_id,
            "added_at": seeded_at,
            "seeded_from": "default_workspace_library",
            "seed_version": _SEED_VERSION,
        }
        for keyword, importance, context, score_impact in _KEYWORD_SEEDS
    ]

    return {
        "empathy_statements": empathy_statements,
        "probing_questions": probing_questions,
        "forbidden_words": forbidden_words,
        "required_keywords": required_keywords,
    }


def seed_workspace_library(
    workspace: Workspace,
    added_by_user_id: str | None = None,
    *,
    force: bool = False,
) -> dict[str, int | bool]:
    has_existing_content = any(
        bool(section)
        for section in (
            workspace.empathy_statements,
            workspace.probing_questions,
            workspace.forbidden_words,
            workspace.required_keywords,
        )
    )
    if has_existing_content:
        return {
            "changed": False,
            "seeded_empathy_statements": 0,
            "seeded_probing_questions": 0,
            "seeded_forbidden_words": 0,
            "seeded_required_keywords": 0,
        }

    if not force and workspace.created_at and workspace.updated_at:
        untouched_seconds = abs((workspace.updated_at - workspace.created_at).total_seconds())
        if untouched_seconds > 5:
            return {
                "changed": False,
                "seeded_empathy_statements": 0,
                "seeded_probing_questions": 0,
                "seeded_forbidden_words": 0,
                "seeded_required_keywords": 0,
            }

    library = build_default_workspace_library(added_by_user_id=added_by_user_id)
    workspace.empathy_statements = library["empathy_statements"]
    workspace.probing_questions = library["probing_questions"]
    workspace.forbidden_words = library["forbidden_words"]
    workspace.required_keywords = library["required_keywords"]
    workspace.updated_at = datetime.utcnow()

    return {
        "changed": True,
        "seeded_empathy_statements": len(library["empathy_statements"]),
        "seeded_probing_questions": len(library["probing_questions"]),
        "seeded_forbidden_words": len(library["forbidden_words"]),
        "seeded_required_keywords": len(library["required_keywords"]),
    }
