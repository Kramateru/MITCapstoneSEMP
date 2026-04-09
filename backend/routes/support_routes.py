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

GREETING = "Hello. I am St. Peter Buddy."
ROLE_QUESTION = "Hello. I am St. Peter Buddy. Please confirm your role: Trainee, Trainer, or Admin."
HUMAN_SUPPORT_DESK = "stpetervelle2003@yahoo.com.ph"
SENIOR_SUPERVISOR_FALLBACK = (
    "I am unable to find that specific detail in our BPO manual. Let me route you to a Senior Supervisor."
)
SUPPORT_CHAT_MODEL = os.getenv("OPENAI_SUPPORT_MODEL", "gpt-4o-mini")
GEMINI_SUPPORT_MODEL = os.getenv("GEMINI_SUPPORT_MODEL", "gemini-2.5-flash")
GEMINI_TRANSCRIBE_MODEL = os.getenv("GEMINI_TRANSCRIBE_MODEL", "gemini-3-flash-preview")
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_TIMEOUT_SECONDS = 60
UNCLEAR_AUDIO_SENTINEL = "UNCLEAR_AUDIO"
MAX_CONCISE_WORDS = 100

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
        "I can help with learning modules, simplified St. Peter plan guidance, and Speech Enabled BPO Platform navigation."
    ),
    "trainer": (
        "I can help with teaching materials, coaching workflows, performance metrics, routing decisions, and platform guidance."
    ),
    "admin": (
        "I can help with system health summaries, routing oversight, department visibility, and sensitive operational guidance."
    ),
}

ROLE_ACCESS_SUMMARY = {
    "trainee": "Restricted access. Focus on learning modules, basic plan FAQs, and BPO platform navigation only.",
    "trainer": "Elevated access. Can review teaching guidance, performance metrics, and routing procedures.",
    "admin": "Full access. Can review system health, department routing logs, and sensitive oversight details.",
}

ROUTE_DEFINITIONS = {
    "CLAIMS": {
        "department": "Claims & Benefits",
        "reason": "Urgent death benefit, bereavement, or plan activation request.",
        "phrases": (
            "death claim",
            "death benefit",
            "benefit claim",
            "claim activation",
            "plan activation",
            "passed away",
            "deceased",
            "died",
            "funeral assistance",
            "burial assistance",
            "memorial claim",
        ),
    },
    "SALES": {
        "department": "Sales/Marketing",
        "reason": "Pricing, promos, availability, or new plan purchase request.",
        "phrases": (
            "price",
            "pricing",
            "how much",
            "cost",
            "buy",
            "purchase",
            "new plan",
            "avail",
            "availability",
            "promo",
            "quotation",
            "quote",
            "st anne",
            "st. anne",
            "st bernadette",
            "st. bernadette",
        ),
    },
    "CUSTOMER_ACCOUNTS": {
        "department": "Customer Accounts",
        "reason": "Existing plan payment, billing, receipt, or member account update request.",
        "phrases": (
            "existing plan",
            "payment",
            "billing",
            "installment",
            "due date",
            "receipt",
            "official receipt",
            "account update",
            "update my plan",
            "change beneficiary",
            "change address",
            "missed payment",
            "plan update",
        ),
    },
    "IT_SUPPORT": {
        "department": "IT Support",
        "reason": "Speech Enabled BPO Platform issue, bug, microphone problem, or system error.",
        "phrases": (
            "platform bug",
            "system bug",
            "error message",
            "not loading",
            "crash",
            "broken",
            "system down",
            "website issue",
            "microphone not working",
            "voice not working",
            "audio not working",
            "speech enabled bpo platform",
            "technical issue",
        ),
    },
}

