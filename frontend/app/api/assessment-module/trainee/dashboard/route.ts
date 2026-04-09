import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { getTraineeAssessmentDashboard } from '@/app/lib/assessment/service'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['trainee'])
    const payload = await getTraineeAssessmentDashboard(sessionUser)
    return NextResponse.json(payload)
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
