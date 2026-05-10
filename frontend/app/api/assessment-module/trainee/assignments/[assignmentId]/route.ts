import { NextResponse } from 'next/server'

import { getTraineeAssessmentSession } from '@/app/lib/assessment/backend-module-service'
import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['trainee'])
    const { assignmentId } = await context.params
    const payload = await getTraineeAssessmentSession(request, sessionUser, assignmentId)
    return NextResponse.json(payload)
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
