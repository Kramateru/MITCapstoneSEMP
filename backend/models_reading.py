"""
Reading & Pronunciation Assessment Models
Enables trainees to read passages aloud and receive AI-powered pronunciation feedback.
"""

from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Text, DateTime, ForeignKey, 
    Numeric, CheckConstraint, Index, UniqueConstraint, JSON
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
import uuid

from .database import Base


class ReadingAttempt(Base):
    """Stores each trainee's reading assessment attempt with scoring and feedback."""
    
    __tablename__ = "reading_attempt"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    module_id = Column(String(36), ForeignKey("microlearning_module.id"), nullable=False, index=True)
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False, index=True)
    attempt_number = Column(Integer, nullable=False, default=1)
    
    # Audio recording
    audio_storage_path = Column(String(500))  # e.g., "reading-assessments/{module_id}/{trainee_id}/{attempt_id}.webm"
    audio_url = Column(String(500))  # Public URL or signed URL to the audio
    audio_duration_seconds = Column(Numeric(10, 2))  # Duration of the recording
    
    # Transcript & text
    audio_transcript = Column(Text)  # Raw speech-to-text output
    expected_text = Column(Text, nullable=False)  # Original reading passage (denormalized)
    
    # Analysis results
    total_words = Column(Integer)  # Total words in expected text
    correct_words = Column(Integer, default=0)
    mispronounced_words = Column(Integer, default=0)
    omitted_words = Column(Integer, default=0)
    extra_words = Column(Integer, default=0)
    repeated_words = Column(Integer, default=0)
    
    # Scoring
    overall_score = Column(Numeric(5, 2), default=0)
    pronunciation_score = Column(Numeric(5, 2), default=0)  # 0-100 percentage
    accuracy_score = Column(Numeric(5, 2), default=0)
    fluency_score = Column(Numeric(5, 2), default=0)
    completeness_score = Column(Numeric(5, 2), default=0)
    confidence_score = Column(Numeric(5, 2), default=0)
    words_per_minute = Column(Numeric(8, 2), default=0)
    passing_score = Column(Numeric(5, 2), nullable=False)  # Trainer's passing requirement
    status = Column(String(50), default='in_progress')  # in_progress, processing, completed, passed, failed, error
    
    # Feedback
    strengths = Column(Text)  # AI-generated strengths summary
    improvement_areas = Column(Text)  # AI-generated improvement suggestions
    recommendations = Column(Text)
    most_common_issues = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)  # Common pronunciation errors
    score_breakdown = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    analysis_json = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    
    # Timestamps
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    module = relationship("MicrolearningModule", foreign_keys=[module_id])
    trainee = relationship("User", foreign_keys=[trainee_id])
    word_analysis = relationship("ReadingWordAnalysis", back_populates="attempt", cascade="all, delete-orphan")
    pronunciation_issues = relationship("ReadingPronunciationIssue", back_populates="attempt", cascade="all, delete-orphan")
    
    __table_args__ = (
        UniqueConstraint("module_id", "trainee_id", "attempt_number", name="uq_reading_attempt_sequence"),
        Index("idx_reading_attempt_module", "module_id"),
        Index("idx_reading_attempt_trainee", "trainee_id"),
        Index("idx_reading_attempt_status", "status"),
        CheckConstraint("status IN ('in_progress', 'processing', 'completed', 'passed', 'failed', 'error')", name="ck_reading_status"),
    )


