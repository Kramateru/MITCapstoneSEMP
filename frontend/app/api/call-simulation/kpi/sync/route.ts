import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { fetchBackendPath } from '@/app/lib/backend-proxy'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import type { ScenarioKpiMetricDefinition } from '@/app/lib/call-simulation/dialer-feedback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type KpiSyncBody = {
  scenarioGroupIds: string[]
  metrics: ScenarioKpiMetricDefinition[]
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

    const body = (await request.json()) as KpiSyncBody
    const backendResponse = await fetchBackendPath('/api/call-simulation/kpi/sync', {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scenarioGroupIds: Array.isArray(body.scenarioGroupIds) ? body.scenarioGroupIds : [],
        metrics: Array.isArray(body.metrics) ? body.metrics : [],
      }),
      cache: 'no-store',
    })

    const payload = await backendResponse.json().catch(() => null)
    if (!backendResponse.ok) {
      return NextResponse.json(
        { syncError: getErrorMessage(payload, 'Unable to sync KPI metrics to Supabase.') },
        { status: backendResponse.status || 500 },
      )
    }

    return NextResponse.json(payload ?? { syncError: null })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
