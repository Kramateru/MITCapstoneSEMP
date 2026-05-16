export type PlatformRole = 'admin' | 'trainer' | 'trainee'
export type AssessmentDefinitionType = 'multiple_choice' | 'fill_blank' | 'mixed'
export type AssessmentQuestionType = 'multiple_choice' | 'fill_blank'
export type AssessmentAttemptStatus = 'pass' | 'fail'
export type CoachingVisibility = 'shared' | 'trainer_only'
export type AssignmentMode = 'selected_questions' | 'entire_category' | 'random_subset'
export type AssignmentTargetType = 'batch' | 'wave' | 'trainee'
export type QuestionDifficulty = 'easy' | 'medium' | 'hard'
export type CertificateStatus = 'issued' | 'revoked' | 'not_issued'
export type AnalysisSource = 'rules' | 'ai'
export type AssessmentSectionRole = 'trainer' | 'trainee' | 'admin'

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
  createdBy?: string
}

export interface WaveOption {
  waveNumber: number
  label: string
  batchCount: number
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
  assessmentTitle?: string | null
  categoryId?: string
  categoryName?: string | null
  trainerId?: string | null
  questionNumber?: number
  questionText: string
  questionType: AssessmentQuestionType
  options: string[]
  choices?: string[]
  correctAnswer: string
  difficulty?: QuestionDifficulty | null
  explanation?: string | null
  pointValue?: number
  orderIndex: number
  activeStatus?: boolean
  createdAt?: string
  updatedAt?: string
  metadata?: Record<string, unknown>
  usageCount?: number
  answerCount?: number
  correctCount?: number
  incorrectCount?: number
  accuracyRate?: number
  missRate?: number
  lastUsedAt?: string | null
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
  categoryName?: string
  description?: string | null
  passingScore: number
  createdBy: string
  trainerId?: string
  activeStatus?: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
  questionCount?: number
  assignmentCount: number
  activeAssignmentCount?: number
  attemptCount: number
  passRate: number
  averageScore: number
  completionRate?: number
  retakeRate?: number
  highestScore?: number
  lowestScore?: number
  assessments: AssessmentRecord[]
}

export interface AssignmentRecord {
  id: string
  categoryId: string
  assessmentId?: string | null
  batchId?: string | null
  waveNumber?: number | null
  traineeId?: string | null
  assignedBy: string
  assignedAt: string
  dueAt?: string | null
  isActive: boolean
  categoryTitle: string
  categoryName?: string
  assessmentTitle?: string | null
  title?: string
  description?: string | null
  targetLabel: string
  targetType: AssignmentTargetType
  assignmentMode?: AssignmentMode
  questionCount?: number
  randomQuestionCount?: number | null
  passingScore?: number
  maximumAttempts?: number | null
  timeLimitMinutes?: number | null
  shuffleChoices?: boolean
  shuffleQuestions?: boolean
  selectedQuestionIds?: string[]
  assignedTrainees?: number
  completedTrainees?: number
  passedTrainees?: number
  failedTrainees?: number
  certificateCount?: number
  averageScore?: number
  highestScore?: number
  lowestScore?: number
  retakeRate?: number
  statusLabel?: string
}

export interface AttemptQuestionResult {
  questionId: string
  questionNumber?: number
  questionText: string
  questionType: AssessmentQuestionType
  difficulty?: QuestionDifficulty | null
  options?: string[]
  choiceOrder?: string[]
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
  explanation?: string | null
  points?: number
  earnedPoints?: number
}

export interface AttemptAnalysisSummary {
  source: AnalysisSource
  summary: string
  strengths: string[]
  improvements: string[]
  recommendations: string[]
  earnedPoints?: number
  totalPoints?: number
  categoryBreakdown: Array<{
    categoryId: string
    categoryTitle: string
    totalQuestions: number
    correctAnswers: number
    score: number
  }>
}

