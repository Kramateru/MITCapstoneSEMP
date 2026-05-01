import 'server-only'

import { GoogleAIFileManager } from '@google/generative-ai/server'

import { AssessmentHttpError } from '@/app/lib/assessment/backend-auth'
import { fetchBackendPath } from '@/app/lib/backend-proxy'
import { getConfigValue } from '@/app/lib/assessment/env'
import { createSupabaseAdminClient } from '@/app/lib/assessment/supabase-admin'
import type { BackendSessionUser } from '@/app/lib/assessment/types'

const DEFAULT_AUDIO_BUCKET = 'audio-modules'
const DEFAULT_GEMINI_AUDIO_MODEL = 'gemini-2.5-flash'
const GEMINI_READY_ATTEMPTS = 20
const GEMINI_READY_DELAY_MS = 1500
const SIGNED_URL_TTL_SECONDS = 60 * 60
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

type AudioContentRow = {
  id: string
  module_id: string
  title: string
  trainer_id: string
  url: string
  storage_path: string
  mime_type: string
  transcript: string | null
  transcript_text: string | null
  summary_text: string | null
  duration_seconds: number | null
  gemini_model: string | null
  gemini_file_uri: string | null
  created_at: string
  updated_at: string
}

type BackendModuleDetail = {
  content_data?: Record<string, unknown> | null
  audio_language?: string | null
}

type BackendModuleAudioMetadata = {
  title?: string | null
  audio_url?: string | null
  transcript?: string | null
  audio_duration_seconds?: number | null
  audio_language?: string | null
  captions_url?: string | null
  content_type?: string | null
}

type TrainerModuleListResponse = {
  modules?: Array<{ id?: string | null }>
}

type UploadMicrolearningAudioParams = {
  authorization: string
  moduleId: string
  trainerId: string
  title: string
  fileName: string
  mimeType: string
  fileBytes: Buffer
  audioLanguage?: string | null
}

export type UploadMicrolearningAudioResult = {
  audio_content_id: string
  module_id: string
  title: string
  audio_url: string
  signed_url: string
  storage_path: string
  transcript: string
  transcript_text: string
  summary_text: string
  transcript_provider: 'gemini'
  transcript_model: string
  duration_seconds: number | null
  mime_type: string
}

