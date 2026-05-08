import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import {
  assertTrainerOwnsMicrolearningModule,
  uploadMicrolearningAudioContent,
} from '@/app/lib/microlearning/audio-content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['trainer'])
    const authorization = request.headers.get('authorization')
    if (!authorization) {
      return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const moduleId = String(formData.get('moduleId') || '').trim()
    const title = String(formData.get('title') || '').trim()
    const audioLanguage = String(formData.get('audioLanguage') || 'en-US').trim()

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'An audio file is required.' }, { status: 400 })
    }
    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId is required.' }, { status: 400 })
    }

    await assertTrainerOwnsMicrolearningModule(authorization, moduleId)

    const result = await uploadMicrolearningAudioContent({
      authorization,
      moduleId,
      trainerId: sessionUser.userId,
      title: title || file.name.replace(/\.[A-Za-z0-9]+$/i, ''),
      fileName: file.name,
      mimeType: file.type || 'audio/mpeg',
      fileBytes: Buffer.from(await file.arrayBuffer()),
      audioLanguage: audioLanguage || 'en-US',
    })

    return NextResponse.json(result)
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
