"""
Seed Sample Assessments for Testing
Creates sample BPO-focused assessments: Grammar, Pronunciation, Customer Service
"""

import sys
from pathlib import Path
from uuid import uuid4
from datetime import datetime

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.database import SessionLocal
from backend.models import Assessment, AssessmentQuestion, User, UserRole

# Sample questions for each category
ASSESSMENTS_DATA = {
    "grammar": {
        "title": "English Grammar Fundamentals",
        "description": "Assessment covering essential English grammar rules for customer service professionals",
        "category": "grammar",
        "difficulty": "basic",
        "passing_score": 75,
        "questions": [
            {
                "text": "Which sentence is grammatically correct?",
                "options": [
                    "She don't like to go to the bank.",
                    "She doesn't like to go to the bank.",
                    "She don't like to going to the bank.",
                    "She doesn't likes to go to the bank."
                ],
                "correct": "She doesn't like to go to the bank.",
                "explanation": "Third person singular requires 'doesn't' (does not), not 'don't'"
            },
            {
                "text": "Choose the correct verb form: 'I ____ working here for 5 years.'",
                "options": [
                    "have been",
                    "am been",
                    "has been",
                    "have being"
                ],
                "correct": "have been",
                "explanation": "First person singular needs 'have been' for present perfect continuous"
            },
            {
                "text": "Identify the error: 'The company offer great benefits to its employees.'",
                "options": [
                    "company (should be companies)",
                    "offer (should be offers)",
                    "benefits (should be benefit)",
                    "No error"
                ],
                "correct": "offer (should be offers)",
                "explanation": "Singular subject 'company' requires singular verb 'offers'"
            },
            {
                "text": "Which is the correct phrase?",
                "options": [
                    "For further information, reference the manual.",
                    "For further information, reference for the manual.",
                    "For further information, reference in the manual.",
                    "For further information, reference about the manual."
                ],
                "correct": "For further information, reference the manual.",
                "explanation": "'Reference the manual' is the correct idiomatic usage"
            },
            {
                "text": "Choose the correct sentence: ",
                "options": [
                    "Neither the manager nor the employees is happy.",
                    "Neither the manager nor the employees are happy.",
                    "Both options are correct",
                    "None are correct"
                ],
                "correct": "Neither the manager nor the employees are happy.",
                "explanation": "When using 'neither...nor' with a plural subject, use plural verb"
            },
        ]
    },
    "pronunciation": {
        "title": "Pronunciation Accuracy Test",
        "description": "Assessment evaluating pronunciation of common BPO-related terms and phrases",
        "category": "pronunciation",
        "difficulty": "intermediate",
        "passing_score": 70,
        "questions": [
            {
                "text": "How is 'customer' typically pronounced?",
                "options": [
                    "/ˈkʌstəmər/ (KUS-tuh-mer)",
                    "/ˈkʊstəmər/ (KOOS-tuh-mer)",
                    "/ˈkæstəmər/ (CAS-tuh-mer)",
                    "/ˈkɪstəmər/ (KIS-tuh-mer)"
                ],
                "correct": "/ˈkʌstəmər/ (KUS-tuh-mer)",
                "explanation": "The standard American pronunciation emphasizes the first syllable with an 'uh' sound"
            },
            {
                "text": "Correct pronunciation of 'inquiry':",
                "options": [
                    "/ɪnˈkwaɪri/ (in-KWAHY-ree)",
                    "/ˈɪnkwəri/ (IN-kuh-ree)",
                    "/ˈɪŋkwaɪri/ (ING-kwahy-ree)",  
                    "/ɪnˈkwiːri/ (in-KWEE-ree)"
                ],
                "correct": "/ɪnˈkwaɪri/ (in-KWAHY-ree)",
                "explanation": "Stress on second syllable with long 'i' sound in the second syllable"
            },
            {
                "text": "How to pronounce 'schedule':",
                "options": [
                    "/ˈskedʒuːl/ (SKED-jool) - American",
                    "/ˈʃedʒuːl/ (SHED-jool) - British",
                    "Both are correct in different regions",
                    "Neither is correct"
                ],
                "correct": "Both are correct in different regions",
                "explanation": "American English uses /ˈskedʒuːl/, while British uses /ˈʃedʒuːl/"
            },
            {
                "text": "Stress placement in 'issue':",
                "options": [
                    "/ˈɪʃuː/ (ISH-oo)",
                    "/ɪˈʃuː/ (i-SHOO)",
                    "/ˈɪʃjuː/ (ISH-yoo)",
                    "/ɪˈʃjuː/ (i-SHYOO)"
                ],
                "correct": "/ˈɪʃuː/ (ISH-oo)",
                "explanation": "The stress is on the first syllable in 'issue'"
            },
            {
                "text": "Pronunciation of 'previous':",
                "options": [
                    "/ˈpriːviəs/ (PREE-vee-uh-s)",
                    "/ˈprevjəs/ (PREV-juh-s)",
                    "/prɪˈviːəs/ (pri-VEE-uh-s)",
                    "/ˈpreɪvɪəs/ (PRAY-vee-uh-s)"
                ],
                "correct": "/ˈpriːviəs/ (PREE-vee-uh-s)",
                "explanation": "Initial stress with 'pree' sound, not 'prev'"
            },
        ]
    },
    "customer_service": {
        "title": "Customer Service Knowledge",
        "description": "Assessment testing knowledge of customer service best practices and BPO standards",
        "category": "customer_service",
        "difficulty": "intermediate",
        "passing_score": 75,
        "questions": [
            {
                "text": "What is the ideal average handle time (AHT) for most customer service calls?",
                "options": [
                    "2-3 minutes",
                    "5-8 minutes",
                    "10-15 minutes",
                    "20-30 minutes"
                ],
                "correct": "5-8 minutes",
                "explanation": "Most BPO centers aim for 5-8 minutes AHT while maintaining quality"
            },
            {
                "text": "Which is NOT a core pillar of customer service?",
                "options": [
                    "Empathy",
                    "Efficiency",
                    "Competency",
                    "Ambiguity"
                ],
                "correct": "Ambiguity",
                "explanation": "Ambiguity harms customer service; clarity, not ambiguity, is essential"
            },
            {
                "text": "What should you do if you don't know the answer to a customer's question?",
                "options": [
                    "Make up an answer to sound knowledgeable",
                    "Put them on hold indefinitely",
                    "Honestly acknowledge you don't know and offer to find out",
                    "Transfer them to another department without context"
                ],
                "correct": "Honestly acknowledge you don't know and offer to find out",
                "explanation": "Honesty builds trust; customers appreciate transparency and commitment to solving issues"
            },
            {
                "text": "First Call Resolution (FCR) means:",
                "options": [
                    "Resolving the customer issue completely on the first contact",
                    "Being the first to call the customer",
                    "Using the first solution available",
                    "Calling the customer first for all issues"
                ],
                "correct": "Resolving the customer issue completely on the first contact",
                "explanation": "FCR is a key KPI in customer service, improving satisfaction and reducing costs"
            },
            {
                "text": "What is an appropriate tone to use with an angry customer?",
                "options": [
                    "Match their anger to show empathy",
                    "Use a formal, robotic tone",
                    "Remain calm, empathetic, and professional",
                    "Use humor to lighten the situation"
                ],
                "correct": "Remain calm, empathetic, and professional",
                "explanation": "De-escalation through calm professionalism is the best approach for handling upset customers"
            },
        ]
    }
}

