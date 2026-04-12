"""
Pydantic schemas for API request/response validation
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field

from .models import (
    FeedbackType,
    ScenarioDifficulty,
    ScenarioPurpose,
    UserRole,
)


# ==================== Authentication Schemas ====================


class LoginRequest(BaseModel):
    """Login request"""

    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Login response"""

    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: "UserResponse"
    must_change_password: bool = False


class RefreshTokenRequest(BaseModel):
    """Refresh token request"""

    refresh_token: str


class ChangePasswordRequest(BaseModel):
    """Change password request"""

    old_password: str
    new_password: str


# ==================== User Schemas ====================


class UserBase(BaseModel):
    """Base user schema"""

    email: EmailStr
    full_name: str
    role: UserRole = UserRole.TRAINEE
    department: Optional[str] = None
    language_dialect: str = "en-US"
    theme: str = "default"
    layout: str = "default"
    big_font: bool = False
    high_contrast: bool = False
    profile_image_url: Optional[str] = None


class UserCreate(UserBase):
    """User creation schema"""

    password: Optional[str] = None


class UserUpdate(BaseModel):
    """User update schema"""

    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    department: Optional[str] = None
    language_dialect: Optional[str] = None
    theme: Optional[str] = None
    layout: Optional[str] = None
    big_font: Optional[bool] = None
    high_contrast: Optional[bool] = None
    profile_image_url: Optional[str] = None


class UserResponse(UserBase):
    """User response schema"""

    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserDetailResponse(UserResponse):
    """Detailed user response with relationships"""

    class Config:
        from_attributes = True


# ==================== Workspace Schemas ====================


class WorkspaceBase(BaseModel):
    """Base workspace schema"""

    name: str
    empathy_statements: Optional[List[str]] = []
    probing_questions: Optional[List[str]] = []
    forbidden_words: Optional[List[str]] = []
    required_keywords: Optional[List[str]] = []


class WorkspaceCreate(WorkspaceBase):
    """Workspace creation schema"""

    pass


class WorkspaceUpdate(BaseModel):
    """Workspace update schema"""

    name: Optional[str] = None
    empathy_statements: Optional[List[str]] = None
    probing_questions: Optional[List[str]] = None
    forbidden_words: Optional[List[str]] = None
    required_keywords: Optional[List[str]] = None


class WorkspaceResponse(WorkspaceBase):
    """Workspace response schema"""

    id: str
    trainer_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== Scenario Schemas ====================


class ScenarioFlowBase(BaseModel):
    """Base scenario flow step"""

    step_number: int
    step_type: str  # "agent_response", "customer_prompt", "logic_branch"
    speaker_role: Optional[str] = None
    speaker_label: Optional[str] = None
    prompt_text: Optional[str] = None
    prompt_audio: Optional[str] = None
    expected_response: Optional[str] = None
    expected_keywords_for_step: Optional[List[str]] = []
    step_metadata: Optional[Dict[str, Any]] = {}
    condition_type: Optional[str] = None
    condition_value: Optional[str] = None
    jump_to_step: Optional[int] = None
    alternative_step: Optional[int] = None
    is_closing: bool = False
    response_time_limit: Optional[int] = None


class ScenarioFlowResponse(ScenarioFlowBase):
    """Scenario flow response"""

    id: str
    scenario_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScenarioBase(BaseModel):
    """Base scenario schema"""

    title: str
    description: Optional[str] = None
    purpose: ScenarioPurpose = ScenarioPurpose.PRACTICE
    difficulty: ScenarioDifficulty = ScenarioDifficulty.BASIC
    lob: Optional[str] = None
    opening_prompt: str
    opening_prompt_audio: Optional[str] = None
    expected_keywords: Optional[List[str]] = []
    estimated_duration: Optional[int] = None
    member_profile: Optional[Dict[str, Any]] = {}
    cxone_metadata: Optional[Dict[str, Any]] = {}
    sim_floor_config: Optional[Dict[str, Any]] = {}
    ringer_audio_url: Optional[str] = None
    hold_audio_url: Optional[str] = None


class ScenarioCreate(ScenarioBase):
    """Scenario creation schema"""

    flow_steps: Optional[List[ScenarioFlowBase]] = []


class ScenarioUpdate(BaseModel):
    """Scenario update schema"""

    title: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[ScenarioDifficulty] = None
    opening_prompt: Optional[str] = None
    is_published: Optional[bool] = None
    is_draft: Optional[bool] = None


