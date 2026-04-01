from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models import (
    FeedbackType,
    MicrolearningAssessmentMethod,
    MicrolearningAssignment,
    MicrolearningModule,
    ScenarioDifficulty,
)


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


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
    category_value = _enum_value(category) or FeedbackType.PRONUNCIATION.value
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
                module.category = example["category"]
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
                    category=example["category"],
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


def serialize_microlearning_module(
    module: MicrolearningModule,
    *,
    assignment_count: int = 0,
) -> dict[str, Any]:
    assessment_method = getattr(module, "assessment_method", None)
    return {
        "id": module.id,
        "title": module.title,
        "description": module.description,
        "category": _enum_value(module.category),
        "duration_minutes": module.duration_minutes,
        "skill_focus": module.skill_focus,
        "content_url": module.content_url,
        "difficulty": _enum_value(module.difficulty),
        "assessment_method_id": getattr(assessment_method, "id", None) or module.assessment_method_id,
        "assessment_method_slug": getattr(assessment_method, "slug", None),
        "assessment_method_name": getattr(assessment_method, "name", None),
        "assessment_method_summary": getattr(assessment_method, "summary", None),
        "assessment_measures": list(getattr(assessment_method, "measures", None) or []),
        "exercise_count": len(module.exercises or []),
        "exercises": module.exercises or [],
        "assignment_count": int(assignment_count or 0),
        "created_at": module.created_at,
    }


def ensure_module_exercises(module: Optional[MicrolearningModule]) -> bool:
    if not module or module.exercises:
        return False

    assessment_method_slug = getattr(getattr(module, "assessment_method", None), "slug", None)
    module.exercises = generate_default_exercises(
        module.category,
        title=module.title,
        skill_focus=module.skill_focus,
        assessment_method_slug=assessment_method_slug,
    )
    return True


def refresh_assignment_progress(assignment: MicrolearningAssignment) -> None:
    exercises = (assignment.module.exercises or []) if assignment.module else []
    responses = dict(assignment.responses or {})
    total_exercises = len(exercises)
    completed_exercises = sum(
        1 for attempt in responses.values() if isinstance(attempt, dict) and attempt.get("is_completed")
    )

    assignment.completed_exercises = completed_exercises
    assignment.completion_percentage = (
        round((completed_exercises / total_exercises) * 100, 2) if total_exercises else 0.0
    )

    if completed_exercises == 0:
        assignment.status = "assigned"
        assignment.completed_at = None
        return

    if total_exercises and completed_exercises >= total_exercises:
        assignment.status = "completed"
        if assignment.completed_at is None:
            assignment.completed_at = datetime.utcnow()
        return

    assignment.status = "in_progress"
    assignment.completed_at = None


def serialize_assignment_summary(assignment: MicrolearningAssignment) -> dict[str, Any]:
    module = assignment.module
    assessment_method = getattr(module, "assessment_method", None) if module else None
    batch = getattr(assignment, "batch", None)
    trainee = getattr(assignment, "trainee", None)
    trainer = getattr(assignment, "trainer", None)
    return {
        "id": assignment.id,
        "module_id": assignment.module_id,
        "title": module.title if module else None,
        "description": module.description if module else None,
        "category": _enum_value(module.category) if module else None,
        "skill_focus": module.skill_focus if module else None,
        "duration_minutes": module.duration_minutes if module else None,
        "difficulty": _enum_value(module.difficulty) if module else None,
        "content_url": module.content_url if module else None,
        "status": assignment.status,
        "completion_percentage": float(assignment.completion_percentage or 0.0),
        "exercise_count": len(module.exercises or []) if module else 0,
        "completed_exercises": int(assignment.completed_exercises or 0),
        "assigned_at": assignment.assigned_at,
        "due_date": assignment.due_date,
        "completed_at": assignment.completed_at,
        "notes": assignment.notes,
        "is_mandatory": bool(assignment.is_mandatory),
        "user_id": assignment.trainee_id,
        "trainee_name": getattr(trainee, "full_name", None),
        "module_title": module.title if module else None,
        "module_category": _enum_value(module.category) if module else None,
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
    exercises = []
    responses = dict(assignment.responses or {})

    for exercise in ((module.exercises or []) if module else []):
        attempt = responses.get(exercise.get("id"))
        exercises.append(
            {
                "id": exercise.get("id"),
                "title": exercise.get("title"),
                "type": exercise.get("type"),
                "prompt": exercise.get("prompt"),
                "options": exercise.get("options") or [],
                "required_keywords": exercise.get("required_keywords") or [],
                "tips": exercise.get("tips") or [],
                "explanation": exercise.get("explanation"),
                "sample_answer": exercise.get("sample_answer"),
                "attempt": attempt,
            }
        )

    return {
        "assignment": serialize_assignment_summary(assignment),
        "exercises": exercises,
    }


def evaluate_exercise_submission(
    exercise: dict[str, Any],
    *,
    response_text: Optional[str],
    selected_option: Optional[str],
) -> dict[str, Any]:
    exercise_type = (exercise.get("type") or "").strip().lower()
    normalized_text = (response_text or "").strip()
    normalized_option = (selected_option or "").strip()

    if exercise_type == "multiple_choice":
        correct_option = (exercise.get("correct_option") or "").strip()
        score = 100.0 if normalized_option and normalized_option == correct_option else 0.0
        feedback = exercise.get("explanation") or (
            "Correct answer selected."
            if score == 100.0
            else f"The strongest answer is: {correct_option or 'not available'}."
        )
        return {
            "id": exercise.get("id") or _slug(exercise.get("title") or "exercise"),
            "response_text": response_text,
            "selected_option": selected_option,
            "score": score,
            "feedback": feedback,
            "is_completed": bool(normalized_option),
            "submitted_at": datetime.utcnow().isoformat(),
        }

    required_keywords = [
        keyword.strip().lower()
        for keyword in (exercise.get("required_keywords") or [])
        if keyword and keyword.strip()
    ]
    response_lower = normalized_text.lower()
    matched_keywords = [keyword for keyword in required_keywords if keyword in response_lower]
    score = (
        round((len(matched_keywords) / len(required_keywords)) * 100, 2)
        if required_keywords
        else (100.0 if normalized_text else 0.0)
    )
    missing_keywords = [keyword for keyword in required_keywords if keyword not in matched_keywords]

    if required_keywords:
        if missing_keywords:
            feedback = (
                "Matched keywords: "
                + ", ".join(matched_keywords or ["none"])
                + ". Missing: "
                + ", ".join(missing_keywords)
                + "."
            )
        else:
            feedback = "Great job. You used all of the target keywords."
    else:
        feedback = "Response saved successfully."

    return {
        "id": exercise.get("id") or _slug(exercise.get("title") or "exercise"),
        "response_text": response_text,
        "selected_option": selected_option,
        "score": score,
        "feedback": feedback,
        "is_completed": bool(normalized_text),
        "submitted_at": datetime.utcnow().isoformat(),
    }
