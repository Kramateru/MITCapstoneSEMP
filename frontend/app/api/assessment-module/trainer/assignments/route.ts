import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { createAssignment } from '@/app/lib/assessment/module-service'

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
      title?: string
      description?: string
      assignmentMode?: 'selected_questions' | 'entire_category' | 'random_subset'
      questionIds?: string[]
      randomQuestionCount?: number | null
      passingScore?: number
      maximumAttempts?: number | null
      timeLimitMinutes?: number | null
      shuffleChoices?: boolean
      shuffleQuestions?: boolean
    }

    if (!body.categoryId || !body.title?.trim()) {
      return NextResponse.json({ error: 'Category and assignment title are required.' }, { status: 400 })
    }

    const assignment = await createAssignment(sessionUser, {
      categoryId: body.categoryId,
      assessmentId: body.assessmentId,
      batchId: body.batchId,
      traineeId: body.traineeId,
      dueAt: body.dueAt,
      title: body.title,
      description: body.description,
      assignmentMode: body.assignmentMode || 'entire_category',
      questionIds: body.questionIds || [],
      randomQuestionCount: body.randomQuestionCount,
      passingScore: body.passingScore,
      maximumAttempts: body.maximumAttempts,
      timeLimitMinutes: body.timeLimitMinutes,
      shuffleChoices: body.shuffleChoices,
      shuffleQuestions: body.shuffleQuestions,
    })

    return NextResponse.json(assignment, { status: 201 })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
