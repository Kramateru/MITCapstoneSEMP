import base64
import logging
import os
import re
from typing import Literal, Optional

import requests
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import User, UserRole

router = APIRouter(prefix="/api/support", tags=["support"])
logger = logging.getLogger(__name__)

GREETING = "Hello! I'm St. Peter Buddy. How can I assist you with the system today?"
ROLE_QUESTION = "Hi! I'm St. Peter Buddy. What is your role? (Trainee, Trainer, or Admin)"
HUMAN_SUPPORT_DESK = "stpetervelle2003@yahoo.com.ph"
SUPPORT_CHAT_MODEL = os.getenv("OPENAI_SUPPORT_MODEL", "gpt-4o-mini")
GEMINI_SUPPORT_MODEL = os.getenv("GEMINI_SUPPORT_MODEL", "gemini-2.5-flash")
GEMINI_TRANSCRIBE_MODEL = os.getenv("GEMINI_TRANSCRIBE_MODEL", "gemini-3-flash-preview")
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_TIMEOUT_SECONDS = 60
UNCLEAR_AUDIO_SENTINEL = "UNCLEAR_AUDIO"

ROLE_ALIASES = {
    "trainee": "trainee",
    "student": "trainee",
    "learner": "trainee",
    "trainer": "trainer",
    "coach": "trainer",
    "instructor": "trainer",
    "admin": "admin",
    "administrator": "admin",
    "system administrator": "admin",
    "super admin": "admin",
}

ROLE_FOCUS = {
    "trainee": (
        "I can help with assigned learning, MCQ tests, assessment records, coaching feedback, certificates, and "
        "speech-enabled practice tasks."
    ),
    "trainer": (
        "I can help with workspace tools, batch management, trainee management, microlearning delivery, MCQ workflows, "
        "grading, coaching, and live analytics."
    ),
    "admin": (
        "I can help with configuration, users, roles, certificate settings, LOB management, scenarios, coaching "
        "oversight, and analytics."
    ),
}

GLOBAL_ROUTE_GUIDES = (
    {
        "label": "Login",
        "path": "/login",
        "description": "Sign in with your assigned platform account.",
    },
    {
        "label": "St Peter Buddy",
        "path": "/support/chat",
        "description": "Open the shared AI support assistant.",
    },
)