class ScenarioResponse(ScenarioBase):
    """Scenario response schema"""

    id: str
    created_by: str
    is_published: bool
    is_draft: bool
    created_at: datetime
    updated_at: datetime
    flow_steps: List[ScenarioFlowResponse] = []

    class Config:
        from_attributes = True


# ==================== Assessment Category Schemas ====================


class AssessmentCategoryBase(BaseModel):
    """Base assessment category schema"""

    name: str
    category_type: FeedbackType
    description: Optional[str] = None
    min_score: float = 0.0
    max_score: float = 100.0
    passing_threshold: float = 70.0
    weight: float = 1.0


class AssessmentCategoryCreate(AssessmentCategoryBase):
    """Assessment category creation schema"""

    scoring_rules: Optional[Dict] = None


class AssessmentCategoryResponse(AssessmentCategoryBase):
    """Assessment category response schema"""

    id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


# ==================== Batch Schemas ====================


class BatchBase(BaseModel):
    """Base batch schema"""

    name: str
    description: Optional[str] = None
    wave_number: Optional[int] = None
    lob: Optional[str] = None


class BatchCreate(BatchBase):
    """Batch creation schema"""

    pass


class BatchUpdate(BaseModel):
    """Batch update schema"""

    name: Optional[str] = None
    description: Optional[str] = None


class BatchResponse(BatchBase):
    """Batch response schema"""

    id: str
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class BatchDetailResponse(BatchResponse):
    """Batch detail response with user count"""

    user_count: int = 0

    class Config:
        from_attributes = True


# ==================== Course Schemas ====================


class CourseBase(BaseModel):
    """Base course schema"""

    name: str
    description: Optional[str] = None
    difficulty: Optional[ScenarioDifficulty] = None
    duration_minutes: Optional[int] = None
    lob: Optional[str] = None


class CourseCreate(CourseBase):
    """Course creation schema"""

    scenario_ids: Optional[List[str]] = []
    microlearning_modules: Optional[List[str]] = []


class CourseUpdate(BaseModel):
    """Course update schema"""

    name: Optional[str] = None
    description: Optional[str] = None
    is_published: Optional[bool] = None


class CourseResponse(CourseBase):
    """Course response schema"""

    id: str
    created_by: str
    is_published: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== Course Assignment Schemas ====================


class CourseAssignmentBase(BaseModel):
    """Base course assignment schema"""

    course_id: str
    batch_id: Optional[str] = None
    user_id: Optional[str] = None
    due_date: Optional[datetime] = None
    is_mandatory: bool = True


class CourseAssignmentCreate(CourseAssignmentBase):
    """Course assignment creation schema"""

    pass


class CourseAssignmentResponse(CourseAssignmentBase):
    """Course assignment response schema"""

    id: str
    assigned_by: str
    assigned_at: datetime
    is_completed: bool
    completion_percentage: float

    class Config:
        from_attributes = True


# ==================== Practice Session Schemas ====================


class WordFeedback(BaseModel):
    """Word-level feedback"""

    word: str
    accuracy: float
    error_type: Optional[str] = None
    color: Optional[str] = None  # "green", "yellow", "red"


class PronunciationScores(BaseModel):
    """Pronunciation assessment scores"""

    accuracy: float = Field(ge=0, le=100)
    fluency: float = Field(ge=0, le=100)
    completeness: float = Field(ge=0, le=100)
    prosody: float = Field(ge=0, le=100)


class PracticeSessionBase(BaseModel):
    """Base practice session schema"""

    scenario_id: str
    audio_file_url: Optional[str] = None
    transcription: Optional[str] = None
    reference_text: Optional[str] = None


class PracticeSessionCreate(PracticeSessionBase):
    """Practice session creation schema"""

    pass


class PracticeSessionResponse(PracticeSessionBase):
    """Practice session response schema"""

    id: str
    user_id: str
    accuracy_score: Optional[float] = None
    fluency_score: Optional[float] = None
    clarity_score: Optional[float] = None
    keyword_adherence_score: Optional[float] = None
    overall_score: Optional[float] = None
    word_feedback: List[WordFeedback] = []
    response_duration: Optional[int] = None
    attempt_number: int
    status: str
    created_at: datetime
    is_verified: bool

    class Config:
        from_attributes = True


# ==================== Feedback Schemas ====================


class FeedbackBase(BaseModel):
    """Base feedback schema"""

    practice_session_id: str
    feedback_type: FeedbackType
    content: str


