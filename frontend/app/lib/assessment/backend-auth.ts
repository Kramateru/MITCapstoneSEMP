import 'server-only'

import { getConfigValue } from './env'
import { createSupabaseAdminClient } from './supabase-admin'
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

type SupabasePublicUserRow = {
  id: string
  role: PlatformRole
  full_name?: string | null
  email?: string | null
}

function isPlatformRole(value: unknown): value is PlatformRole {
  return value === 'admin' || value === 'trainer' || value === 'trainee'
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

function extractAccessToken(authorization: string | null) {
  if (!authorization) {
    return null
  }

  if (/^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, '').trim()
  }

  return authorization.trim() || null
}

async function tryResolveSupabaseSessionUser(accessToken: string) {
  try {
    const supabase = createSupabaseAdminClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken)

    if (authError || !user?.id) {
      return null
    }

    const { data: profile, error: profileError } = await supabase
      .from('user')
      .select('id,role,full_name,email')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      throw new AssessmentHttpError(500, 'Unable to load the Supabase user profile for this session.')
    }

    const typedProfile = profile as SupabasePublicUserRow | null
    const metadataRole = user.app_metadata?.role ?? user.user_metadata?.role
    const resolvedRole = typedProfile?.role && isPlatformRole(typedProfile.role)
      ? typedProfile.role
      : isPlatformRole(metadataRole)
        ? metadataRole
        : null

    if (!resolvedRole) {
      throw new AssessmentHttpError(403, 'Your Supabase account does not have an assessment role assigned.')
    }

    return {
      userId: user.id,
      role: resolvedRole,
      userName:
        typedProfile?.full_name
        || (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null)
        || (typeof user.email === 'string' ? user.email : null)
        || 'Platform User',
    } satisfies BackendSessionUser
  } catch (error) {
    if (error instanceof AssessmentHttpError) {
      throw error
    }
    return null
  }
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
  const accessToken = extractAccessToken(authorization)

  const backendUrl = getConfigValue(['BACKEND_URL'], 'http://127.0.0.1:8000')

  let backendError: AssessmentHttpError | null = null
  try {
    const response = await fetch(`${backendUrl}/api/auth/verify-token`, {
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

  if (accessToken) {
    const supabaseSessionUser = await tryResolveSupabaseSessionUser(accessToken)
    if (supabaseSessionUser) {
      return assertAllowedRole(supabaseSessionUser, allowedRoles)
    }
  }

  throw backendError || new AssessmentHttpError(401, 'Your session is no longer valid. Please sign in again.')
}
