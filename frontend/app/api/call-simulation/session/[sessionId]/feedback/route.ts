import { NextResponse } from 'next/server'

import { requireBackendSessionUser } from '@/app/lib/assessment/backend-auth'
import { handleAssessmentRouteError } from '@/app/lib/assessment/route-utils'
import {
  generateDialerFeedbackReport,
  syncDialerScoreToSupabase,
  type DialerFeedbackInput,
  type DialerScriptFlowStep,
} from '@/app/lib/call-simulation/dialer-feedback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type FeedbackRouteBody = Omit<DialerFeedbackInput, 'sessionId' | 'traineeId' | 'traineeName'> & {
  scriptFlow?: DialerScriptFlowStep[]
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const sessionUser = await requireBackendSessionUser(request, ['trainee'])
    const { sessionId } = await context.params
    const body = (await request.json()) as FeedbackRouteBody

    const feedbackInput: DialerFeedbackInput = {
      sessionId,
      scenarioId: body.scenarioId,
      scenarioTitle: body.scenarioTitle,
      topic: body.topic,
      traineeId: sessionUser.userId,
      traineeName: sessionUser.userName,
      trainerId: body.trainerId || null,
      attemptNumber: body.attemptNumber || null,
      recordingUrl: body.recordingUrl || null,
      startedAt: body.startedAt || null,
      endedAt: body.endedAt || null,
      durationSeconds: body.durationSeconds || null,
      targetKpis: body.targetKpis || {},
      scriptFlow: body.scriptFlow || [],
      turnLogs: body.turnLogs || [],
      transcriptLog: body.transcriptLog || [],
      totalScore: Number(body.totalScore || 0),
      passingScore: Number(body.passingScore || 80),
      ahtSeconds: Number(body.ahtSeconds || 0),
      speechAccuracy: Number(body.speechAccuracy || 0),
      grammarScore: Number(body.grammarScore || 0),
      pronunciationScore: Number(body.pronunciationScore || 0),
      pacingScore: Number(body.pacingScore || 0),
      softSkillSignals: body.softSkillSignals || {},
      certificateId: body.certificateId || null,
    }

    const report = await generateDialerFeedbackReport(feedbackInput)
    const syncResult = await syncDialerScoreToSupabase(feedbackInput, report)

    return NextResponse.json({
      report,
      supabase_sync: syncResult,
    })
  } catch (error) {
    return handleAssessmentRouteError(error)
  }
}
