import 'server-only'

import { fetchBackendPath } from '@/app/lib/backend-proxy'

import { AssessmentHttpError } from './backend-auth'
import { buildAttemptAnalysisSummary, normalizeAssessmentAnswer, shuffleChoices } from './scoring'
import type {
    AssessmentQuestionRecord,
    AssignmentRecord,
    AttemptRecord,
    BackendSessionUser,
    BatchOption,
    BatchReportRecord,
    BulkUploadErrorRecord,
    BulkUploadQuestionsResponse,
    CategoryRecord,
    CategoryReportRecord,
    CertificateRecord,
    CoachAttemptPayload,
    CoachingNoteRecord,
    CreateAssignmentPayload,
    CreateCategoryPayload,
    CreateQuestionPayload,
    QuestionReportRecord,
    SubmitAssessmentPayload,
    SubmitAssessmentResponse,
    TraineeAssessmentCard,
    TraineeAssessmentSession,
    TraineeDashboardResponse,
    TraineeOption,
    TraineeReportRecord,
    TrainerBootstrapResponse,
    UpdateAssignmentPayload,
    UpdateCategoryPayload,
    UpdateQuestionPayload,
    WaveOption,
    WaveReportRecord,
} from './types'

const QUESTION_TEMPLATE_HEADER = [
  'Question Number',
  'Category',
  'Question',
  'Choice 1',
  'Choice 2',
  'Choice 3',
  'Choice 4',
  'Correct Answer',
]

const DEFAULT_PASSING_SCORE = 90

type BackendMcqCategory = {
  id: string
  name: string
  description?: string | null
  passing_threshold?: number | null
  created_by: string
  created_by_name?: string | null
  created_at?: string | null
  updated_at?: string | null
  question_count?: number | null
  selected_question_ids?: string[] | null
  selected_question_count?: number | null
  assignment_count?: number | null
}

type BackendMcqQuestion = {
  id: string
  category_id: string
  category_name?: string | null
  question_text: string
  options?: Record<string, string | null> | null
  correct_option?: string | null
  explanation?: string | null
  created_by?: string | null
  created_at?: string | null
  updated_at?: string | null
  is_selected_for_assessment?: boolean | null
}

type BackendAssignmentTrainee = {
  id: string
  full_name: string
  email: string
  batch_id?: string | null
  batch_name?: string | null
  status?: 'completed' | 'pending' | null
  score_percentage?: number | null
  is_passed?: boolean | null
  attempt_count?: number | null
  submitted_at?: string | null
  certificate_id?: string | null
  certificate_no?: string | null
}

type BackendMcqAssignment = {
  id: string
  title: string
  description?: string | null
  category_id: string
  category_name?: string | null
  passing_threshold?: number | null
  time_limit_minutes?: number | null
  assigned_batch_id?: string | null
  assigned_batch_name?: string | null
  assigned_user_id?: string | null
  assigned_user_name?: string | null
  assigned_by: string
  assigned_by_name?: string | null
  question_ids?: string[] | null
  category_question_count?: number | null
  question_bank_count?: number | null
  question_count?: number | null
  total_trainees?: number | null
  completed_trainees?: number | null
  pending_trainees?: number | null
  passed_trainees?: number | null
  certificate_count?: number | null
  completion_rate?: number | null
  is_complete?: boolean | null
  due_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  trainees?: BackendAssignmentTrainee[] | null
}

type BackendTrainerBatch = {
  id: string
  name: string
  description?: string | null
  wave_number?: number | null
  users_count?: number | null
}

type BackendTrainerTrainee = {
  id: string
  email: string
  full_name: string
  batch_ids?: string[] | null
  batch_names?: string[] | null
}

type BackendMcqAssessmentSummary = {
  id: string
  title: string
  description?: string | null
  category_id: string
  category_name?: string | null
  question_ids?: string[] | null
  question_count?: number | null
  passing_threshold?: number | null
  time_limit_minutes?: number | null
  assigned_batch_id?: string | null
  assigned_user_id?: string | null
  due_date?: string | null
  is_completed?: boolean | null
  is_passed?: boolean | null
  status?: 'pending' | 'failed' | 'passed' | null
  score_percentage?: number | null
  can_retake?: boolean | null
  attempt_count?: number | null
  submitted_at?: string | null
  latest_review?: BackendReviewRow[] | null
  certificate_id?: string | null
  certificate_no?: string | null
}

type BackendMcqAssessmentDetail = {
  id: string
  title: string
  description?: string | null
  category_id: string
  time_limit_minutes?: number | null
  status?: 'pending' | 'failed' | 'passed' | null
  can_retake?: boolean | null
  is_locked?: boolean | null
  latest_submission?: {
    score_percentage?: number | null
    is_passed?: boolean | null
    attempt_count?: number | null
    submitted_at?: string | null
    review?: BackendReviewRow[] | null
    certificate_id?: string | null
    certificate_no?: string | null
  } | null
  questions: Array<{
    id: string
    question_text: string
    options?: Record<string, string | null> | null
  }>
}

type BackendReviewRow = {
  question_id?: string | null
  selected?: string | null
  correct?: string | null
  is_correct?: boolean | null
  explanation?: string | null
}

type BackendSubmitResponse = {
  score_percentage?: number | null
  is_passed?: boolean | null
  review?: BackendReviewRow[] | null
  certificate_id?: string | null
  certificate_no?: string | null
}

type BackendCoachingLog = {
  id: string
  trainee_id: string
  trainer_id: string
  strengths?: string | null
  opportunities?: string | null
  action_plan?: string | null
  trainer_remarks?: string | null
  created_at?: string | null
  updated_at?: string | null
  status?: string | null
}

type BackendListResponse<T, K extends string> = Record<K, T[]>

type ParsedAttemptIdentifier = {
  assignmentId: string
  traineeId: string
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toIsoString(value: unknown, fallback?: string | null) {
  if (typeof value === 'string' && value.trim()) {
    return value
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }

  return fallback ?? null
}

function toNonEmptyString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function buildAttemptId(assignmentId: string, traineeId: string) {
  return `${assignmentId}::${traineeId}`
}

function parseAttemptId(value: string): ParsedAttemptIdentifier | null {
  const segments = value.split('::')
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    return null
  }

  return {
    assignmentId: segments[0],
    traineeId: segments[1],
  }
}

function readAuthorizationHeader(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization) {
    throw new AssessmentHttpError(401, 'Missing authorization token.')
  }

  return authorization
}

function readErrorMessage(payload: unknown, fallback: string) {
  const candidate = payload as { detail?: string; error?: string; message?: string } | null
  return candidate?.detail || candidate?.error || candidate?.message || fallback
}

async function fetchBackendJson<T>(
  request: Request,
  path: string,
  init: RequestInit = {},
  options: { search?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers || undefined)
  headers.set('Authorization', readAuthorizationHeader(request))
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetchBackendPath(path, {
    ...init,
    headers,
    cache: 'no-store',
  }, {
    search: options.search,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new AssessmentHttpError(response.status, readErrorMessage(payload, 'Assessment request failed.'))
  }

  return payload as T
}

function formatBatchLabel(batch: Pick<BatchOption, 'name' | 'waveNumber'> | null | undefined) {
  if (!batch) {
    return 'Batch Assignment'
  }

  if (batch.waveNumber === null || batch.waveNumber === undefined) {
    return batch.name
  }

  return `${batch.name} | Wave ${batch.waveNumber}`
}

function buildWaveOptions(batches: BatchOption[]): WaveOption[] {
  const waveMap = new Map<number, { batchCount: number; traineeCount: number }>()

  for (const batch of batches) {
    if (batch.waveNumber === null || batch.waveNumber === undefined) {
      continue
    }

    const current = waveMap.get(batch.waveNumber) || { batchCount: 0, traineeCount: 0 }
    current.batchCount += 1
    current.traineeCount += batch.traineeCount || 0
    waveMap.set(batch.waveNumber, current)
  }

  return Array.from(waveMap.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([waveNumber, meta]) => ({
      waveNumber,
      label: `Wave ${waveNumber}`,
      batchCount: meta.batchCount,
      traineeCount: meta.traineeCount,
    }))
}

function getOptionEntries(options?: Record<string, string | null> | null) {
  const order = ['A', 'B', 'C', 'D']
  return order
    .map((key) => [key, toNonEmptyString(options?.[key])])
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
}

function getOptionChoices(options?: Record<string, string | null> | null) {
  return getOptionEntries(options).map(([, value]) => value)
}

function getCorrectAnswerText(question: Pick<BackendMcqQuestion, 'options' | 'correct_option'>) {
  const correctKey = toNonEmptyString(question.correct_option).toUpperCase()
  if (!correctKey) {
    return ''
  }

  return toNonEmptyString(question.options?.[correctKey], correctKey)
}

function resolveSelectedOptionKey(
  options: Record<string, string | null> | null | undefined,
  answer: string,
) {
  const normalizedAnswer = normalizeAssessmentAnswer(answer)
  if (!normalizedAnswer) {
    return ''
  }

  const directKey = answer.trim().toUpperCase()
  if (options && directKey in options) {
    return directKey
  }

  for (const [key, value] of getOptionEntries(options)) {
    if (normalizeAssessmentAnswer(value) === normalizedAnswer) {
      return key
    }
  }

  return ''
}

function buildPassFailMessage(score: number, passingScore: number) {
  if (score >= passingScore) {
    return 'Passing score achieved. Your certificate is now available.'
  }

  return 'Passing score not reached yet. Review the feedback and retake the assessment.'
}

function mapTrainerBatch(batch: BackendTrainerBatch): BatchOption {
  return {
    id: batch.id,
    name: batch.name,
    description: batch.description,
    waveNumber: batch.wave_number ?? null,
    traineeCount: toNumber(batch.users_count),
  }
}

function mapTrainerTrainee(trainee: BackendTrainerTrainee): TraineeOption {
  return {
    id: trainee.id,
    fullName: trainee.full_name,
    email: trainee.email,
    batchIds: Array.isArray(trainee.batch_ids) ? trainee.batch_ids.filter(Boolean) : [],
    batchNames: Array.isArray(trainee.batch_names) ? trainee.batch_names.filter(Boolean) : [],
  }
}

function mapQuestion(
  question: BackendMcqQuestion,
  orderIndex: number,
): AssessmentQuestionRecord {
  return {
    id: question.id,
    assessmentId: question.category_id,
    categoryId: question.category_id,
    categoryName: question.category_name || null,
    trainerId: question.created_by || null,
    questionNumber: orderIndex + 1,
    questionText: question.question_text,
    questionType: 'multiple_choice',
    options: getOptionChoices(question.options),
    choices: getOptionChoices(question.options),
    correctAnswer: getCorrectAnswerText(question),
    difficulty: null,
    explanation: question.explanation || null,
    orderIndex,
    activeStatus: true,
    createdAt: toIsoString(question.created_at) || undefined,
    updatedAt: toIsoString(question.updated_at) || undefined,
    metadata: {},
  }
}

function buildQuestionMap(rawQuestions: BackendMcqQuestion[]) {
  const grouped = new Map<string, BackendMcqQuestion[]>()
  for (const question of rawQuestions) {
    const current = grouped.get(question.category_id) || []
    current.push(question)
    grouped.set(question.category_id, current)
  }

  const mapped: AssessmentQuestionRecord[] = []
  const byId = new Map<string, AssessmentQuestionRecord>()
  const byCategory = new Map<string, AssessmentQuestionRecord[]>()

  for (const [categoryId, categoryQuestions] of grouped.entries()) {
    categoryQuestions.sort((left, right) => {
      const leftTime = Date.parse(toIsoString(left.created_at, '') || '')
      const rightTime = Date.parse(toIsoString(right.created_at, '') || '')
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime
      }

      return left.question_text.localeCompare(right.question_text)
    })

    const categoryMapped = categoryQuestions.map((question, index) => mapQuestion(question, index))
    byCategory.set(categoryId, categoryMapped)
    for (const question of categoryMapped) {
      mapped.push(question)
      byId.set(question.id, question)
    }
  }

  return {
    questions: mapped,
    questionsById: byId,
    questionsByCategory: byCategory,
  }
}

