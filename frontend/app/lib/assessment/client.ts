'use client'

import { normalizeConnectivityError } from '@/app/utils/runtime-errors'

import type {
  CoachAttemptPayload,
  CreateAssessmentPayload,
  CreateAssignmentPayload,
  CreateCategoryPayload,
  CreateQuestionPayload,
  SubmitAssessmentPayload,
  SubmitAssessmentResponse,
  TraineeDashboardResponse,
  TrainerBootstrapResponse,
  UpdateAssessmentPayload,
  UpdateCategoryPayload,
  UpdateQuestionPayload,
} from './types'

function getToken() {
  return window.localStorage.getItem('token')
}

function getJsonErrorMessage(payload: unknown) {
  const candidate = payload as { error?: string; detail?: string; message?: string } | null
  return candidate?.error || candidate?.detail || candidate?.message || 'Assessment request failed.'
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  let response: Response
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    })
  } catch (error) {
    throw normalizeConnectivityError(error)
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(getJsonErrorMessage(payload))
  }

  return payload as T
}

export function fetchTrainerAssessmentBootstrap() {
  return request<TrainerBootstrapResponse>('/api/assessment-module/trainer/bootstrap')
}

export function fetchTraineeAssessmentDashboard() {
  return request<TraineeDashboardResponse>('/api/assessment-module/trainee/dashboard')
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

export async function downloadTrainerAssessmentCsv() {
  const token = getToken()
  const response = await fetch('/api/assessment-module/trainer/export/csv', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
  const fileName = fileNameMatch?.[1] || 'training-assessment-report.csv'

  anchor.href = downloadUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(downloadUrl)
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
