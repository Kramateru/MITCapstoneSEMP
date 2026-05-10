import { NextResponse } from 'next/server'

import { coachAssessmentAttempt } from '@/app/lib/assessment/backend-module-service'
import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const body = (await request.json()) as {
      attemptId?: string
      feedback?: string
      trainerNote?: string
      actionItems?: string
      visibility?: 'shared' | 'trainer_only'
    }

    if (!body.attemptId || !body.feedback?.trim()) {
      return NextResponse.json(
        { error: 'Attempt and coaching feedback are required.' },
        { status: 400 },
      )
    }

    const coachingNote = await coachAssessmentAttempt(request, sessionUser, {
      attemptId: body.attemptId,
      feedback: body.feedback,
      trainerNote: body.trainerNote,
      actionItems: body.actionItems,
      visibility: body.visibility,
    })

    return NextResponse.json(coachingNote, { status: 201 })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
