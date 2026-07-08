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
  CreateAssessmentPayload,
  CreateAssignmentPayload,
  CreateCategoryPayload,
  CreateQuestionPayload,
  QuestionReportRecord,
  SubmitAssessmentPayload,
  SubmitAssessmentResponse,
  TraineeReportRecord,
  TraineeAssessmentCard,
  TraineeAssessmentSession,
  TraineeDashboardResponse,
  TrainerReportRecord,
  TrainerBootstrapResponse,
  TraineeOption,
  UpdateAssessmentPayload,
  UpdateAssignmentPayload,
  UpdateCategoryPayload,
  UpdateQuestionPayload,
  WaveOption,
  WaveReportRecord,
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
  target_scope?: 'batch' | 'wave' | 'trainee' | null
  batch_id?: string | null
  wave_number?: number | null
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

type TargetMembershipContext = {
  batchMap: Map<string, BatchOption>
  batchMembershipRows: BatchUserRow[]
  traineeMap?: Map<string, TraineeOption>
  categoriesById?: Map<string, Pick<CategoryRecord, 'createdBy' | 'title'>>
}

const QUESTION_TEMPLATE_HEADER = [
  'Question Number',
  'Assessment Title',
  'Category',
  'Question',
  'Choice 1',
  'Choice 2',
  'Choice 3',
  'Choice 4',
  'Correct Answer',
  'Difficulty Level',
  'Points',
  'Explanation',
]

const REQUIRED_QUESTION_TEMPLATE_COLUMNS = QUESTION_TEMPLATE_HEADER.filter((column) => column !== 'Explanation')
const CSV_COLUMN_ALIASES: Record<string, string[]> = {
  'Question Number': ['Question Number', 'Question No', 'QuestionNo'],
  'Assessment Title': ['Assessment Title', 'Assessment', 'Assessment Name'],
  Category: ['Category', 'Category Name'],
  Question: ['Question', 'Question Text', 'Question Prompt'],
  'Choice 1': ['Choice 1', 'Choice1', 'Option 1', 'Option1', 'Option A', 'Choice A'],
  'Choice 2': ['Choice 2', 'Choice2', 'Option 2', 'Option2', 'Option B', 'Choice B'],
  'Choice 3': ['Choice 3', 'Choice3', 'Option 3', 'Option3', 'Option C', 'Choice C'],
  'Choice 4': ['Choice 4', 'Choice4', 'Option 4', 'Option4', 'Option D', 'Choice D'],
  'Correct Answer': ['Correct Answer', 'CorrectAnswer', 'Answer Key', 'Answer'],
  'Difficulty Level': ['Difficulty Level', 'Difficulty', 'DifficultyLevel'],
  Points: ['Points', 'Point Value', 'PointValue'],
  Explanation: ['Explanation', 'Rationale', 'Notes'],
}

const DEFAULT_ASSESSMENT_PASSING_SCORE = 90

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

function notEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function normalizeCsvColumnName(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function buildCanonicalCsvColumnIndex(header: string[]) {
  const normalizedHeader = header.map((column) => normalizeCsvColumnName(column.trim()))
  const index = new Map<string, number>()

  for (const canonicalColumn of QUESTION_TEMPLATE_HEADER) {
    const aliases = (CSV_COLUMN_ALIASES[canonicalColumn] || [canonicalColumn]).map(normalizeCsvColumnName)
    const matchingIndex = normalizedHeader.findIndex((columnName) => aliases.includes(columnName))
    if (matchingIndex >= 0) {
      index.set(canonicalColumn, matchingIndex)
    }
  }

  return index
}

function sanitizeChoiceValues(options: string[]) {
  return options.map((option) => option.trim())
}

function sanitizeTextValue(value: string) {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function getQuestionPointValue(metadata?: Record<string, unknown> | null) {
  const rawValue = metadata?.points
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function validateMultipleChoicePayload(
  options: string[],
  correctAnswer: string,
) {
  const sanitizedChoices = sanitizeChoiceValues(options)
  if (sanitizedChoices.length !== 4 || sanitizedChoices.some((choice) => !choice)) {
    throw new AssessmentHttpError(400, 'Exactly four answer choices are required for each multiple-choice question.')
  }

  const normalizedChoiceSet = new Set(sanitizedChoices.map((choice) => normalizeAssessmentAnswer(choice)))
  if (normalizedChoiceSet.size !== sanitizedChoices.length) {
    throw new AssessmentHttpError(400, 'Each answer choice must be unique.')
  }

  const normalizedCorrectAnswer = normalizeAssessmentAnswer(correctAnswer)
  const answerKeyMatch = normalizedCorrectAnswer.match(/^(a|b|c|d|choice\s*[1-4])$/i)

  let matchedChoice = sanitizedChoices.find(
    (choice) => normalizeAssessmentAnswer(choice) === normalizedCorrectAnswer,
  )

  if (!matchedChoice && answerKeyMatch) {
    const normalizedKey = answerKeyMatch[1].replace(/\s+/g, '')
    const answerIndex = normalizedKey.startsWith('choice')
      ? Number(normalizedKey.replace('choice', '')) - 1
      : normalizedKey.toUpperCase().charCodeAt(0) - 65
    matchedChoice = sanitizedChoices[answerIndex]
  }

  if (!matchedChoice) {
    throw new AssessmentHttpError(400, 'Correct answer must be A, B, C, D, Choice 1-4, or exactly match one of the four answer choices.')
  }

  return {
    choices: sanitizedChoices,
    correctAnswer: matchedChoice,
  }
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
  assessmentTitle?: string | null,
): AssessmentQuestionRecord {
  const choices = Array.isArray(question.options) ? question.options.filter((option) => typeof option === 'string') : []
  const answerCount = usageStats?.answerCount || 0
  const correctCount = usageStats?.correctCount || 0
  const incorrectCount = usageStats?.incorrectCount || 0
  const accuracyRate = answerCount > 0 ? Number(((correctCount / answerCount) * 100).toFixed(2)) : 0

  return {
    id: question.id,
    assessmentId: question.assessment_id,
    assessmentTitle: assessmentTitle || null,
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
    pointValue: getQuestionPointValue(question.metadata),
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
    earnedPoints: Number.isFinite(Number(rawAnalysis.earnedPoints))
      ? Number(rawAnalysis.earnedPoints)
      : fallback.earnedPoints,
    totalPoints: Number.isFinite(Number(rawAnalysis.totalPoints))
      ? Number(rawAnalysis.totalPoints)
      : fallback.totalPoints,
    categoryBreakdown,
  }
}

function buildAttemptRecord(attempt: TrainingAttemptFeedRow): AttemptRecord {
  const questionResults = Array.isArray(attempt.question_results) ? attempt.question_results : []
  const fallbackAnalysis = buildAttemptAnalysisSummary({
    categoryId: attempt.category_id,
    categoryTitle: attempt.category_title,
    score: Number(attempt.score || 0),
    passingScore: Number(attempt.passing_score || 90),
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
    createdBy: batch.created_by,
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
  const existingPrimary = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .select('*')
      .eq('category_id', categoryId)
      .eq('is_primary', true)
      .maybeSingle(),
    'Unable to load the category assessment shell.',
  ) as TrainingAssessmentRow | null

  if (existingPrimary) {
    return existingPrimary
  }

  const existingAssessments = (((await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .select('*')
      .eq('category_id', categoryId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    'Unable to load the category assessment shells.',
  )) as TrainingAssessmentRow[] | null) || [])

  if (existingAssessments.length) {
    const promotedAssessment = await assertSupabaseResult(
      supabase
        .from('training_assessments')
        .update({
          title: category.title,
          description: category.description || null,
          is_primary: true,
          active_status: true,
        })
        .eq('id', existingAssessments[0].id)
        .select('*')
        .single(),
      'Unable to restore the category assessment shell.',
    ) as TrainingAssessmentRow | null

    return expectSupabaseRow(promotedAssessment, 'Unable to restore the category assessment shell.')
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

async function getOwnedAssessment(assessmentId: string, sessionUser: BackendSessionUser) {
  const supabase = createSupabaseAdminClient()
  const assessment = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .select('*')
      .eq('id', assessmentId)
      .maybeSingle(),
    'Unable to load the selected assessment shell.',
  ) as TrainingAssessmentRow | null

  if (!assessment || assessment.active_status === false) {
    throw new AssessmentHttpError(404, 'Assessment definition not found.')
  }

  const category = await getOwnedCategory(assessment.category_id, sessionUser)
  return {
    assessment,
    category,
  }
}

async function loadAssessmentsByCategoryIds(categoryIds: string[]) {
  const supabase = createSupabaseAdminClient()
  if (!categoryIds.length) {
    return [] as TrainingAssessmentRow[]
  }

  return (((await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .select('*')
      .in('category_id', categoryIds)
      .neq('active_status', false)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    'Unable to load the assessment definitions.',
  )) as TrainingAssessmentRow[] | null) || [])
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
  const category = await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .select('id,title,created_by')
      .eq('id', assignment.category_id)
      .maybeSingle(),
    'Unable to verify the assignment category.',
  ) as Pick<TrainingCategoryRow, 'id' | 'title' | 'created_by'> | null
  const batchRows = batchIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('batch')
          .select('id,name,description,wave_number,created_by,is_active')
          .in('id', batchIds),
        'Unable to verify trainee batch access.',
      )) as BatchRow[] | null) || [])
    : []
  const batchMap = new Map(batchRows.map((batch) => [batch.id, {
    id: batch.id,
    name: batch.name,
    description: batch.description,
    waveNumber: batch.wave_number,
    traineeCount: 0,
    createdBy: batch.created_by,
  } satisfies BatchOption]))
  const hasAccess = getAssignmentTargetTraineeIds(assignment, {
    batchMap,
    batchMembershipRows: memberships,
    categoriesById: category
      ? new Map([[assignment.category_id, { createdBy: category.created_by, title: category.title }]])
      : new Map(),
  }).includes(sessionUser.userId)

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