export interface AttemptRecord {
  id: string
  assignmentId?: string | null
  assessmentId: string
  categoryId: string
  assignmentTitle?: string
  assessmentTitle: string
  categoryTitle: string
  traineeId: string
  traineeName: string
  traineeEmail?: string | null
  batchId?: string | null
  batchName?: string | null
  waveNumber?: number | null
  attemptNo: number
  score: number
  passingScore?: number
  status: AssessmentAttemptStatus
  feedback?: string | null
  trainerNote?: string | null
  submittedAt: string
  startedAt?: string | null
  completedAt?: string | null
  timeSpentSeconds?: number
  correctAnswers?: number
  incorrectAnswers?: number
  totalQuestions?: number
  certificateId?: string | null
  certificateCode?: string | null
  certificateStatus?: CertificateStatus
  certificateUrl?: string | null
  attemptsRemaining?: number | null
  canRetake?: boolean
  statusLabel?: string
  questionResults: AttemptQuestionResult[]
  analysis?: AttemptAnalysisSummary
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
  assignmentId?: string | null
  assessmentId: string
  attemptId: string
  categoryTitle: string
  assignmentTitle?: string
  assessmentTitle: string
  certificateCode: string
  certificateStatus?: CertificateStatus
  certificateUrl?: string | null
  earnedAt: string
}

export interface CategoryReportRecord {
  categoryId: string
  categoryTitle: string
  passingScore: number
  questionCount?: number
  assignmentCount?: number
  assignedTraineeCount?: number
  completedTraineeCount?: number
  attemptCount: number
  passCount: number
  failCount: number
  averageScore: number
  passRate: number
  failRate?: number
  retakeRate?: number
  highestScore?: number
  lowestScore?: number
  completionRate?: number
}

export interface BatchReportRecord {
  batchId: string
  batchName: string
  waveNumber?: number | null
  categoryId: string
  categoryTitle: string
  assignmentCount: number
  assignedTraineeCount: number
  completedTraineeCount: number
  attemptCount: number
  averageScore: number
  passRate: number
  completionRate: number
  highestScore: number
  lowestScore: number
}

export interface WaveReportRecord {
  waveNumber: number
  categoryId: string
  categoryTitle: string
  assignmentCount: number
  assignedTraineeCount: number
  completedTraineeCount: number
  attemptCount: number
  averageScore: number
  passRate: number
  completionRate: number
  highestScore: number
  lowestScore: number
}

export interface TraineeReportRecord {
  traineeId: string
  traineeName: string
  traineeEmail: string
  batchId?: string | null
  batchName?: string | null
  waveNumber?: number | null
  categoryId: string
  categoryTitle: string
  attemptCount: number
  passCount: number
  failCount: number
  averageScore: number
  highestScore: number
  lowestScore: number
  lastAttemptAt?: string | null
  certificateCount: number
}

export interface TrainerReportRecord {
  trainerId: string
  trainerName: string
  trainerEmail: string
  categoryCount: number
  assignmentCount: number
  attemptCount: number
  passRate: number
  averageScore: number
  certificateCount: number
}

export interface QuestionReportRecord {
  questionId: string
  categoryId: string
  categoryTitle?: string
  questionNumber?: number
  questionText: string
  questionType: AssessmentQuestionType
  difficulty?: QuestionDifficulty | null
  answerCount: number
  correctCount: number
  incorrectCount: number
  missRate: number
}

export interface TrainerBootstrapResponse {
  categories: CategoryRecord[]
  questions?: AssessmentQuestionRecord[]
  batches: BatchOption[]
  waves?: WaveOption[]
  trainees: TraineeOption[]
  assignments: AssignmentRecord[]
  attempts: AttemptRecord[]
  certificates?: CertificateRecord[]
  reports: {
    categories: CategoryReportRecord[]
    batches?: BatchReportRecord[]
    waves?: WaveReportRecord[]
    trainees?: TraineeReportRecord[]
    trainers?: TrainerReportRecord[]
    questions: QuestionReportRecord[]
  }
  analytics?: {
    totalQuestions: number
    totalAssignments: number
    activeAssignments: number
    totalAttempts: number
    passRate: number
    failRate?: number
    retakeRate?: number
    averageScore: number
    highestScore?: number
    lowestScore?: number
    certificatesIssued: number
  }
}

