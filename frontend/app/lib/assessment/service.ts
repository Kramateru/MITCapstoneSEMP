import 'server-only'

import { createSupabaseAdminClient } from './supabase-admin'
import { AssessmentHttpError } from './backend-auth'
import { scoreAssessmentSubmission } from './scoring'
import type {
  AssignmentRecord,
  AssessmentRecord,
  AssessmentQuestionRecord,
  AttemptQuestionResult,
  AttemptRecord,
  BackendSessionUser,
  BatchOption,
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
  TraineeAssessmentCard,
  TraineeDashboardResponse,
  TrainerBootstrapResponse,
  TraineeOption,
  UpdateAssessmentPayload,
  UpdateCategoryPayload,
  UpdateQuestionPayload,
} from './types'

type TrainingCategoryRow = {
  id: string
  title: string
  description?: string | null
  passing_score: number
  created_by: string
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
  created_at: string
  updated_at: string
}

type TrainingQuestionRow = {
  id: string
  assessment_id: string
  question_text: string
  question_type: 'multiple_choice' | 'fill_blank'
  options: string[] | null
  correct_answer: string
  explanation?: string | null
  order_index: number
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
  question_results?: AttemptQuestionResult[] | null
  category_title: string
  assessment_title: string
  trainee_name: string
  trainee_email?: string | null
  batch_name?: string | null
  certificate_id?: string | null
  certificate_code?: string | null
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
  assessment_id: string
  attempt_id: string
  certificate_code: string
  earned_at: string
}

type TrainingCategoryReportRow = {
  category_id: string
  category_title: string
  passing_score: number
  attempt_count: number
  pass_count: number
  fail_count: number
  average_score: number
  pass_rate: number
}