function applyNullableFilter<T extends {
  eq: (column: string, value: string | number | boolean) => T
  is: (column: string, value: null) => T
}>(
  query: T,
  column: string,
  value: string | number | boolean | null | undefined,
) {
  return value === null || value === undefined
    ? query.is(column, null)
    : query.eq(column, value)
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
  const activeQuestions = allQuestions.filter((question) =>
    question.active_status
    && (!assignment.assessment_id || question.assessment_id === assignment.assessment_id),
  )
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

function getAssignmentTargetType(
  assignment: Pick<TrainingAssignmentRow, 'target_scope' | 'batch_id' | 'trainee_id' | 'wave_number'>,
) {
  if (assignment.target_scope === 'wave' || (!!assignment.wave_number && !assignment.batch_id && !assignment.trainee_id)) {
    return 'wave' as const
  }

  if (assignment.target_scope === 'trainee' || !!assignment.trainee_id) {
    return 'trainee' as const
  }

  return 'batch' as const
}

function buildWaveOptions(
  batchOptions: BatchOption[],
  batchMembershipRows: BatchUserRow[],
) {
  const waveMap = new Map<number, { batchIds: string[]; traineeIds: Set<string> }>()

  for (const batch of batchOptions) {
    if (batch.waveNumber === null || batch.waveNumber === undefined) {
      continue
    }

    const current = waveMap.get(batch.waveNumber) || {
      batchIds: [],
      traineeIds: new Set<string>(),
    }
    current.batchIds.push(batch.id)

    for (const membership of batchMembershipRows) {
      if (membership.batch_id === batch.id) {
        current.traineeIds.add(membership.user_id)
      }
    }

    waveMap.set(batch.waveNumber, current)
  }

  return Array.from(waveMap.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([waveNumber, value]) => ({
      waveNumber,
      label: `Wave ${waveNumber}`,
      batchCount: value.batchIds.length,
      traineeCount: value.traineeIds.size,
    })) satisfies WaveOption[]
}

function getAssignmentTargetBatchIds(
  assignment: TrainingAssignmentRow,
  context: TargetMembershipContext,
) {
  const targetType = getAssignmentTargetType(assignment)

  if (targetType === 'batch') {
    return assignment.batch_id ? [assignment.batch_id] : []
  }

  if (targetType === 'wave' && assignment.wave_number !== null && assignment.wave_number !== undefined) {
    const trainerId = context.categoriesById?.get(assignment.category_id)?.createdBy
    return Array.from(context.batchMap.values())
      .filter((batch) =>
        batch.waveNumber === assignment.wave_number
        && (!trainerId || !batch.createdBy || batch.createdBy === trainerId),
      )
      .map((batch) => batch.id)
  }

  if (targetType === 'trainee' && assignment.trainee_id) {
    const primaryBatchId = context.traineeMap?.get(assignment.trainee_id)?.batchIds?.[0]
    return primaryBatchId ? [primaryBatchId] : []
  }

  return []
}

function getAssignmentTargetTraineeIds(
  assignment: TrainingAssignmentRow,
  context: TargetMembershipContext,
) {
  if (assignment.trainee_id) {
    return [assignment.trainee_id]
  }

  const targetBatchIds = new Set(getAssignmentTargetBatchIds(assignment, context))
  return unique(
    context.batchMembershipRows
      .filter((membership) => targetBatchIds.has(membership.batch_id))
      .map((membership) => membership.user_id),
  )
}

function getAssignmentTargetLabel(
  assignment: Pick<TrainingAssignmentRow, 'batch_id' | 'trainee_id' | 'wave_number' | 'target_scope'>,
  context: TargetMembershipContext,
) {
  const targetType = getAssignmentTargetType(assignment)

  if (targetType === 'wave') {
    return assignment.wave_number ? `Wave ${assignment.wave_number}` : 'Wave Assignment'
  }

  if (targetType === 'batch') {
    return assignment.batch_id ? formatBatchLabel(context.batchMap.get(assignment.batch_id) || null) : 'Batch Assignment'
  }

  return context.traineeMap?.get(assignment.trainee_id || '')?.fullName || 'Trainee'
}

function getAssignmentActualBatchIdForTrainee(
  assignment: TrainingAssignmentRow,
  traineeId: string,
  context: TargetMembershipContext,
) {
  const targetType = getAssignmentTargetType(assignment)

  if (targetType === 'batch') {
    return assignment.batch_id || null
  }

  if (targetType === 'wave') {
    return (
      getAssignmentTargetBatchIds(assignment, context).find((batchId) =>
        context.batchMembershipRows.some((membership) => membership.batch_id === batchId && membership.user_id === traineeId),
      )
      || null
    )
  }

  const directBatchIds = context.traineeMap?.get(traineeId)?.batchIds || []
  return directBatchIds[0] || null
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

function buildTargetCounts(
  assignment: TrainingAssignmentRow,
  batchMap: Map<string, BatchOption>,
  traineeMap: Map<string, TraineeOption>,
  categoriesById: Map<string, Pick<CategoryRecord, 'createdBy' | 'title'>>,
  batchMembershipRows: BatchUserRow[],
): AssignmentTargetCounts {
  const context: TargetMembershipContext = {
    batchMap,
    traineeMap,
    categoriesById,
    batchMembershipRows,
  }
  const targetType = getAssignmentTargetType(assignment)

  if (targetType === 'trainee' && assignment.trainee_id) {
    return {
      assignedTrainees: 1,
      traineeName: traineeMap.get(assignment.trainee_id)?.fullName || null,
      batchName: getAssignmentTargetLabel(assignment, context),
    }
  }

  if (targetType === 'wave') {
    const targetBatchIds = new Set(getAssignmentTargetBatchIds(assignment, context))
    return {
      assignedTrainees: unique(
        batchMembershipRows
          .filter((row) => targetBatchIds.has(row.batch_id))
          .map((row) => row.user_id),
      ).length,
      waveNumber: assignment.wave_number || null,
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

function getAssignmentRecordTargetBatchIds(
  assignment: AssignmentRecord,
  context: {
    batchMap: Map<string, BatchOption>
    traineeMap: Map<string, TraineeOption>
    categoriesById: Map<string, Pick<CategoryRecord, 'createdBy' | 'title'>>
  },
) {
  if (assignment.targetType === 'batch') {
    return assignment.batchId ? [assignment.batchId] : []
  }

  if (assignment.targetType === 'wave' && assignment.waveNumber !== null && assignment.waveNumber !== undefined) {
    const trainerId = context.categoriesById.get(assignment.categoryId)?.createdBy
    return Array.from(context.batchMap.values())
      .filter((batch) =>
        batch.waveNumber === assignment.waveNumber
        && (!trainerId || !batch.createdBy || batch.createdBy === trainerId),
      )
      .map((batch) => batch.id)
  }

  if (assignment.targetType === 'trainee' && assignment.traineeId) {
    const primaryBatchId = context.traineeMap.get(assignment.traineeId)?.batchIds?.[0]
    return primaryBatchId ? [primaryBatchId] : []
  }

  return []
}

function getAssignmentRecordTargetTraineeIds(
  assignment: AssignmentRecord,
  context: {
    batchMap: Map<string, BatchOption>
    traineeMap: Map<string, TraineeOption>
    categoriesById: Map<string, Pick<CategoryRecord, 'createdBy' | 'title'>>
    batchMembershipRows: BatchUserRow[]
  },
) {
  if (assignment.targetType === 'trainee' && assignment.traineeId) {
    return [assignment.traineeId]
  }

  const targetBatchIds = new Set(getAssignmentRecordTargetBatchIds(assignment, context))
  return unique(
    context.batchMembershipRows
      .filter((membership) => targetBatchIds.has(membership.batch_id))
      .map((membership) => membership.user_id),
  )
}

function buildCategoryReportsFromData(
  categories: CategoryRecord[],
  assignments: AssignmentRecord[],
  attempts: AttemptRecord[],
  batchMap: Map<string, BatchOption>,
  traineeMap: Map<string, TraineeOption>,
  batchMembershipRows: BatchUserRow[],
) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const context = {
    batchMap,
    traineeMap,
    categoriesById,
    batchMembershipRows,
  }

  return categories.map((category) => {
    const categoryAssignments = assignments.filter((assignment) => assignment.categoryId === category.id && assignment.isActive)
    const assignedTraineeIds = unique(
      categoryAssignments.flatMap((assignment) => getAssignmentRecordTargetTraineeIds(assignment, context)),
    )
    const categoryAttempts = attempts.filter((attempt) => attempt.categoryId === category.id)
    const passCount = categoryAttempts.filter((attempt) => attempt.status === 'pass').length
    const failCount = categoryAttempts.filter((attempt) => attempt.status === 'fail').length
    const completedTrainees = unique(categoryAttempts.map((attempt) => attempt.traineeId))
    const averageScore = categoryAttempts.length
      ? Number((categoryAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / categoryAttempts.length).toFixed(2))
      : 0
    const highestScore = categoryAttempts.length ? Math.max(...categoryAttempts.map((attempt) => attempt.score)) : 0
    const lowestScore = categoryAttempts.length ? Math.min(...categoryAttempts.map((attempt) => attempt.score)) : 0
    const retakeCount = categoryAttempts.filter((attempt) => attempt.attemptNo > 1).length

    return {
      categoryId: category.id,
      categoryTitle: category.title,
      passingScore: category.passingScore,
      questionCount: category.questionCount || 0,
      assignmentCount: categoryAssignments.length,
      assignedTraineeCount: assignedTraineeIds.length,
      completedTraineeCount: completedTrainees.length,
      attemptCount: categoryAttempts.length,
      passCount,
      failCount,
      averageScore,
      passRate: categoryAttempts.length ? Number(((passCount / categoryAttempts.length) * 100).toFixed(2)) : 0,
      failRate: categoryAttempts.length ? Number(((failCount / categoryAttempts.length) * 100).toFixed(2)) : 0,
      retakeRate: categoryAttempts.length ? Number(((retakeCount / categoryAttempts.length) * 100).toFixed(2)) : 0,
      highestScore,
      lowestScore,
      completionRate: assignedTraineeIds.length
        ? Number(((completedTrainees.length / assignedTraineeIds.length) * 100).toFixed(2))
        : 0,
    } satisfies CategoryReportRecord
  })
}

function buildBatchReportsFromData(
  categories: CategoryRecord[],
  assignments: AssignmentRecord[],
  attempts: AttemptRecord[],
  batchOptions: BatchOption[],
  traineeMap: Map<string, TraineeOption>,
  batchMembershipRows: BatchUserRow[],
) {
  const batchMap = new Map(batchOptions.map((batch) => [batch.id, batch]))
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const context = {
    batchMap,
    traineeMap,
    categoriesById,
    batchMembershipRows,
  }
  const reports: BatchReportRecord[] = []

  for (const batch of batchOptions) {
    for (const category of categories) {
      const relevantAssignments = assignments.filter((assignment) =>
        assignment.categoryId === category.id
        && assignment.isActive
        && getAssignmentRecordTargetBatchIds(assignment, context).includes(batch.id),
      )
      const assignedTraineeIds = unique(
        relevantAssignments.flatMap((assignment) =>
          getAssignmentRecordTargetTraineeIds(assignment, context).filter((traineeId) =>
            batchMembershipRows.some((membership) => membership.batch_id === batch.id && membership.user_id === traineeId),
          ),
        ),
      )
      const batchAttempts = attempts.filter((attempt) => attempt.categoryId === category.id && attempt.batchId === batch.id)

      if (!relevantAssignments.length && !batchAttempts.length) {
        continue
      }

      const passCount = batchAttempts.filter((attempt) => attempt.status === 'pass').length
      const completedTrainees = unique(batchAttempts.map((attempt) => attempt.traineeId))
      const averageScore = batchAttempts.length
        ? Number((batchAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / batchAttempts.length).toFixed(2))
        : 0

      reports.push({
        batchId: batch.id,
        batchName: batch.name,
        waveNumber: batch.waveNumber,
        categoryId: category.id,
        categoryTitle: category.title,
        assignmentCount: relevantAssignments.length,
        assignedTraineeCount: assignedTraineeIds.length,
        completedTraineeCount: completedTrainees.length,
        attemptCount: batchAttempts.length,
        averageScore,
        passRate: batchAttempts.length ? Number(((passCount / batchAttempts.length) * 100).toFixed(2)) : 0,
        completionRate: assignedTraineeIds.length
          ? Number(((completedTrainees.length / assignedTraineeIds.length) * 100).toFixed(2))
          : 0,
        highestScore: batchAttempts.length ? Math.max(...batchAttempts.map((attempt) => attempt.score)) : 0,
        lowestScore: batchAttempts.length ? Math.min(...batchAttempts.map((attempt) => attempt.score)) : 0,
      })
    }
  }

  return reports
}

function buildWaveReportsFromData(
  categories: CategoryRecord[],
  assignments: AssignmentRecord[],
  attempts: AttemptRecord[],
  waves: WaveOption[],
  batchOptions: BatchOption[],
  traineeMap: Map<string, TraineeOption>,
  batchMembershipRows: BatchUserRow[],
) {
  const batchMap = new Map(batchOptions.map((batch) => [batch.id, batch]))
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const context = {
    batchMap,
    traineeMap,
    categoriesById,
    batchMembershipRows,
  }
  const reports: WaveReportRecord[] = []

  for (const wave of waves) {
    for (const category of categories) {
      const relevantBatchIds = new Set(
        batchOptions
          .filter((batch) => batch.waveNumber === wave.waveNumber && batch.createdBy === category.createdBy)
          .map((batch) => batch.id),
      )
      const relevantAssignments = assignments.filter((assignment) =>
        assignment.categoryId === category.id
        && assignment.isActive
        && getAssignmentRecordTargetBatchIds(assignment, context).some((batchId) => relevantBatchIds.has(batchId)),
      )
      const assignedTraineeIds = unique(
        relevantAssignments.flatMap((assignment) =>
          getAssignmentRecordTargetTraineeIds(assignment, context).filter((traineeId) =>
            batchMembershipRows.some((membership) => relevantBatchIds.has(membership.batch_id) && membership.user_id === traineeId),
          ),
        ),
      )
      const waveAttempts = attempts.filter((attempt) =>
        attempt.categoryId === category.id
        && !!attempt.batchId
        && relevantBatchIds.has(attempt.batchId),
      )

      if (!relevantAssignments.length && !waveAttempts.length) {
        continue
      }

      const passCount = waveAttempts.filter((attempt) => attempt.status === 'pass').length
      const completedTrainees = unique(waveAttempts.map((attempt) => attempt.traineeId))
      const averageScore = waveAttempts.length
        ? Number((waveAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / waveAttempts.length).toFixed(2))
        : 0

      reports.push({
        waveNumber: wave.waveNumber,
        categoryId: category.id,
        categoryTitle: category.title,
        assignmentCount: relevantAssignments.length,
        assignedTraineeCount: assignedTraineeIds.length,
        completedTraineeCount: completedTrainees.length,
        attemptCount: waveAttempts.length,
        averageScore,
        passRate: waveAttempts.length ? Number(((passCount / waveAttempts.length) * 100).toFixed(2)) : 0,
        completionRate: assignedTraineeIds.length
          ? Number(((completedTrainees.length / assignedTraineeIds.length) * 100).toFixed(2))
          : 0,
        highestScore: waveAttempts.length ? Math.max(...waveAttempts.map((attempt) => attempt.score)) : 0,
        lowestScore: waveAttempts.length ? Math.min(...waveAttempts.map((attempt) => attempt.score)) : 0,
      })
    }
  }

  return reports
}

function buildTraineeReportsFromData(
  attempts: AttemptRecord[],
  certificates: CertificateRecord[],
  traineeMap: Map<string, TraineeOption>,
  batchMap: Map<string, BatchOption>,
) {
  const groups = new Map<string, AttemptRecord[]>()

  for (const attempt of attempts) {
    const key = `${attempt.traineeId}:${attempt.categoryId}`
    const current = groups.get(key) || []
    current.push(attempt)
    groups.set(key, current)
  }

  return Array.from(groups.entries()).map(([key, groupedAttempts]) => {
    const [traineeId, categoryId] = key.split(':')
    const latestAttempt = [...groupedAttempts].sort((left, right) =>
      toSortableTimestamp(right.completedAt || right.submittedAt, 0) - toSortableTimestamp(left.completedAt || left.submittedAt, 0),
    )[0]
    const trainee = traineeMap.get(traineeId)
    const primaryBatchId = latestAttempt.batchId || trainee?.batchIds?.[0] || null
    const primaryBatch = primaryBatchId ? batchMap.get(primaryBatchId) : null
    const passCount = groupedAttempts.filter((attempt) => attempt.status === 'pass').length
    const failCount = groupedAttempts.filter((attempt) => attempt.status === 'fail').length
    const averageScore = Number((groupedAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / groupedAttempts.length).toFixed(2))

    return {
      traineeId,
      traineeName: latestAttempt.traineeName || trainee?.fullName || 'Trainee',
      traineeEmail: latestAttempt.traineeEmail || trainee?.email || '',
      batchId: primaryBatchId,
      batchName: latestAttempt.batchName || primaryBatch?.name || null,
      waveNumber: latestAttempt.waveNumber ?? primaryBatch?.waveNumber ?? null,
      categoryId,
      categoryTitle: latestAttempt.categoryTitle,
      attemptCount: groupedAttempts.length,
      passCount,
      failCount,
      averageScore,
      highestScore: Math.max(...groupedAttempts.map((attempt) => attempt.score)),
      lowestScore: Math.min(...groupedAttempts.map((attempt) => attempt.score)),
      lastAttemptAt: latestAttempt.completedAt || latestAttempt.submittedAt,
      certificateCount: certificates.filter((certificate) => certificate.traineeId === traineeId && certificate.categoryId === categoryId).length,
    } satisfies TraineeReportRecord
  })
}

function buildTrainerOwnerReports(
  categories: CategoryRecord[],
  assignments: AssignmentRecord[],
  attempts: AttemptRecord[],
  certificates: CertificateRecord[],
  trainerRows: UserRow[],
) {
  const trainerMap = new Map(trainerRows.map((trainer) => [trainer.id, trainer]))

  return unique(categories.map((category) => category.createdBy)).map((trainerId) => {
    const trainerCategories = categories.filter((category) => category.createdBy === trainerId)
    const trainerCategoryIds = new Set(trainerCategories.map((category) => category.id))
    const trainerAssignments = assignments.filter((assignment) => trainerCategoryIds.has(assignment.categoryId))
    const trainerAttempts = attempts.filter((attempt) => trainerCategoryIds.has(attempt.categoryId))
    const trainerCertificates = certificates.filter((certificate) => trainerCategoryIds.has(certificate.categoryId))
    const trainer = trainerMap.get(trainerId)
    const passCount = trainerAttempts.filter((attempt) => attempt.status === 'pass').length

    return {
      trainerId,
      trainerName: trainer?.full_name || 'Trainer',
      trainerEmail: trainer?.email || '',
      categoryCount: trainerCategories.length,
      assignmentCount: trainerAssignments.length,
      attemptCount: trainerAttempts.length,
      passRate: trainerAttempts.length ? Number(((passCount / trainerAttempts.length) * 100).toFixed(2)) : 0,
      averageScore: trainerAttempts.length
        ? Number((trainerAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / trainerAttempts.length).toFixed(2))
        : 0,
      certificateCount: trainerCertificates.length,
    } satisfies TrainerReportRecord
  })
}

export async function getAssessmentCsvTemplate() {
  const sampleRow = [
    '1',
    'Product Knowledge Readiness Check',
    'Product Knowledge',
    'Which statement best describes the product escalation path?',
    'Transfer to Tier 2 after validating the account details.',
    'End the call and ask the customer to email support.',
    'Skip verification if the customer sounds upset.',
    'Promise a refund immediately.',
    'A',
    'medium',
    '5',
    'Validate the account before escalating to protect customer data and route the issue correctly.',
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
  const assessments = await loadAssessmentsByCategoryIds(categoryIds)

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
  const assessmentRowMap = new Map(assessments.map((assessment) => [assessment.id, assessment]))
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
    buildQuestionRecord(
      question,
      categoryMap.get(question.category_id)?.title || null,
      questionReportMap.get(question.id) || null,
      assessmentRowMap.get(question.assessment_id)?.title || null,
    ),
  )

  const questionsByCategory = new Map<string, AssessmentQuestionRecord[]>()
  const questionsByAssessment = new Map<string, AssessmentQuestionRecord[]>()
  for (const question of questionRecords) {
    const current = questionsByCategory.get(question.categoryId || '') || []
    current.push(question)
    questionsByCategory.set(question.categoryId || '', current)

    const assessmentQuestions = questionsByAssessment.get(question.assessmentId) || []
    assessmentQuestions.push(question)
    questionsByAssessment.set(question.assessmentId, assessmentQuestions)
  }

  const assessmentsById = new Map<string, AssessmentRecord>()
  for (const assessment of assessments) {
    assessmentsById.set(
      assessment.id,
      buildAssessmentRecord(assessment, questionsByAssessment.get(assessment.id) || []),
    )
  }

  const assessmentsByCategory = new Map<string, AssessmentRecord[]>()
  for (const assessment of assessments) {
    const current = assessmentsByCategory.get(assessment.category_id) || []
    const record = assessmentsById.get(assessment.id)
    if (record) {
      current.push(record)
      assessmentsByCategory.set(assessment.category_id, current)
    }
  }

  const baseCategories: CategoryRecord[] = rawCategories.map((category) => {
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
      assignmentCount: 0,
      activeAssignmentCount: 0,
      attemptCount: 0,
      passRate: 0,
      averageScore: 0,
      completionRate: 0,
      retakeRate: 0,
      highestScore: 0,
      lowestScore: 0,
      assessments: assessmentsByCategory.get(category.id) || [],
    }
  })

  let categoriesById = new Map(baseCategories.map((category) => [category.id, category]))
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

  const assignmentTargetContext: TargetMembershipContext = {
    batchMap,
    traineeMap,
    categoriesById,
    batchMembershipRows,
  }

  const assignments: AssignmentRecord[] = assignmentRows.map((assignment) => {
    const category = categoriesById.get(assignment.category_id)
    const linkedAssessment = assignment.assessment_id ? assessmentsById.get(assignment.assessment_id) : null
    const targetCounts = buildTargetCounts(assignment, batchMap, traineeMap, categoriesById, batchMembershipRows)
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
        : linkedAssessment?.questions.length
          || questionsByCategory.get(assignment.category_id)?.length
          || 0)
    const targetType = getAssignmentTargetType(assignment)

    const statusLabel = targetCounts.assignedTrainees <= 0
      ? 'Assigned'
      : passedTrainees >= targetCounts.assignedTrainees
        ? 'Passed'
        : failedTrainees >= targetCounts.assignedTrainees
          ? 'Failed'
          : completedTrainees >= targetCounts.assignedTrainees
            ? 'Completed'
            : completedTrainees > 0
              ? 'In Progress'
              : 'Assigned'

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
      assessmentTitle: linkedAssessment?.title || category?.title || 'Assessment',
      title: assignment.title || `${category?.title || 'Assessment'} Assessment`,
      description: assignment.description,
      targetLabel: getAssignmentTargetLabel(assignment, assignmentTargetContext),
      targetType,
      waveNumber:
        assignment.wave_number
        ?? targetCounts.waveNumber
        ?? batchMap.get(assignment.batch_id || '')?.waveNumber
        ?? null,
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
  const waves = buildWaveOptions(batchOptions, batchMembershipRows)
  const categoryReports = buildCategoryReportsFromData(
    baseCategories,
    assignments,
    attempts,
    batchMap,
    traineeMap,
    batchMembershipRows,
  )
  const categoryReportMap = new Map(categoryReports.map((report) => [report.categoryId, report]))
  const categories = baseCategories.map((category) => {
    const report = categoryReportMap.get(category.id)
    return {
      ...category,
      assignmentCount: report?.assignmentCount || 0,
      activeAssignmentCount: assignments.filter((assignment) => assignment.categoryId === category.id && assignment.isActive).length,
      attemptCount: report?.attemptCount || 0,
      passRate: report?.passRate || 0,
      averageScore: report?.averageScore || 0,
      completionRate: report?.completionRate || 0,
      retakeRate: report?.retakeRate || 0,
      highestScore: report?.highestScore || 0,
      lowestScore: report?.lowestScore || 0,
    }
  })
  categoriesById = new Map(categories.map((category) => [category.id, category]))
  const batchReports = buildBatchReportsFromData(
    categories,
    assignments,
    attempts,
    batchOptions,
    traineeMap,
    batchMembershipRows,
  )
  const waveReports = buildWaveReportsFromData(
    categories,
    assignments,
    attempts,
    waves,
    batchOptions,
    traineeMap,
    batchMembershipRows,
  )
  const traineeReports = buildTraineeReportsFromData(attempts, certificates, traineeMap, batchMap)
  const trainerIds = unique(categories.map((category) => category.createdBy))
  const trainerRows = trainerIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('user')
          .select('id,email,full_name,role')
          .in('id', trainerIds),
        'Unable to load trainer reporting records.',
      )) as UserRow[] | null) || [])
    : []
  const trainerReports = buildTrainerOwnerReports(categories, assignments, attempts, certificates, trainerRows)

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
  const totalFailed = attempts.filter((attempt) => attempt.status === 'fail').length
  const retakeAttempts = attempts.filter((attempt) => attempt.attemptNo > 1).length

  return {
    categories,
    questions: questionRecords,
    batches: batchOptions,
    waves,
    trainees: traineeOptions,
    assignments,
    attempts,
    certificates,
    reports: {
      categories: categoryReports,
      batches: batchReports,
      waves: waveReports,
      trainees: traineeReports,
      trainers: trainerReports,
      questions: questionReports,
    },
    analytics: {
      totalQuestions: questionRecords.length,
      totalAssignments: assignments.length,
      activeAssignments: assignments.filter((assignment) => assignment.isActive).length,
      totalAttempts,
      passRate: totalAttempts ? Number(((totalPassed / totalAttempts) * 100).toFixed(2)) : 0,
      failRate: totalAttempts ? Number(((totalFailed / totalAttempts) * 100).toFixed(2)) : 0,
      retakeRate: totalAttempts ? Number(((retakeAttempts / totalAttempts) * 100).toFixed(2)) : 0,
      averageScore: totalAttempts
        ? Number((attempts.reduce((sum, attempt) => sum + attempt.score, 0) / totalAttempts).toFixed(2))
        : 0,
      highestScore: totalAttempts ? Math.max(...attempts.map((attempt) => attempt.score)) : 0,
      lowestScore: totalAttempts ? Math.min(...attempts.map((attempt) => attempt.score)) : 0,
      certificatesIssued: certificates.length,
    },
  }
}