export interface TraineeAssessmentCard {
  assignmentId: string
  assessmentId: string
  categoryId: string
  categoryTitle: string
  targetType?: AssignmentTargetType
  waveNumber?: number | null
  assignmentTitle?: string
  assessmentTitle: string
  assessmentDescription?: string | null
  type: AssessmentDefinitionType
  passingScore: number
  targetDueAt?: string | null
  targetLabel: string
  questionCount: number
  questionTypes: AssessmentQuestionType[]
  latestAttempt?: AttemptRecord
  attemptCount?: number
  attemptsRemaining?: number | null
  canStart?: boolean
  canRetake?: boolean
  isCompleted?: boolean
  maximumAttempts?: number | null
  timeLimitMinutes?: number | null
  certificate?: CertificateRecord
  statusLabel?: string
  questions: AssessmentQuestionRecord[]
}

export interface AssessmentSessionQuestion {
  id: string
  questionNumber: number
  questionText: string
  questionType: AssessmentQuestionType
  difficulty?: QuestionDifficulty | null
  choices: string[]
  pointValue?: number
}

export interface TraineeAssessmentSession {
  assignmentId: string
  assessmentId: string
  categoryId: string
  categoryTitle: string
  targetType?: AssignmentTargetType
  waveNumber?: number | null
  assignmentTitle?: string
  assessmentTitle: string
  description?: string | null
  passingScore: number
  targetDueAt?: string | null
  targetLabel: string
  questionCount: number
  attemptCount?: number
  attemptsRemaining?: number | null
  maximumAttempts?: number | null
  timeLimitMinutes?: number | null
  canRetake: boolean
  isCompleted: boolean
  latestAttempt?: AttemptRecord
  certificate?: CertificateRecord
  statusLabel?: string
  questions: AssessmentSessionQuestion[]
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
    retakeCount?: number
    certificateCount?: number
  }
}

export interface SubmitAssessmentPayload {
  assignmentId?: string | null
  assessmentId?: string | null
  answers: Record<string, string>
  questionIds?: string[]
  choiceMap?: Record<string, string[]>
  timeSpentSeconds?: number
  startedAt?: string | null
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
  assessmentId?: string
  categoryId?: string
  questionNumber: number
  questionText: string
  questionType: AssessmentQuestionType
  options: string[]
  correctAnswer: string
  difficulty?: QuestionDifficulty | null
  explanation?: string
  points?: number | null
  orderIndex: number
}

export type UpdateQuestionPayload = CreateQuestionPayload

export interface CreateAssignmentPayload {
  categoryId: string
  assessmentId?: string | null
  targetType?: AssignmentTargetType
  batchId?: string | null
  waveNumber?: number | null
  traineeId?: string | null
  dueAt?: string | null
  title: string
  description?: string
  assignmentMode: AssignmentMode
  questionIds?: string[]
  randomQuestionCount?: number | null
  passingScore?: number
  maximumAttempts?: number | null
  timeLimitMinutes?: number | null
  shuffleChoices?: boolean
  shuffleQuestions?: boolean
}

export type UpdateAssignmentPayload = CreateAssignmentPayload

export interface CoachAttemptPayload {
  attemptId: string
  feedback: string
  trainerNote?: string
  actionItems?: string
  visibility?: CoachingVisibility
}

export interface BulkUploadErrorRecord {
  rowNumber: number
  category: string
  questionNumber: string
  question: string
  error: string
}

export interface BulkUploadQuestionsResponse {
  totalRows: number
  successfulImports: number
  failedRows: number
  importedQuestions: AssessmentQuestionRecord[]
  errors: BulkUploadErrorRecord[]
  createdCategories?: string[]
  errorCsv?: string | null
}
