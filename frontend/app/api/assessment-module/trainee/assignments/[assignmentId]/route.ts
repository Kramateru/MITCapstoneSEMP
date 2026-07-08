import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { getTraineeAssessmentSession } from '@/app/lib/assessment/module-service'
import { handleAssessmentRouteError, withAssessmentRequestContext } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  return withAssessmentRequestContext(request, async () => {
    try {
      const sessionUser = await requireBackendSessionUser(request, ['trainee'])
      const { assignmentId } = await context.params

      if (!assignmentId?.trim()) {
        return NextResponse.json({ error: 'Assignment is required.' }, { status: 400 })
      }

      const session = await getTraineeAssessmentSession(sessionUser, assignmentId)
      return NextResponse.json(session)
    } catch (error) {
      return handleAssessmentRouteError(error)
    }
  })
}
