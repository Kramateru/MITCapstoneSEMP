"""
Initialize Assessment Management Database Tables
Creates the assessment, assessment_question, assignment_batch, and assessment_submission tables
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.database import Base, engine
from backend.models import (
    Assessment,
    AssessmentQuestion,
    AssignmentBatch,
    AssessmentSubmission,
)

def init_assessment_tables():
    """Create assessment-related tables in the database"""
    print("🔄 Initializing Assessment Management tables...")
    
    try:
        # Create all assessment tables
        Base.metadata.create_all(engine, tables=[
            Assessment.__table__,
            AssessmentQuestion.__table__,
            AssignmentBatch.__table__,
            AssessmentSubmission.__table__,
        ])
        print("✓ Assessment tables created successfully!")
        print("  - assessment")
        print("  - assessment_question")
        print("  - assignment_batch")
        print("  - assessment_submission")
        return True
    except Exception as e:
        print(f"✗ Error creating tables: {e}")
        return False

if __name__ == "__main__":
    success = init_assessment_tables()
    sys.exit(0 if success else 1)