class ReadingWordAnalysis(Base):
    """Word-by-word analysis for each reading attempt."""
    
    __tablename__ = "reading_word_analysis"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attempt_id = Column(String(36), ForeignKey("reading_attempt.id"), nullable=False, index=True)
    
    # Word position and content
    word_index = Column(Integer, nullable=False)
    expected_word = Column(String(255), nullable=False)
    spoken_word = Column(String(255))
    
    # Analysis result
    status = Column(String(50), nullable=False)  # correct, mispronounced, omitted, extra, uncertain
    confidence = Column(Numeric(3, 2))  # 0-1 confidence score from speech engine
    
    # Phoneme/sound analysis (if available)
    phoneme_data = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    
    # Feedback
    feedback = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationship
    attempt = relationship("ReadingAttempt", back_populates="word_analysis", foreign_keys=[attempt_id])
    
    __table_args__ = (
        Index("idx_reading_word_analysis_attempt", "attempt_id"),
        Index("idx_reading_word_analysis_status", "status"),
        CheckConstraint("status IN ('correct', 'mispronounced', 'omitted', 'extra', 'repeated', 'uncertain')", name="ck_word_status"),
    )


class ReadingPronunciationIssue(Base):
    """Aggregated pronunciation challenges across attempts."""
    
    __tablename__ = "reading_pronunciation_issue"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attempt_id = Column(String(36), ForeignKey("reading_attempt.id"), nullable=False, index=True)
    
    # Issue tracking
    issue_type = Column(String(50), nullable=False)  # word, sound, phoneme
    issue_text = Column(String(255), nullable=False)  # The word or sound that was problematic
    
    # Frequency and severity
    occurrence_count = Column(Integer, default=1)
    severity = Column(String(50), default='medium')  # low, medium, high
    
    # Additional data
    examples = Column(JSONB().with_variant(JSON, "sqlite"), default=list)  # Context examples
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationship
    attempt = relationship("ReadingAttempt", back_populates="pronunciation_issues", foreign_keys=[attempt_id])
    
    __table_args__ = (
        Index("idx_reading_pronunciation_issue_attempt", "attempt_id"),
        Index("idx_reading_pronunciation_issue_type", "issue_type"),
        CheckConstraint("issue_type IN ('word', 'sound', 'phoneme')", name="ck_issue_type"),
        CheckConstraint("severity IN ('low', 'medium', 'high')", name="ck_severity"),
    )


class ReadingModuleConfig(Base):
    """Reading-specific configuration for microlearning modules."""
    
    __tablename__ = "reading_module_config"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    module_id = Column(String(36), ForeignKey("microlearning_module.id"), nullable=False, unique=True, index=True)
    
    # Reading passage
    reading_title = Column(String(255))
    reading_category = Column(String(100))
    reading_content = Column(Text, nullable=False)
    word_count = Column(Integer, nullable=False)
    sentence_count = Column(Integer, default=0)
    paragraph_count = Column(Integer, default=0)
    reading_level = Column(String(50))
    estimated_reading_time_minutes = Column(Integer)
    language = Column(String(50), default='en-US')
    description = Column(Text)
    
    # Instructions
    instructions = Column(Text)
    
    # Assessment settings
    max_attempts = Column(Integer, default=3)
    time_limit_seconds = Column(Integer)  # Optional: max recording time
    allow_replay = Column(Integer, default=1)
    allow_pause = Column(Integer, default=1)
    auto_submit = Column(Integer, default=0)
    manual_review_required = Column(Integer, default=0)
    
    # Pronunciation settings
    pronunciation_standard = Column(String(50), default='en-US')  # Language/accent standard
    minimum_pronunciation_score = Column(Numeric(5, 2), default=0)
    minimum_accuracy_score = Column(Numeric(5, 2), default=0)
    minimum_completeness_score = Column(Numeric(5, 2), default=0)
    minimum_fluency_score = Column(Numeric(5, 2), default=0)
    ai_configuration = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    
    # Difficulty
    difficulty = Column(String(50), default='intermediate')  # beginner, intermediate, advanced
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship
    module = relationship("MicrolearningModule", foreign_keys=[module_id])
    
    __table_args__ = (
        Index("idx_reading_module_config_module", "module_id"),
        CheckConstraint("difficulty IN ('beginner', 'intermediate', 'advanced')", name="ck_difficulty"),
    )
