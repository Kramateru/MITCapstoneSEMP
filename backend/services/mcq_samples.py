"""
Reusable MCQ sample banks for trainer-owned question seeding.
"""

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import MCQCategory, MCQQuestion, ScenarioDifficulty


LANGUAGE_ASSESSMENT_SAMPLE_BANK: list[dict[str, Any]] = [
    {
        "name": "Language Assessment Foundations",
        "description": (
            "Core grammar, pronunciation-awareness, and listening-comprehension "
            "questions used during language assessment preparation."
        ),
        "difficulty": ScenarioDifficulty.BASIC,
        "lob": "Language Assessment",
        "passing_threshold": 80.0,
        "questions": [
            {
                "question_text": "Which sentence uses the correct subject-verb agreement?",
                "option_a": "The trainee read the script clearly.",
                "option_b": "The trainee read the script clearly and professional.",
                "option_c": "The trainee reading the script clearly.",
                "option_d": "The trainee readed the script clearly.",
                "correct_option": "A",
                "explanation": "The sentence keeps the verb form correct and complete.",
            },
            {
                "question_text": "Which word pair contains a minimal vowel contrast often checked in language assessment?",
                "option_a": "Ship and sheep",
                "option_b": "Book and books",
                "option_c": "Phone and calls",
                "option_d": "Talk and talking",
                "correct_option": "A",
                "explanation": "Ship and sheep test the short and long vowel contrast.",
            },
            {
                "question_text": "What should a trainee do first when they do not understand a spoken question?",
                "option_a": "Stay silent until the speaker repeats",
                "option_b": "Politely ask for clarification",
                "option_c": "Guess and continue immediately",
                "option_d": "Change the topic",
                "correct_option": "B",
                "explanation": "Clarification keeps the exchange accurate and professional.",
            },
            {
                "question_text": "Which sentence is the clearest paraphrase of 'The schedule was moved forward'?",
                "option_a": "The schedule was canceled.",
                "option_b": "The schedule was delayed.",
                "option_c": "The schedule was made earlier.",
                "option_d": "The schedule was repeated.",
                "correct_option": "C",
                "explanation": "Moved forward means the time became earlier.",
            },
            {
                "question_text": "Which response best demonstrates active listening?",
                "option_a": "I already know what you mean.",
                "option_b": "Let me confirm: you need the report by Friday.",
                "option_c": "That is not my problem.",
                "option_d": "Please continue later.",
                "correct_option": "B",
                "explanation": "Restating the request confirms understanding.",
            },
            {
                "question_text": "Which punctuation mark is needed to complete: 'After reviewing the file ___ I sent my feedback'?",
                "option_a": "Comma",
                "option_b": "Question mark",
                "option_c": "Quotation mark",
                "option_d": "Semicolon only",
                "correct_option": "A",
                "explanation": "An introductory phrase is followed by a comma.",
            },
            {
                "question_text": "What is the best meaning of 'tone of voice' in a language assessment?",
                "option_a": "The color of a slide deck",
                "option_b": "The speaker's attitude and emotional delivery",
                "option_c": "The number of words used",
                "option_d": "The length of an email",
                "correct_option": "B",
                "explanation": "Tone of voice reflects how the message sounds emotionally.",
            },
            {
                "question_text": "Which sentence is grammatically correct?",
                "option_a": "She don't agree with the answer.",
                "option_b": "She doesn't agrees with the answer.",
                "option_c": "She doesn't agree with the answer.",
                "option_d": "She not agree with the answer.",
                "correct_option": "C",
                "explanation": "The auxiliary 'doesn't' takes the base verb 'agree'.",
            },
            {
                "question_text": "Which answer shows the strongest summary skill?",
                "option_a": "Everything happened very fast.",
                "option_b": "The customer called, verified the account, and requested a refund update.",
                "option_c": "The customer talked for a long time.",
                "option_d": "I cannot remember the details.",
                "correct_option": "B",
                "explanation": "A strong summary keeps the main facts concise and complete.",
            },
            {
                "question_text": "Why is pronunciation consistency important in a language assessment?",
                "option_a": "It makes the call longer.",
                "option_b": "It helps the listener understand the message clearly.",
                "option_c": "It reduces grammar rules.",
                "option_d": "It avoids all follow-up questions forever.",
                "correct_option": "B",
                "explanation": "Consistent pronunciation supports listener comprehension.",
            },
            {
                "question_text": "Which sentence uses the most natural business email phrasing?",
                "option_a": "Please see the attached file for your reference.",
                "option_b": "Please seeing attached file and refer there.",
                "option_c": "Attached file is there and you look.",
                "option_d": "You can see attachment because it is attacheding.",
                "correct_option": "A",
                "explanation": "The sentence is concise, grammatical, and appropriate for business communication.",
            },
            {
                "question_text": "Which transition word best completes the sentence: 'The issue was identified; ___, the account was updated immediately.'",
                "option_a": "however",
                "option_b": "therefore",
                "option_c": "because",
                "option_d": "although",
                "correct_option": "B",
                "explanation": "Therefore correctly signals the result of the previous clause.",
            },
            {
                "question_text": "What is the clearest stress pattern for the word 'information' in spoken English?",
                "option_a": "Stress on the first syllable only",
                "option_b": "Stress on the third syllable",
                "option_c": "Stress on every syllable equally",
                "option_d": "No syllable stress is needed",
                "correct_option": "B",
                "explanation": "The primary stress in 'information' falls on the third syllable.",
            },
            {
                "question_text": "Which sentence is punctuated correctly?",
                "option_a": "The trainee reviewed the script and, sent it.",
                "option_b": "The trainee reviewed the script, and sent it.",
                "option_c": "The trainee reviewed the script and sent it.",
                "option_d": "The trainee, reviewed the script and sent it.",
                "correct_option": "C",
                "explanation": "No comma is needed because the sentence has a shared subject and a compound predicate.",
            },
            {
                "question_text": "Which response best clarifies a customer request without sounding repetitive?",
                "option_a": "Can you say that again?",
                "option_b": "To make sure I understood, are you asking about the refund timeline?",
                "option_c": "Repeat the last thing.",
                "option_d": "What exactly are you even saying?",
                "correct_option": "B",
                "explanation": "It confirms understanding in a polite, focused way.",
            },
            {
                "question_text": "Which option is a complete sentence?",
                "option_a": "Because the trainee was late.",
                "option_b": "After checking the update.",
                "option_c": "The trainee completed the calibration exercise.",
                "option_d": "While listening carefully.",
                "correct_option": "C",
                "explanation": "It contains a subject and a complete predicate.",
            },
            {
                "question_text": "In listening comprehension, what is the best reason to take brief notes?",
                "option_a": "To avoid listening to the speaker",
                "option_b": "To capture key details without interrupting flow",
                "option_c": "To replace the entire conversation",
                "option_d": "To make the response sound longer",
                "correct_option": "B",
                "explanation": "Brief notes help retain details while maintaining active listening.",
            },
            {
                "question_text": "Which word choice is the most professional substitute for 'fix' in formal communication?",
                "option_a": "repair",
                "option_b": "settle down",
                "option_c": "patchy",
                "option_d": "stuff",
                "correct_option": "A",
                "explanation": "Repair is more specific and professional in a formal context.",
            },
            {
                "question_text": "Which sentence shows correct article usage?",
                "option_a": "She handled an escalation with confidence.",
                "option_b": "She handled a escalation with confidence.",
                "option_c": "She handled escalation with an confidence.",
                "option_d": "She handled the escalation with a confidence.",
                "correct_option": "A",
                "explanation": "The article 'an' is correct before a vowel sound in 'escalation'.",
            },
            {
                "question_text": "What is the best way to improve spoken fluency during assessment practice?",
                "option_a": "Memorize one script and repeat it without pause",
                "option_b": "Practice clear chunks, natural linking, and controlled pacing",
                "option_c": "Speak louder without adjusting pacing",
                "option_d": "Remove all pauses, even when thinking",
                "correct_option": "B",
                "explanation": "Fluency improves through chunking, linking, and manageable pacing.",
            },
        ],
    },
    {
        "name": "Language Assessment Call Readiness",
        "description": (
            "Scenario-based language assessment questions focused on call flow, "
            "professional phrasing, and spoken-response quality."
        ),
        "difficulty": ScenarioDifficulty.INTERMEDIATE,
        "lob": "Language Assessment",
        "passing_threshold": 80.0,
        "questions": [
            {
                "question_text": "Which opening statement sounds most professional on a customer call?",
                "option_a": "Yeah, what do you need?",
                "option_b": "Good day, thank you for calling. How may I assist you today?",
                "option_c": "I am busy right now, so be quick.",
                "option_d": "Talk now, I am listening.",
                "correct_option": "B",
                "explanation": "A professional opening is polite, complete, and service-focused.",
            },
            {
                "question_text": "What is the best response when a customer speaks too quickly to understand clearly?",
                "option_a": "Please slow down because I do not understand anything.",
                "option_b": "One moment. Could you please repeat that a little more slowly?",
                "option_c": "Never mind, I will just guess the issue.",
                "option_d": "Hold on while I transfer the call immediately.",
                "correct_option": "B",
                "explanation": "The response is respectful and asks for repetition clearly.",
            },
            {
                "question_text": "Which phrase best avoids dead air during account verification?",
                "option_a": "Wait.",
                "option_b": "I am checking the account now, and this will take a few seconds.",
                "option_c": "You already know the process.",
                "option_d": "Stop talking first.",
                "correct_option": "B",
                "explanation": "Narrating the action keeps the customer informed during silence.",
            },
            {
                "question_text": "Which response shows empathy before troubleshooting?",
                "option_a": "That happens all the time.",
                "option_b": "I understand how frustrating that must be, and I will help you check it now.",
                "option_c": "Calm down so I can continue.",
                "option_d": "This is not a serious issue.",
                "correct_option": "B",
                "explanation": "Empathy acknowledges the concern before moving into action.",
            },
            {
                "question_text": "What is the clearest way to give a callback expectation?",
                "option_a": "Someone will contact you somehow.",
                "option_b": "Expect an update from our team within 24 hours.",
                "option_c": "Just wait until the problem disappears.",
                "option_d": "I cannot give any timeline at all.",
                "correct_option": "B",
                "explanation": "A clear callback expectation includes a realistic timeframe.",
            },
            {
                "question_text": "Which sentence best demonstrates concise spoken grammar?",
                "option_a": "What I will be doing now is I will be checking it one by one for you now.",
                "option_b": "I will check the account now and review the latest update for you.",
                "option_c": "Checking account now because yes.",
                "option_d": "I check, checked, and checking now already.",
                "correct_option": "B",
                "explanation": "The sentence is direct, grammatical, and easy to follow.",
            },
            {
                "question_text": "Which question best confirms customer understanding?",
                "option_a": "Do you get it now?",
                "option_b": "Does that explanation make sense so far?",
                "option_c": "Why are you confused?",
                "option_d": "Can we end this call already?",
                "correct_option": "B",
                "explanation": "The phrasing checks understanding without sounding dismissive.",
            },
            {
                "question_text": "When should an agent summarize next steps?",
                "option_a": "Only if the call was short",
                "option_b": "Before closing the call",
                "option_c": "After the customer disconnects",
                "option_d": "Only if the customer asks twice",
                "correct_option": "B",
                "explanation": "Summarizing next steps before closing reinforces clarity.",
            },
            {
                "question_text": "Which reply has the strongest professional tone?",
                "option_a": "I fixed it, okay?",
                "option_b": "The issue has been escalated, and I will monitor the update for you.",
                "option_c": "That is your responsibility now.",
                "option_d": "No promises, but maybe it will work.",
                "correct_option": "B",
                "explanation": "The wording is calm, confident, and accountable.",
            },
            {
                "question_text": "What does good spoken clarity usually require from the trainee?",
                "option_a": "Speaking as fast as possible",
                "option_b": "Clear pacing, correct stress, and understandable pronunciation",
                "option_c": "Using the longest sentences available",
                "option_d": "Avoiding pauses completely",
                "correct_option": "B",
                "explanation": "Clarity comes from pacing, emphasis, and understandable speech.",
            },
            {
                "question_text": "Which statement best sets expectations before placing a customer on hold?",
                "option_a": "Wait there.",
                "option_b": "May I place you on a brief hold for up to two minutes while I review the record?",
                "option_c": "Do not say anything.",
                "option_d": "Holding now because I need to.",
                "correct_option": "B",
                "explanation": "It asks permission and gives a clear time expectation.",
            },
            {
                "question_text": "Which closing line sounds most professional?",
                "option_a": "Okay, that's all.",
                "option_b": "Thank you for your time today. Is there anything else I can help you with?",
                "option_c": "We are done here.",
                "option_d": "You can disconnect now.",
                "correct_option": "B",
                "explanation": "A professional close thanks the customer and checks for remaining needs.",
            },
            {
                "question_text": "Which phrase best signals ownership of the issue?",
                "option_a": "Someone else will probably handle it.",
                "option_b": "I will document this concern and follow up on the case update.",
                "option_c": "That department might answer later.",
                "option_d": "I do not know who owns this request.",
                "correct_option": "B",
                "explanation": "Ownership language shows responsibility and follow-through.",
            },
            {
                "question_text": "What is the best response when a customer interrupts repeatedly?",
                "option_a": "Please stop interrupting me.",
                "option_b": "I want to help, and I will address each point one at a time.",
                "option_c": "You are making this difficult.",
                "option_d": "I will end the call if you continue.",
                "correct_option": "B",
                "explanation": "The response stays calm and resets the conversation professionally.",
            },
            {
                "question_text": "Which statement is the clearest apology on a service call?",
                "option_a": "Sorry if that bothered you.",
                "option_b": "I apologize for the inconvenience, and I understand why this is frustrating.",
                "option_c": "It is unfortunate, I guess.",
                "option_d": "Mistakes happen.",
                "correct_option": "B",
                "explanation": "It is direct, accountable, and empathetic.",
            },
            {
                "question_text": "Which phrase best introduces a troubleshooting step?",
                "option_a": "Do this now.",
                "option_b": "Let us start by checking the most recent billing update on the account.",
                "option_c": "You probably caused this.",
                "option_d": "There is nothing to check.",
                "correct_option": "B",
                "explanation": "It introduces the next step clearly and collaboratively.",
            },
            {
                "question_text": "Which sentence avoids filler-heavy speech?",
                "option_a": "So, basically, I am kind of checking, like, the account now.",
                "option_b": "I am checking the account now for the latest status update.",
                "option_c": "I am, you know, sort of maybe seeing it.",
                "option_d": "Like, okay, the account is, um, there.",
                "correct_option": "B",
                "explanation": "The sentence removes fillers and keeps the message clear.",
            },
            {
                "question_text": "Which question best probes for missing details?",
                "option_a": "What exactly happened before the error message appeared?",
                "option_b": "Why did you do that?",
                "option_c": "Can you hurry up?",
                "option_d": "Is this not obvious?",
                "correct_option": "A",
                "explanation": "It invites the customer to provide useful context without blame.",
            },
            {
                "question_text": "When an issue cannot be resolved immediately, what should the agent do next?",
                "option_a": "End the call without explanation",
                "option_b": "Explain the next step, timeline, and ownership clearly",
                "option_c": "Promise an unrealistic instant fix",
                "option_d": "Avoid mentioning the delay",
                "correct_option": "B",
                "explanation": "Clear next-step communication keeps the customer informed and confident.",
            },
            {
                "question_text": "Which statement best reflects confident but accurate communication?",
                "option_a": "This will definitely be fixed today no matter what.",
                "option_b": "The case is now escalated, and the normal turnaround time is within 24 hours.",
                "option_c": "I am not sure, but maybe it works.",
                "option_d": "There is probably no solution.",
                "correct_option": "B",
                "explanation": "It sounds confident while staying accurate about the timeline.",
            },
        ],
    },
]


