"""
Seed Supabase (Postgres) with sample data for local/demo use.
Idempotent: creates records only if they don't already exist.
"""

from datetime import datetime, timedelta

from .database import SessionLocal
from .models import (
    AssessmentCategory,
    Batch,
    Course,
    CourseAssignment,
    FeedbackType,
    LineOfBusiness,
    MicrolearningModule,
    Scenario,
    ScenarioDifficulty,
    ScenarioPurpose,
    PracticeSession,
    Feedback,
    MCQCategory,
    MCQQuestion,
    MCQAssessment,
    MCQSubmission,
    CoachingTemplate,
    CoachingLog,
    User,
    UserRole,
)
from . import auth_utils
from .services.lob_catalog import sync_default_lob_catalog


def _get_or_create_user(
    db,
    email: str,
    full_name: str,
    role: UserRole,
    password: str,
    lob: str,
    department: str,
) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(
        email=email,
        full_name=full_name,
        password_hash=auth_utils.hash_password(password),
        role=role,
        is_active=True,
        lob=lob,
        department=department,
    )
    db.add(user)
    db.flush()
    return user


def seed():
    db = SessionLocal()
    try:
        admin = _get_or_create_user(
            db,
            "admin@stpeterville.edu.ph",
            "Admin User",
            UserRole.ADMIN,
            "Admin@SPV",
            "Administration",
            "Management",
        )
        trainer = _get_or_create_user(
            db,
            "trainer@st.peterville.edu.ph",
            "Trainer User",
            UserRole.TRAINER,
            "Trainer@123",
            "Training",
            "Operations",
        )
        trainee = _get_or_create_user(
            db,
            "mcureta@fatima.edu.ph",
            "Trainee User",
            UserRole.TRAINEE,
            "SPVTrainee2026",
            "Training",
            "Operations",
        )

        # Line of Business
        sync_default_lob_catalog(db, deactivate_missing=True)

        # Assessment categories
        categories = [
            ("Pronunciation", FeedbackType.PRONUNCIATION, "Speech accuracy and clarity."),
            ("Fluency", FeedbackType.FLUENCY, "Pacing and smoothness of delivery."),
            ("Empathy", FeedbackType.EMPATHY, "Active listening and empathy."),
        ]
        for name, ftype, desc in categories:
            if not db.query(AssessmentCategory).filter(AssessmentCategory.name == name).first():
                db.add(
                    AssessmentCategory(
                        name=name,
                        category_type=ftype,
                        description=desc,
                        created_by=admin.id,
                    )
                )

        db.commit()

        # Scenarios
        scenarios = [
            {
                "title": "Billing Dispute Resolution",
                "description": "Handle a customer disputing a recent charge.",
                "opening_prompt": "I was charged twice this month. Can you fix it?",
                "difficulty": ScenarioDifficulty.INTERMEDIATE,
                "lob": "Billing & Payments",
                "expected_keywords": ["refund", "investigate", "apologize"],
                "estimated_duration": 300,
            },
            {
                "title": "Password Reset Assistance",
                "description": "Guide a customer through account recovery.",
                "opening_prompt": "I forgot my password and can't log in.",
                "difficulty": ScenarioDifficulty.BASIC,
                "lob": "Customer Service",
                "expected_keywords": ["verify", "reset", "security"],
                "estimated_duration": 240,
            },
            {
                "title": "Retention Offer",
                "description": "Retain a customer planning to cancel service.",
                "opening_prompt": "I'm thinking of cancelling. It's too expensive.",
                "difficulty": ScenarioDifficulty.ADVANCED,
                "lob": "Retentions",
                "expected_keywords": ["offer", "discount", "value"],
                "estimated_duration": 360,
            },
            {
                "title": "Shipping Delay Escalation",
                "description": "De-escalate a customer upset about a delayed shipment.",
                "opening_prompt": "My package is a week late. This is unacceptable.",
                "difficulty": ScenarioDifficulty.ADVANCED,
                "lob": "Customer Service",
                "expected_keywords": ["apologize", "expedite", "status"],
                "estimated_duration": 330,
            },
            {
                "title": "Device Upgrade Inquiry",
                "description": "Guide a customer through device upgrade eligibility.",
                "opening_prompt": "Am I eligible for an upgrade this month?",
                "difficulty": ScenarioDifficulty.INTERMEDIATE,
                "lob": "Sales & Lead Generation",
                "expected_keywords": ["eligibility", "plan", "upgrade"],
                "estimated_duration": 300,
            },
        ]

        scenario_ids = []
        for s in scenarios:
            existing = db.query(Scenario).filter(Scenario.title == s["title"]).first()
            if existing:
                scenario_ids.append(existing.id)
                continue
            new_s = Scenario(
                title=s["title"],
                description=s["description"],
                opening_prompt=s["opening_prompt"],
                purpose=ScenarioPurpose.PRACTICE,
                difficulty=s["difficulty"],
                lob=s["lob"],
                expected_keywords=s["expected_keywords"],
                estimated_duration=s["estimated_duration"],
                created_by=trainer.id,
                is_published=True,
                is_draft=False,
            )
            db.add(new_s)
            db.flush()
            scenario_ids.append(new_s.id)

        # Microlearning modules
        modules = [
            ("Empathy Phrases", "Use empathic statements naturally.", FeedbackType.EMPATHY),
            ("Fluency Drills", "Reduce filler words and improve pacing.", FeedbackType.FLUENCY),
        ]
        module_ids = []
        for title, desc, cat in modules:
            existing = db.query(MicrolearningModule).filter(MicrolearningModule.title == title).first()
            if existing:
                module_ids.append(existing.id)
                continue
            mod = MicrolearningModule(
                title=title,
                description=desc,
                category=cat,
                duration_minutes=3,
                skill_focus=title,
                created_by=trainer.id,
                is_active=True,
            )
            db.add(mod)
            db.flush()
            module_ids.append(mod.id)

        # Batch
        batch_name = "Wave 1 - Fundamentals"
        batch = db.query(Batch).filter(Batch.name == batch_name).first()
        if not batch:
            batch = Batch(
                name=batch_name,
                description="Starter cohort for new trainees.",
                created_by=trainer.id,
                wave_number=1,
                lob="Customer Service",
            )
            db.add(batch)
            db.flush()

        if trainee not in batch.users:
            batch.users.append(trainee)

        # Course
        course_name = "Customer Service Fundamentals"
        course = db.query(Course).filter(Course.name == course_name).first()
        if not course:
            course = Course(
                name=course_name,
                description="Core skills for customer service agents.",
                duration_minutes=90,
                difficulty=ScenarioDifficulty.BASIC,
                lob="Customer Service",
                scenario_ids=scenario_ids,
                microlearning_modules=module_ids,
                created_by=trainer.id,
                is_published=True,
            )
            db.add(course)
            db.flush()
        else:
            # Keep content fresh if new scenarios/modules were added
            course.scenario_ids = list({*course.scenario_ids, *scenario_ids})
            course.microlearning_modules = list({*course.microlearning_modules, *module_ids})

        # Course assignment
        assignment = (
            db.query(CourseAssignment)
            .filter(CourseAssignment.course_id == course.id, CourseAssignment.batch_id == batch.id)
            .first()
        )
        if not assignment:
            assignment = CourseAssignment(
                course_id=course.id,
                batch_id=batch.id,
                assigned_by=trainer.id,
                assigned_at=datetime.utcnow(),
                due_date=datetime.utcnow() + timedelta(days=14),
                completion_deadline=datetime.utcnow() + timedelta(days=21),
                is_mandatory=True,
                is_completed=False,
            )
            db.add(assignment)

        # Practice sessions (sample across multiple scenarios)
        session_ids = []
        if scenario_ids:
            for idx, scenario_id in enumerate(scenario_ids, start=1):
                for attempt in range(1, 3):
                    exists = (
                        db.query(PracticeSession)
                        .filter(
                            PracticeSession.user_id == trainee.id,
                            PracticeSession.scenario_id == scenario_id,
                            PracticeSession.attempt_number == attempt,
                        )
                        .first()
                    )
                    if exists:
                        session_ids.append(exists.id)
                        continue
                    score_base = 72 + (idx * 3) + (attempt * 2)
                    session = PracticeSession(
                        user_id=trainee.id,
                        scenario_id=scenario_id,
                        transcription="Thank you for calling. I understand the concern and will help right away.",
                        transcription_confidence=0.9 - (attempt * 0.02),
                        accuracy_score=score_base + 6,
                        fluency_score=score_base + 2,
                        clarity_score=score_base - 1,
                        keyword_adherence_score=score_base + 1,
                        soft_skills_score=score_base + 5,
                        overall_score=score_base + 2.5,
                        response_duration=40 + idx * 8 + attempt * 5,
                        dead_air_time=2 + attempt,
                        volume_level=0.7 + (attempt * 0.03),
                        attempt_number=attempt,
                        status="completed",
                        is_verified=False,
                    )
                    db.add(session)
                    db.flush()
                    session_ids.append(session.id)

                    if attempt == 1 and idx <= 3:
                        feedback_exists = (
                            db.query(Feedback)
                            .filter(Feedback.practice_session_id == session.id)
                            .first()
                        )
                        if not feedback_exists:
                            db.add(
                                Feedback(
                                    practice_session_id=session.id,
                                    trainer_id=trainer.id,
                                    feedback_type=FeedbackType.EMPATHY,
                                    content="Solid tone and empathy. Add a brief recap before closing.",
                                    is_automated=False,
                                    recommended_exercises=["Summarize next steps", "Mirror customer sentiment"],
                                )
                            )

        # MCQ category + questions
        mcq_category = db.query(MCQCategory).filter(MCQCategory.name == "Customer Service Basics").first()
        if not mcq_category:
            mcq_category = MCQCategory(
                name="Customer Service Basics",
                description="Core customer service best practices.",
                difficulty=ScenarioDifficulty.BASIC,
                lob="Customer Service",
                passing_threshold=80.0,
                is_global=True,
                created_by=trainer.id,
            )
            db.add(mcq_category)
            db.flush()

        questions = [
            (
                "Which response best shows empathy?",
                "I can help. What is your account number?",
                "I understand how frustrating this is. Let me fix it for you.",
                "Please hold while I check.",
                "You should have read the policy.",
                "B",
            ),
            (
                "What should you do before resetting a password?",
                "Ask the caller to hold.",
                "Verify identity using security questions.",
                "Reset immediately.",
                "Ask them to call back later.",
                "B",
            ),
            (
                "A customer asks about an unexpected fee. What is the best next step?",
                "Explain fees are non-negotiable and end the call.",
                "Acknowledge concern and review the account details.",
                "Transfer immediately without explanation.",
                "Ask them to email support.",
                "B",
            ),
            (
                "Which closing statement is most professional?",
                "Okay, bye.",
                "Anything else? I have another call.",
                "Is there anything else I can help with today? Thank you for calling.",
                "Call us back if you need more.",
                "C",
            ),
        ]
        question_ids = []
        for text, a, b, c, d, correct in questions:
            q = db.query(MCQQuestion).filter(MCQQuestion.question_text == text).first()
            if not q:
                q = MCQQuestion(
                    category_id=mcq_category.id,
                    question_text=text,
                    option_a=a,
                    option_b=b,
                    option_c=c,
                    option_d=d,
                    correct_option=correct,
                    explanation="Best practice answer.",
                    kip_weight=1.0,
                    created_by=trainer.id,
                )
                db.add(q)
                db.flush()
            question_ids.append(q.id)

        # Additional MCQ categories + questions
        extra_categories = [
            (
                "Call Control & Flow",
                "Maintain call structure and manage hold/transfer etiquette.",
                ScenarioDifficulty.INTERMEDIATE,
                "Customer Service",
                85.0,
                [
                    (
                        "When placing a customer on hold, you should:",
                        "Place them on hold silently.",
                        "Ask permission, explain reason, and estimate time.",
                        "Put them on hold immediately.",
                        "Transfer without notice.",
                        "B",
                    ),
                    (
                        "If you need to transfer a call, the best practice is to:",
                        "Transfer immediately and disconnect.",
                        "Explain why, warm transfer, and summarize the issue.",
                        "Tell the customer to call back later.",
                        "Give the customer another number and end the call.",
                        "B",
                    ),
                    (
                        "What is an effective way to regain control of a call?",
                        "Raise your voice to be heard.",
                        "Use polite phrases to guide the customer back on topic.",
                        "End the call if they are off topic.",
                        "Ignore the customer's concerns.",
                        "B",
                    ),
                ],
            ),
            (
                "Compliance & Privacy",
                "Protect customer data and follow verification policy.",
                ScenarioDifficulty.BASIC,
                "Billing & Payments",
                90.0,
                [
                    (
                        "Which information should never be shared over email without verification?",
                        "Billing address.",
                        "Full account number.",
                        "Public company hours.",
                        "General product brochure.",
                        "B",
                    ),
                    (
                        "Before discussing account details, you should:",
                        "Skip verification if the caller sounds confident.",
                        "Verify identity using approved security steps.",
                        "Ask for the last 4 digits only.",
                        "Send a reset link without checks.",
                        "B",
                    ),
                ],
            ),
        ]

        for name, desc, diff, lob, threshold, extra_questions in extra_categories:
            cat = db.query(MCQCategory).filter(MCQCategory.name == name).first()
            if not cat:
                cat = MCQCategory(
                    name=name,
                    description=desc,
                    difficulty=diff,
                    lob=lob,
                    passing_threshold=threshold,
                    is_global=True,
                    created_by=trainer.id,
                )
                db.add(cat)
                db.flush()

            for text, a, b, c, d, correct in extra_questions:
                q = db.query(MCQQuestion).filter(MCQQuestion.question_text == text).first()
                if not q:
                    q = MCQQuestion(
                        category_id=cat.id,
                        question_text=text,
                        option_a=a,
                        option_b=b,
                        option_c=c,
                        option_d=d,
                        correct_option=correct,
                        explanation="Best practice answer.",
                        kip_weight=1.0,
                        created_by=trainer.id,
                    )
                    db.add(q)
                    db.flush()

        # MCQ assessment
        assessment = db.query(MCQAssessment).filter(MCQAssessment.title == "Week 1 Knowledge Check").first()
        if not assessment:
            assessment = MCQAssessment(
                title="Week 1 Knowledge Check",
                description="Short MCQ quiz on customer care fundamentals.",
                category_id=mcq_category.id,
                question_ids=question_ids,
                assigned_by=trainer.id,
                assigned_user_id=trainee.id,
                due_date=datetime.utcnow() + timedelta(days=7),
                is_active=True,
            )
            db.add(assessment)
            db.flush()

        # Additional assessment
        assessment_two = db.query(MCQAssessment).filter(MCQAssessment.title == "Week 2 Call Control").first()
        if not assessment_two:
            call_control = db.query(MCQCategory).filter(MCQCategory.name == "Call Control & Flow").first()
            call_question_ids = (
                [q.id for q in call_control.questions] if call_control else question_ids
            )
            assessment_two = MCQAssessment(
                title="Week 2 Call Control",
                description="MCQ quiz on call control and compliance basics.",
                category_id=call_control.id if call_control else mcq_category.id,
                question_ids=call_question_ids,
                assigned_by=trainer.id,
                assigned_user_id=trainee.id,
                due_date=datetime.utcnow() + timedelta(days=14),
                is_active=True,
            )
            db.add(assessment_two)

        # MCQ submission
        submission = (
            db.query(MCQSubmission)
            .filter(MCQSubmission.assessment_id == assessment.id, MCQSubmission.trainee_id == trainee.id)
            .first()
        )
        if not submission:
            answers = {question_ids[0]: "B", question_ids[1]: "B"}
            submission = MCQSubmission(
                assessment_id=assessment.id,
                trainee_id=trainee.id,
                answers=answers,
                score_percentage=100.0,
                is_passed=True,
            )
            db.add(submission)

        # Coaching template
        template = db.query(CoachingTemplate).filter(CoachingTemplate.name == "Standard Coaching").first()
        if not template:
            template = CoachingTemplate(
                name="Standard Coaching",
                mandatory_fields=["strengths", "opportunities", "action_plan"],
                acknowledgment_window_hours=72,
                created_by=trainer.id,
                is_active=True,
            )
            db.add(template)
            db.flush()

        # Coaching logs (multiple)
        coaching_samples = [
            {
                "coaching_id": "COACH-0001",
                "practice_session_id": session_ids[0] if session_ids else None,
                "coaching_minutes": 20,
                "strengths": "Clear empathy statements and confident tone.",
                "opportunities": "Reduce filler words and summarize next steps.",
                "action_plan": "Complete Fluency Drills module and re-practice scenario.",
                "target_date": datetime.utcnow() + timedelta(days=10),
                "status": "sent",
                "trainer_remarks": "Good progress overall.",
            },
            {
                "coaching_id": "COACH-0002",
                "practice_session_id": session_ids[2] if len(session_ids) > 2 else None,
                "coaching_minutes": 25,
                "strengths": "Great call control and tone under pressure.",
                "opportunities": "Increase clarity on policy explanations.",
                "action_plan": "Review policy script and shadow a live call.",
                "target_date": datetime.utcnow() + timedelta(days=7),
                "status": "draft",
                "trainer_remarks": "Drafting notes before sending.",
            },
            {
                "coaching_id": "COACH-0003",
                "practice_session_id": session_ids[4] if len(session_ids) > 4 else None,
                "coaching_minutes": 15,
                "strengths": "Strong rapport building.",
                "opportunities": "Need faster resolution path.",
                "action_plan": "Practice escalation script and retry scenario.",
                "target_date": datetime.utcnow() + timedelta(days=5),
                "status": "acknowledged",
                "trainer_remarks": "Trainee acknowledged and improving.",
            },
        ]

        for sample in coaching_samples:
            coaching = (
                db.query(CoachingLog)
                .filter(CoachingLog.coaching_id == sample["coaching_id"])
                .first()
            )
            if coaching:
                continue
            coaching = CoachingLog(
                coaching_id=sample["coaching_id"],
                practice_session_id=sample["practice_session_id"],
                trainer_id=trainer.id,
                trainee_id=trainee.id,
                batch_name=batch.name,
                lob=batch.lob,
                coaching_minutes=sample["coaching_minutes"],
                strengths=sample["strengths"],
                opportunities=sample["opportunities"],
                action_plan=sample["action_plan"],
                target_date=sample["target_date"],
                status=sample["status"],
                trainer_remarks=sample["trainer_remarks"],
                acknowledged_at=datetime.utcnow() - timedelta(days=1)
                if sample["status"] == "acknowledged"
                else None,
            )
            db.add(coaching)

        db.commit()
        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
