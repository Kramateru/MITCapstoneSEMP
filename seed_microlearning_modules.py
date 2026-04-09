"""
Seed default microlearning modules for Microlearning Management & Certification.
"""

import sys
from pathlib import Path
from uuid import uuid4
from datetime import datetime

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.database import SessionLocal
from backend.models import MicrolearningModule, User, UserRole

MODULES = [
    {
        "title": "De-escalation Toolkit (HEARD Technique)",
        "description": "Short high-energy video on HEARD technique with practice prompt.",
        "type": "video",
        "duration_minutes": 3,
        "passing_score": 80,
        "skill_focus": "De-escalation",
        "content_url": "https://example.com/videos/heard-technique.mp4",
        "content_data": {
            "lesson": "HEARD technique",
            "steps": ["Hear", "Empathize", "Apologize", "Resolve", "Diagnose"],
            "prompt": "In 30 seconds, respond to a shouting customer using HEARD." 
        },
        "exercises": [
            {"type": "prompt", "text": "Record your response to an angry customer."}
        ],
        "difficulty": "basic",
    },
    {
        "title": "Spot the Tone",
        "description": "Quiz: identify robotic, casual, or empathetic tone in responses.",
        "type": "quiz",
        "duration_minutes": 5,
        "passing_score": 70,
        "skill_focus": "Tone recognition",
        "content_data": {
            "questions": [
                {
                    "question": "Response A: \"Please follow policy..\"\nResponse B: \"Hey there, here's what to do\"\nResponse C: \"I understand your concern and here's how we can help\"",
                    "options": ["A: Robotic", "B: Casual", "C: Empathetic"],
                    "correct": "C"
                },
                {
                    "question": "Which is empathetic?",
                    "options": ["A", "B", "C"],
                    "correct": "C"
                }
            ]
        },
        "difficulty": "intermediate",
    },
    {
        "title": "Product Feature Flashcards",
        "description": "Flashcards for API key reset and feature updates.",
        "type": "flashcard",
        "duration_minutes": 4,
        "passing_score": 80,
        "skill_focus": "Product knowledge",
        "content_data": {
            "cards": [
                {
                    "front": "How do I reset the API key?",
                    "back": "1. Go to Dashboard > API keys.\n2. Click Reset.\n3. Copy new key and update your app."
                },
                {
                    "front": "What to do if API returns 429?",
                    "back": "Use retry with exponential backoff, and check rate limits." 
                }
            ]
        },
        "difficulty": "basic",
    },
    {
        "title": "One-Sentence Empathy Challenge",
        "description": "Infographic on power phrases vs wall phrases.",
        "type": "infographic",
        "duration_minutes": 2,
        "passing_score": 75,
        "skill_focus": "Empathy",
        "content_data": {
            "power_phrases": [
                "I understand how frustrating that delay must be.",
                "Thank you for your patience while we resolve this.",
                "I hear you and I’m here to help.",
                "Let’s get this fixed together.",
                "I can see why that feels upsetting."
            ],
            "wall_phrases": [
                "Our policy says we can’t do that.",
                "That’s not my department.",
                "You should have read the terms.",
                "That’s the way it is.",
                "We’re unable to help with that."
            ]
        },
        "difficulty": "basic",
    },
    {
        "title": "What Went Wrong? Case Study",
        "description": "Audio transcript analysis for a 1-star review interaction.",
        "type": "case_study",
        "duration_minutes": 6,
        "passing_score": 80,
        "skill_focus": "Critical thinking",
        "content_data": {
            "audio_url": "https://example.com/audio/one-star-review.mp3",
            "transcript": "Customer: I waited 20 mins and agent hung up. Agent: I’m with another call...",
            "questions": [
                {"id": "q1", "text": "What is the pivot point where this went wrong?", "answer": "Agent ignored and used corporate language"},
                {"id": "q2", "text": "How could the agent recover?", "answer": "Acknowledge delay, apologize, provide immediate help"}
            ]
        },
        "difficulty": "intermediate",
    },
]


def seed_modules():
    print("Seeding microlearning modules...")
    db = SessionLocal()
    try:
        trainer = db.query(User).filter(User.role == UserRole.ADMIN).first()
        if not trainer:
            trainer = db.query(User).filter(User.role == UserRole.TRAINER).first()

        if not trainer:
            print("No trainer/admin found. Please create a user first.")
            return

        for data in MODULES:
            existing = db.query(MicrolearningModule).filter(MicrolearningModule.title == data["title"]).first()
            if existing:
                print(f"  - '{data['title']}' already exists. Skipping.")
                continue

            module = MicrolearningModule(
                id=str(uuid4()),
                title=data["title"],
                description=data.get("description"),
                category=data.get("type"),
                type=data.get("type"),
                duration_minutes=data.get("duration_minutes", 3),
                passing_score=data.get("passing_score", 75),
                skill_focus=data.get("skill_focus"),
                content_url=data.get("content_url"),
                content_data=data.get("content_data", {}),
                exercises=data.get("exercises", []),
                difficulty=data.get("difficulty", "basic"),
                created_by=trainer.id,
                created_at=datetime.utcnow(),
                is_active=True,
            )
            db.add(module)
            print(f"  - Created: {data['title']}")

        db.commit()
        print("Microlearning sample modules seeded.")
    except Exception as e:
        db.rollback()
        print(f"Failed to seed microlearning modules: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_modules()
