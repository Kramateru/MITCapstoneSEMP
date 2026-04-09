import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { createCategory } from '@/app/lib/assessment/service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
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

    const category = await createCategory(sessionUser, {
      title: body.title,
      description: body.description,
      passingScore: body.passingScore,
    })

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
