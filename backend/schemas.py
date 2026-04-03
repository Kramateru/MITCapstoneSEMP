"""
Pydantic schemas for API request/response validation
"""

from datetime import datetime
from typing import Dict, List, Optional

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
    prompt_text: Optional[str] = None
    prompt_audio: Optional[str] = None
    expected_response: Optional[str] = None
    expected_keywords_for_step: Optional[List[str]] = []
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


# Update forward references
LoginResponse.model_rebuild()
