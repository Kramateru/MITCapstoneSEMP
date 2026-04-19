import { NextResponse } from 'next/server'

import { AssessmentHttpError } from './backend-auth'

export function handleAssessmentRouteError(error: unknown) {
  if (error instanceof AssessmentHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  if (error instanceof Error && /assessment workspace/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 503 })
  }

  console.error('Assessment module route error:', error)
  return NextResponse.json(
    { error: 'Something went wrong while processing the assessment request.' },
    { status: 500 },
  )
}
