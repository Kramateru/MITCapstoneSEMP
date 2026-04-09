import { NextResponse } from 'next/server'

import { AssessmentHttpError } from './backend-auth'

export function handleAssessmentRouteError(error: unknown) {
  if (error instanceof AssessmentHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  console.error('Assessment module route error:', error)
  return NextResponse.json(
    { error: 'Something went wrong while processing the assessment request.' },
    { status: 500 },
  )
}