export async function createCategory(
  sessionUser: BackendSessionUser,
  payload: CreateCategoryPayload,
) {
  const supabase = createSupabaseAdminClient()
  const normalizedTitle = payload.title.trim()
  const existing = await findTrainerCategoryByTitle(sessionUser, normalizedTitle)

  if (existing && existing.active_status && !existing.is_archived) {
    throw new AssessmentHttpError(400, 'An assessment category with this title already exists in your workspace.')
  }

  if (existing) {
    const reactivated = await assertSupabaseResult(
      supabase
        .from('training_assessment_categories')
        .update({
          title: normalizedTitle,
          description: payload.description?.trim() || null,
          passing_score: payload.passingScore,
          active_status: true,
          is_archived: false,
        })
        .eq('id', existing.id)
        .select('*')
        .single(),
      'Unable to reactivate the archived assessment category.',
    ) as TrainingCategoryRow | null

    const category = expectSupabaseRow(reactivated, 'Unable to reactivate the archived assessment category.')
    await ensurePrimaryAssessment(category.id, category)
    return category
  }

  const inserted = await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .insert({
        title: normalizedTitle,
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

export async function createAssessment(
  sessionUser: BackendSessionUser,
  payload: CreateAssessmentPayload,
) {
  const category = await getOwnedCategory(payload.categoryId, sessionUser)
  const supabase = createSupabaseAdminClient()
  const normalizedTitle = sanitizeTextValue(payload.title)
  const normalizedDescription = payload.description?.trim() ? sanitizeTextValue(payload.description) : null
  const existingAssessments = await loadAssessmentsByCategoryIds([category.id])
  const duplicate = existingAssessments.find((assessment) =>
    normalizeAssessmentAnswer(assessment.title) === normalizeAssessmentAnswer(normalizedTitle),
  )

  if (duplicate) {
    throw new AssessmentHttpError(400, 'An assessment with this title already exists in the selected category.')
  }

  const nextSortOrder = existingAssessments.length
    ? Math.max(...existingAssessments.map((assessment) => assessment.sort_order || 0)) + 1
    : 0

  const insertedAssessment = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .insert({
        category_id: category.id,
        title: normalizedTitle,
        description: normalizedDescription,
        type: payload.type,
        is_published: payload.isPublished ?? true,
        instant_feedback: true,
        sort_order: nextSortOrder,
        is_primary: false,
        active_status: true,
      })
      .select('*')
      .single(),
    'Unable to create the assessment definition.',
  ) as TrainingAssessmentRow | null

  return expectSupabaseRow(insertedAssessment, 'Unable to create the assessment definition.')
}

export async function updateAssessment(
  sessionUser: BackendSessionUser,
  assessmentId: string,
  payload: UpdateAssessmentPayload,
) {
  const { assessment, category } = await getOwnedAssessment(assessmentId, sessionUser)
  const supabase = createSupabaseAdminClient()
  const normalizedTitle = sanitizeTextValue(payload.title)
  const normalizedDescription = payload.description?.trim() ? sanitizeTextValue(payload.description) : null
  const siblingAssessments = await loadAssessmentsByCategoryIds([category.id])
  const duplicate = siblingAssessments.find((candidate) =>
    candidate.id !== assessmentId
    && normalizeAssessmentAnswer(candidate.title) === normalizeAssessmentAnswer(normalizedTitle),
  )

  if (duplicate) {
    throw new AssessmentHttpError(400, 'Another assessment in this category already uses that title.')
  }

  if (assessment.is_primary) {
    await assertSupabaseResult(
      supabase
        .from('training_assessment_categories')
        .update({
          title: normalizedTitle,
          description: normalizedDescription,
        })
        .eq('id', category.id),
      'Unable to sync the linked category metadata.',
    )
  }

  const updatedAssessment = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .update({
        title: normalizedTitle,
        description: normalizedDescription,
        type: payload.type,
        is_published: payload.isPublished,
        active_status: true,
      })
      .eq('id', assessmentId)
      .select('*')
      .single(),
    'Unable to update the assessment definition.',
  ) as TrainingAssessmentRow | null

  return expectSupabaseRow(updatedAssessment, 'Unable to update the assessment definition.')
}

export async function deleteAssessment(
  sessionUser: BackendSessionUser,
  assessmentId: string,
) {
  const { assessment, category } = await getOwnedAssessment(assessmentId, sessionUser)
  const supabase = createSupabaseAdminClient()
  const activeAssignments = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .select('id')
      .eq('assessment_id', assessmentId)
      .eq('is_active', true),
    'Unable to verify active assessment assignments.',
  )) as Array<{ id: string }> | null) || [])
  const attemptHistory = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_attempts')
      .select('id')
      .eq('assessment_id', assessmentId)
      .limit(1),
    'Unable to verify recorded assessment attempts.',
  )) as Array<{ id: string }> | null) || [])
  const categoryAssessments = await loadAssessmentsByCategoryIds([category.id])

  if (activeAssignments.length) {
    throw new AssessmentHttpError(400, 'Remove or deactivate assessment assignments before deleting this assessment.')
  }

  if (attemptHistory.length) {
    throw new AssessmentHttpError(400, 'This assessment already has recorded trainee attempts and can no longer be deleted.')
  }

  if (assessment.is_primary && categoryAssessments.length <= 1) {
    throw new AssessmentHttpError(400, 'Each category requires at least one assessment definition. Create another assessment first or archive the category instead.')
  }

  await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .delete()
      .eq('id', assessmentId),
    'Unable to delete the assessment definition.',
  )

  if (assessment.is_primary) {
    const remainingAssessments = await loadAssessmentsByCategoryIds([category.id])
    const fallbackAssessment = remainingAssessments.find((candidate) => candidate.id !== assessmentId)
    if (fallbackAssessment) {
      await assertSupabaseResult(
        supabase
          .from('training_assessments')
          .update({
            title: category.title,
            description: category.description || null,
            is_primary: true,
            active_status: true,
          })
          .eq('id', fallbackAssessment.id),
        'Unable to restore the primary assessment definition.',
      )
    }
  }
}

