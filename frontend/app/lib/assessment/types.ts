export type PlatformRole = 'admin' | 'trainer' | 'trainee'
export type AssessmentDefinitionType = 'multiple_choice' | 'fill_blank' | 'mixed'
export type AssessmentQuestionType = 'multiple_choice' | 'fill_blank'
export type AssessmentAttemptStatus = 'pass' | 'fail'
export type CoachingVisibility = 'shared' | 'trainer_only'

export interface BackendSessionUser {
  userId: string
  role: PlatformRole
  userName: string
}

export interface BatchOption {
  id: string
  name: string
  description?: string | null
  waveNumber?: number | null
  traineeCount: number
}

export interface TraineeOption {
  id: string
  fullName: string
  email: string
  batchIds: string[]
  batchNames: string[]
}

export interface AssessmentQuestionRecord {
  id: string
  assessmentId: string
  questionText: string
  questionType: AssessmentQuestionType
  options: string[]
  correctAnswer: string
  explanation?: string | null
  orderIndex: number
  metadata?: Record<string, unknown>
}

export interface AssessmentRecord {
  id: string
  categoryId: string
  title: string
  description?: string | null
  type: AssessmentDefinitionType
  isPublished: boolean
  instantFeedback: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  questionCount: number
  questions: AssessmentQuestionRecord[]
}

export interface CategoryRecord {
  id: string
  title: string
  description?: string | null
  passingScore: number
  createdBy: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
  assignmentCount: number
  attemptCount: number
  passRate: number
  averageScore: number
  assessments: AssessmentRecord[]
}

export interface AssignmentRecord {
  id: string
  categoryId: string
  assessmentId?: string | null
  batchId?: string | null
  traineeId?: string | null
  assignedBy: string
  assignedAt: string
  dueAt?: string | null
  isActive: boolean
  categoryTitle: string
  assessmentTitle?: string | null
  targetLabel: string
  targetType: 'batch' | 'trainee'
}

export interface AttemptQuestionResult {
  questionId: string
  questionText: string
  questionType: AssessmentQuestionType
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
  explanation?: string | null
}

export interface AttemptRecord {
  id: string
  assignmentId?: string | null
  assessmentId: string
  categoryId: string
  assessmentTitle: string
  categoryTitle: string
  traineeId: string
  traineeName: string
  traineeEmail?: string | null
  batchId?: string | null
  batchName?: string | null
  attemptNo: number
  score: number
  status: AssessmentAttemptStatus
  feedback?: string | null
  trainerNote?: string | null
  submittedAt: string
  certificateId?: string | null
  certificateCode?: string | null
  questionResults: AttemptQuestionResult[]
}

export interface CoachingNoteRecord {
  id: string
  attemptId: string
  trainerId: string
  traineeId: string
  note: string
  actionItems?: string | null
  visibility: CoachingVisibility
  createdAt: string
  updatedAt: string
}

export interface CertificateRecord {
  id: string
  traineeId: string
  categoryId: string
  assessmentId: string
  attemptId: string
  categoryTitle: string
  assessmentTitle: string
  certificateCode: string
  earnedAt: string
}

export interface CategoryReportRecord {
  categoryId: string
  categoryTitle: string
  passingScore: number
  attemptCount: number
  passCount: number
  failCount: number
  averageScore: number
  passRate: number
}

export interface QuestionReportRecord {
  questionId: string
  assessmentId: string
  categoryId: string
  questionText: string
  questionType: AssessmentQuestionType
  answerCount: number
  correctCount: number
  incorrectCount: number
  missRate: number
}

export interface TrainerBootstrapResponse {
  categories: CategoryRecord[]
  batches: BatchOption[]
  trainees: TraineeOption[]
  assignments: AssignmentRecord[]
  attempts: AttemptRecord[]
  reports: {
    categories: CategoryReportRecord[]
    questions: QuestionReportRecord[]
  }
}

export interface TraineeAssessmentCard {
  assignmentId?: string | null
  assessmentId: string
  categoryId: string
  categoryTitle: string
  assessmentTitle: string
  assessmentDescription?: string | null
  type: AssessmentDefinitionType
  passingScore: number
  targetDueAt?: string | null
  targetLabel: string
  questionCount: number
  questionTypes: AssessmentQuestionType[]
  latestAttempt?: AttemptRecord
  certificate?: CertificateRecord
  questions: AssessmentQuestionRecord[]
}

export interface TraineeDashboardResponse {
  availableAssessments: TraineeAssessmentCard[]
  attempts: AttemptRecord[]
  coachingNotes: CoachingNoteRecord[]
  certificates: CertificateRecord[]
  stats: {
    assignedCount: number
    completedCount: number
    passedCount: number
    averageScore: number
  }
}

export interface SubmitAssessmentPayload {
  assessmentId: string
  assignmentId?: string | null
  answers: Record<string, string>
}

export interface SubmitAssessmentResponse {
  attempt: AttemptRecord
  certificate?: CertificateRecord | null
}

export interface CreateCategoryPayload {
  title: string
  description?: string
  passingScore: number
}

export type UpdateCategoryPayload = CreateCategoryPayload

export interface CreateAssessmentPayload {
  categoryId: string
  title: string
  description?: string
  type: AssessmentDefinitionType
  isPublished?: boolean
}

export interface UpdateAssessmentPayload {
  title: string
  description?: string
  type: AssessmentDefinitionType
  isPublished: boolean
}

export interface CreateQuestionPayload {
  assessmentId: string
  questionText: string
  questionType: AssessmentQuestionType
  options: string[]
  correctAnswer: string
  explanation?: string
  orderIndex: number
}

export type UpdateQuestionPayload = CreateQuestionPayload

export interface CreateAssignmentPayload {
  categoryId: string
  assessmentId?: string | null
  batchId?: string | null
  traineeId?: string | null
  dueAt?: string | null
}

export interface CoachAttemptPayload {
  attemptId: string
  feedback: string
  trainerNote?: string
  actionItems?: string
  visibility?: CoachingVisibility
}
