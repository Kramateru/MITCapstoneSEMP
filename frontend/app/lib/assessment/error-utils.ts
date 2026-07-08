export const SUPABASE_ASSESSMENT_UNAVAILABLE_MESSAGE =
  'Unable to reach the Supabase assessment service right now. Please try again shortly.'
export const SUPABASE_ASSESSMENT_INVALID_KEY_MESSAGE =
  'The Supabase assessment workspace credentials are invalid or belong to a different Supabase project. Update the Supabase URL and API keys, then restart the app.'

export function isAssessmentServiceUnavailableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message
  return (
    /fetch failed/i.test(message)
    || /supabase assessment service/i.test(message)
    || /assessment workspace/i.test(message)
    || /failed to initialize supabase/i.test(message)
    || /missing.*supabase/i.test(message)
    || /supabase.*not configured/i.test(message)
    || (/not configured/i.test(message) && /supabase/i.test(message))
  )
}

export function isAssessmentServiceAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message
  if (/service-role key .*belongs to project/i.test(message)) {
    return true
  }

  if (/configured public key .*belongs to project/i.test(message)) {
    return true
  }

  if (/supabase .*belongs to project/i.test(message)) {
    return true
  }

  if (/invalid api key/i.test(message) && /supabase/i.test(message)) {
    return true
  }

  return false
}
