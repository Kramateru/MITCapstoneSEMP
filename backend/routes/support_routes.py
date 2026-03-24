import os
import re
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth_utils
from ..database import get_db
from ..models import User, UserRole

router = APIRouter(prefix="/api/support", tags=["support"])

ASSISTANT_NAME = "St. Peter Buddy"
GREETING = "Hello! I'm St. Peter Buddy. How can I assist you with the system today?"
ROLE_QUESTION = "Hi! I'm St. Peter Buddy. What is your role? (Trainee, Trainer, or Admin)"
TRAINEE_SCOPE_WARNING = (
    "Hi Trainee! That question is for Trainers or Admin. Please reach out to them for assistance."
)
TRAINER_SCOPE_WARNING = (
    "Hi Trainer! That information is restricted to Admins. Please coordinate with your system administrator."
)
HUMAN_SUPPORT_DESK = "stpetervelle2003@yahoo.com.ph"
FAILSAFE_RESPONSE = (
    "I'm sorry, I don't have information about that yet. Please contact the Human Support Desk at "
    f"{HUMAN_SUPPORT_DESK} for further help."
)

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
}

ROLE_FOCUS = {
    "trainee": (
        "I can help with course access, training schedules, assignments, submissions, grades, "
        "speech activities, and progress tracking."
    ),
    "trainer": (
        "I can help with managing trainees, uploading content, grading workflows, trainee performance, "
        "and training reports."
    ),
    "admin": (
        "I can help with user management, system configuration, permissions, reports, analytics, "
        "and system maintenance."
    ),
}

ROLE_NAVIGATION = {
    "trainee": [
        "/trainee/dashboard - Review your assigned work and status",
        "/trainee/practice - Open training and scenario practice",
        "/trainee/microlearning - Access learning modules",
        "/trainee/mcq - Take MCQ assessments",
        "/trainee/simulated-floor - Run speech and call simulation tasks",
        "/trainee/progress - Track grades and progress",
        "/trainee/reports - Open certification and report views",
    ],
    "trainer": [
        "/trainer/dashboard - Open your trainer overview",
        "/trainer/batches - Manage trainee groups",
        "/trainer/authoring - Create or update content and scenarios",
        "/trainer/reviews - Review and verify trainee sessions",
        "/trainer/grading - Grade trainee work",
        "/trainer/analytics - Monitor performance",
        "/trainer/reports - Review training reports",
    ],
    "admin": [
        "/admin/dashboard - Open the admin command center",
        "/admin/users - Create, update, or deactivate accounts",
        "/admin/configuration - Adjust system configuration",
        "/admin/settings - Maintain permissions and system settings",
        "/admin/analytics - Review platform-wide analytics",
        "/admin/scenarios - Manage scenario content",
    ],
}