function mapCertificate({
  certificateId,
  certificateCode,
  traineeId,
  categoryId,
  categoryTitle,
  assessmentId,
  assessmentTitle,
  assignmentId,
  assignmentTitle,
  earnedAt,
}: {
  certificateId: string,
  certificateCode: string,
  traineeId: string,
  categoryId: string,
  categoryTitle: string,
  assessmentId: string,
  assessmentTitle: string,
  assignmentId?: string | null,
  assignmentTitle?: string | null,
  earnedAt?: string | null,
}): CertificateRecord {
  return {
    id: certificateId,
    traineeId,
    categoryId,
    assignmentId: assignmentId || null,
    assessmentId,
    attemptId: assignmentId ? buildAttemptId(assignmentId, traineeId) : `${assessmentId}::${traineeId}`,
    categoryTitle,
    assignmentTitle: assignmentTitle || assessmentTitle,
    assessmentTitle,
    certificateCode,
    certificateStatus: 'issued',
    certificateUrl: `/trainee/assessment?section=certificates&certificateId=${certificateId}`,
    earnedAt: earnedAt || new Date().toISOString(),
  }
}

function mapAttemptFromAssignment(
  assignment: BackendMcqAssignment,
  trainee: BackendAssignmentTrainee,
  { batchMap, latestCoachingByTrainee }: { batchMap: Map<string, BatchOption>, latestCoachingByTrainee: Map<string, BackendCoachingLog> },
): AttemptRecord | null {
  if (trainee.score_percentage === null || trainee.score_percentage === undefined || trainee.is_passed === null || trainee.is_passed === undefined) {
    return null
  }

  const batch = trainee.batch_id ? batchMap.get(trainee.batch_id) : (assignment.assigned_batch_id ? batchMap.get(assignment.assigned_batch_id) : null)
  const categoryTitle = assignment.category_name || 'Assessment Category'
  const passingScore = toNumber(assignment.passing_threshold, DEFAULT_PASSING_SCORE)
  const coaching = latestCoachingByTrainee.get(trainee.id)
  const score = toNumber(trainee.score_percentage)
  const analysis = buildAttemptAnalysisSummary({
    categoryId: assignment.category_id,
    categoryTitle,
    score,
    questionResults: [],
  })

  return {
    id: buildAttemptId(assignment.id, trainee.id),
    assignmentId: assignment.id,
    assessmentId: assignment.id,
    categoryId: assignment.category_id,
    assignmentTitle: assignment.title,
    assessmentTitle: assignment.title,
    categoryTitle,
    traineeId: trainee.id,
    traineeName: trainee.full_name,
    traineeEmail: trainee.email,
    batchId: trainee.batch_id || assignment.assigned_batch_id || null,
    batchName: trainee.batch_name || assignment.assigned_batch_name || null,
    waveNumber: batch?.waveNumber ?? null,
    attemptNo: Math.max(toNumber(trainee.attempt_count, 1), 1),
    score,
    passingScore,
    status: trainee.is_passed ? 'pass' : 'fail',
    feedback: coaching?.strengths || buildPassFailMessage(score, passingScore),
    trainerNote: coaching?.trainer_remarks || coaching?.opportunities || null,
    submittedAt: toIsoString(trainee.submitted_at) || new Date().toISOString(),
    completedAt: toIsoString(trainee.submitted_at) || new Date().toISOString(),
    timeSpentSeconds: 0,
    totalQuestions: toNumber(assignment.question_count),
    correctAnswers: undefined,
    incorrectAnswers: undefined,
    certificateId: trainee.certificate_id || null,
    certificateCode: trainee.certificate_no || null,
    certificateStatus: trainee.certificate_id ? 'issued' : 'not_issued',
    certificateUrl: trainee.certificate_id
      ? `/trainee/assessment?section=certificates&certificateId=${trainee.certificate_id}`
      : null,
    questionResults: [],
    analysis,
  }
}

function mapAssignment(
  assignment: BackendMcqAssignment,
  { categoriesById, batchMap }: { categoriesById: Map<string, CategoryRecord>, batchMap: Map<string, BatchOption> },
): AssignmentRecord {
  const batch = assignment.assigned_batch_id ? batchMap.get(assignment.assigned_batch_id) : null
  const category = categoriesById.get(assignment.category_id)
  const traineeScores = (assignment.trainees || [])
    .map((trainee) => toNumber(trainee.score_percentage, Number.NaN))
    .filter((score) => Number.isFinite(score))
  const averageScore = traineeScores.length
    ? Number((traineeScores.reduce((sum, score) => sum + score, 0) / traineeScores.length).toFixed(2))
    : 0

  return {
    id: assignment.id,
    categoryId: assignment.category_id,
    assessmentId: assignment.id,
    batchId: assignment.assigned_batch_id || null,
    waveNumber: batch?.waveNumber ?? null,
    traineeId: assignment.assigned_user_id || null,
    assignedBy: assignment.assigned_by,
    assignedAt: toIsoString(assignment.created_at) || new Date().toISOString(),
    dueAt: toIsoString(assignment.due_date),
    isActive: true,
    categoryTitle: assignment.category_name || category?.title || 'Assessment Category',
    categoryName: assignment.category_name || category?.title || 'Assessment Category',
    assessmentTitle: assignment.title,
    title: assignment.title,
    description: assignment.description || null,
    targetLabel: assignment.assigned_user_name || assignment.assigned_batch_name || formatBatchLabel(batch),
    targetType: assignment.assigned_user_id ? 'trainee' : 'batch',
    assignmentMode: category && Array.isArray(category.assessments) ? 'selected_questions' : 'entire_category',
    questionCount: toNumber(assignment.question_count),
    passingScore: toNumber(assignment.passing_threshold, DEFAULT_PASSING_SCORE),
    timeLimitMinutes: Math.max(toNumber(assignment.time_limit_minutes, 30), 1),
    shuffleChoices: true,
    shuffleQuestions: false,
    selectedQuestionIds: Array.isArray(assignment.question_ids) ? assignment.question_ids.filter(Boolean) : [],
    assignedTrainees: toNumber(assignment.total_trainees),
    completedTrainees: toNumber(assignment.completed_trainees),
    passedTrainees: toNumber(assignment.passed_trainees),
    failedTrainees: Math.max(
      toNumber(assignment.completed_trainees) - toNumber(assignment.passed_trainees),
      0,
    ),
    certificateCount: toNumber(assignment.certificate_count),
    averageScore,
    highestScore: traineeScores.length ? Math.max(...traineeScores) : 0,
    lowestScore: traineeScores.length ? Math.min(...traineeScores) : 0,
    retakeRate:
      toNumber(assignment.completed_trainees) > 0
        ? Number(
            (
              ((toNumber(assignment.completed_trainees) - toNumber(assignment.passed_trainees))
                / Math.max(toNumber(assignment.completed_trainees), 1))
              * 100
            ).toFixed(2),
          )
        : 0,
    statusLabel: toNumber(assignment.completed_trainees) >= toNumber(assignment.total_trainees) && toNumber(assignment.total_trainees) > 0
      ? 'completed'
      : toNumber(assignment.completed_trainees) > 0
        ? 'in_progress'
        : 'pending',
  }
}

