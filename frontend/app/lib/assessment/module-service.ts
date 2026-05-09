import 'server-only'

import { GoogleGenerativeAI } from '@google/generative-ai'

import { AssessmentHttpError } from './backend-auth'
import { getConfigValue } from './env'
import {
  buildAttemptAnalysisSummary,
  normalizeAssessmentAnswer,
  scoreAssessmentSubmission,
  shuffleChoices,
} from './scoring'
import { createSupabaseAdminClient } from './supabase-admin'
import type {
  AssignmentRecord,
  AssessmentQuestionRecord,
  AssessmentRecord,
  AttemptAnalysisSummary,
  AttemptQuestionResult,
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
  TrainerBootstrapResponse,
  TraineeOption,
  UpdateAssignmentPayload,
  UpdateCategoryPayload,
  UpdateQuestionPayload,
} from './types'

type TrainingCategoryRow = {
  id: string
  title: string
  description?: string | null
  passing_score: number
  created_by: string
  active_status: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
}

type TrainingAssessmentRow = {
  id: string
  category_id: string
  title: string
  description?: string | null
  type: 'multiple_choice' | 'fill_blank' | 'mixed'
  is_published: boolean
  instant_feedback: boolean
  sort_order: number
  is_primary?: boolean
  active_status?: boolean
  created_at: string
  updated_at: string
}

type TrainingQuestionRow = {
  id: string
  assessment_id: string
  category_id: string
  question_number: number
  question_text: string
  question_type: 'multiple_choice' | 'fill_blank'
  options: string[] | null
  correct_answer: string
  difficulty?: 'easy' | 'medium' | 'hard' | null
  explanation?: string | null
  order_index: number
  active_status: boolean
  created_by?: string | null
  created_at: string
  updated_at: string
  metadata?: Record<string, unknown> | null
}

type TrainingAssignmentRow = {
  id: string
  category_id: string
  assessment_id?: string | null
  batch_id?: string | null
  trainee_id?: string | null
  assigned_by: string
  assigned_at: string
  due_at?: string | null
  is_active: boolean
  title?: string | null
  description?: string | null
  assignment_mode?: 'selected_questions' | 'entire_category' | 'random_subset'
  question_count?: number | null
  passing_score?: number | null
  maximum_attempts?: number | null
  time_limit_minutes?: number | null
  shuffle_choices?: boolean | null
  shuffle_questions?: boolean | null
  updated_at?: string
}

type TrainingAssignmentQuestionRow = {
  assignment_id: string
  question_id: string
  question_order: number
}

type TrainingAttemptRow = {
  id: string
  assignment_id?: string | null
  assessment_id: string
  category_id: string
  trainee_id: string
  batch_id?: string | null
  attempt_no: number
  answers: Record<string, string>
  question_results: AttemptQuestionResult[]
  question_snapshot: Array<Record<string, unknown>>
  choice_snapshot: Record<string, string[]>
  analysis_summary?: Record<string, unknown> | null
  category_breakdown?: Array<Record<string, unknown>> | null
  total_questions: number
  correct_answers: number
  incorrect_answers: number
  score: number
  passing_score?: number | null
  status: 'pass' | 'fail'
  feedback?: string | null
  trainer_note?: string | null
  assignment_title?: string | null
  time_spent_seconds?: number | null
  started_at?: string | null
  completed_at?: string | null
  submitted_at: string
  certificate_status?: 'not_issued' | 'issued'
}

type TrainingAttemptFeedRow = {
  id: string
  assignment_id?: string | null
  assessment_id: string
  category_id: string
  trainee_id: string
  batch_id?: string | null
  attempt_no: number
  score: number
  status: 'pass' | 'fail'
  feedback?: string | null
  trainer_note?: string | null
  submitted_at: string
  started_at?: string | null
  completed_at?: string | null
  time_spent_seconds?: number | null
  total_questions?: number | null
  correct_answers?: number | null
  incorrect_answers?: number | null
  question_results?: AttemptQuestionResult[] | null
  analysis_summary?: Record<string, unknown> | null
  category_breakdown?: Array<Record<string, unknown>> | null
  assignment_title?: string | null
  passing_score?: number | null
  category_title: string
  assessment_title: string
  trainee_name: string
  trainee_email?: string | null
  batch_name?: string | null
  wave_number?: number | null
  certificate_id?: string | null
  certificate_code?: string | null
  certificate_status?: 'issued' | 'revoked' | 'not_issued' | null
  certificate_url?: string | null
}

type TrainingCoachingRow = {
  id: string
  attempt_id: string
  trainer_id: string
  trainee_id: string
  note: string
  action_items?: string | null
  visibility: 'shared' | 'trainer_only'
  created_at: string
  updated_at: string
}

type TrainingCertificateRow = {
  id: string
  trainee_id: string
  category_id: string
  assignment_id?: string | null
  assessment_id: string
  attempt_id: string
  certificate_code: string
  certificate_status?: 'issued' | 'revoked'
  certificate_url?: string | null
  assignment_title?: string | null
  earned_at: string
}

type TrainingCategoryReportRow = {
  category_id: string
  category_title: string
  passing_score: number
  question_count?: number
  assignment_count?: number
  assigned_trainee_count?: number
  completed_trainee_count?: number
  attempt_count: number
  pass_count: number
  fail_count: number
  average_score: number
  pass_rate: number
  retake_count?: number
  highest_score?: number
  lowest_score?: number
  completion_rate?: number
}

type TrainingBatchReportRow = {
  batch_id: string
  batch_name: string
  wave_number?: number | null
  category_id: string
  category_title: string
  assignment_count: number
  assigned_trainee_count: number
  completed_trainee_count: number
  attempt_count: number
  average_score: number
  pass_rate: number
  completion_rate: number
  highest_score: number
  lowest_score: number
}

type TrainingQuestionReportRow = {
  question_id: string
  category_id: string
  category_title?: string | null
  question_number?: number | null
  question_text: string
  question_type: 'multiple_choice' | 'fill_blank'
  difficulty?: 'easy' | 'medium' | 'hard' | null
  answer_count: number
  correct_count: number
  incorrect_count: number
  miss_rate: number
}

type BatchRow = {
  id: string
  name: string
  description?: string | null
  wave_number?: number | null
  created_by: string
  is_active: boolean
}

type BatchUserRow = {
  batch_id: string
  user_id: string
}

type UserRow = {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'trainer' | 'trainee'
}

type AssignmentTargetCounts = {
  assignedTrainees: number
  batchName?: string | null
  waveNumber?: number | null
  traineeName?: string | null
}

const QUESTION_TEMPLATE_HEADER = [
  'Question Number',
  'Category',
  'Question',
  'Choice 1',
  'Choice 2',
  'Choice 3',
  'Choice 4',
  'Correct Answer',
  'Difficulty',
  'Explanation',
]

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

function notEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toSortableTimestamp(value?: string | null, fallback = Number.MAX_SAFE_INTEGER) {
  if (!value) {
    return fallback
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? fallback : timestamp
}

function formatBatchLabel(batch?: Pick<BatchOption, 'name' | 'waveNumber'> | null) {
  if (!batch) {
    return 'Direct Assignment'
  }

  if (batch.waveNumber !== null && batch.waveNumber !== undefined) {
    return `${batch.name} | Wave ${batch.waveNumber}`
  }

  return batch.name
}

function buildCertificateUrl(certificateId: string) {
  return `/trainee/assessment?section=certificates&certificateId=${certificateId}`
}

function createCertificateCode() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `ASM-${stamp}-${random}`
}

function isAssessmentServiceUnavailableError(error: unknown) {
  return error instanceof AssessmentHttpError && error.status === 503
}

async function assertSupabaseResult<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  fallback: string,
) {
  let result: { data: T | null; error: { message: string } | null }
  try {
    result = await promise
  } catch {
    throw new AssessmentHttpError(
      503,
      'Unable to reach the Supabase assessment service right now. Please try again shortly.',
    )
  }

  if (result.error) {
    throw new AssessmentHttpError(500, result.error.message || fallback)
  }

  return result.data
}

function expectSupabaseRow<T>(value: T | null, fallback: string) {
  if (!value) {
    throw new AssessmentHttpError(500, fallback)
  }

  return value
}

function derivePassFeedback(score: number, passingScore: number) {
  if (score >= passingScore) {
    return 'Passing score achieved. Your certificate has been unlocked for this assessment category.'
  }

  return 'Passing score not reached yet. Review the summary, study the missed items, and retake the assessment.'
}

function buildQuestionRecord(
  question: TrainingQuestionRow,
  categoryName?: string | null,
  usageStats?: QuestionReportRecord | null,
): AssessmentQuestionRecord {
  const choices = Array.isArray(question.options) ? question.options.filter((option) => typeof option === 'string') : []
  const answerCount = usageStats?.answerCount || 0
  const correctCount = usageStats?.correctCount || 0
  const incorrectCount = usageStats?.incorrectCount || 0
  const accuracyRate = answerCount > 0 ? Number(((correctCount / answerCount) * 100).toFixed(2)) : 0

  return {
    id: question.id,
    assessmentId: question.assessment_id,
    categoryId: question.category_id,
    categoryName: categoryName || null,
    trainerId: question.created_by || null,
    questionNumber: question.question_number,
    questionText: question.question_text,
    questionType: question.question_type,
    options: choices,
    choices,
    correctAnswer: question.correct_answer,
    difficulty: question.difficulty,
    explanation: question.explanation,
    orderIndex: question.order_index,
    activeStatus: question.active_status,
    createdAt: question.created_at,
    updatedAt: question.updated_at,
    metadata: question.metadata || {},
    usageCount: answerCount,
    answerCount,
    correctCount,
    incorrectCount,
    accuracyRate,
    missRate: usageStats?.missRate || 0,
  }
}

function buildAssessmentRecord(
  assessment: TrainingAssessmentRow,
  questions: AssessmentQuestionRecord[],
): AssessmentRecord {
  return {
    id: assessment.id,
    categoryId: assessment.category_id,
    title: assessment.title,
    description: assessment.description,
    type: assessment.type,
    isPublished: assessment.is_published,
    instantFeedback: assessment.instant_feedback,
    sortOrder: assessment.sort_order,
    createdAt: assessment.created_at,
    updatedAt: assessment.updated_at,
    questionCount: questions.length,
    questions,
  }
}

function parseStoredAnalysis(
  rawAnalysis: Record<string, unknown> | null | undefined,
  fallback: AttemptAnalysisSummary,
): AttemptAnalysisSummary {
  if (!rawAnalysis || typeof rawAnalysis !== 'object') {
    return fallback
  }

  const strengths = Array.isArray(rawAnalysis.strengths)
    ? rawAnalysis.strengths.filter((value): value is string => typeof value === 'string')
    : fallback.strengths
  const improvements = Array.isArray(rawAnalysis.improvements)
    ? rawAnalysis.improvements.filter((value): value is string => typeof value === 'string')
    : fallback.improvements
  const recommendations = Array.isArray(rawAnalysis.recommendations)
    ? rawAnalysis.recommendations.filter((value): value is string => typeof value === 'string')
    : fallback.recommendations
  const categoryBreakdown = Array.isArray(rawAnalysis.categoryBreakdown)
    ? rawAnalysis.categoryBreakdown.filter((value): value is AttemptAnalysisSummary['categoryBreakdown'][number] => {
        return typeof value === 'object' && value !== null
      })
    : fallback.categoryBreakdown

  return {
    source: rawAnalysis.source === 'ai' ? 'ai' : 'rules',
    summary: typeof rawAnalysis.summary === 'string' && rawAnalysis.summary.trim()
      ? rawAnalysis.summary
      : fallback.summary,
    strengths,
    improvements,
    recommendations,
    categoryBreakdown,
  }
}

