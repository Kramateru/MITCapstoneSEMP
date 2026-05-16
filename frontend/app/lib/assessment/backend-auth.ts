import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { fetchBackendPath } from '@/app/lib/backend-proxy'

import { getConfigValue } from './env'
import { getAssessmentRequestSupabaseAccessToken } from './request-context'
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

type BackendJwtHeader = {
  alg?: string
  typ?: string
}

type BackendJwtPayload = {
  user_id?: string
  email?: string
  role?: PlatformRole
  exp?: number
  type?: string
}

function isPlatformRole(value: unknown): value is PlatformRole {
  return value === 'admin' || value === 'trainer' || value === 'trainee'
}

function normalizeConfigValue(value: string | null | undefined) {
  const trimmed = (value || '').trim()
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    return ''
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }

  return trimmed
}

function decodeBase64UrlBytes(value: string) {
  try {
    const normalized = value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=')

    return Buffer.from(normalized, 'base64')
  } catch {
    return null
  }
}

function decodeBase64UrlJson<T>(value: string) {
  try {
    const decoded = decodeBase64UrlBytes(value)
    if (!decoded) {
      return null
    }

    return JSON.parse(decoded.toString('utf8')) as T
  } catch {
    return null
  }
}

function tryResolveBackendJwtSessionUser(accessToken: string) {
  const secret = normalizeConfigValue(getConfigValue([
    'SECRET_KEY',
    'JWT_SECRET',
  ], ''))
  if (!secret) {
    return null
  }

  const segments = accessToken.split('.')
  if (segments.length !== 3) {
    return null
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments
  const header = decodeBase64UrlJson<BackendJwtHeader>(encodedHeader)
  if (!header || header.alg !== 'HS256') {
    return null
  }

  const providedSignature = decodeBase64UrlBytes(encodedSignature)
  if (!providedSignature) {
    return null
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest()

  if (
    providedSignature.length !== expectedSignature.length
    || !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return null
  }

  const payload = decodeBase64UrlJson<BackendJwtPayload>(encodedPayload)
  if (!payload?.user_id || !isPlatformRole(payload.role) || payload.type !== 'access') {
    return null
  }

  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
    return null
  }

  return {
    userId: payload.user_id,
    role: payload.role,
    userName: payload.email || 'Platform User',
  } satisfies BackendSessionUser
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
    const tokenToVerify = getAssessmentRequestSupabaseAccessToken() || accessToken
    if (!tokenToVerify) {
      return null
    }

    const supabase = createSupabaseAdminClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(tokenToVerify)

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

  if (accessToken) {
    if (backendError?.status === 503) {
      const backendJwtSessionUser = tryResolveBackendJwtSessionUser(accessToken)
      if (backendJwtSessionUser) {
        return assertAllowedRole(backendJwtSessionUser, allowedRoles)
      }
    }

    const supabaseSessionUser = await tryResolveSupabaseSessionUser(accessToken)
    if (supabaseSessionUser) {
      return assertAllowedRole(supabaseSessionUser, allowedRoles)
    }
  }

  throw backendError || new AssessmentHttpError(401, 'Your session is no longer valid. Please sign in again.')
}