function buildCategoryMetrics(
  categories: BackendMcqCategory[],
  questionsByCategory: Map<string, AssessmentQuestionRecord[]>,
  assignments: AssignmentRecord[],
  attempts: AttemptRecord[],
) {
  return categories.map((category) => {
    const categoryAssignments = assignments.filter((assignment) => assignment.categoryId === category.id)
    const categoryAttempts = attempts.filter((attempt) => attempt.categoryId === category.id)
    const passCount = categoryAttempts.filter((attempt) => attempt.status === 'pass').length
    const failCount = categoryAttempts.filter((attempt) => attempt.status === 'fail').length
    const averageScore = categoryAttempts.length
      ? Number((categoryAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / categoryAttempts.length).toFixed(2))
      : 0
    const assignedTrainees = categoryAssignments.reduce((sum, assignment) => sum + (assignment.assignedTrainees || 0), 0)
    const completedTrainees = categoryAssignments.reduce((sum, assignment) => sum + (assignment.completedTrainees || 0), 0)

    return {
      id: category.id,
      title: category.name,
      categoryName: category.name,
      description: category.description || null,
      passingScore: toNumber(category.passing_threshold, DEFAULT_PASSING_SCORE),
      createdBy: category.created_by,
      trainerId: category.created_by,
      activeStatus: true,
      isArchived: false,
      createdAt: toIsoString(category.created_at) || new Date().toISOString(),
      updatedAt: toIsoString(category.updated_at) || new Date().toISOString(),
      questionCount: questionsByCategory.get(category.id)?.length || toNumber(category.question_count),
      assignmentCount: categoryAssignments.length,
      activeAssignmentCount: categoryAssignments.length,
      attemptCount: categoryAttempts.length,
      passRate: categoryAttempts.length ? Number(((passCount / categoryAttempts.length) * 100).toFixed(2)) : 0,
      averageScore,
      completionRate: assignedTrainees > 0 ? Number(((completedTrainees / assignedTrainees) * 100).toFixed(2)) : 0,
      retakeRate: categoryAttempts.length ? Number(((failCount / categoryAttempts.length) * 100).toFixed(2)) : 0,
      highestScore: categoryAttempts.length ? Math.max(...categoryAttempts.map((attempt) => attempt.score)) : 0,
      lowestScore: categoryAttempts.length ? Math.min(...categoryAttempts.map((attempt) => attempt.score)) : 0,
      assessments: [],
    } satisfies CategoryRecord
  })
}

function buildCategoryReports(
  categories: CategoryRecord[],
  assignments: AssignmentRecord[],
  attempts: AttemptRecord[],
): CategoryReportRecord[] {
  return categories.map((category) => {
    const categoryAssignments = assignments.filter((assignment) => assignment.categoryId === category.id)
    const categoryAttempts = attempts.filter((attempt) => attempt.categoryId === category.id)
    const passCount = categoryAttempts.filter((attempt) => attempt.status === 'pass').length
    const failCount = categoryAttempts.filter((attempt) => attempt.status === 'fail').length
    const assignedTraineeCount = categoryAssignments.reduce((sum, assignment) => sum + (assignment.assignedTrainees || 0), 0)
    const completedTraineeCount = categoryAssignments.reduce((sum, assignment) => sum + (assignment.completedTrainees || 0), 0)

    return {
      categoryId: category.id,
      categoryTitle: category.title,
      passingScore: category.passingScore,
      questionCount: category.questionCount || 0,
      assignmentCount: categoryAssignments.length,
      assignedTraineeCount,
      completedTraineeCount,
      attemptCount: categoryAttempts.length,
      passCount,
      failCount,
      averageScore: category.averageScore,
      passRate: category.passRate,
      failRate: categoryAttempts.length ? Number(((failCount / categoryAttempts.length) * 100).toFixed(2)) : 0,
      retakeRate: category.retakeRate || 0,
      highestScore: category.highestScore || 0,
      lowestScore: category.lowestScore || 0,
      completionRate: category.completionRate || 0,
    }
  })
}

function buildBatchReports(
  assignments: AssignmentRecord[],
  attempts: AttemptRecord[],
  batchMap: Map<string, BatchOption>,
  categoriesById: Map<string, CategoryRecord>,
): BatchReportRecord[] {
  const groups = new Map<string, {
    batchId: string
    categoryId: string
    assignmentCount: number
    assignedTraineeCount: number
    completedTraineeCount: number
  }>()

  for (const assignment of assignments) {
    if (!assignment.batchId) {
      continue
    }

    const key = `${assignment.batchId}::${assignment.categoryId}`
    const current = groups.get(key) || {
      batchId: assignment.batchId,
      categoryId: assignment.categoryId,
      assignmentCount: 0,
      assignedTraineeCount: 0,
      completedTraineeCount: 0,
    }
    current.assignmentCount += 1
    current.assignedTraineeCount += assignment.assignedTrainees || 0
    current.completedTraineeCount += assignment.completedTrainees || 0
    groups.set(key, current)
  }

  return Array.from(groups.values()).map((group) => {
    const scopedAttempts = attempts.filter(
      (attempt) => attempt.batchId === group.batchId && attempt.categoryId === group.categoryId,
    )
    const batch = batchMap.get(group.batchId)
    const category = categoriesById.get(group.categoryId)
    const scores = scopedAttempts.map((attempt) => attempt.score)
    const passCount = scopedAttempts.filter((attempt) => attempt.status === 'pass').length

    return {
      batchId: group.batchId,
      batchName: batch?.name || 'Batch',
      waveNumber: batch?.waveNumber ?? null,
      categoryId: group.categoryId,
      categoryTitle: category?.title || 'Assessment Category',
      assignmentCount: group.assignmentCount,
      assignedTraineeCount: group.assignedTraineeCount,
      completedTraineeCount: group.completedTraineeCount,
      attemptCount: scopedAttempts.length,
      averageScore: scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)) : 0,
      passRate: scopedAttempts.length ? Number(((passCount / scopedAttempts.length) * 100).toFixed(2)) : 0,
      completionRate: group.assignedTraineeCount > 0
        ? Number(((group.completedTraineeCount / group.assignedTraineeCount) * 100).toFixed(2))
        : 0,
      highestScore: scores.length ? Math.max(...scores) : 0,
      lowestScore: scores.length ? Math.min(...scores) : 0,
    }
  })
}

function buildWaveReports(batchReports: BatchReportRecord[]): WaveReportRecord[] {
  const groups = new Map<string, WaveReportRecord>()

  for (const report of batchReports) {
    if (report.waveNumber === null || report.waveNumber === undefined) {
      continue
    }

    const key = `${report.waveNumber}::${report.categoryId}`
    const current = groups.get(key) || {
      waveNumber: report.waveNumber,
      categoryId: report.categoryId,
      categoryTitle: report.categoryTitle,
      assignmentCount: 0,
      assignedTraineeCount: 0,
      completedTraineeCount: 0,
      attemptCount: 0,
      averageScore: 0,
      passRate: 0,
      completionRate: 0,
      highestScore: 0,
      lowestScore: 0,
    }

    current.assignmentCount += report.assignmentCount
    current.assignedTraineeCount += report.assignedTraineeCount
    current.completedTraineeCount += report.completedTraineeCount
    current.attemptCount += report.attemptCount
    current.highestScore = Math.max(current.highestScore, report.highestScore)
    current.lowestScore = current.lowestScore === 0 ? report.lowestScore : Math.min(current.lowestScore, report.lowestScore)
    current.averageScore += report.averageScore * report.attemptCount
    current.passRate += report.passRate * report.attemptCount
    groups.set(key, current)
  }

  return Array.from(groups.values()).map((report) => ({
    ...report,
    averageScore: report.attemptCount ? Number((report.averageScore / report.attemptCount).toFixed(2)) : 0,
    passRate: report.attemptCount ? Number((report.passRate / report.attemptCount).toFixed(2)) : 0,
    completionRate: report.assignedTraineeCount > 0
      ? Number(((report.completedTraineeCount / report.assignedTraineeCount) * 100).toFixed(2))
      : 0,
  }))
}

function buildTraineeReports(
  attempts: AttemptRecord[],
): TraineeReportRecord[] {
  const groups = new Map<string, TraineeReportRecord>()

  for (const attempt of attempts) {
    const key = `${attempt.traineeId}::${attempt.categoryId}`
    const current = groups.get(key) || {
      traineeId: attempt.traineeId,
      traineeName: attempt.traineeName,
      traineeEmail: attempt.traineeEmail || '',
      batchId: attempt.batchId || null,
      batchName: attempt.batchName || null,
      waveNumber: attempt.waveNumber ?? null,
      categoryId: attempt.categoryId,
      categoryTitle: attempt.categoryTitle,
      attemptCount: 0,
      passCount: 0,
      failCount: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      lastAttemptAt: null,
      certificateCount: 0,
    }

    current.attemptCount += 1
    current.passCount += attempt.status === 'pass' ? 1 : 0
    current.failCount += attempt.status === 'fail' ? 1 : 0
    current.averageScore += attempt.score
    current.highestScore = Math.max(current.highestScore, attempt.score)
    current.lowestScore = current.lowestScore === 0 ? attempt.score : Math.min(current.lowestScore, attempt.score)
    current.lastAttemptAt = toIsoString(attempt.completedAt || attempt.submittedAt, current.lastAttemptAt)
    current.certificateCount += attempt.certificateId ? 1 : 0
    groups.set(key, current)
  }

  return Array.from(groups.values()).map((report) => ({
    ...report,
    averageScore: report.attemptCount ? Number((report.averageScore / report.attemptCount).toFixed(2)) : 0,
  }))
}

function buildQuestionReports(
  questions: AssessmentQuestionRecord[],
  attempts: AttemptRecord[],
): QuestionReportRecord[] {
  const reportMap = new Map<string, QuestionReportRecord>()

  for (const question of questions) {
    reportMap.set(question.id, {
      questionId: question.id,
      categoryId: question.categoryId || '',
      categoryTitle: question.categoryName || undefined,
      questionNumber: question.questionNumber,
      questionText: question.questionText,
      questionType: question.questionType,
      difficulty: question.difficulty,
      answerCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      missRate: 0,
    })
  }

  for (const attempt of attempts) {
    for (const result of attempt.questionResults) {
      const current = reportMap.get(result.questionId)
      if (!current) {
        continue
      }

      current.answerCount += 1
      current.correctCount += result.isCorrect ? 1 : 0
      current.incorrectCount += result.isCorrect ? 0 : 1
    }
  }

  return Array.from(reportMap.values())
    .filter((report) => report.answerCount > 0)
    .map((report) => ({
      ...report,
      missRate: report.answerCount > 0
        ? Number(((report.incorrectCount / report.answerCount) * 100).toFixed(2))
        : 0,
    }))
    .sort((left, right) => right.missRate - left.missRate)
}

