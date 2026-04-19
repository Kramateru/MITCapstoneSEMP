import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { getTrainerAssessmentBootstrap } from '@/app/lib/assessment/service'
import type { TrainerBootstrapResponse } from '@/app/lib/assessment/types'

export const runtime = 'nodejs'

function buildEmptyTrainerBootstrap(): TrainerBootstrapResponse {
  return {
    categories: [],
    batches: [],
    trainees: [],
    assignments: [],
    attempts: [],
    reports: {
      categories: [],
      questions: [],
    },
  }
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const payload = await getTrainerAssessmentBootstrap(sessionUser)
    return NextResponse.json(payload)
  } catch (error) {
    if (
      error instanceof Error
      && (
        /invalid api key/i.test(error.message)
        || /supabase assessment service/i.test(error.message)
      )
    ) {
      return NextResponse.json(buildEmptyTrainerBootstrap())
    }

    return handleAssessmentRouteError(error)
  }
}
