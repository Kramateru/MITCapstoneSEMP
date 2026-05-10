import { NextResponse } from 'next/server'

import { deleteAssignment, updateAssignment } from '@/app/lib/assessment/backend-module-service'
import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const { assignmentId } = await context.params
    const body = (await request.json()) as {
      categoryId?: string
      assessmentId?: string | null
      targetType?: 'batch' | 'wave' | 'trainee'
      batchId?: string | null
      waveNumber?: number | null
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

    await updateAssignment(request, sessionUser, assignmentId, {
      categoryId: body.categoryId,
      assessmentId: body.assessmentId,
      targetType: body.targetType,
      batchId: body.batchId,
      waveNumber: body.waveNumber,
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

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const { assignmentId } = await context.params
    await deleteAssignment(request, sessionUser, assignmentId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