type TrainingQuestionReportRow = {
  question_id: string
  assessment_id: string
  category_id: string
  question_text: string
  question_type: 'multiple_choice' | 'fill_blank'
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

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

function notEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function buildQuestionRecord(question: TrainingQuestionRow): AssessmentQuestionRecord {
  return {
    id: question.id,
    assessmentId: question.assessment_id,
    questionText: question.question_text,
    questionType: question.question_type,
    options: Array.isArray(question.options) ? question.options.filter((option) => typeof option === 'string') : [],
    correctAnswer: question.correct_answer,
    explanation: question.explanation,
    orderIndex: question.order_index,
    metadata: question.metadata || {},
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

function buildAttemptRecord(attempt: TrainingAttemptFeedRow): AttemptRecord {
  return {
    id: attempt.id,
    assignmentId: attempt.assignment_id,
    assessmentId: attempt.assessment_id,
    categoryId: attempt.category_id,
    assessmentTitle: attempt.assessment_title,
    categoryTitle: attempt.category_title,
    traineeId: attempt.trainee_id,
    traineeName: attempt.trainee_name,
    traineeEmail: attempt.trainee_email,
    batchId: attempt.batch_id,
    batchName: attempt.batch_name,
    attemptNo: attempt.attempt_no,
    score: Number(attempt.score || 0),
    status: attempt.status,
    feedback: attempt.feedback,
    trainerNote: attempt.trainer_note,
    submittedAt: attempt.submitted_at,
    certificateId: attempt.certificate_id,
    certificateCode: attempt.certificate_code,
    questionResults: Array.isArray(attempt.question_results) ? attempt.question_results : [],
  }
}

function formatBatchLabel(batch?: Pick<BatchOption, 'name' | 'waveNumber'> | null) {
  if (!batch) {
    return 'Unassigned Batch'
  }
  if (batch.waveNumber !== null && batch.waveNumber !== undefined) {
    return `${batch.name} | Wave ${batch.waveNumber}`
  }
  return batch.name
}

function toSortableTimestamp(value?: string | null, fallback = Number.MAX_SAFE_INTEGER) {
  if (!value) {
    return fallback
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? fallback : timestamp
}

function getAssignmentPriority(assignment: TrainingAssignmentRow) {
  let priority = 0

  if (assignment.trainee_id) {
    priority += 4
  }

  if (assignment.assessment_id) {
    priority += 2
  }

  if (assignment.due_at) {
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

function createCertificateCode() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `ASM-${stamp}-${random}`
}

async function assertSupabaseResult<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  fallback: string,
) {
  const result = await promise
  if (result.error) {
    throw new AssessmentHttpError(500, result.error.message || fallback)
  }
  return result.data
}

function expectSupabaseRow<T>(
  value: T | null,
  fallback: string,
) {
  if (!value) {
    throw new AssessmentHttpError(500, fallback)
  }

  return value
}

async function getOwnedCategory(
  categoryId: string,
  sessionUser: BackendSessionUser,
) {
  const supabase = createSupabaseAdminClient()
  const category = (await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .select('*')
      .eq('id', categoryId)
      .maybeSingle(),
    'Unable to load the selected category.',
  )) as TrainingCategoryRow | null

  if (!category) {
    throw new AssessmentHttpError(404, 'Assessment category not found.')
  }

  if (sessionUser.role !== 'admin' && category.created_by !== sessionUser.userId) {
    throw new AssessmentHttpError(403, 'You can only modify categories you created.')
  }

  return category as TrainingCategoryRow
}

async function getOwnedAssessment(
  assessmentId: string,
  sessionUser: BackendSessionUser,
) {
  const supabase = createSupabaseAdminClient()
  const assessment = (await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .select('*')
      .eq('id', assessmentId)
      .maybeSingle(),
    'Unable to load the selected assessment.',
  )) as TrainingAssessmentRow | null

  if (!assessment) {
    throw new AssessmentHttpError(404, 'Assessment definition not found.')
  }

  await getOwnedCategory((assessment as TrainingAssessmentRow).category_id, sessionUser)
  return assessment as TrainingAssessmentRow
}

async function getOwnedQuestion(
  questionId: string,
  sessionUser: BackendSessionUser,
) {
  const supabase = createSupabaseAdminClient()
  const question = (await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .select('*')
      .eq('id', questionId)
      .maybeSingle(),
    'Unable to load the selected question.',
  )) as TrainingQuestionRow | null

  if (!question) {
    throw new AssessmentHttpError(404, 'Assessment question not found.')
  }

  await getOwnedAssessment((question as TrainingQuestionRow).assessment_id, sessionUser)
  return question as TrainingQuestionRow
}

async function getTrainerBatches(
  sessionUser: BackendSessionUser,
) {
  const supabase = createSupabaseAdminClient()
  const batchRows = (await assertSupabaseResult(
    supabase
      .from('batch')
      .select('id,name,description,wave_number,created_by,is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    'Unable to load trainer batches.',
  )) as BatchRow[] | null

  const visibleBatches = (batchRows || []).filter((batch) =>
    sessionUser.role === 'admin' ? true : batch.created_by === sessionUser.userId,
  )

  const batchIds = visibleBatches.map((batch) => batch.id)
  const batchUserRows = batchIds.length
    ? ((await assertSupabaseResult(
        supabase
          .from('batch_user')
          .select('batch_id,user_id')
          .in('batch_id', batchIds),
        'Unable to load batch membership.',
      )) as BatchUserRow[] | null) || []
    : []

  const traineeIds = unique(batchUserRows.map((row) => row.user_id))
  const traineeRows = traineeIds.length
    ? ((await assertSupabaseResult(
        supabase
          .from('user')
          .select('id,email,full_name,role')
          .in('id', traineeIds),
        'Unable to load trainee records.',
      )) as UserRow[] | null) || []
    : []

  const traineeMap = new Map(traineeRows.filter((user) => user.role === 'trainee').map((user) => [user.id, user]))
  const batchMembershipMap = new Map<string, string[]>()

  for (const row of batchUserRows) {
    if (!traineeMap.has(row.user_id)) {
      continue
    }
    const current = batchMembershipMap.get(row.batch_id) || []
    current.push(row.user_id)
    batchMembershipMap.set(row.batch_id, current)
  }

  const batchOptions: BatchOption[] = visibleBatches.map((batch) => ({
    id: batch.id,
    name: batch.name,
    description: batch.description,
    waveNumber: batch.wave_number,
    traineeCount: (batchMembershipMap.get(batch.id) || []).length,
  }))

  const traineeOptions: TraineeOption[] = Array.from(traineeMap.values()).map((trainee) => {
    const traineeBatchIds = batchUserRows
      .filter((row) => row.user_id === trainee.id)
      .map((row) => row.batch_id)
    const traineeBatches = batchOptions.filter((batch) => traineeBatchIds.includes(batch.id))

    return {
      id: trainee.id,
      fullName: trainee.full_name,
      email: trainee.email,
      batchIds: traineeBatches.map((batch) => batch.id),
      batchNames: traineeBatches.map((batch) => formatBatchLabel(batch)),
    }
  })

  return {
    batchOptions,
    traineeOptions,
  }
}

function buildCertificateRecord(
  certificate: TrainingCertificateRow,
  categoriesById: Map<string, CategoryRecord>,
  assessmentsById: Map<string, AssessmentRecord>,
): CertificateRecord {
  const category = categoriesById.get(certificate.category_id)
  const assessment = assessmentsById.get(certificate.assessment_id)

  return {
    id: certificate.id,
    traineeId: certificate.trainee_id,
    categoryId: certificate.category_id,
    assessmentId: certificate.assessment_id,
    attemptId: certificate.attempt_id,
    certificateCode: certificate.certificate_code,
    earnedAt: certificate.earned_at,
    categoryTitle: category?.title || 'Assessment Category',
    assessmentTitle: assessment?.title || 'Assessment',
  }
}

export async function getTrainerAssessmentBootstrap(
  sessionUser: BackendSessionUser,
): Promise<TrainerBootstrapResponse> {
  const supabase = createSupabaseAdminClient()

  const rawCategories = ((await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .select('*')
      .eq('is_archived', false)
      .order('updated_at', { ascending: false }),
    'Unable to load trainer assessment categories.',
  )) as TrainingCategoryRow[] | null) || []

  const visibleCategories = rawCategories.filter((category) =>
    sessionUser.role === 'admin' ? true : category.created_by === sessionUser.userId,
  )
  const categoryIds = visibleCategories.map((category) => category.id)

  const rawAssessments = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessments')
          .select('*')
          .in('category_id', categoryIds)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        'Unable to load trainer assessments.',
      )) as TrainingAssessmentRow[] | null) || [])
    : []
  const assessmentIds = rawAssessments.map((assessment) => assessment.id)

  const rawQuestions = assessmentIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_questions')
          .select('*')
          .in('assessment_id', assessmentIds)
          .order('order_index', { ascending: true }),
        'Unable to load trainer question bank.',
      )) as TrainingQuestionRow[] | null) || [])
    : []

  const rawAssignments = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_assignments')
          .select('*')
          .in('category_id', categoryIds)
          .order('assigned_at', { ascending: false }),
        'Unable to load trainer assignments.',
      )) as TrainingAssignmentRow[] | null) || [])
    : []

  const rawAttempts = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_attempt_feed')
          .select('*')
          .in('category_id', categoryIds)
          .order('submitted_at', { ascending: false }),
        'Unable to load trainer attempts.',
      )) as TrainingAttemptFeedRow[] | null) || [])
    : []

  const rawCategoryReports = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_category_report')
          .select('*')
          .in('category_id', categoryIds)
          .order('category_title', { ascending: true }),
        'Unable to load category reports.',
      )) as TrainingCategoryReportRow[] | null) || [])
    : []

  const rawQuestionReports = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_question_report')
          .select('*')
          .in('category_id', categoryIds)
          .order('miss_rate', { ascending: false }),
        'Unable to load question analytics.',
      )) as TrainingQuestionReportRow[] | null) || [])
    : []

  const { batchOptions, traineeOptions } = await getTrainerBatches(sessionUser)
  const batchMap = new Map(batchOptions.map((batch) => [batch.id, batch]))
  const traineeMap = new Map(traineeOptions.map((trainee) => [trainee.id, trainee]))

  const questionsByAssessment = new Map<string, AssessmentQuestionRecord[]>()
  for (const question of rawQuestions) {
    const current = questionsByAssessment.get(question.assessment_id) || []
    current.push(buildQuestionRecord(question))
    questionsByAssessment.set(question.assessment_id, current)
  }

  const assessmentsByCategory = new Map<string, AssessmentRecord[]>()
  const assessmentMap = new Map<string, AssessmentRecord>()
  for (const assessment of rawAssessments) {
    const mapped = buildAssessmentRecord(
      assessment,
      questionsByAssessment.get(assessment.id) || [],
    )
    assessmentMap.set(mapped.id, mapped)
    const current = assessmentsByCategory.get(assessment.category_id) || []
    current.push(mapped)
    assessmentsByCategory.set(assessment.category_id, current)
  }

  const categoryReportMap = new Map(rawCategoryReports.map((report) => [report.category_id, report]))
  const categories: CategoryRecord[] = visibleCategories.map((category) => {
    const report = categoryReportMap.get(category.id)
    return {
      id: category.id,
      title: category.title,
      description: category.description,
      passingScore: category.passing_score,
      createdBy: category.created_by,
      isArchived: category.is_archived,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
      assignmentCount: rawAssignments.filter((assignment) => assignment.category_id === category.id && assignment.is_active).length,
      attemptCount: report?.attempt_count || 0,
      passRate: Number(report?.pass_rate || 0),
      averageScore: Number(report?.average_score || 0),
      assessments: assessmentsByCategory.get(category.id) || [],
    }
  })

  const categoriesById = new Map(categories.map((category) => [category.id, category]))

  const assignments: AssignmentRecord[] = rawAssignments.map((assignment) => {
    const batch = assignment.batch_id ? batchMap.get(assignment.batch_id) : null
    const trainee = assignment.trainee_id ? traineeMap.get(assignment.trainee_id) : null
    const category = categoriesById.get(assignment.category_id)
    const assessment = assignment.assessment_id ? assessmentMap.get(assignment.assessment_id) : null

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
      assessmentTitle: assessment?.title || null,
      targetLabel: batch ? formatBatchLabel(batch) : trainee?.fullName || 'Trainee',
      targetType: batch ? 'batch' : 'trainee',
    }
  })

  const attempts = rawAttempts.map(buildAttemptRecord)

  const categoryReports: CategoryReportRecord[] = rawCategoryReports.map((report) => ({
    categoryId: report.category_id,
    categoryTitle: report.category_title,
    passingScore: report.passing_score,
    attemptCount: report.attempt_count,
    passCount: report.pass_count,
    failCount: report.fail_count,
    averageScore: Number(report.average_score || 0),
    passRate: Number(report.pass_rate || 0),
  }))

  const questionReports: QuestionReportRecord[] = rawQuestionReports.map((report) => ({
    questionId: report.question_id,
    assessmentId: report.assessment_id,
    categoryId: report.category_id,
    questionText: report.question_text,
    questionType: report.question_type,
    answerCount: report.answer_count,
    correctCount: report.correct_count,
    incorrectCount: report.incorrect_count,
    missRate: Number(report.miss_rate || 0),
  }))

  return {
    categories,
    batches: batchOptions,
    trainees: traineeOptions,
    assignments,
    attempts,
    reports: {
      categories: categoryReports,
      questions: questionReports,
    },
  }
}