function buildAttemptRecord(attempt: TrainingAttemptFeedRow): AttemptRecord {
  const questionResults = Array.isArray(attempt.question_results) ? attempt.question_results : []
  const fallbackAnalysis = buildAttemptAnalysisSummary({
    categoryId: attempt.category_id,
    categoryTitle: attempt.category_title,
    score: Number(attempt.score || 0),
    questionResults,
  })

  return {
    id: attempt.id,
    assignmentId: attempt.assignment_id,
    assessmentId: attempt.assessment_id,
    categoryId: attempt.category_id,
    assignmentTitle: attempt.assignment_title || attempt.assessment_title,
    assessmentTitle: attempt.assessment_title,
    categoryTitle: attempt.category_title,
    traineeId: attempt.trainee_id,
    traineeName: attempt.trainee_name,
    traineeEmail: attempt.trainee_email,
    batchId: attempt.batch_id,
    batchName: attempt.batch_name,
    waveNumber: attempt.wave_number,
    attemptNo: attempt.attempt_no,
    score: Number(attempt.score || 0),
    passingScore: Number(attempt.passing_score || 0),
    status: attempt.status,
    feedback: attempt.feedback,
    trainerNote: attempt.trainer_note,
    submittedAt: attempt.submitted_at,
    startedAt: attempt.started_at,
    completedAt: attempt.completed_at || attempt.submitted_at,
    timeSpentSeconds: Number(attempt.time_spent_seconds || 0),
    correctAnswers: Number(attempt.correct_answers || questionResults.filter((result) => result.isCorrect).length),
    incorrectAnswers: Number(attempt.incorrect_answers || questionResults.filter((result) => !result.isCorrect).length),
    totalQuestions: Number(attempt.total_questions || questionResults.length),
    certificateId: attempt.certificate_id,
    certificateCode: attempt.certificate_code,
    certificateStatus: attempt.certificate_status || 'not_issued',
    certificateUrl: attempt.certificate_url || (attempt.certificate_id ? buildCertificateUrl(attempt.certificate_id) : null),
    questionResults,
    analysis: parseStoredAnalysis(attempt.analysis_summary, fallbackAnalysis),
  }
}

function buildCertificateRecord(
  certificate: TrainingCertificateRow,
  categoriesById: Map<string, CategoryRecord>,
  assignmentsById: Map<string, AssignmentRecord>,
  assessmentsById: Map<string, AssessmentRecord>,
): CertificateRecord {
  const category = categoriesById.get(certificate.category_id)
  const assignment = certificate.assignment_id ? assignmentsById.get(certificate.assignment_id) : null
  const assessment = assessmentsById.get(certificate.assessment_id)

  return {
    id: certificate.id,
    traineeId: certificate.trainee_id,
    categoryId: certificate.category_id,
    assignmentId: certificate.assignment_id,
    assessmentId: certificate.assessment_id,
    attemptId: certificate.attempt_id,
    categoryTitle: category?.title || 'Assessment Category',
    assignmentTitle: certificate.assignment_title || assignment?.title || assessment?.title || 'Assessment',
    assessmentTitle: assessment?.title || assignment?.title || 'Assessment',
    certificateCode: certificate.certificate_code,
    certificateStatus: certificate.certificate_status || 'issued',
    certificateUrl: certificate.certificate_url || buildCertificateUrl(certificate.id),
    earnedAt: certificate.earned_at,
  }
}

async function getVisibleCategories(sessionUser: BackendSessionUser) {
  const supabase = createSupabaseAdminClient()
  const categories = ((await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .select('*')
      .eq('is_archived', false)
      .eq('active_status', true)
      .order('updated_at', { ascending: false }),
    'Unable to load assessment categories.',
  )) as TrainingCategoryRow[] | null) || []

  return categories.filter((category) =>
    sessionUser.role === 'admin' ? true : category.created_by === sessionUser.userId,
  )
}

async function getTrainerBatches(sessionUser: BackendSessionUser) {
  const supabase = createSupabaseAdminClient()
  const batchRows = ((await assertSupabaseResult(
    supabase
      .from('batch')
      .select('id,name,description,wave_number,created_by,is_active')
      .eq('is_active', true)
      .order('wave_number', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    'Unable to load trainer batches.',
  )) as BatchRow[] | null) || []

  const visibleBatches = batchRows.filter((batch) =>
    sessionUser.role === 'admin' ? true : batch.created_by === sessionUser.userId,
  )
  const batchIds = visibleBatches.map((batch) => batch.id)

  const batchUserRows = batchIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('batch_user')
          .select('batch_id,user_id')
          .in('batch_id', batchIds),
        'Unable to load batch membership.',
      )) as BatchUserRow[] | null) || [])
    : []

  const traineeIds = unique(batchUserRows.map((row) => row.user_id))
  const traineeRows = traineeIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('user')
          .select('id,email,full_name,role')
          .in('id', traineeIds),
        'Unable to load trainee records.',
      )) as UserRow[] | null) || [])
    : []

  const traineeMap = new Map(traineeRows.filter((row) => row.role === 'trainee').map((row) => [row.id, row]))

  const batchOptions: BatchOption[] = visibleBatches.map((batch) => ({
    id: batch.id,
    name: batch.name,
    description: batch.description,
    waveNumber: batch.wave_number,
    traineeCount: batchUserRows.filter((row) => row.batch_id === batch.id && traineeMap.has(row.user_id)).length,
  }))

  const traineeOptions: TraineeOption[] = Array.from(traineeMap.values()).map((trainee) => {
    const memberships = batchUserRows.filter((row) => row.user_id === trainee.id).map((row) => row.batch_id)
    const batches = batchOptions.filter((batch) => memberships.includes(batch.id))

    return {
      id: trainee.id,
      fullName: trainee.full_name,
      email: trainee.email,
      batchIds: batches.map((batch) => batch.id),
      batchNames: batches.map((batch) => formatBatchLabel(batch)),
    }
  })

  return {
    batchOptions,
    traineeOptions,
    batchMembershipRows: batchUserRows,
  }
}

async function ensurePrimaryAssessment(categoryId: string, category: TrainingCategoryRow) {
  const supabase = createSupabaseAdminClient()
  const existing = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .select('*')
      .eq('category_id', categoryId)
      .eq('is_primary', true)
      .maybeSingle(),
    'Unable to load the category assessment shell.',
  ) as TrainingAssessmentRow | null

  if (existing) {
    return existing
  }

  const inserted = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .insert({
        category_id: categoryId,
        title: category.title,
        description: category.description || null,
        type: 'multiple_choice',
        is_published: true,
        instant_feedback: false,
        sort_order: 0,
        is_primary: true,
        active_status: true,
      })
      .select('*')
      .single(),
    'Unable to create the category assessment shell.',
  ) as TrainingAssessmentRow | null

  return expectSupabaseRow(inserted, 'Unable to create the category assessment shell.')
}

async function getOwnedCategory(categoryId: string, sessionUser: BackendSessionUser) {
  const supabase = createSupabaseAdminClient()
  const category = await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .select('*')
      .eq('id', categoryId)
      .maybeSingle(),
    'Unable to load the selected category.',
  ) as TrainingCategoryRow | null

  if (!category || category.is_archived || !category.active_status) {
    throw new AssessmentHttpError(404, 'Assessment category not found.')
  }

  if (sessionUser.role !== 'admin' && category.created_by !== sessionUser.userId) {
    throw new AssessmentHttpError(403, 'You can only modify categories you created.')
  }

  return category
}

async function getOwnedQuestion(questionId: string, sessionUser: BackendSessionUser) {
  const supabase = createSupabaseAdminClient()
  const question = await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .select('*')
      .eq('id', questionId)
      .maybeSingle(),
    'Unable to load the selected question.',
  ) as TrainingQuestionRow | null

  if (!question) {
    throw new AssessmentHttpError(404, 'Question not found.')
  }

  await getOwnedCategory(question.category_id, sessionUser)
  return question
}

async function getOwnedAssignment(assignmentId: string, sessionUser: BackendSessionUser) {
  const supabase = createSupabaseAdminClient()
  const assignment = await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .select('*')
      .eq('id', assignmentId)
      .maybeSingle(),
    'Unable to load the selected assignment.',
  ) as TrainingAssignmentRow | null

  if (!assignment) {
    throw new AssessmentHttpError(404, 'Assignment not found.')
  }

  await getOwnedCategory(assignment.category_id, sessionUser)
  return assignment
}

async function getAccessibleTraineeAssignment(
  assignmentId: string,
  sessionUser: BackendSessionUser,
) {
  const supabase = createSupabaseAdminClient()
  const assignment = await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('is_active', true)
      .maybeSingle(),
    'Unable to load the selected assessment assignment.',
  ) as TrainingAssignmentRow | null

  if (!assignment) {
    throw new AssessmentHttpError(404, 'Assessment assignment not found.')
  }

  const memberships = ((await assertSupabaseResult(
    supabase
      .from('batch_user')
      .select('batch_id,user_id')
      .eq('user_id', sessionUser.userId),
    'Unable to verify trainee batch membership.',
  )) as BatchUserRow[] | null) || []

  const batchIds = memberships.map((row) => row.batch_id)
  const hasAccess = assignment.trainee_id === sessionUser.userId
    || (!!assignment.batch_id && batchIds.includes(assignment.batch_id))

  if (!hasAccess) {
    throw new AssessmentHttpError(403, 'This assessment is not assigned to your trainee account.')
  }

  return assignment
}

async function loadQuestionsByCategoryIds(categoryIds: string[]) {
  const supabase = createSupabaseAdminClient()
  if (!categoryIds.length) {
    return [] as TrainingQuestionRow[]
  }

  return (((await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .select('*')
      .in('category_id', categoryIds)
      .order('question_number', { ascending: true })
      .order('created_at', { ascending: true }),
    'Unable to load the assessment question bank.',
  )) as TrainingQuestionRow[] | null) || [])
}

async function loadAssignmentQuestionRows(assignmentIds: string[]) {
  const supabase = createSupabaseAdminClient()
  if (!assignmentIds.length) {
    return [] as TrainingAssignmentQuestionRow[]
  }

  return (((await assertSupabaseResult(
    supabase
      .from('training_assessment_assignment_questions')
      .select('assignment_id,question_id,question_order')
      .in('assignment_id', assignmentIds)
      .order('question_order', { ascending: true })
      .order('created_at', { ascending: true }),
    'Unable to load assignment question mappings.',
  )) as TrainingAssignmentQuestionRow[] | null) || [])
}

