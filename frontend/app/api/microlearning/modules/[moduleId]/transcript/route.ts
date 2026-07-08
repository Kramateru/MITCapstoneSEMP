import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { generateAuthorizedAudioTranscript } from '@/app/lib/microlearning/audio-content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{
    moduleId: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireBackendSessionUser(request, ['admin', 'trainer', 'trainee'])
    const authorization = request.headers.get('authorization')
    if (!authorization) {
      return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 })
    }

    const { moduleId } = await context.params
    const transcript = await generateAuthorizedAudioTranscript(authorization, moduleId)

    return NextResponse.json({
      module_id: moduleId,
      transcript: transcript.transcriptText,
      transcript_text: transcript.transcriptText,
      summary_text: transcript.summaryText,
      duration_seconds: transcript.durationSeconds,
      audio_url: transcript.audioUrl,
      audio_language: transcript.audioLanguage,
      transcript_provider: transcript.transcriptProvider,
    })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