class FeedbackCreate(FeedbackBase):
    """Feedback creation schema"""

    is_automated: bool = False
    recommended_module_id: Optional[str] = None
    recommended_exercises: Optional[List[str]] = []


class FeedbackResponse(FeedbackBase):
    """Feedback response schema"""

    id: str
    trainer_id: str
    is_automated: bool
    created_at: datetime
    is_acknowledge_by_trainee: bool

    class Config:
        from_attributes = True


# ==================== Microlearning Schemas ====================


class MicrolearningModuleBase(BaseModel):
    """Base microlearning module schema"""

    title: str
    description: Optional[str] = None
    category: FeedbackType
    duration_minutes: int = 2
    skill_focus: Optional[str] = None
    content_url: Optional[str] = None
    difficulty: ScenarioDifficulty = ScenarioDifficulty.BASIC


class MicrolearningModuleCreate(MicrolearningModuleBase):
    """Microlearning module creation schema"""

    exercises: Optional[List[Dict]] = []


class MicrolearningModuleResponse(MicrolearningModuleBase):
    """Microlearning module response schema"""

    id: str
    created_by: str
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


# ==================== KPI Configuration Schemas ====================


class KPIConfigurationBase(BaseModel):
    """Base KPI configuration schema"""

    accuracy_weight: float = 30.0
    fluency_weight: float = 30.0
    clarity_weight: float = 15.0
    keyword_adherence_weight: float = 15.0
    soft_skills_weight: float = 10.0
    npl_confidence_threshold: float = 0.75
    background_noise_sensitivity: str = "medium"
    min_response_duration: int = 2
    max_response_duration: int = 60
    passing_score: float = 70.0


class KPIConfigurationCreate(KPIConfigurationBase):
    """KPI configuration creation schema"""

    pass


class KPIConfigurationResponse(KPIConfigurationBase):
    """KPI configuration response schema"""

    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== Analytics Schemas ====================


class PerformanceMetricsResponse(BaseModel):
    """Performance metrics response"""

    user_id: str
    metric_date: datetime
    period: str
    avg_overall_score: Optional[float] = None
    avg_accuracy: Optional[float] = None
    avg_fluency: Optional[float] = None
    avg_clarity: Optional[float] = None
    avg_keyword_adherence: Optional[float] = None
    avg_soft_skills: Optional[float] = None
    total_sessions: int = 0
    sessions_passed: int = 0
    sessions_failed: int = 0
    improvement_rate: Optional[float] = None

    class Config:
        from_attributes = True


class TraineeProgressResponse(BaseModel):
    """Trainee progress overview"""

    trainee_id: str
    trainee_name: str
    total_sessions: int
    sessions_passed: int
    current_average_score: float
    latest_session_score: Optional[float] = None
    improvement_trend: str  # "improving", "stable", "declining"
    last_updated: datetime


class BatchAnalyticsResponse(BaseModel):
    """Batch analytics summary"""

    batch_id: str
    batch_name: str
    total_trainees: int
    sessions_completed: int
    average_batch_score: float
    passing_rate: float  # percentage
    top_performers: List[TraineeProgressResponse] = []
    needs_improvement: List[TraineeProgressResponse] = []


# ==================== Generic Response Schemas ====================


class SuccessResponse(BaseModel):
    """Generic success response"""

    status: str = "success"
    message: str
    data: Optional[dict] = None


class ErrorResponse(BaseModel):
    """Generic error response"""

    status: str = "error"
    message: str
    details: Optional[dict] = None


class HealthCheckResponse(BaseModel):
    """Health check response"""

    status: str
    service: str
    database: str
    azure_speech: str
    auth: str


class PaginatedResponse(BaseModel):
    """Paginated response wrapper"""

    total: int
    page: int
    page_size: int
    items: List[dict]


# ==================== Sim Floor Schemas ====================


class ScenarioVariationCreate(BaseModel):
    """Create scenario variation"""

    scenario_id: str
    actor_name: str
    script: str
    score: float = 0.0
    branching_logic: Optional[str] = None


class ScenarioVariationUpdate(BaseModel):
    """Update scenario variation"""

    actor_name: Optional[str] = None
    script: Optional[str] = None
    score: Optional[float] = None
    branching_logic: Optional[str] = None
    is_active: Optional[bool] = None


class ScenarioVariationResponse(BaseModel):
    """Scenario variation response"""

    id: str
    scenario_id: str
    actor_name: str
    script: str
    score: float
    branching_logic: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SimFloorScenarioVariationInput(BaseModel):
    """Variation payload used by Sim Floor trainer CRUD."""

    actor_name: str
    script: str
    score: float = Field(default=0.0, ge=0.0, le=5.0)
    branching_logic: Optional[str] = None