type GeminiAudioAnalysis = {
  transcript_text: string
  summary_text: string
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

function getAudioBucketName() {
  return normalizeConfigValue(getConfigValue([
    'AUDIO_MODULE_STORAGE_BUCKET_NAME',
    'MICROLEARNING_STORAGE_BUCKET_NAME',
  ], DEFAULT_AUDIO_BUCKET)) || DEFAULT_AUDIO_BUCKET
}

function getGeminiAudioModel() {
  return normalizeConfigValue(getConfigValue([
    'GEMINI_AUDIO_MODEL',
    'GEMINI_TRANSCRIBE_MODEL',
  ], DEFAULT_GEMINI_AUDIO_MODEL)) || DEFAULT_GEMINI_AUDIO_MODEL
}

function getGeminiApiKey() {
  return normalizeConfigValue(getConfigValue(['GEMINI_API_KEY'], ''))
}

function sanitizeAudioFileName(fileName: string) {
  const cleaned = fileName.trim().replace(/[^A-Za-z0-9._-]+/g, '-')
  return cleaned.replace(/^-+|-+$/g, '') || 'audio-module.mp3'
}

function isMp3Upload(fileName: string, mimeType: string) {
  const normalizedName = fileName.trim().toLowerCase()
  const normalizedMimeType = mimeType.trim().toLowerCase()
  return normalizedName.endsWith('.mp3') || normalizedMimeType === 'audio/mpeg' || normalizedMimeType === 'audio/mp3'
}

function assertMp3Upload(fileName: string, mimeType: string) {
  if (!isMp3Upload(fileName, mimeType)) {
    throw new AssessmentHttpError(400, 'Only .mp3 uploads are supported for the Microlearning Audio Module.')
  }
}

function buildStoragePath(trainerId: string, moduleId: string, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${trainerId}/${moduleId}/${timestamp}-${sanitizeAudioFileName(fileName)}`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getSupabaseObjectUrl(bucketName: string, storagePath: string) {
  const supabase = createSupabaseAdminClient()
  return supabase.storage.from(bucketName).getPublicUrl(storagePath).data.publicUrl
}

function inferAudioMimeType(assetUrl: string, contentType?: string | null) {
  const normalizedContentType = normalizeConfigValue(contentType || '')
  if (normalizedContentType) {
    return normalizedContentType
  }

  const normalizedUrl = assetUrl.trim().toLowerCase().split('?', 1)[0]
  if (normalizedUrl.endsWith('.wav')) {
    return 'audio/wav'
  }
  if (normalizedUrl.endsWith('.m4a')) {
    return 'audio/mp4'
  }
  if (normalizedUrl.endsWith('.ogg')) {
    return 'audio/ogg'
  }

  return 'audio/mpeg'
}

async function loadAudioAssetBytes(assetUrl: string) {
  if (assetUrl.startsWith('http://') || assetUrl.startsWith('https://')) {
    const response = await fetch(assetUrl, { cache: 'no-store' })
    if (!response.ok) {
      throw new AssessmentHttpError(
        response.status || 500,
        `Unable to download the lesson audio asset (${response.status}).`,
      )
    }
    return Buffer.from(await response.arrayBuffer())
  }

  throw new AssessmentHttpError(400, 'Unsupported lesson audio asset URL.')
}

async function readJsonSafely<T>(response: Response) {
  return (await response.json().catch(() => null)) as T | null
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

async function fetchBackendJson<T>(
  path: string,
  init: RequestInit,
  fallback: string,
) {
  const response = await fetchBackendPath(path, {
    ...init,
    cache: 'no-store',
  })
  if (!response.ok) {
    const payload = await readJsonSafely(response)
    throw new AssessmentHttpError(
      response.status || 500,
      extractBackendErrorMessage(payload, fallback),
    )
  }
  return readJsonSafely<T>(response)
}

async function waitForGeminiFileToBeReady(
  fileManager: GoogleAIFileManager,
  fileId: string,
) {
  for (let attempt = 0; attempt < GEMINI_READY_ATTEMPTS; attempt += 1) {
    const fileState = await fileManager.getFile(fileId)
    if (fileState.state === 'ACTIVE') {
      return fileState
    }
    if (fileState.state === 'FAILED') {
      throw new Error('Gemini could not process the uploaded audio file.')
    }
    await sleep(GEMINI_READY_DELAY_MS)
  }

  throw new Error('Gemini did not finish preparing the uploaded audio in time.')
}

async function transcribeAudioWithGemini(
  fileBytes: Buffer,
  {
    mimeType,
    title,
  }: {
    mimeType: string
    title: string
  },
) {
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    throw new AssessmentHttpError(503, 'GEMINI_API_KEY is not configured for audio transcription.')
  }

  const geminiModel = getGeminiAudioModel()
  const fileManager = new GoogleAIFileManager(apiKey)

  const uploadedFile = await fileManager.uploadFile(fileBytes, {
    displayName: title,
    mimeType,
  })

  try {
    const readyFile = await waitForGeminiFileToBeReady(fileManager, uploadedFile.file.name)
    // Use the Gemini REST endpoint directly so the request shape is explicit
    // and matches the Google AI Gateway / generateContent flow.
    const response = await fetch(`${GEMINI_API_BASE_URL}/models/${geminiModel}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  'Analyze this microlearning lesson audio for a BPO training platform.',
                  'Return JSON only.',
                  'transcript_text must contain a highly accurate verbatim transcript with punctuation.',
                  'summary_text must contain a concise 2 to 3 sentence lesson summary for trainee navigation.',
                  'Do not include markdown, timestamps, or extra keys.',
                ].join(' '),
              },
              {
                fileData: {
                  fileUri: readyFile.uri,
                  mimeType: readyFile.mimeType,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: 'object',
            properties: {
              transcript_text: {
                type: 'string',
                description: 'Highly accurate transcript of the uploaded lesson audio.',
              },
              summary_text: {
                type: 'string',
                description: 'Concise 2 to 3 sentence summary of the lesson for trainee playback navigation.',
              },
            },
            required: ['transcript_text', 'summary_text'],
          },
        },
      }),
    })

    const payload = (await response.json().catch(() => null)) as
      | {
          candidates?: Array<{
            content?: {
              parts?: Array<{
                text?: string
              }>
            }
          }>
          error?: {
            message?: string
          }
        }
      | null

    if (!response.ok) {
      throw new Error(
        payload?.error?.message
        || `Gemini returned ${response.status} while processing the uploaded audio.`,
      )
    }

    const responseText = payload?.candidates
      ?.flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text?.trim() || '')
      .find(Boolean)

    if (!responseText) {
      throw new Error('Gemini returned an empty structured response for the uploaded audio.')
    }

    const parsed = JSON.parse(responseText) as Partial<GeminiAudioAnalysis>
    const transcript_text = parsed.transcript_text?.trim() || ''
    const summary_text = parsed.summary_text?.trim() || ''

    if (!transcript_text) {
      throw new Error('Gemini returned an empty transcript for the uploaded audio.')
    }

    return {
      transcript: transcript_text,
      transcript_text,
      summary_text,
      geminiModel,
      geminiFileUri: readyFile.uri,
    }
  } finally {
    await fileManager.deleteFile(uploadedFile.file.name).catch(() => undefined)
  }
}

