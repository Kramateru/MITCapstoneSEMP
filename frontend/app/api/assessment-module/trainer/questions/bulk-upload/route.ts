import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { bulkUploadQuestions } from '@/app/lib/assessment/module-service'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer'])
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A CSV file is required.' }, { status: 400 })
    }

    const csvText = await file.text()
    const payload = await bulkUploadQuestions(sessionUser, csvText)
    return NextResponse.json(payload)
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