class SimFloorScenarioStepInput(BaseModel):
    """Turn-based Sim Floor step definition used by the trainer scenario builder."""

    step_number: int
    actor: str
    speaker_label: Optional[str] = None
    script: str
    expected_keywords: List[str] = Field(default_factory=list)
    audio_url: Optional[str] = None
    response_time_limit: Optional[int] = None
    is_closing: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SimFloorScenarioStepResponse(BaseModel):
    """Serialized Sim Floor step for trainee playback."""

    id: Optional[str] = None
    step_number: int
    actor: str
    speaker_label: Optional[str] = None
    script: str
    expected_keywords: List[str] = Field(default_factory=list)
    audio_url: Optional[str] = None
    response_time_limit: Optional[int] = None
    is_closing: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SimFloorScenarioCreate(BaseModel):
    """Create a Sim Floor scenario owned by a trainer/admin."""

    title: str
    batch_id: str
    description: Optional[str] = None
    opening_prompt: str = "Sim Floor scenario"
    difficulty: ScenarioDifficulty = ScenarioDifficulty.BASIC
    purpose: ScenarioPurpose = ScenarioPurpose.PRACTICE
    expected_keywords: List[str] = Field(default_factory=list)
    estimated_duration: Optional[int] = None
    variations: List[SimFloorScenarioVariationInput] = Field(default_factory=list)
    steps: List[SimFloorScenarioStepInput] = Field(default_factory=list)
    member_profile: Dict[str, Any] = Field(default_factory=dict)
    cxone_metadata: Dict[str, Any] = Field(default_factory=dict)
    sim_floor_config: Dict[str, Any] = Field(default_factory=dict)
    ringer_audio_url: Optional[str] = None
    hold_audio_url: Optional[str] = None


class SimFloorScenarioUpdate(BaseModel):
    """Update a Sim Floor scenario."""

    title: Optional[str] = None
    batch_id: Optional[str] = None
    description: Optional[str] = None
    opening_prompt: Optional[str] = None
    difficulty: Optional[ScenarioDifficulty] = None
    purpose: Optional[ScenarioPurpose] = None
    expected_keywords: Optional[List[str]] = None
    estimated_duration: Optional[int] = None
    is_published: Optional[bool] = None
    variations: Optional[List[SimFloorScenarioVariationInput]] = None
    steps: Optional[List[SimFloorScenarioStepInput]] = None
    member_profile: Optional[Dict[str, Any]] = None
    cxone_metadata: Optional[Dict[str, Any]] = None
    sim_floor_config: Optional[Dict[str, Any]] = None
    ringer_audio_url: Optional[str] = None
    hold_audio_url: Optional[str] = None


class SimFloorScenarioAssignmentSummary(BaseModel):
    """Assigned batch summary for a Sim Floor scenario."""

    batch_id: str
    batch_name: str
    wave_number: Optional[int] = None
    assigned_at: Optional[datetime] = None
    trainee_count: int = 0
    completed_sessions: int = 0
    passed_sessions: int = 0
    average_score: float = 0.0
    pass_rate: float = 0.0
    latest_completed_at: Optional[datetime] = None


class SimFloorScenarioResponse(BaseModel):
    """Sim Floor scenario response with mapping and variation metadata."""

    id: str
    title: str
    description: Optional[str] = None
    opening_prompt: str
    difficulty: Optional[ScenarioDifficulty] = None
    purpose: Optional[ScenarioPurpose] = None
    expected_keywords: List[str] = Field(default_factory=list)
    estimated_duration: Optional[int] = None
    member_profile: Dict[str, Any] = Field(default_factory=dict)
    cxone_metadata: Dict[str, Any] = Field(default_factory=dict)
    sim_floor_config: Dict[str, Any] = Field(default_factory=dict)
    ringer_audio_url: Optional[str] = None
    hold_audio_url: Optional[str] = None
    batch_id: Optional[str] = None
    batch_name: Optional[str] = None
    assigned_at: Optional[datetime] = None
    is_published: bool
    is_draft: bool
    variations_count: int = 0
    variations: List[ScenarioVariationResponse] = Field(default_factory=list)
    steps_count: int = 0
    steps: List[SimFloorScenarioStepResponse] = Field(default_factory=list)
    assigned_batches: List[SimFloorScenarioAssignmentSummary] = Field(default_factory=list)
    member_count: int = 0
    completed_sessions: int = 0
    passed_sessions: int = 0
    average_score: float = 0.0
    pass_rate: float = 0.0
    latest_completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class BatchScenarioMappingCreate(BaseModel):
    """Create batch-scenario mapping"""

    batch_id: str
    scenario_id: str