ROLE_ROUTE_GUIDES = {
    "trainee": (
        {
            "label": "Dashboard",
            "path": "/trainee/dashboard",
            "description": "Review assigned work, current status, and trainee updates.",
        },
        {
            "label": "Microlearning",
            "path": "/trainee/microlearning",
            "description": "Open assigned microlearning lessons and save exercise responses.",
        },
        {
            "label": "My Coaching",
            "path": "/trainee/coaching",
            "description": "Read coaching feedback and acknowledgement items.",
        },
        {
            "label": "Progress",
            "path": "/trainee/progress",
            "description": "Track trainee performance, coaching logs, and assigned assessment progress.",
        },
        {
            "label": "My Certificate",
            "path": "/trainee/reports",
            "description": "Review issued certificate records and download PDFs.",
        },
        {
            "label": "MCQ",
            "path": "/trainee/mcq",
            "description": "Open assigned MCQ assessments and take the test.",
        },
        {
            "label": "Assessment",
            "path": "/trainee/assessment",
            "description": "Review saved assessment records, latest verdicts, and certificate status.",
        },
        {
            "label": "Settings",
            "path": "/trainee/settings",
            "description": "Update personal platform preferences and account options.",
        },
    ),
    "trainer": (
        {
            "label": "Dashboard",
            "path": "/trainer/dashboard",
            "description": "Open trainer summary metrics and recent activity.",
        },
        {
            "label": "Workspace",
            "path": "/trainer/workspace",
            "description": "Manage workspace language libraries and trainer NLP configuration.",
        },
        {
            "label": "Batches",
            "path": "/trainer/batches",
            "description": "Create, edit, delete, and manage trainer-owned batches.",
        },
        {
            "label": "Trainees",
            "path": "/trainer/users",
            "description": "Review and manage trainees assigned to trainer batches.",
        },
        {
            "label": "Microlearning",
            "path": "/trainer/courses",
            "description": "Create activities, assign microlearning to batches, and track delivery.",
        },
        {
            "label": "Grading",
            "path": "/trainer/grading",
            "description": "Review trainee interactions, transcripts, and trainer feedback actions.",
        },
        {
            "label": "MCQ",
            "path": "/trainer/mcq",
            "description": "Assign MCQ tests, monitor results, and manage the question bank.",
        },
        {
            "label": "Coaching",
            "path": "/trainer/coaching",
            "description": "Review coaching logs, trainee follow-up, and competency workflow.",
        },
        {
            "label": "Live Analytics",
            "path": "/trainer/realtime",
            "description": "Monitor live analytics, performance signals, and training activity.",
        },
        {
            "label": "Settings",
            "path": "/trainer/settings",
            "description": "Open trainer settings and preference controls.",
        },
    ),
    "admin": (
        {
            "label": "Dashboard",
            "path": "/admin/dashboard",
            "description": "Open the admin overview and platform summary.",
        },
        {
            "label": "Configuration",
            "path": "/admin/configuration",
            "description": "Manage system configuration and operational controls.",
        },
        {
            "label": "Scenarios",
            "path": "/admin/scenarios",
            "description": "Manage admin-owned scenarios and related content.",
        },
        {
            "label": "Certificate Settings",
            "path": "/admin/certification-settings",
            "description": "Configure certificate thresholds, signatory details, and issuance settings.",
        },
        {
            "label": "Users",
            "path": "/admin/users",
            "description": "Create, update, deactivate, and manage user roles.",
        },
        {
            "label": "LOB",
            "path": "/admin/lob",
            "description": "Manage lines of business and related mappings.",
        },
        {
            "label": "Coaching",
            "path": "/admin/coaching",
            "description": "Review coaching templates, compliance, and platform-wide coaching data.",
        },
        {
            "label": "Analytics",
            "path": "/admin/analytics",
            "description": "Review platform-wide analytics, reports, and performance trends.",
        },
    ),
}


class ChatHistoryMessage(BaseModel):
    sender: Literal["user", "bot"]
    text: str


