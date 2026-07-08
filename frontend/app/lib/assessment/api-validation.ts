/**
 * Assessment Module API Validation
 * Provides validation for API responses and request payloads
 */

import { AssessmentError } from './error-handling'

/**
 * Validates that an API response has the expected structure
 */
export function validateApiResponse<T>(
  data: unknown,
  expectedKeys: (keyof T)[],
  context: string,
): T {
  if (!data || typeof data !== 'object') {
    throw new AssessmentError(
      'INVALID_RESPONSE',
      `Invalid API response for ${context}: expected object, got ${typeof data}`,
      500,
      { context, receivedType: typeof data },
    )
  }

  const dataObj = data as Record<string, unknown>
  const missingKeys = expectedKeys.filter((key) => !(key in dataObj))

  if (missingKeys.length > 0) {
    throw new AssessmentError(
      'INVALID_RESPONSE',
      `Invalid API response for ${context}: missing required fields ${missingKeys.join(', ')}`,
      500,
      { context, missingKeys },
    )
  }

  return data as T
}

/**
 * Validates array response from API
 */
export function validateArrayResponse<T>(
  data: unknown,
  context: string,
): T[] {
  if (!Array.isArray(data)) {
    throw new AssessmentError(
      'INVALID_RESPONSE',
      `Invalid API response for ${context}: expected array, got ${typeof data}`,
      500,
      { context, receivedType: typeof data },
    )
  }

  return data as T[]
}

/**
 * Validates category payload before submission
 */
export function validateCategoryPayload(payload: unknown): { title: string; description?: string | null; passingScore: number } {
  if (!payload || typeof payload !== 'object') {
    throw new AssessmentError(
      'INVALID_INPUT',
      'Category payload must be an object',
      400,
      { receivedType: typeof payload },
    )
  }

  const obj = payload as Record<string, unknown>

  if (typeof obj.title !== 'string' || !obj.title.trim()) {
    throw new AssessmentError(
      'MISSING_REQUIRED_FIELD',
      'Category title is required',
      400,
    )
  }

  if (typeof obj.passingScore !== 'number' || obj.passingScore < 0 || obj.passingScore > 100) {
    throw new AssessmentError(
      'INVALID_INPUT',
      'Passing score must be a number between 0 and 100',
      400,
    )
  }

  return {
    title: obj.title.trim(),
    description: obj.description ? String(obj.description).trim() : null,
    passingScore: obj.passingScore,
  }
}

/**
 * Validates question payload before submission
 */
export function validateQuestionPayload(payload: unknown): {
  categoryId: string
  questionText: string
  options: string[]
  correctAnswer: string
  explanation?: string | null
  orderIndex: number
} {
  if (!payload || typeof payload !== 'object') {
    throw new AssessmentError(
      'INVALID_INPUT',
      'Question payload must be an object',
      400,
    )
  }

  const obj = payload as Record<string, unknown>

  if (typeof obj.categoryId !== 'string' || !obj.categoryId.trim()) {
    throw new AssessmentError(
      'MISSING_REQUIRED_FIELD',
      'Category ID is required',
      400,
    )
  }

  if (typeof obj.questionText !== 'string' || !obj.questionText.trim()) {
    throw new AssessmentError(
      'MISSING_REQUIRED_FIELD',
      'Question text is required',
      400,
    )
  }

  if (!Array.isArray(obj.options) || obj.options.length !== 4) {
    throw new AssessmentError(
      'INVALID_INPUT',
      'Question must have exactly 4 options',
      400,
    )
  }

  if (obj.options.some((opt) => typeof opt !== 'string' || !opt.trim())) {
    throw new AssessmentError(
      'INVALID_INPUT',
      'All options must be non-empty strings',
      400,
    )
  }

  if (typeof obj.correctAnswer !== 'string' || !obj.correctAnswer.trim()) {
    throw new AssessmentError(
      'MISSING_REQUIRED_FIELD',
      'Correct answer is required',
      400,
    )
  }

  if (!obj.options.map((o: string) => o.trim().toLowerCase()).includes(obj.correctAnswer.trim().toLowerCase())) {
    throw new AssessmentError(
      'INVALID_INPUT',
      'Correct answer must match one of the provided options',
      400,
    )
  }

  return {
    categoryId: obj.categoryId.trim(),
    questionText: obj.questionText.trim(),
    options: (obj.options as string[]).map((o) => o.trim()),
    correctAnswer: obj.correctAnswer.trim(),
    explanation: obj.explanation ? String(obj.explanation).trim() : null,
    orderIndex: typeof obj.orderIndex === 'number' ? obj.orderIndex : 0,
  }
}

/**
 * Validates assessment submission payload
 */
export function validateSubmissionPayload(payload: unknown): {
  assignmentId?: string
  assessmentId?: string
  answers: Record<string, string>
  timeSpentSeconds?: number
  startedAt?: string
} {
  if (!payload || typeof payload !== 'object') {
    throw new AssessmentError(
      'INVALID_INPUT',
      'Submission payload must be an object',
      400,
    )
  }

  const obj = payload as Record<string, unknown>

  if (!obj.assignmentId && !obj.assessmentId) {
    throw new AssessmentError(
      'MISSING_REQUIRED_FIELD',
      'Either assignment ID or assessment ID is required',
      400,
    )
  }

  if (!obj.answers || typeof obj.answers !== 'object') {
    throw new AssessmentError(
      'INVALID_INPUT',
      'Answers must be an object',
      400,
    )
  }

  if (Object.keys(obj.answers).length === 0) {
    throw new AssessmentError(
      'INVALID_INPUT',
      'At least one answer is required',
      400,
    )
  }

  return {
    assignmentId: obj.assignmentId ? String(obj.assignmentId) : undefined,
    assessmentId: obj.assessmentId ? String(obj.assessmentId) : undefined,
    answers: obj.answers as Record<string, string>,
    timeSpentSeconds: typeof obj.timeSpentSeconds === 'number' ? obj.timeSpentSeconds : 0,
    startedAt: obj.startedAt ? String(obj.startedAt) : undefined,
  }
}

/**
 * Type guard for successful API response
 */
export function isApiErrorResponse(response: unknown): response is { error?: string; detail?: string; message?: string } {
  if (!response || typeof response !== 'object') {
    return false
  }

  const obj = response as Record<string, unknown>
  return 'error' in obj || 'detail' in obj || 'message' in obj
}

/**
 * Validates that a value is a valid UUID
 */
export function isValidUUID(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

/**
 * Sanitizes user input to prevent injection attacks
 */
export function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') {
    return ''
  }

  return input
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, 5000)
}
