import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { createQuestion } from '@/app/lib/assessment/module-service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const body = (await request.json()) as {
      assessmentId?: string
      categoryId?: string
      questionNumber?: number
      questionText?: string
      questionType?: 'multiple_choice' | 'fill_blank'
      options?: string[]
      correctAnswer?: string
      difficulty?: 'easy' | 'medium' | 'hard' | null
      explanation?: string
      orderIndex?: number
    }

    if ((!body.assessmentId && !body.categoryId) || !body.questionText?.trim() || !body.correctAnswer?.trim()) {
      return NextResponse.json(
        { error: 'Category, prompt, and correct answer are required.' },
        { status: 400 },
      )
    }

    const question = await createQuestion(sessionUser, {
      assessmentId: body.assessmentId,
      categoryId: body.categoryId,
      questionNumber: body.questionNumber || 0,
      questionText: body.questionText,
      questionType: body.questionType || 'multiple_choice',
      options: body.options || [],
      correctAnswer: body.correctAnswer,
      difficulty: body.difficulty,
      explanation: body.explanation,
      orderIndex: body.orderIndex || 0,
    })

    return NextResponse.json(question, { status: 201 })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