class ChatRequest(BaseModel):
    message: str
    role: Optional[str] = None
    history: list[ChatHistoryMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    role: Optional[str] = None


class TranscriptionResponse(BaseModel):
    transcript: str


KNOWLEDGE_BASE = (
    {
        "title": "Login and access",
        "roles": ("trainee", "trainer", "admin"),
        "keywords": (
            "log in",
            "login",
            "sign in",
            "access account",
            "cannot login",
            "can't login",
            "unable to login",
        ),
        "answer": (
            "Use your assigned email and password on the login page. If the account still does not work, ask the "
            "role that manages your access: trainees should contact their trainer or admin, trainers should contact "
            "an admin, and admins should verify the deployment credentials or account status."
        ),
        "routes": ("/login",),
    },
    {
        "title": "Password reset",
        "roles": ("trainee", "trainer", "admin"),
        "keywords": ("forgot password", "reset password", "password issue", "change password"),
        "answer": (
            "Password recovery should be handled by the team that manages your access. Trainees should ask their "
            "trainer or admin, trainers should ask an admin, and admins should use the system's account-management "
            "workflow for credential updates."
        ),
        "routes": ("/login",),
    },
    {
        "title": "Microphone and speech troubleshooting",
        "roles": ("trainee", "trainer", "admin"),
        "keywords": (
            "microphone",
            "mic",
            "speech recognition",
            "voice recognition",
            "audio not working",
            "cannot hear",
            "speech not captured",
            "recording problem",
        ),
        "answer": (
            "For speech-enabled activities, confirm that the browser has microphone permission, the correct input "
            "device is selected, and background noise is low. A headset usually gives the most stable results. If a "
            "recording still fails, refresh the activity page and try the task again."
        ),
        "routes": ("/trainee/mcq", "/trainee/microlearning", "/trainer/grading"),
    },
    {
        "title": "Trainee learning access",
        "roles": ("trainee",),
        "keywords": (
            "training modules",
            "module",
            "learning material",
            "microlearning",
            "assigned lessons",
            "where are my lessons",
        ),
        "answer": (
            "Open the trainee dashboard to review what has been assigned, then use the Microlearning page to work on "
            "saved lessons. If the page is empty, your trainer has not assigned a lesson or batch activity to your "
            "account yet."
        ),
        "routes": ("/trainee/dashboard", "/trainee/microlearning"),
    },
    {
        "title": "Trainee MCQ tests",
        "roles": ("trainee",),
        "keywords": ("mcq", "test", "take the test", "quiz", "assessment questions", "retake", "submit mcq"),
        "answer": (
            "Use the trainee MCQ page to open assigned MCQ assessments. Select the assigned item, choose Take the "
            "Test, answer the questions, and submit when finished. Completed items may also appear with a retake "
            "option if that workflow is available to you."
        ),
        "routes": ("/trainee/mcq",),
    },
    {
        "title": "Trainee progress and coaching",
        "roles": ("trainee",),
        "keywords": (
            "progress",
            "scores",
            "grade",
            "coaching",
            "feedback",
            "acknowledge coaching",
            "performance hub",
        ),
        "answer": (
            "Use Progress to review performance snapshots, coaching logs, and assessment-related tracking. Use My "
            "Coaching when you need to review coach feedback or acknowledgement items tied to your activity records."
        ),
        "routes": ("/trainee/progress", "/trainee/coaching"),
    },
    {
        "title": "Trainee assessment records and certificates",
        "roles": ("trainee",),
        "keywords": (
            "certificate",
            "my certificate",
            "assessment record",
            "verdict",
            "download pdf",
            "verify certificate",
            "issued certificate",
        ),
        "answer": (
            "Use the Assessment page to review saved practice sessions, latest verdicts, and certificate status. Use "
            "My Certificate to preview issued certificates, verify records, and download the PDF copy when one has "
            "been issued."
        ),
        "routes": ("/trainee/assessment", "/trainee/reports"),
    },
    {
        "title": "Trainer workspace and language libraries",
        "roles": ("trainer",),
        "keywords": ("workspace", "nlp", "empathy statements", "probing questions", "forbidden words", "required keywords"),
        "answer": (
            "Use the trainer Workspace page to manage language libraries and related NLP configuration such as empathy "
            "statements, probing questions, forbidden words, and required keywords. Those changes are saved through "
            "the backend workflow for the active workspace."
        ),
        "routes": ("/trainer/workspace",),
    },
    {
        "title": "Trainer batches and trainees",
        "roles": ("trainer",),
        "keywords": (
            "batch",
            "wave",
            "trainee",
            "add trainee",
            "edit batch",
            "delete batch",
            "manage trainees",
            "assigned trainees",
        ),
        "answer": (
            "Use Batches to create, edit, delete, and organize trainer-owned batches or waves. Use Trainees to review "
            "the trainee accounts linked to those batches and manage their assignment context."
        ),
        "routes": ("/trainer/batches", "/trainer/users"),
    },
    {
        "title": "Trainer microlearning management",
        "roles": ("trainer",),
        "keywords": (
            "microlearning",
            "lesson",
            "activity",
            "assign activity",
            "saved activity",
            "batch assignment",
            "assessment lesson",
        ),
        "answer": (
            "Use the trainer Microlearning page to create saved activities, edit or delete them, assign one or more "
            "activity titles to a batch or wave, and monitor delivery progress. The assessment lesson panel also lets "
            "you create lessons based on the stored BPO assessment methods."
        ),
        "routes": ("/trainer/courses",),
    },
    {
        "title": "Trainer MCQ workflows",
        "roles": ("trainer",),
        "keywords": (
            "mcq",
            "question bank",
            "assign mcq",
            "results and coaching",
            "assignment center",
            "question bank manager",
            "mcq progress",
        ),
        "answer": (
            "Use the trainer MCQ workspace for three main functions: Assignment Center assigns questions and categories, "
            "Results and Coaching tracks completion and follow-up, and Question Bank Manager maintains categories and "
            "questions saved for trainer use."
        ),
        "routes": ("/trainer/mcq",),
    },
    {
        "title": "Trainer grading and coaching",
        "roles": ("trainer",),
        "keywords": (
            "grading",
            "review recordings",
            "interaction review",
            "feedback",
            "coaching",
            "grade trainees",
            "review trainee session",
        ),
        "answer": (
            "Use Grading to review trainee interactions, transcripts, recordings, and feedback actions. Use Coaching "
            "to manage follow-up logs, competency progress, and coaching communication after trainee work is reviewed."
        ),
        "routes": ("/trainer/grading", "/trainer/coaching"),
    },
    {
        "title": "Trainer analytics",
        "roles": ("trainer",),
        "keywords": ("analytics", "live analytics", "performance summary", "batch performance", "realtime"),
        "answer": (
            "Use Live Analytics to review trainer-facing performance signals, training activity, and other live or "
            "recent analytics tied to your assigned cohorts."
        ),
        "routes": ("/trainer/realtime",),
    },
    {
        "title": "Admin user and role management",
        "roles": ("admin",),
        "keywords": (
            "users",
            "create user",
            "user account",
            "deactivate user",
            "role assignment",
            "permissions",
            "manage users",
        ),
        "answer": (
            "Use the admin Users page to create accounts, update account details, activate or deactivate users, and "
            "manage role assignments for trainee, trainer, and admin access."
        ),
        "routes": ("/admin/users",),
    },
    {
        "title": "Admin configuration and LOB",
        "roles": ("admin",),
        "keywords": (
            "configuration",
            "system settings",
            "lob",
            "line of business",
            "platform setup",
            "system maintenance",
        ),
        "answer": (
            "Use Configuration for platform-level controls and setup tasks. Use LOB to manage line-of-business records "
            "and their related mappings across the system."
        ),
        "routes": ("/admin/configuration", "/admin/lob"),
    },
    {
        "title": "Admin certification settings",
        "roles": ("admin",),
        "keywords": (
            "certificate settings",
            "certificate threshold",
            "signatory",
            "certificate template",
            "certificate configuration",
        ),
        "answer": (
            "Use Certificate Settings to manage certificate thresholds, signatory details, templates, and other "
            "issuance settings used by the certification workflow."
        ),
        "routes": ("/admin/certification-settings",),
    },
    {
        "title": "Admin scenarios",
        "roles": ("admin",),
        "keywords": ("scenario", "manage scenario", "author scenario", "scenario content"),
        "answer": (
            "Use the admin Scenarios page to manage scenario content and other admin-controlled scenario workflows."
        ),
        "routes": ("/admin/scenarios",),
    },
    {
        "title": "Admin analytics and coaching oversight",
        "roles": ("admin",),
        "keywords": (
            "analytics",
            "reports",
            "platform analytics",
            "coaching oversight",
            "coaching compliance",
            "overall performance",
        ),
        "answer": (
            "Use Analytics for platform-wide reporting and performance trends. Use Coaching to review coaching "
            "templates, compliance, and system-wide coaching records."
        ),
        "routes": ("/admin/analytics", "/admin/coaching"),
    },
)

TRAINEE_RESTRICTED_KEYWORDS = (
    "admin",
    "trainer-only",
    "batch management",
    "create user",
    "deactivate user",
    "system configuration",
    "certificate settings",
    "user roles",
    "permissions",
    "line of business",
    "manage trainees",
)

TRAINER_RESTRICTED_KEYWORDS = (
    "admin-only",
    "system configuration",
    "certificate settings",
    "line of business",
    "create user",
    "deactivate user",
    "role assignment",
    "user permissions",
    "platform analytics for all users",
)

STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "can",
    "do",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "me",
    "my",
    "of",
    "on",
    "or",
    "the",
    "to",
    "what",
    "where",
    "with",
}