async function loadTrainerScopeData(
  request: Request,
  sessionUser: BackendSessionUser,
) {
  if (sessionUser.role !== 'trainer') {
    return {
      batches: [] as BatchOption[],
      trainees: [] as TraineeOption[],
      waves: [] as WaveOption[],
    }
  }

  const [batchPayload, traineePayload] = await Promise.all([
    fetchBackendJson<BackendListResponse<BackendTrainerBatch, 'batches'>>(request, '/api/trainer/batches'),
    fetchBackendJson<BackendListResponse<BackendTrainerTrainee, 'trainees'>>(request, '/api/trainer/trainees'),
  ])

  const batches = (batchPayload.batches || []).map(mapTrainerBatch)
  const trainees = (traineePayload.trainees || []).map(mapTrainerTrainee)

  return {
    batches,
    trainees,
    waves: buildWaveOptions(batches),
  }
}

async function loadCoachingLogs(
  request: Request,
  sessionUser: BackendSessionUser,
) {
  const payload = await fetchBackendJson<BackendListResponse<BackendCoachingLog, 'logs'>>(request, '/api/certification/coaching/logs')
  const logs = (payload.logs || [])
    .filter((log) => sessionUser.role === 'admin' || log.status !== 'draft')
    .sort((left, right) => {
      const leftTime = Date.parse(toIsoString(left.updated_at || left.created_at, '') || '')
      const rightTime = Date.parse(toIsoString(right.updated_at || right.created_at, '') || '')
      return Number.isFinite(rightTime) && Number.isFinite(leftTime) ? rightTime - leftTime : 0
    })

  const latestByTrainee = new Map<string, BackendCoachingLog>()
  for (const log of logs) {
    if (!latestByTrainee.has(log.trainee_id)) {
      latestByTrainee.set(log.trainee_id, log)
    }
  }

  return {
    logs,
    latestByTrainee,
  }
}

