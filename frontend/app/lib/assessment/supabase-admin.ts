import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { getConfigValue } from './env'

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

function isLikelySupabaseJwt(token: string, expectedRole?: 'service_role' | 'anon') {
  const normalized = normalizeEnvValue(token)
  if (!normalized) {
    return false
  }

  const segments = normalized.split('.')
  if (segments.length !== 3 || segments.some((segment) => segment.length < 8)) {
    return false
  }

  const payload = decodeJwtPayload(normalized)
  if (!payload?.role) {
    return false
  }

  if (expectedRole && payload.role !== expectedRole) {
    return false
  }

  return true
}

function resolveSupabaseApiKey() {
  const serviceRoleKey = normalizeEnvValue(getConfigValue([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_ROLE',
  ], ''))
  const anonKey = normalizeEnvValue(getConfigValue([
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_KEY',
    'NEXT_PUBLIC_SUPABASE_KEY',
    'REACT_APP_ANON_KEY',
  ], ''))

  if (isLikelySupabaseJwt(serviceRoleKey, 'service_role')) {
    return serviceRoleKey
  }

  if (isLikelySupabaseJwt(anonKey, 'anon')) {
    console.warn(
      'Assessment workspace is falling back to the Supabase anon key because the configured service-role key is missing or malformed.',
    )
    return anonKey
  }

  return serviceRoleKey || anonKey
}

export function createSupabaseAdminClient() {
  const supabaseUrl = getConfigValue([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
    'REACT_APP_SUPABASE_URL',
  ])
  const serviceRoleKey = resolveSupabaseApiKey()

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