SYSTEM_PROMPT = """
You are St. Peter Buddy, the official support assistant for the Speech-Enabled BPO Platform.

Rules:
- Answer platform questions for the authenticated role only.
- Use the supplied role, route guide, and platform knowledge as the source of truth.
- You may answer beyond exact FAQ wording if the route guide and feature summaries support the answer.
- Use recent chat history to resolve follow-up questions.
- Never leak trainer-only or admin-only details to lower roles.
- Write answers in short, easy-to-follow numbered steps whenever possible.
- Keep replies concise, direct, practical, and easy for non-technical users to follow.
- When navigation helps, include exact route paths inside the steps.
- If a question belongs to another role, clearly say which role owns it and tell the user to contact that role.
- If the question is outside the platform or truly unsupported, say so briefly and direct the user to the Human Support Desk.
- Do not invent database records, permissions, or pages that are not present in the supplied knowledge.
"""


def _normalize_role(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return ROLE_ALIASES.get(value.strip().lower())


def _extract_role_from_message(message: str) -> Optional[str]:
    text = message.strip().lower()
    if not text:
        return None

    for alias, role in ROLE_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", text):
            return role
    return None


def _is_role_declaration(message: str) -> bool:
    cleaned = re.sub(r"[^a-z\s]", " ", message.lower())
    cleaned = " ".join(cleaned.split())
    return cleaned in {
        "trainee",
        "trainer",
        "admin",
        "administrator",
        "i am trainee",
        "i am trainer",
        "i am admin",
        "my role is trainee",
        "my role is trainer",
        "my role is admin",
    }


def _get_authenticated_role(request: Request, db: Session) -> Optional[str]:
    authorization = request.headers.get("Authorization")
    if not authorization:
        return None

    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            return None
        token_data = auth_utils.decode_token(token)
    except Exception:
        return None

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user or not user.is_active:
        return None

    role_value = user.role.value if isinstance(user.role, UserRole) else str(user.role)
    return _normalize_role(role_value)


def _role_confirmation(role: str) -> str:
    return f"{GREETING} {ROLE_FOCUS[role]}"


def _all_route_guides(role: str) -> tuple[dict[str, str], ...]:
    return GLOBAL_ROUTE_GUIDES + ROLE_ROUTE_GUIDES.get(role, ())


def _route_lookup(role: str) -> dict[str, dict[str, str]]:
    return {item["path"]: item for item in _all_route_guides(role)}


def _lowercase_first(value: str) -> str:
    if not value:
        return value
    return value[:1].lower() + value[1:]


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for item in items:
        normalized = item.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)
    return deduped