class BatchScenarioMappingResponse(BaseModel):
    """Batch-scenario mapping response"""

    id: str
    batch_id: str
    scenario_id: str
    assigned_at: datetime
    assigned_by: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


class BatchKPIConfigCreate(BaseModel):
    """Create batch KPI configuration"""

    batch_id: str

    # Core KPI Weights
    speech_to_text_weight: float = 25.0
    aht_weight: float = 20.0
    rate_of_speech_weight: float = 15.0
    dead_air_weight: float = 15.0

    # Behavioral KPI Weights
    empathy_statements_weight: float = 10.0
    probing_questions_weight: float = 10.0

    # AI Assessment KPI Weights
    grammar_weight: float = 2.5
    pronunciation_weight: float = 1.0
    pacing_weight: float = 1.0

    # Negative Impact
    forbidden_words_penalty: float = 5.0

    # Threshold
    passing_score: float = 90.0

    # Keywords
    forbidden_words: List[str] = []
    empathy_keywords: List[str] = []
    probing_keywords: List[str] = []

    # Targets
    target_aht_seconds: int = 120
    target_ros_words_per_min: float = 150.0
    target_dead_air_seconds: float = 3.0


class BatchKPIConfigUpdate(BaseModel):
    """Update batch KPI configuration"""

    # Core KPI Weights
    speech_to_text_weight: Optional[float] = None
    aht_weight: Optional[float] = None
    rate_of_speech_weight: Optional[float] = None
    dead_air_weight: Optional[float] = None

    # Behavioral KPI Weights
    empathy_statements_weight: Optional[float] = None
    probing_questions_weight: Optional[float] = None

    # AI Assessment KPI Weights
    grammar_weight: Optional[float] = None
    pronunciation_weight: Optional[float] = None
    pacing_weight: Optional[float] = None

    # Negative Impact
    forbidden_words_penalty: Optional[float] = None

    # Threshold
    passing_score: Optional[float] = None

    # Keywords
    forbidden_words: Optional[List[str]] = None
    empathy_keywords: Optional[List[str]] = None
    probing_keywords: Optional[List[str]] = None

    # Targets
    target_aht_seconds: Optional[int] = None
    target_ros_words_per_min: Optional[float] = None
    target_dead_air_seconds: Optional[float] = None


class BatchKPIConfigResponse(BaseModel):
    """Batch KPI configuration response"""

    id: str
    batch_id: str

    # Core KPI Weights
    speech_to_text_weight: float
    aht_weight: float
    rate_of_speech_weight: float
    dead_air_weight: float

    # Behavioral KPI Weights
    empathy_statements_weight: float
    probing_questions_weight: float

    # AI Assessment KPI Weights
    grammar_weight: float
    pronunciation_weight: float
    pacing_weight: float

    # Negative Impact
    forbidden_words_penalty: float

    # Threshold
    passing_score: float

    # Keywords
    forbidden_words: List[str]
    empathy_keywords: List[str]
    probing_keywords: List[str]

    # Targets
    target_aht_seconds: int
    target_ros_words_per_min: float
    target_dead_air_seconds: float

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SimSessionCreate(BaseModel):
    """Create sim session"""

    scenario_id: str
    batch_id: Optional[str] = None


class SimSessionUpdate(BaseModel):
    """Update sim session"""

    status: Optional[str] = None
    current_step: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class SimSessionCompleteRequest(BaseModel):
    """Complete a Sim Floor session using already uploaded audio/transcript data."""

    audio_url: Optional[str] = None
    transcript: str
    audio_duration_seconds: int
    speech_to_text_accuracy: Optional[float] = None
    rate_of_speech: Optional[float] = None
    dead_air_seconds: Optional[float] = None
    grammar_score: Optional[float] = None
    pronunciation_score: Optional[float] = None
    pacing_score: Optional[float] = None
    detected_forbidden_words: List[str] = Field(default_factory=list)
    ai_feedback: Optional[str] = None
    transcript_log: List[Dict[str, Any]] = Field(default_factory=list)
    turn_logs: List[Dict[str, Any]] = Field(default_factory=list)


