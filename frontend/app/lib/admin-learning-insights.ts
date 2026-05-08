export type AdminLearningFilterState = {
  trainerId: string
  batchId: string
  traineeId: string
  moduleId: string
  assessmentId: string
  exerciseId: string
  completionStatus: string
  performanceLevel: string
  startDate: string
  endDate: string
}

export type AdminLearningInsightsResponse = {
  scope: {
    trainer_id?: string | null
    batch_id?: string | null
    trainee_id?: string | null
    module_id?: string | null
    assessment_id?: string | null
    exercise_id?: string | null
    completion_status?: string | null
    performance_level?: string | null
    start_date?: string | null
    end_date?: string | null
    label: string
  }
  filters: {
    trainers: Array<{
      id: string
      name: string
      email: string
      batch_count: number
      trainee_count: number
    }>
    batches: Array<{
      id: string
      label: string
      trainer_id?: string | null
      trainer_name?: string | null
      trainee_count: number
    }>
    trainees: Array<{
      id: string
      name: string
      email: string
      batch_ids: string[]
      batch_labels: string[]
      trainer_ids: string[]
      trainer_names: string[]
    }>
    modules: Array<{
      id: string
      title: string
      module_type?: string | null
      topic_category_name?: string | null
      created_by?: string | null
      created_by_name?: string | null
    }>
    assessments: Array<{
      id: string
      title: string
      category_name?: string | null
      assigned_by?: string | null
      assigned_by_name?: string | null
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
      created_by?: string | null
      created_by_name?: string | null
    }>
  }
  summary: {
    total_trainers: number
    total_batches: number
    total_trainees: number
    trainer_created_modules: number
    assigned_module_records: number
    assigned_assessment_records: number
    completed_modules: number
    in_progress_modules: number
    pending_modules: number
    completed_assessments: number
    pending_assessments: number
    completion_rate: number
    average_assessment_score: number
    average_exercise_score: number
    overall_score: number
    pass_rate: number
    total_attempts: number
    passed_modules: number
    passed_assessments: number
    certificates_issued: number
  }
  completion_breakdown: Array<{
    label: string
    count: number
  }>
  performance_breakdown: Array<{
    level: string
    label: string
    count: number
  }>
  trainer_comparison: Array<{
    trainer_id: string
    trainer_name: string
    trainee_count: number
    batch_count: number
    trainer_created_modules: number
    assigned_items: number
    completed_items: number
    completion_rate: number
    pass_rate: number
    average_exercise_score: number
    average_assessment_score: number
    overall_score: number
    performance_level?: string | null
    certificates_issued: number
    total_attempts: number
  }>
  top_trainers: Array<{
    trainer_id: string
    trainer_name: string
    trainee_count: number
    batch_count: number
    trainer_created_modules: number
    assigned_items: number
    completed_items: number
    completion_rate: number
    pass_rate: number
    average_exercise_score: number
    average_assessment_score: number
    overall_score: number
    performance_level?: string | null
    certificates_issued: number
    total_attempts: number
  }>
  at_risk_trainers: Array<{
    trainer_id: string
    trainer_name: string
    trainee_count: number
    batch_count: number
    trainer_created_modules: number
    assigned_items: number
    completed_items: number
    completion_rate: number
    pass_rate: number
    average_exercise_score: number
    average_assessment_score: number
    overall_score: number
    performance_level?: string | null
    certificates_issued: number
    total_attempts: number
  }>
  batch_comparison: Array<{
    batch_id: string
    batch_label: string
    trainer_id?: string | null
    trainer_name?: string | null
    trainee_count: number
    assigned_items: number
    completed_items: number
    completion_rate: number
    pass_rate: number
    average_exercise_score: number
    average_assessment_score: number
    overall_score: number
    performance_level?: string | null
    total_attempts: number
  }>
  top_batches: Array<{
    batch_id: string
    batch_label: string
    trainer_id?: string | null
    trainer_name?: string | null
    trainee_count: number
    assigned_items: number
    completed_items: number
    completion_rate: number
    pass_rate: number
    average_exercise_score: number
    average_assessment_score: number
    overall_score: number
    performance_level?: string | null
    total_attempts: number
  }>
  at_risk_batches: Array<{
    batch_id: string
    batch_label: string
    trainer_id?: string | null
    trainer_name?: string | null
    trainee_count: number
    assigned_items: number
    completed_items: number
    completion_rate: number
    pass_rate: number
    average_exercise_score: number
    average_assessment_score: number
    overall_score: number
    performance_level?: string | null
    total_attempts: number
  }>
  trainee_ranking: Array<{
    trainee_id: string
    trainee_name: string
    batch_id?: string | null
    batch_label: string
    trainer_names: string[]
    overall_score: number
    performance_level?: string | null
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
    created_by?: string | null
    created_by_name?: string | null
    assigned_count: number
    completed_count: number
    pending_count: number
    in_progress_count: number
    completion_rate: number
    pass_rate: number
    average_score: number
    performance_level?: string | null
    latest_activity_at?: string | null
  }>
  weakest_modules: Array<{
    module_id: string
    module_title: string
    module_type?: string | null
    topic_category_name?: string | null
    created_by?: string | null
    created_by_name?: string | null
    assigned_count: number
    completed_count: number
    pending_count: number
    in_progress_count: number
    completion_rate: number
    pass_rate: number
    average_score: number
    performance_level?: string | null
    latest_activity_at?: string | null
  }>
  assessment_performance: Array<{
    assessment_id: string
    assessment_title: string
    category_id?: string | null
    category_name: string
    assigned_by?: string | null
    assigned_by_name?: string | null
    assigned_count: number
    completed_count: number
    average_score: number
    performance_level?: string | null
    pass_rate: number
  }>
  weakest_assessment_areas: Array<{
    category_id?: string | null
    category_name: string
    assigned_count: number
    completed_count: number
    average_score: number
    performance_level?: string | null
    pass_rate: number
  }>
  exercise_performance: Array<{
    exercise_filter_id: string
    exercise_id: string
    exercise_title: string
    exercise_type: string
    module_id: string
    module_title: string
    trainer_ids: string[]
    trainer_names: string[]
    assigned_count: number
    attempt_count: number
    completion_rate: number
    average_score: number
    performance_level?: string | null
  }>
  trainees_needing_improvement: Array<{
    trainee_id: string
    trainee_name: string
    batch_id?: string | null
    batch_label: string
    trainer_names: string[]
    overall_score: number
    performance_level?: string | null
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
    trainer_id?: string | null
    trainer_name?: string | null
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
    completion_status: string
    completion_percentage: number
    average_score: number
    score_value?: number | null
    performance_level?: string | null
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
    assigned_by?: string | null
    assigned_by_name?: string | null
    module_created_by?: string | null
    module_created_by_name?: string | null
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
    completion_status: string
    is_passed: boolean
    score_percentage?: number | null
    score_value?: number | null
    performance_level?: string | null
    attempt_count: number
    question_count: number
    passing_threshold: number
    certificate_id?: string | null
    certificate_no?: string | null
    due_date?: string | null
    assigned_by?: string | null
    assigned_by_name?: string | null
  }>
  ai_analysis: {
    overview: string
    trainer_effectiveness: string[]
    batch_performance: string[]
    module_and_assessment: string[]
    exercise_performance: string[]
    weak_areas: string[]
    opportunities: string[]
    recommended_actions: string[]
  }
}

