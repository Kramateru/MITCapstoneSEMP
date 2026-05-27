import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { getConfigValue } from './env'
import { getAssessmentRequestSupabaseAccessToken } from './request-context'

type SupabaseApiKeyKind =
  | 'sb_secret'
  | 'service_role_jwt'

type SupabasePublicKeyKind =
  | 'sb_publishable'
  | 'anon_jwt'

function normalizeEnvValue(value: string) {
  const trimmed = value.trim()
  if (
    !trimmed
    || trimmed === 'undefined'
    || trimmed === 'null'
    || /^your[_-]/i.test(trimmed)
  ) {
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

function isLikelySupabaseUrl(value: string) {
  const normalized = normalizeEnvValue(value)
  if (!normalized) {
    return false
  }

  try {
    const parsed = new URL(normalized)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.host
  } catch {
    return false
  }
}

function decodeJwtPayload(token: string) {
  const segments = token.split('.')
  if (segments.length !== 3) {
    return null
  }

  try {
    const normalized = segments[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(segments[1].length / 4) * 4, '=')

    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as {
      role?: string
      ref?: string
    }
  } catch {
    return null
  }
}

function extractSupabaseProjectRefFromKey(token: string) {
  const normalized = normalizeEnvValue(token)
  if (!normalized) {
    return ''
  }

  const payload = decodeJwtPayload(normalized)
  return typeof payload?.ref === 'string' ? payload.ref.trim() : ''
}

function extractSupabaseProjectRefFromUrl(value: string) {
  const normalized = normalizeEnvValue(value)
  if (!normalized) {
    return ''
  }

  try {
    const parsed = new URL(normalized)
    return parsed.hostname.split('.')[0]?.trim() || ''
  } catch {
    return ''
  }
}

function getSupabaseApiKeyKind(token: string): SupabaseApiKeyKind | null {
  const normalized = normalizeEnvValue(token)
  if (!normalized) {
    return null
  }

  if (normalized.startsWith('sb_secret_')) {
    return 'sb_secret'
  }

  const segments = normalized.split('.')
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return null
  }

  const payload = decodeJwtPayload(normalized)
  if (payload?.role === 'service_role') {
    return 'service_role_jwt'
  }

  return null
}

function getSupabasePublicKeyKind(token: string): SupabasePublicKeyKind | null {
  const normalized = normalizeEnvValue(token)
  if (!normalized) {
    return null
  }

  if (normalized.startsWith('sb_publishable_')) {
    return 'sb_publishable'
  }

  const segments = normalized.split('.')
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return null
  }

  const payload = decodeJwtPayload(normalized)
  if (payload?.role === 'anon') {
    return 'anon_jwt'
  }

  return null
}

function resolveSupabaseApiKey() {
  const serviceRoleKey = normalizeEnvValue(getConfigValue([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_ROLE',
  ], ''))

  const serviceRoleKind = getSupabaseApiKeyKind(serviceRoleKey)
  if (serviceRoleKind === 'sb_secret' || serviceRoleKind === 'service_role_jwt') {
    return serviceRoleKey
  }

  return ''
}

function resolveSupabasePublicApiKey() {
  const publicKey = normalizeEnvValue(getConfigValue([
    'SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'REACT_APP_ANON_KEY',
  ], ''))

  const publicKeyKind = getSupabasePublicKeyKind(publicKey)
  if (publicKeyKind === 'sb_publishable' || publicKeyKind === 'anon_jwt') {
    return publicKey
  }

  return ''
}

export function createSupabaseAdminClient() {
  const supabaseUrl = normalizeEnvValue(getConfigValue([
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
    'REACT_APP_SUPABASE_URL',
  ], ''))
  const requestSupabaseAccessToken = normalizeEnvValue(getAssessmentRequestSupabaseAccessToken())
  const publicApiKey = resolveSupabasePublicApiKey()
  const serviceRoleKey = resolveSupabaseApiKey()

  if (!isLikelySupabaseUrl(supabaseUrl)) {
    console.error('Supabase URL not configured:', {
      envVars: ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'REACT_APP_SUPABASE_URL'],
      received: supabaseUrl || 'empty',
    })
    throw new Error('A valid Supabase URL is not configured for the assessment workspace.')
  }

  const urlProjectRef = extractSupabaseProjectRefFromUrl(supabaseUrl)
  if (serviceRoleKey) {
    const serviceKeyProjectRef = extractSupabaseProjectRefFromKey(serviceRoleKey)
    if (urlProjectRef && serviceKeyProjectRef && urlProjectRef !== serviceKeyProjectRef) {
      throw new Error(
        `The configured Supabase service-role key belongs to project ${serviceKeyProjectRef}, `
        + `but the assessment workspace URL points to project ${urlProjectRef}.`,
      )
    }

    try {
      return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            'X-Client-Info': 'assessment-module',
          },
        },
      })
    } catch (error) {
      console.error('Failed to create Supabase client:', error)
      throw new Error('Failed to initialize Supabase client. Please check your configuration.')
    }
  }

  if (requestSupabaseAccessToken && publicApiKey) {
    const publicKeyProjectRef = extractSupabaseProjectRefFromKey(publicApiKey)
    if (urlProjectRef && publicKeyProjectRef && urlProjectRef !== publicKeyProjectRef) {
      throw new Error(
        `The configured Supabase public key belongs to project ${publicKeyProjectRef}, `
        + `but the assessment workspace URL points to project ${urlProjectRef}.`,
      )
    }

    return createClient(supabaseUrl, publicApiKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${requestSupabaseAccessToken}`,
          'X-Client-Info': 'assessment-module',
        },
      },
    })
  }

  console.error('Supabase service role key not configured')
  throw new Error(
    'A valid Supabase service-role key is not configured for the assessment workspace. Please set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY.',
  )
}
