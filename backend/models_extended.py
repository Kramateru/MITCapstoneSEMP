"""
Extended models for missing administrative and feature-specific configurations
"""

from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from .models import Base


class SystemSettings(Base):
    """Global system settings for administrators - Branding, Date Format, Accessibility"""
    __tablename__ = 'system_settings'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Branding
    logo_url = Column(String(500), nullable=True)  # Company logo
    company_name = Column(String(255), nullable=True)
    primary_color = Column(String(7), default="#007BFF")  # Hex color for branding
    
    # Date & Time Settings
    date_format = Column(String(20), default="MM/DD/YYYY")  # MM/DD/YYYY or DD/MM/YYYY
    time_zone = Column(String(50), default="UTC")
    
    # Accessibility (WCAG 2 AA)
    enable_daltonism_mode = Column(Boolean, default=False)  # Beta color-blind mode
    system_wide_font_scale = Column(Float, default=1.0)  # 1.0 = normal, 1.2 = 20% bigger
    default_high_contrast = Column(Boolean, default=False)
    
    # Theme Modes
    available_themes = Column(JSON, default=["light", "dark", "default"])
    default_theme = Column(String(20), default="default")
    
    # Sidebar Navigation Settings
    sidebar_default_state = Column(String(50), default="default")  # default, minified, hidden, locked
    
    # Layout
    default_layout = Column(String(50), default="default")  # default, boxed, top-navigation
    
    # SSO Configuration
    sso_enabled = Column(Boolean, default=False)
    sso_provider = Column(String(50), nullable=True)  # azure-ad, okta, google
    sso_client_id = Column(String(255), nullable=True)
    sso_client_secret = Column(String(255), nullable=True)
    sso_tenant_id = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AdvancedKPISettings(Base):
    """Extended KPI configuration with metrics like ROS (Rate of Speech), Dead Air, etc."""
    __tablename__ = 'advanced_kpi_settings'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    kpi_config_id = Column(String(36), ForeignKey('kpi_configuration.id'))
    
    # Rate of Speech (ROS / WPM)
    target_words_per_minute = Column(Integer, default=120)  # Ideal speaking pace
    min_words_per_minute = Column(Integer, default=80)      # Too slow threshold
    max_words_per_minute = Column(Integer, default=160)     # Too fast threshold
    ros_weight_in_fluency = Column(Float, default=0.5)      # How much ROS affects fluency score
    
    # Dead Air Configuration
    dead_air_timeout = Column(Integer, default=5)           # Seconds of silence threshold
    dead_air_penalty = Column(Float, default=5.0)           # Points deducted per dead air violation
    dead_air_max_penalties = Column(Integer, default=3)     # Max number of dead air deductions
    
    # NLP Confidence Score (Strictness)
    npl_confidence_description = Column(String(255), default="Standard")
    # Low: 0.6 (forgiving, for early learners)
    # Medium: 0.75 (standard, balanced)
    # High: 0.85+ (strict, production-ready)
    
    # Additional Speech Metrics
    volume_min_threshold = Column(Float, default=0.1)  # Min volume as % of max
    volume_max_threshold = Column(Float, default=0.95) # Max volume as % of max (prevent clipping)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EnvironmentHealthCheck(Base):
    """Trainee's environment check before practice - Microphone test, noise detection"""
    __tablename__ = 'environment_health_check'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey('user.id'))
    
    # Check Results
    check_timestamp = Column(DateTime, default=datetime.utcnow)
    microphone_detected = Column(Boolean, default=False)
    microphone_name = Column(String(255), nullable=True)
    
    # Background Noise Level (0-1 scale)
    background_noise_level = Column(Float, default=0.0)  # 0 = quiet, 1 = very loud
    noise_level_status = Column(String(20), default="good")  # good, acceptable, loud, very_loud
    
    # Volume Levels
    test_audio_peak_volume = Column(Float, default=0.0)  # 0-1 scale
    is_volume_adequate = Column(Boolean, default=False)  # True if peak > 0.3
    
    # Recommendation
    status = Column(String(50), default="ready")  # ready, needs_adjustment, failed
    recommendation = Column(Text, nullable=True)  # "Your room is too loud, try moving to a quieter space"
    
    created_at = Column(DateTime, default=datetime.utcnow)