async function getTrainerModuleIds(authorization: string) {
  const payload = await fetchBackendJson<TrainerModuleListResponse>(
    '/api/trainer/microlearning-modules',
    {
      method: 'GET',
      headers: {
        Authorization: authorization,
      },
    },
    'Unable to verify trainer access to the requested microlearning module.',
  )

  return new Set(
    (payload?.modules || [])
      .map((moduleRow) => moduleRow.id || '')
      .filter((moduleId): moduleId is string => moduleId.length > 0),
  )
}

export async function assertTrainerOwnsMicrolearningModule(
  authorization: string,
  moduleId: string,
) {
  const moduleIds = await getTrainerModuleIds(authorization)
  if (!moduleIds.has(moduleId)) {
    throw new AssessmentHttpError(404, 'Microlearning module not found for this trainer.')
  }
}

async function getBackendMicrolearningModule(
  authorization: string,
  moduleId: string,
) {
  return fetchBackendJson<BackendModuleDetail>(
    `/api/microlearning/modules/${moduleId}`,
    {
      method: 'GET',
      headers: {
        Authorization: authorization,
      },
    },
    'Unable to load the existing microlearning audio metadata.',
  )
}

async function syncBackendMicrolearningAudio(
  authorization: string,
  {
    moduleId,
    audioUrl,
    transcript,
    summaryText,
    audioContentId,
    storagePath,
    mimeType,
    audioLanguage,
    transcriptModel,
    durationSeconds,
  }: {
    moduleId: string
    audioUrl: string
    transcript: string
    summaryText: string
    audioContentId: string
    storagePath: string
    mimeType: string
    audioLanguage: string
    transcriptModel: string
    durationSeconds: number | null
  },
) {
  const currentModule = await getBackendMicrolearningModule(authorization, moduleId)
  const contentData = {
    ...(currentModule?.content_data || {}),
    asset_url: audioUrl,
    audio_url: audioUrl,
    transcript,
    transcript_text: transcript,
    content: transcript,
    captions_text: transcript,
    summary: summaryText,
    summary_text: summaryText,
    audio_summary: summaryText,
    audio_content_id: audioContentId,
    audio_storage_path: storagePath,
    audio_bucket: getAudioBucketName(),
    audio_content_type: mimeType,
    audio_language: audioLanguage,
    transcript_provider: 'gemini',
    transcript_model: transcriptModel,
    signed_url_required: true,
    live_caption_mode: 'simulated',
  } satisfies Record<string, unknown>

  await fetchBackendJson(
    `/api/microlearning/modules/${moduleId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content_url: audioUrl,
        content_data: contentData,
        audio_url: audioUrl,
        audio_transcript: transcript,
        audio_duration_seconds: durationSeconds ?? undefined,
        audio_language: audioLanguage || currentModule?.audio_language || 'en-US',
      }),
    },
    'Unable to sync the uploaded audio metadata to the microlearning module.',
  )
}

async function fetchAudioContentRow(moduleId: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('audio_content')
    .select('*')
    .eq('module_id', moduleId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as AudioContentRow | null) || null
}

async function assertTraineeHasAudioModuleAccess(
  authorization: string,
  moduleId: string,
) {
  await fetchBackendJson(
    `/api/microlearning/modules/${moduleId}/audio`,
    {
      method: 'GET',
      headers: {
        Authorization: authorization,
      },
    },
    'You do not have access to this microlearning audio lesson.',
  )
}

export async function getAuthorizedAudioPlaybackMetadata(
  authorization: string,
  moduleId: string,
) {
  const payload = await fetchBackendJson<BackendModuleAudioMetadata>(
    `/api/microlearning/modules/${moduleId}/audio`,
    {
      method: 'GET',
      headers: {
        Authorization: authorization,
      },
    },
    'Unable to load the microlearning audio transcript metadata.',
  )

  return {
    title: payload?.title?.trim() || '',
    audioUrl: payload?.audio_url?.trim() || '',
    transcriptText: payload?.transcript?.trim() || '',
    durationSeconds:
      typeof payload?.audio_duration_seconds === 'number' && Number.isFinite(payload.audio_duration_seconds)
        ? payload.audio_duration_seconds
        : null,
    audioLanguage: payload?.audio_language?.trim() || '',
    captionsUrl: payload?.captions_url?.trim() || '',
    contentType: payload?.content_type?.trim() || '',
  }
}

export async function generateAuthorizedAudioTranscript(
  authorization: string,
  moduleId: string,
) {
  const playbackMetadata = await getAuthorizedAudioPlaybackMetadata(authorization, moduleId)
  if (playbackMetadata.transcriptText) {
    return {
      transcriptText: playbackMetadata.transcriptText,
      summaryText: '',
      durationSeconds: playbackMetadata.durationSeconds,
      audioUrl: playbackMetadata.audioUrl,
      audioLanguage: playbackMetadata.audioLanguage,
      transcriptProvider: 'stored',
    }
  }

  if (!playbackMetadata.audioUrl) {
    throw new AssessmentHttpError(404, 'No lesson audio file is attached to this microlearning module.')
  }

  const audioBytes = await loadAudioAssetBytes(playbackMetadata.audioUrl)
  const analysis = await transcribeAudioWithGemini(audioBytes, {
    mimeType: inferAudioMimeType(playbackMetadata.audioUrl, playbackMetadata.contentType),
    title: playbackMetadata.title || `Microlearning audio ${moduleId}`,
  })

  return {
    transcriptText: analysis.transcript_text || analysis.transcript,
    summaryText: analysis.summary_text || '',
    durationSeconds: playbackMetadata.durationSeconds,
    audioUrl: playbackMetadata.audioUrl,
    audioLanguage: playbackMetadata.audioLanguage,
    transcriptProvider: 'gemini',
  }
}

export async function getAuthorizedAudioContent(
  authorization: string,
  sessionUser: BackendSessionUser,
  moduleId: string,
) {
  const row = await fetchAudioContentRow(moduleId)
  if (!row) {
    throw new AssessmentHttpError(404, 'No uploaded audio module was found for this lesson.')
  }

  if (sessionUser.role === 'admin') {
    return row
  }

  if (sessionUser.role === 'trainer') {
    if (row.trainer_id !== sessionUser.userId) {
      throw new AssessmentHttpError(403, 'You do not have access to this trainer-owned audio module.')
    }
    return row
  }

  await assertTraineeHasAudioModuleAccess(authorization, moduleId)
  return row
}

export async function createAudioModuleSignedUrl(storagePath: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .storage
    .from(getAudioBucketName())
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw error || new Error('Unable to create a signed playback URL for the microlearning audio module.')
  }

  return data.signedUrl
}

async function persistAudioContentRow(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  existingRow: AudioContentRow | null,
  {
    moduleId,
    title,
    trainerId,
    canonicalAudioUrl,
    storagePath,
    mimeType,
    transcript,
    summaryText,
    geminiModel,
    geminiFileUri,
  }: {
    moduleId: string
    title: string
    trainerId: string
    canonicalAudioUrl: string
    storagePath: string
    mimeType: string
    transcript: string
    summaryText: string
    geminiModel: string
    geminiFileUri: string
  },
) {
  const rowPayload = {
    module_id: moduleId,
    title,
    trainer_id: trainerId,
    url: canonicalAudioUrl,
    storage_path: storagePath,
    mime_type: mimeType,
    transcript,
    transcript_text: transcript,
    summary_text: summaryText,
    duration_seconds: null,
    gemini_model: geminiModel,
    gemini_file_uri: geminiFileUri,
  }

  if (existingRow?.id) {
    const { data, error } = await supabase
      .from('audio_content')
      .update(rowPayload)
      .eq('id', existingRow.id)
      .select('*')
      .single()

    if (error || !data) {
      throw error || new Error('Unable to update the audio module metadata.')
    }

    return data as AudioContentRow
  }

  const { data, error } = await supabase
    .from('audio_content')
    .insert(rowPayload)
    .select('*')
    .single()

  if (error || !data) {
    throw error || new Error('Unable to save the audio module metadata.')
  }

  return data as AudioContentRow
}

export async function uploadMicrolearningAudioContent({
  authorization,
  moduleId,
  trainerId,
  title,
  fileName,
  mimeType,
  fileBytes,
  audioLanguage,
}: UploadMicrolearningAudioParams): Promise<UploadMicrolearningAudioResult> {
  assertMp3Upload(fileName, mimeType)

  const supabase = createSupabaseAdminClient()
  const existingRow = await fetchAudioContentRow(moduleId)
  const bucketName = getAudioBucketName()
  const storagePath = buildStoragePath(trainerId, moduleId, fileName)
  const canonicalAudioUrl = getSupabaseObjectUrl(bucketName, storagePath)

  const { error: uploadError } = await supabase
    .storage
    .from(bucketName)
    .upload(storagePath, fileBytes, {
      contentType: mimeType,
      upsert: true,
    })

  if (uploadError) {
    throw uploadError
  }

  const { transcript, transcript_text, summary_text, geminiModel, geminiFileUri } = await transcribeAudioWithGemini(fileBytes, {
    mimeType,
    title,
  })

  const persistedRow = await persistAudioContentRow(supabase, existingRow, {
    moduleId,
    title,
    trainerId,
    canonicalAudioUrl,
    storagePath,
    mimeType,
    transcript: transcript_text || transcript,
    summaryText: summary_text,
    geminiModel,
    geminiFileUri,
  })

  if (existingRow?.storage_path && existingRow.storage_path !== storagePath) {
    await supabase.storage.from(bucketName).remove([existingRow.storage_path]).catch(() => undefined)
  }

  const signedUrl = await createAudioModuleSignedUrl(storagePath)

  await syncBackendMicrolearningAudio(authorization, {
    moduleId,
    audioUrl: canonicalAudioUrl,
    transcript: transcript_text || transcript,
    summaryText: summary_text,
    audioContentId: persistedRow.id,
    storagePath,
    mimeType,
    audioLanguage: audioLanguage || 'en-US',
    transcriptModel: geminiModel,
    durationSeconds: persistedRow.duration_seconds,
  })

  return {
    audio_content_id: persistedRow.id,
    module_id: moduleId,
    title,
    audio_url: canonicalAudioUrl,
    signed_url: signedUrl,
    storage_path: storagePath,
    transcript: transcript_text || transcript,
    transcript_text: transcript_text || transcript,
    summary_text,
    transcript_provider: 'gemini',
    transcript_model: geminiModel,
    duration_seconds: persistedRow.duration_seconds,
    mime_type: mimeType,
  }
}