function buildCoachingNoteRecords(
  attempts: AttemptRecord[],
  logs: BackendCoachingLog[],
): CoachingNoteRecord[] {
  const latestAttemptByTrainee = new Map<string, AttemptRecord>()
  for (const attempt of attempts) {
    if (!latestAttemptByTrainee.has(attempt.traineeId)) {
      latestAttemptByTrainee.set(attempt.traineeId, attempt)
    }
  }

  return logs.map((log) => ({
    id: log.id,
    attemptId: latestAttemptByTrainee.get(log.trainee_id)?.id || `coaching::${log.id}`,
    trainerId: log.trainer_id,
    traineeId: log.trainee_id,
    note: log.strengths || log.trainer_remarks || '',
    actionItems: log.action_plan || null,
    visibility: 'shared',
    createdAt: toIsoString(log.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(log.updated_at) || toIsoString(log.created_at) || new Date().toISOString(),
  }))
}

export async function getAssessmentCsvTemplate() {
  const sampleRow = [
    '1',
    'Product Knowledge',
    'Which statement best describes the product escalation path?',
    'Transfer to Tier 2 after validating the account details.',
    'End the call and ask the customer to email support.',
    'Skip verification if the customer sounds upset.',
    'Promise a refund immediately.',
    'Transfer to Tier 2 after validating the account details.',
  ]

  return [
    QUESTION_TEMPLATE_HEADER.join(','),
    sampleRow.map((value) => value.includes(',') ? `"${value.replace(/"/g, '""')}"` : value).join(','),
  ].join('\n')
}

export async function getTrainerAssessmentBootstrap(
  request: Request,
  sessionUser: BackendSessionUser,
): Promise<TrainerBootstrapResponse> {
  const scope = sessionUser.role === 'admin' ? 'all' : 'owned'
  const [categoryPayload, questionPayload, assignmentPayload, trainerScope, coachingPayload] = await Promise.all([
    fetchBackendJson<BackendListResponse<BackendMcqCategory, 'categories'>>(request, '/api/certification/mcq/categories', {}, { search: `?scope=${scope}` }),
    fetchBackendJson<BackendListResponse<BackendMcqQuestion, 'questions'>>(request, '/api/certification/mcq/questions', {}, { search: `?scope=${scope}` }),
    fetchBackendJson<BackendListResponse<BackendMcqAssignment, 'assignments'>>(request, '/api/certification/mcq/assignments'),
    loadTrainerScopeData(request, sessionUser),
    loadCoachingLogs(request, sessionUser),
  ])

  const rawQuestions = questionPayload.questions || []
  const { questions, questionsByCategory } = buildQuestionMap(rawQuestions)
  const categoriesSeed = buildCategoryMetrics(
    categoryPayload.categories || [],
    questionsByCategory,
    [],
    [],
  )
  const categorySeedMap = new Map(categoriesSeed.map((category) => [category.id, category]))
  const batchMap = new Map(trainerScope.batches.map((batch) => [batch.id, batch]))

  const assignments = (assignmentPayload.assignments || []).map((assignment) =>
    mapAssignment(assignment, {
      categoriesById: categorySeedMap,
      batchMap,
    }),
  )

  const attempts = (assignmentPayload.assignments || [])
    .flatMap((assignment) =>
      (assignment.trainees || []).map((trainee) =>
        mapAttemptFromAssignment(assignment, trainee, {
          batchMap,
          latestCoachingByTrainee: coachingPayload.latestByTrainee,
        }),
      ),
    )
    .filter((attempt): attempt is AttemptRecord => Boolean(attempt))
    .sort((left, right) => {
      const leftTime = Date.parse(left.completedAt || left.submittedAt)
      const rightTime = Date.parse(right.completedAt || right.submittedAt)
      return rightTime - leftTime
    })

  const categories = buildCategoryMetrics(
    categoryPayload.categories || [],
    questionsByCategory,
    assignments,
    attempts,
  )
  const categoriesById = new Map(categories.map((category) => [category.id, category]))

  const certificates = unique(
    attempts
      .filter((attempt) => attempt.certificateId && attempt.certificateCode)
      .map((attempt) => attempt.certificateId as string),
  ).map((certificateId) => {
    const attempt = attempts.find((candidate) => candidate.certificateId === certificateId)!
    return mapCertificate({
      certificateId,
      certificateCode: attempt.certificateCode || '',
      traineeId: attempt.traineeId,
      categoryId: attempt.categoryId,
      categoryTitle: attempt.categoryTitle,
      assessmentId: attempt.assessmentId,
      assessmentTitle: attempt.assessmentTitle,
      assignmentId: attempt.assignmentId,
      assignmentTitle: attempt.assignmentTitle,
      earnedAt: attempt.completedAt || attempt.submittedAt,
    })
  })

  const reports = {
    categories: buildCategoryReports(categories, assignments, attempts),
    batches: buildBatchReports(assignments, attempts, batchMap, categoriesById),
    waves: [] as WaveReportRecord[],
    trainees: buildTraineeReports(attempts),
    trainers: [],
    questions: buildQuestionReports(questions, attempts),
  }
  reports.waves = buildWaveReports(reports.batches || [])

  const totalAttempts = attempts.length
  const passCount = attempts.filter((attempt) => attempt.status === 'pass').length
  const failCount = attempts.filter((attempt) => attempt.status === 'fail').length

  return {
    categories,
    questions,
    batches: trainerScope.batches,
    waves: trainerScope.waves,
    trainees: trainerScope.trainees,
    assignments,
    attempts,
    certificates,
    reports,
    analytics: {
      totalQuestions: questions.length,
      totalAssignments: assignments.length,
      activeAssignments: assignments.length,
      totalAttempts,
      passRate: totalAttempts ? Number(((passCount / totalAttempts) * 100).toFixed(2)) : 0,
      failRate: totalAttempts ? Number(((failCount / totalAttempts) * 100).toFixed(2)) : 0,
      retakeRate: totalAttempts ? Number(((failCount / totalAttempts) * 100).toFixed(2)) : 0,
      averageScore: totalAttempts ? Number((attempts.reduce((sum, attempt) => sum + attempt.score, 0) / totalAttempts).toFixed(2)) : 0,
      highestScore: totalAttempts ? Math.max(...attempts.map((attempt) => attempt.score)) : 0,
      lowestScore: totalAttempts ? Math.min(...attempts.map((attempt) => attempt.score)) : 0,
      certificatesIssued: certificates.length,
    },
  }
}

function mapTraineeAttempt(
  assessment: BackendMcqAssessmentSummary,
  categoryTitle: string,
  latestCoaching: BackendCoachingLog | undefined,
): AttemptRecord | null {
  if (assessment.score_percentage === null || assessment.score_percentage === undefined || !assessment.submitted_at) {
    return null
  }

  const review = Array.isArray(assessment.latest_review) ? assessment.latest_review : []
  const questionResults = review.map((item, index) => ({
    questionId: toNonEmptyString(item.question_id) || `${assessment.id}-${index + 1}`,
    questionNumber: index + 1,
    questionText: `Question ${index + 1}`,
    questionType: 'multiple_choice' as const,
    difficulty: null,
    options: [],
    userAnswer: toNonEmptyString(item.selected),
    correctAnswer: toNonEmptyString(item.correct),
    isCorrect: Boolean(item.is_correct),
    explanation: item.explanation || null,
  }))

  const score = toNumber(assessment.score_percentage)
  const analysis = buildAttemptAnalysisSummary({
    categoryId: assessment.category_id,
    categoryTitle,
    score,
    questionResults,
  })

  return {
    id: buildAttemptId(assessment.id, 'self'),
    assignmentId: assessment.id,
    assessmentId: assessment.id,
    categoryId: assessment.category_id,
    assignmentTitle: assessment.title,
    assessmentTitle: assessment.title,
    categoryTitle,
    traineeId: 'self',
    traineeName: '',
    attemptNo: Math.max(toNumber(assessment.attempt_count, 1), 1),
    score,
    passingScore: toNumber(assessment.passing_threshold, DEFAULT_PASSING_SCORE),
    status: assessment.is_passed ? 'pass' : 'fail',
    feedback: latestCoaching?.strengths || buildPassFailMessage(score, toNumber(assessment.passing_threshold, DEFAULT_PASSING_SCORE)),
    trainerNote: latestCoaching?.trainer_remarks || latestCoaching?.opportunities || null,
    submittedAt: toIsoString(assessment.submitted_at) || new Date().toISOString(),
    completedAt: toIsoString(assessment.submitted_at) || new Date().toISOString(),
    timeSpentSeconds: 0,
    correctAnswers: questionResults.filter((result) => result.isCorrect).length,
    incorrectAnswers: questionResults.filter((result) => !result.isCorrect).length,
    totalQuestions: questionResults.length || toNumber(assessment.question_count),
    certificateId: assessment.certificate_id || null,
    certificateCode: assessment.certificate_no || null,
    certificateStatus: assessment.certificate_id ? 'issued' : 'not_issued',
    certificateUrl: assessment.certificate_id
      ? `/trainee/assessment?section=certificates&certificateId=${assessment.certificate_id}`
      : null,
    questionResults,
    analysis,
  }
}

function mapAvailableAssessment(
  assessment: BackendMcqAssessmentSummary,
  latestAttempt: AttemptRecord | null,
): TraineeAssessmentCard {
  const categoryTitle = assessment.category_name || 'Assessment Category'
  const certificate = assessment.certificate_id && assessment.certificate_no
    ? mapCertificate({
      certificateId: assessment.certificate_id,
      certificateCode: assessment.certificate_no,
      traineeId: 'self',
      categoryId: assessment.category_id,
      categoryTitle,
      assessmentId: assessment.id,
      assessmentTitle: assessment.title,
      assignmentId: assessment.id,
      assignmentTitle: assessment.title,
      earnedAt: assessment.submitted_at || new Date().toISOString(),
    })
    : undefined

  return {
    assignmentId: assessment.id,
    assessmentId: assessment.id,
    categoryId: assessment.category_id,
    categoryTitle,
    targetType: assessment.assigned_user_id ? 'trainee' : 'batch',
    waveNumber: null,
    assignmentTitle: assessment.title,
    assessmentTitle: assessment.title,
    assessmentDescription: assessment.description || null,
    type: 'multiple_choice',
    passingScore: toNumber(assessment.passing_threshold, DEFAULT_PASSING_SCORE),
    targetDueAt: toIsoString(assessment.due_date),
    targetLabel: assessment.assigned_user_id ? 'Direct Assignment' : 'Batch Assignment',
    questionCount: toNumber(assessment.question_count || (assessment.question_ids || []).length),
    questionTypes: ['multiple_choice'],
    latestAttempt: latestAttempt || undefined,
    attemptCount: toNumber(assessment.attempt_count),
    attemptsRemaining: null,
    canStart: !assessment.is_completed || Boolean(assessment.can_retake),
    canRetake: Boolean(assessment.can_retake),
    isCompleted: Boolean(assessment.is_passed),
    maximumAttempts: null,
    timeLimitMinutes: Math.max(toNumber(assessment.time_limit_minutes, 30), 1),
    certificate,
    questions: [],
  }
}

export async function getTraineeAssessmentDashboard(
  request: Request,
  sessionUser: BackendSessionUser,
): Promise<TraineeDashboardResponse> {
  const [assessmentPayload, coachingPayload] = await Promise.all([
    fetchBackendJson<BackendListResponse<BackendMcqAssessmentSummary, 'assessments'>>(request, '/api/certification/mcq/my-assessments'),
    loadCoachingLogs(request, sessionUser),
  ])

  const attempts = (assessmentPayload.assessments || [])
    .map((assessment) => mapTraineeAttempt(
      assessment,
      assessment.category_name || 'Assessment Category',
      coachingPayload.latestByTrainee.get(sessionUser.userId),
    ))
    .filter((attempt): attempt is AttemptRecord => Boolean(attempt))
    .map((attempt) => ({
      ...attempt,
      traineeId: sessionUser.userId,
      traineeName: sessionUser.userName,
    }))
    .sort((left, right) => Date.parse(right.completedAt || right.submittedAt) - Date.parse(left.completedAt || left.submittedAt))

  const availableAssessments = (assessmentPayload.assessments || []).map((assessment) => {
    const latestAttempt = attempts.find((attempt) => attempt.assignmentId === assessment.id) || null
    return mapAvailableAssessment(assessment, latestAttempt)
  })

  const certificates = availableAssessments
    .map((assessment) => assessment.certificate)
    .filter((certificate): certificate is CertificateRecord => Boolean(certificate))

  const coachingNotes = buildCoachingNoteRecords(
    attempts.map((attempt) => ({
      ...attempt,
      traineeId: sessionUser.userId,
      traineeName: sessionUser.userName,
    })),
    coachingPayload.logs.filter((log) => log.trainee_id === sessionUser.userId),
  )

  return {
    availableAssessments,
    attempts,
    coachingNotes,
    certificates,
    stats: {
      assignedCount: availableAssessments.length,
      completedCount: attempts.length,
      passedCount: attempts.filter((attempt) => attempt.status === 'pass').length,
      averageScore: attempts.length
        ? Number((attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length).toFixed(2))
        : 0,
      retakeCount: availableAssessments.filter((assessment) => assessment.canRetake).length,
      certificateCount: certificates.length,
    },
  }
}

async function loadTraineeAssessmentSummary(
  request: Request,
  assessmentId: string,
) {
  const payload = await fetchBackendJson<BackendListResponse<BackendMcqAssessmentSummary, 'assessments'>>(request, '/api/certification/mcq/my-assessments')
  return (payload.assessments || []).find((assessment) => assessment.id === assessmentId) || null
}

function buildAttemptFromAssessmentDetail(
  detail: BackendMcqAssessmentDetail,
  summary: BackendMcqAssessmentSummary,
  sessionUser: BackendSessionUser,
): AttemptRecord | undefined {
  const latestSubmission = detail.latest_submission
  if (!latestSubmission?.submitted_at || latestSubmission.is_passed === null || latestSubmission.is_passed === undefined) {
    return undefined
  }

  const optionMap = new Map(detail.questions.map((question) => [question.id, question.options || {}]))
  const questionResults = (latestSubmission.review || []).map((reviewRow, index) => {
    const questionId = toNonEmptyString(reviewRow.question_id)
    const options = optionMap.get(questionId) || {}
    const selectedKey = toNonEmptyString(reviewRow.selected).toUpperCase()
    const correctKey = toNonEmptyString(reviewRow.correct).toUpperCase()

    return {
      questionId: questionId || `${detail.id}-${index + 1}`,
      questionNumber: index + 1,
      questionText: detail.questions.find((question) => question.id === questionId)?.question_text || `Question ${index + 1}`,
      questionType: 'multiple_choice' as const,
      difficulty: null,
      options: getOptionChoices(options),
      userAnswer: toNonEmptyString(options[selectedKey], toNonEmptyString(reviewRow.selected)),
      correctAnswer: toNonEmptyString(options[correctKey], toNonEmptyString(reviewRow.correct)),
      isCorrect: Boolean(reviewRow.is_correct),
      explanation: reviewRow.explanation || null,
    }
  })

  const score = toNumber(latestSubmission.score_percentage)
  const categoryTitle = summary.category_name || 'Assessment Category'
  const analysis = buildAttemptAnalysisSummary({
    categoryId: detail.category_id,
    categoryTitle,
    score,
    questionResults,
  })

  return {
    id: buildAttemptId(detail.id, sessionUser.userId),
    assignmentId: detail.id,
    assessmentId: detail.id,
    categoryId: detail.category_id,
    assignmentTitle: detail.title,
    assessmentTitle: detail.title,
    categoryTitle,
    traineeId: sessionUser.userId,
    traineeName: sessionUser.userName,
    attemptNo: Math.max(toNumber(latestSubmission.attempt_count, 1), 1),
    score,
    passingScore: toNumber(summary.passing_threshold, DEFAULT_PASSING_SCORE),
    status: latestSubmission.is_passed ? 'pass' : 'fail',
    feedback: buildPassFailMessage(score, toNumber(summary.passing_threshold, DEFAULT_PASSING_SCORE)),
    submittedAt: latestSubmission.submitted_at,
    completedAt: latestSubmission.submitted_at,
    timeSpentSeconds: 0,
    correctAnswers: questionResults.filter((result) => result.isCorrect).length,
    incorrectAnswers: questionResults.filter((result) => !result.isCorrect).length,
    totalQuestions: questionResults.length,
    certificateId: latestSubmission.certificate_id || null,
    certificateCode: latestSubmission.certificate_no || null,
    certificateStatus: latestSubmission.certificate_id ? 'issued' : 'not_issued',
    certificateUrl: latestSubmission.certificate_id
      ? `/trainee/assessment?section=certificates&certificateId=${latestSubmission.certificate_id}`
      : null,
    questionResults,
    analysis,
  }
}

export async function getTraineeAssessmentSession(
  request: Request,
  sessionUser: BackendSessionUser,
  assignmentId: string,
): Promise<TraineeAssessmentSession> {
  const [summary, detail] = await Promise.all([
    loadTraineeAssessmentSummary(request, assignmentId),
    fetchBackendJson<BackendMcqAssessmentDetail>(request, `/api/certification/mcq/assessment/${assignmentId}`),
  ])

  if (!summary) {
    throw new AssessmentHttpError(404, 'Assessment not found.')
  }

  const latestAttempt = buildAttemptFromAssessmentDetail(detail, summary, sessionUser)
  const certificate = summary.certificate_id && summary.certificate_no
    ? mapCertificate({
      certificateId: summary.certificate_id,
      certificateCode: summary.certificate_no,
      traineeId: sessionUser.userId,
      categoryId: summary.category_id,
      categoryTitle: summary.category_name || 'Assessment Category',
      assessmentId: summary.id,
      assessmentTitle: summary.title,
      assignmentId: summary.id,
      assignmentTitle: summary.title,
      earnedAt: summary.submitted_at || new Date().toISOString(),
    })
    : undefined

  return {
    assignmentId: detail.id,
    assessmentId: detail.id,
    categoryId: detail.category_id,
    categoryTitle: summary.category_name || 'Assessment Category',
    targetType: summary.assigned_user_id ? 'trainee' : 'batch',
    waveNumber: null,
    assignmentTitle: detail.title,
    assessmentTitle: detail.title,
    description: detail.description || null,
    passingScore: toNumber(summary.passing_threshold, DEFAULT_PASSING_SCORE),
    targetDueAt: toIsoString(summary.due_date),
    targetLabel: summary.assigned_user_id ? 'Direct Assignment' : 'Batch Assignment',
    questionCount: detail.questions.length,
    attemptCount: latestAttempt?.attemptNo || toNumber(summary.attempt_count),
    attemptsRemaining: null,
    maximumAttempts: null,
    timeLimitMinutes: Math.max(toNumber(detail.time_limit_minutes, 30), 1),
    canRetake: Boolean(detail.can_retake),
    isCompleted: Boolean(summary.is_passed),
    latestAttempt,
    certificate,
    questions: detail.questions.map((question, index) => ({
      id: question.id,
      questionNumber: index + 1,
      questionText: question.question_text,
      questionType: 'multiple_choice',
      difficulty: null,
      choices: shuffleChoices(getOptionChoices(question.options)),
    })),
  }
}

function validateChoicePayload(
  options: string[],
  correctAnswer: string,
) {
  const trimmedOptions = options.map((option) => option.trim())
  if (trimmedOptions.length !== 4 || trimmedOptions.some((option) => !option)) {
    throw new AssessmentHttpError(400, 'Exactly four answer choices are required.')
  }

  const normalizedChoices = new Set(trimmedOptions.map((option) => normalizeAssessmentAnswer(option)))
  if (normalizedChoices.size !== trimmedOptions.length) {
    throw new AssessmentHttpError(400, 'Each answer choice must be unique.')
  }

  const matchedChoice = trimmedOptions.find(
    (option) => normalizeAssessmentAnswer(option) === normalizeAssessmentAnswer(correctAnswer),
  )
  if (!matchedChoice) {
    throw new AssessmentHttpError(400, 'Correct answer must match one of the four answer choices.')
  }

  return {
    options: trimmedOptions,
    correctAnswer: matchedChoice,
  }
}

async function listCategories(
  request: Request,
  sessionUser: BackendSessionUser,
) {
  const scope = sessionUser.role === 'admin' ? 'all' : 'owned'
  const payload = await fetchBackendJson<BackendListResponse<BackendMcqCategory, 'categories'>>(
    request,
    '/api/certification/mcq/categories',
    {},
    { search: `?scope=${scope}` },
  )
  return payload.categories || []
}

async function listQuestions(
  request: Request,
  sessionUser: BackendSessionUser,
) {
  const scope = sessionUser.role === 'admin' ? 'all' : 'owned'
  const payload = await fetchBackendJson<BackendListResponse<BackendMcqQuestion, 'questions'>>(
    request,
    '/api/certification/mcq/questions',
    {},
    { search: `?scope=${scope}` },
  )
  return payload.questions || []
}

export async function createCategory(
  request: Request,
  sessionUser: BackendSessionUser,
  payload: CreateCategoryPayload,
) {
  if (sessionUser.role !== 'trainer') {
    throw new AssessmentHttpError(403, 'Only trainers can create assessment categories.')
  }

  const response = await fetchBackendJson<{ category: BackendMcqCategory }>(
    request,
    '/api/certification/mcq/categories',
    {
      method: 'POST',
      body: JSON.stringify({
        name: payload.title.trim(),
        description: payload.description?.trim() || null,
        passing_threshold: payload.passingScore,
      }),
    },
  )

  const categories = buildCategoryMetrics([response.category], new Map(), [], [])
  return categories[0]
}

export async function updateCategory(
  request: Request,
  sessionUser: BackendSessionUser,
  categoryId: string,
  payload: UpdateCategoryPayload,
) {
  if (sessionUser.role !== 'trainer') {
    throw new AssessmentHttpError(403, 'Only trainers can update assessment categories.')
  }

  const response = await fetchBackendJson<{ category: BackendMcqCategory }>(
    request,
    `/api/certification/mcq/categories/${categoryId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        name: payload.title.trim(),
        description: payload.description?.trim() || null,
        passing_threshold: payload.passingScore,
      }),
    },
  )

  const categories = buildCategoryMetrics([response.category], new Map(), [], [])
  return categories[0]
}

export async function archiveCategory(
  request: Request,
  sessionUser: BackendSessionUser,
  categoryId: string,
) {
  if (sessionUser.role !== 'trainer') {
    throw new AssessmentHttpError(403, 'Only trainers can archive assessment categories.')
  }

  await fetchBackendJson<{ status: string }>(
    request,
    `/api/certification/mcq/categories/${categoryId}`,
    { method: 'DELETE' },
  )
}

export async function createQuestion(
  request: Request,
  sessionUser: BackendSessionUser,
  payload: CreateQuestionPayload,
) {
  if (sessionUser.role !== 'trainer') {
    throw new AssessmentHttpError(403, 'Only trainers can create questions.')
  }

  if (!payload.categoryId) {
    throw new AssessmentHttpError(400, 'Category is required before saving a question.')
  }

  const validated = validateChoicePayload(payload.options, payload.correctAnswer)
  const optionsMap = {
    option_a: validated.options[0],
    option_b: validated.options[1],
    option_c: validated.options[2],
    option_d: validated.options[3],
  }
  const correctOption = resolveSelectedOptionKey(
    { A: validated.options[0], B: validated.options[1], C: validated.options[2], D: validated.options[3] },
    validated.correctAnswer,
  )

  const response = await fetchBackendJson<{ question: BackendMcqQuestion }>(
    request,
    '/api/certification/mcq/questions',
    {
      method: 'POST',
      body: JSON.stringify({
        category_id: payload.categoryId,
        question_text: payload.questionText.trim(),
        ...optionsMap,
        correct_option: correctOption,
        explanation: payload.explanation?.trim() || null,
      }),
    },
  )

  return mapQuestion(response.question, Math.max(payload.orderIndex || 0, 0))
}

async function loadQuestionById(
  request: Request,
  sessionUser: BackendSessionUser,
  questionId: string,
) {
  const questions = await listQuestions(request, sessionUser)
  const question = questions.find((item) => item.id === questionId)
  if (!question) {
    throw new AssessmentHttpError(404, 'Assessment question not found.')
  }

  return question
}

export async function updateQuestion(
  request: Request,
  sessionUser: BackendSessionUser,
  questionId: string,
  payload: UpdateQuestionPayload,
) {
  if (sessionUser.role !== 'trainer') {
    throw new AssessmentHttpError(403, 'Only trainers can update questions.')
  }

  const existingQuestion = await loadQuestionById(request, sessionUser, questionId)
  const targetCategoryId = payload.categoryId || existingQuestion.category_id
  const validated = validateChoicePayload(payload.options, payload.correctAnswer)
  const correctOption = resolveSelectedOptionKey(
    { A: validated.options[0], B: validated.options[1], C: validated.options[2], D: validated.options[3] },
    validated.correctAnswer,
  )

  const response = await fetchBackendJson<{ question: BackendMcqQuestion }>(
    request,
    `/api/certification/mcq/questions/${questionId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        category_id: targetCategoryId,
        question_text: payload.questionText.trim(),
        option_a: validated.options[0],
        option_b: validated.options[1],
        option_c: validated.options[2],
        option_d: validated.options[3],
        correct_option: correctOption,
        explanation: payload.explanation?.trim() || null,
      }),
    },
  )

  return mapQuestion(response.question, Math.max(payload.orderIndex || 0, 0))
}

