import { NextResponse } from 'next/server'

import { fetchBackendPath } from '@/app/lib/backend-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{
    moduleId: string
  }>
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const candidate = payload as { detail?: unknown; error?: unknown; message?: unknown }
    for (const value of [candidate.detail, candidate.error, candidate.message]) {
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }
  }

  return fallback
}

export async function GET(request: Request, context: RouteContext) {
  const authorization = request.headers.get('authorization')
  if (!authorization) {
    return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 })
  }

  const { moduleId } = await context.params
  const backendResponse = await fetchBackendPath(`/api/microlearning/modules/${moduleId}/audio`, {
    method: 'GET',
    headers: {
      Authorization: authorization,
    },
    cache: 'no-store',
  })

  const payload = await backendResponse.json().catch(() => null)
  if (!backendResponse.ok) {
    return NextResponse.json(
      { error: getErrorMessage(payload, 'Unable to load the microlearning audio playback URL.') },
      { status: backendResponse.status || 500 },
    )
  }

  return NextResponse.json({
    audio_content_id: `module-${moduleId}`,
    module_id: moduleId,
    signed_url: typeof payload?.signed_url === 'string' ? payload.signed_url : null,
    transcript: typeof payload?.transcript === 'string' ? payload.transcript : '',
    transcript_text: typeof payload?.transcript === 'string' ? payload.transcript : '',
    summary_text: typeof payload?.summary_text === 'string' ? payload.summary_text : '',
    storage_path: typeof payload?.storage_path === 'string' ? payload.storage_path : null,
    bucket_name: typeof payload?.bucket_name === 'string' ? payload.bucket_name : null,
    mime_type: typeof payload?.content_type === 'string' ? payload.content_type : null,
    duration_seconds: typeof payload?.audio_duration_seconds === 'number' ? payload.audio_duration_seconds : null,
    captions_url: typeof payload?.captions_url === 'string' ? payload.captions_url : null,
    audio_language: typeof payload?.audio_language === 'string' ? payload.audio_language : null,
  })
}
