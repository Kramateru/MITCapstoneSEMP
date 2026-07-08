import 'server-only'

import { fetchBackendPath } from '@/app/lib/backend-proxy'

import type { BackendSessionUser, PlatformRole } from './types'

export class AssessmentHttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type VerifyPayload = {
  valid?: boolean
  user_id?: string
  role?: PlatformRole
  user_name?: string
  detail?: string
}

function readBearerToken(request: Request) {
  const authorizationHeader = request.headers.get('authorization')
  if (authorizationHeader) {
    return authorizationHeader
  }

  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (token) {
    return `Bearer ${token}`
  }

  return null
}

function assertAllowedRole(
  sessionUser: BackendSessionUser,
  allowedRoles?: PlatformRole[],
) {
  if (allowedRoles?.length && !allowedRoles.includes(sessionUser.role)) {
    throw new AssessmentHttpError(403, 'You do not have permission to access this assessment workflow.')
  }

  return sessionUser
}

export async function requireBackendSessionUser(
  request: Request,
  allowedRoles?: PlatformRole[],
) {
  const authorization = readBearerToken(request)
  if (!authorization) {
    throw new AssessmentHttpError(401, 'Missing authorization token.')
  }

  let backendError: AssessmentHttpError | null = null
  try {
    const response = await fetchBackendPath('/api/auth/verify-token', {
      method: 'GET',
      headers: {
        Authorization: authorization,
      },
      cache: 'no-store',
    })
    const payload = (await response.json().catch(() => null)) as VerifyPayload | null
    if (response.ok && payload?.valid && payload.user_id && payload.role) {
      return assertAllowedRole({
        userId: payload.user_id,
        role: payload.role,
        userName: payload.user_name || 'Platform User',
      }, allowedRoles)
    }

    backendError = new AssessmentHttpError(
      response.status || 401,
      payload?.detail || 'Your session is no longer valid. Please sign in again.',
    )
  } catch {
    backendError = new AssessmentHttpError(
      503,
      'Unable to verify the active session because the backend service is unavailable.',
    )
  }

  throw backendError || new AssessmentHttpError(401, 'Your session is no longer valid. Please sign in again.')
}