export async function deleteQuestion(
  request: Request,
  sessionUser: BackendSessionUser,
  questionId: string,
) {
  if (sessionUser.role !== 'trainer') {
    throw new AssessmentHttpError(403, 'Only trainers can delete questions.')
  }

  await fetchBackendJson<{ status: string }>(
    request,
    `/api/certification/mcq/questions/${questionId}`,
    { method: 'DELETE' },
  )
}

function parseCsvText(value: string) {
  const rows: string[][] = []
  let currentCell = ''
  let currentRow: string[] = []
  let insideQuotes = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    const nextCharacter = value[index + 1]

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentCell += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (!insideQuotes && character === ',') {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if (!insideQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }
      currentRow.push(currentCell)
      if (currentRow.some((cell) => cell.trim().length > 0)) {
        rows.push(currentRow)
      }
      currentRow = []
      currentCell = ''
      continue
    }

    currentCell += character
  }

  currentRow.push(currentCell)
  if (currentRow.some((cell) => cell.trim().length > 0)) {
    rows.push(currentRow)
  }

  return rows
}

function toCsvCell(value: unknown) {
  const normalized = value === null || value === undefined ? '' : String(value)
  if (!/[",\n\r]/.test(normalized)) {
    return normalized
  }

  return `"${normalized.replace(/"/g, '""')}"`
}

function buildBulkUploadErrorCsv(errors: BulkUploadErrorRecord[]) {
  const header = ['Row Number', 'Category', 'Question Number', 'Question', 'Error']
  const rows = errors.map((error) => [
    error.rowNumber,
    error.category,
    error.questionNumber,
    error.question,
    error.error,
  ])

  return [
    header.map((value) => toCsvCell(value)).join(','),
    ...rows.map((row) => row.map((value) => toCsvCell(value)).join(',')),
  ].join('\n')
}

export async function bulkUploadQuestions(
  request: Request,
  sessionUser: BackendSessionUser,
  csvText: string,
): Promise<BulkUploadQuestionsResponse> {
  if (sessionUser.role !== 'trainer') {
    throw new AssessmentHttpError(403, 'Only trainers can bulk upload questions.')
  }

  const rows = parseCsvText(csvText)
  if (!rows.length) {
    throw new AssessmentHttpError(400, 'The uploaded CSV file is empty.')
  }

  const header = rows[0].map((value) => value.trim())
  const missingColumns = QUESTION_TEMPLATE_HEADER.filter((column) => !header.includes(column))
  if (missingColumns.length) {
    throw new AssessmentHttpError(
      400,
      `The CSV file is missing required columns: ${missingColumns.join(', ')}.`,
    )
  }

  const categoryRows = await listCategories(request, sessionUser)
  const questionRows = await listQuestions(request, sessionUser)
  const categoryMap = new Map(categoryRows.map((category) => [normalizeAssessmentAnswer(category.name), category]))
  const questionsByCategory = new Map<string, Set<string>>()

  for (const question of questionRows) {
    const current = questionsByCategory.get(question.category_id) || new Set<string>()
    current.add(normalizeAssessmentAnswer(question.question_text))
    questionsByCategory.set(question.category_id, current)
  }

  const columnIndex = new Map(header.map((column, index) => [column, index]))
  const createdCategories: string[] = []
  const importedQuestions: AssessmentQuestionRecord[] = []
  const errors: BulkUploadErrorRecord[] = []

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const getValue = (column: string) => row[columnIndex.get(column) || 0]?.trim() || ''
    const rowNumber = rowIndex + 1
    const categoryName = getValue('Category')
    const questionNumber = getValue('Question Number')
    const questionText = getValue('Question')
    const choices = [
      getValue('Choice 1'),
      getValue('Choice 2'),
      getValue('Choice 3'),
      getValue('Choice 4'),
    ]
    const correctAnswer = getValue('Correct Answer')

    if (!categoryName) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber,
        question: questionText,
        error: 'Category is required.',
      })
      continue
    }

    if (!questionText) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber,
        question: questionText,
        error: 'Question text is required.',
      })
      continue
    }

    let category = categoryMap.get(normalizeAssessmentAnswer(categoryName))
    try {
      if (!category) {
        const createdCategory = await fetchBackendJson<{ category: BackendMcqCategory }>(
          request,
          '/api/certification/mcq/categories',
          {
            method: 'POST',
            body: JSON.stringify({
              name: categoryName,
              description: null,
              passing_threshold: DEFAULT_PASSING_SCORE,
            }),
          },
        )
        category = createdCategory.category
        categoryMap.set(normalizeAssessmentAnswer(category.name), category)
        createdCategories.push(category.name)
      }

      const existingTexts = questionsByCategory.get(category.id) || new Set<string>()
      const normalizedText = normalizeAssessmentAnswer(questionText)
      if (existingTexts.has(normalizedText)) {
        throw new AssessmentHttpError(400, 'Duplicate question text detected for this category.')
      }

      const validated = validateChoicePayload(choices, correctAnswer)
      const correctOption = resolveSelectedOptionKey(
        { A: validated.options[0], B: validated.options[1], C: validated.options[2], D: validated.options[3] },
        validated.correctAnswer,
      )

      const createdQuestion = await fetchBackendJson<{ question: BackendMcqQuestion }>(
        request,
        '/api/certification/mcq/questions',
        {
          method: 'POST',
          body: JSON.stringify({
            category_id: category.id,
            question_text: questionText,
            option_a: validated.options[0],
            option_b: validated.options[1],
            option_c: validated.options[2],
            option_d: validated.options[3],
            correct_option: correctOption,
            explanation: null,
          }),
        },
      )

      existingTexts.add(normalizedText)
      questionsByCategory.set(category.id, existingTexts)
      importedQuestions.push(mapQuestion(createdQuestion.question, importedQuestions.length))
    } catch (error) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber,
        question: questionText,
        error: error instanceof Error ? error.message : 'Unable to import the row.',
      })
    }
  }

  return {
    totalRows: Math.max(rows.length - 1, 0),
    successfulImports: importedQuestions.length,
    failedRows: errors.length,
    importedQuestions,
    errors,
    createdCategories,
    errorCsv: errors.length ? buildBulkUploadErrorCsv(errors) : null,
  }
}

