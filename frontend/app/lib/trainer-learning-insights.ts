export type TrainerLearningFilterState = {
  batchId: string
  traineeId: string
  moduleId: string
  assessmentId: string
  exerciseId: string
  startDate: string
  endDate: string
}

export type TrainerLearningInsightsResponse = {
  scope: {
    batch_id?: string | null
    trainee_id?: string | null
    module_id?: string | null
    assessment_id?: string | null
    exercise_id?: string | null
    start_date?: string | null
    end_date?: string | null
    label: string
  }
  filters: {
    batches: Array<{
      id: string
      label: string
      trainee_count: number
    }>
    trainees: Array<{
      id: string
      name: string
      email: string
      batch_ids: string[]
      batch_labels: string[]
    }>
    modules: Array<{
      id: string
      title: string
      module_type?: string | null
      topic_category_name?: string | null
    }>
    assessments: Array<{
      id: string
      title: string
      category_name?: string | null
      assigned_batch_id?: string | null
      assigned_user_id?: string | null
    }>
    exercises: Array<{
      id: string
      exercise_id: string
      title: string
      type: string
      module_id: string
      module_title: string
    }>
  }
  summary: {
    trainer_created_modules: number
    trainer_assigned_modules: number
    total_trainees: number
    assigned_module_records: number
    assigned_assessment_records: number
    completed_modules: number
    pending_modules: number
    completion_rate: number
    average_assessment_score: number
    average_exercise_score: number
    pass_rate: number
    total_attempts: number
    passed_modules: number
    passed_assessments: number
    completed_assessments: number
  }
  batch_comparison: Array<{
    batch_id: string
    batch_label: string
    trainee_count: number
    assigned_items: number
    completed_items: number
    completion_rate: number
    pass_rate: number
    average_exercise_score: number
    average_assessment_score: number
    overall_score: number
    total_attempts: number
  }>
  trainee_ranking: Array<{
    trainee_id: string
    trainee_name: string
    batch_id?: string | null
    batch_label: string
    overall_score: number
    average_exercise_score: number
    average_assessment_score: number
    module_completion_rate: number
    completion_rate: number
    pass_rate: number
    module_assigned: number
    module_completed: number
    assessment_assigned: number
    assessment_completed: number
    total_attempts: number
    latest_activity_at?: string | null
  }>
  score_distribution: Array<{
    range_label: string
    count: number
  }>
  module_progress: Array<{
    module_id: string
    module_title: string
    module_type?: string | null
    topic_category_name?: string | null
    assigned_count: number
    completed_count: number
    pending_count: number
    completion_rate: number
    pass_rate: number
    average_score: number
    latest_activity_at?: string | null
  }>
  weakest_modules: Array<{
    module_id: string
    module_title: string
    module_type?: string | null
    topic_category_name?: string | null
    assigned_count: number
    completed_count: number
    pending_count: number
    completion_rate: number
    pass_rate: number
    average_score: number
    latest_activity_at?: string | null
  }>
  weakest_assessment_areas: Array<{
    category_id?: string | null
    category_name: string
    assigned_count: number
    completed_count: number
    average_score: number
    pass_rate: number
  }>
  exercise_performance: Array<{
    exercise_filter_id: string
    exercise_id: string
    exercise_title: string
    exercise_type: string
    module_id: string
    module_title: string
    assigned_count: number
    attempt_count: number
    completion_rate: number
    average_score: number
  }>
  trainees_needing_improvement: Array<{
    trainee_id: string
    trainee_name: string
    batch_id?: string | null
    batch_label: string
    overall_score: number
    average_exercise_score: number
    average_assessment_score: number
    module_completion_rate: number
    completion_rate: number
    pass_rate: number
    module_assigned: number
    module_completed: number
    assessment_assigned: number
    assessment_completed: number
    total_attempts: number
    latest_activity_at?: string | null
  }>
  recent_activity: Array<{
    id: string
    activity_type: string
    title: string
    detail: string
    trainee_id?: string | null
    trainee_name?: string | null
    batch_id?: string | null
    batch_label?: string | null
    score?: number | null
    status?: string | null
    activity_at?: string | null
  }>
  module_assignments: Array<{
    id: string
    module_id: string
    module_title: string
    module_type?: string | null
    topic_category_name?: string | null
    trainee_id: string
    trainee_name?: string | null
    batch_id?: string | null
    batch_label: string
    status: string
    completion_percentage: number
    average_score: number
    is_passed: boolean
    attempt_number: number
    retake_count: number
    exercise_count: number
    completed_exercises: number
    assigned_at?: string | null
    started_at?: string | null
    completed_at?: string | null
    activity_at?: string | null
    certificate_id?: string | null
    certificate_no?: string | null
  }>
  assessment_results: Array<{
    id: string
    assessment_id: string
    assessment_title: string
    category_id?: string | null
    category_name: string
    trainee_id: string
    trainee_name: string
    batch_id?: string | null
    batch_label: string
    assigned_at?: string | null
    submitted_at?: string | null
    activity_at?: string | null
    status: string
    is_passed: boolean
    score_percentage?: number | null
    attempt_count: number
    question_count: number
    passing_threshold: number
    certificate_id?: string | null
    certificate_no?: string | null
    due_date?: string | null
  }>
  ai_analysis: {
    headline: string
    strengths: string[]
    weak_areas: string[]
    recommended_actions: string[]
  }
}

export const EMPTY_TRAINER_LEARNING_FILTERS: TrainerLearningFilterState = {
  batchId: '',
  traineeId: '',
  moduleId: '',
  assessmentId: '',
  exerciseId: '',
  startDate: '',
  endDate: '',
}

export function buildTrainerLearningInsightsUrl(filters: TrainerLearningFilterState) {
  const params = new URLSearchParams()

  if (filters.batchId) params.set('batch_id', filters.batchId)
  if (filters.traineeId) params.set('trainee_id', filters.traineeId)
  if (filters.moduleId) params.set('module_id', filters.moduleId)
  if (filters.assessmentId) params.set('assessment_id', filters.assessmentId)
  if (filters.exerciseId) params.set('exercise_id', filters.exerciseId)
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)

  const query = params.toString()
  return `/api/analytics/trainer/learning-insights${query ? `?${query}` : ''}`
}

export function buildTrainerLearningInsightsPdfUrl(filters: TrainerLearningFilterState) {
  const params = new URLSearchParams()

  if (filters.batchId) params.set('batch_id', filters.batchId)
  if (filters.traineeId) params.set('trainee_id', filters.traineeId)
  if (filters.moduleId) params.set('module_id', filters.moduleId)
  if (filters.assessmentId) params.set('assessment_id', filters.assessmentId)
  if (filters.exerciseId) params.set('exercise_id', filters.exerciseId)
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)

  const query = params.toString()
  return `/api/analytics/trainer/learning-insights/pdf${query ? `?${query}` : ''}`
}