function questionTypeFromChoices(options: string[]) {
  return options.some((option) => option.trim().length > 0) ? 'multiple_choice' : 'fill_blank'
}

async function resolveQuestionCategoryAndAssessment(
  sessionUser: BackendSessionUser,
  payload: Pick<CreateQuestionPayload, 'assessmentId' | 'categoryId'>,
) {
  if (payload.assessmentId) {
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
    if (payload.categoryId && payload.categoryId !== category.id) {
      throw new AssessmentHttpError(400, 'The selected assessment does not belong to the selected category.')
    }

    return { category, assessment }
  }

  if (payload.categoryId) {
    const category = await getOwnedCategory(payload.categoryId, sessionUser)
    const assessment = await ensurePrimaryAssessment(category.id, category)
    return {
      category,
      assessment,
    }
  }

  throw new AssessmentHttpError(400, 'Category is required before creating a question.')
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

async function findTrainerCategoryByTitle(
  sessionUser: BackendSessionUser,
  title: string,
) {
  const supabase = createSupabaseAdminClient()
  const rows = ((await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .select('*')
      .eq('created_by', sessionUser.userId)
      .order('created_at', { ascending: true }),
    'Unable to verify the existing category title.',
  )) as TrainingCategoryRow[] | null) || []

  return rows.find((row) => normalizeAssessmentAnswer(row.title) === normalizeAssessmentAnswer(title)) || null
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
  const pointValue = Number(payload.points || 1)
  const validatedQuestion = questionType === 'multiple_choice'
    ? validateMultipleChoicePayload(payload.options, payload.correctAnswer)
    : {
        choices: [] as string[],
        correctAnswer: sanitizeTextValue(payload.correctAnswer),
      }

  const inserted = await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .insert({
        assessment_id: assessment.id,
        category_id: category.id,
        question_number: nextQuestionNumber,
        question_text: sanitizeTextValue(payload.questionText),
        question_type: questionType,
        options: questionType === 'multiple_choice'
          ? validatedQuestion.choices
          : [],
        correct_answer: validatedQuestion.correctAnswer,
        difficulty: payload.difficulty || null,
        explanation: payload.explanation?.trim() ? sanitizeTextValue(payload.explanation) : null,
        order_index: nextOrderIndex,
        active_status: true,
        created_by: sessionUser.userId,
        metadata: {
          points: Number.isFinite(pointValue) && pointValue > 0 ? pointValue : 1,
        },
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
  const pointValue = Number(payload.points || getQuestionPointValue(currentQuestion.metadata))
  const validatedQuestion = questionType === 'multiple_choice'
    ? validateMultipleChoicePayload(payload.options, payload.correctAnswer)
    : {
        choices: [] as string[],
        correctAnswer: sanitizeTextValue(payload.correctAnswer),
      }

  const updated = await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .update({
        assessment_id: assessment.id,
        category_id: category.id,
        question_number: payload.questionNumber || currentQuestion.question_number,
        question_text: sanitizeTextValue(payload.questionText),
        question_type: questionType,
        options: questionType === 'multiple_choice'
          ? validatedQuestion.choices
          : [],
        correct_answer: validatedQuestion.correctAnswer,
        difficulty: payload.difficulty || null,
        explanation: payload.explanation?.trim() ? sanitizeTextValue(payload.explanation) : null,
        order_index: payload.orderIndex,
        metadata: {
          ...(currentQuestion.metadata || {}),
          points: Number.isFinite(pointValue) && pointValue > 0 ? pointValue : 1,
        },
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

  const header = rows[0].map((value) => value.trim().replace(/^\uFEFF/, ''))
  const columnIndex = buildCanonicalCsvColumnIndex(header)
  const missingColumns = REQUIRED_QUESTION_TEMPLATE_COLUMNS.filter((column) => !columnIndex.has(column))
  if (missingColumns.length) {
    throw new AssessmentHttpError(
      400,
      `The CSV file is missing required columns: ${missingColumns.join(', ')}.`,
    )
  }

  const categoryRows = await getVisibleCategories(sessionUser)
  const categoryMap = new Map(categoryRows.map((category) => [normalizeAssessmentAnswer(category.title), category]))
  const assessmentRows = await loadAssessmentsByCategoryIds(categoryRows.map((category) => category.id))
  const assessmentMap = new Map(
    assessmentRows.map((assessment) => [
      `${assessment.category_id}::${normalizeAssessmentAnswer(assessment.title)}`,
      assessment,
    ]),
  )
  for (const category of categoryRows) {
    const primaryAssessment = await ensurePrimaryAssessment(category.id, category)
    assessmentMap.set(
      `${category.id}::${normalizeAssessmentAnswer(primaryAssessment.title)}`,
      primaryAssessment,
    )
  }
  const existingQuestions = await loadQuestionsByCategoryIds(categoryRows.map((category) => category.id))
  const existingQuestionNumbersByCategory = new Map<string, Set<number>>()
  const existingQuestionTextsByCategory = new Map<string, Set<string>>()

  for (const question of existingQuestions) {
    const questionNumberSet = existingQuestionNumbersByCategory.get(question.category_id) || new Set<number>()
    questionNumberSet.add(question.question_number)
    existingQuestionNumbersByCategory.set(question.category_id, questionNumberSet)

    const questionTextSet = existingQuestionTextsByCategory.get(question.category_id) || new Set<string>()
    questionTextSet.add(normalizeAssessmentAnswer(question.question_text))
    existingQuestionTextsByCategory.set(question.category_id, questionTextSet)
  }

  const errors: BulkUploadErrorRecord[] = []
  const importedQuestions: AssessmentQuestionRecord[] = []
  const createdCategories: string[] = []
  const pendingQuestionNumbersByCategory = new Map<string, Set<number>>()
  const pendingQuestionTextsByCategory = new Map<string, Set<string>>()
  const supabase = createSupabaseAdminClient()

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const getValue = (column: string) => {
      const index = columnIndex.get(column)
      return index === undefined ? '' : row[index]?.trim() || ''
    }
    const getOptionalValue = (column: string) => {
      const index = columnIndex.get(column)
      return index === undefined ? '' : row[index]?.trim() || ''
    }
    const assessmentTitle = getValue('Assessment Title')
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
    const difficulty = (getOptionalValue('Difficulty Level') || getOptionalValue('Difficulty')).toLowerCase() as 'easy' | 'medium' | 'hard' | ''
    const pointsValue = getValue('Points')
    const explanation = getOptionalValue('Explanation')
    const rowNumber = rowIndex + 1

    if (!assessmentTitle) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Assessment Title is required.',
      })
      continue
    }

    if (!categoryName) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Category is required.',
      })
      continue
    }

    const parsedQuestionNumber = Number(questionNumberValue)
    if (!Number.isInteger(parsedQuestionNumber) || parsedQuestionNumber < 1) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Question Number must be a positive whole number.',
      })
      continue
    }

    if (!questionText.trim()) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Question text is required.',
      })
      continue
    }

    const parsedPoints = Number(pointsValue)
    if (!Number.isFinite(parsedPoints) || parsedPoints <= 0) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Points must be a positive number.',
      })
      continue
    }

    let validatedChoices: ReturnType<typeof validateMultipleChoicePayload>
    try {
      validatedChoices = validateMultipleChoicePayload(choices, correctAnswer)
    } catch (error) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: error instanceof Error ? error.message : 'The multiple-choice row is invalid.',
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

    let category = categoryMap.get(normalizeAssessmentAnswer(categoryName))
    if (!category) {
      try {
        category = await createCategory(sessionUser, {
          title: categoryName,
          description: '',
          passingScore: DEFAULT_ASSESSMENT_PASSING_SCORE,
        })
        categoryMap.set(normalizeAssessmentAnswer(category.title), category)
        const primaryAssessment = await ensurePrimaryAssessment(category.id, category)
        assessmentMap.set(
          `${category.id}::${normalizeAssessmentAnswer(primaryAssessment.title)}`,
          primaryAssessment,
        )
        existingQuestionNumbersByCategory.set(category.id, new Set<number>())
        existingQuestionTextsByCategory.set(category.id, new Set<string>())
        pendingQuestionNumbersByCategory.set(category.id, new Set<number>())
        pendingQuestionTextsByCategory.set(category.id, new Set<string>())
        createdCategories.push(category.title)
      } catch (error) {
        errors.push({
          rowNumber,
          category: categoryName,
          questionNumber: questionNumberValue,
          question: questionText,
          error: error instanceof Error ? error.message : 'Unable to create the missing category.',
        })
        continue
      }
    }

    const existingQuestionNumbers = existingQuestionNumbersByCategory.get(category.id) || new Set<number>()
    const pendingQuestionNumbers = pendingQuestionNumbersByCategory.get(category.id) || new Set<number>()
    if (existingQuestionNumbers.has(parsedQuestionNumber) || pendingQuestionNumbers.has(parsedQuestionNumber)) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Question Number already exists for this category.',
      })
      continue
    }

    const normalizedQuestionText = normalizeAssessmentAnswer(questionText)
    const existingQuestionTexts = existingQuestionTextsByCategory.get(category.id) || new Set<string>()
    const pendingQuestionTexts = pendingQuestionTextsByCategory.get(category.id) || new Set<string>()
    if (existingQuestionTexts.has(normalizedQuestionText) || pendingQuestionTexts.has(normalizedQuestionText)) {
      errors.push({
        rowNumber,
        category: categoryName,
        questionNumber: questionNumberValue,
        question: questionText,
        error: 'Duplicate question text detected for this category.',
      })
      continue
    }

    const assessmentKey = `${category.id}::${normalizeAssessmentAnswer(assessmentTitle)}`
    let assessment = assessmentMap.get(assessmentKey)
    if (!assessment) {
      try {
        if (normalizeAssessmentAnswer(assessmentTitle) === normalizeAssessmentAnswer(category.title)) {
          assessment = await ensurePrimaryAssessment(category.id, category)
        } else {
          assessment = await createAssessment(sessionUser, {
            categoryId: category.id,
            title: assessmentTitle,
            description: category.description || undefined,
            type: 'multiple_choice',
            isPublished: true,
          })
        }
        assessmentMap.set(assessmentKey, assessment)
      } catch (error) {
        errors.push({
          rowNumber,
          category: categoryName,
          questionNumber: questionNumberValue,
          question: questionText,
          error: error instanceof Error ? error.message : 'Unable to create the missing assessment shell.',
        })
        continue
      }
    }

    try {
      const inserted = await assertSupabaseResult(
        supabase
          .from('training_assessment_questions')
          .insert({
            assessment_id: assessment.id,
            category_id: category.id,
            question_number: parsedQuestionNumber,
            question_text: sanitizeTextValue(questionText),
            question_type: 'multiple_choice',
            options: validatedChoices.choices,
            correct_answer: validatedChoices.correctAnswer,
            difficulty: difficulty || null,
            explanation: explanation ? sanitizeTextValue(explanation) : null,
            order_index: parsedQuestionNumber - 1,
            active_status: true,
            created_by: sessionUser.userId,
            metadata: {
              points: parsedPoints,
              imported_from_csv: true,
              assessment_title: assessment.title,
            },
          })
          .select('*')
          .single(),
        'Unable to import one of the uploaded questions.',
      ) as TrainingQuestionRow | null

      if (inserted) {
        importedQuestions.push(buildQuestionRecord(inserted, category.title, null, assessment.title))
        pendingQuestionNumbers.add(parsedQuestionNumber)
        pendingQuestionTexts.add(normalizedQuestionText)
        pendingQuestionNumbersByCategory.set(category.id, pendingQuestionNumbers)
        pendingQuestionTextsByCategory.set(category.id, pendingQuestionTexts)
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
    createdCategories,
    errorCsv: errors.length ? buildBulkUploadErrorCsv(errors) : null,
  }
}