class ASRCorrectionLog(Base):
    """Log of trainer corrections to ASR (Automatic Speech Recognition) transcriptions"""
    __tablename__ = 'asr_correction_log'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    practice_session_id = Column(String(36), ForeignKey('practice_session.id'))
    trainer_id = Column(String(36), ForeignKey('user.id'))
    
    # Correction Details
    word_position = Column(Integer)  # Position in transcript (e.g., word 5)
    original_asr_text = Column(String(255))  # What ASR heard
    corrected_text = Column(String(255))     # What trainee actually said
    
    # Impact on Scoring
    original_score_impact = Column(Float)    # Original score penalty
    corrected_score_impact = Column(Float)   # New score after correction
    score_adjustment = Column(Float)         # Difference
    
    # Reason for Correction
    reason = Column(String(255), nullable=True)  # "ASR misheard 'analyze' as 'uh-nalyze'"
    
    # Validation
    is_verified_by_trainer = Column(Boolean, default=True)
    validation_timestamp = Column(DateTime, default=datetime.utcnow)
    
    created_at = Column(DateTime, default=datetime.utcnow)


class ScenarioEnhancements(Base):
    """Additional scenario configuration for self-registration, imports, and branching metadata."""
    __tablename__ = 'scenario_enhancements'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario_id = Column(String(36), ForeignKey('scenario.id'))
    
    # Self-Registration / Generic Use Case
    is_generic_use_case = Column(Boolean, default=False)  # Can trainees self-register?
    self_registration_description = Column(Text, nullable=True)
    
    # Excel Bulk Upload Metadata
    excel_import_source = Column(String(255), nullable=True)  # Path/reference to Excel template
    excel_upload_date = Column(DateTime, nullable=True)
    
    # Branching Logic Metadata
    branching_logic_complexity = Column(String(50), default="linear")  # linear, simple_branch, complex_tree
    total_branches = Column(Integer, default=1)  # Number of decision paths
    max_depth = Column(Integer, default=1)       # Deepest path in the tree
    
    # Audio Sync Metadata (for trainers to review)
    has_audio_timestamps = Column(Boolean, default=False)  # Can click words to hear audio
    word_level_timestamps = Column(JSON, default=list)     # [{word, start_sec, end_sec}]
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TraineeLanguageProfile(Base):
    """Trainee's language & dialect profile with calibration history"""
    __tablename__ = 'trainee_language_profile'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey('user.id'))
    
    # Language Selection (First Login)
    primary_dialect = Column(String(50), default="en-US")  # en-US, en-PH, en-IN, etc.
    dialect_selection_date = Column(DateTime, default=datetime.utcnow)
    
    # ASR Accent Calibration
    is_accent_calibrated = Column(Boolean, default=False)
    calibration_samples_collected = Column(Integer, default=0)  # Samples analyzed for calibration
    accent_confidence = Column(Float, default=0.0)  # 0-1, how well ASR understands trainee's accent
    
    # Language Proficiency Level
    estimated_proficiency = Column(String(50), default="intermediate")  # beginner, intermediate, advanced
    
    # Dialect Change History
    dialect_change_history = Column(JSON, default=list)  # [{date, from_dialect, to_dialect}]
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PerformanceExport(Base):
    """Track exports of performance reports (PDF, CSV)"""
    __tablename__ = 'performance_export'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey('user.id'))
    trainer_id = Column(String(36), ForeignKey('user.id'), nullable=True)  # Who requested export
    
    # Export Details
    export_type = Column(String(50))  # pdf, csv, json
    export_format = Column(String(255))  # "Summary Report", "Detailed Analysis", etc.
    
    # Date Range
    date_range_start = Column(DateTime)
    date_range_end = Column(DateTime)
    
    # Content
    sessions_included = Column(Integer)  # How many sessions in export
    file_url = Column(String(500), nullable=True)  # URL to downloaded file
    
    # Purpose
    export_reason = Column(String(255), nullable=True)  # "Coaching session", "Mid-month review"
    
    created_at = Column(DateTime, default=datetime.utcnow)


class ColorCodedTranscriptMetrics(Base):
    """Detailed metrics for color-coded word feedback (Green/Yellow/Red)"""
    __tablename__ = 'color_coded_transcript'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    practice_session_id = Column(String(36), ForeignKey('practice_session.id'))
    
    # Word-by-Word Breakdown
    words_perfect_green = Column(Integer, default=0)     # Exact match
    words_warning_yellow = Column(Integer, default=0)    # Filler words detected
    words_error_red = Column(Integer, default=0)         # Mispronounced or missing
    
    # Filler Word Analysis
    filler_word_frequency = Column(JSON, default={})  # {"um": 3, "uh": 2, "like": 1}
    filler_word_percentage = Column(Float, default=0.0)  # % of total words
    
    # Missed Keywords
    missed_keywords = Column(JSON, default=list)  # ["please", "apologize"]
    keyword_hit_rate = Column(Float, default=0.0)  # % of required keywords used
    
    created_at = Column(DateTime, default=datetime.utcnow)