function toCsvCell(value: unknown) {
  const normalized = value === null || value === undefined ? '' : String(value)
  if (!/[",\n\r]/.test(normalized)) {
    return normalized
  }

  return `"${normalized.replace(/"/g, '""')}"`
}

function buildWeakAreaSummary(
  questionReports: QuestionReportRecord[],
  categoryId: string,
) {
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
  const categoryReportMap = new Map(
    workspace.reports.categories.map((report) => [report.categoryId, report]),
  )

  const rows = workspace.attempts.length
    ? workspace.attempts.map((attempt) => {
        const categoryReport = categoryReportMap.get(attempt.categoryId)
        return {
          row_type: 'attempt',
          category_title: attempt.categoryTitle,
          assessment_title: attempt.assessmentTitle,
          trainee_name: attempt.traineeName,
          trainee_email: attempt.traineeEmail || '',
          batch_name: attempt.batchName || '',
          attempt_no: attempt.attemptNo,
          score: attempt.score.toFixed(2),
          status: attempt.status,
          submitted_at: attempt.submittedAt,
          certificate_code: attempt.certificateCode || '',
          feedback: attempt.feedback || '',
          trainer_note: attempt.trainerNote || '',
          question_count: attempt.questionResults.length,
          correct_answers: attempt.questionResults.filter((result) => result.isCorrect).length,
          passing_score: categoryReport?.passingScore ?? '',
          category_attempt_count: categoryReport?.attemptCount ?? 0,
          category_pass_rate: categoryReport ? categoryReport.passRate.toFixed(2) : '',
          category_average_score: categoryReport ? categoryReport.averageScore.toFixed(2) : '',
          weak_area_summary: buildWeakAreaSummary(workspace.reports.questions, attempt.categoryId),
        }
      })
    : workspace.reports.categories.map((report) => ({
        row_type: 'category_summary',
        category_title: report.categoryTitle,
        assessment_title: '',
        trainee_name: '',
        trainee_email: '',
        batch_name: '',
        attempt_no: '',
        score: '',
        status: '',
        submitted_at: '',
        certificate_code: '',
        feedback: '',
        trainer_note: '',
        question_count: '',
        correct_answers: '',
        passing_score: report.passingScore,
        category_attempt_count: report.attemptCount,
        category_pass_rate: report.passRate.toFixed(2),
        category_average_score: report.averageScore.toFixed(2),
        weak_area_summary: buildWeakAreaSummary(workspace.reports.questions, report.categoryId),
      }))

  const header = [
    'row_type',
    'category_title',
    'assessment_title',
    'trainee_name',
    'trainee_email',
    'batch_name',
    'attempt_no',
    'score',
    'status',
    'submitted_at',
    'certificate_code',
    'feedback',
    'trainer_note',
    'question_count',
    'correct_answers',
    'passing_score',
    'category_attempt_count',
    'category_pass_rate',
    'category_average_score',
    'weak_area_summary',
  ]

  const csv = [
    header.map((value) => toCsvCell(value)).join(','),
    ...rows.map((row) => header.map((column) => toCsvCell(row[column as keyof typeof row])).join(',')),
  ].join('\n')

  const fileDate = new Date().toISOString().slice(0, 10)
  return {
    filename: `training-assessment-report-${fileDate}.csv`,
    content: csv,
  }
}

export async function getTraineeAssessmentDashboard(
  sessionUser: BackendSessionUser,
): Promise<TraineeDashboardResponse> {
  const supabase = createSupabaseAdminClient()

  const batchMemberships = (((await assertSupabaseResult(
    supabase
      .from('batch_user')
      .select('batch_id,user_id')
      .eq('user_id', sessionUser.userId),
    'Unable to load trainee batch membership.',
  )) as BatchUserRow[] | null) || [])

  const batchIds = batchMemberships.map((membership) => membership.batch_id)

  const directAssignments = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .select('*')
      .eq('is_active', true)
      .eq('trainee_id', sessionUser.userId)
      .order('assigned_at', { ascending: false }),
    'Unable to load direct assessment assignments.',
  )) as TrainingAssignmentRow[] | null) || [])

  const batchAssignments = batchIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_assignments')
          .select('*')
          .eq('is_active', true)
          .in('batch_id', batchIds)
          .order('assigned_at', { ascending: false }),
        'Unable to load batch assessment assignments.',
      )) as TrainingAssignmentRow[] | null) || [])
    : []

  const assignmentsById = new Map<string, TrainingAssignmentRow>()
  for (const assignment of [...directAssignments, ...batchAssignments]) {
    assignmentsById.set(assignment.id, assignment)
  }
  const allAssignments = Array.from(assignmentsById.values())

  const categoryIds = unique(allAssignments.map((assignment) => assignment.category_id))
  const assessmentIdsFromAssignments = unique(allAssignments.map((assignment) => assignment.assessment_id).filter(notEmpty))

  const rawCategories = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_categories')
          .select('*')
          .in('id', categoryIds),
        'Unable to load assigned assessment categories.',
      )) as TrainingCategoryRow[] | null) || [])
    : []

  const rawAssessments = categoryIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessments')
          .select('*')
          .in('category_id', categoryIds)
          .eq('is_published', true)
          .order('sort_order', { ascending: true }),
        'Unable to load assigned assessments.',
      )) as TrainingAssessmentRow[] | null) || [])
    : []

  const assessmentIds = unique([
    ...assessmentIdsFromAssignments,
    ...rawAssessments.map((assessment) => assessment.id),
  ])

  const rawQuestions = assessmentIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('training_assessment_questions')
          .select('*')
          .in('assessment_id', assessmentIds)
          .order('order_index', { ascending: true }),
        'Unable to load assigned questions.',
      )) as TrainingQuestionRow[] | null) || [])
    : []

  const rawAttempts = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_attempt_feed')
      .select('*')
      .eq('trainee_id', sessionUser.userId)
      .order('submitted_at', { ascending: false }),
    'Unable to load previous assessment attempts.',
  )) as TrainingAttemptFeedRow[] | null) || [])

  const rawCoachingNotes = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_coaching_notes')
      .select('*')
      .eq('trainee_id', sessionUser.userId)
      .order('created_at', { ascending: false }),
    'Unable to load coaching notes.',
  )) as TrainingCoachingRow[] | null) || [])

  const rawCertificates = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_certificates')
      .select('*')
      .eq('trainee_id', sessionUser.userId)
      .order('earned_at', { ascending: false }),
    'Unable to load certificates.',
  )) as TrainingCertificateRow[] | null) || [])

  const batchRows = batchIds.length
    ? (((await assertSupabaseResult(
        supabase
          .from('batch')
          .select('id,name,description,wave_number,created_by,is_active')
          .in('id', batchIds),
        'Unable to load batch labels.',
      )) as BatchRow[] | null) || [])
    : []

  const activeCategoryIds = new Set(
    rawCategories
      .filter((category) => !category.is_archived)
      .map((category) => category.id),
  )
  const assignments = allAssignments.filter((assignment) => activeCategoryIds.has(assignment.category_id))

  const questionsByAssessment = new Map<string, AssessmentQuestionRecord[]>()
  for (const question of rawQuestions) {
    const current = questionsByAssessment.get(question.assessment_id) || []
    current.push(buildQuestionRecord(question))
    questionsByAssessment.set(question.assessment_id, current)
  }

  const assessments = rawAssessments.map((assessment) =>
    buildAssessmentRecord(assessment, questionsByAssessment.get(assessment.id) || []),
  )
  const assessmentsById = new Map(assessments.map((assessment) => [assessment.id, assessment]))

  const categories: CategoryRecord[] = rawCategories.map((category) => ({
    id: category.id,
    title: category.title,
    description: category.description,
    passingScore: category.passing_score,
    createdBy: category.created_by,
    isArchived: category.is_archived,
    createdAt: category.created_at,
    updatedAt: category.updated_at,
    assignmentCount: assignments.filter((assignment) => assignment.category_id === category.id).length,
    attemptCount: rawAttempts.filter((attempt) => attempt.category_id === category.id).length,
    passRate: 0,
    averageScore: 0,
    assessments: assessments.filter((assessment) => assessment.categoryId === category.id),
  }))

  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const attempts = rawAttempts.map(buildAttemptRecord)
  const latestAttemptByAssessment = new Map<string, AttemptRecord>()
  for (const attempt of attempts) {
    if (!latestAttemptByAssessment.has(attempt.assessmentId)) {
      latestAttemptByAssessment.set(attempt.assessmentId, attempt)
    }
  }

  const certificateRecords = rawCertificates.map((certificate) =>
    buildCertificateRecord(certificate, categoriesById, assessmentsById),
  )
  const certificateByCategory = new Map(certificateRecords.map((certificate) => [certificate.categoryId, certificate]))

  const batchOptions: BatchOption[] = batchRows.map((batch) => ({
    id: batch.id,
    name: batch.name,
    description: batch.description,
    waveNumber: batch.wave_number,
    traineeCount: 0,
  }))
  const batchMap = new Map(batchOptions.map((batch) => [batch.id, batch]))

  const availableAssessmentMap = new Map<
    string,
    {
      assignment: TrainingAssignmentRow
      card: TraineeAssessmentCard
    }
  >()

  for (const assignment of assignments) {
    const category = categoriesById.get(assignment.category_id)
    if (!category || category.isArchived) {
      continue
    }

    const batch = assignment.batch_id ? batchMap.get(assignment.batch_id) : null
    const assessmentList = assignment.assessment_id
      ? [assessmentsById.get(assignment.assessment_id)].filter(notEmpty)
      : assessments.filter((assessment) => assessment.categoryId === assignment.category_id)

    for (const assessment of assessmentList) {
      const card: TraineeAssessmentCard = {
        assignmentId: assignment.id,
        assessmentId: assessment.id,
        categoryId: assessment.categoryId,
        categoryTitle: category.title,
        assessmentTitle: assessment.title,
        assessmentDescription: assessment.description,
        type: assessment.type,
        passingScore: category.passingScore,
        targetDueAt: assignment.due_at,
        targetLabel: batch ? formatBatchLabel(batch) : 'Direct Assignment',
        questionCount: assessment.questionCount,
        questionTypes: unique(assessment.questions.map((question) => question.questionType)),
        latestAttempt: latestAttemptByAssessment.get(assessment.id),
        certificate: certificateByCategory.get(assessment.categoryId),
        questions: assessment.questions,
      }

      const existing = availableAssessmentMap.get(assessment.id)
      if (!existing || shouldReplaceAvailableAssessment(existing.assignment, assignment)) {
        availableAssessmentMap.set(assessment.id, {
          assignment,
          card,
        })
      }
    }
  }

  const availableAssessments = Array.from(availableAssessmentMap.values()).map((entry) => entry.card)

  const coachingNotes: CoachingNoteRecord[] = rawCoachingNotes
    .filter((note) => note.visibility === 'shared' || note.trainee_id === sessionUser.userId)
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
    certificates: certificateRecords,
    stats: {
      assignedCount: availableAssessments.length,
      completedCount: attempts.length,
      passedCount: attempts.filter((attempt) => attempt.status === 'pass').length,
      averageScore,
    },
  }
}