def _format_numbered_steps(steps: list[str]) -> str:
    return "\n".join(f"{index}. {step.rstrip('.')}" for index, step in enumerate(steps, start=1))


def _answer_to_steps(answer: str) -> list[str]:
    expanded = answer.replace("; ", ". ").replace(" then ", ". Then ")
    segments = [
        segment.strip()
        for segment in re.split(r"(?<=[.?!])\s+", expanded)
        if segment.strip()
    ]
    return _dedupe([segment.rstrip(".") for segment in segments])


def _route_to_step(route: dict[str, str]) -> str:
    return f"Open {route['path']} to {_lowercase_first(route['description'].rstrip('.'))}"


def _contact_role_steps(role: str) -> list[str]:
    if role == "trainee":
        return [
            "Contact your trainer for the workflow or content request",
            "If the issue is about account access, permissions, or system settings, ask your admin",
            f"If you still need platform help after that, contact the Human Support Desk at {HUMAN_SUPPORT_DESK}",
        ]

    if role == "trainer":
        return [
            "Contact your admin for this request",
            "Share the exact page, action, and result you were expecting",
            f"If the issue is still unresolved, contact the Human Support Desk at {HUMAN_SUPPORT_DESK}",
        ]

    return [
        f"Contact the Human Support Desk at {HUMAN_SUPPORT_DESK}",
        "Include the page name, action, and any error message in your request",
    ]


def _tokenize(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", value.lower())
        if token not in STOP_WORDS and len(token) > 1
    }


def _build_role_help_reply(role: str) -> str:
    highlights = list(ROLE_ROUTE_GUIDES.get(role, ()))[:5]
    steps = [
        f"Start with {_route_to_step(item)}"
        for item in highlights
    ]
    return (
        f"{GREETING} {ROLE_FOCUS[role]}\n\n"
        "Use these steps to find the right area:\n"
        f"{_format_numbered_steps(steps)}"
    )


def _build_navigation_reply(role: str) -> str:
    steps = [_route_to_step(item) for item in _all_route_guides(role)]
    return (
        f"{role.capitalize()} navigation is organized like this:\n"
        f"{_format_numbered_steps(steps)}"
    )


