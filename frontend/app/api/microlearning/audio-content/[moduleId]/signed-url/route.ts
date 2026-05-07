import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import {
  createAudioModuleSignedUrl,
  getAuthorizedAudioContent,
  getAuthorizedAudioPlaybackMetadata,
} from '@/app/lib/microlearning/audio-content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{
    moduleId: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['admin', 'trainer', 'trainee'])
    const authorization = request.headers.get('authorization')
    if (!authorization) {
      return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 })
    }

    const { moduleId } = await context.params
    const audioContent = await getAuthorizedAudioContent(authorization, sessionUser, moduleId)
    const signedUrl = await createAudioModuleSignedUrl(
      audioContent.storage_path,
      audioContent.bucket_name || undefined,
    )
    const fallbackMetadata =
      !(audioContent.transcript_text?.trim() || audioContent.transcript?.trim()) || !audioContent.duration_seconds
        ? await getAuthorizedAudioPlaybackMetadata(authorization, moduleId)
        : null
    const transcriptText =
      audioContent.transcript_text?.trim()
      || audioContent.transcript?.trim()
      || fallbackMetadata?.transcriptText
      || ''
    const summaryText = audioContent.summary_text?.trim() || ''

    return NextResponse.json({
      audio_content_id: audioContent.id,
      module_id: moduleId,
      signed_url: signedUrl,
      transcript: transcriptText,
      transcript_text: transcriptText,
      summary_text: summaryText,
      storage_path: audioContent.storage_path,
      bucket_name: audioContent.bucket_name || null,
      mime_type: audioContent.mime_type,
      duration_seconds: audioContent.duration_seconds ?? fallbackMetadata?.durationSeconds ?? null,
      captions_url: fallbackMetadata?.captionsUrl || null,
      audio_language: fallbackMetadata?.audioLanguage || null,
    })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
