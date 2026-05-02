import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { getConfigValue } from './env'

type SupabaseApiKeyKind =
  | 'sb_secret'
  | 'service_role_jwt'

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
    }
  } catch {
    return null
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

function resolveSupabaseApiKey() {
  const serviceRoleKey = normalizeEnvValue(getConfigValue([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_KEY',
    'SUPABASE_SERVICE_ROLE',
  ], ''))

  const serviceRoleKind = getSupabaseApiKeyKind(serviceRoleKey)
  if (serviceRoleKind === 'sb_secret' || serviceRoleKind === 'service_role_jwt') {
    return serviceRoleKey
  }

  return ''
}

export function createSupabaseAdminClient() {
  const supabaseUrl = normalizeEnvValue(getConfigValue([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
    'REACT_APP_SUPABASE_URL',
  ], ''))
  const serviceRoleKey = resolveSupabaseApiKey()

  if (!isLikelySupabaseUrl(supabaseUrl)) {
    throw new Error('A valid Supabase URL is not configured for the assessment workspace.')
  }

  if (!serviceRoleKey) {
    throw new Error(
      'A valid Supabase service-role key is not configured for the assessment workspace.',
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
