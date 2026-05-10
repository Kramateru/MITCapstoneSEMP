import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { deleteAssessment, updateAssessment } from '@/app/lib/assessment/module-service'

export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ assessmentId: string }> },
) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const { assessmentId } = await context.params
    const body = (await request.json()) as {
      title?: string
      description?: string
      type?: 'multiple_choice' | 'fill_blank' | 'mixed'
      isPublished?: boolean
    }

    if (!body.title?.trim() || !body.type || typeof body.isPublished !== 'boolean') {
      return NextResponse.json(
        { error: 'Title, type, and publish state are required.' },
        { status: 400 },
      )
    }

    const assessment = await updateAssessment(sessionUser, assessmentId, {
      title: body.title,
      description: body.description,
      type: body.type,
      isPublished: body.isPublished,
    })

    return NextResponse.json(assessment)
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ assessmentId: string }> },
) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const { assessmentId } = await context.params
    await deleteAssessment(sessionUser, assessmentId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