class SimSessionResponse(BaseModel):
    """Sim session response"""

    id: str
    trainee_id: str
    scenario_id: str
    scenario_variation_id: Optional[str]
    batch_id: Optional[str]

    # Session State
    status: str
    current_step: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    # Audio
    audio_url: Optional[str]
    audio_duration_seconds: Optional[int]

    # Transcript
    transcript: Optional[str]
    transcript_confidence: Optional[float]
    transcript_log: List[Dict[str, Any]] = Field(default_factory=list)
    turn_logs: List[Dict[str, Any]] = Field(default_factory=list)

    # Core KPIs
    speech_to_text_accuracy: Optional[float]
    aht_target: Optional[int]
    aht_actual: Optional[int]
    rate_of_speech: Optional[float]
    dead_air_seconds: Optional[float]

    # Behavioral
    empathy_statements_count: int
    probing_questions_count: int

    # AI Assessment
    grammar_score: Optional[float]
    pronunciation_score: Optional[float]
    pacing_score: Optional[float]
    sentiment_score: Optional[float] = None
    keyword_compliance: Optional[Dict[str, Any]] = Field(default_factory=dict)

    # Negative Impact
    forbidden_words_count: int
    forbidden_words_detected: List[str]
    forbidden_word_penalty_applied: float

    # Final
    weighted_score: Optional[float]
    pass_fail: bool

    # Attempts
    attempt_number: int
    max_attempts: int

    # Feedback
    ai_feedback: Optional[str]
    coaching_notes: Optional[str] = None
    trainer_verdict_status: str = "pending"
    trainer_verdict_notes: Optional[str] = None
    trainer_evaluated_at: Optional[datetime] = None
    certificate_id: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SimSessionStartResponse(BaseModel):
    """Response when starting a simulation session"""

    session_id: str
    scenario_title: str
    scenario_description: Optional[str]
    opening_prompt: str
    current_step: int
    variation: Optional[ScenarioVariationResponse]
    kpi_config: Optional[BatchKPIConfigResponse]
    passing_score: float
    member_profile: Dict[str, Any] = Field(default_factory=dict)
    cxone_metadata: Dict[str, Any] = Field(default_factory=dict)
    sim_floor_config: Dict[str, Any] = Field(default_factory=dict)
    ringer_audio_url: Optional[str] = None
    hold_audio_url: Optional[str] = None
    steps: List[SimFloorScenarioStepResponse] = Field(default_factory=list)


class SimSessionTurnResponse(BaseModel):
    """Response returned after a single CSR turn is recorded and assessed."""

    session_id: str
    step_number: int
    transcript: str
    audio_url: Optional[str] = None
    duration_seconds: float = 0.0
    asr_provider: Optional[str] = None
    asr_provider_label: Optional[str] = None
    transcript_confidence: float = 0.0
    matched_keywords: List[str] = Field(default_factory=list)
    speech_to_text_accuracy: float = 0.0
    grammar_score: float = 0.0
    pronunciation_score: float = 0.0
    pacing_score: float = 0.0
    rate_of_speech: float = 0.0
    dead_air_seconds: float = 0.0
    ai_feedback: Optional[str] = None
    requires_repeat: bool = False
    repeat_prompt: Optional[str] = None
    repeat_reason: Optional[str] = None
    script_similarity: float = 0.0
    next_step: Optional[int] = None
    is_complete: bool = False
    transcript_log: List[Dict[str, Any]] = Field(default_factory=list)
    turn_logs: List[Dict[str, Any]] = Field(default_factory=list)


class BulkUploadRequest(BaseModel):
    """Bulk upload scenarios"""

    batch_id: str
    scenario_title: str
    variations: List[dict]  # Actor, Script, Score, Branching Logic


class BulkUploadResponse(BaseModel):
    """Bulk upload response"""

    scenario_id: str
    variations_created: int
    failed_rows: int
    errors: List[str]


class CoachingNoteCreate(BaseModel):
    """Create coaching note for sim session"""

    session_id: str
    notes: str


class CoachingNoteResponse(BaseModel):
    """Coaching note response"""

    id: str
    session_id: str
    trainer_id: str
    notes: str
    created_at: datetime

    class Config:
        from_attributes = True


class SimSessionCoachingNoteUpdate(BaseModel):
    """Update the coaching notes for a Sim Floor session."""

    notes: str


class SimSessionTrainerVerdictUpdate(BaseModel):
    """Trainer competency decision for a Sim Floor attempt."""

    verdict_status: str
    notes: Optional[str] = None


# Update forward references
LoginResponse.model_rebuild()
