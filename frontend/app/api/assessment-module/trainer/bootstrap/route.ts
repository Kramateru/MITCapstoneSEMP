import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import {
  handleAssessmentRouteError,
  isAssessmentServiceUnavailableError,
} from '@/app/lib/assessment/route-utils'
import { getTrainerAssessmentBootstrap } from '@/app/lib/assessment/module-service'
import type { TrainerBootstrapResponse } from '@/app/lib/assessment/types'

export const runtime = 'nodejs'

function buildEmptyTrainerBootstrap(): TrainerBootstrapResponse {
  return {
    categories: [],
    questions: [],
    batches: [],
    trainees: [],
    assignments: [],
    attempts: [],
    certificates: [],
    reports: {
      categories: [],
      batches: [],
      questions: [],
    },
    analytics: {
      totalQuestions: 0,
      totalAssignments: 0,
      activeAssignments: 0,
      totalAttempts: 0,
      passRate: 0,
      averageScore: 0,
      certificatesIssued: 0,
    },
  }
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const payload = await getTrainerAssessmentBootstrap(sessionUser)
    return NextResponse.json(payload)
  } catch (error) {
    if (isAssessmentServiceUnavailableError(error)) {
      return NextResponse.json(buildEmptyTrainerBootstrap())
    }

    return handleAssessmentRouteError(error)
  }
}