function selectAssignmentQuestions(
  assignment: TrainingAssignmentRow,
  allQuestions: TrainingQuestionRow[],
  assignmentQuestionRows: TrainingAssignmentQuestionRow[],
) {
  const activeQuestions = allQuestions.filter((question) => question.active_status)
  const byId = new Map(activeQuestions.map((question) => [question.id, question]))
  const explicitQuestions = assignmentQuestionRows
    .filter((row) => row.assignment_id === assignment.id)
    .map((row) => byId.get(row.question_id))
    .filter(notEmpty)

  const questionPool = explicitQuestions.length ? explicitQuestions : activeQuestions
  const shouldShuffleQuestions = assignment.shuffle_questions ?? false
  const questionCount = assignment.question_count ?? null

  let selected = questionPool
  if (assignment.assignment_mode === 'random_subset') {
    const randomCount = Math.max(1, questionCount || questionPool.length)
    const randomized = [...questionPool]
    for (let index = randomized.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      const current = randomized[index]
      randomized[index] = randomized[swapIndex]
      randomized[swapIndex] = current
    }
    selected = randomized.slice(0, Math.min(randomCount, randomized.length))
  } else if (assignment.assignment_mode === 'selected_questions' && explicitQuestions.length) {
    selected = explicitQuestions
  } else {
    selected = activeQuestions
  }

  if (shouldShuffleQuestions) {
    const randomized = [...selected]
    for (let index = randomized.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      const current = randomized[index]
      randomized[index] = randomized[swapIndex]
      randomized[swapIndex] = current
    }
    return randomized
  }

  return selected
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

function normalizeBoolean(value: boolean | null | undefined, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

async function buildAiNarrativeSummary(
  categoryTitle: string,
  passingScore: number,
  score: number,
  questionResults: AttemptQuestionResult[],
  fallback: AttemptAnalysisSummary,
): Promise<AttemptAnalysisSummary> {
  const apiKey = getConfigValue([
    'GEMINI_API_KEY',
    'GOOGLE_AI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  ], '').trim()

  if (!apiKey) {
    return fallback
  }

  try {
    const client = new GoogleGenerativeAI(apiKey)
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const prompt = [
      'Return JSON only with keys: summary, strengths, improvements, recommendations.',
      'You are generating post-assessment coaching feedback for a BPO training platform.',
      `Category: ${categoryTitle}`,
      `Passing score: ${passingScore}`,
      `Actual score: ${score}`,
      'Question review:',
      ...questionResults.map((result) => [
        `Question ${result.questionNumber || 0}: ${result.questionText}`,
        `Correct: ${result.correctAnswer}`,
        `User: ${result.userAnswer}`,
        `Was correct: ${result.isCorrect}`,
        result.explanation ? `Explanation: ${result.explanation}` : '',
      ].filter(Boolean).join('\n')),
    ].join('\n\n')

    const response = await model.generateContent(prompt)
    const text = response.response.text().trim()
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')

    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      return fallback
    }

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      summary?: string
      strengths?: string[]
      improvements?: string[]
      recommendations?: string[]
    }

    return {
      ...fallback,
      source: 'ai',
      summary: parsed.summary?.trim() || fallback.summary,
      strengths: Array.isArray(parsed.strengths) && parsed.strengths.length ? parsed.strengths : fallback.strengths,
      improvements: Array.isArray(parsed.improvements) && parsed.improvements.length ? parsed.improvements : fallback.improvements,
      recommendations:
        Array.isArray(parsed.recommendations) && parsed.recommendations.length
          ? parsed.recommendations
          : fallback.recommendations,
    }
  } catch {
    return fallback
  }
}

async function buildTrainerAssignmentContext(sessionUser: BackendSessionUser) {
  const categories = await getVisibleCategories(sessionUser)
  const categoryIds = categories.map((category) => category.id)
  const questions = await loadQuestionsByCategoryIds(categoryIds)
  const { batchOptions, traineeOptions, batchMembershipRows } = await getTrainerBatches(sessionUser)

  return {
    categories,
    categoryIds,
    questions,
    batchOptions,
    traineeOptions,
    batchMembershipRows,
  }
}

function getAssignmentPriority(assignment: TrainingAssignmentRow) {
  let priority = 0

  if (assignment.trainee_id) {
    priority += 4
  }
  if (assignment.due_at) {
    priority += 2
  }
  if (assignment.assignment_mode === 'random_subset') {
    priority += 1
  }

  return priority
}

function shouldReplaceAvailableAssessment(
  currentAssignment: TrainingAssignmentRow,
  candidateAssignment: TrainingAssignmentRow,
) {
  const currentPriority = getAssignmentPriority(currentAssignment)
  const candidatePriority = getAssignmentPriority(candidateAssignment)

  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority
  }

  const currentDue = toSortableTimestamp(currentAssignment.due_at)
  const candidateDue = toSortableTimestamp(candidateAssignment.due_at)
  if (candidateDue !== currentDue) {
    return candidateDue < currentDue
  }

  return toSortableTimestamp(candidateAssignment.assigned_at, 0) > toSortableTimestamp(currentAssignment.assigned_at, 0)
}

function buildTargetCounts(
  assignment: TrainingAssignmentRow,
  batchMap: Map<string, BatchOption>,
  traineeMap: Map<string, TraineeOption>,
  batchMembershipRows: BatchUserRow[],
): AssignmentTargetCounts {
  if (assignment.trainee_id) {
    return {
      assignedTrainees: 1,
      traineeName: traineeMap.get(assignment.trainee_id)?.fullName || null,
    }
  }

  if (!assignment.batch_id) {
    return {
      assignedTrainees: 0,
    }
  }

  const batch = batchMap.get(assignment.batch_id)
  const assignedTrainees = batchMembershipRows.filter((row) => row.batch_id === assignment.batch_id).length

  return {
    assignedTrainees,
    batchName: batch?.name || null,
    waveNumber: batch?.waveNumber,
  }
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
    'medium',
    'Tier 2 escalation should happen only after the basic validation and troubleshooting steps are complete.',
  ]

  return [
    QUESTION_TEMPLATE_HEADER.map((value) => toCsvCell(value)).join(','),
    sampleRow.map((value) => toCsvCell(value)).join(','),
  ].join('\n')
}