ROLE_FAQ_RESPONSES = {
    "trainee": [
        (
            ("log in", "login", "sign in", "access account"),
            "Use your assigned email and password on the login page. If you cannot access your account, please contact your trainer or admin for assistance.",
        ),
        (
            ("forgot password", "reset password", "password problem"),
            "Please contact your trainer or admin so they can help with your password reset.",
        ),
        (
            ("mobile", "phone", "tablet"),
            "You can open the system on mobile, but speech activities work best on a desktop or laptop with microphone access.",
        ),
        (
            ("training module", "module", "course access", "learning material", "microlearning"),
            "Open /trainee/dashboard for assigned activities, then use /trainee/microlearning or /trainee/practice to access your learning materials.",
        ),
        (
            ("training schedule", "schedule", "calendar", "when is my"),
            "Please check your dashboard and assigned activity pages for your current schedule and upcoming training tasks.",
        ),
        (
            ("assignment", "task", "practice"),
            "Your tasks and practice activities are available from /trainee/dashboard and /trainee/practice.",
        ),
        (
            ("submit", "submission", "turn in"),
            "Complete the assigned task page and the system will record your submission through the activity workflow.",
        ),
        (
            ("grade", "grades", "score", "progress tracking", "progress"),
            "You can review your grades and progress from /trainee/progress and /trainee/reports.",
        ),
        (
            ("assessment", "quiz", "mcq"),
            "You can open your assessments from /trainee/assessment or /trainee/mcq, depending on the assigned activity.",
        ),
        (
            ("redo", "retake", "repeat"),
            "You may repeat training activities when they remain available in your assigned workflow.",
        ),
        (
            ("speech recognition", "voice recognition", "microphone icon"),
            "For speech activities, open the assigned task, allow microphone access in your browser, and speak clearly when prompted.",
        ),
        (
            ("voice not recognized", "cannot recognize my voice", "speech not captured", "microphone"),
            "Please confirm browser microphone permission, use the correct input device, and reduce background noise before trying again.",
        ),
        (
            ("pronunciation", "pronunciation score", "neutral accent"),
            "The system can evaluate pronunciation and speech quality during supported activities. To improve results, speak clearly, keep a steady pace, and follow the practice model closely.",
        ),
        (
            ("call simulation", "simulation activity", "mock call", "bpo scenario"),
            "Use /trainee/simulated-floor or your assigned scenario page to complete call simulation activities.",
        ),
        (
            ("customer audio", "customer accent", "cannot understand the audio"),
            "Use a headset, replay the prompt when available, and work in a quiet environment for clearer listening during speech activities.",
        ),
        (
            ("angry customer", "irate customer", "billing dispute", "delayed order"),
            "Stay calm, acknowledge the concern, use polite language, and guide the customer toward the next solution step.",
        ),
        (
            ("common phrases", "what should i say", "bpo phrases"),
            "Useful phrases include: 'Thank you for calling,' 'I understand your concern,' and 'Let me assist you with that.'",
        ),
    ],
    "trainer": [
        (
            ("view trainees", "my trainees", "trainee management", "manage trainees", "attendance", "class"),
            "Use /trainer/dashboard and /trainer/batches to manage trainees, class groups, and training activity.",
        ),
        (
            ("monitor progress", "trainee progress", "performance"),
            "You can monitor trainee performance from /trainer/analytics, /trainer/reviews, and /trainer/reports.",
        ),
        (
            ("inactive trainee", "inactive trainees"),
            "Review the trainee's status from your trainer dashboard and coordinate follow-up or escalation through your training workflow.",
        ),
        (
            ("create module", "create content", "training module", "content management", "authoring"),
            "Use /trainer/authoring to create or update training modules, scenarios, and related content.",
        ),
        (
            ("upload audio", "audio exercise", "upload material", "speech content"),
            "You can manage trainer content from /trainer/authoring. Use the available scenario and content tools for supported uploads and updates.",
        ),
        (
            ("edit module", "edit content", "update module"),
            "You can update existing training content from /trainer/authoring.",
        ),
        (
            ("grade trainees", "grading", "grade submissions", "grade quiz"),
            "Use /trainer/grading to score trainee work and review related submissions.",
        ),
        (
            ("auto grade speech", "speech scores", "speech evaluation"),
            "Speech-related results can be reviewed through your grading and review workflow. Use trainer judgment alongside system-generated results where applicable.",
        ),
        (
            ("generate report", "training report", "reports"),
            "Use /trainer/reports and /trainer/analytics to review training reports and performance summaries.",
        ),
        (
            ("speech recordings", "review recordings", "play recordings"),
            "Open the relevant trainee session from /trainer/reviews or related trainer pages to review recorded activity when available.",
        ),
        (
            ("override score", "manual evaluation", "manual score"),
            "Use your trainer review and grading workflow to apply manual judgment where your process allows it.",
        ),
        (
            ("feedback", "coaching tips", "personalized coaching"),
            "Use the trainer review, grading, and coaching workflow to provide performance feedback and guidance.",
        ),
        (
            ("custom call scenario", "difficult customer", "custom scenario", "call scenario"),
            "Use /trainer/authoring to create and manage scenario-based content, including speech or customer-handling practice flows.",
        ),
        (
            ("difficulty level", "beginner", "advanced"),
            "You can manage supported content difficulty and structure through your trainer authoring workflow.",
        ),
    ],
    "admin": [
        (
            ("create user", "user account", "add user"),
            "Use /admin/users to create new accounts and assign the appropriate role.",
        ),
        (
            ("assign role", "roles", "permissions", "access control"),
            "Role and access management are handled from /admin/users and the relevant system settings pages.",
        ),
        (
            ("deactivate", "disable account", "remove user"),
            "Use /admin/users to update or deactivate user accounts.",
        ),
        (
            ("system configuration", "configure system", "system settings", "settings"),
            "Use /admin/configuration and /admin/settings for system-wide configuration and maintenance.",
        ),
        (
            ("speech recognition settings", "speech configuration", "speech engine", "speech api"),
            "Speech-related configuration belongs to the admin system setup workflow. Review the relevant configuration and integration settings from the admin controls.",
        ),
        (
            ("access permissions", "permissions"),
            "Permissions and role-based access are maintained through the admin user and settings workflow.",
        ),
        (
            ("update settings", "change settings"),
            "Use /admin/settings and /admin/configuration to update platform settings.",
        ),
        (
            ("system-wide reports", "overall performance", "analytics", "reports"),
            "Platform-wide reports and analytics are available from /admin/dashboard and /admin/analytics.",
        ),
        (
            ("system errors", "logs", "system logs", "monitor system usage"),
            "Review the admin analytics, monitoring workflow, and system logs available to your deployment for system-wide troubleshooting.",
        ),
        (
            ("recordings stored", "recordings", "archive recordings", "delete recordings"),
            "Recording storage and retention should be managed through your admin configuration and operational controls.",
        ),
        (
            ("system maintenance", "maintenance", "system fails", "recognition fails"),
            "For system-wide issues, review the service configuration, integration status, and platform logs through the admin maintenance workflow.",
        ),
        (
            ("data export", "export data", "download data"),
            "Use the admin reporting and export workflow to manage authorized data exports.",
        ),
    ],
}

