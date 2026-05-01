import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import {
  syncDialerScenarioToSupabase,
  type DialerScenarioSyncInput,
  type DialerScriptFlowStep,
} from '@/app/lib/call-simulation/dialer-feedback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ScenarioSyncBody = {
  scenarioId: string
  title?: string | null
  description?: string | null
  topic: string
  targetKpis?: Record<string, unknown>
  scriptFlow?: DialerScriptFlowStep[]
  ringerAudioUrl?: string | null
  holdAudioUrl?: string | null
  difficulty?: string | null
  estimatedDurationSeconds?: number | null
  passingScore?: number | null
  isPublished?: boolean | null
  isActive?: boolean | null
  metadata?: Record<string, unknown>
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['trainer', 'admin'])
    const body = (await request.json()) as ScenarioSyncBody

    const syncInput: DialerScenarioSyncInput = {
      sourceScenarioId: body.scenarioId,
      trainerId: sessionUser.userId,
      title: body.title || null,
      description: body.description || null,
      topic: body.topic,
      targetKpis: body.targetKpis || {},
      scriptFlow: body.scriptFlow || [],
      ringerAudioUrl: body.ringerAudioUrl || null,
      holdAudioUrl: body.holdAudioUrl || null,
      difficulty: body.difficulty || null,
      estimatedDurationSeconds: body.estimatedDurationSeconds ?? null,
      passingScore: body.passingScore ?? null,
      isPublished: body.isPublished ?? true,
      isActive: body.isActive ?? true,
      metadata: body.metadata || {},
    }

    const syncResult = await syncDialerScenarioToSupabase(syncInput)
    if (syncResult.syncError) {
      return NextResponse.json(syncResult, { status: 500 })
    }

    return NextResponse.json(syncResult)
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