def ensure_trainer_language_assessment_samples(
    db: Session,
    *,
    trainer_id: str,
) -> dict[str, Any]:
    created_categories = 0
    updated_categories = 0
    created_questions = 0
    updated_questions = 0
    seeded_categories: list[dict[str, Any]] = []

    for category_seed in LANGUAGE_ASSESSMENT_SAMPLE_BANK:
        category = (
            db.query(MCQCategory)
            .filter(
                MCQCategory.created_by == trainer_id,
                func.lower(MCQCategory.name) == category_seed["name"].lower(),
            )
            .first()
        )

        if not category:
            category = MCQCategory(
                name=category_seed["name"],
                description=category_seed["description"],
                difficulty=category_seed["difficulty"],
                lob=category_seed["lob"],
                passing_threshold=category_seed["passing_threshold"],
                is_global=False,
                is_active=True,
                created_by=trainer_id,
            )
            db.add(category)
            db.flush()
            created_categories += 1
        else:
            category.description = category_seed["description"]
            category.difficulty = category_seed["difficulty"]
            category.lob = category_seed["lob"]
            category.passing_threshold = category_seed["passing_threshold"]
            category.is_global = False
            category.is_active = True
            updated_categories += 1
            db.flush()

        category_question_count = 0
        for question_seed in category_seed["questions"]:
            question = (
                db.query(MCQQuestion)
                .filter(
                    MCQQuestion.category_id == category.id,
                    func.lower(MCQQuestion.question_text)
                    == question_seed["question_text"].lower(),
                )
                .first()
            )

            if not question:
                question = MCQQuestion(
                    category_id=category.id,
                    question_text=question_seed["question_text"],
                    option_a=question_seed["option_a"],
                    option_b=question_seed["option_b"],
                    option_c=question_seed["option_c"],
                    option_d=question_seed["option_d"],
                    correct_option=question_seed["correct_option"],
                    explanation=question_seed["explanation"],
                    kip_weight=1.0,
                    is_active=True,
                    created_by=trainer_id,
                )
                db.add(question)
                created_questions += 1
            else:
                question.option_a = question_seed["option_a"]
                question.option_b = question_seed["option_b"]
                question.option_c = question_seed["option_c"]
                question.option_d = question_seed["option_d"]
                question.correct_option = question_seed["correct_option"]
                question.explanation = question_seed["explanation"]
                question.kip_weight = 1.0
                question.is_active = True
                updated_questions += 1

            category_question_count += 1

        seeded_categories.append(
            {
                "id": category.id,
                "name": category.name,
                "difficulty": category.difficulty.value
                if hasattr(category.difficulty, "value")
                else str(category.difficulty),
                "question_count": category_question_count,
                "passing_threshold": category.passing_threshold,
            }
        )

    db.flush()

    return {
        "created_categories": created_categories,
        "updated_categories": updated_categories,
        "created_questions": created_questions,
        "updated_questions": updated_questions,
        "categories": seeded_categories,
    }
