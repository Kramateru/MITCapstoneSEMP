import { NextResponse } from 'next/server'

import { AssessmentHttpError, requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { getConfigValue } from '@/app/lib/assessment/env'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import { createSupabaseAdminClient } from '@/app/lib/assessment/supabase-admin'
import { fetchBackendPath } from '@/app/lib/backend-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_MICROLEARNING_BUCKET = 'audio-modules'
const SIGNED_URL_TTL_SECONDS = 60 * 60
const SUPABASE_PUBLIC_OBJECT_MARKER = '/storage/v1/object/public/'

type RouteContext = {
  params: Promise<{
    moduleId: string
  }>
}

type BackendModuleAssetPayload = {
  module_id?: string | null
  module_type?: string | null
  asset_url?: string | null
  storage_path?: string | null
  bucket_name?: string | null
  content_type?: string | null
  signed_url_required?: boolean | null
}

function normalizeConfigValue(value: string | null | undefined) {
  const trimmed = (value || '').trim()
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    return ''
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }

  return trimmed
}

function getDefaultMicrolearningBucketName() {
  return normalizeConfigValue(getConfigValue([
    'MICROLEARNING_STORAGE_BUCKET_NAME',
    'AUDIO_MODULE_STORAGE_BUCKET_NAME',
  ], DEFAULT_MICROLEARNING_BUCKET)) || DEFAULT_MICROLEARNING_BUCKET
}

function extractBackendErrorMessage(
  payload: unknown,
  fallback: string,
) {
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

function resolveSupabasePublicObject(assetUrl?: string | null) {
  const normalized = (assetUrl || '').trim()
  if (!normalized) {
    return null
  }

  try {
    const parsed = new URL(normalized)
    const markerIndex = parsed.pathname.indexOf(SUPABASE_PUBLIC_OBJECT_MARKER)
    if (markerIndex < 0) {
      return null
    }

    const suffix = decodeURIComponent(parsed.pathname.slice(markerIndex + SUPABASE_PUBLIC_OBJECT_MARKER.length))
    const slashIndex = suffix.indexOf('/')
    if (slashIndex < 0) {
      return null
    }

    const bucketName = suffix.slice(0, slashIndex).trim()
    const storagePath = suffix.slice(slashIndex + 1).trim().replace(/^\/+/, '')
    if (!bucketName || !storagePath) {
      return null
    }

    return {
      bucketName,
      storagePath,
    }
  } catch {
    return null
  }
}

async function getAuthorizedModuleAsset(
  authorization: string,
  moduleId: string,
) {
  const response = await fetchBackendPath(`/api/microlearning/modules/${moduleId}/asset`, {
    method: 'GET',
    headers: {
      Authorization: authorization,
    },
    cache: 'no-store',
  })
  const payload = (await response.json().catch(() => null)) as BackendModuleAssetPayload | null
  if (!response.ok) {
    throw new AssessmentHttpError(
      response.status || 500,
      extractBackendErrorMessage(payload, 'Unable to load the lesson asset metadata.'),
    )
  }

  return payload || {}
}

async function createModuleAssetSignedUrl(
  storagePath: string,
  bucketName: string,
) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .storage
    .from(bucketName)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw error || new Error('Unable to create a signed playback URL for this microlearning asset.')
  }

  return data.signedUrl
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireBackendSessionUser(request, ['admin', 'trainer', 'trainee'])
    const authorization = request.headers.get('authorization')
    if (!authorization) {
      return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 })
    }

    const { moduleId } = await context.params
    const asset = await getAuthorizedModuleAsset(authorization, moduleId)
    const inferredObject = resolveSupabasePublicObject(asset.asset_url)
    const storagePath = (asset.storage_path || inferredObject?.storagePath || '').trim()
    const bucketName = (
      asset.bucket_name
      || inferredObject?.bucketName
      || getDefaultMicrolearningBucketName()
    ).trim()
    const shouldSign = Boolean(storagePath) && asset.signed_url_required !== false

    const signedUrl = shouldSign
      ? await createModuleAssetSignedUrl(storagePath, bucketName)
      : (asset.asset_url || null)

    return NextResponse.json({
      module_id: asset.module_id || moduleId,
      module_type: asset.module_type || null,
      asset_url: asset.asset_url || null,
      signed_url: signedUrl,
      storage_path: storagePath || null,
      bucket_name: bucketName || null,
      content_type: asset.content_type || null,
      signed_url_required: shouldSign,
    })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