export async function createCategory(
  sessionUser: BackendSessionUser,
  payload: CreateCategoryPayload,
) {
  const supabase = createSupabaseAdminClient()
  const data = await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .insert({
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        passing_score: payload.passingScore,
        created_by: sessionUser.userId,
      })
      .select('*')
      .single(),
    'Unable to create assessment category.',
  )

  return expectSupabaseRow(data as TrainingCategoryRow | null, 'Unable to create assessment category.')
}

export async function updateCategory(
  sessionUser: BackendSessionUser,
  categoryId: string,
  payload: UpdateCategoryPayload,
) {
  await getOwnedCategory(categoryId, sessionUser)

  const supabase = createSupabaseAdminClient()
  const data = await assertSupabaseResult(
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
  )

  return expectSupabaseRow(data as TrainingCategoryRow | null, 'Unable to update assessment category.')
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
      })
      .eq('id', categoryId),
    'Unable to archive assessment category.',
  )
}

export async function createAssessment(
  sessionUser: BackendSessionUser,
  payload: CreateAssessmentPayload,
) {
  await getOwnedCategory(payload.categoryId, sessionUser)

  const supabase = createSupabaseAdminClient()
  const data = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .insert({
        category_id: payload.categoryId,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        type: payload.type,
        is_published: payload.isPublished ?? true,
      })
      .select('*')
      .single(),
    'Unable to create assessment.',
  )

  return expectSupabaseRow(data as TrainingAssessmentRow | null, 'Unable to create assessment.')
}

