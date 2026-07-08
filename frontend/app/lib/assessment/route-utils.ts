import { NextResponse } from 'next/server'

import { AssessmentHttpError } from './backend-auth'
import {
  SUPABASE_ASSESSMENT_INVALID_KEY_MESSAGE,
  SUPABASE_ASSESSMENT_UNAVAILABLE_MESSAGE,
  isAssessmentServiceAuthError,
  isAssessmentServiceUnavailableError,
} from './error-utils'
import { runWithAssessmentRequestContext } from './request-context'

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
