import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { createQuestion } from '@/app/lib/assessment/service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const body = (await request.json()) as {
      assessmentId?: string
      questionText?: string
      questionType?: 'multiple_choice' | 'fill_blank'
      options?: string[]
      correctAnswer?: string
      explanation?: string
      orderIndex?: number
    }

    if (!body.assessmentId || !body.questionText?.trim() || !body.questionType || !body.correctAnswer?.trim()) {
      return NextResponse.json(
        { error: 'Assessment, prompt, type, and correct answer are required.' },
        { status: 400 },
      )
    }

    const question = await createQuestion(sessionUser, {
      assessmentId: body.assessmentId,
      questionText: body.questionText,
      questionType: body.questionType,
      options: body.options || [],
      correctAnswer: body.correctAnswer,
      explanation: body.explanation,
      orderIndex: body.orderIndex || 0,
    })

    return NextResponse.json(question, { status: 201 })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