export async function updateAssessment(
  sessionUser: BackendSessionUser,
  assessmentId: string,
  payload: UpdateAssessmentPayload,
) {
  await getOwnedAssessment(assessmentId, sessionUser)

  const supabase = createSupabaseAdminClient()
  const data = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .update({
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        type: payload.type,
        is_published: payload.isPublished,
      })
      .eq('id', assessmentId)
      .select('*')
      .single(),
    'Unable to update assessment.',
  )

  return expectSupabaseRow(data as TrainingAssessmentRow | null, 'Unable to update assessment.')
}

export async function deleteAssessment(
  sessionUser: BackendSessionUser,
  assessmentId: string,
) {
  await getOwnedAssessment(assessmentId, sessionUser)
  const supabase = createSupabaseAdminClient()

  await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .delete()
      .eq('id', assessmentId),
    'Unable to delete assessment.',
  )
}

export async function createQuestion(
  sessionUser: BackendSessionUser,
  payload: CreateQuestionPayload,
) {
  await getOwnedAssessment(payload.assessmentId, sessionUser)

  const supabase = createSupabaseAdminClient()
  const data = await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .insert({
        assessment_id: payload.assessmentId,
        question_text: payload.questionText.trim(),
        question_type: payload.questionType,
        options: payload.questionType === 'multiple_choice'
          ? payload.options.map((option) => option.trim()).filter(Boolean)
          : [],
        correct_answer: payload.correctAnswer.trim(),
        explanation: payload.explanation?.trim() || null,
        order_index: payload.orderIndex,
      })
      .select('*')
      .single(),
    'Unable to create question.',
  )

  return expectSupabaseRow(data as TrainingQuestionRow | null, 'Unable to create question.')
}

