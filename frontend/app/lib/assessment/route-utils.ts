import { NextResponse } from 'next/server'

import { AssessmentHttpError } from './backend-auth'

const SUPABASE_ASSESSMENT_UNAVAILABLE_MESSAGE =
  'Unable to reach the Supabase assessment service right now. Please try again shortly.'

export function isAssessmentServiceUnavailableError(error: unknown) {
  return (
    error instanceof Error
    && (
      /invalid api key/i.test(error.message)
      || /fetch failed/i.test(error.message)
      || /supabase assessment service/i.test(error.message)
      || /assessment workspace/i.test(error.message)
    )
  )
}

export function handleAssessmentRouteError(error: unknown) {
  if (error instanceof AssessmentHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  if (isAssessmentServiceUnavailableError(error)) {
    return NextResponse.json({ error: SUPABASE_ASSESSMENT_UNAVAILABLE_MESSAGE }, { status: 503 })
  }

  console.error('Assessment module route error:', error)
  return NextResponse.json(
    { error: 'Something went wrong while processing the assessment request.' },
    { status: 500 },
  )
}
