import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { fetchBackendPath } from '@/app/lib/backend-proxy'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ScenarioSyncBody = {
  scenarioId: string
  title?: string | null
  description?: string | null
  topic: string
  targetKpis?: Record<string, unknown>
  scriptFlow?: Array<Record<string, unknown>>
  ringerAudioUrl?: string | null
  holdAudioUrl?: string | null
  difficulty?: string | null
  estimatedDurationSeconds?: number | null
  passingScore?: number | null
  isPublished?: boolean | null
  isActive?: boolean | null
  metadata?: Record<string, unknown>
}

type ScenarioDeleteBody = {
  scenarioId: string
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const candidate = payload as { detail?: unknown; error?: unknown; message?: unknown; syncError?: unknown }
    for (const value of [candidate.syncError, candidate.detail, candidate.error, candidate.message]) {
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }
  }

  return fallback
}

export async function POST(request: Request) {
  try {
    await requireBackendSessionUser(request, ['trainer', 'admin'])
    const authorization = request.headers.get('authorization')
    if (!authorization) {
      return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 })
    }

    const body = (await request.json()) as ScenarioSyncBody
    const backendResponse = await fetchBackendPath('/api/call-simulation/scenarios/sync', {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scenario: body,
      }),
      cache: 'no-store',
    })

    const payload = await backendResponse.json().catch(() => null)
    if (!backendResponse.ok) {
      return NextResponse.json(
        { syncError: getErrorMessage(payload, 'Unable to sync the scenario and scripts to Supabase.') },
        { status: backendResponse.status || 500 },
      )
    }

    return NextResponse.json(payload ?? { syncError: null })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    await requireBackendSessionUser(request, ['trainer', 'admin'])
    const authorization = request.headers.get('authorization')
    if (!authorization) {
      return NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 })
    }

    const body = (await request.json()) as ScenarioDeleteBody
    const backendResponse = await fetchBackendPath('/api/call-simulation/scenarios/sync', {
      method: 'DELETE',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scenarioId: body.scenarioId,
      }),
      cache: 'no-store',
    })

    const payload = await backendResponse.json().catch(() => null)
    if (!backendResponse.ok) {
      return NextResponse.json(
        { syncError: getErrorMessage(payload, 'Unable to remove the Supabase scenario mirror.') },
        { status: backendResponse.status || 500 },
      )
    }

    return NextResponse.json(payload ?? { syncError: null })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
