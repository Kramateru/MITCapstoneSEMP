"""
Database models for Speech-Enabled BPO Microlearning Platform
Supports three user roles: Administrator, Trainer, Trainee
Includes JSONB support for PostgreSQL/Supabase
"""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Boolean, Column, Date, DateTime, Index
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import Float, ForeignKey, Integer, LargeBinary, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB

from .database import Base


class UserRole(str, Enum):
    """User role enumeration"""

    ADMIN = "admin"
    TRAINER = "trainer"
    TRAINEE = "trainee"


class ScenarioDifficulty(str, Enum):
    """Scenario difficulty levels"""

    BASIC = "basic"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class ScenarioPurpose(str, Enum):
    """Scenario purpose/type"""

    PRACTICE = "practice"
    ASSESSMENT = "assessment"
    CERTIFICATION = "certification"


class FeedbackType(str, Enum):
    """Type of feedback provided"""

    PRONUNCIATION = "pronunciation"
    FLUENCY = "fluency"
    GRAMMAR = "grammar"
    EMPATHY = "empathy"
    CLARITY = "clarity"


# Association tables for many-to-many relationships
batch_user_association = Table(
    "batch_user",
    Base.metadata,
    Column("batch_id", String(36), ForeignKey("batch.id")),
    Column("user_id", String(36), ForeignKey("user.id")),
)

scenario_assessment_association = Table(
    "scenario_assessment",
    Base.metadata,
    Column("scenario_id", String(36), ForeignKey("scenario.id")),
    Column("assessment_category_id", String(36), ForeignKey("assessment_category.id")),
)

course_assessment_association = Table(
    "course_assessment",
    Base.metadata,
    Column("course_id", String(36), ForeignKey("course.id")),
    Column("assessment_category_id", String(36), ForeignKey("assessment_category.id")),
)


class User(Base):
    """User model for all roles"""

    __tablename__ = "user"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)  # bcrypt hash
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.TRAINEE)
    lob = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    language_dialect = Column(String(50), default="en-US")  # e.g., en-US, en-PH, en-IN

    # Account settings
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
    profile_image_url = Column(String(500), nullable=True)

    # UI Preferences
    theme = Column(String(20), default="default")  # dark, light, default
    layout = Column(String(20), default="default")  # default, minified, boxed
    sidebar_state = Column(String(20), default="default")
    big_font = Column(Boolean, default=False)
    big_font_scale = Column(Float, default=1.0)
    high_contrast = Column(Boolean, default=False)
    daltonism_mode = Column(String(20), default="none")
    ui_preferences = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    dismissed_notifications = Column(JSONB().with_variant(JSON, "sqlite"), default=list)

    # Relationships
    batches = relationship(
        "Batch", secondary=batch_user_association, back_populates="users"
    )
    practice_sessions = relationship(
        "PracticeSession", back_populates="user", foreign_keys="PracticeSession.user_id"
    )
    feedback_given = relationship(
        "Feedback", foreign_keys="Feedback.trainer_id", back_populates="trainer"
    )
    coaching_logs_created = relationship(
        "CoachingLog",
        foreign_keys="CoachingLog.trainer_id",
        back_populates="trainer",
    )
    coaching_logs_received = relationship(
        "CoachingLog",
        foreign_keys="CoachingLog.trainee_id",
        back_populates="trainee",
    )

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"


class NotificationRead(Base):
    """Per-user read state for synthesized role-based notifications."""

    __tablename__ = "notification_read"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("user.id"), nullable=False, index=True)
    notification_id = Column(String(255), nullable=False, index=True)
    role = Column(SQLEnum(UserRole), nullable=False)
    status = Column(String(20), nullable=False, default="read")
    is_cleared = Column(Boolean, nullable=False, default=True)
    read_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "notification_id",
            name="uq_notification_read_user_notification",
        ),
    )


class NotificationEvent(Base):
    """Persisted trainer/admin notification event."""

    __tablename__ = "notification_event"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    recipient_id = Column(String(36), ForeignKey("user.id"), nullable=False, index=True)
    recipient_role = Column(SQLEnum(UserRole), nullable=False, index=True)
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=True, index=True)
    event_type = Column(String(80), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    details = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    href = Column(String(255), nullable=True)
    action_label = Column(String(80), nullable=True, default="Open")
    level = Column(String(20), nullable=False, default="info")
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    recipient = relationship("User", foreign_keys=[recipient_id])
    trainee = relationship("User", foreign_keys=[trainee_id])


class UserSession(Base):
    """Active login session tracked server-side for single-session enforcement."""

    __tablename__ = "user_session"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("user.id"), nullable=False, index=True)
    session_id = Column(String(128), unique=True, nullable=False, index=True)
    login_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_activity = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    browser_info = Column(String(500), nullable=True)
    device_info = Column(String(255), nullable=True)
    ip_address = Column(String(64), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index(
            "uq_user_session_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=is_active.is_(True),
            sqlite_where=is_active.is_(True),
        ),
    )


