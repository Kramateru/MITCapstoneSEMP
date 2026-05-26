import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { submitAssessmentAttempt } from '@/app/lib/assessment/module-service'
import { handleAssessmentRouteError, withAssessmentRequestContext } from '@/app/lib/assessment/route-utils'
import type { SubmitAssessmentPayload } from '@/app/lib/assessment/types'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  return withAssessmentRequestContext(request, async () => {
    try {
      const sessionUser = await requireBackendSessionUser(request, ['trainee'])
      const body = (await request.json().catch(() => null)) as SubmitAssessmentPayload | null

      if (!body || typeof body !== 'object') {
        return NextResponse.json(
          { error: 'A valid assessment submission payload is required.' },
          { status: 400 },
        )
      }

      const result = await submitAssessmentAttempt(sessionUser, body)
      return NextResponse.json(result)
    } catch (error) {
      return handleAssessmentRouteError(error)
    }
  })
}
