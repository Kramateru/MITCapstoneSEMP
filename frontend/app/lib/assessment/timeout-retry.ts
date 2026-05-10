/**
 * Assessment Module Timeout & Retry Management
 * Provides timeout handling and intelligent retry strategies
 */

import { AssessmentError } from './error-handling'

export interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffMultiplier?: number
  timeoutMs?: number
  isRetryable?: (error: unknown) => boolean
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  timeoutMs: 30000,
}

/**
 * Creates a timeout promise that rejects after specified milliseconds
 */
function createTimeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new AssessmentError(
          'TIMEOUT_ERROR',
          `Operation timed out after ${ms}ms`,
          504,
        ),
      )
    }, ms)
  })
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: unknown, customCheck?: (error: unknown) => boolean): boolean {
  if (customCheck?.(error)) {
    return true
  }

  if (error instanceof AssessmentError) {
    // Don't retry client errors (4xx)
    if (error.status && error.status >= 400 && error.status < 500) {
      // Except for timeout and too many requests
      return error.status === 408 || error.status === 429
    }

    // Retry server errors (5xx) and network errors
    return error.status === undefined || error.status >= 500
  }

  if (error instanceof TypeError) {
    // Network errors are retryable
    return error.message.includes('Failed to fetch') || error.message.includes('NetworkError')
  }

  return true
}

/**
 * Sleeps for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Executes a function with retry logic and timeout
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: unknown

  for (let attempt = 1; attempt <= config.maxAttempts!; attempt += 1) {
    try {
      // Create a race between the operation and timeout
      return await Promise.race([
        operation(),
        createTimeoutPromise(config.timeoutMs!),
      ])
    } catch (error) {
      lastError = error
      const isRetryable = isRetryableError(error, config.isRetryable)
      const maxAttempts = config.maxAttempts ?? 3

      // Log retry attempt
      console.warn(`Attempt ${attempt}/${maxAttempts} failed:`, {
        error: error instanceof Error ? error.message : String(error),
        isRetryable,
        nextRetryIn: isRetryable && attempt < maxAttempts
          ? Math.min(
            config.initialDelayMs! * Math.pow(config.backoffMultiplier!, attempt - 1),
            config.maxDelayMs!,
          )
          : undefined,
      })

      // Don't retry if not retryable or last attempt
      if (!isRetryable || attempt === maxAttempts) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.initialDelayMs! * Math.pow(config.backoffMultiplier!, attempt - 1),
        config.maxDelayMs!,
      )

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.1 * delay
      await sleep(delay + jitter)
    }
  }

  // Should not reach here, but just in case
  throw lastError || new AssessmentError('RETRY_FAILED', 'Retry failed without error', 500)
}

/**
 * Executes multiple operations with timeout
 */
export async function executeAllWithTimeout<T>(
  operations: Array<() => Promise<T>>,
  timeoutMs: number = 30000,
): Promise<T[]> {
  const promises = operations.map((op) =>
    Promise.race([
      op(),
      createTimeoutPromise(timeoutMs),
    ]),
  )

  return Promise.all(promises)
}

/**
 * Executes operations with timeout and partial failure tolerance
 */
export async function executeAllWithTimeoutPartial<T>(
  operations: Array<() => Promise<T>>,
  timeoutMs: number = 30000,
  options: { failureLimit?: number } = {},
): Promise<{ results: T[]; failures: Array<{ index: number; error: unknown }> }> {
  const failureLimit = options.failureLimit ?? operations.length
  const promises = operations.map((op, index) =>
    Promise.race([op(), createTimeoutPromise(timeoutMs)])
      .then((result) => ({ index, result, error: null }))
      .catch((error) => ({ index, result: null, error })),
  )

  const outcomes = await Promise.all(promises)
  const results: T[] = []
  const failures: Array<{ index: number; error: unknown }> = []

  for (const outcome of outcomes) {
    if (outcome.error) {
      failures.push({ index: outcome.index, error: outcome.error })
    } else {
      results.push(outcome.result as T)
    }
  }

  if (failures.length > failureLimit) {
    throw new AssessmentError(
      'PARTIAL_FAILURE',
      `${failures.length} out of ${operations.length} operations failed (limit: ${failureLimit})`,
      500,
      { failureCount: failures.length, totalCount: operations.length },
    )
  }

  return { results, failures }
}

/**
 * Retry a function call with specific error codes
 */
export async function retryOnError<T>(
  operation: () => Promise<T>,
  errorCodes: string[] = [],
  maxAttempts: number = 3,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      const isMatchingError = errorCodes.some((code) => {
        if (error instanceof AssessmentError) {
          return error.code === code
        }
        return false
      })

      if (!isMatchingError || attempt === maxAttempts) {
        throw error
      }

      const delay = 1000 * attempt
      await sleep(delay)
    }
  }

  throw lastError
}

/**
 * Debounced function execution
 */
export function debounce<T extends (...args: unknown[]) => Promise<unknown>>(
  func: T,
  waitMs: number,
): (...args: Parameters<T>) => Promise<void> {
  let timeoutId: NodeJS.Timeout | null = null

  return async (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    return new Promise<void>((resolve) => {
      timeoutId = setTimeout(async () => {
        try {
          await func(...args)
        } finally {
          resolve()
        }
      }, waitMs)
    })
  }
}

/**
 * Throttled function execution
 */
export function throttle<T extends (...args: unknown[]) => Promise<unknown>>(
  func: T,
  limitMs: number,
): (...args: Parameters<T>) => Promise<void> {
  let lastCallTime = 0
  let pendingCall: { args: Parameters<T>; resolve: () => void } | null = null

  return async (...args: Parameters<T>) => {
    return new Promise<void>((resolve) => {
      const now = Date.now()
      const timeSinceLastCall = now - lastCallTime

      if (timeSinceLastCall >= limitMs) {
        lastCallTime = now
        func(...args).then(() => resolve())
      } else {
        pendingCall = {
          args,
          resolve() {
            func(...args).then(() => resolve())
          },
        }

        setTimeout(() => {
          if (pendingCall) {
            lastCallTime = Date.now()
            pendingCall.resolve()
            pendingCall = null
          }
        }, limitMs - timeSinceLastCall)
      }
    })
  }
}
