import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import {
  syncScenarioKpiMetricsToSupabase,
  type ScenarioKpiMetricDefinition,
} from '@/app/lib/call-simulation/dialer-feedback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type KpiSyncBody = {
  scenarioGroupIds: string[]
  metrics: ScenarioKpiMetricDefinition[]
}

export async function POST(request: Request) {
  try {
    await requireBackendSessionUser(request, ['trainer', 'admin'])
    const body = (await request.json()) as KpiSyncBody
    const syncError = await syncScenarioKpiMetricsToSupabase({
      scenarioGroupIds: Array.isArray(body.scenarioGroupIds) ? body.scenarioGroupIds : [],
      metrics: Array.isArray(body.metrics) ? body.metrics : [],
    })

    if (syncError) {
      return NextResponse.json({ syncError }, { status: 500 })
    }

    return NextResponse.json({ syncError: null })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
