/**
 * Assessment Module Error Handling
 * Provides comprehensive error management and user-friendly messages
 */

export class AssessmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message)
    Object.setPrototypeOf(this, AssessmentError.prototype)
  }
}

export type ErrorSeverity = 'error' | 'warning' | 'info'

export interface ErrorInfo {
  title: string
  message: string
  severity: ErrorSeverity
  code: string
  recoverable: boolean
  action?: string
}

const ERROR_MESSAGES: Record<string, { title: string; message: string; severity: ErrorSeverity; recoverable: boolean }> = {
  // Network errors
  NETWORK_ERROR: {
    title: 'Connection Error',
    message: 'Unable to connect to the server. Please check your internet connection.',
    severity: 'error',
    recoverable: true,
  },
  TIMEOUT_ERROR: {
    title: 'Request Timeout',
    message: 'The request took too long. Please try again.',
    severity: 'error',
    recoverable: true,
  },

  // Authentication errors
  UNAUTHORIZED: {
    title: 'Authentication Required',
    message: 'Your session has expired. Please log in again.',
    severity: 'error',
    recoverable: true,
  },
  FORBIDDEN: {
    title: 'Access Denied',
    message: 'You do not have permission to perform this action.',
    severity: 'error',
    recoverable: false,
  },

  // Resource errors
  NOT_FOUND: {
    title: 'Resource Not Found',
    message: 'The requested resource could not be found.',
    severity: 'error',
    recoverable: false,
  },
  ALREADY_EXISTS: {
    title: 'Already Exists',
    message: 'This resource already exists.',
    severity: 'warning',
    recoverable: false,
  },

  // Validation errors
  INVALID_INPUT: {
    title: 'Invalid Input',
    message: 'Please check your input and try again.',
    severity: 'warning',
    recoverable: true,
  },
  MISSING_REQUIRED_FIELD: {
    title: 'Missing Required Field',
    message: 'Please fill in all required fields.',
    severity: 'warning',
    recoverable: true,
  },

  // Assessment-specific errors
  ASSESSMENT_ALREADY_COMPLETED: {
    title: 'Assessment Already Completed',
    message: 'This assessment has already been completed successfully.',
    severity: 'info',
    recoverable: false,
  },
  MAXIMUM_ATTEMPTS_EXCEEDED: {
    title: 'Maximum Attempts Exceeded',
    message: 'You have reached the maximum number of attempts for this assessment.',
    severity: 'warning',
    recoverable: false,
  },
  INVALID_ANSWERS: {
    title: 'Invalid Answers',
    message: 'Some of your answers are invalid. Please review and try again.',
    severity: 'warning',
    recoverable: true,
  },
  ASSESSMENT_NOT_ASSIGNED: {
    title: 'Assessment Not Assigned',
    message: 'This assessment has not been assigned to you.',
    severity: 'error',
    recoverable: false,
  },

  // Database/Server errors
  DATABASE_ERROR: {
    title: 'Database Error',
    message: 'An error occurred while accessing the database. Please try again later.',
    severity: 'error',
    recoverable: true,
  },
  SERVER_ERROR: {
    title: 'Server Error',
    message: 'An unexpected error occurred. Please try again later.',
    severity: 'error',
    recoverable: true,
  },

  // Generic errors
  UNKNOWN_ERROR: {
    title: 'Unknown Error',
    message: 'An unexpected error occurred. Please try again.',
    severity: 'error',
    recoverable: true,
  },
}

export function getErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof AssessmentError) {
    const template = ERROR_MESSAGES[error.code] || ERROR_MESSAGES.UNKNOWN_ERROR
    return {
      ...template,
      code: error.code,
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('Network') || error.message.includes('fetch')) {
      return { ...ERROR_MESSAGES.NETWORK_ERROR, code: 'NETWORK_ERROR' }
    }

    if (error.message.includes('timeout')) {
      return { ...ERROR_MESSAGES.TIMEOUT_ERROR, code: 'TIMEOUT_ERROR' }
    }

    return {
      ...ERROR_MESSAGES.UNKNOWN_ERROR,
      message: error.message,
      code: 'UNKNOWN_ERROR',
    }
  }

  return { ...ERROR_MESSAGES.UNKNOWN_ERROR, code: 'UNKNOWN_ERROR' }
}

export function normalizeErrorResponse(payload: unknown): { error?: string; detail?: string; message?: string } | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  return payload as { error?: string; detail?: string; message?: string }
}

export function extractErrorMessage(payload: unknown): string {
  const normalized = normalizeErrorResponse(payload)
  if (!normalized) {
    return 'An unknown error occurred.'
  }

  return normalized.error || normalized.detail || normalized.message || 'An unknown error occurred.'
}

export function isRecoverableError(error: unknown): boolean {
  const info = getErrorInfo(error)
  return info.recoverable
}

export function logError(error: unknown, context?: string): void {
  const info = getErrorInfo(error)
  const logLevel = info.severity === 'error' ? 'error' : info.severity === 'warning' ? 'warn' : 'info'

  console[logLevel as 'error' | 'warn' | 'info']('Assessment Error:', {
    code: info.code,
    message: info.message,
    context,
    originalError: error,
  })
}