ROUTE_TAG_PATTERN = re.compile(r"\[ROUTE:\s*([A-Z_]+)\s*\]", re.IGNORECASE)

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
            "label": "Sim Floor",
            "path": "/trainee/sim-floor",
            "description": "Practice assigned Sim Floor scenarios and submit speech-enabled responses.",
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
            "label": "Trainee Status",
            "path": "/trainee/status",
            "description": "View all registered trainees and manage your own active or inactive account status.",
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
            "label": "Batches",
            "path": "/trainer/batches",
            "description": "Create, edit, delete, and manage trainer-owned batches.",
        },
        {
            "label": "Trainees",
            "path": "/trainer/users",
            "description": "Review all registered trainees, update active or inactive status, and manage batch assignment.",
        },
        {
            "label": "Microlearning",
            "path": "/trainer/courses",
            "description": "Create activities, assign microlearning to batches, and track delivery.",
        },
        {
            "label": "MCQ",
            "path": "/trainer/mcq",
            "description": "Assign MCQ tests, monitor results, and manage the question bank.",
        },
        {
            "label": "Sim Floor",
            "path": "/trainer/sim-floor",
            "description": "Monitor trainer-side Sim Floor scenario activity and participation.",
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
            "label": "Report",
            "path": "/trainer/reports",
            "description": "Review trainer-facing reports and exported cohort summaries.",
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
    route_tag: Optional[str] = None
    route_department: Optional[str] = None


class TranscriptionResponse(BaseModel):
    transcript: str


DEATHCARE_KNOWLEDGE_BASE = (
    {
        "title": "General St. Peter Buddy purpose",
        "roles": ("trainee", "trainer", "admin"),
        "keywords": (
            "st peter buddy",
            "st. peter buddy",
            "what can you do",
            "deathcare support",
            "life plan",
            "chapels",
        ),
        "answer": (
            "St. Peter Buddy gives concise plan guidance, routing help, and Speech Enabled BPO Platform support. "
            "For prices, claims, existing account updates, or platform bugs, I will direct you to the correct department."
        ),
        "routes": ("/support/chat",),
    },
    {
        "title": "Basic plan FAQ",
        "roles": ("trainee", "trainer", "admin"),
        "keywords": (
            "plan faq",
            "basic plan",
            "memorial plan",
            "life plan details",
            "plan information",
            "st gregory",
            "st george",
        ),
        "answer": (
            "I can share basic plan orientation only. Exact contract terms, prices, and benefit specifics should be "
            "confirmed by the proper department so we do not give inaccurate deathcare information."
        ),
        "routes": ("/support/chat",),
    },
    {
        "title": "Trainer teaching support",
        "roles": ("trainer",),
        "keywords": (
            "teaching materials",
            "trainer guide",
            "coaching materials",
            "performance metrics",
            "routing procedure",
        ),
        "answer": (
            "Use St. Peter Buddy for teaching guidance, routing simulations, and concise performance-related answers. "
            "Sensitive claims outcomes and admin-only system oversight should still be escalated appropriately."
        ),
        "routes": ("/trainer/dashboard", "/support/chat"),
    },
    {
        "title": "Admin oversight",
        "roles": ("admin",),
        "keywords": (
            "system health",
            "routing log",
            "department routing",
            "sensitive data",
            "oversight",
        ),
        "answer": (
            "Admins may review system health summaries, routing visibility, and sensitive operational context inside "
            "the platform. Detailed case handling still belongs to the responsible business department."
        ),
        "routes": ("/admin/dashboard", "/support/chat"),
    },
)

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
        "routes": ("/trainee/mcq", "/trainee/microlearning", "/trainer/coaching"),
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
        "title": "Trainer trainee status and class access",
        "roles": ("trainer",),
        "keywords": (
            "trainee status",
            "activate trainee",
            "deactivate trainee",
            "inactive trainee",
            "reactivate trainee",
            "manage trainees",
        ),
        "answer": (
            "Use the Trainees page to review every registered trainee in the system, toggle accounts between active "
            "and inactive, and manage which batch or wave each trainee belongs to. Inactive trainees stay visible in "
            "the roster so trainers can reactivate them later when needed."
        ),
        "routes": ("/trainer/users",),
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
        "title": "Trainer coaching review and follow-up",
        "roles": ("trainer",),
        "keywords": (
            "coaching",
            "review recordings",
            "interaction review",
            "feedback",
            "review trainee session",
            "session review",
        ),
        "answer": (
            "Use Coaching to review trainee interactions, transcripts, recordings, competency progress, and follow-up "
            "logs after trainee work is submitted. This is the trainer workflow for reviewing attempts and managing "
            "next-step coaching communication."
        ),
        "routes": ("/trainer/coaching",),
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
    "performance metrics",
    "system health",
    "routing log",
    "department routing",
    "sensitive data",
    "system override",
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
    "system health",
    "routing log",
    "department routing",
    "sensitive data",
    "routing oversight",
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
You are St. Peter Buddy, the primary AI interface for St. Peter Life Plan and Chapels inside the Speech-Enabled BPO Platform.

Rules:
- Answer only within the identified role scope.
- Trainees get simplified coaching, basic plan FAQs, and platform navigation.
- Trainers get advanced teaching guidance, performance context, and routing procedures.
- Admins may receive system health, routing oversight, and sensitive operational summaries.
- Keep replies under 100 words unless documentation is explicitly requested.
- Keep wording compassionate, professional, precise, and optimized for text to speech.
- Do not invent prices, benefits, claim outcomes, contract details, or hidden system data.
- If routing is required, put one tag on the first line only: [ROUTE: SALES], [ROUTE: CUSTOMER_ACCOUNTS], [ROUTE: CLAIMS], or [ROUTE: IT_SUPPORT].
- If you do not know a specific answer, say exactly: "I am unable to find that specific detail in our BPO manual. Let me route you to a Senior Supervisor."
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


def _get_role_from_header(request: Request) -> Optional[str]:
    for header_name in ("User_Role", "User-Role", "X-User-Role"):
        role = _normalize_role(request.headers.get(header_name))
        if role:
            return role
    return None


def _is_documentation_request(message: str) -> bool:
    lowered = message.lower()
    return any(
        phrase in lowered
        for phrase in (
            "documentation",
            "document this",
            "full process",
            "full procedure",
            "detailed procedure",
            "step by step guide",
            "manual",
        )
    )


def _limit_words(value: str, limit: int = MAX_CONCISE_WORDS) -> str:
    words = re.findall(r"\S+", value)
    if len(words) <= limit:
        return value.strip()

    trimmed = " ".join(words[:limit]).rstrip(" ,;:-")
    if not trimmed.endswith((".", "!", "?")):
        trimmed += "..."
    return trimmed


def _clean_reply_text(value: str) -> str:
    if not value:
        return ""

    normalized_lines = [" ".join(line.split()) for line in value.strip().splitlines()]
    compact = "\n".join(line for line in normalized_lines if line)
    compact = re.sub(r"\n{3,}", "\n\n", compact)
    return compact.strip()


def _resolve_route_department(route_tag: Optional[str]) -> Optional[str]:
    if not route_tag:
        return None
    definition = ROUTE_DEFINITIONS.get(route_tag.upper())
    if not definition:
        return None
    return str(definition["department"])


def _extract_route_tag(reply: str) -> tuple[str, Optional[str]]:
    if not reply:
        return "", None

    matches = [match.upper() for match in ROUTE_TAG_PATTERN.findall(reply)]
    route_tag = next((match for match in reversed(matches) if match in ROUTE_DEFINITIONS), None)
    cleaned = _clean_reply_text(ROUTE_TAG_PATTERN.sub("", reply))
    return cleaned, route_tag


def _finalize_reply(
    *,
    message: str,
    reply: str,
    route_tag: Optional[str] = None,
) -> tuple[str, Optional[str], Optional[str]]:
    cleaned_reply, extracted_route_tag = _extract_route_tag(reply)
    resolved_route_tag = route_tag or extracted_route_tag

    if not cleaned_reply:
        cleaned_reply = SENIOR_SUPERVISOR_FALLBACK

    if not _is_documentation_request(message):
        cleaned_reply = _limit_words(cleaned_reply)

    route_department = _resolve_route_department(resolved_route_tag)
    return cleaned_reply, resolved_route_tag, route_department


def _contains_route_phrase(message: str, phrases: tuple[str, ...]) -> bool:
    normalized = " ".join(message.lower().split())
    return any(phrase in normalized for phrase in phrases)


def _detect_department_route(message: str) -> Optional[dict[str, str]]:
    normalized = " ".join(message.lower().split())
    if not normalized:
        return None

    if _contains_route_phrase(normalized, ROUTE_DEFINITIONS["CLAIMS"]["phrases"]):
        return {"tag": "CLAIMS", **ROUTE_DEFINITIONS["CLAIMS"]}

    if _contains_route_phrase(normalized, ROUTE_DEFINITIONS["SALES"]["phrases"]):
        return {"tag": "SALES", **ROUTE_DEFINITIONS["SALES"]}

    if _contains_route_phrase(normalized, ROUTE_DEFINITIONS["CUSTOMER_ACCOUNTS"]["phrases"]):
        return {"tag": "CUSTOMER_ACCOUNTS", **ROUTE_DEFINITIONS["CUSTOMER_ACCOUNTS"]}

    if _contains_route_phrase(normalized, ROUTE_DEFINITIONS["IT_SUPPORT"]["phrases"]):
        return {"tag": "IT_SUPPORT", **ROUTE_DEFINITIONS["IT_SUPPORT"]}

    return None


def _build_department_route_reply(role: str, route: dict[str, str]) -> str:
    tag = route["tag"]
    department = route["department"]

    if tag == "CLAIMS":
        reply = (
            f"This needs {department}. Please route death benefit or plan activation concerns immediately. "
            "Include the member name, plan reference, and urgency if available."
        )
    elif tag == "SALES":
        reply = (
            f"This belongs to {department}. Please route pricing, promos, availability, or new St. Anne and "
            "St. Bernadette plan requests to that team."
        )
    elif tag == "CUSTOMER_ACCOUNTS":
        reply = (
            f"This looks like a {department} concern. Please route existing plan payment, billing, receipt, or "
            "account update requests to that department."
        )
    else:
        reply = (
            f"This appears to be an {department} issue. Please route the case with the page name, device, browser, "
            "and any error or microphone details."
        )

    if role in {"trainer", "admin"} and tag != "IT_SUPPORT":
        reply += " Log the handoff reason for follow-up."

    return reply


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

    for entry in DEATHCARE_KNOWLEDGE_BASE + KNOWLEDGE_BASE:
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
        return SENIOR_SUPERVISOR_FALLBACK

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
        f"Access level: {ROLE_ACCESS_SUMMARY[role]}",
        "Department routing rules:",
        "- [ROUTE: CLAIMS] for death benefits, plan activation, or urgent bereavement support.",
        "- [ROUTE: SALES] for new plans, pricing, promos, and St. Anne or St. Bernadette purchase requests.",
        "- [ROUTE: CUSTOMER_ACCOUNTS] for existing plan payments, billing, receipts, or account updates.",
        "- [ROUTE: IT_SUPPORT] for Speech Enabled BPO Platform bugs or technical issues.",
        "Primary route guide:",
        _format_routes(list(_all_route_guides(role))),
    ]

    if entries:
        parts.append("Relevant platform and deathcare knowledge:")
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
        "If a department route clearly applies, use the route tag on the first line and keep the explanation short. "
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
    header_role = _get_role_from_header(request)
    requested_role = _normalize_role(request_body.role)
    inferred_role = _extract_role_from_message(message)
    role = authenticated_role or header_role or requested_role or inferred_role

    if not role:
        return ChatResponse(reply=ROLE_QUESTION)

    if _is_role_declaration(message):
        reply, route_tag, route_department = _finalize_reply(
            message=message,
            reply=_role_confirmation(role),
        )
        return ChatResponse(
            reply=reply,
            role=role,
            route_tag=route_tag,
            route_department=route_department,
        )

    restricted_reply = _handle_restricted_scope(role, message.lower())
    if restricted_reply:
        reply, route_tag, route_department = _finalize_reply(
            message=message,
            reply=restricted_reply,
        )
        return ChatResponse(
            reply=reply,
            role=role,
            route_tag=route_tag,
            route_department=route_department,
        )

    routed_department = _detect_department_route(message)
    if routed_department:
        reply, route_tag, route_department = _finalize_reply(
            message=message,
            reply=_build_department_route_reply(role, routed_department),
            route_tag=routed_department["tag"],
        )
        return ChatResponse(
            reply=reply,
            role=role,
            route_tag=route_tag,
            route_department=route_department,
        )

    shared_reply = _handle_shared_questions(role, message.lower())
    if shared_reply:
        reply, route_tag, route_department = _finalize_reply(
            message=message,
            reply=shared_reply,
        )
        return ChatResponse(
            reply=reply,
            role=role,
            route_tag=route_tag,
            route_department=route_department,
        )

    knowledge_context = _build_knowledge_context(role, message)

    # Try Gemini first
    gemini_reply = _gemini_reply(role, message, request_body.history, knowledge_context)
    if gemini_reply:
        reply, route_tag, route_department = _finalize_reply(
            message=message,
            reply=gemini_reply,
        )
        return ChatResponse(
            reply=reply,
            role=role,
            route_tag=route_tag,
            route_department=route_department,
        )

    # Fallback to OpenAI
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        ai_reply = _openai_reply(api_key, role, message, request_body.history, knowledge_context)
        if ai_reply:
            reply, route_tag, route_department = _finalize_reply(
                message=message,
                reply=ai_reply,
            )
            return ChatResponse(
                reply=reply,
                role=role,
                route_tag=route_tag,
                route_department=route_department,
            )

    reply, route_tag, route_department = _finalize_reply(
        message=message,
        reply=_compose_rule_based_reply(role, message),
    )
    return ChatResponse(
        reply=reply,
        role=role,
        route_tag=route_tag,
        route_department=route_department,
    )