def _handle_restricted_scope(role: str, text: str) -> Optional[str]:
    if role == "trainee" and any(keyword in text for keyword in TRAINEE_RESTRICTED_KEYWORDS):
        return (
            "That request belongs to trainer or admin access, so I should not guide you through it directly.\n\n"
            f"{_format_numbered_steps(_contact_role_steps(role))}"
        )

    if role == "trainer" and any(keyword in text for keyword in TRAINER_RESTRICTED_KEYWORDS):
        return (
            "That request belongs to admin access, so I should not guide you through it directly.\n\n"
            f"{_format_numbered_steps(_contact_role_steps(role))}"
        )

    return None


def _handle_shared_questions(role: str, text: str) -> Optional[str]:
    if not text:
        return _build_role_help_reply(role)

    if re.search(r"\b(hello|hi|hey)\b", text) or "good morning" in text or "good afternoon" in text:
        return _role_confirmation(role)

    if any(phrase in text for phrase in ("what can you do", "how can you help", "help me", "faq")):
        return _build_role_help_reply(role)

    if any(word in text for word in ("where", "navigate", "menu", "page", "go to", "open")):
        return _build_navigation_reply(role)

    return None


def _score_entry(role: str, message: str, message_tokens: set[str], entry: dict) -> int:
    if role not in entry["roles"]:
        return 0

    score = 0
    title_tokens = _tokenize(entry["title"])
    score += len(message_tokens & title_tokens)

    for keyword in entry["keywords"]:
        keyword_value = keyword.lower()
        if keyword_value in message:
            score += 10 + len(keyword_value.split())
        else:
            score += len(message_tokens & _tokenize(keyword_value))

    return score


def _find_relevant_entries(role: str, message: str, limit: int = 3) -> list[dict]:
    normalized_message = message.lower()
    message_tokens = _tokenize(normalized_message)
    ranked: list[tuple[int, dict]] = []

    for entry in KNOWLEDGE_BASE:
        score = _score_entry(role, normalized_message, message_tokens, entry)
        if score > 0:
            ranked.append((score, entry))

    ranked.sort(key=lambda item: item[0], reverse=True)
    if not ranked:
        return []

    top_score = ranked[0][0]
    threshold = max(2, top_score - 3)
    return [entry for score, entry in ranked if score >= threshold][:limit]


def _score_route(message: str, message_tokens: set[str], route: dict[str, str]) -> int:
    route_text = f"{route['label']} {route['path']} {route['description']}".lower()
    route_tokens = _tokenize(route_text)
    score = len(message_tokens & route_tokens)
    if route["path"].lower() in message:
        score += 12
    if route["label"].lower() in message:
        score += 10
    return score


def _find_relevant_routes(role: str, message: str, limit: int = 4) -> list[dict[str, str]]:
    normalized_message = message.lower()
    message_tokens = _tokenize(normalized_message)
    ranked: list[tuple[int, dict[str, str]]] = []

    for route in _all_route_guides(role):
        score = _score_route(normalized_message, message_tokens, route)
        if score > 0:
            ranked.append((score, route))

    ranked.sort(key=lambda item: item[0], reverse=True)
    if not ranked:
        return []

    top_score = ranked[0][0]
    threshold = max(2, top_score - 2)
    return [route for score, route in ranked if score >= threshold][:limit]


def _merge_route_matches(role: str, entries: list[dict], routes: list[dict[str, str]]) -> list[dict[str, str]]:
    lookup = _route_lookup(role)
    merged: list[dict[str, str]] = []
    seen_paths: set[str] = set()

    for route in routes:
        if route["path"] not in seen_paths:
            merged.append(route)
            seen_paths.add(route["path"])

    for entry in entries:
        for path in entry.get("routes", ()):
            route = lookup.get(path)
            if route and route["path"] not in seen_paths:
                merged.append(route)
                seen_paths.add(route["path"])

    return merged[:4]


def _format_routes(routes: list[dict[str, str]]) -> str:
    return "\n".join(f"- {route['path']} - {route['description']}" for route in routes)


