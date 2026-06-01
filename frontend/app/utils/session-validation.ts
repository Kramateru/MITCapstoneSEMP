/**
 * Session Validation Utilities
 * 
 * Handles session validation on app startup and during runtime
 * Ensures that expired or terminated sessions are detected and cleared
 */

/**
 * Validate session with the backend
 * 
 * Called on app startup to verify that the stored token is still valid
 * and the server-side session hasn't been terminated.
 * 
 * @param token - The JWT token to validate
 * @returns true if the session is valid, false if expired or invalid
 */
export async function validateSessionWithBackend(token: string): Promise<boolean> {
  if (!token) {
    return false
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    const response = await fetch('/api/auth/session', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      cache: 'no-store',
    })

    clearTimeout(timeoutId)

    // 200 OK - session is valid
    if (response.ok) {
      const data = await response.json()
      return data.valid === true
    }

    // 401 Unauthorized - session is invalid or expired
    if (response.status === 401) {
      return false
    }

    // Other errors - assume invalid
    return false
  } catch (error) {
    console.debug('Session validation request failed:', error)
    return false
  }
}

/**
 * Check if the browser is returning from being closed
 * 
 * On browser/app launch or app restart, if there's a stored token
 * but the session was terminated on the backend, we should redirect to login.
 * 
 * This function validates that the stored session still exists on the server.
 * 
 * @param token - The stored JWT token to verify
 * @returns true if this is a fresh session (not restored from closure)
 */
export async function isSessionFresh(token: string | null): Promise<boolean> {
  if (!token) {
    return false
  }

  return validateSessionWithBackend(token)
}

/**
 * Detect if the session is being restored from browser close
 * 
 * When browser closes:
 * 1. Tokens remain in localStorage
 * 2. But server-side session is invalidated
 * 3. On reopening, we detect this mismatch
 * 
 * @param token - The stored token
 * @returns true if session was terminated (tokens exist but session invalid on server)
 */
export async function wasSessionTerminatedDuringClose(token: string | null): Promise<boolean> {
  if (!token) {
    return false
  }

  // If token exists but server rejects it, session was terminated
  const isValid = await validateSessionWithBackend(token)
  return !isValid
}

/**
 * Notify user about session termination
 * 
 * When we detect a terminated session, we can show an appropriate message
 */
export function getSessionTerminationMessage(reason?: string): string {
  if (reason === 'browser_closed') {
    return 'Your session was ended because you closed the browser. Please log in again.'
  }
  if (reason === 'explicit_logout') {
    return 'You have been logged out. Please log in again.'
  }
  if (reason === 'session_expired') {
    return 'Your session has expired. Please log in again.'
  }
  return 'Your session has ended. Please log in again.'
}