export const ADMIN_COMPLETION_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
] as const

export const ADMIN_PERFORMANCE_LEVEL_OPTIONS = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'developing', label: 'Developing' },
  { value: 'at_risk', label: 'At Risk' },
] as const

export const EMPTY_ADMIN_LEARNING_FILTERS: AdminLearningFilterState = {
  trainerId: '',
  batchId: '',
  traineeId: '',
  moduleId: '',
  assessmentId: '',
  exerciseId: '',
  completionStatus: '',
  performanceLevel: '',
  startDate: '',
  endDate: '',
}

export function buildAdminLearningInsightsUrl(filters: AdminLearningFilterState) {
  const params = new URLSearchParams()

  if (filters.trainerId) params.set('trainer_id', filters.trainerId)
  if (filters.batchId) params.set('batch_id', filters.batchId)
  if (filters.traineeId) params.set('trainee_id', filters.traineeId)
  if (filters.moduleId) params.set('module_id', filters.moduleId)
  if (filters.assessmentId) params.set('assessment_id', filters.assessmentId)
  if (filters.exerciseId) params.set('exercise_id', filters.exerciseId)
  if (filters.completionStatus) params.set('completion_status', filters.completionStatus)
  if (filters.performanceLevel) params.set('performance_level', filters.performanceLevel)
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)

  const query = params.toString()
  return `/api/analytics/admin/learning-insights${query ? `?${query}` : ''}`
}