async function listAssignments(
  request: Request,
): Promise<BackendMcqAssignment[]> {
  const payload = await fetchBackendJson<BackendListResponse<BackendMcqAssignment, 'assignments'>>(request, '/api/certification/mcq/assignments')
  return payload.assignments || []
}

async function listTrainerBatches(
  request: Request,
  sessionUser: BackendSessionUser,
) {
  if (sessionUser.role !== 'trainer') {
    return [] as BackendTrainerBatch[]
  }

  const payload = await fetchBackendJson<BackendListResponse<BackendTrainerBatch, 'batches'>>(request, '/api/trainer/batches')
  return payload.batches || []
}

function resolveWaveBatchIds(
  batches: BackendTrainerBatch[],
  waveNumber: number | null | undefined,
) {
  if (waveNumber === null || waveNumber === undefined) {
    return []
  }

  return batches
    .filter((batch) => batch.wave_number === waveNumber)
    .map((batch) => batch.id)
}

async function createAssignmentRequest(
  request: Request,
  payload: {
    title: string
    description?: string
    categoryId: string
    batchIds?: string[]
    batchId?: string | null
    traineeId?: string | null
    dueAt?: string | null
    timeLimitMinutes?: number | null
    questionIds?: string[]
  },
) {
  return fetchBackendJson<{ assessment?: BackendMcqAssignment; assessments?: BackendMcqAssignment[] }>(
    request,
    '/api/certification/mcq/assign',
    {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        description: payload.description || null,
        category_id: payload.categoryId,
        question_ids: payload.questionIds || [],
        assigned_user_id: payload.traineeId || null,
        assigned_batch_id: payload.batchId || null,
        assigned_batch_ids: payload.batchIds || [],
        due_date: payload.dueAt || null,
        time_limit_minutes: Math.max(toNumber(payload.timeLimitMinutes, 30), 1),
      }),
    },
  )
}

export async function createAssignment(
  request: Request,
  sessionUser: BackendSessionUser,
  payload: CreateAssignmentPayload,
) {
  if (sessionUser.role !== 'trainer') {
    throw new AssessmentHttpError(403, 'Only trainers can create assessment assignments.')
  }

  const trainerBatches = await listTrainerBatches(request, sessionUser)
  const batchIds = payload.targetType === 'wave'
    ? resolveWaveBatchIds(trainerBatches, payload.waveNumber)
    : []

  if (payload.targetType === 'wave' && !batchIds.length) {
    throw new AssessmentHttpError(404, 'No active trainer-owned batches were found for the selected wave.')
  }

  const response = await createAssignmentRequest(request, {
    title: payload.title.trim(),
    description: payload.description?.trim(),
    categoryId: payload.categoryId,
    batchIds,
    batchId: payload.targetType === 'batch' ? payload.batchId || null : null,
    traineeId: payload.targetType === 'trainee' ? payload.traineeId || null : null,
    dueAt: payload.dueAt || null,
    timeLimitMinutes: payload.timeLimitMinutes || null,
    questionIds: payload.questionIds || [],
  })

  return response.assessment || response.assessments?.[0] || null
}