export async function updateQuestion(
  sessionUser: BackendSessionUser,
  questionId: string,
  payload: UpdateQuestionPayload,
) {
  await getOwnedQuestion(questionId, sessionUser)

  const supabase = createSupabaseAdminClient()
  const data = await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .update({
        assessment_id: payload.assessmentId,
        question_text: payload.questionText.trim(),
        question_type: payload.questionType,
        options: payload.questionType === 'multiple_choice'
          ? payload.options.map((option) => option.trim()).filter(Boolean)
          : [],
        correct_answer: payload.correctAnswer.trim(),
        explanation: payload.explanation?.trim() || null,
        order_index: payload.orderIndex,
      })
      .eq('id', questionId)
      .select('*')
      .single(),
    'Unable to update question.',
  )

  return expectSupabaseRow(data as TrainingQuestionRow | null, 'Unable to update question.')
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
    'Unable to delete question.',
  )
}

export async function createAssignment(
  sessionUser: BackendSessionUser,
  payload: CreateAssignmentPayload,
) {
  await getOwnedCategory(payload.categoryId, sessionUser)

  if (!payload.batchId && !payload.traineeId) {
    throw new AssessmentHttpError(400, 'Pick a batch or a trainee before creating the assignment.')
  }

  if (payload.batchId && payload.traineeId) {
    throw new AssessmentHttpError(400, 'Choose either a batch target or a trainee target, not both.')
  }

  if (payload.assessmentId) {
    const assessment = await getOwnedAssessment(payload.assessmentId, sessionUser)
    if (assessment.category_id !== payload.categoryId) {
      throw new AssessmentHttpError(400, 'The selected assessment does not belong to the chosen category.')
    }
  }

  const { batchOptions, traineeOptions } = await getTrainerBatches(sessionUser)
  if (payload.batchId && !batchOptions.some((batch) => batch.id === payload.batchId)) {
    throw new AssessmentHttpError(404, 'The selected batch is not available in your workspace.')
  }

  if (payload.traineeId && !traineeOptions.some((trainee) => trainee.id === payload.traineeId)) {
    throw new AssessmentHttpError(404, 'The selected trainee is not available in your workspace.')
  }

  const supabase = createSupabaseAdminClient()
  const data = await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .insert({
        category_id: payload.categoryId,
        assessment_id: payload.assessmentId || null,
        batch_id: payload.batchId || null,
        trainee_id: payload.traineeId || null,
        assigned_by: sessionUser.userId,
        due_at: payload.dueAt || null,
      })
      .select('*')
      .single(),
    'Unable to create assessment assignment.',
  )

  return expectSupabaseRow(data as TrainingAssignmentRow | null, 'Unable to create assessment assignment.')
}