def seed_assessments():
    """Create sample assessments in the database"""
    print("🌱 Seeding sample assessments...")
    
    try:
        db = SessionLocal()
        
        # Get or create a default trainer admin account
        trainer = db.query(User).filter(
            User.role == UserRole.ADMIN
        ).first()
        
        if not trainer:
            print("⚠️  No admin user found. Creating default trainer...")
            trainer = User(
                id=str(uuid4()),
                email="trainer@system.local",
                full_name="System Trainer",
                password_hash="$2b$12$placeholder",  # placeholder hash
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(trainer)
            db.flush()
        
        trainer_id = trainer.id
        print(f"Using trainer ID: {trainer_id}")
        
        created_count = 0
        
        for category, data in ASSESSMENTS_DATA.items():
            # Check if already exists
            existing = db.query(Assessment).filter(
                Assessment.title == data["title"]
            ).first()
            
            if existing:
                print(f"  ✓ Assessment '{data['title']}' already exists, skipping...")
                continue
            
            # Create assessment
            assessment = Assessment(
                id=str(uuid4()),
                title=data["title"],
                description=data["description"],
                category=data["category"],
                difficulty=data["difficulty"],
                question_count=len(data.get("questions", [])),
                passing_score=data["passing_score"],
                created_by=trainer_id,
                is_published=True,
                created_at=datetime.utcnow(),
            )
            db.add(assessment)
            db.flush()
            
            # Create questions
            for idx, q in enumerate(data.get("questions", [])):
                question = AssessmentQuestion(
                    id=str(uuid4()),
                    assessment_id=assessment.id,
                    question_text=q["text"],
                    options=q["options"],
                    correct_answer=q["correct"],
                    explanation=q["explanation"],
                    question_index=idx,
                    created_at=datetime.utcnow(),
                )
                db.add(question)
            
            db.flush()
            print(f"  ✓ Created assessment: {data['title']} ({len(data['questions'])} questions)")
            created_count += 1
        
        db.commit()
        db.close()
        
        if created_count > 0:
            print(f"\n✓ Successfully seeded {created_count} assessments!")
            return True
        else:
            print("\n✓ All assessments already exist")
            return True
            
    except Exception as e:
        print(f"✗ Error seeding assessments: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = seed_assessments()
    sys.exit(0 if success else 1)