export async function updateAssignment(
  request: Request,
  sessionUser: BackendSessionUser,
  assignmentId: string,
  payload: UpdateAssignmentPayload,
) {
  if (sessionUser.role !== 'trainer') {
    throw new AssessmentHttpError(403, 'Only trainers can update assessment assignments.')
  }

  if (payload.targetType === 'wave') {
    throw new AssessmentHttpError(
      400,
      'Wave-wide assignments expand into batch assignments. Edit each generated batch assignment directly.',
    )
  }

  await fetchBackendJson<{ assessment: BackendMcqAssignment }>(
    request,
    `/api/certification/mcq/assignments/${assignmentId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        category_id: payload.categoryId,
        question_ids: payload.questionIds || [],
        assigned_user_id: payload.targetType === 'trainee' ? payload.traineeId || null : null,
        assigned_batch_id: payload.targetType === 'batch' ? payload.batchId || null : null,
        due_date: payload.dueAt || null,
        time_limit_minutes: payload.timeLimitMinutes || null,
      }),
    },
  )
}

export async function deleteAssignment(
  request: Request,
  sessionUser: BackendSessionUser,
  assignmentId: string,
) {
  if (sessionUser.role !== 'trainer') {
    throw new AssessmentHttpError(403, 'Only trainers can delete assessment assignments.')
  }

  await fetchBackendJson<{ status: string }>(
    request,
    `/api/certification/mcq/assignments/${assignmentId}`,
    { method: 'DELETE' },
  )
}

function buildAttemptRecordFromSubmit({
  session,
  summary,
  submitResult,
  latestSubmission,
  answers,
}: {
  session: TraineeAssessmentSession,
  summary: BackendMcqAssessmentSummary,
  submitResult: BackendSubmitResponse,
  latestSubmission: NonNullable<BackendMcqAssessmentDetail['latest_submission']>,
  answers: Record<string, string>,
}): AttemptRecord {
  const questionLookup = new Map(
    session.questions.map((question) => [question.id, question]),
  )

  const optionLookup = new Map<string, Record<string, string>>()
  for (const question of session.questions) {
    optionLookup.set(
      question.id,
      Object.fromEntries(question.choices.map((choice, index) => [String.fromCharCode(65 + index), choice])),
    )
  }

  const questionResults = (submitResult.review || []).map((reviewRow, index) => {
    const questionId = toNonEmptyString(reviewRow.question_id)
    const sessionQuestion = questionLookup.get(questionId)
    const options = optionLookup.get(questionId) || {}
    const selectedKey = toNonEmptyString(reviewRow.selected).toUpperCase()
    const correctKey = toNonEmptyString(reviewRow.correct).toUpperCase()

    return {
      questionId: questionId || `${session.assessmentId}-${index + 1}`,
      questionNumber: sessionQuestion?.questionNumber || index + 1,
      questionText: sessionQuestion?.questionText || `Question ${index + 1}`,
      questionType: 'multiple_choice' as const,
      difficulty: null,
      options: sessionQuestion?.choices || [],
      userAnswer: options[selectedKey] || answers[questionId] || toNonEmptyString(reviewRow.selected),
      correctAnswer: options[correctKey] || toNonEmptyString(reviewRow.correct),
      isCorrect: Boolean(reviewRow.is_correct),
      explanation: reviewRow.explanation || null,
    }
  })

  const score = toNumber(submitResult.score_percentage)
  const passingScore = session.passingScore || toNumber(summary.passing_threshold, DEFAULT_PASSING_SCORE)
  const analysis = buildAttemptAnalysisSummary({
    categoryId: session.categoryId,
    categoryTitle: session.categoryTitle,
    score,
    questionResults,
  })

  return {
    id: buildAttemptId(session.assignmentId, 'self'),
    assignmentId: session.assignmentId,
    assessmentId: session.assessmentId,
    categoryId: session.categoryId,
    assignmentTitle: session.assignmentTitle,
    assessmentTitle: session.assessmentTitle,
    categoryTitle: session.categoryTitle,
    traineeId: 'self',
    traineeName: '',
    attemptNo: Math.max(toNumber(latestSubmission.attempt_count, 1), 1),
    score,
    passingScore,
    status: submitResult.is_passed ? 'pass' : 'fail',
    feedback: buildPassFailMessage(score, passingScore),
    submittedAt: latestSubmission.submitted_at || new Date().toISOString(),
    startedAt: undefined,
    completedAt: latestSubmission.submitted_at || new Date().toISOString(),
    timeSpentSeconds: 0,
    correctAnswers: questionResults.filter((result) => result.isCorrect).length,
    incorrectAnswers: questionResults.filter((result) => !result.isCorrect).length,
    totalQuestions: questionResults.length,
    certificateId: latestSubmission.certificate_id || null,
    certificateCode: latestSubmission.certificate_no || null,
    certificateStatus: latestSubmission.certificate_id ? 'issued' : 'not_issued',
    certificateUrl: latestSubmission.certificate_id
      ? `/trainee/assessment?section=certificates&certificateId=${latestSubmission.certificate_id}`
      : null,
    questionResults,
    analysis,
  }
}

export async function submitAssessmentAttempt(
  request: Request,
  sessionUser: BackendSessionUser,
  payload: SubmitAssessmentPayload,
): Promise<SubmitAssessmentResponse> {
  const assessmentId = payload.assessmentId || payload.assignmentId
  if (!assessmentId) {
    throw new AssessmentHttpError(400, 'Assessment is required.')
  }

  const [session, summary] = await Promise.all([
    getTraineeAssessmentSession(request, sessionUser, assessmentId),
    loadTraineeAssessmentSummary(request, assessmentId),
  ])

  if (!summary) {
    throw new AssessmentHttpError(404, 'Assessment not found.')
  }

  const answerMap: Record<string, string> = {}
  const questionChoices = new Map(session.questions.map((question) => [question.id, question.choices]))
  for (const [questionId, answer] of Object.entries(payload.answers || {})) {
    const choices = questionChoices.get(questionId) || payload.choiceMap?.[questionId] || []
    const optionMap = Object.fromEntries(
      choices.map((choice, index) => [String.fromCharCode(65 + index), choice]),
    ) as Record<string, string>
    answerMap[questionId] = resolveSelectedOptionKey(optionMap, answer)
  }

  const submitResult = await fetchBackendJson<BackendSubmitResponse>(
    request,
    `/api/certification/mcq/assessment/${assessmentId}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({
        answers: answerMap,
      }),
    },
  )

  const updatedDetail = await fetchBackendJson<BackendMcqAssessmentDetail>(
    request,
    `/api/certification/mcq/assessment/${assessmentId}`,
  )

  if (!updatedDetail.latest_submission) {
    throw new AssessmentHttpError(500, 'The assessment result was saved but could not be reloaded.')
  }

  const attempt = buildAttemptRecordFromSubmit({
    session,
    summary,
    submitResult,
    latestSubmission: updatedDetail.latest_submission,
    answers: payload.answers,
  })

  const certificate = submitResult.certificate_id && submitResult.certificate_no
    ? mapCertificate({
      certificateId: submitResult.certificate_id,
      certificateCode: submitResult.certificate_no,
      traineeId: sessionUser.userId,
      categoryId: session.categoryId,
      categoryTitle: session.categoryTitle,
      assessmentId: session.assessmentId,
      assessmentTitle: session.assessmentTitle,
      assignmentId: session.assignmentId,
      assignmentTitle: session.assignmentTitle,
      earnedAt: attempt.completedAt || attempt.submittedAt,
    })
    : null

  return {
    attempt: {
      ...attempt,
      traineeId: sessionUser.userId,
      traineeName: sessionUser.userName,
      timeSpentSeconds: payload.timeSpentSeconds || 0,
      startedAt: payload.startedAt || null,
    },
    certificate,
  }
}

export async function coachAssessmentAttempt(
  request: Request,
  sessionUser: BackendSessionUser,
  payload: CoachAttemptPayload,
) {
  if (sessionUser.role !== 'trainer' && sessionUser.role !== 'admin') {
    throw new AssessmentHttpError(403, 'Only trainers can save coaching feedback.')
  }

  const parsedAttempt = parseAttemptId(payload.attemptId)
  if (!parsedAttempt) {
    throw new AssessmentHttpError(400, 'The selected assessment result is invalid.')
  }

  const dueDate = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString()
  await fetchBackendJson<{ coaching_log_id: string }>(
    request,
    '/api/certification/coaching/logs',
    {
      method: 'POST',
      body: JSON.stringify({
        trainee_id: parsedAttempt.traineeId,
        strengths: payload.feedback.trim(),
        opportunities: payload.trainerNote?.trim() || payload.feedback.trim(),
        action_plan: payload.actionItems?.trim() || payload.trainerNote?.trim() || payload.feedback.trim(),
        target_date: dueDate,
        trainer_remarks: payload.trainerNote?.trim() || payload.feedback.trim(),
        coaching_minutes: 15,
        status: 'sent',
        competency_status: 'pending',
      }),
    },
  )

  return {
    id: `coaching::${payload.attemptId}`,
    attemptId: payload.attemptId,
    trainerId: sessionUser.userId,
    traineeId: parsedAttempt.traineeId,
    note: payload.feedback.trim(),
    actionItems: payload.actionItems?.trim() || null,
    visibility: payload.visibility || 'shared',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies CoachingNoteRecord
}

export async function getTrainerAssessmentCsvExport(
  request: Request,
  sessionUser: BackendSessionUser,
) {
  const workspace = await getTrainerAssessmentBootstrap(request, sessionUser)
  const categoryReportMap = new Map(workspace.reports.categories.map((report) => [report.categoryId, report]))

  const header = [
    'row_type',
    'category_title',
    'assignment_title',
    'trainee_name',
    'trainee_email',
    'batch_name',
    'wave_number',
    'attempt_no',
    'score',
    'status',
    'passing_score',
    'submitted_at',
    'time_spent_seconds',
    'certificate_code',
    'correct_answers',
    'incorrect_answers',
    'total_questions',
    'strengths',
    'improvements',
    'recommendations',
    'weak_area_summary',
  ]

  const rows = workspace.attempts.length
    ? workspace.attempts.map((attempt) => {
      const categoryReport = categoryReportMap.get(attempt.categoryId)
      return {
        row_type: 'attempt',
        category_title: attempt.categoryTitle,
        assignment_title: attempt.assignmentTitle || attempt.assessmentTitle,
        trainee_name: attempt.traineeName,
        trainee_email: attempt.traineeEmail || '',
        batch_name: attempt.batchName || '',
        wave_number: attempt.waveNumber || '',
        attempt_no: attempt.attemptNo,
        score: attempt.score.toFixed(2),
        status: attempt.status,
        passing_score: attempt.passingScore ?? categoryReport?.passingScore ?? '',
        submitted_at: attempt.completedAt || attempt.submittedAt,
        time_spent_seconds: attempt.timeSpentSeconds || 0,
        certificate_code: attempt.certificateCode || '',
        correct_answers: attempt.correctAnswers ?? '',
        incorrect_answers: attempt.incorrectAnswers ?? '',
        total_questions: attempt.totalQuestions ?? '',
        strengths: (attempt.analysis?.strengths || []).join(' | '),
        improvements: (attempt.analysis?.improvements || []).join(' | '),
        recommendations: (attempt.analysis?.recommendations || []).join(' | '),
        weak_area_summary: '',
      }
    })
    : workspace.reports.categories.map((report) => ({
      row_type: 'category_summary',
      category_title: report.categoryTitle,
      assignment_title: '',
      trainee_name: '',
      trainee_email: '',
      batch_name: '',
      wave_number: '',
      attempt_no: '',
      score: '',
      status: '',
      passing_score: report.passingScore,
      submitted_at: '',
      time_spent_seconds: '',
      certificate_code: '',
      correct_answers: '',
      incorrect_answers: '',
      total_questions: report.questionCount || '',
      strengths: '',
      improvements: '',
      recommendations: '',
      weak_area_summary: '',
    }))

  const csv = [
    header.map((column) => toCsvCell(column)).join(','),
    ...rows.map((row) => header.map((column) => toCsvCell(row[column as keyof typeof row])).join(',')),
  ].join('\n')

  return {
    filename: `assessment-module-report-${new Date().toISOString().slice(0, 10)}.csv`,
    content: csv,
  }
}
