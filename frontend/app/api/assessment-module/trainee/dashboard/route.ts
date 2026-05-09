import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import {
  handleAssessmentRouteError,
  isAssessmentServiceUnavailableError,
} from '@/app/lib/assessment/route-utils'
import { getTraineeAssessmentDashboard } from '@/app/lib/assessment/module-service'
import type { TraineeDashboardResponse } from '@/app/lib/assessment/types'

export const runtime = 'nodejs'

function buildEmptyTraineeDashboard(): TraineeDashboardResponse {
  return {
    availableAssessments: [],
    attempts: [],
    coachingNotes: [],
    certificates: [],
    stats: {
      assignedCount: 0,
      completedCount: 0,
      passedCount: 0,
      averageScore: 0,
      retakeCount: 0,
      certificateCount: 0,
    },
  }
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['trainee'])
    const payload = await getTraineeAssessmentDashboard(sessionUser)
    return NextResponse.json(payload)
  } catch (error) {
    if (isAssessmentServiceUnavailableError(error)) {
      return NextResponse.json(buildEmptyTraineeDashboard())
    }

    return handleAssessmentRouteError(error)
  }
}
