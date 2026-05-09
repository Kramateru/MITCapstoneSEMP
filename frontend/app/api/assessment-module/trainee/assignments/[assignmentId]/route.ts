import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { getTraineeAssessmentSession } from '@/app/lib/assessment/module-service'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['trainee'])
    const { assignmentId } = await context.params
    const payload = await getTraineeAssessmentSession(sessionUser, assignmentId)
    return NextResponse.json(payload)
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
