import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { getTraineeAssessmentDashboard } from '@/app/lib/assessment/module-service'
import { handleAssessmentRouteError, withAssessmentRequestContext } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return withAssessmentRequestContext(request, async () => {
    try {
      const sessionUser = await requireBackendSessionUser(request, ['trainee'])
      const dashboard = await getTraineeAssessmentDashboard(sessionUser)
      return NextResponse.json(dashboard)
    } catch (error) {
      return handleAssessmentRouteError(error)
    }
  })
}