class AuditLog(Base):
    """Append-only audit trail entry for user, system, and database activity."""

    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("user.id"), nullable=True, index=True)
    user_name = Column(String(255), nullable=True, index=True)
    user_email = Column(String(255), nullable=True, index=True)
    role = Column(String(40), nullable=True, index=True)
    action_type = Column(String(120), nullable=False, index=True)
    module_name = Column(String(120), nullable=True, index=True)
    entity_type = Column(String(120), nullable=True, index=True)
    entity_id = Column(String(120), nullable=True, index=True)
    description = Column(Text, nullable=True)
    old_data = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    new_data = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    changed_fields = Column(JSONB().with_variant(JSON, "sqlite"), default=list)
    status = Column(String(40), nullable=False, default="success", index=True)
    severity = Column(String(40), nullable=False, default="info", index=True)
    ip_address = Column(String(64), nullable=True)
    browser_info = Column(String(500), nullable=True)
    device_type = Column(String(120), nullable=True)
    batch_id = Column(String(36), nullable=True, index=True)
    trainee_id = Column(String(36), nullable=True, index=True)
    trainer_id = Column(String(36), nullable=True, index=True)
    session_id = Column(String(128), nullable=True, index=True)
    request_id = Column(String(128), nullable=True, index=True)
    endpoint = Column(String(255), nullable=True)
    http_method = Column(String(12), nullable=True)
    http_status = Column(Integer, nullable=True)
    metadata_json = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    actor = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index("ix_audit_logs_timestamp_role", "timestamp", "role"),
        Index("ix_audit_logs_module_action", "module_name", "action_type"),
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
    )


class LineOfBusiness(Base):
    """Line of Business configuration"""

    __tablename__ = "line_of_business"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)


