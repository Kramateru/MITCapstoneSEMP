import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { archiveCategory, updateCategory } from '@/app/lib/assessment/module-service'

export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ categoryId: string }> },
) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const { categoryId } = await context.params
    const body = (await request.json()) as {
      title?: string
      description?: string
      passingScore?: number
    }

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Category title is required.' }, { status: 400 })
    }

    if (typeof body.passingScore !== 'number') {
      return NextResponse.json({ error: 'Passing score is required.' }, { status: 400 })
    }

    const category = await updateCategory(sessionUser, categoryId, {
      title: body.title,
      description: body.description,
      passingScore: body.passingScore,
    })

    return NextResponse.json(category)
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ categoryId: string }> },
) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const { categoryId } = await context.params
    await archiveCategory(sessionUser, categoryId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
