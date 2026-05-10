'use client'

import { normalizeConnectivityError } from '@/app/utils/runtime-errors'

import type {
    BulkUploadQuestionsResponse,
    CoachAttemptPayload,
    CreateAssessmentPayload,
    CreateAssignmentPayload,
    CreateCategoryPayload,
    CreateQuestionPayload,
    SubmitAssessmentPayload,
    SubmitAssessmentResponse,
    TraineeAssessmentSession,
    TraineeDashboardResponse,
    TrainerBootstrapResponse,
    UpdateAssessmentPayload,
    UpdateAssignmentPayload,
    UpdateCategoryPayload,
    UpdateQuestionPayload,
} from './types'

const DEFAULT_RETRY_COUNT = 3
const DEFAULT_RETRY_DELAY_MS = 1000

function getToken() {
  return window.localStorage.getItem('token')
}

function getJsonErrorMessage(payload: unknown) {
  const candidate = payload as { error?: string; detail?: string; message?: string } | null
  return candidate?.error || candidate?.detail || candidate?.message || 'Assessment request failed.'
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(input: string, init?: RequestInit, retryCount = 0): Promise<T> {
  const token = getToken()
  const headers = new Headers(init?.headers || undefined)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const isFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData
  if (!isFormDataBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    })
  } catch (error) {
    const normalizedError = normalizeConnectivityError(error)
    if (retryCount < DEFAULT_RETRY_COUNT && (error instanceof TypeError || error instanceof Error)) {
      await sleep(DEFAULT_RETRY_DELAY_MS * (retryCount + 1))
      return request<T>(input, init, retryCount + 1)
    }
    throw normalizedError
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const errorMessage = getJsonErrorMessage(payload)
    const error = new Error(errorMessage)
    Object.defineProperty(error, 'status', { value: response.status })
    throw error
  }

  return payload as T
}

async function downloadBlob(input: string, fallbackFileName: string) {
  const token = getToken()
  const headers = new Headers()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, {
    headers,
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(getJsonErrorMessage(payload))
  }

  const blob = await response.blob()
  const downloadUrl = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const disposition = response.headers.get('content-disposition') || ''
  const fileNameMatch = disposition.match(/filename="?([^"]+)"?$/i)
  const fileName = fileNameMatch?.[1] || fallbackFileName

  anchor.href = downloadUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(downloadUrl)
}

export function fetchTrainerAssessmentBootstrap() {
  return request<TrainerBootstrapResponse>('/api/assessment-module/trainer/bootstrap')
}

export function fetchTraineeAssessmentDashboard() {
  return request<TraineeDashboardResponse>('/api/assessment-module/trainee/dashboard')
}

export function fetchTraineeAssessmentSession(assignmentId: string) {
  return request<TraineeAssessmentSession>(`/api/assessment-module/trainee/assignments/${assignmentId}`)
}

export function createAssessmentCategory(payload: CreateCategoryPayload) {
  return request('/api/assessment-module/trainer/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAssessmentCategory(categoryId: string, payload: UpdateCategoryPayload) {
  return request(`/api/assessment-module/trainer/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function archiveAssessmentCategory(categoryId: string) {
  return request(`/api/assessment-module/trainer/categories/${categoryId}`, {
    method: 'DELETE',
  })
}

export function createAssessmentDefinition(payload: CreateAssessmentPayload) {
  return request('/api/assessment-module/trainer/assessments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAssessmentDefinition(assessmentId: string, payload: UpdateAssessmentPayload) {
  return request(`/api/assessment-module/trainer/assessments/${assessmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteAssessmentDefinition(assessmentId: string) {
  return request(`/api/assessment-module/trainer/assessments/${assessmentId}`, {
    method: 'DELETE',
  })
}

export function createAssessmentQuestion(payload: CreateQuestionPayload) {
  return request('/api/assessment-module/trainer/questions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAssessmentQuestion(questionId: string, payload: UpdateQuestionPayload) {
  return request(`/api/assessment-module/trainer/questions/${questionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteAssessmentQuestion(questionId: string) {
  return request(`/api/assessment-module/trainer/questions/${questionId}`, {
    method: 'DELETE',
  })
}

export function createAssessmentAssignment(payload: CreateAssignmentPayload) {
  return request('/api/assessment-module/trainer/assignments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateAssessmentAssignment(assignmentId: string, payload: UpdateAssignmentPayload) {
  return request(`/api/assessment-module/trainer/assignments/${assignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteAssessmentAssignment(assignmentId: string) {
  return request(`/api/assessment-module/trainer/assignments/${assignmentId}`, {
    method: 'DELETE',
  })
}

export function submitAssessmentAttemptRequest(payload: SubmitAssessmentPayload) {
  return request<SubmitAssessmentResponse>('/api/assessment-module/trainee/attempts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function coachAssessmentAttemptRequest(payload: CoachAttemptPayload) {
  return request('/api/assessment-module/trainer/coach', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function bulkUploadAssessmentQuestions(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  return request<BulkUploadQuestionsResponse>('/api/assessment-module/trainer/questions/bulk-upload', {
    method: 'POST',
    body: formData,
  })
}

export function downloadAssessmentCsvTemplate() {
  return downloadBlob('/api/assessment-module/trainer/questions/template', 'assessment-question-template.csv')
}

export function downloadTrainerAssessmentCsv() {
  return downloadBlob('/api/assessment-module/trainer/export/csv', 'assessment-module-report.csv')
}

export function openTrainerAssessmentStream() {
  const token = getToken()
  if (!token) {
    throw new Error('Missing session token.')
  }

  return new EventSource(`/api/assessment-module/trainer/stream?token=${encodeURIComponent(token)}`)
}

export function openTraineeAssessmentStream() {
  const token = getToken()
  if (!token) {
    throw new Error('Missing session token.')
  }

  return new EventSource(`/api/assessment-module/trainee/stream?token=${encodeURIComponent(token)}`)
}
