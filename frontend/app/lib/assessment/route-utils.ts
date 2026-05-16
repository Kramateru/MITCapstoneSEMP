import { NextResponse } from 'next/server'

import { AssessmentHttpError } from './backend-auth'
import { runWithAssessmentRequestContext } from './request-context'

const SUPABASE_ASSESSMENT_UNAVAILABLE_MESSAGE =
  'Unable to reach the Supabase assessment service right now. Please try again shortly.'
const SUPABASE_ASSESSMENT_INVALID_KEY_MESSAGE =
  'The Supabase assessment workspace credentials are invalid or belong to a different Supabase project. Update the Supabase URL and API keys, then restart the app.'

export function isAssessmentServiceUnavailableError(error: unknown) {
  return (
    error instanceof Error
    && (
      /fetch failed/i.test(error.message)
      || /supabase assessment service/i.test(error.message)
      || /assessment workspace/i.test(error.message)
    )
  )
}

export function isAssessmentServiceAuthError(error: unknown) {
  return (
    error instanceof Error
    && (
      /invalid api key/i.test(error.message)
      || /supabase .*belongs to project/i.test(error.message)
      || /configured public api key/i.test(error.message)
      || /service-role key belongs to project/i.test(error.message)
    )
  )
}

export function withAssessmentRequestContext<T>(
  request: Request,
  action: () => Promise<T> | T,
) {
  return runWithAssessmentRequestContext(request, action)
}

export function handleAssessmentRouteError(error: unknown) {
  if (isAssessmentServiceAuthError(error)) {
    return NextResponse.json({ error: SUPABASE_ASSESSMENT_INVALID_KEY_MESSAGE }, { status: 503 })
  }

  if (isAssessmentServiceUnavailableError(error)) {
    return NextResponse.json({ error: SUPABASE_ASSESSMENT_UNAVAILABLE_MESSAGE }, { status: 503 })
  }

  if (error instanceof AssessmentHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  console.error('Assessment module route error:', error)
  return NextResponse.json(
    { error: 'Something went wrong while processing the assessment request.' },
    { status: 500 },
  )
}