export async function getTrainerAssessmentBootstrap(
  sessionUser: BackendSessionUser,
): Promise<TrainerBootstrapResponse> {
  const supabase = createSupabaseAdminClient()
  const { categories: rawCategories, categoryIds, questions: rawQuestions, batchOptions, traineeOptions, batchMembershipRows } =
    await buildTrainerAssignmentContext(sessionUser)

  const assessments = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessments')
          .select('*')
          .in('category_id', categoryIds)
          .eq('is_primary', true)
          .order('created_at', { ascending: true }),
        'Unable to load assessment shells.',
      )) as TrainingAssessmentRow[] | null) || [])
    : []

  const assignmentRows = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_assignments')
          .select('*')
          .in('category_id', categoryIds)
          .order('assigned_at', { ascending: false }),
        'Unable to load assessment assignments.',
      )) as TrainingAssignmentRow[] | null) || [])
    : []

  const assignmentIds = assignmentRows.map((assignment) => assignment.id)
  const assignmentQuestionRows = await loadAssignmentQuestionRows(assignmentIds)

  const attemptFeedRows = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_attempt_feed')
          .select('*')
          .in('category_id', categoryIds)
          .order('submitted_at', { ascending: false }),
        'Unable to load assessment attempt history.',
      )) as TrainingAttemptFeedRow[] | null) || [])
    : []

  const certificateRows = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_certificates')
          .select('*')
          .in('category_id', categoryIds)
          .order('earned_at', { ascending: false }),
        'Unable to load assessment certificates.',
      )) as TrainingCertificateRow[] | null) || [])
    : []

  const categoryReportRows = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_category_report')
          .select('*')
          .in('category_id', categoryIds)
          .order('category_title', { ascending: true }),
        'Unable to load category analytics.',
      )) as TrainingCategoryReportRow[] | null) || [])
    : []

  const batchReportRows = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_batch_report')
      .select('*')
      .order('batch_name', { ascending: true }),
    'Unable to load batch analytics.',
  )) as TrainingBatchReportRow[] | null) || [])

  const questionReportRows = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_question_report')
          .select('*')
          .in('category_id', categoryIds)
          .order('miss_rate', { ascending: false })
          .order('question_number', { ascending: true }),
        'Unable to load question analytics.',
      )) as TrainingQuestionReportRow[] | null) || [])
    : []

  const batchMap = new Map(batchOptions.map((batch) => [batch.id, batch]))
  const traineeMap = new Map(traineeOptions.map((trainee) => [trainee.id, trainee]))
  const questionReportMap = new Map(
    questionReportRows.map((row) => [
      row.question_id,
      {
        questionId: row.question_id,
        categoryId: row.category_id,
        categoryTitle: row.category_title || '',
        questionNumber: row.question_number || 0,
        questionText: row.question_text,
        questionType: row.question_type,
        difficulty: row.difficulty,
        answerCount: row.answer_count,
        correctCount: row.correct_count,
        incorrectCount: row.incorrect_count,
        missRate: Number(row.miss_rate || 0),
      } satisfies QuestionReportRecord,
    ]),
  )

  const categoryMap = new Map(rawCategories.map((category) => [category.id, category]))
  const questionRecords = rawQuestions.map((question) =>
    buildQuestionRecord(question, categoryMap.get(question.category_id)?.title || null, questionReportMap.get(question.id) || null),
  )

  const questionsByCategory = new Map<string, AssessmentQuestionRecord[]>()
  for (const question of questionRecords) {
    const current = questionsByCategory.get(question.categoryId || '') || []
    current.push(question)
    questionsByCategory.set(question.categoryId || '', current)
  }

  const assessmentsById = new Map<string, AssessmentRecord>()
  for (const assessment of assessments) {
    assessmentsById.set(
      assessment.id,
      buildAssessmentRecord(assessment, questionsByCategory.get(assessment.category_id) || []),
    )
  }

  const categoryReportMap = new Map(categoryReportRows.map((row) => [row.category_id, row]))
  const categories: CategoryRecord[] = rawCategories.map((category) => {
    const report = categoryReportMap.get(category.id)
    const assessment = assessments.find((item) => item.category_id === category.id)
    return {
      id: category.id,
      title: category.title,
      categoryName: category.title,
      description: category.description,
      passingScore: category.passing_score,
      createdBy: category.created_by,
      trainerId: category.created_by,
      activeStatus: category.active_status,
      isArchived: category.is_archived,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
      questionCount: questionsByCategory.get(category.id)?.length || 0,
      assignmentCount: report?.assignment_count || assignmentRows.filter((row) => row.category_id === category.id).length,
      activeAssignmentCount: assignmentRows.filter((row) => row.category_id === category.id && row.is_active).length,
      attemptCount: report?.attempt_count || 0,
      passRate: Number(report?.pass_rate || 0),
      averageScore: Number(report?.average_score || 0),
      completionRate: Number(report?.completion_rate || 0),
      retakeRate: report?.attempt_count
        ? Number((((report.retake_count || 0) / Math.max(report.attempt_count, 1)) * 100).toFixed(2))
        : 0,
      highestScore: Number(report?.highest_score || 0),
      lowestScore: Number(report?.lowest_score || 0),
      assessments: assessment ? [assessmentsById.get(assessment.id)!] : [],
    }
  })

  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const attempts = attemptFeedRows.map(buildAttemptRecord)
  const latestAttemptsByAssignment = new Map<string, Map<string, AttemptRecord>>()

  for (const attempt of attempts) {
    if (!attempt.assignmentId) {
      continue
    }
    const current = latestAttemptsByAssignment.get(attempt.assignmentId) || new Map<string, AttemptRecord>()
    if (!current.has(attempt.traineeId)) {
      current.set(attempt.traineeId, attempt)
    }
    latestAttemptsByAssignment.set(attempt.assignmentId, current)
  }

  const assignments: AssignmentRecord[] = assignmentRows.map((assignment) => {
    const category = categoriesById.get(assignment.category_id)
    const targetCounts = buildTargetCounts(assignment, batchMap, traineeMap, batchMembershipRows)
    const latestByTrainee = latestAttemptsByAssignment.get(assignment.id) || new Map<string, AttemptRecord>()
    const latestAttempts = Array.from(latestByTrainee.values())
    const passedTrainees = latestAttempts.filter((attempt) => attempt.status === 'pass').length
    const failedTrainees = latestAttempts.filter((attempt) => attempt.status === 'fail').length
    const completedTrainees = latestAttempts.length
    const averageScore = latestAttempts.length
      ? Number((latestAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / latestAttempts.length).toFixed(2))
      : 0
    const highestScore = latestAttempts.length ? Math.max(...latestAttempts.map((attempt) => attempt.score)) : 0
    const lowestScore = latestAttempts.length ? Math.min(...latestAttempts.map((attempt) => attempt.score)) : 0
    const retakeRate = completedTrainees
      ? Number((((latestAttempts.filter((attempt) => attempt.attemptNo > 1).length / completedTrainees) * 100)).toFixed(2))
      : 0
    const selectedQuestionIds = assignmentQuestionRows
      .filter((row) => row.assignment_id === assignment.id)
      .map((row) => row.question_id)
    const questionCount = assignment.question_count
      || (assignment.assignment_mode === 'selected_questions' && selectedQuestionIds.length
        ? selectedQuestionIds.length
        : questionsByCategory.get(assignment.category_id)?.length || 0)

    const statusLabel = passedTrainees >= targetCounts.assignedTrainees && targetCounts.assignedTrainees > 0
      ? 'Completed'
      : completedTrainees > 0
        ? 'In Progress'
        : 'Pending'

    return {
      id: assignment.id,
      categoryId: assignment.category_id,
      assessmentId: assignment.assessment_id,
      batchId: assignment.batch_id,
      traineeId: assignment.trainee_id,
      assignedBy: assignment.assigned_by,
      assignedAt: assignment.assigned_at,
      dueAt: assignment.due_at,
      isActive: assignment.is_active,
      categoryTitle: category?.title || 'Assessment Category',
      categoryName: category?.title || 'Assessment Category',
      assessmentTitle: assignment.title || category?.title || 'Assessment',
      title: assignment.title || `${category?.title || 'Assessment'} Assessment`,
      description: assignment.description,
      targetLabel: assignment.batch_id
        ? formatBatchLabel(batchMap.get(assignment.batch_id) || null)
        : traineeMap.get(assignment.trainee_id || '')?.fullName || 'Trainee',
      targetType: assignment.batch_id ? 'batch' : 'trainee',
      waveNumber: targetCounts.waveNumber,
      assignmentMode: assignment.assignment_mode || 'entire_category',
      questionCount,
      randomQuestionCount: assignment.assignment_mode === 'random_subset' ? questionCount : null,
      passingScore: assignment.passing_score || category?.passingScore || 90,
      maximumAttempts: assignment.maximum_attempts,
      timeLimitMinutes: assignment.time_limit_minutes,
      shuffleChoices: normalizeBoolean(assignment.shuffle_choices, true),
      shuffleQuestions: normalizeBoolean(assignment.shuffle_questions, false),
      selectedQuestionIds,
      assignedTrainees: targetCounts.assignedTrainees,
      completedTrainees,
      passedTrainees,
      failedTrainees,
      certificateCount: certificateRows.filter((certificate) => certificate.assignment_id === assignment.id).length,
      averageScore,
      highestScore,
      lowestScore,
      retakeRate,
      statusLabel,
    }
  })

  const assignmentsById = new Map(assignments.map((assignment) => [assignment.id, assignment]))
  const certificates = certificateRows.map((certificate) =>
    buildCertificateRecord(certificate, categoriesById, assignmentsById, assessmentsById),
  )

  const categoryReports: CategoryReportRecord[] = categoryReportRows.map((report) => ({
    categoryId: report.category_id,
    categoryTitle: report.category_title,
    passingScore: report.passing_score,
    questionCount: categoriesById.get(report.category_id)?.questionCount || 0,
    assignmentCount: report.assignment_count || 0,
    assignedTraineeCount: report.assigned_trainee_count || 0,
    completedTraineeCount: report.completed_trainee_count || 0,
    attemptCount: report.attempt_count,
    passCount: report.pass_count,
    failCount: report.fail_count,
    averageScore: Number(report.average_score || 0),
    passRate: Number(report.pass_rate || 0),
    failRate: report.attempt_count
      ? Number((((report.fail_count || 0) / Math.max(report.attempt_count, 1)) * 100).toFixed(2))
      : 0,
    retakeRate: report.attempt_count
      ? Number((((report.retake_count || 0) / Math.max(report.attempt_count, 1)) * 100).toFixed(2))
      : 0,
    highestScore: Number(report.highest_score || 0),
    lowestScore: Number(report.lowest_score || 0),
    completionRate: Number(report.completion_rate || 0),
  }))

  const batchReports: BatchReportRecord[] = batchReportRows.map((report) => ({
    batchId: report.batch_id,
    batchName: report.batch_name,
    waveNumber: report.wave_number,
    categoryId: report.category_id,
    categoryTitle: report.category_title,
    assignmentCount: report.assignment_count,
    assignedTraineeCount: report.assigned_trainee_count,
    completedTraineeCount: report.completed_trainee_count,
    attemptCount: report.attempt_count,
    averageScore: Number(report.average_score || 0),
    passRate: Number(report.pass_rate || 0),
    completionRate: Number(report.completion_rate || 0),
    highestScore: Number(report.highest_score || 0),
    lowestScore: Number(report.lowest_score || 0),
  }))

  const questionReports: QuestionReportRecord[] = questionReportRows.map((report) => ({
    questionId: report.question_id,
    categoryId: report.category_id,
    categoryTitle: report.category_title || categoriesById.get(report.category_id)?.title || '',
    questionNumber: report.question_number || 0,
    questionText: report.question_text,
    questionType: report.question_type,
    difficulty: report.difficulty,
    answerCount: report.answer_count,
    correctCount: report.correct_count,
    incorrectCount: report.incorrect_count,
    missRate: Number(report.miss_rate || 0),
  }))

  const totalAttempts = attempts.length
  const totalPassed = attempts.filter((attempt) => attempt.status === 'pass').length

  return {
    categories,
    questions: questionRecords,
    batches: batchOptions,
    trainees: traineeOptions,
    assignments,
    attempts,
    certificates,
    reports: {
      categories: categoryReports,
      batches: batchReports,
      questions: questionReports,
    },
    analytics: {
      totalQuestions: questionRecords.length,
      totalAssignments: assignments.length,
      activeAssignments: assignments.filter((assignment) => assignment.isActive).length,
      totalAttempts,
      passRate: totalAttempts ? Number(((totalPassed / totalAttempts) * 100).toFixed(2)) : 0,
      averageScore: totalAttempts
        ? Number((attempts.reduce((sum, attempt) => sum + attempt.score, 0) / totalAttempts).toFixed(2))
        : 0,
      certificatesIssued: certificates.length,
    },
  }
}

export async function createCategory(
  sessionUser: BackendSessionUser,
  payload: CreateCategoryPayload,
) {
  const supabase = createSupabaseAdminClient()
  const inserted = await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .insert({
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        passing_score: payload.passingScore,
        created_by: sessionUser.userId,
        active_status: true,
      })
      .select('*')
      .single(),
    'Unable to create assessment category.',
  ) as TrainingCategoryRow | null

  const category = expectSupabaseRow(inserted, 'Unable to create assessment category.')
  await ensurePrimaryAssessment(category.id, category)
  return category
}

export async function updateCategory(
  sessionUser: BackendSessionUser,
  categoryId: string,
  payload: UpdateCategoryPayload,
) {
  const category = await getOwnedCategory(categoryId, sessionUser)
  const supabase = createSupabaseAdminClient()
  const updated = await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .update({
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        passing_score: payload.passingScore,
      })
      .eq('id', categoryId)
      .select('*')
      .single(),
    'Unable to update assessment category.',
  ) as TrainingCategoryRow | null

  await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .update({
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
      })
      .eq('category_id', category.id)
      .eq('is_primary', true),
    'Unable to update the linked assessment shell.',
  )

  return expectSupabaseRow(updated, 'Unable to update assessment category.')
}

export async function archiveCategory(
  sessionUser: BackendSessionUser,
  categoryId: string,
) {
  await getOwnedCategory(categoryId, sessionUser)
  const supabase = createSupabaseAdminClient()

  await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .update({
        is_archived: true,
        active_status: false,
      })
      .eq('id', categoryId),
    'Unable to archive assessment category.',
  )
}

function questionTypeFromChoices(options: string[]) {
  return options.some((option) => option.trim().length > 0) ? 'multiple_choice' : 'fill_blank'
}

async function resolveQuestionCategoryAndAssessment(
  sessionUser: BackendSessionUser,
  payload: Pick<CreateQuestionPayload, 'assessmentId' | 'categoryId'>,
) {
  if (payload.categoryId) {
    const category = await getOwnedCategory(payload.categoryId, sessionUser)
    const assessment = await ensurePrimaryAssessment(category.id, category)
    return {
      category,
      assessment,
    }
  }

  if (!payload.assessmentId) {
    throw new AssessmentHttpError(400, 'Category is required before creating a question.')
  }

  const supabase = createSupabaseAdminClient()
  const assessment = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .select('*')
      .eq('id', payload.assessmentId)
      .maybeSingle(),
    'Unable to load the linked assessment shell.',
  ) as TrainingAssessmentRow | null

  if (!assessment) {
    throw new AssessmentHttpError(404, 'Assessment shell not found.')
  }

  const category = await getOwnedCategory(assessment.category_id, sessionUser)
  return { category, assessment }
}

async function getNextQuestionNumber(categoryId: string) {
  const supabase = createSupabaseAdminClient()
  const rows = ((await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .select('question_number')
      .eq('category_id', categoryId)
      .order('question_number', { ascending: false })
      .limit(1),
    'Unable to calculate the next question number.',
  )) as Array<{ question_number: number }> | null) || []

  return (rows[0]?.question_number || 0) + 1
}

export async function createQuestion(
  sessionUser: BackendSessionUser,
  payload: CreateQuestionPayload,
) {
  const { category, assessment } = await resolveQuestionCategoryAndAssessment(sessionUser, payload)
  const supabase = createSupabaseAdminClient()
  const nextQuestionNumber = payload.questionNumber || await getNextQuestionNumber(category.id)
  const nextOrderIndex = payload.orderIndex || nextQuestionNumber - 1
  const questionType = payload.questionType || questionTypeFromChoices(payload.options)

  const inserted = await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .insert({
        assessment_id: assessment.id,
        category_id: category.id,
        question_number: nextQuestionNumber,
        question_text: payload.questionText.trim(),
        question_type: questionType,
        options: questionType === 'multiple_choice'
          ? payload.options.map((option) => option.trim()).filter(Boolean)
          : [],
        correct_answer: payload.correctAnswer.trim(),
        difficulty: payload.difficulty || null,
        explanation: payload.explanation?.trim() || null,
        order_index: nextOrderIndex,
        active_status: true,
        created_by: sessionUser.userId,
      })
      .select('*')
      .single(),
    'Unable to create assessment question.',
  ) as TrainingQuestionRow | null

  return expectSupabaseRow(inserted, 'Unable to create assessment question.')
}

