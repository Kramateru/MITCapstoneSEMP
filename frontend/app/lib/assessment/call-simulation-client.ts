'use client'

function normalizeEnvValue(value?: string) {
  const trimmed = (value || '').trim()
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || /^your[_-]/i.test(trimmed)) {
    return ''
  }

  return trimmed
}

function isLikelySupabaseUrl(value?: string) {
  const normalized = normalizeEnvValue(value)
  if (!normalized) {
    return false
  }

  try {
    const parsed = new URL(normalized)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0
  } catch {
    return false
  }
}

function isLikelySupabasePublishableKey(value?: string) {
  const normalized = normalizeEnvValue(value)
  if (!normalized) {
    return false
  }

  if (normalized.startsWith('sb_publishable_')) {
    return true
  }

  const segments = normalized.split('.')
  return segments.length === 3 && segments.every((segment) => segment.length >= 8)
}

function getSupabaseUrl() {
  return (
    normalizeEnvValue(process.env.VITE_SUPABASE_URL)
    || normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL)
    || normalizeEnvValue(process.env.REACT_APP_SUPABASE_URL)
  )
}

function getSupabaseAnonKey() {
  return (
    normalizeEnvValue(process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    || normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    || normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    || normalizeEnvValue(process.env.REACT_APP_ANON_KEY)
  )
}

function getToken() {
  return window.sessionStorage.getItem('token')
}

function getSupabaseAccessToken() {
  return window.sessionStorage.getItem('supabase_access_token')
}

export function openCallSimulationRealtimeStream(options?: { batchId?: string | null }) {
  const token = getToken()
  const supabaseAccessToken = getSupabaseAccessToken()
  if (!token) {
    throw new Error('Missing session token.')
  }
  if (!supabaseAccessToken) {
    throw new Error('Supabase realtime session is not available for this client session.')
  }

  if (
    !isLikelySupabaseUrl(getSupabaseUrl())
    || !isLikelySupabasePublishableKey(getSupabaseAnonKey())
  ) {
    throw new Error('Supabase realtime is not configured for this client session.')
  }

  const params = new URLSearchParams({ token })
  if (supabaseAccessToken) {
    params.set('supabase_token', supabaseAccessToken)
  }
  const batchId = options?.batchId?.trim()
  if (batchId) {
    params.set('batchId', batchId)
  }

  return new EventSource(`/api/call-simulation/stream?${params.toString()}`)
}