function resolveAssignmentTargetFields(
  category: TrainingCategoryRow,
  batchOptions: BatchOption[],
  traineeOptions: TraineeOption[],
  payload: CreateAssignmentPayload,
) {
  const targetType = payload.targetType || (payload.traineeId ? 'trainee' : payload.waveNumber ? 'wave' : 'batch')
  const ownedBatchOptions = batchOptions.filter((batch) => !batch.createdBy || batch.createdBy === category.created_by)

  if (targetType === 'batch') {
    if (!payload.batchId) {
      throw new AssessmentHttpError(400, 'Pick a batch before saving the assignment.')
    }

    const selectedBatch = ownedBatchOptions.find((batch) => batch.id === payload.batchId)
    if (!selectedBatch) {
      throw new AssessmentHttpError(404, 'The selected batch is not available for this category owner.')
    }

    return {
      targetType,
      batchId: selectedBatch.id,
      waveNumber: selectedBatch.waveNumber || null,
      traineeId: null,
    }
  }

  if (targetType === 'wave') {
    if (!payload.waveNumber) {
      throw new AssessmentHttpError(400, 'Pick a wave before saving the assignment.')
    }

    const matchingWaveBatches = ownedBatchOptions.filter((batch) => batch.waveNumber === payload.waveNumber)
    if (!matchingWaveBatches.length) {
      throw new AssessmentHttpError(404, 'The selected wave is not available for this category owner.')
    }

    return {
      targetType,
      batchId: null,
      waveNumber: payload.waveNumber,
      traineeId: null,
    }
  }

  if (!payload.traineeId) {
    throw new AssessmentHttpError(400, 'Pick a trainee before saving the assignment.')
  }

  if (!traineeOptions.some((trainee) => trainee.id === payload.traineeId)) {
    throw new AssessmentHttpError(404, 'The selected trainee is not available in your workspace.')
  }

  return {
    targetType,
    batchId: null,
    waveNumber: null,
    traineeId: payload.traineeId,
  }
}