export async function submitAssessmentAttempt(
  sessionUser: BackendSessionUser,
  payload: SubmitAssessmentPayload,
): Promise<SubmitAssessmentResponse> {
  const supabase = createSupabaseAdminClient()

  const assessment = await assertSupabaseResult(
    supabase
      .from('training_assessments')
      .select('*')
      .eq('id', payload.assessmentId)
      .maybeSingle(),
    'Unable to load the selected assessment.',
  ) as TrainingAssessmentRow | null

  if (!assessment) {
    throw new AssessmentHttpError(404, 'Assessment not found.')
  }

  if (!assessment.is_published) {
    throw new AssessmentHttpError(403, 'This assessment is not currently published for trainees.')
  }

  const category = await assertSupabaseResult(
    supabase
      .from('training_assessment_categories')
      .select('*')
      .eq('id', assessment.category_id)
      .maybeSingle(),
    'Unable to load the linked category.',
  ) as TrainingCategoryRow | null

  if (!category || category.is_archived) {
    throw new AssessmentHttpError(404, 'Assessment category is no longer available.')
  }

  const membershipRows = (((await assertSupabaseResult(
    supabase
      .from('batch_user')
      .select('batch_id,user_id')
      .eq('user_id', sessionUser.userId),
    'Unable to verify batch membership.',
  )) as BatchUserRow[] | null) || [])
  const batchIds = membershipRows.map((row) => row.batch_id)

  const assignments = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_assignments')
      .select('*')
      .eq('is_active', true)
      .eq('category_id', category.id),
    'Unable to verify assignment access.',
  )) as TrainingAssignmentRow[] | null) || [])

  const matchingAssignments = assignments.filter((assignment) => {
    const matchesAssessment = assignment.assessment_id ? assignment.assessment_id === assessment.id : true
    const matchesTrainee = assignment.trainee_id === sessionUser.userId
    const matchesBatch = !!assignment.batch_id && batchIds.includes(assignment.batch_id)
    return matchesAssessment && (matchesTrainee || matchesBatch)
  })

  if (!matchingAssignments.length) {
    throw new AssessmentHttpError(403, 'This assessment is not assigned to your trainee account.')
  }

  const activeAssignment = payload.assignmentId
    ? matchingAssignments.find((assignment) => assignment.id === payload.assignmentId)
    : matchingAssignments[0]

  if (payload.assignmentId && !activeAssignment) {
    throw new AssessmentHttpError(403, 'The selected assessment assignment is no longer available.')
  }

  if (!activeAssignment) {
    throw new AssessmentHttpError(403, 'No active assignment is available for this assessment.')
  }

  const rawQuestions = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_questions')
      .select('*')
      .eq('assessment_id', assessment.id)
      .order('order_index', { ascending: true }),
    'Unable to load assessment questions.',
  )) as TrainingQuestionRow[] | null) || [])

  if (!rawQuestions.length) {
    throw new AssessmentHttpError(400, 'This assessment does not have any questions yet.')
  }

  const questions = rawQuestions.map(buildQuestionRecord)
  const scored = scoreAssessmentSubmission(questions, payload.answers)
  const priorAttempts = (((await assertSupabaseResult(
    supabase
      .from('training_assessment_attempts')
      .select('attempt_no')
      .eq('assessment_id', assessment.id)
      .eq('trainee_id', sessionUser.userId)
      .order('attempt_no', { ascending: false })
      .limit(1),
    'Unable to load previous attempts.',
  )) as Array<{ attempt_no: number }> | null) || [])

  const attemptNo = (priorAttempts[0]?.attempt_no || 0) + 1
  const passStatus = scored.score >= category.passing_score ? 'pass' : 'fail'

  const insertedAttempt = await assertSupabaseResult(
    supabase
      .from('training_assessment_attempts')
      .insert({
        assignment_id: activeAssignment.id,
        assessment_id: assessment.id,
        category_id: category.id,
        trainee_id: sessionUser.userId,
        batch_id: activeAssignment.batch_id || null,
        attempt_no: attemptNo,
        answers: payload.answers,
        question_results: scored.questionResults,
        total_questions: scored.totalQuestions,
        correct_answers: scored.correctAnswers,
        score: scored.score,
        status: passStatus,
        feedback:
          passStatus === 'pass'
            ? 'Passing score achieved. The certificate section has been updated.'
            : 'Passing score not reached yet. An immediate retake is available.',
      })
      .select('*')
      .single(),
    'Unable to save the assessment attempt.',
  ) as {
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
    question_results?: AttemptQuestionResult[]
  }

  let certificate: CertificateRecord | null = null
  if (passStatus === 'pass') {
    const existingCertificate = await assertSupabaseResult(
      supabase
        .from('training_assessment_certificates')
        .select('*')
        .eq('trainee_id', sessionUser.userId)
        .eq('category_id', category.id)
        .maybeSingle(),
      'Unable to verify certificate state.',
    ) as TrainingCertificateRow | null

    const certificateRow = existingCertificate || (await assertSupabaseResult(
      supabase
        .from('training_assessment_certificates')
        .insert({
          trainee_id: sessionUser.userId,
          category_id: category.id,
          assessment_id: assessment.id,
          attempt_id: insertedAttempt.id,
          certificate_code: createCertificateCode(),
        })
        .select('*')
        .single(),
      'Unable to issue the assessment certificate.',
    ) as TrainingCertificateRow)

    certificate = buildCertificateRecord(
      certificateRow,
      new Map([[category.id, {
        id: category.id,
        title: category.title,
        description: category.description,
        passingScore: category.passing_score,
        createdBy: category.created_by,
        isArchived: category.is_archived,
        createdAt: category.created_at,
        updatedAt: category.updated_at,
        assignmentCount: 0,
        attemptCount: 0,
        passRate: 0,
        averageScore: 0,
        assessments: [],
      }]]),
      new Map([[assessment.id, {
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
      }]]),
    )
  }

  const attempt = buildAttemptRecord({
    id: insertedAttempt.id,
    assignment_id: insertedAttempt.assignment_id,
    assessment_id: assessment.id,
    category_id: category.id,
    trainee_id: sessionUser.userId,
    batch_id: insertedAttempt.batch_id,
    attempt_no: insertedAttempt.attempt_no,
    score: insertedAttempt.score,
    status: insertedAttempt.status,
    feedback: insertedAttempt.feedback,
    trainer_note: insertedAttempt.trainer_note,
    submitted_at: insertedAttempt.submitted_at,
    question_results: insertedAttempt.question_results || scored.questionResults,
    category_title: category.title,
    assessment_title: assessment.title,
    trainee_name: sessionUser.userName,
    trainee_email: null,
    batch_name: null,
    certificate_id: certificate?.id,
    certificate_code: certificate?.certificateCode,
  })

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
        coached_by: sessionUser.userId,
        coached_at: new Date().toISOString(),
      })
      .eq('id', payload.attemptId),
    'Unable to update attempt feedback.',
  )

  const insertedNote = await assertSupabaseResult(
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
  ) as TrainingCoachingRow

  return {
    id: insertedNote.id,
    attemptId: insertedNote.attempt_id,
    trainerId: insertedNote.trainer_id,
    traineeId: insertedNote.trainee_id,
    note: insertedNote.note,
    actionItems: insertedNote.action_items,
    visibility: insertedNote.visibility,
    createdAt: insertedNote.created_at,
    updatedAt: insertedNote.updated_at,
  } satisfies CoachingNoteRecord
}