def _compose_rule_based_reply(role: str, message: str) -> str:
    entries = _find_relevant_entries(role, message)
    routes = _merge_route_matches(role, entries, _find_relevant_routes(role, message))

    if not entries and not routes:
        steps = [
            "Ask the question using the page name, task, or workflow you are trying to complete",
            "If the request belongs to another role, contact the correct role for that action",
            f"If you still need help, contact the Human Support Desk at {HUMAN_SUPPORT_DESK}",
        ]
        return (
            f"{_build_role_help_reply(role)}\n\n"
            "I could not match that request to a saved workflow yet.\n"
            f"{_format_numbered_steps(steps)}"
        )

    steps: list[str] = []

    for entry in entries[:2]:
        steps.extend(_answer_to_steps(entry["answer"]))

    sections = [f"Follow these steps:\n{_format_numbered_steps(_dedupe(steps))}"]

    if routes:
        route_steps = [_route_to_step(route) for route in routes]
        sections.append(f"Helpful pages:\n{_format_numbered_steps(_dedupe(route_steps))}")

    return "\n\n".join(sections)


def _build_knowledge_context(role: str, message: str) -> str:
    entries = _find_relevant_entries(role, message, limit=4)
    routes = _merge_route_matches(role, entries, _find_relevant_routes(role, message, limit=5))

    parts = [
        f"Role focus: {ROLE_FOCUS[role]}",
        "Primary route guide:",
        _format_routes(list(_all_route_guides(role))),
    ]

    if entries:
        parts.append("Relevant platform knowledge:")
        for entry in entries:
            parts.append(f"- {entry['title']}: {entry['answer']}")

    if routes:
        parts.append("Most relevant routes for this question:")
        parts.append(_format_routes(routes))

    return "\n\n".join(parts)


def _build_system_prompt(role: str, knowledge_context: str) -> str:
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"Current identified role: {role.capitalize()}\n"
        f"Human Support Desk: {HUMAN_SUPPORT_DESK}\n\n"
        f"Platform knowledge context:\n{knowledge_context}\n\n"
        "If the role is already known, do not ask for it again. Answer directly. "
        "When the question is about navigation, give the exact route path. "
        "When a question is broad, combine the best matching workflow guidance and route suggestions. "
        "Default to numbered steps."
    )


def _history_to_openai_messages(history: list[ChatHistoryMessage]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for item in history[-8:]:
        text = (item.text or "").strip()
        if not text:
            continue
        messages.append(
            {
                "role": "assistant" if item.sender == "bot" else "user",
                "content": text[:1200],
            }
        )
    return messages


def _history_to_gemini_contents(history: list[ChatHistoryMessage]) -> list[dict[str, object]]:
    contents: list[dict[str, object]] = []
    for item in history[-8:]:
        text = (item.text or "").strip()
        if not text:
            continue
        contents.append(
            {
                "role": "model" if item.sender == "bot" else "user",
                "parts": [{"text": text[:1200]}],
            }
        )
    return contents


def _extract_text_from_gemini_response(payload: dict) -> Optional[str]:
    text_parts: list[str] = []

    for candidate in payload.get("candidates", []):
        content = candidate.get("content", {})
        for part in content.get("parts", []):
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())

    if not text_parts:
        return None

    return "\n".join(text_parts).strip()