export async function createAssignment(
  sessionUser: BackendSessionUser,
  payload: CreateAssignmentPayload,
) {
  await createAssignmentValidationOnly(sessionUser, payload)
  const category = await getOwnedCategory(payload.categoryId, sessionUser)
  const supabase = createSupabaseAdminClient()
  const { batchOptions, traineeOptions } = await getTrainerBatches(sessionUser)
  const target = resolveAssignmentTargetFields(category, batchOptions, traineeOptions, payload)

  const selectedQuestionIds = unique((payload.questionIds || []).filter(Boolean))
  const categoryQuestions = await loadQuestionsByCategoryIds([category.id])
  const questionPool = categoryQuestions.filter((question) =>
    question.active_status
    && (!payload.assessmentId || question.assessment_id === payload.assessmentId),
  )
  const questionPoolIds = new Set(questionPool.map((question) => question.id))
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
        target_scope: target.targetType,
        batch_id: target.batchId,
        wave_number: target.waveNumber,
        trainee_id: target.traineeId,
        assigned_by: sessionUser.userId,
        due_at: payload.dueAt || null,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        assignment_mode: mode,
        question_count:
          mode === 'random_subset'
            ? payload.randomQuestionCount || null
            : selectedQuestionIds.length || questionPool.length,
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
  const category = await getOwnedCategory(payload.categoryId, sessionUser)
  const categoryQuestions = await loadQuestionsByCategoryIds([category.id])
  const scopedCategoryQuestions = categoryQuestions.filter((question) =>
    question.active_status
    && (!payload.assessmentId || question.assessment_id === payload.assessmentId),
  )
  const activeCategoryQuestionCount = scopedCategoryQuestions.length
  const selectedQuestionIds = unique((payload.questionIds || []).filter(Boolean))
  const assignmentMode = payload.assignmentMode || 'entire_category'
  const { batchOptions, traineeOptions } = await getTrainerBatches(sessionUser)
  const target = resolveAssignmentTargetFields(category, batchOptions, traineeOptions, payload)
  await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .update({
        category_id: payload.categoryId,
        assessment_id: payload.assessmentId || null,
        target_scope: target.targetType,
        batch_id: target.batchId,
        wave_number: target.waveNumber,
        trainee_id: target.traineeId,
        due_at: payload.dueAt || null,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        assignment_mode: assignmentMode,
        question_count:
          assignmentMode === 'random_subset'
            ? payload.randomQuestionCount || null
            : assignmentMode === 'selected_questions'
              ? selectedQuestionIds.length || null
              : activeCategoryQuestionCount,
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
  const target = resolveAssignmentTargetFields(category, batchOptions, traineeOptions, payload)

  const categoryQuestions = await loadQuestionsByCategoryIds([category.id])
  if (payload.assessmentId) {
    const { assessment } = await getOwnedAssessment(payload.assessmentId, sessionUser)
    if (assessment.category_id !== category.id) {
      throw new AssessmentHttpError(400, 'The selected assessment does not belong to the selected category.')
    }
  }

  const scopedCategoryQuestions = categoryQuestions.filter((question) =>
    question.active_status
    && (!payload.assessmentId || question.assessment_id === payload.assessmentId),
  )
  const poolIds = new Set(scopedCategoryQuestions.map((question) => question.id))
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
  let duplicateQuery = supabase
    .from('training_assessment_assignments')
    .select('id')
    .eq('category_id', payload.categoryId)
    .eq('target_scope', target.targetType)
    .eq('title', payload.title.trim())
    .eq('is_active', true)

  duplicateQuery = applyNullableFilter(duplicateQuery, 'assessment_id', payload.assessmentId || null)
  duplicateQuery = applyNullableFilter(duplicateQuery, 'batch_id', target.batchId)
  duplicateQuery = applyNullableFilter(duplicateQuery, 'wave_number', target.waveNumber)
  duplicateQuery = applyNullableFilter(duplicateQuery, 'trainee_id', target.traineeId)

  const duplicateCheck = await assertSupabaseResult(
    duplicateQuery,
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
    pointValue: getQuestionPointValue(question.metadata),
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
    createdBy: batch.created_by,
  } satisfies BatchOption]))

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
  const waveAssignments = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .select('*')
      .eq('is_active', true)
      .eq('target_scope', 'wave')
      .order('assigned_at', { ascending: false }),
    'Unable to load wave assignments.',
  )) as TrainingAssignmentRow[] | null) || [])

  const assignmentMap = new Map<string, TrainingAssignmentRow>()
  for (const assignment of [...directAssignments, ...batchAssignments, ...waveAssignments]) {
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
  const activeCategoryMap = new Map(activeCategories.map((category) => [category.id, category]))
  const filteredAssignments = assignments.filter((assignment) => {
    const category = activeCategoryMap.get(assignment.category_id)
    if (!category) {
      return false
    }

    if (assignment.trainee_id === sessionUser.userId) {
      return true
    }

    if (assignment.batch_id && batchIds.includes(assignment.batch_id)) {
      return true
    }

    return (
      getAssignmentTargetType(assignment) === 'wave'
      && batchRows.some((batch) =>
        batch.wave_number === assignment.wave_number
        && batch.created_by === category.created_by,
      )
    )
  })
  const categoryMap = new Map(activeCategories.map((category) => [category.id, category]))

  const activeAssessments = await loadAssessmentsByCategoryIds(activeCategories.map((category) => category.id))
  const assessmentMap = new Map(activeAssessments.map((assessment) => [assessment.id, assessment]))
  const primaryAssessmentByCategory = new Map(
    activeAssessments
      .filter((assessment) => assessment.is_primary)
      .map((assessment) => [assessment.category_id, assessment]),
  )

  const questionRows = await loadQuestionsByCategoryIds(activeCategories.map((category) => category.id))
  const questionsByCategory = new Map<string, TrainingQuestionRow[]>()
  const questionsByAssessment = new Map<string, TrainingQuestionRow[]>()
  for (const question of questionRows) {
    const current = questionsByCategory.get(question.category_id) || []
    current.push(question)
    questionsByCategory.set(question.category_id, current)

    const assessmentQuestions = questionsByAssessment.get(question.assessment_id) || []
    assessmentQuestions.push(question)
    questionsByAssessment.set(question.assessment_id, assessmentQuestions)
  }

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
  for (const assessment of activeAssessments) {
    const category = categoriesById.get(assessment.category_id)
    if (!category) {
      continue
    }
    assessmentsById.set(
      assessment.id,
      buildAssessmentRecord(
        assessment,
        (questionsByAssessment.get(assessment.id) || []).map((question) =>
          buildQuestionRecord(question, category.title, questionReportMap.get(question.id) || null, assessment.title),
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
  const traineeAssignmentContext: TargetMembershipContext = {
    batchMap,
    traineeMap: new Map([[sessionUser.userId, {
      id: sessionUser.userId,
      fullName: sessionUser.userName,
      email: '',
      batchIds,
      batchNames: batchIds.map((batchId) => formatBatchLabel(batchMap.get(batchId) || null)),
    } satisfies TraineeOption]]),
    categoriesById,
    batchMembershipRows: memberships,
  }
  const assignmentRecordsForCertificates = new Map<string, AssignmentRecord>()
  for (const assignment of filteredAssignments) {
    const targetType = getAssignmentTargetType(assignment)
    assignmentRecordsForCertificates.set(assignment.id, {
      id: assignment.id,
      categoryId: assignment.category_id,
      batchId: assignment.batch_id,
      waveNumber: assignment.wave_number,
      traineeId: assignment.trainee_id,
      assignedBy: assignment.assigned_by,
      assignedAt: assignment.assigned_at,
      dueAt: assignment.due_at,
      isActive: assignment.is_active,
      categoryTitle: categoryMap.get(assignment.category_id)?.title || 'Assessment Category',
      categoryName: categoryMap.get(assignment.category_id)?.title || 'Assessment Category',
      assessmentTitle: (assignment.assessment_id ? assessmentMap.get(assignment.assessment_id)?.title : null)
        || categoryMap.get(assignment.category_id)?.title
        || 'Assessment',
      title: assignment.title || categoryMap.get(assignment.category_id)?.title || 'Assessment',
      targetLabel: getAssignmentTargetLabel(assignment, traineeAssignmentContext),
      targetType,
    })
  }

  const certificates = certificateRows.map((certificate) =>
    buildCertificateRecord(certificate, categoriesById, assignmentRecordsForCertificates, assessmentsById),
  )
  const certificateByAssignment = new Map(certificates.map((certificate) => [certificate.assignmentId || '', certificate]))

  const prioritizedAssignments = [...filteredAssignments].sort((left, right) => {
    const leftPriority = getAssignmentPriority(left)
    const rightPriority = getAssignmentPriority(right)

    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority
    }

    const leftDue = toSortableTimestamp(left.due_at)
    const rightDue = toSortableTimestamp(right.due_at)
    if (leftDue !== rightDue) {
      return leftDue - rightDue
    }

    return toSortableTimestamp(right.assigned_at, 0) - toSortableTimestamp(left.assigned_at, 0)
  })

  const availableAssessments: TraineeAssessmentCard[] = []

  for (const assignment of prioritizedAssignments) {
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
    const assessment = (assignment.assessment_id ? assessmentMap.get(assignment.assessment_id) : null)
      || primaryAssessmentByCategory.get(category.id)
    const targetType = getAssignmentTargetType(assignment)
    const card: TraineeAssessmentCard = {
      assignmentId: assignment.id,
      assessmentId: assessment?.id || assignment.assessment_id || assignment.id,
      categoryId: category.id,
      categoryTitle: category.title,
      targetType,
      waveNumber: assignment.wave_number ?? null,
      assignmentTitle: assignment.title || category.title,
      assessmentTitle: assessment?.title || assignment.title || category.title,
      assessmentDescription: assessment?.description || assignment.description || category.description,
      type: assessment?.type || 'multiple_choice',
      passingScore: assignment.passing_score || category.passing_score,
      targetDueAt: assignment.due_at,
      targetLabel: getAssignmentTargetLabel(assignment, traineeAssignmentContext),
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

    availableAssessments.push(card)
  }
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
  const completedAssignments = availableAssessments.filter((assessment) => !!assessment.latestAttempt).length
  const passedAssignments = availableAssessments.filter((assessment) => assessment.latestAttempt?.status === 'pass').length

  return {
    availableAssessments,
    attempts,
    coachingNotes,
    certificates,
    stats: {
      assignedCount: availableAssessments.length,
      completedCount: completedAssignments,
      passedCount: passedAssignments,
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

  const assessment = assignment.assessment_id
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessments')
          .select('*')
          .eq('id', assignment.assessment_id)
          .maybeSingle(),
        'Unable to load the linked assessment definition.',
      )) as TrainingAssessmentRow | null) || null)
    : null
  const primaryAssessment = assessment || await ensurePrimaryAssessment(category.id, category)
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
  const memberships = (((await assertSupabaseResult(
    supabase
      .from('batch_user')
      .select('batch_id,user_id')
      .eq('user_id', sessionUser.userId),
    'Unable to load trainee batch membership for this session.',
  )) as BatchUserRow[] | null) || [])
  const batchIds = memberships.map((row) => row.batch_id)
  const batchRows = batchIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('batch')
          .select('id,name,description,wave_number,created_by,is_active')
          .in('id', batchIds),
        'Unable to load the batch labels for this assignment.',
      )) as BatchRow[] | null) || [])
    : []
  const batchMap = new Map(batchRows.map((batch) => [batch.id, {
    id: batch.id,
    name: batch.name,
    description: batch.description,
    waveNumber: batch.wave_number,
    traineeCount: 0,
    createdBy: batch.created_by,
  } satisfies BatchOption]))
  const targetContext: TargetMembershipContext = {
    batchMap,
    batchMembershipRows: memberships,
    traineeMap: new Map([[sessionUser.userId, {
      id: sessionUser.userId,
      fullName: sessionUser.userName,
      email: '',
      batchIds,
      batchNames: batchIds.map((batchId) => formatBatchLabel(batchMap.get(batchId) || null)),
    } satisfies TraineeOption]]),
    categoriesById: new Map([[category.id, { createdBy: category.created_by, title: category.title }]]),
  }

  const questionRows = await getAssignmentPoolQuestionRows(assignment, undefined)
  const orderedQuestions = questionRows.map((question) =>
    buildSessionQuestionRecord(question, normalizeBoolean(assignment.shuffle_choices, true)),
  )

  return {
    assignmentId: assignment.id,
    assessmentId: primaryAssessment.id,
    categoryId: category.id,
    categoryTitle: category.title,
    targetType: getAssignmentTargetType(assignment),
    waveNumber: assignment.wave_number ?? null,
    assignmentTitle: assignment.title || category.title,
    assessmentTitle: primaryAssessment.title,
    description: primaryAssessment.description || assignment.description || category.description,
    passingScore: assignment.passing_score || category.passing_score,
    targetDueAt: assignment.due_at,
    targetLabel: getAssignmentTargetLabel(assignment, targetContext),
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
            targetLabel: getAssignmentTargetLabel(assignment, targetContext),
            targetType: getAssignmentTargetType(assignment),
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
  const batchRows = batchIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('batch')
          .select('id,name,description,wave_number,created_by,is_active')
          .in('id', batchIds),
        'Unable to verify trainee batch labels.',
      )) as BatchRow[] | null) || [])
    : []
  const category = await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .select('id,title,created_by')
      .eq('id', assessment.category_id)
      .maybeSingle(),
    'Unable to verify the assignment category.',
  ) as Pick<TrainingCategoryRow, 'id' | 'title' | 'created_by'> | null
  const batchMap = new Map(batchRows.map((batch) => [batch.id, {
    id: batch.id,
    name: batch.name,
    description: batch.description,
    waveNumber: batch.wave_number,
    traineeCount: 0,
    createdBy: batch.created_by,
  } satisfies BatchOption]))
  const matched = assignments.find((assignment) =>
    getAssignmentTargetTraineeIds(assignment, {
      batchMap,
      batchMembershipRows: memberships,
      categoriesById: category
        ? new Map([[assessment.category_id, { createdBy: category.created_by, title: category.title }]])
        : new Map(),
    }).includes(sessionUser.userId)
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

  const assessment = assignment.assessment_id
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessments')
          .select('*')
          .eq('id', assignment.assessment_id)
          .maybeSingle(),
        'Unable to load the linked assessment definition.',
      )) as TrainingAssessmentRow | null) || null)
    : null
  const primaryAssessment = assessment || await ensurePrimaryAssessment(category.id, category)
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

  const memberships = (((await assertSupabaseResult(
    supabase
      .from('batch_user')
      .select('batch_id,user_id')
      .eq('user_id', sessionUser.userId),
    'Unable to load trainee batch membership for attempt saving.',
  )) as BatchUserRow[] | null) || [])
  const batchIds = memberships.map((row) => row.batch_id)
  const batchRows = batchIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('batch')
          .select('id,name,description,wave_number,created_by,is_active')
          .in('id', batchIds),
        'Unable to load trainee batch labels for attempt saving.',
      )) as BatchRow[] | null) || [])
    : []
  const actualBatchId = getAssignmentActualBatchIdForTrainee(assignment, sessionUser.userId, {
    batchMap: new Map(batchRows.map((batch) => [batch.id, {
      id: batch.id,
      name: batch.name,
      description: batch.description,
      waveNumber: batch.wave_number,
      traineeCount: 0,
      createdBy: batch.created_by,
    } satisfies BatchOption])),
    batchMembershipRows: memberships,
    traineeMap: new Map([[sessionUser.userId, {
      id: sessionUser.userId,
      fullName: sessionUser.userName,
      email: '',
      batchIds,
      batchNames: [],
    } satisfies TraineeOption]]),
    categoriesById: new Map([[category.id, { createdBy: category.created_by, title: category.title }]]),
  })

  const questionRows = await getAssignmentPoolQuestionRows(assignment, payload.questionIds)
  if (!questionRows.length) {
    throw new AssessmentHttpError(400, 'This assessment does not have any active questions right now.')
  }

  const questionRecords = questionRows.map((question) => buildQuestionRecord(question, category.title, null, primaryAssessment.title))
  const choiceMap = payload.choiceMap || {}
  const scoring = scoreAssessmentSubmission(questionRecords, payload.answers, choiceMap)
  const passingScore = assignment.passing_score || category.passing_score
  const attemptNo = priorAttempts.length + 1
  const status: 'pass' | 'fail' = scoring.score >= passingScore ? 'pass' : 'fail'

  const rulesAnalysis = buildAttemptAnalysisSummary({
    categoryId: category.id,
    categoryTitle: category.title,
    score: scoring.score,
    passingScore,
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
    points: getQuestionPointValue(question.metadata),
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
        batch_id: actualBatchId,
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
          batchId: assignment.batch_id,
          waveNumber: assignment.wave_number,
          traineeId: assignment.trainee_id,
          assignedBy: assignment.assigned_by,
          assignedAt: assignment.assigned_at,
          dueAt: assignment.due_at,
          isActive: assignment.is_active,
          categoryTitle: category.title,
          categoryName: category.title,
          assessmentTitle: assignment.title || category.title,
          title: assignment.title || category.title,
          targetLabel: getAssignmentTargetLabel(assignment, {
            batchMap: new Map(batchRows.map((batch) => [batch.id, {
              id: batch.id,
              name: batch.name,
              description: batch.description,
              waveNumber: batch.wave_number,
              traineeCount: 0,
              createdBy: batch.created_by,
            } satisfies BatchOption])),
            batchMembershipRows: memberships,
            traineeMap: new Map([[sessionUser.userId, {
              id: sessionUser.userId,
              fullName: sessionUser.userName,
              email: '',
              batchIds,
              batchNames: [],
            } satisfies TraineeOption]]),
            categoriesById: new Map([[category.id, { createdBy: category.created_by, title: category.title }]]),
          }),
          targetType: getAssignmentTargetType(assignment),
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
