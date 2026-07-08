import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

type AssessmentRequestContext = {
  supabaseAccessToken: string
}

const assessmentRequestContext = new AsyncLocalStorage<AssessmentRequestContext>()

function normalizeToken(value: string | null | undefined) {
  const trimmed = (value || '').trim()
  return trimmed || ''
}

function extractSupabaseAccessToken(request: Request) {
  const headerToken = normalizeToken(request.headers.get('x-supabase-access-token'))
  if (headerToken) {
    return headerToken
  }

  const url = new URL(request.url)
  return normalizeToken(url.searchParams.get('supabase_token'))
}

export function runWithAssessmentRequestContext<T>(
  request: Request,
  action: () => Promise<T> | T,
) {
  return assessmentRequestContext.run(
    {
      supabaseAccessToken: extractSupabaseAccessToken(request),
    },
    action,
  )
}

export function getAssessmentRequestSupabaseAccessToken() {
  return assessmentRequestContext.getStore()?.supabaseAccessToken || ''
}
