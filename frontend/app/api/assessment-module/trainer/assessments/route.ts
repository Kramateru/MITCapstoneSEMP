import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { createAssessment } from '@/app/lib/assessment/module-service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const body = (await request.json()) as {
      categoryId?: string
      title?: string
      description?: string
      type?: 'multiple_choice' | 'fill_blank' | 'mixed'
      isPublished?: boolean
    }

    if (!body.categoryId || !body.title?.trim() || !body.type) {
      return NextResponse.json(
        { error: 'Category, title, and assessment type are required.' },
        { status: 400 },
      )
    }

    const assessment = await createAssessment(sessionUser, {
      categoryId: body.categoryId,
      title: body.title,
      description: body.description,
      type: body.type,
      isPublished: body.isPublished,
    })

    return NextResponse.json(assessment, { status: 201 })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