def _gemini_generate(
    *,
    model: str,
    contents: list[dict[str, object]],
    generation_config: Optional[dict[str, object]] = None,
) -> Optional[str]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    payload: dict[str, object] = {"contents": contents}
    if generation_config:
        payload["generationConfig"] = generation_config

    try:
        response = requests.post(
            f"{GEMINI_API_BASE}/{model}:generateContent",
            params={"key": api_key},
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=GEMINI_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return _extract_text_from_gemini_response(response.json())
    except Exception:
        logger.exception("Gemini request failed for model %s", model)
        return None


def _openai_reply(
    api_key: str,
    role: str,
    message: str,
    history: list[ChatHistoryMessage],
    knowledge_context: str,
) -> Optional[str]:
    openai_messages = [
        {"role": "system", "content": _build_system_prompt(role, knowledge_context)},
        *_history_to_openai_messages(history),
        {"role": "user", "content": message},
    ]

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        completion = client.chat.completions.create(
            model=SUPPORT_CHAT_MODEL,
            temperature=0.1,
            messages=openai_messages,
        )
        answer = completion.choices[0].message.content
        if isinstance(answer, str) and answer.strip():
            return answer.strip()
    except Exception:
        try:
            import openai

            openai.api_key = api_key
            completion = openai.ChatCompletion.create(
                model=SUPPORT_CHAT_MODEL,
                temperature=0.1,
                messages=openai_messages,
            )
            answer = completion.choices[0].message.content
            if isinstance(answer, str) and answer.strip():
                return answer.strip()
        except Exception:
            return None

    return None


def _gemini_reply(
    role: str,
    message: str,
    history: list[ChatHistoryMessage],
    knowledge_context: str,
) -> Optional[str]:
    prompt = (
        f"{_build_system_prompt(role, knowledge_context)}\n\n"
        f"User question:\n{message}"
    )
    return _gemini_generate(
        model=GEMINI_SUPPORT_MODEL,
        contents=[
            *_history_to_gemini_contents(history),
            {"role": "user", "parts": [{"text": prompt}]},
        ],
        generation_config={
            "temperature": 0.1,
            "responseMimeType": "text/plain",
        },
    )


def _gemini_transcribe_audio(audio_bytes: bytes, mime_type: str) -> Optional[str]:
    prompt = (
        "Transcribe this short support question from the user. "
        f"Return only the spoken words as plain text. If the audio is unclear, empty, or not speech, return exactly {UNCLEAR_AUDIO_SENTINEL}."
    )
    encoded_audio = base64.b64encode(audio_bytes).decode("utf-8")
    transcript = _gemini_generate(
        model=GEMINI_TRANSCRIBE_MODEL,
        contents=[
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": encoded_audio,
                        }
                    },
                ],
            }
        ],
        generation_config={
            "temperature": 0,
            "responseMimeType": "text/plain",
        },
    )
    if not transcript:
        return None

    return transcript.strip().strip('"').strip()


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_support_audio(audio: UploadFile = File(...)):
    """Transcribe a short spoken support question using Gemini audio understanding."""
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="Voice transcription is unavailable because GEMINI_API_KEY is not configured.",
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio data was received.")

    if len(audio_bytes) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="The recorded audio is too large. Please keep the voice question under 20 MB.",
        )

    mime_type = (audio.content_type or "audio/webm").split(";")[0].strip() or "audio/webm"
    transcript = _gemini_transcribe_audio(audio_bytes, mime_type)
    if not transcript or transcript.upper() == UNCLEAR_AUDIO_SENTINEL:
        raise HTTPException(
            status_code=400,
            detail="I could not understand the recording. Please try again in a quieter place and speak clearly.",
        )

    return TranscriptionResponse(transcript=transcript)


@router.post("/chat", response_model=ChatResponse)
def chat(request_body: ChatRequest, request: Request, db: Session = Depends(get_db)):
    """Role-aware St. Peter Buddy support assistant for trainee, trainer, and admin users."""
    message = (request_body.message or "").strip()

    authenticated_role = _get_authenticated_role(request, db)
    requested_role = _normalize_role(request_body.role)
    inferred_role = _extract_role_from_message(message)
    role = authenticated_role or requested_role or inferred_role

    if not role:
        return ChatResponse(reply=ROLE_QUESTION)

    if _is_role_declaration(message):
        return ChatResponse(reply=_role_confirmation(role), role=role)

    restricted_reply = _handle_restricted_scope(role, message.lower())
    if restricted_reply:
        return ChatResponse(reply=restricted_reply, role=role)

    shared_reply = _handle_shared_questions(role, message.lower())
    if shared_reply:
        return ChatResponse(reply=shared_reply, role=role)

    knowledge_context = _build_knowledge_context(role, message)
    
    # Try Gemini first
    gemini_reply = _gemini_reply(role, message, request_body.history, knowledge_context)
    if gemini_reply:
        return ChatResponse(reply=gemini_reply, role=role)
    
    # Fallback to OpenAI
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        ai_reply = _openai_reply(api_key, role, message, request_body.history, knowledge_context)
        if ai_reply:
            return ChatResponse(reply=ai_reply, role=role)

    return ChatResponse(reply=_compose_rule_based_reply(role, message), role=role)