export async function updateQuestion(
  sessionUser: BackendSessionUser,
  questionId: string,
  payload: UpdateQuestionPayload,
) {
  const currentQuestion = await getOwnedQuestion(questionId, sessionUser)
  const { category, assessment } = await resolveQuestionCategoryAndAssessment(sessionUser, {
    assessmentId: payload.assessmentId,
    categoryId: payload.categoryId || currentQuestion.category_id,
  })
  const supabase = createSupabaseAdminClient()
  const questionType = payload.questionType || questionTypeFromChoices(payload.options)

  const updated = await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .update({
        assessment_id: assessment.id,
        category_id: category.id,
        question_number: payload.questionNumber || currentQuestion.question_number,
        question_text: payload.questionText.trim(),
        question_type: questionType,
        options: questionType === 'multiple_choice'
          ? payload.options.map((option) => option.trim()).filter(Boolean)
          : [],
        correct_answer: payload.correctAnswer.trim(),
        difficulty: payload.difficulty || null,
        explanation: payload.explanation?.trim() || null,
        order_index: payload.orderIndex,
      })
      .eq('id', questionId)
      .select('*')
      .single(),
    'Unable to update assessment question.',
  ) as TrainingQuestionRow | null

  return expectSupabaseRow(updated, 'Unable to update assessment question.')
}

export async function deleteQuestion(
  sessionUser: BackendSessionUser,
  questionId: string,
) {
  await getOwnedQuestion(questionId, sessionUser)
  const supabase = createSupabaseAdminClient()

  await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .delete()
      .eq('id', questionId),
    'Unable to delete assessment question.',
  )
}

export async function bulkUploadQuestions(
  sessionUser: BackendSessionUser,
  csvText: string,
): Promise<BulkUploadQuestionsResponse> {
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

  const categoryRows = await getVisibleCategories(sessionUser)
  const categoryMap = new Map(categoryRows.map((category) => [normalizeAssessmentAnswer(category.title), category]))
  const assessmentMap = new Map<string, TrainingAssessmentRow>()
  for (const category of categoryRows) {
    assessmentMap.set(category.id, await ensurePrimaryAssessment(category.id, category))
  }

  const columnIndex = new Map(header.map((column, index) => [column, index]))
  const errors: BulkUploadErrorRecord[] = []
  const importedQuestions: AssessmentQuestionRecord[] = []
  const supabase = createSupabaseAdminClient()

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const getValue = (column: string) => row[columnIndex.get(column) || 0]?.trim() || ''
    const categoryName = getValue('Category')
    const questionNumberValue = getValue('Question Number')
    const questionText = getValue('Question')
    const choices = [
      getValue('Choice 1'),
      getValue('Choice 2'),
      getValue('Choice 3'),
      getValue('Choice 4'),
    ]
    const correctAnswer = getValue('Correct Answer')
    const difficulty = getValue('Difficulty').toLowerCase() as 'easy' | 'medium' | 'hard' | ''
    const explanation = getValue('Explanation')

    const category = categoryMap.get(normalizeAssessmentAnswer(categoryName))
    const rowNumber = rowIndex + 1

    if (!category) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Category does not exist or is not visible to this trainer.',
      })
      continue
    }

    if (!questionText || !correctAnswer || choices.filter(Boolean).length < 2) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Question text, correct answer, and at least two choices are required.',
      })
      continue
    }

    if (!choices.some((choice) => normalizeAssessmentAnswer(choice) === normalizeAssessmentAnswer(correctAnswer))) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Correct Answer must exactly match one of the provided choices.',
      })
      continue
    }

    if (difficulty && difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Difficulty must be easy, medium, or hard when provided.',
      })
      continue
    }

    const questionNumber = toNumber(questionNumberValue, 0) || await getNextQuestionNumber(category.id)
    const assessment = assessmentMap.get(category.id)!

    try {
      const inserted = await assertSupabaseResult(
        supabase
          .from('training_assessment_questions')
          .insert({
            assessment_id: assessment.id,
            category_id: category.id,
            question_number: questionNumber,
            question_text: questionText,
            question_type: 'multiple_choice',
            options: choices.filter(Boolean),
            correct_answer: correctAnswer,
            difficulty: difficulty || null,
            explanation: explanation || null,
            order_index: questionNumber - 1,
            active_status: true,
            created_by: sessionUser.userId,
          })
          .select('*')
          .single(),
        'Unable to import one of the uploaded questions.',
      ) as TrainingQuestionRow | null

      if (inserted) {
        importedQuestions.push(buildQuestionRecord(inserted, category.title))
      }
    } catch (error) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
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
    errorCsv: errors.length ? buildBulkUploadErrorCsv(errors) : null,
  }
}

export async function createAssignment(
  sessionUser: BackendSessionUser,
  payload: CreateAssignmentPayload,
) {
  const category = await getOwnedCategory(payload.categoryId, sessionUser)
  const supabase = createSupabaseAdminClient()
  const { batchOptions, traineeOptions } = await getTrainerBatches(sessionUser)

  if (!payload.batchId && !payload.traineeId) {
    throw new AssessmentHttpError(400, 'Pick a batch or a trainee before creating the assignment.')
  }

  if (payload.batchId && payload.traineeId) {
    throw new AssessmentHttpError(400, 'Choose either a batch target or a trainee target, not both.')
  }

  if (payload.batchId && !batchOptions.some((batch) => batch.id === payload.batchId)) {
    throw new AssessmentHttpError(404, 'The selected batch is not available in your workspace.')
  }

  if (payload.traineeId && !traineeOptions.some((trainee) => trainee.id === payload.traineeId)) {
    throw new AssessmentHttpError(404, 'The selected trainee is not available in your workspace.')
  }

  const selectedQuestionIds = unique((payload.questionIds || []).filter(Boolean))
  const categoryQuestions = await loadQuestionsByCategoryIds([category.id])
  const questionPoolIds = new Set(categoryQuestions.filter((question) => question.active_status).map((question) => question.id))
  const mode = payload.assignmentMode || 'entire_category'

  if (mode === 'selected_questions' && !selectedQuestionIds.length) {
    throw new AssessmentHttpError(400, 'Select at least one question when using selected question mode.')
  }

  if (selectedQuestionIds.some((questionId) => !questionPoolIds.has(questionId))) {
    throw new AssessmentHttpError(400, 'One or more selected questions do not belong to the chosen category.')
  }

  if (mode === 'random_subset') {
    const randomCount = payload.randomQuestionCount || payload.questionIds?.length || payload.questionIds?.length || 0
    const availablePoolSize = selectedQuestionIds.length || questionPoolIds.size
    if (!randomCount || randomCount < 1) {
      throw new AssessmentHttpError(400, 'Provide how many questions should be drawn in random subset mode.')
    }
    if (randomCount > availablePoolSize) {
      throw new AssessmentHttpError(400, 'Random subset count cannot exceed the available question pool.')
    }
  }

  const inserted = await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .insert({
        category_id: category.id,
        assessment_id: payload.assessmentId || null,
        batch_id: payload.batchId || null,
        trainee_id: payload.traineeId || null,
        assigned_by: sessionUser.userId,
        due_at: payload.dueAt || null,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        assignment_mode: mode,
        question_count:
          mode === 'random_subset'
            ? payload.randomQuestionCount || null
            : selectedQuestionIds.length || categoryQuestions.filter((question) => question.active_status).length,
        passing_score: payload.passingScore || category.passing_score,
        maximum_attempts: payload.maximumAttempts || null,
        time_limit_minutes: payload.timeLimitMinutes || null,
        shuffle_choices: payload.shuffleChoices ?? true,
        shuffle_questions: payload.shuffleQuestions ?? false,
      })
      .select('*')
      .single(),
    'Unable to create assessment assignment.',
  ) as TrainingAssignmentRow | null

  const assignment = expectSupabaseRow(inserted, 'Unable to create assessment assignment.')

  if (selectedQuestionIds.length) {
    await assertSupabaseResult(
      supabase
        .from('training_assessment_assignment_questions')
        .insert(
          selectedQuestionIds.map((questionId, index) => ({
            assignment_id: assignment.id,
            question_id: questionId,
            question_order: index,
          })),
        ),
      'Unable to save the selected assignment questions.',
    )
  }

  return assignment
}

export async function updateAssignment(
  sessionUser: BackendSessionUser,
  assignmentId: string,
  payload: UpdateAssignmentPayload,
) {
  const existing = await getOwnedAssignment(assignmentId, sessionUser)
  await createAssignmentValidationOnly(sessionUser, payload, existing.id)

  const supabase = createSupabaseAdminClient()
  await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .update({
        category_id: payload.categoryId,
        assessment_id: payload.assessmentId || null,
        batch_id: payload.batchId || null,
        trainee_id: payload.traineeId || null,
        due_at: payload.dueAt || null,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        assignment_mode: payload.assignmentMode,
        question_count:
          payload.assignmentMode === 'random_subset'
            ? payload.randomQuestionCount || null
            : (payload.questionIds || []).length || null,
        passing_score: payload.passingScore || existing.passing_score || 90,
        maximum_attempts: payload.maximumAttempts || null,
        time_limit_minutes: payload.timeLimitMinutes || null,
        shuffle_choices: payload.shuffleChoices ?? true,
        shuffle_questions: payload.shuffleQuestions ?? false,
      })
      .eq('id', assignmentId),
    'Unable to update assessment assignment.',
  )

  await assertSupabaseResult(
    supabase
      .from('training_assessment_assignment_questions')
      .delete()
      .eq('assignment_id', assignmentId),
    'Unable to reset the selected assignment questions.',
  )

  const selectedQuestionIds = unique((payload.questionIds || []).filter(Boolean))
  if (selectedQuestionIds.length) {
    await assertSupabaseResult(
      supabase
        .from('training_assessment_assignment_questions')
        .insert(
          selectedQuestionIds.map((questionId, index) => ({
            assignment_id: assignmentId,
            question_id: questionId,
            question_order: index,
          })),
        ),
      'Unable to save the updated assignment questions.',
    )
  }
}