TRAINEE_RESTRICTED_KEYWORDS = (
    "trainer",
    "admin",
    "grading rubric",
    "evaluation rubric",
    "manage trainees",
    "attendance",
    "upload materials",
    "content management",
    "trainer report",
    "user management",
    "system configuration",
    "security setting",
    "api integration",
    "system log",
)

TRAINER_RESTRICTED_KEYWORDS = (
    "admin-only",
    "system configuration",
    "security configuration",
    "security setting",
    "api integration",
    "system log",
    "user management",
    "permissions and roles",
    "role assignment",
    "system maintenance",
    "data export",
)

SYSTEM_PROMPT = f"""
Role: You are St. Peter Buddy, the official AI support assistant for the system platform.
Your mission is to provide accurate, concise, and role-specific guidance to users.

Core Directive:
You must first identify the user's role (Trainee, Trainer, or Admin) to provide the correct level of information.
If the role is not provided in metadata or the initial query, politely ask:
"What is your role? (Trainee, Trainer, or Admin)"

Role-Specific Guidelines:

For Trainees:
- Focus on navigation, course completion requirements, technical troubleshooting for learners, and assessment schedules.
- Never reveal administrative backend settings or trainer-only evaluation rubrics.

For Trainers:
- Focus on managing classes, grading workflows, uploading materials, and tracking trainee progress.
- Do not share system-wide security configurations reserved for Admins.

For Admins:
- Focus on user management, system configuration, data exports, and security settings.
- Use a technical, precise, and authoritative tone.

Operational Rules:
- Context Isolation: Never leak Admin information to Trainees.
- Fallback: If an answer is not in the official FAQ, do not hallucinate. Direct the user to the Human Support Desk at {HUMAN_SUPPORT_DESK}.
- Greeting: Always start with: "{GREETING}"
- All answers must be related only to the system's functionality and usage.
- Never provide unrelated general knowledge.
- Keep answers concise, accurate, role-specific, and professional.
"""


class ChatRequest(BaseModel):
    message: str
    role: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    role: Optional[str] = None


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


def _build_navigation_reply(role: str) -> str:
    links = "\n".join(f"- {item}" for item in ROLE_NAVIGATION[role])
    return f"{GREETING}\n\n{role.capitalize()} navigation:\n{links}"


def _handle_restricted_scope(role: str, text: str) -> Optional[str]:
    if role == "trainee" and any(keyword in text for keyword in TRAINEE_RESTRICTED_KEYWORDS):
        return TRAINEE_SCOPE_WARNING

    if role == "trainer" and any(keyword in text for keyword in TRAINER_RESTRICTED_KEYWORDS):
        return TRAINER_SCOPE_WARNING

    return None


def _handle_shared_questions(role: str, text: str) -> Optional[str]:
    if not text:
        return _role_confirmation(role)

    if re.search(r"\b(hello|hi|hey)\b", text) or "good morning" in text or "good afternoon" in text:
        return _role_confirmation(role)

    if any(phrase in text for phrase in ("what can you do", "help", "faq", "assist")):
        return _role_confirmation(role)

    if any(word in text for word in ("where", "navigate", "menu", "page", "go to")):
        return _build_navigation_reply(role)

    return None


def _rule_based_reply(role: str, message: str) -> str:
    text = message.strip().lower()

    shared_reply = _handle_shared_questions(role, text)
    if shared_reply:
        return shared_reply

    for keywords, answer in ROLE_FAQ_RESPONSES[role]:
        if any(keyword in text for keyword in keywords):
            return answer

    return FAILSAFE_RESPONSE


def _build_system_prompt(role: str) -> str:
    return (
        f"{SYSTEM_PROMPT}\n"
        f"Current identified role: {role.capitalize()}\n"
        f"Role-specific focus: {ROLE_FOCUS[role]}\n"
        "If the role is already identified, do not ask for it again. "
        "Never mix answers between roles. If the question is outside the official FAQ and you are unsure, "
        f"return the user to the Human Support Desk at {HUMAN_SUPPORT_DESK}."
    )


def _openai_reply(api_key: str, role: str, message: str) -> Optional[str]:
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": _build_system_prompt(role)},
                {"role": "user", "content": message},
            ],
        )
        answer = completion.choices[0].message.content
        if isinstance(answer, str) and answer.strip():
            return answer.strip()
    except Exception:
        try:
            import openai

            openai.api_key = api_key
            completion = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                temperature=0.2,
                messages=[
                    {"role": "system", "content": _build_system_prompt(role)},
                    {"role": "user", "content": message},
                ],
            )
            answer = completion.choices[0].message.content
            if isinstance(answer, str) and answer.strip():
                return answer.strip()
        except Exception:
            return None

    return None


@router.post("/chat", response_model=ChatResponse)
def chat(request_body: ChatRequest, request: Request, db: Session = Depends(get_db)):
    """Role-based St. Peter Buddy support assistant for trainee, trainer, and admin users."""
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

    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        ai_reply = _openai_reply(api_key, role, message)
        if ai_reply:
            return ChatResponse(reply=ai_reply, role=role)

    return ChatResponse(reply=_rule_based_reply(role, message), role=role)
