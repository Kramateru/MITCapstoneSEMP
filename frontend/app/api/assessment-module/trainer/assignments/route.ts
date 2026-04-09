import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { createAssignment } from '@/app/lib/assessment/service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const body = (await request.json()) as {
      categoryId?: string
      assessmentId?: string | null
      batchId?: string | null
      traineeId?: string | null
      dueAt?: string | null
    }

    if (!body.categoryId) {
      return NextResponse.json({ error: 'Category is required.' }, { status: 400 })
    }

    const assignment = await createAssignment(sessionUser, {
      categoryId: body.categoryId,
      assessmentId: body.assessmentId,
      batchId: body.batchId,
      traineeId: body.traineeId,
      dueAt: body.dueAt,
    })

    return NextResponse.json(assignment, { status: 201 })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