async function createAssignmentValidationOnly(
  sessionUser: BackendSessionUser,
  payload: CreateAssignmentPayload,
  currentAssignmentId?: string,
) {
  const category = await getOwnedCategory(payload.categoryId, sessionUser)
  const { batchOptions, traineeOptions } = await getTrainerBatches(sessionUser)

  if (!payload.batchId && !payload.traineeId) {
    throw new AssessmentHttpError(400, 'Pick a batch or a trainee before saving the assignment.')
  }
  if (payload.batchId && payload.traineeId) {
    throw new AssessmentHttpError(400, 'Choose either a batch target or a trainee target, not both.')
  }
  if (payload.batchId && !batchOptions.some((batch) => batch.id === payload.batchId)) {
    throw new AssessmentHttpError(404, 'The selected batch is not available in your workspace.')
  }
  if (payload.traineeId && !traineeOptions.some((trainee) => trainee.id === payload.traineeId)) {
    throw new AssessmentHttpError(404, 'The selected trainee is not available in your workspace.')
  }

  const categoryQuestions = await loadQuestionsByCategoryIds([category.id])
  const poolIds = new Set(categoryQuestions.filter((question) => question.active_status).map((question) => question.id))
  const selectedQuestionIds = unique((payload.questionIds || []).filter(Boolean))

  if (payload.assignmentMode === 'selected_questions' && !selectedQuestionIds.length) {
    throw new AssessmentHttpError(400, 'Select at least one question for selected question mode.')
  }

  if (selectedQuestionIds.some((questionId) => !poolIds.has(questionId))) {
    throw new AssessmentHttpError(400, 'One or more selected questions do not belong to the chosen category.')
  }

  const randomPoolSize = selectedQuestionIds.length || poolIds.size
  if (payload.assignmentMode === 'random_subset') {
    const randomCount = payload.randomQuestionCount || 0
    if (!randomCount || randomCount < 1) {
      throw new AssessmentHttpError(400, 'Provide a valid random subset count.')
    }
    if (randomCount > randomPoolSize) {
      throw new AssessmentHttpError(400, 'Random subset count cannot exceed the available question pool.')
    }
  }

  if (!payload.title.trim()) {
    throw new AssessmentHttpError(400, 'Assignment title is required.')
  }

  const supabase = createSupabaseAdminClient()
  const duplicateCheck = await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .select('id')
      .eq('category_id', payload.categoryId)
      .eq('batch_id', payload.batchId || null)
      .eq('trainee_id', payload.traineeId || null)
      .eq('title', payload.title.trim())
      .eq('is_active', true),
    'Unable to validate duplicate assignments.',
  ) as Array<{ id: string }> | null

  if ((duplicateCheck || []).some((row) => row.id !== currentAssignmentId)) {
    throw new AssessmentHttpError(400, 'An active assignment with the same title already exists for this target.')
  }
}

export async function deleteAssignment(
  sessionUser: BackendSessionUser,
  assignmentId: string,
) {
  await getOwnedAssignment(assignmentId, sessionUser)
  const supabase = createSupabaseAdminClient()

  await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .update({ is_active: false })
      .eq('id', assignmentId),
    'Unable to deactivate the assignment.',
  )
}

function mapCategoryReportRows(rows: TrainingCategoryReportRow[], categoriesById: Map<string, CategoryRecord>) {
  return rows.map((report) => ({
    categoryId: report.category_id,
    categoryTitle: report.category_title,
    passingScore: report.passing_score,
    questionCount: categoriesById.get(report.category_id)?.questionCount || 0,
    assignmentCount: report.assignment_count || 0,
    assignedTraineeCount: report.assigned_trainee_count || 0,
    completedTraineeCount: report.completed_trainee_count || 0,
    attemptCount: report.attempt_count,
    passCount: report.pass_count,
    failCount: report.fail_count,
    averageScore: Number(report.average_score || 0),
    passRate: Number(report.pass_rate || 0),
    failRate: report.attempt_count
      ? Number((((report.fail_count || 0) / Math.max(report.attempt_count, 1)) * 100).toFixed(2))
      : 0,
    retakeRate: report.attempt_count
      ? Number((((report.retake_count || 0) / Math.max(report.attempt_count, 1)) * 100).toFixed(2))
      : 0,
    highestScore: Number(report.highest_score || 0),
    lowestScore: Number(report.lowest_score || 0),
    completionRate: Number(report.completion_rate || 0),
  }))
}

async function getAssignmentPoolQuestionRows(
  assignment: TrainingAssignmentRow,
  questionIds?: string[],
) {
  const supabase = createSupabaseAdminClient()
  const allCategoryQuestions = await loadQuestionsByCategoryIds([assignment.category_id])
  const assignmentQuestionRows = await loadAssignmentQuestionRows([assignment.id])
  const selectedPool = selectAssignmentQuestions(assignment, allCategoryQuestions, assignmentQuestionRows)
  const allowedIds = new Set(selectedPool.map((question) => question.id))

  if (!questionIds?.length) {
    return selectedPool
  }

  if (questionIds.some((questionId) => !allowedIds.has(questionId))) {
    throw new AssessmentHttpError(400, 'The submitted assessment included a question outside the assigned pool.')
  }

  const rows = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .select('*')
      .in('id', questionIds)
      .order('question_number', { ascending: true }),
    'Unable to load the submitted question set.',
  )) as TrainingQuestionRow[] | null) || [])

  const rowMap = new Map(rows.map((row) => [row.id, row]))
  return questionIds.map((questionId) => rowMap.get(questionId)).filter(notEmpty)
}

function buildSessionQuestionRecord(
  question: TrainingQuestionRow,
  shuffle: boolean,
) {
  const choices = shuffle ? shuffleChoices(question.options || []) : (question.options || [])

  return {
    id: question.id,
    questionNumber: question.question_number,
    questionText: question.question_text,
    questionType: question.question_type,
    difficulty: question.difficulty,
    choices,
  }
}

export async function getTraineeAssessmentDashboard(
  sessionUser: BackendSessionUser,
): Promise<TraineeDashboardResponse> {
  const supabase = createSupabaseAdminClient()
  const memberships = (((await assertSupabaseResult(
    supabase
      .from('batch_user')
      .select('batch_id,user_id')
      .eq('user_id', sessionUser.userId),
    'Unable to load trainee batch membership.',
  )) as BatchUserRow[] | null) || [])
  const batchIds = memberships.map((row) => row.batch_id)

  const directAssignments = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .select('*')
      .eq('is_active', true)
      .eq('trainee_id', sessionUser.userId)
      .order('assigned_at', { ascending: false }),
    'Unable to load direct assignments.',
  )) as TrainingAssignmentRow[] | null) || [])

  const batchAssignments = batchIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_assignments')
          .select('*')
          .eq('is_active', true)
          .in('batch_id', batchIds)
          .order('assigned_at', { ascending: false }),
        'Unable to load batch assignments.',
      )) as TrainingAssignmentRow[] | null) || [])
    : []

  const assignmentMap = new Map<string, TrainingAssignmentRow>()
  for (const assignment of [...directAssignments, ...batchAssignments]) {
    assignmentMap.set(assignment.id, assignment)
  }
  const assignments = Array.from(assignmentMap.values())
  const categoryIds = unique(assignments.map((assignment) => assignment.category_id))
  const assignmentIds = assignments.map((assignment) => assignment.id)

  const categories = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_categories')
          .select('*')
          .in('id', categoryIds),
        'Unable to load assigned categories.',
      )) as TrainingCategoryRow[] | null) || [])
    : []

  const activeCategories = categories.filter((category) => !category.is_archived && category.active_status)
  const activeCategoryIdSet = new Set(activeCategories.map((category) => category.id))
  const filteredAssignments = assignments.filter((assignment) => activeCategoryIdSet.has(assignment.category_id))
  const categoryMap = new Map(activeCategories.map((category) => [category.id, category]))

  const primaryAssessments = activeCategories.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessments')
          .select('*')
          .in('category_id', activeCategories.map((category) => category.id))
          .eq('is_primary', true),
        'Unable to load assessment shells.',
      )) as TrainingAssessmentRow[] | null) || [])
    : []

  const assessmentMap = new Map(primaryAssessments.map((assessment) => [assessment.category_id, assessment]))

  const questionRows = await loadQuestionsByCategoryIds(activeCategories.map((category) => category.id))
  const questionsByCategory = new Map<string, TrainingQuestionRow[]>()
  for (const question of questionRows) {
    const current = questionsByCategory.get(question.category_id) || []
    current.push(question)
    questionsByCategory.set(question.category_id, current)
  }

  const batchRows = batchIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('batch')
          .select('id,name,description,wave_number,created_by,is_active')
          .in('id', batchIds),
        'Unable to load trainee batch labels.',
      )) as BatchRow[] | null) || [])
    : []
  const batchMap = new Map(batchRows.map((batch) => [batch.id, {
    id: batch.id,
    name: batch.name,
    description: batch.description,
    waveNumber: batch.wave_number,
    traineeCount: 0,
  }]))

  const attemptFeedRows = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_attempt_feed')
      .select('*')
      .eq('trainee_id', sessionUser.userId)
      .order('submitted_at', { ascending: false }),
    'Unable to load assessment attempt history.',
  )) as TrainingAttemptFeedRow[] | null) || [])
  const attempts = attemptFeedRows.map(buildAttemptRecord)

  const coachingRows = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_coaching_notes')
      .select('*')
      .eq('trainee_id', sessionUser.userId)
      .order('created_at', { ascending: false }),
    'Unable to load coaching notes.',
  )) as TrainingCoachingRow[] | null) || [])

  const certificateRows = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_certificates')
      .select('*')
      .eq('trainee_id', sessionUser.userId)
      .order('earned_at', { ascending: false }),
    'Unable to load assessment certificates.',
  )) as TrainingCertificateRow[] | null) || [])

  const questionReportRows = activeCategories.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_question_report')
          .select('*')
          .in('category_id', activeCategories.map((category) => category.id)),
        'Unable to load question analytics.',
      )) as TrainingQuestionReportRow[] | null) || [])
    : []
  const questionReportMap = new Map(
    questionReportRows.map((row) => [
      row.question_id,
      {
        questionId: row.question_id,
        categoryId: row.category_id,
        categoryTitle: row.category_title || '',
        questionNumber: row.question_number || 0,
        questionText: row.question_text,
        questionType: row.question_type,
        difficulty: row.difficulty,
        answerCount: row.answer_count,
        correctCount: row.correct_count,
        incorrectCount: row.incorrect_count,
        missRate: Number(row.miss_rate || 0),
      } satisfies QuestionReportRecord,
    ]),
  )

  const categoriesForCertificates: CategoryRecord[] = activeCategories.map((category) => ({
    id: category.id,
    title: category.title,
    categoryName: category.title,
    description: category.description,
    passingScore: category.passing_score,
    createdBy: category.created_by,
    trainerId: category.created_by,
    activeStatus: category.active_status,
    isArchived: category.is_archived,
    createdAt: category.created_at,
    updatedAt: category.updated_at,
    questionCount: questionsByCategory.get(category.id)?.length || 0,
    assignmentCount: 0,
    activeAssignmentCount: 0,
    attemptCount: attempts.filter((attempt) => attempt.categoryId === category.id).length,
    passRate: 0,
    averageScore: 0,
    assessments: [],
  }))
  const categoriesById = new Map(categoriesForCertificates.map((category) => [category.id, category]))
  const assessmentsById = new Map<string, AssessmentRecord>()
  for (const category of categoriesForCertificates) {
    const assessment = assessmentMap.get(category.id)
    if (!assessment) {
      continue
    }
    assessmentsById.set(
      assessment.id,
      buildAssessmentRecord(
        assessment,
        (questionsByCategory.get(category.id) || []).map((question) =>
          buildQuestionRecord(question, category.title, questionReportMap.get(question.id) || null),
        ),
      ),
    )
  }

  const latestAttemptByAssignment = new Map<string, AttemptRecord>()
  for (const attempt of attempts) {
    if (attempt.assignmentId && !latestAttemptByAssignment.has(attempt.assignmentId)) {
      latestAttemptByAssignment.set(attempt.assignmentId, attempt)
    }
  }

  const attemptCountByAssignment = attempts.reduce((map, attempt) => {
    if (!attempt.assignmentId) {
      return map
    }
    map.set(attempt.assignmentId, (map.get(attempt.assignmentId) || 0) + 1)
    return map
  }, new Map<string, number>())

  const assignmentQuestionRows = await loadAssignmentQuestionRows(assignmentIds)
  const assignmentRecordsForCertificates = new Map<string, AssignmentRecord>()
  for (const assignment of filteredAssignments) {
    assignmentRecordsForCertificates.set(assignment.id, {
      id: assignment.id,
      categoryId: assignment.category_id,
      assignedBy: assignment.assigned_by,
      assignedAt: assignment.assigned_at,
      dueAt: assignment.due_at,
      isActive: assignment.is_active,
      categoryTitle: categoryMap.get(assignment.category_id)?.title || 'Assessment Category',
      categoryName: categoryMap.get(assignment.category_id)?.title || 'Assessment Category',
      assessmentTitle: assignment.title || categoryMap.get(assignment.category_id)?.title || 'Assessment',
      title: assignment.title || categoryMap.get(assignment.category_id)?.title || 'Assessment',
      targetLabel: assignment.batch_id ? formatBatchLabel(batchMap.get(assignment.batch_id) || null) : 'Direct Assignment',
      targetType: assignment.batch_id ? 'batch' : 'trainee',
    })
  }

  const certificates = certificateRows.map((certificate) =>
    buildCertificateRecord(certificate, categoriesById, assignmentRecordsForCertificates, assessmentsById),
  )
  const certificateByAssignment = new Map(certificates.map((certificate) => [certificate.assignmentId || '', certificate]))

  const availableAssessmentMap = new Map<string, { assignment: TrainingAssignmentRow; card: TraineeAssessmentCard }>()

  for (const assignment of filteredAssignments) {
    const category = categoryMap.get(assignment.category_id)
    if (!category) {
      continue
    }

    const selectedQuestions = selectAssignmentQuestions(
      assignment,
      questionsByCategory.get(category.id) || [],
      assignmentQuestionRows,
    )
    const latestAttempt = latestAttemptByAssignment.get(assignment.id)
    const attemptCount = attemptCountByAssignment.get(assignment.id) || 0
    const maximumAttempts = assignment.maximum_attempts
    const attemptsRemaining = maximumAttempts ? Math.max(maximumAttempts - attemptCount, 0) : null
    const isCompleted = latestAttempt?.status === 'pass'
    const canRetake = latestAttempt?.status === 'fail' && (maximumAttempts ? attemptCount < maximumAttempts : true)
    const canStart = !isCompleted && (!latestAttempt || canRetake || latestAttempt.status !== 'fail')
    const assessment = assessmentMap.get(category.id)
    const card: TraineeAssessmentCard = {
      assignmentId: assignment.id,
      assessmentId: assessment?.id || assignment.assessment_id || assignment.id,
      categoryId: category.id,
      categoryTitle: category.title,
      assignmentTitle: assignment.title || category.title,
      assessmentTitle: assignment.title || category.title,
      assessmentDescription: assignment.description || category.description,
      type: assessment?.type || 'multiple_choice',
      passingScore: assignment.passing_score || category.passing_score,
      targetDueAt: assignment.due_at,
      targetLabel: assignment.batch_id ? formatBatchLabel(batchMap.get(assignment.batch_id) || null) : 'Direct Assignment',
      questionCount: assignment.question_count || selectedQuestions.length,
      questionTypes: unique(selectedQuestions.map((question) => question.question_type)),
      latestAttempt,
      attemptCount,
      attemptsRemaining,
      canStart,
      canRetake,
      isCompleted: !!isCompleted,
      maximumAttempts,
      timeLimitMinutes: assignment.time_limit_minutes,
      certificate: certificateByAssignment.get(assignment.id),
      questions: [],
    }

    const existing = availableAssessmentMap.get(card.assignmentId)
    if (!existing || shouldReplaceAvailableAssessment(existing.assignment, assignment)) {
      availableAssessmentMap.set(card.assignmentId, { assignment, card })
    }
  }

  const availableAssessments = Array.from(availableAssessmentMap.values()).map((entry) => entry.card)
  const coachingNotes: CoachingNoteRecord[] = coachingRows
    .filter((note) => note.visibility === 'shared')
    .map((note) => ({
      id: note.id,
      attemptId: note.attempt_id,
      trainerId: note.trainer_id,
      traineeId: note.trainee_id,
      note: note.note,
      actionItems: note.action_items,
      visibility: note.visibility,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    }))

  const averageScore = attempts.length
    ? Number((attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length).toFixed(2))
    : 0

  return {
    availableAssessments,
    attempts,
    coachingNotes,
    certificates,
    stats: {
      assignedCount: availableAssessments.length,
      completedCount: attempts.length,
      passedCount: attempts.filter((attempt) => attempt.status === 'pass').length,
      averageScore,
      retakeCount: availableAssessments.filter((assessment) => assessment.canRetake).length,
      certificateCount: certificates.length,
    },
  }
}

