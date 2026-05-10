'use client'

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'

async function apiCall<T>(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: any): Promise<T> {
  const url = `${API_BASE_URL}/api/assessment${endpoint}`
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(url, options)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `API error: ${response.status}`)
  }

  return response.json()
}

// ==================== CATEGORY OPERATIONS ====================

export async function fetchCategories(trainerId: string) {
  try {
    return await apiCall<any[]>(`/trainer/categories?trainer_id=${trainerId}`)
  } catch (error) {
    console.error('Failed to fetch categories:', error)
    return []
  }
}

export async function createCategory(payload: {
  category_name: string
  description?: string
  passing_score?: number
  trainer_id: string
}) {
  return await apiCall('/trainer/categories', 'POST', payload)
}

export async function updateCategory(categoryId: string, payload: {
  category_name?: string
  description?: string
  passing_score?: number
}) {
  return await apiCall(`/trainer/categories/${categoryId}`, 'PUT', payload)
}

// ==================== QUESTION OPERATIONS ====================

export async function fetchQuestions(categoryId: string) {
  try {
    return await apiCall<any[]>(`/trainer/questions?category_id=${categoryId}`)
  } catch (error) {
    console.error('Failed to fetch questions:', error)
    return []
  }
}

export async function createQuestion(payload: {
  category_id: string
  question_number: number
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
  explanation?: string
  created_by: string
}) {
  return await apiCall('/trainer/questions', 'POST', payload)
}

// ==================== ASSIGNMENT OPERATIONS ====================

export async function createAssignment(payload: {
  trainer_id: string
  category_id: string
  assignment_title: string
  assignment_description?: string
  passing_score?: number
  target_scope: 'batch' | 'wave' | 'trainee'
  batch_id?: string | null
  wave_number?: number | null
  trainee_id?: string | null
  question_ids?: string[]
  maximum_attempts?: number | null
  time_limit_minutes?: number | null
  shuffle_choices?: boolean
  shuffle_questions?: boolean
  due_date?: string | null
}) {
  return await apiCall('/trainer/assignments', 'POST', payload)
}

// ==================== TRAINEE ASSESSMENT OPERATIONS ====================

export async function fetchAvailableAssignments(traineeId: string) {
  try {
    return await apiCall<any[]>(`/trainee/available?trainee_id=${traineeId}`)
  } catch (error) {
    console.error('Failed to fetch assignments:', error)
    return []
  }
}

export async function fetchAssignmentQuestions(assignmentId: string) {
  try {
    const questions = await apiCall<any[]>(`/trainee/assignments/${assignmentId}`)
    
    // Randomize answer order for display
    return questions.map(q => ({
      id: q.id,
      question_number: q.question_number,
      question_text: q.question_text,
      options: shuffleArray([
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
      ]),
    }))
  } catch (error) {
    console.error('Failed to fetch questions:', error)
    return []
  }
}

export async function submitAssessmentAttempt(payload: {
  assignment_id: string | null
  category_id: string
  trainee_id: string
  attempt_number: number
  answers: Record<string, string>
  time_spent_seconds: number
  question_snapshot: any
  choice_snapshot: any
}) {
  const result = await apiCall<any>('/trainee/attempts/submit', 'POST', payload)
  return {
    attempt_id: result.id,
    score: result.score_percentage,
    passed: result.pass_fail === 'pass',
    correct_answers: result.correct_answers,
    total_questions: result.total_questions,
    analysis_summary: result.analysis_summary,
  }
}

export async function fetchTraineeCertificates(traineeId: string) {
  try {
    return await apiCall<any[]>(`/trainee/certificates?trainee_id=${traineeId}`)
  } catch (error) {
    console.error('Failed to fetch certificates:', error)
    return []
  }
}

// ==================== TRAINER PROGRESS ====================

export async function fetchTrainerProgress(trainerId: string) {
  try {
    return await apiCall<any[]>(`/trainer/progress?trainer_id=${trainerId}`)
  } catch (error) {
    console.error('Failed to fetch progress:', error)
    return []
  }
}

// ==================== CSV BULK UPLOAD OPERATIONS ====================

export async function downloadCSVTemplate() {
  // Download CSV template for bulk question upload
  try {
    const response = await apiCall<{ template: string; filename: string }>('/trainer/csv-template', 'GET')
    return response
  } catch (error) {
    console.error('Failed to download CSV template:', error)
    throw error
  }
}

export async function uploadQuestionsCSV(
  categoryId: string,
  file: File
): Promise<{
  status: string
  total_rows: number
  successful: number
  failed: number
  created_question_ids: string[]
  errors: Array<{ row: number; question_number: string; error: string }>
  message: string
}> {
  // Upload CSV file with multiple questions
  try {
    const url = `${API_BASE_URL}/api/assessment/trainer/bulk-upload?category_id=${encodeURIComponent(categoryId)}`
    
    // Use FormData for file upload
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - browser will set it with boundary
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || `Upload error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Failed to upload CSV:', error)
    throw error
  }
}

// ==================== HELPER FUNCTIONS ====================

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}