class KPIConfiguration(Base):
    """Global KPI weighting configuration (Admin-level)"""

    __tablename__ = "kpi_configuration"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(36))  # For multi-tenant support

    # Weighted scoring (must sum to 100)
    accuracy_weight = Column(Float, default=30.0)  # Pronunciation accuracy
    fluency_weight = Column(Float, default=30.0)  # Speech pace & hesitation
    clarity_weight = Column(Float, default=15.0)  # Volume & articulation
    keyword_adherence_weight = Column(Float, default=15.0)  # Required keywords
    soft_skills_weight = Column(Float, default=10.0)  # Empathy, probing

    # ASR Settings (The "Brain")
    npl_confidence_threshold = Column(Float, default=0.75)  # 0-1 scale
    background_noise_sensitivity = Column(
        String(20), default="medium"
    )  # low, medium, high
    min_response_duration = Column(Integer, default=2)  # seconds
    max_response_duration = Column(Integer, default=60)  # seconds

    # Grading scales
    passing_score = Column(Float, default=70.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Workspace(Base):
    """Trainer workspace containing NLP logic and rules"""

    __tablename__ = "workspace"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    trainer_id = Column(String(36), ForeignKey("user.id"))

    # Workspace NLP configuration
    empathy_statements = Column(
        JSON, default=list
    )  # List of empathetic phrases to recognize
    probing_questions = Column(JSON, default=list)  # List of mandatory questions
    forbidden_words = Column(JSON, default=list)  # Negative triggers
    required_keywords = Column(JSON, default=list)  # Keywords that must be included

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Scenario(Base):
    """Scenario/Use Case for agent practice and assessment"""

    __tablename__ = "scenario"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    description = Column(Text)

    # Metadata
    purpose = Column(SQLEnum(ScenarioPurpose), default=ScenarioPurpose.PRACTICE)
    difficulty = Column(SQLEnum(ScenarioDifficulty), default=ScenarioDifficulty.BASIC)
    lob = Column(String(100))  # Line of Business

    # Scenario configuration
    opening_prompt = Column(Text, nullable=False)  # Customer's opening statement
    opening_prompt_audio = Column(String(500))  # URL to audio file
    expected_keywords = Column(JSON, default=list)  # Keywords agent should use
    estimated_duration = Column(Integer)  # seconds
    member_profile = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    cxone_metadata = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    call_simulation_config = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    ringer_audio_url = Column(String(500))
    hold_audio_url = Column(String(500))

    # Creator/Owner
    created_by = Column(String(36), ForeignKey("user.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Status
    is_published = Column(Boolean, default=False)
    is_draft = Column(Boolean, default=True)

    # Relationships
    flow_steps = relationship(
        "ScenarioFlow", back_populates="scenario", cascade="all, delete-orphan"
    )
    assessment_categories = relationship(
        "AssessmentCategory", secondary=scenario_assessment_association
    )
    practice_sessions = relationship("PracticeSession", back_populates="scenario")

    def __repr__(self):
        return f"<Scenario {self.title} ({self.difficulty})>"


class ScenarioFlow(Base):
    """Branching logic step in a scenario"""

    __tablename__ = "scenario_flow"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario_id = Column(String(36), ForeignKey("scenario.id"), nullable=False)

    # Step configuration
    step_number = Column(Integer, nullable=False)
    step_type = Column(
        String(50)
    )  # "agent_response", "customer_prompt", "logic_branch"

    # Content
    prompt_text = Column(Text)  # Customer prompt for this step
    prompt_audio = Column(String(500))  # URL to audio
    expected_response = Column(Text)  # Expected agent response (for branching)
    speaker_role = Column(String(20), default="member")  # member, csr, system
    speaker_label = Column(String(100))
    step_metadata = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)

    # Branching logic
    expected_keywords_for_step = Column(JSON, default=list)

    # Jump configuration (if-then logic)
    condition_type = Column(String(50))  # "contains_keyword", "matches_intent"
    condition_value = Column(String(255))  # Keyword or intent to match
    jump_to_step = Column(Integer)  # If condition met, jump to this step
    alternative_step = Column(Integer)  # If condition NOT met, jump to this step

    # Flags
    is_closing = Column(Boolean, default=False)
    response_time_limit = Column(Integer)  # seconds

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    scenario = relationship("Scenario", back_populates="flow_steps")


class CallSimulationAudioAsset(Base):
    """Trainer-managed Call Simulation audio asset metadata."""

    __tablename__ = "call_simulation_audio_asset"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trainer_id = Column(String(36), ForeignKey("user.id"), nullable=False, index=True)
    scenario_id = Column(String(36), ForeignKey("scenario.id"), nullable=True, index=True)
    script_turn_id = Column(String(36), ForeignKey("scenario_flow.id"), nullable=True, index=True)
    step_number = Column(Integer, nullable=True)
    asset_kind = Column(String(50), nullable=False)
    source_type = Column(String(50), nullable=False, default="upload")
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=True)
    bucket_name = Column(String(100), nullable=True)
    storage_path = Column(String(500), nullable=True)
    public_url = Column(Text, nullable=False)
    voice_used = Column(String(100), nullable=True)
    provider = Column(String(100), nullable=True)
    generated_text = Column(Text, nullable=True)
    asset_metadata = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    is_active = Column(Boolean, default=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    trainer = relationship("User", foreign_keys=[trainer_id])
    scenario = relationship("Scenario", foreign_keys=[scenario_id])
    script_turn = relationship("ScenarioFlow", foreign_keys=[script_turn_id])


class AssessmentCategory(Base):
    """Assessment category for evaluating agent responses"""

    __tablename__ = "assessment_category"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    category_type = Column(SQLEnum(FeedbackType), nullable=False)
    description = Column(Text)

    # Scoring configuration
    min_score = Column(Float, default=0.0)
    max_score = Column(Float, default=100.0)
    passing_threshold = Column(Float, default=70.0)

    # Scoring rules
    scoring_rules = Column(JSON)  # Flexible JSON for custom rules

    # Weighting in overall score
    weight = Column(Float, default=1.0)

    # Creator
    created_by = Column(String(36), ForeignKey("user.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    is_active = Column(Boolean, default=True)


class Batch(Base):
    """Group of trainees for batch assignment"""

    __tablename__ = "batch"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    description = Column(Text)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    # Created by trainer
    created_by = Column(String(36), ForeignKey("user.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Training wave/cohort info
    wave_number = Column(Integer)  # e.g., Wave 1, Wave 2
    lob = Column(String(100))
    is_active = Column(Boolean, default=True)

    # Relationships
    users = relationship(
        "User", secondary=batch_user_association, back_populates="batches"
    )
    course_assignments = relationship("CourseAssignment", back_populates="batch")

    def __repr__(self):
        return f"<Batch {self.name}>"


class Course(Base):
    """Training course/program with multiple scenarios"""

    __tablename__ = "course"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(Text)

    # Course configuration
    duration_minutes = Column(Integer)
    difficulty = Column(SQLEnum(ScenarioDifficulty))
    lob = Column(String(100))

    # Content
    scenario_ids = Column(JSON, default=list)  # List of linked scenario IDs
    microlearning_modules = Column(JSON, default=list)  # List of module IDs

    # Creator
    created_by = Column(String(36), ForeignKey("user.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    is_published = Column(Boolean, default=False)

    # Relationships
    assessment_categories = relationship(
        "AssessmentCategory", secondary=course_assessment_association
    )
    assignments = relationship("CourseAssignment", back_populates="course")


class CourseAssignment(Base):
    """Assignment of a course to a batch or individual"""

    __tablename__ = "course_assignment"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id = Column(String(36), ForeignKey("course.id"), nullable=False)
    batch_id = Column(String(36), ForeignKey("batch.id"))
    user_id = Column(String(36), ForeignKey("user.id"))  # For individual assignment

    # Assignment metadata
    assigned_by = Column(String(36), ForeignKey("user.id"))  # Trainer who assigned
    assigned_at = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime)
    completion_deadline = Column(DateTime)

    # Status tracking
    is_mandatory = Column(Boolean, default=True)
    is_completed = Column(Boolean, default=False)
    completion_percentage = Column(Float, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    course = relationship("Course", back_populates="assignments")
    batch = relationship("Batch", back_populates="course_assignments")


class PracticeSession(Base):
    """Record of a trainee's practice attempt on a scenario"""

    __tablename__ = "practice_session"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    scenario_id = Column(String(36), ForeignKey("scenario.id"), nullable=False)

    # Session content
    audio_file_url = Column(String(500))  # URL to uploaded audio
    transcription = Column(Text)  # ASR output
    transcription_confidence = Column(Float)  # 0-1 confidence score

    # Detailed scores (from KPI configuration)
    accuracy_score = Column(Float)
    fluency_score = Column(Float)
    clarity_score = Column(Float)
    keyword_adherence_score = Column(Float)
    soft_skills_score = Column(Float)
    overall_score = Column(Float)  # Weighted average

    # Color-coded feedback (Green, Yellow, Red)
    word_feedback = Column(JSON)  # [{word, score, error_type, color}]
    filler_words_detected = Column(JSON, default=list)  # ["um", "uh", "like"]

    # Comprehensive assessment data (JSONB for PostgreSQL, JSON for SQLite)
    # Stores complete AI assessment results: accuracy details, phoneme analysis, prosody metrics, etc.
    assessment_data = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)

    # Response quality metrics
    response_duration = Column(Integer)  # seconds
    dead_air_time = Column(Integer)  # seconds of silence
    volume_level = Column(Float)  # 0-1, peak

    # Metadata
    attempt_number = Column(Integer, default=1)
    status = Column(String(50), default="completed")  # completed, needs_review
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_by = Column(String(36), ForeignKey("user.id"))  # Trainer review
    is_verified = Column(Boolean, default=False)  # Trainer verified the ASR

    # Relationships
    user = relationship(
        "User", back_populates="practice_sessions", foreign_keys=[user_id]
    )
    scenario = relationship("Scenario", back_populates="practice_sessions")
    feedback_items = relationship("Feedback", back_populates="practice_session")
    coaching_logs = relationship("CoachingLog", back_populates="practice_session")

    def __repr__(self):
        return f"<PracticeSession {self.user_id} - {self.scenario_id}>"


class Feedback(Base):
    """Trainer feedback on trainee's practice session"""

    __tablename__ = "feedback"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    practice_session_id = Column(
        String(36), ForeignKey("practice_session.id"), nullable=False
    )
    trainer_id = Column(String(36), ForeignKey("user.id"), nullable=False)

    # Feedback content
    feedback_type = Column(SQLEnum(FeedbackType))
    content = Column(Text, nullable=False)  # Coach's note
    is_automated = Column(Boolean, default=False)  # True if generated by AI

    # Coaching recommendations
    recommended_module_id = Column(String(36))  # Microlearning module to assign
    recommended_exercises = Column(JSON, default=list)

    # Status
    is_acknowledge_by_trainee = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    practice_session = relationship("PracticeSession", back_populates="feedback_items")
    trainer = relationship(
        "User", foreign_keys=[trainer_id], back_populates="feedback_given"
    )


class MicrolearningAssessmentMethod(Base):
    """Assessment method catalog used to organize microlearning lessons."""

    __tablename__ = "microlearning_assessment_method"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    summary = Column(Text, nullable=True)
    method_description = Column(Text, nullable=True)
    measures = Column(JSONB().with_variant(JSON, "sqlite"), default=list)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    modules = relationship("MicrolearningModule", back_populates="assessment_method")


class MicrolearningTopicCategory(Base):
    """Trainer-managed topic grouping for microlearning modules."""

    __tablename__ = "microlearning_topic_category"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(120), nullable=False)
    slug = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(String(36), ForeignKey("user.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    modules = relationship("MicrolearningModule", back_populates="topic_category")

    __table_args__ = (
        UniqueConstraint(
            "created_by",
            "slug",
            name="uq_microlearning_topic_category_owner_slug",
        ),
    )


class MicrolearningModule(Base):
    """Microlearning drill/module for targeted skill improvement"""

    __tablename__ = "microlearning_module"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    category = Column(String(50), nullable=False, default="video")  # Video, Quiz, Flashcard, Infographic, Case Study, Audio

    # Content
    type = Column(String(50), nullable=False, default="video")  # video, quiz, flashcard, infographic, case_study, audio
    duration_minutes = Column(Integer, default=3)
    content_data = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)  # JSON payload for type-specific content
    passing_score = Column(Integer, default=75)
    skill_focus = Column(String(100))  # e.g., "Breathing & Pacing", "Empathy"
    content_url = Column(String(500), nullable=True)  # Link to video/audio/image
    
    # Audio-specific fields for speech-enabled content
    audio_url = Column(String(500), nullable=True)  # Original uploaded lesson audio file URL
    audio_transcript = Column(Text, nullable=True)  # Speech-to-text transcription of the audio
    audio_tts_url = Column(String(500), nullable=True)  # Text-to-speech generated audio (for accessibility)
    audio_duration_seconds = Column(Integer, nullable=True)  # Duration of the audio in seconds
    audio_language = Column(String(10), default="en-US")  # Language code for speech processing
    
    exercises = Column(JSONB().with_variant(JSON, "sqlite"), default=list)  # List of practice exercises

    # Difficulty
    difficulty = Column(SQLEnum(ScenarioDifficulty), default=ScenarioDifficulty.BASIC)
    assessment_method_id = Column(
        String(36),
        ForeignKey("microlearning_assessment_method.id"),
        nullable=True,
    )
    topic_category_id = Column(
        String(36),
        ForeignKey("microlearning_topic_category.id"),
        nullable=True,
    )

    created_by = Column(String(36), ForeignKey("user.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    assessment_method = relationship(
        "MicrolearningAssessmentMethod", back_populates="modules"
    )
    topic_category = relationship(
        "MicrolearningTopicCategory", back_populates="modules"
    )
    assignments = relationship(
        "MicrolearningAssignment",
        back_populates="module",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class MicrolearningUploadedAsset(Base):
    """Trainer-uploaded binary asset stored in Supabase Postgres for playback."""

    __tablename__ = "microlearning_uploaded_asset"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trainer_id = Column(String(36), ForeignKey("user.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    content_type = Column(String(120), nullable=False, default="application/octet-stream")
    byte_size = Column(Integer, nullable=False, default=0)
    file_bytes = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MicrolearningAssignment(Base):
    """Trainer-issued microlearning task for a specific trainee."""

    __tablename__ = "microlearning_assignment"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    module_id = Column(
        String(36), ForeignKey("microlearning_module.id", ondelete="CASCADE"), nullable=False
    )
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    assigned_by = Column(String(36), ForeignKey("user.id"), nullable=False)
    batch_id = Column(String(36), ForeignKey("batch.id"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    is_mandatory = Column(Boolean, default=True)
    status = Column(String(20), default="assigned")  # assigned, in_progress, completed
    completion_percentage = Column(Float, default=0.0)
    completed_exercises = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    responses = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    certificate_id = Column(String(36), ForeignKey("certificate_record.id"), nullable=True)

    module = relationship("MicrolearningModule", back_populates="assignments")
    trainee = relationship("User", foreign_keys=[trainee_id])
    trainer = relationship("User", foreign_keys=[assigned_by])
    batch = relationship("Batch")
    certificate = relationship("CertificateRecord")
    flashcard_results = relationship(
        "MicrolearningFlashcardResult",
        back_populates="assignment",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class MicrolearningFlashcardResult(Base):
    """Per-flashcard timing and answer result for timed microlearning recall."""

    __tablename__ = "microlearning_flashcard_result"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assignment_id = Column(
        String(36),
        ForeignKey("microlearning_assignment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_id = Column(
        String(36),
        ForeignKey("microlearning_module.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False, index=True)
    flashcard_id = Column(String(120), nullable=False)
    flashcard_order = Column(Integer, nullable=False, default=1)
    attempt_number = Column(Integer, nullable=False, default=1)
    prompt = Column(Text, nullable=True)
    front_text = Column(Text, nullable=True)
    back_text = Column(Text, nullable=True)
    answer_text = Column(Text, nullable=True)
    selected_choice = Column(Text, nullable=True)
    revealed_side = Column(String(20), nullable=True)
    study_time_seconds = Column(Integer, nullable=False, default=30)
    answer_time_seconds = Column(Integer, nullable=False, default=60)
    status = Column(String(20), nullable=False, default="unanswered")
    score = Column(Float, nullable=False, default=0.0)
    points_earned = Column(Float, nullable=False, default=0.0)
    points_possible = Column(Float, nullable=False, default=0.0)
    started_study_at = Column(DateTime, nullable=True)
    answer_started_at = Column(DateTime, nullable=True)
    answer_deadline_at = Column(DateTime, nullable=True)
    answered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignment = relationship("MicrolearningAssignment", back_populates="flashcard_results")
    module = relationship("MicrolearningModule")
    trainee = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "assignment_id",
            "flashcard_id",
            "attempt_number",
            name="uq_microlearning_flashcard_result_attempt",
        ),
    )


class PerformanceMetrics(Base):
    """Aggregated performance data for analytics"""

    __tablename__ = "performance_metrics"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("user.id"), nullable=False)

    # Time period
    metric_date = Column(DateTime, default=datetime.utcnow)  # Daily or weekly aggregate
    period = Column(String(20))  # "daily", "weekly", "monthly"

    # Aggregate scores
    avg_overall_score = Column(Float)
    avg_accuracy = Column(Float)
    avg_fluency = Column(Float)
    avg_clarity = Column(Float)
    avg_keyword_adherence = Column(Float)
    avg_soft_skills = Column(Float)

    # Session counts
    total_sessions = Column(Integer, default=0)
    sessions_passed = Column(Integer, default=0)  # >= 70?
    sessions_failed = Column(Integer, default=0)

    # Trends
    improvement_rate = Column(Float)  # % improvement since last period

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SystemLog(Base):
    """Audit log for admin actions"""

    __tablename__ = "system_log"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_id = Column(String(36), ForeignKey("user.id"))
    action = Column(String(255))  # e.g., "created_scenario", "updated_kpi"
    entity_type = Column(String(100))  # e.g., "Scenario", "KPIConfiguration"
    entity_id = Column(String(36))
    changes = Column(JSON)  # Before/after values
    created_at = Column(DateTime, default=datetime.utcnow)


class MCQCategory(Base):
    """MCQ category managed by admin/trainer for targeted assessment."""

    __tablename__ = "mcq_category"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(150), nullable=False)
    description = Column(Text)
    difficulty = Column(SQLEnum(ScenarioDifficulty), default=ScenarioDifficulty.BASIC)
    lob = Column(String(100), nullable=True)
    passing_threshold = Column(Float, default=90.0)
    is_global = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    selected_question_ids = Column(
        JSONB().with_variant(JSON, "sqlite"),
        default=list,
    )
    created_by = Column(String(36), ForeignKey("user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    questions = relationship(
        "MCQQuestion", back_populates="category", cascade="all, delete-orphan"
    )


class MCQQuestion(Base):
    """Master question bank item."""

    __tablename__ = "mcq_question"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    category_id = Column(String(36), ForeignKey("mcq_category.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    option_a = Column(Text, nullable=False)
    option_b = Column(Text, nullable=False)
    option_c = Column(Text, nullable=False)
    option_d = Column(Text, nullable=False)
    correct_option = Column(String(1), nullable=False)  # A/B/C/D
    explanation = Column(Text, nullable=True)
    media_url = Column(String(500), nullable=True)
    kip_weight = Column(Float, default=1.0)
    is_active = Column(Boolean, default=True)
    created_by = Column(String(36), ForeignKey("user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("MCQCategory", back_populates="questions")


class MCQAssessment(Base):
    """A pinned/curated MCQ assessment assigned to a user or batch."""

    __tablename__ = "mcq_assessment"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category_id = Column(String(36), ForeignKey("mcq_category.id"), nullable=False)
    question_ids = Column(JSON, default=list)  # explicit pinned question ids
    question_snapshot = Column(
        JSONB().with_variant(JSON, "sqlite"),
        default=list,
    )
    assigned_by = Column(String(36), ForeignKey("user.id"), nullable=False)
    assigned_user_id = Column(String(36), ForeignKey("user.id"), nullable=True)
    assigned_batch_id = Column(String(36), ForeignKey("batch.id"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    time_limit_minutes = Column(Integer, default=30)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MCQSubmission(Base):
    """Trainee answer submission for MCQ assessment."""

    __tablename__ = "mcq_submission"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id = Column(String(36), ForeignKey("mcq_assessment.id"), nullable=False)
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    answers = Column(JSON, default=dict)  # {question_id: "A"}
    review = Column(
        JSONB().with_variant(JSON, "sqlite"),
        default=list,
    )
    score_percentage = Column(Float, default=0.0)
    is_passed = Column(Boolean, default=False)
    attempt_count = Column(Integer, default=1)
    submitted_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "trainee_id", name="uq_mcq_assessment_trainee"
        ),
    )


class CoachingTemplate(Base):
    """Admin-defined coaching template structure."""

    __tablename__ = "coaching_template"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(150), nullable=False)
    mandatory_fields = Column(JSON, default=list)
    acknowledgment_window_hours = Column(Integer, default=48)
    is_active = Column(Boolean, default=True)
    created_by = Column(String(36), ForeignKey("user.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CoachingLog(Base):
    """Trainer coaching log with lifecycle draft -> sent -> acknowledged."""

    __tablename__ = "coaching_log"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    coaching_id = Column(String(50), unique=True, nullable=False)
    source_type = Column(String(30), default="practice_session")
    practice_session_id = Column(
        String(36), ForeignKey("practice_session.id"), nullable=True
    )
    sim_session_id = Column(String(36), ForeignKey("sim_session.id"), nullable=True)
    trainer_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    batch_name = Column(String(100), nullable=True)
    lob = Column(String(100), nullable=True)
    coaching_minutes = Column(Integer, default=0)
    strengths = Column(Text, nullable=True)
    opportunities = Column(Text, nullable=True)
    action_plan = Column(Text, nullable=True)
    target_date = Column(DateTime, nullable=True)
    status = Column(String(20), default="draft")  # draft, sent, acknowledged
    competency_status = Column(String(20), default="pending")
    trainer_remarks = Column(Text, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    practice_session = relationship("PracticeSession", back_populates="coaching_logs")
    sim_session = relationship("SimSession", foreign_keys=[sim_session_id])
    trainer = relationship(
        "User", foreign_keys=[trainer_id], back_populates="coaching_logs_created"
    )
    trainee = relationship(
        "User", foreign_keys=[trainee_id], back_populates="coaching_logs_received"
    )


class CertificationSettings(Base):
    """Global certification rules and branding settings (admin-controlled)."""

    __tablename__ = "certification_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_name = Column(
        String(255), default="St. Peter Velle Technical Training Center, Inc."
    )
    address = Column(
        String(255),
        default="#92 Mc Arthur Highway Marulas, Valenzuela, Philippines, 1440",
    )
    contact_number = Column(String(50), default="0960 545 6293")
    contact_email = Column(String(255), default="stpetervelle2003@yahoo.com.ph")
    logo_url = Column(Text, nullable=True)
    registrar_name = Column(String(255), default="St. Peter Velle Registrar")
    signatory_title = Column(String(255), default="Authorized Signatory")
    manager_signature_url = Column(Text, nullable=True)
    dry_seal_url = Column(Text, nullable=True)
    certificate_prefix = Column(String(50), default="SPV")
    certificate_title = Column(String(255), default="Certificate of Completion")
    certificate_subtitle = Column(
        String(255), default="Issued for completed trainee tasks and assessments"
    )
    certificate_intro = Column(Text, default="This certificate is proudly presented to")
    certificate_outro = Column(
        Text,
        default=(
            "for successfully completing the training requirement shown below through "
            "St. Peter Velle Technical Training Center, Inc."
        ),
    )
    certificate_footer = Column(
        Text,
        default=(
            "This certificate is stored in the platform database and may be verified "
            "through the official certificate record."
        ),
    )
    asr_passing_threshold = Column(Float, default=80.0)
    mcq_passing_threshold = Column(Float, default=90.0)
    unit_of_competency = Column(
        String(255), default="Communication effectively in English for CCS"
    )
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CompetencyVerdict(Base):
    """Trainer final verdict for trainee competency."""

    __tablename__ = "competency_verdict"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    trainer_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    practice_session_id = Column(
        String(36), ForeignKey("practice_session.id"), nullable=True
    )
    mcq_assessment_id = Column(
        String(36), ForeignKey("mcq_assessment.id"), nullable=True
    )
    asr_score = Column(Float, default=0.0)
    mcq_score = Column(Float, default=0.0)
    remarks = Column(Text, nullable=True)
    is_competent = Column(Boolean, default=False)
    decided_at = Column(DateTime, default=datetime.utcnow)


class CertificateRecord(Base):
    """Issued certificate record with verification token."""

    __tablename__ = "certificate_record"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    certificate_no = Column(String(50), unique=True, nullable=False)
    verdict_id = Column(String(36), ForeignKey("competency_verdict.id"), nullable=False)
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    trainer_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    unit_of_competency = Column(String(255), nullable=False)
    kip_score = Column(Float, default=0.0)
    qr_token = Column(String(100), unique=True, nullable=False)
    source_type = Column(String(50), nullable=True)
    source_id = Column(String(36), nullable=True)
    achievement_type = Column(String(50), default="completion")
    template_snapshot = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)
    issued_at = Column(DateTime, default=datetime.utcnow)


# ==================== Call Simulation Models ====================


class ScenarioVariation(Base):
    """CSR response variations with scores for a scenario."""

    __tablename__ = "scenario_variation"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario_id = Column(String(36), ForeignKey("scenario.id"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    script = Column(Text, nullable=False)
    score = Column(Float, default=0.0)  # Trainer-defined scenario points
    branching_logic = Column(Text)  # JSON string for conditional branching
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    scenario = relationship("Scenario", backref="variations")


class BatchScenarioMapping(Base):
    """Maps scenarios to batches for Call Simulation access control."""

    __tablename__ = "batch_scenario_mapping"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    batch_id = Column(String(36), ForeignKey("batch.id"), nullable=False)
    scenario_id = Column(String(36), ForeignKey("scenario.id"), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by = Column(String(36), ForeignKey("user.id"))
    is_active = Column(Boolean, default=True)

    batch = relationship("Batch", backref="scenario_mappings")
    scenario = relationship("Scenario", backref="batch_mappings")

    __table_args__ = (
        UniqueConstraint("batch_id", "scenario_id", name="uq_batch_scenario"),
    )


class CallSimulationAssignment(Base):
    """Trainer-issued Call Simulation assignment row for a trainee."""

    __tablename__ = "call_simulation_assignment"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario_id = Column(String(36), ForeignKey("scenario.id"), nullable=False)
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    assigned_by = Column(String(36), ForeignKey("user.id"), nullable=False)
    batch_id = Column(String(36), ForeignKey("batch.id"), nullable=True)
    max_attempts = Column(Integer, default=3)
    trainer_notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    scenario = relationship("Scenario", backref="call_simulation_assignments")
    trainee = relationship("User", foreign_keys=[trainee_id])
    trainer = relationship("User", foreign_keys=[assigned_by])
    batch = relationship("Batch")

    __table_args__ = (
        UniqueConstraint("scenario_id", "trainee_id", name="uq_call_simulation_assignment"),
    )


class BatchKPIConfig(Base):
    """Per-batch KPI weighting configuration for Call Simulation."""

    __tablename__ = "batch_kpi_config"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    batch_id = Column(String(36), ForeignKey("batch.id"), nullable=False, unique=True)

    # Core KPI Weights (must sum to 100)
    speech_to_text_weight = Column(Float, default=25.0)
    aht_weight = Column(Float, default=20.0)
    rate_of_speech_weight = Column(Float, default=15.0)
    dead_air_weight = Column(Float, default=15.0)

    # Behavioral KPI Weights
    empathy_statements_weight = Column(Float, default=10.0)
    probing_questions_weight = Column(Float, default=10.0)

    # AI Assessment KPI Weights
    grammar_weight = Column(Float, default=2.5)
    pronunciation_weight = Column(Float, default=1.0)
    pacing_weight = Column(Float, default=1.0)

    # Negative Impact
    forbidden_words_penalty = Column(
        Float, default=5.0
    )  # % deduction per forbidden word

    # Threshold
    passing_score = Column(Float, default=90.0)

    # Forbidden words list
    forbidden_words = Column(JSON, default=list)
    empathy_keywords = Column(JSON, default=list)
    probing_keywords = Column(JSON, default=list)

    # Targets
    target_aht_seconds = Column(Integer, default=120)
    target_ros_words_per_min = Column(Float, default=150.0)
    target_dead_air_seconds = Column(Float, default=3.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    batch = relationship("Batch", backref="kpi_config")


class SimSession(Base):
    """Call Simulation simulation session - tracks trainee progress through a scenario."""

    __tablename__ = "sim_session"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    scenario_id = Column(String(36), ForeignKey("scenario.id"), nullable=False)
    assignment_id = Column(String(36), ForeignKey("call_simulation_assignment.id"), nullable=True)
    assigned_by_id = Column(String(36), ForeignKey("user.id"), nullable=True)
    scenario_variation_id = Column(
        String(36), ForeignKey("scenario_variation.id"), nullable=True
    )
    batch_id = Column(String(36), ForeignKey("batch.id"), nullable=True)

    # Session State
    status = Column(
        String(50), default="pending"
    )  # pending, in_progress, completed, failed
    current_step = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Audio Recording
    audio_url = Column(String(500))  # Supabase Storage URL
    audio_duration_seconds = Column(Integer)

    # Transcript
    transcript = Column(Text)
    transcript_confidence = Column(Float)
    transcript_log = Column(JSONB().with_variant(JSON, "sqlite"), default=list)
    turn_logs = Column(JSONB().with_variant(JSON, "sqlite"), default=list)

    # Core KPI Scores
    speech_to_text_accuracy = Column(Float)  # 0-100
    aht_target = Column(Integer)  # Target AHT in seconds
    aht_actual = Column(Integer)  # Actual AHT in seconds
    rate_of_speech = Column(Float)  # Words per minute
    dead_air_seconds = Column(Float)

    # Behavioral KPI Counts
    empathy_statements_count = Column(Integer, default=0)
    probing_questions_count = Column(Integer, default=0)

    # AI Assessment Scores
    grammar_score = Column(Float)
    pronunciation_score = Column(Float)
    pacing_score = Column(Float)
    sentiment_score = Column(Float)
    keyword_compliance = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)

    # Negative Impact
    forbidden_words_count = Column(Integer, default=0)
    forbidden_words_detected = Column(JSON, default=list)
    forbidden_word_penalty_applied = Column(Float, default=0.0)

    # Final Score
    weighted_score = Column(Float)
    pass_fail = Column(Boolean, default=False)

    # Attempts
    attempt_number = Column(Integer, default=1)
    max_attempts = Column(Integer, default=3)

    # AI Feedback Summary
    ai_feedback = Column(Text)
    coaching_notes = Column(Text)
    trainer_verdict_status = Column(String(30), default="pending")
    trainer_verdict_notes = Column(Text)
    trainer_evaluated_by = Column(String(36), ForeignKey("user.id"), nullable=True)
    trainer_evaluated_at = Column(DateTime, nullable=True)
    certificate_id = Column(String(36), ForeignKey("certificate_record.id"), nullable=True)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    trainee = relationship("User", foreign_keys=[trainee_id])
    assignment = relationship("CallSimulationAssignment")
    scenario = relationship("Scenario")
    batch = relationship("Batch")
    variation = relationship("ScenarioVariation")
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])
    trainer = relationship("User", foreign_keys=[trainer_evaluated_by])
    certificate = relationship("CertificateRecord")

    def __repr__(self):
        return f"<SimSession {self.id} - Trainee: {self.trainee_id} Scenario: {self.scenario_id}>"


class SessionResponseRecord(Base):
    """Per-turn Call Simulation response captured for Supabase-backed review and scoring."""

    __tablename__ = "session_responses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("sim_session.id"), nullable=False)
    script_id = Column(String(36), ForeignKey("scenario_flow.id"), nullable=True)
    scenario_id = Column(String(36), ForeignKey("scenario.id"), nullable=False)
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    step_number = Column(Integer, nullable=False)
    turn_attempt_number = Column(Integer, nullable=False, default=1)
    actor_type = Column(String(20), nullable=False, default="CSR")
    scenario_group = Column(String(255), nullable=True)
    expected_script = Column(Text, nullable=True)
    trainee_spoken_text = Column(Text, nullable=True)
    matched_score = Column(Float, default=0.0)
    grammar_score = Column(Float, default=0.0)
    pronunciation_score = Column(Float, default=0.0)
    pacing_score = Column(Float, default=0.0)
    speech_to_text_accuracy = Column(Float, default=0.0)
    transcript_confidence = Column(Float, default=0.0)
    audio_url = Column(String(500), nullable=True)
    ai_feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session = relationship("SimSession", backref="session_response_records")
    script = relationship("ScenarioFlow")
    scenario = relationship("Scenario")
    trainee = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "step_number",
            "turn_attempt_number",
            name="uq_session_response_turn_attempt",
        ),
    )


# ==================== Assessment Management Models ====================


class Assessment(Base):
    """Trainer-created assessment for BPO competency evaluation."""

    __tablename__ = "assessment"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False)  # grammar, pronunciation, customer_service, communication, product_knowledge
    difficulty = Column(String(20), nullable=False)  # basic, intermediate, advanced
    question_count = Column(Integer, default=10)
    passing_score = Column(Integer, default=75)  # Percentage (0-100)
    
    created_by = Column(String(36), ForeignKey("user.id"), nullable=False)
    is_published = Column(Boolean, default=True)
    is_draft = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
    questions = relationship("AssessmentQuestion", back_populates="assessment", cascade="all, delete-orphan")
    assignments = relationship("AssignmentBatch", back_populates="assessment", cascade="all, delete-orphan")
    submissions = relationship("AssessmentSubmission", back_populates="assessment", cascade="all, delete-orphan")


class AssessmentQuestion(Base):
    """Individual question within an assessment."""

    __tablename__ = "assessment_question"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id = Column(String(36), ForeignKey("assessment.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    
    # Question options (JSON format for flexibility)
    options = Column(JSONB().with_variant(JSON, "sqlite"), default=list)  # ["option1", "option2", ...]
    correct_answer = Column(String(255), nullable=False)  # Index or text of correct option
    explanation = Column(Text, nullable=True)  # Why this is correct
    
    difficulty_override = Column(String(20), nullable=True)  # Override assessment difficulty if needed
    question_index = Column(Integer, default=0)  # Order in assessment
    
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    assessment = relationship("Assessment", back_populates="questions")


class AssignmentBatch(Base):
    """Maps assessments to batches for trainee access control."""

    __tablename__ = "assignment_batch"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id = Column(String(36), ForeignKey("assessment.id"), nullable=False)
    batch_id = Column(String(36), ForeignKey("batch.id"), nullable=False)
    
    assigned_by = Column(String(36), ForeignKey("user.id"), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    due_date = Column(DateTime, nullable=True)

    # Relationships
    assessment = relationship("Assessment", back_populates="assignments")
    batch = relationship("Batch", backref="assessment_assignments")
    assignee = relationship("User", foreign_keys=[assigned_by])

    __table_args__ = (
        UniqueConstraint("assessment_id", "batch_id", name="uq_assessment_batch"),
    )


class AssessmentSubmission(Base):
    """Trainee submission/result for an assessment."""

    __tablename__ = "assessment_submission"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id = Column(String(36), ForeignKey("assessment.id"), nullable=False)
    trainee_id = Column(String(36), ForeignKey("user.id"), nullable=False)
    batch_id = Column(String(36), ForeignKey("batch.id"), nullable=False)
    
    score = Column(Float, default=0.0)  # Percentage (0-100)
    is_passed = Column(Boolean, default=False)
    time_taken_seconds = Column(Integer, default=0)
    
    # Store user responses
    responses = Column(JSONB().with_variant(JSON, "sqlite"), default=dict)  # {question_id: answer}
    
    submitted_at = Column(DateTime, default=datetime.utcnow)
    graded_at = Column(DateTime, nullable=True)
    
    # Certificate linkage
    certificate_id = Column(String(36), ForeignKey("certificate_record.id"), nullable=True)
    
    # Metadata
    is_reviewed = Column(Boolean, default=False)
    reviewer_feedback = Column(Text, nullable=True)
    reviewed_by = Column(String(36), ForeignKey("user.id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assessment = relationship("Assessment", back_populates="submissions")
    trainee = relationship("User", foreign_keys=[trainee_id])
    batch = relationship("Batch")
    certificate = relationship("CertificateRecord")
    reviewer = relationship("User", foreign_keys=[reviewed_by])

    __table_args__ = (
        UniqueConstraint("assessment_id", "trainee_id", name="uq_assessment_trainee"),
    )