export async function getTraineeAssessmentSession(
  sessionUser: BackendSessionUser,
  assignmentId: string,
): Promise<TraineeAssessmentSession> {
  const assignment = await getAccessibleTraineeAssignment(assignmentId, sessionUser)
  const supabase = createSupabaseAdminClient()
  const category = await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .select('*')
      .eq('id', assignment.category_id)
      .maybeSingle(),
    'Unable to load the linked category.',
  ) as TrainingCategoryRow | null

  if (!category || category.is_archived || !category.active_status) {
    throw new AssessmentHttpError(404, 'This assessment category is no longer available.')
  }

  const primaryAssessment = await ensurePrimaryAssessment(category.id, category)
  const attempts = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_attempt_feed')
      .select('*')
      .eq('assignment_id', assignment.id)
      .eq('trainee_id', sessionUser.userId)
      .order('submitted_at', { ascending: false }),
    'Unable to load previous attempts for this assignment.',
  )) as TrainingAttemptFeedRow[] | null) || []).map(buildAttemptRecord)

  const latestAttempt = attempts[0]
  const attemptCount = attempts.length
  const maximumAttempts = assignment.maximum_attempts
  const attemptsRemaining = maximumAttempts ? Math.max(maximumAttempts - attemptCount, 0) : null
  const isCompleted = latestAttempt?.status === 'pass'
  const canRetake = latestAttempt?.status === 'fail' && (maximumAttempts ? attemptCount < maximumAttempts : true)

  if (latestAttempt?.status === 'pass') {
    // Keep the session accessible for review, but return no new runnable state.
  } else if (maximumAttempts && attemptCount >= maximumAttempts && latestAttempt?.status === 'fail') {
    // Reached the configured cap.
  }

  const certificateRow = await assertSupabaseResult(
    supabase
      .from('training_assessment_certificates')
      .select('*')
      .eq('trainee_id', sessionUser.userId)
      .eq('category_id', category.id)
      .maybeSingle(),
    'Unable to load certificate state.',
  ) as TrainingCertificateRow | null

  const batchTarget = assignment.batch_id
    ? (await assertSupabaseResult(
        supabase
          .from('batch')
          .select('id,name,description,wave_number,created_by,is_active')
          .eq('id', assignment.batch_id)
          .maybeSingle(),
        'Unable to load the batch label for this assignment.',
      )) as BatchRow | null
    : null

  const questionRows = await getAssignmentPoolQuestionRows(assignment, undefined)
  const orderedQuestions = questionRows.map((question) =>
    buildSessionQuestionRecord(question, normalizeBoolean(assignment.shuffle_choices, true)),
  )

  return {
    assignmentId: assignment.id,
    assessmentId: primaryAssessment.id,
    categoryId: category.id,
    categoryTitle: category.title,
    assignmentTitle: assignment.title || category.title,
    assessmentTitle: assignment.title || category.title,
    description: assignment.description || category.description,
    passingScore: assignment.passing_score || category.passing_score,
    targetDueAt: assignment.due_at,
    targetLabel: assignment.batch_id
      ? formatBatchLabel(
          batchTarget
            ? {
                name: batchTarget.name,
                waveNumber: batchTarget.wave_number,
              }
            : null,
        )
      : 'Direct Assignment',
    questionCount: assignment.question_count || orderedQuestions.length,
    attemptCount,
    attemptsRemaining,
    maximumAttempts,
    timeLimitMinutes: assignment.time_limit_minutes,
    canRetake,
    isCompleted: !!isCompleted,
    latestAttempt,
    certificate: certificateRow
      ? buildCertificateRecord(
          certificateRow,
          new Map([[category.id, {
            id: category.id,
            title: category.title,
            categoryName: category.title,
            description: category.description,
            passingScore: category.passing_score,
            createdBy: category.created_by,
            trainerId: category.created_by,
            activeStatus: category.active_status,
            isArchived: category.is_archived,
            createdAt: category.created_at,
            updatedAt: category.updated_at,
            assignmentCount: 0,
            attemptCount: 0,
            passRate: 0,
            averageScore: 0,
            assessments: [],
          }]]),
          new Map([[assignment.id, {
            id: assignment.id,
            categoryId: assignment.category_id,
            assignedBy: assignment.assigned_by,
            assignedAt: assignment.assigned_at,
            dueAt: assignment.due_at,
            isActive: assignment.is_active,
            categoryTitle: category.title,
            categoryName: category.title,
            assessmentTitle: assignment.title || category.title,
            title: assignment.title || category.title,
            targetLabel: 'Direct Assignment',
            targetType: 'trainee',
          }]]),
          new Map([[primaryAssessment.id, buildAssessmentRecord(primaryAssessment, [])]]),
        )
      : undefined,
    questions: orderedQuestions,
  }
}

async function resolveAssignmentForSubmission(
  sessionUser: BackendSessionUser,
  payload: SubmitAssessmentPayload,
) {
  if (payload.assignmentId) {
    return getAccessibleTraineeAssignment(payload.assignmentId, sessionUser)
  }

  if (!payload.assessmentId) {
    throw new AssessmentHttpError(400, 'Assignment is required before submitting the assessment.')
  }

  const supabase = createSupabaseAdminClient()
  const assessment = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .select('*')
      .eq('id', payload.assessmentId)
      .maybeSingle(),
    'Unable to load the submitted assessment.',
  ) as TrainingAssessmentRow | null

  if (!assessment) {
    throw new AssessmentHttpError(404, 'Assessment shell not found.')
  }

  const memberships = (((await assertSupabaseResult(
    supabase
      .from('batch_user')
      .select('batch_id,user_id')
      .eq('user_id', sessionUser.userId),
    'Unable to verify trainee batch membership.',
  )) as BatchUserRow[] | null) || [])
  const batchIds = memberships.map((row) => row.batch_id)

  const assignments = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .select('*')
      .eq('category_id', assessment.category_id)
      .eq('is_active', true)
      .order('assigned_at', { ascending: false }),
    'Unable to load matching assignments.',
  )) as TrainingAssignmentRow[] | null) || [])

  const matched = assignments.find((assignment) =>
    (assignment.trainee_id === sessionUser.userId || (!!assignment.batch_id && batchIds.includes(assignment.batch_id)))
    && (assignment.assessment_id ? assignment.assessment_id === assessment.id : true),
  )

  if (!matched) {
    throw new AssessmentHttpError(403, 'This assessment is not assigned to your trainee account.')
  }

  return matched
}

