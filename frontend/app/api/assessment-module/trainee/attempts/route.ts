import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { submitAssessmentAttempt } from '@/app/lib/assessment/module-service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['trainee'])
    const body = (await request.json()) as {
      assessmentId?: string
      assignmentId?: string | null
      answers?: Record<string, string>
      questionIds?: string[]
      choiceMap?: Record<string, string[]>
      timeSpentSeconds?: number
      startedAt?: string | null
    }

    if ((!body.assignmentId && !body.assessmentId) || !body.answers) {
      return NextResponse.json(
        { error: 'Assignment and answers are required.' },
        { status: 400 },
      )
    }

    const payload = await submitAssessmentAttempt(sessionUser, {
      assessmentId: body.assessmentId,
      assignmentId: body.assignmentId,
      answers: body.answers,
      questionIds: body.questionIds,
      choiceMap: body.choiceMap,
      timeSpentSeconds: body.timeSpentSeconds,
      startedAt: body.startedAt,
    })

    return NextResponse.json(payload, { status: 201 })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