export async function submitAssessmentAttempt(
  sessionUser: BackendSessionUser,
  payload: SubmitAssessmentPayload,
): Promise<SubmitAssessmentResponse> {
  const assignment = await resolveAssignmentForSubmission(sessionUser, payload)
  const supabase = createSupabaseAdminClient()
  const category = await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .select('*')
      .eq('id', assignment.category_id)
      .maybeSingle(),
    'Unable to load the linked category.',
  ) as TrainingCategoryRow | null

  if (!category || category.is_archived || !category.active_status) {
    throw new AssessmentHttpError(404, 'Assessment category is no longer available.')
  }

  const primaryAssessment = await ensurePrimaryAssessment(category.id, category)
  const priorAttempts = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_attempt_feed')
      .select('*')
      .eq('assignment_id', assignment.id)
      .eq('trainee_id', sessionUser.userId)
      .order('submitted_at', { ascending: false }),
    'Unable to load previous attempts.',
  )) as TrainingAttemptFeedRow[] | null) || []).map(buildAttemptRecord)

  const latestAttempt = priorAttempts[0]
  if (latestAttempt?.status === 'pass') {
    throw new AssessmentHttpError(400, 'This assessment has already been completed successfully.')
  }

  if (assignment.maximum_attempts && priorAttempts.length >= assignment.maximum_attempts) {
    throw new AssessmentHttpError(400, 'Maximum attempts reached for this assessment.')
  }

  const questionRows = await getAssignmentPoolQuestionRows(assignment, payload.questionIds)
  if (!questionRows.length) {
    throw new AssessmentHttpError(400, 'This assessment does not have any active questions right now.')
  }

  const questionRecords = questionRows.map((question) => buildQuestionRecord(question, category.title))
  const choiceMap = payload.choiceMap || {}
  const scoring = scoreAssessmentSubmission(questionRecords, payload.answers, choiceMap)
  const passingScore = assignment.passing_score || category.passing_score
  const attemptNo = priorAttempts.length + 1
  const status: 'pass' | 'fail' = scoring.score >= passingScore ? 'pass' : 'fail'

  const rulesAnalysis = buildAttemptAnalysisSummary({
    categoryId: category.id,
    categoryTitle: category.title,
    score: scoring.score,
    questionResults: scoring.questionResults,
  })
  const analysis = await buildAiNarrativeSummary(
    category.title,
    passingScore,
    scoring.score,
    scoring.questionResults,
    rulesAnalysis,
  )

  const questionSnapshot = questionRows.map((question) => ({
    questionId: question.id,
    questionNumber: question.question_number,
    questionText: question.question_text,
    difficulty: question.difficulty,
    options: choiceMap[question.id] || question.options || [],
  }))

  const insertedAttempt = await assertSupabaseResult(
    supabase
      .from('training_assessment_attempts')
      .insert({
        assignment_id: assignment.id,
        assessment_id: primaryAssessment.id,
        category_id: category.id,
        trainee_id: sessionUser.userId,
        batch_id: assignment.batch_id || null,
        attempt_no: attemptNo,
        answers: payload.answers,
        question_results: scoring.questionResults,
        question_snapshot: questionSnapshot,
        choice_snapshot: choiceMap,
        analysis_summary: analysis,
        category_breakdown: analysis.categoryBreakdown,
        total_questions: scoring.totalQuestions,
        correct_answers: scoring.correctAnswers,
        incorrect_answers: scoring.incorrectAnswers,
        score: scoring.score,
        passing_score: passingScore,
        status,
        feedback: derivePassFeedback(scoring.score, passingScore),
        assignment_title: assignment.title || category.title,
        time_spent_seconds: payload.timeSpentSeconds || 0,
        started_at: payload.startedAt || new Date().toISOString(),
        completed_at: new Date().toISOString(),
        certificate_status: status === 'pass' ? 'issued' : 'not_issued',
      })
      .select('*')
      .single(),
    'Unable to save the assessment attempt.',
  ) as TrainingAttemptRow | null

  const savedAttempt = expectSupabaseRow(insertedAttempt, 'Unable to save the assessment attempt.')

  let certificate: CertificateRecord | null = null
  if (status === 'pass') {
    const existingCertificate = await assertSupabaseResult(
      supabase
        .from('training_assessment_certificates')
        .select('*')
        .eq('trainee_id', sessionUser.userId)
        .eq('category_id', category.id)
        .maybeSingle(),
      'Unable to verify the certificate state.',
    ) as TrainingCertificateRow | null

    let certificateRow: TrainingCertificateRow | null = existingCertificate
    if (certificateRow) {
      certificateRow = await assertSupabaseResult(
        supabase
          .from('training_assessment_certificates')
          .update({
            assignment_id: assignment.id,
            assignment_title: assignment.title || category.title,
            assessment_id: primaryAssessment.id,
            attempt_id: savedAttempt.id,
            certificate_status: 'issued',
          })
          .eq('id', certificateRow.id)
          .select('*')
          .single(),
        'Unable to refresh the existing certificate.',
      ) as TrainingCertificateRow | null
    } else {
      certificateRow = await assertSupabaseResult(
        supabase
          .from('training_assessment_certificates')
          .insert({
            trainee_id: sessionUser.userId,
            category_id: category.id,
            assignment_id: assignment.id,
            assignment_title: assignment.title || category.title,
            assessment_id: primaryAssessment.id,
            attempt_id: savedAttempt.id,
            certificate_code: createCertificateCode(),
            certificate_status: 'issued',
          })
          .select('*')
          .single(),
        'Unable to issue the assessment certificate.',
      ) as TrainingCertificateRow | null
    }

    if (certificateRow) {
      await assertSupabaseResult(
        supabase
          .from('training_assessment_attempts')
          .update({
            certificate_status: 'issued',
          })
          .eq('id', savedAttempt.id),
        'Unable to link the attempt to the generated certificate.',
      )

      certificate = buildCertificateRecord(
        certificateRow,
        new Map([[category.id, {
          id: category.id,
          title: category.title,
          categoryName: category.title,
          description: category.description,
          passingScore: category.passing_score,
          createdBy: category.created_by,
          trainerId: category.created_by,
          activeStatus: category.active_status,
          isArchived: category.is_archived,
          createdAt: category.created_at,
          updatedAt: category.updated_at,
          assignmentCount: 0,
          attemptCount: 0,
          passRate: 0,
          averageScore: 0,
          assessments: [],
        }]]),
        new Map([[assignment.id, {
          id: assignment.id,
          categoryId: assignment.category_id,
          assignedBy: assignment.assigned_by,
          assignedAt: assignment.assigned_at,
          dueAt: assignment.due_at,
          isActive: assignment.is_active,
          categoryTitle: category.title,
          categoryName: category.title,
          assessmentTitle: assignment.title || category.title,
          title: assignment.title || category.title,
          targetLabel: assignment.batch_id || assignment.trainee_id || 'Assignment',
          targetType: assignment.batch_id ? 'batch' : 'trainee',
        }]]),
        new Map([[primaryAssessment.id, buildAssessmentRecord(primaryAssessment, [])]]),
      )
    }
  }

  const savedFeed = await assertSupabaseResult(
    supabase
      .from('training_assessment_attempt_feed')
      .select('*')
      .eq('id', savedAttempt.id)
      .maybeSingle(),
    'Unable to reload the saved attempt.',
  ) as TrainingAttemptFeedRow | null

  const attempt = savedFeed
    ? buildAttemptRecord(savedFeed)
    : {
        id: savedAttempt.id,
        assignmentId: assignment.id,
        assessmentId: primaryAssessment.id,
        categoryId: category.id,
        assignmentTitle: assignment.title || category.title,
        assessmentTitle: assignment.title || category.title,
        categoryTitle: category.title,
        traineeId: sessionUser.userId,
        traineeName: sessionUser.userName,
        attemptNo,
        score: scoring.score,
        passingScore,
        status,
        submittedAt: savedAttempt.submitted_at,
        completedAt: savedAttempt.completed_at || savedAttempt.submitted_at,
        timeSpentSeconds: payload.timeSpentSeconds || 0,
        correctAnswers: scoring.correctAnswers,
        incorrectAnswers: scoring.incorrectAnswers,
        totalQuestions: scoring.totalQuestions,
        certificateId: certificate?.id || null,
        certificateCode: certificate?.certificateCode || null,
        certificateStatus: certificate ? ('issued' as const) : ('not_issued' as const),
        certificateUrl: certificate?.certificateUrl || null,
        feedback: derivePassFeedback(scoring.score, passingScore),
        questionResults: scoring.questionResults,
        analysis,
      }

  return {
    attempt,
    certificate,
  }
}

export async function coachAssessmentAttempt(
  sessionUser: BackendSessionUser,
  payload: CoachAttemptPayload,
) {
  const supabase = createSupabaseAdminClient()
  const attempt = await assertSupabaseResult(
    supabase
      .from('training_assessment_attempt_feed')
      .select('*')
      .eq('id', payload.attemptId)
      .maybeSingle(),
    'Unable to load the selected attempt.',
  ) as TrainingAttemptFeedRow | null

  if (!attempt) {
    throw new AssessmentHttpError(404, 'Assessment attempt not found.')
  }

  await getOwnedCategory(attempt.category_id, sessionUser)

  await assertSupabaseResult(
    supabase
      .from('training_assessment_attempts')
      .update({
        feedback: payload.feedback.trim(),
        trainer_note: payload.trainerNote?.trim() || null,
      })
      .eq('id', payload.attemptId),
    'Unable to update the attempt feedback.',
  )

  const inserted = await assertSupabaseResult(
    supabase
      .from('training_assessment_coaching_notes')
      .insert({
        attempt_id: payload.attemptId,
        trainer_id: sessionUser.userId,
        trainee_id: attempt.trainee_id,
        note: payload.feedback.trim(),
        action_items: payload.actionItems?.trim() || null,
        visibility: payload.visibility || 'shared',
      })
      .select('*')
      .single(),
    'Unable to save the coaching note.',
  ) as TrainingCoachingRow | null

  const note = expectSupabaseRow(inserted, 'Unable to save the coaching note.')
  return {
    id: note.id,
    attemptId: note.attempt_id,
    trainerId: note.trainer_id,
    traineeId: note.trainee_id,
    note: note.note,
    actionItems: note.action_items,
    visibility: note.visibility,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  } satisfies CoachingNoteRecord
}

function buildWeakAreaSummary(questionReports: QuestionReportRecord[], categoryId: string) {
  return questionReports
    .filter((report) => report.categoryId === categoryId && report.answerCount > 0)
    .sort((left, right) => right.missRate - left.missRate)
    .slice(0, 3)
    .map((report) => `${report.questionText} (${report.missRate.toFixed(1)}% miss)`)
    .join(' | ')
}

export async function getTrainerAssessmentCsvExport(
  sessionUser: BackendSessionUser,
) {
  const workspace = await getTrainerAssessmentBootstrap(sessionUser)
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
          correct_answers: attempt.correctAnswers ?? attempt.questionResults.filter((result) => result.isCorrect).length,
          incorrect_answers: attempt.incorrectAnswers ?? attempt.questionResults.filter((result) => !result.isCorrect).length,
          total_questions: attempt.totalQuestions ?? attempt.questionResults.length,
          strengths: (attempt.analysis?.strengths || []).join(' | '),
          improvements: (attempt.analysis?.improvements || []).join(' | '),
          recommendations: (attempt.analysis?.recommendations || []).join(' | '),
          weak_area_summary: buildWeakAreaSummary(workspace.reports.questions, attempt.categoryId),
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
        weak_area_summary: buildWeakAreaSummary(workspace.reports.questions, report.categoryId),
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

export { isAssessmentServiceUnavailableError }
