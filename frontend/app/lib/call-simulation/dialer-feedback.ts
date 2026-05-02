import 'server-only'

import { GoogleGenerativeAI } from '@google/generative-ai'

import { createSupabaseAdminClient } from '@/app/lib/assessment/supabase-admin'

export type DialerScriptFlowStep = {
  step_id: string
  suggested_csr_script: string
  member_response_text: string
  point_value: number
  expected_keywords?: string[]
  member_audio_url?: string | null
}

export type DialerConversationTurn = {
  actor: string
  speaker_label?: string | null
  transcript?: string | null
  expected_script?: string | null
  matched_keywords?: string[]
  duration_seconds?: number | null
  speech_to_text_accuracy?: number | null
  grammar_score?: number | null
  pronunciation_score?: number | null
  pacing_score?: number | null
  rate_of_speech?: number | null
  coach_note?: string | null
}

export type DialerFeedbackInput = {
  sessionId: string
  scenarioId: string
  scenarioTitle: string
  topic: string
  traineeId: string
  traineeName: string
  targetKpis: Record<string, unknown>
  scriptFlow: DialerScriptFlowStep[]
  turnLogs: DialerConversationTurn[]
  transcriptLog: DialerConversationTurn[]
  totalScore: number
  passingScore: number
  ahtSeconds: number
  speechAccuracy: number
  grammarScore: number
  pronunciationScore: number
  pacingScore: number
  softSkillSignals: {
    empathyCount?: number | null
    probingCount?: number | null
    sentimentScore?: number | null
    deadAirSeconds?: number | null
    rateOfSpeech?: number | null
  }
  certificateId?: string | null
}

export type DialerFeedbackReport = {
  provider: 'gemini' | 'fallback'
  model: string
  overallSummary: string
  totalScore: number
  passingScore: number
  passed: boolean
  scriptAccuracy: {
    score: number
    strengths: string[]
    misses: string[]
  }
  grammarAndPronunciation: {
    score: number
    notes: string[]
  }
  softSkills: {
    score: number
    notes: string[]
  }
  pacingAndAht: {
    ahtSeconds: number
    notes: string[]
  }
  coachingTips: string[]
  rawModelText?: string
}

export type DialerScenarioSyncInput = {
  sourceScenarioId: string
  trainerId?: string | null
  title?: string | null
  description?: string | null
  topic: string
  scenarioGroup?: string | null
  targetKpis: Record<string, unknown>
  scriptFlow: DialerScriptFlowStep[]
  ringerAudioUrl?: string | null
  holdAudioUrl?: string | null
  difficulty?: string | null
  estimatedDurationSeconds?: number | null
  passingScore?: number | null
  isPublished?: boolean | null
  isActive?: boolean | null
  metadata?: Record<string, unknown>
}

export type DialerScenarioSyncResult = {
  scenarioRecordId: string | null
  syncError: string | null
}

export type DialerScoreSyncResult = {
  scoreRecordId: string | null
  scenarioRecordId: string | null
  certificateRecordId: string | null
  syncError: string | null
}

export type ScenarioKpiMetricDefinition = {
  metricName: string
  weightPercentage: number
}

export type ScenarioKpiSyncInput = {
  scenarioGroupIds: string[]
  metrics: ScenarioKpiMetricDefinition[]
}

function normalizeEnvValue(value: string | undefined) {
  const trimmed = (value || '').trim()
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    return ''
  }
  return trimmed
}

function getGeminiApiKey() {
  return normalizeEnvValue(process.env.GEMINI_API_KEY)
}

function getDialerGeminiModel() {
  return normalizeEnvValue(process.env.GEMINI_CALL_SIM_MODEL) || 'gemini-1.5-flash'
}

function safeRound(value: number, precision = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(precision)) : 0
}

function normalizeUuidCandidate(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    return null
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null
}

function sanitizeScriptFlow(scriptFlow: DialerScriptFlowStep[]) {
  return scriptFlow.map((step, index) => ({
    step_id: step.step_id?.trim() || `step-${index + 1}`,
    suggested_csr_script: step.suggested_csr_script?.trim() || '',
    member_response_text: step.member_response_text?.trim() || '',
    point_value: safeRound(Number(step.point_value || 0), 2),
    expected_keywords: Array.isArray(step.expected_keywords)
      ? step.expected_keywords.map((keyword) => keyword.trim()).filter(Boolean)
      : [],
    member_audio_url: step.member_audio_url || null,
  }))
}

function buildCertificateTitle(topic: string) {
  const resolvedTopic = topic.trim() || 'Call Simulation'
  return `Certificate of Competency - ${resolvedTopic}`
}

function buildCertificateDownloadUrl(certificateId: string) {
  return `/api/certification/certificate/${certificateId}/pdf`
}

function buildKpiMetricRowsFromTargetKpis(
  scenarioGroupId: string,
  targetKpis: Record<string, unknown>,
) {
  const metricCandidates: Array<[string, unknown]> = [
    ['Script Accuracy', targetKpis.speech_to_text_weight],
    ['AHT', targetKpis.aht_weight],
    ['Rate of Speech', targetKpis.rate_of_speech_weight],
    ['Dead Air', targetKpis.dead_air_weight],
    ['Empathy', targetKpis.empathy_statements_weight],
    ['Probing', targetKpis.probing_questions_weight],
    ['Grammar', targetKpis.grammar_weight],
    ['Pronunciation', targetKpis.pronunciation_weight],
    ['Pacing', targetKpis.pacing_weight],
  ]

  return metricCandidates
    .map(([metricName, value]) => {
      const weightValue = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Number(value)
          : Number.NaN

      return {
        metric_name: metricName,
        weight_percentage: Number.isFinite(weightValue) ? Math.max(0, Math.round(weightValue)) : null,
      }
    })
    .filter((metric) => metric.weight_percentage !== null)
    .map((metric) => ({
      scenario_group_id: scenarioGroupId,
      ...metric,
    }))
}

function readScenarioGroupFromStepId(stepId: string) {
  const normalized = stepId.trim().replace(/^scenario[-_:]*/i, '').trim()
  return normalized || stepId.trim() || '1'
}

function buildScenarioGroupSummary(scriptFlow: DialerScriptFlowStep[]) {
  return Array.from(
    new Set(
      scriptFlow
        .map((step) => readScenarioGroupFromStepId(step.step_id || ''))
        .filter(Boolean),
    ),
  ).join(', ')
}

function buildSupabaseScenarioRows(
  scenarioId: string,
  scriptFlow: DialerScriptFlowStep[],
) {
  let sequenceOrder = 1

  return scriptFlow.flatMap((step) => {
    const scenarioGroup = readScenarioGroupFromStepId(step.step_id || '')
    const expectedKeywords = Array.isArray(step.expected_keywords)
      ? step.expected_keywords.map((keyword) => keyword.trim()).filter(Boolean)
      : []
    const rows: Array<Record<string, unknown>> = []
    const csrScript = step.suggested_csr_script.trim()

    if (csrScript) {
      rows.push({
        scenario_id: scenarioId,
        actor_type: 'CSR',
        content: csrScript,
        score_weight: safeRound(Number(step.point_value || 0), 2),
        sequence_order: sequenceOrder,
        scenario_group: scenarioGroup,
        audio_url: null,
        metadata: {
          step_id: step.step_id,
          expected_keywords: expectedKeywords,
          role: 'csr',
        },
      })
      sequenceOrder += 1
    }

    const memberScript = step.member_response_text.trim()
    if (memberScript || step.member_audio_url) {
      rows.push({
        scenario_id: scenarioId,
        actor_type: 'Member',
        content: memberScript,
        score_weight: 0,
        sequence_order: sequenceOrder,
        scenario_group: scenarioGroup,
        audio_url: step.member_audio_url || null,
        metadata: {
          step_id: step.step_id,
          role: 'member',
        },
      })
      sequenceOrder += 1
    }

    return rows
  })
}

async function syncScenarioAuthoringTables(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: DialerScenarioSyncInput,
  scriptFlow: DialerScriptFlowStep[],
  nowIso: string,
) {
  const scenarioId = normalizeUuidCandidate(input.sourceScenarioId)
  if (!scenarioId) {
    return 'Scenario sync requires a UUID-shaped scenario id before it can mirror the trainer record to Supabase.'
  }

  const trainerId = normalizeUuidCandidate(input.trainerId)
  const resolvedTopic = input.topic.trim() || input.title?.trim() || 'Call Scenario'
  const resolvedTitle = input.title?.trim() || resolvedTopic
  const resolvedDescription = input.description?.trim() || null
  const scenarioGroup = input.scenarioGroup?.trim() || buildScenarioGroupSummary(scriptFlow) || null
  const expectedKeywords = Array.from(
    new Set(
      scriptFlow.flatMap((step) => Array.isArray(step.expected_keywords) ? step.expected_keywords : []),
    ),
  )
  const scenarioPayload = {
    id: scenarioId,
    title: resolvedTitle,
    topic: resolvedTopic,
    description: resolvedDescription,
    scenario_group: scenarioGroup,
    opening_prompt: resolvedDescription || scriptFlow[0]?.suggested_csr_script || resolvedTopic,
    expected_keywords: expectedKeywords,
    estimated_duration: Number.isFinite(Number(input.estimatedDurationSeconds))
      ? Number(input.estimatedDurationSeconds)
      : null,
    difficulty: input.difficulty?.trim() || null,
    purpose: 'practice',
    member_profile: {},
    cxone_metadata: {},
    call_simulation_config: {
      ...(input.metadata || {}),
      scenario_group_label: scenarioGroup,
      target_kpis: input.targetKpis,
      script_flow: scriptFlow,
    },
    ringer_audio_url: input.ringerAudioUrl || null,
    hold_audio_url: input.holdAudioUrl || null,
    created_by: trainerId,
    is_published: input.isPublished !== false,
    is_draft: false,
    updated_at: nowIso,
  }

  const { error: scenarioError } = await supabase
    .from('scenarios')
    .upsert(scenarioPayload, { onConflict: 'id' })

  if (scenarioError) {
    throw scenarioError
  }

  const { error: scenarioGroupError } = await supabase
    .from('scenario_groups')
    .upsert({
      id: scenarioId,
      title: resolvedTitle,
      topic: resolvedTopic,
      description: resolvedDescription,
      created_by: trainerId,
    }, { onConflict: 'id' })

  if (scenarioGroupError) {
    throw scenarioGroupError
  }

  const { error: deleteScriptsError } = await supabase
    .from('scripts')
    .delete()
    .eq('scenario_id', scenarioId)

  if (deleteScriptsError) {
    throw deleteScriptsError
  }

  const scriptRows = buildSupabaseScenarioRows(scenarioId, scriptFlow)
  if (scriptRows.length === 0) {
    return null
  }

  const { error: insertScriptsError } = await supabase
    .from('scripts')
    .insert(scriptRows)

  if (insertScriptsError) {
    throw insertScriptsError
  }

  const { error: deleteScenarioScriptsError } = await supabase
    .from('scenario_scripts')
    .delete()
    .eq('scenario_group_id', scenarioId)

  if (deleteScenarioScriptsError) {
    throw deleteScenarioScriptsError
  }

  const scenarioScriptRows = scriptRows.map((row) => ({
    scenario_group_id: scenarioId,
    actor_type: row.actor_type,
    script_text: row.content,
    score_value: Math.max(0, Math.round(Number(row.score_weight || 0))),
    order_index: Number(row.sequence_order || 0),
    audio_url: typeof row.audio_url === 'string' ? row.audio_url : null,
  }))

  if (scenarioScriptRows.length > 0) {
    const { error: insertScenarioScriptsError } = await supabase
      .from('scenario_scripts')
      .insert(scenarioScriptRows)

    if (insertScenarioScriptsError) {
      throw insertScenarioScriptsError
    }
  }

  const fallbackMetricRows = buildKpiMetricRowsFromTargetKpis(scenarioId, input.targetKpis)
  if (fallbackMetricRows.length > 0) {
    const { error: deleteMetricRowsError } = await supabase
      .from('kpi_metrics')
      .delete()
      .eq('scenario_group_id', scenarioId)

    if (deleteMetricRowsError) {
      throw deleteMetricRowsError
    }

    const { error: insertMetricRowsError } = await supabase
      .from('kpi_metrics')
      .insert(fallbackMetricRows)

    if (insertMetricRowsError) {
      throw insertMetricRowsError
    }
  }

  return null
}

async function syncUnifiedSimulationResults(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: DialerFeedbackInput,
  report: DialerFeedbackReport,
  nowIso: string,
) {
  const traineeId = normalizeUuidCandidate(input.traineeId)
  const scenarioId = normalizeUuidCandidate(input.scenarioId)

  if (!traineeId || !scenarioId) {
    return 'Results sync requires UUID-shaped trainee and scenario ids before it can write the normalized Supabase result row.'
  }

  const fullTranscript = buildFullConversationTranscript(input.transcriptLog)
  const sessionStartedAt = new Date(Date.now() - (Math.max(0, Number(input.ahtSeconds || 0)) * 1000)).toISOString()
  const aiFeedback = {
    report,
    metrics: {
      totalScore: safeRound(input.totalScore),
      passingScore: safeRound(input.passingScore),
      ahtSeconds: Math.max(0, Number(input.ahtSeconds || 0)),
      speechAccuracy: safeRound(input.speechAccuracy),
      grammarScore: safeRound(input.grammarScore),
      pronunciationScore: safeRound(input.pronunciationScore),
      pacingScore: safeRound(input.pacingScore),
      softSkillSignals: input.softSkillSignals,
    },
    targetKpis: input.targetKpis,
    scriptFlow: sanitizeScriptFlow(input.scriptFlow),
    turnLogs: input.turnLogs,
    transcriptLog: input.transcriptLog,
  }

  const { error } = await supabase
    .from('simulations_results')
    .upsert({
      id: input.sessionId,
      trainee_id: traineeId,
      scenario_id: scenarioId,
      scenario_title: input.scenarioTitle,
      scenario_topic: input.topic,
      final_score: safeRound(input.totalScore),
      ai_feedback: aiFeedback,
      transcript: fullTranscript,
      passed: report.passed,
      certificate_id: input.certificateId || null,
      updated_at: nowIso,
    }, { onConflict: 'id' })

  if (error) {
    throw error
  }

  const { error: traineeSessionError } = await supabase
    .from('trainee_sessions')
    .upsert({
      id: input.sessionId,
      trainee_id: traineeId,
      scenario_group_id: scenarioId,
      started_at: sessionStartedAt,
      completed_at: nowIso,
      total_score: Math.max(0, Math.round(input.totalScore)),
      passed: report.passed,
      ai_feedback: report.overallSummary,
    }, { onConflict: 'id' })

  if (traineeSessionError) {
    throw traineeSessionError
  }

  const { data: scenarioScriptRows, error: scenarioScriptLookupError } = await supabase
    .from('scenario_scripts')
    .select('id, script_text, order_index')
    .eq('scenario_group_id', scenarioId)
    .eq('actor_type', 'CSR')
    .order('order_index', { ascending: true })

  if (scenarioScriptLookupError) {
    throw scenarioScriptLookupError
  }

  const scriptIdByText = new Map(
    (scenarioScriptRows || []).map((row) => [String(row.script_text || '').trim(), String(row.id || '')]),
  )
  const orderedScenarioScriptIds = (scenarioScriptRows || []).map((row) => String(row.id || ''))

  const { error: deleteResponsesError } = await supabase
    .from('session_responses')
    .delete()
    .eq('session_id', input.sessionId)

  if (deleteResponsesError) {
    throw deleteResponsesError
  }

  const responseRows = input.turnLogs
    .filter((turn) => (turn.actor || '').toLowerCase() === 'csr')
    .map((turn, index) => {
      const expectedScript = String(turn.expected_script || input.scriptFlow[index]?.suggested_csr_script || '').trim()
      const resolvedScriptId = scriptIdByText.get(expectedScript) || orderedScenarioScriptIds[index] || null
      const stepId = resolvedScriptId && normalizeUuidCandidate(resolvedScriptId)
        ? resolvedScriptId
        : null

      return {
        session_id: input.sessionId,
        script_id: stepId,
        scenario_id: input.scenarioId,
        trainee_id: input.traineeId,
        step_number: index + 1,
        turn_attempt_number: 1,
        actor_type: 'CSR',
        scenario_group: readScenarioGroupFromStepId(input.scriptFlow[index]?.step_id || String(index + 1)),
        expected_script: expectedScript,
        trainee_spoken_text: String(turn.transcript || ''),
        matched_score: Math.max(0, Math.round(Number((turn as Record<string, unknown>).matched_score || (turn as Record<string, unknown>).earned_points || 0))),
        grammar_score: Math.max(0, Math.round(Number(turn.grammar_score || 0))),
        pronunciation_score: Math.max(0, Math.round(Number(turn.pronunciation_score || 0))),
        pacing_score: Math.max(0, Math.round(Number(turn.pacing_score || 0))),
        speech_to_text_accuracy: safeRound(Number(turn.speech_to_text_accuracy || 0), 2),
        transcript_confidence: safeRound(Number((turn as Record<string, unknown>).transcript_confidence || 0), 2),
        audio_url: (turn as Record<string, unknown>).audio_url || null,
        ai_feedback: turn.coach_note || null,
      }
    })

  if (responseRows.length > 0) {
    const { error: insertResponsesError } = await supabase
      .from('session_responses')
      .insert(responseRows)

    if (insertResponsesError) {
      throw insertResponsesError
    }
  }

  const normalizedCertificateId = normalizeUuidCandidate(input.certificateId)
  const certificateUrl = normalizedCertificateId ? buildCertificateDownloadUrl(normalizedCertificateId) : null
  if (report.passed && normalizedCertificateId) {
    const { error: certificateError } = await supabase
      .from('certificates')
      .upsert({
        id: normalizedCertificateId,
        trainee_id: traineeId,
        scenario_id: scenarioId,
        scenario_group_id: scenarioId,
        attempt_id: normalizeUuidCandidate(input.sessionId),
        certificate_title: buildCertificateTitle(input.topic),
        certificate_url: certificateUrl,
        status: 'issued',
        remarks: report.overallSummary,
        issue_date: nowIso,
        issued_at: nowIso,
      }, { onConflict: 'id' })

    if (certificateError) {
      throw certificateError
    }
  }

  return null
}

export async function syncScenarioKpiMetricsToSupabase(
  input: ScenarioKpiSyncInput,
) {
  try {
    const supabase = createSupabaseAdminClient()
    const normalizedScenarioGroupIds = input.scenarioGroupIds
      .map((scenarioGroupId) => normalizeUuidCandidate(scenarioGroupId))
      .filter((scenarioGroupId): scenarioGroupId is string => Boolean(scenarioGroupId))

    if (normalizedScenarioGroupIds.length === 0) {
      return null
    }

    const normalizedMetrics = input.metrics
      .map((metric) => ({
        metric_name: metric.metricName.trim(),
        weight_percentage: Math.max(0, Math.round(Number(metric.weightPercentage || 0))),
      }))
      .filter((metric) => metric.metric_name)

    if (normalizedMetrics.length === 0) {
      return null
    }

    const { error: deleteError } = await supabase
      .from('kpi_metrics')
      .delete()
      .in('scenario_group_id', normalizedScenarioGroupIds)

    if (deleteError) {
      throw deleteError
    }

    const rows = normalizedScenarioGroupIds.flatMap((scenarioGroupId) => (
      normalizedMetrics.map((metric) => ({
        scenario_group_id: scenarioGroupId,
        ...metric,
      }))
    ))

    const { error: insertError } = await supabase
      .from('kpi_metrics')
      .insert(rows)

    if (insertError) {
      throw insertError
    }

    return null
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Unable to sync KPI metrics to Supabase.'
  }
}

function extractJsonCandidate(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  return trimmed
}

function buildFullConversationTranscript(turns: DialerConversationTurn[]) {
  return turns
    .map((turn) => {
      const actor = (turn.actor || turn.speaker_label || 'speaker').trim()
      const transcript = (turn.transcript || '').trim()
      if (!transcript) {
        return ''
      }
      return `${actor}: ${transcript}`
    })
    .filter(Boolean)
    .join('\n')
}

function buildScriptComparisonLog(
  scriptFlow: DialerScriptFlowStep[],
  turnLogs: DialerConversationTurn[],
) {
  const usedTurnIndexes = new Set<number>()

  return scriptFlow.map((step) => {
    const matchedTurnIndex = turnLogs.findIndex((turn, index) => {
      if (usedTurnIndexes.has(index)) {
        return false
      }

      const expectedScript = (turn.expected_script || '').trim()
      const targetScript = step.suggested_csr_script.trim()
      if (expectedScript && targetScript && expectedScript === targetScript) {
        return true
      }

      return (turn.transcript || '').trim().length > 0 && !expectedScript && targetScript.length > 0
    })
    const matchedTurn = matchedTurnIndex >= 0 ? turnLogs[matchedTurnIndex] : null

    if (matchedTurnIndex >= 0) {
      usedTurnIndexes.add(matchedTurnIndex)
    }

    return {
      step_id: step.step_id,
      suggested_csr_script: step.suggested_csr_script,
      member_response_text: step.member_response_text,
      point_value: safeRound(Number(step.point_value || 0), 2),
      trainee_transcript: matchedTurn?.transcript || '',
      matched_keywords: matchedTurn?.matched_keywords || [],
      speech_to_text_accuracy: safeRound(Number(matchedTurn?.speech_to_text_accuracy || 0)),
      grammar_score: safeRound(Number(matchedTurn?.grammar_score || 0)),
      pronunciation_score: safeRound(Number(matchedTurn?.pronunciation_score || 0)),
      pacing_score: safeRound(Number(matchedTurn?.pacing_score || 0)),
      duration_seconds: Math.max(0, Number(matchedTurn?.duration_seconds || 0)),
    }
  })
}

function buildFallbackReport(input: DialerFeedbackInput): DialerFeedbackReport {
  const misses = input.scriptFlow
    .filter((step) => !input.turnLogs.some((turn) => (turn.expected_script || '').trim() === step.suggested_csr_script.trim()))
    .map((step) => step.step_id)

  const softSkillNotes: string[] = []
  if ((input.softSkillSignals.empathyCount || 0) <= 0) {
    softSkillNotes.push('Add a clearer empathy statement before moving into troubleshooting.')
  }
  if ((input.softSkillSignals.probingCount || 0) <= 0) {
    softSkillNotes.push('Use more probing questions to confirm the member issue before resolution.')
  }
  if ((input.softSkillSignals.sentimentScore || 0) < 0) {
    softSkillNotes.push('Tone reads as strained in the transcript. Slow down and soften the wording.')
  }

  const pacingNotes: string[] = []
  if ((input.softSkillSignals.deadAirSeconds || 0) > 6) {
    pacingNotes.push('Dead air is high. Tighten transitions between verification, probing, and resolution.')
  }
  if ((input.softSkillSignals.rateOfSpeech || 0) > 175) {
    pacingNotes.push('Rate of speech is fast. Reduce pace to improve control and pronunciation clarity.')
  }
  if (input.ahtSeconds > Number(input.targetKpis.aht_seconds || 240)) {
    pacingNotes.push('Average handle time exceeded the scenario target.')
  }

  return {
    provider: 'fallback',
    model: 'heuristic',
    overallSummary:
      input.totalScore >= input.passingScore
        ? `Passing attempt at ${safeRound(input.totalScore)}%. Continue improving control, transitions, and empathy.`
        : `Attempt closed at ${safeRound(input.totalScore)}%. Focus on script accuracy and soft-skill control before the next retake.`,
    totalScore: safeRound(input.totalScore),
    passingScore: safeRound(input.passingScore),
    passed: input.totalScore >= input.passingScore,
    scriptAccuracy: {
      score: safeRound(input.speechAccuracy),
      strengths: input.turnLogs
        .filter((turn) => (turn.speech_to_text_accuracy || 0) >= 80)
        .slice(0, 3)
        .map((turn) => `${turn.speaker_label || 'CSR'} followed the expected script closely.`),
      misses,
    },
    grammarAndPronunciation: {
      score: safeRound((input.grammarScore + input.pronunciationScore) / 2),
      notes: [
        `Grammar score ${safeRound(input.grammarScore)}%.`,
        `Pronunciation score ${safeRound(input.pronunciationScore)}%.`,
      ],
    },
    softSkills: {
      score: safeRound(Math.max(0, input.totalScore - 8)),
      notes: softSkillNotes.length ? softSkillNotes : ['Soft-skill signals stayed stable in the transcript log.'],
    },
    pacingAndAht: {
      ahtSeconds: input.ahtSeconds,
      notes: pacingNotes.length ? pacingNotes : ['AHT and pacing stayed within the expected dialer window.'],
    },
    coachingTips: [
      'Mirror the suggested CSR script more tightly on high-value turns.',
      'Use hold/resume transitions to buy time without letting the pace feel broken.',
      'Keep empathy statements explicit instead of implied.',
    ],
  }
}

export function buildDialerFeedbackPrompt(input: DialerFeedbackInput) {
  const scriptComparisonLog = buildScriptComparisonLog(input.scriptFlow, input.turnLogs)
  const fullConversationTranscript = buildFullConversationTranscript(input.transcriptLog)

  return [
    'You are grading a BPO call simulation for a trainee CSR.',
    'Use the script comparison log as the primary source for script-accuracy scoring.',
    'Treat obvious speech-to-text artifacts carefully and do not over-penalize grammar or pronunciation when the intended meaning is still clear.',
    'Use the provided metrics and transcript evidence instead of inventing new numbers.',
    `Scenario topic: ${input.topic}`,
    `Scenario title: ${input.scenarioTitle}`,
    `Passing score: ${input.passingScore}`,
    `Target KPIs JSON: ${JSON.stringify(input.targetKpis)}`,
    `Script flow: ${JSON.stringify(sanitizeScriptFlow(input.scriptFlow))}`,
    `Script comparison log: ${JSON.stringify(scriptComparisonLog)}`,
    `Full conversation transcript:\n${fullConversationTranscript}`,
    `Turn logs: ${JSON.stringify(input.turnLogs)}`,
    `Transcript timeline: ${JSON.stringify(input.transcriptLog)}`,
    `Metrics: ${JSON.stringify({
      totalScore: input.totalScore,
      ahtSeconds: input.ahtSeconds,
      speechAccuracy: input.speechAccuracy,
      grammarScore: input.grammarScore,
      pronunciationScore: input.pronunciationScore,
      pacingScore: input.pacingScore,
      softSkillSignals: input.softSkillSignals,
    })}`,
    'Return strict JSON with this exact shape:',
    JSON.stringify({
      overallSummary: 'string',
      scriptAccuracy: {
        score: 0,
        strengths: ['string'],
        misses: ['string'],
      },
      grammarAndPronunciation: {
        score: 0,
        notes: ['string'],
      },
      softSkills: {
        score: 0,
        notes: ['string'],
      },
      pacingAndAht: {
        ahtSeconds: 0,
        notes: ['string'],
      },
      coachingTips: ['string'],
    }),
    'Evaluation rules:',
    '- Script Accuracy: compare each trainee CSR transcript with the corresponding suggested_csr_script and cite missing intent, phrasing, or required keywords.',
    '- Grammar & Pronunciation: infer likely spoken issues from the STT text and the provided scores, but explicitly avoid blaming obvious transcription glitches.',
    '- Soft Skills: comment on pacing, empathy, tone, ownership, transitions, and how naturally the trainee handled the member response.',
    '- Pacing & AHT: use the supplied AHT and speed context to explain whether the handle time felt efficient or rushed.',
    '- Keep each list concise, practical, and specific to the transcript.',
    '- Do not wrap the JSON in markdown fences.',
  ].join('\n')
}

export async function syncDialerScenarioToSupabase(
  input: DialerScenarioSyncInput,
): Promise<DialerScenarioSyncResult> {
  try {
    const supabase = createSupabaseAdminClient()
    const nowIso = new Date().toISOString()
    const resolvedTopic = input.topic.trim() || input.title?.trim() || 'Call Scenario'
    const resolvedTitle = input.title?.trim() || resolvedTopic
    const resolvedPassingScore = Number(input.passingScore ?? input.targetKpis.passing_score ?? 80)
    const resolvedDifficulty = normalizeEnvValue(input.difficulty || '')
    const resolvedEstimatedDuration = Number(input.estimatedDurationSeconds ?? input.targetKpis.estimated_duration_seconds ?? 0)
    const sanitizedScriptFlow = sanitizeScriptFlow(input.scriptFlow)
    const resolvedMetadata = input.metadata || {}
    let scenarioRecordId: string | null = null

    try {
      const { data: scenarioRecord, error } = await supabase
        .from('call_scenarios')
        .upsert({
          source_scenario_id: input.sourceScenarioId,
          trainer_id: normalizeUuidCandidate(input.trainerId),
          title: resolvedTitle,
          description: input.description?.trim() || null,
          topic: resolvedTopic,
          target_kpis: input.targetKpis,
          script_flow: sanitizedScriptFlow,
          ringer_audio_url: input.ringerAudioUrl || null,
          hold_audio_url: input.holdAudioUrl || null,
          difficulty: resolvedDifficulty || null,
          estimated_duration_seconds: Number.isFinite(resolvedEstimatedDuration) && resolvedEstimatedDuration > 0
            ? Math.round(resolvedEstimatedDuration)
            : null,
          passing_score: Number.isFinite(resolvedPassingScore) ? resolvedPassingScore : 80,
          is_published: input.isPublished !== false,
          is_active: input.isActive !== false,
          metadata: resolvedMetadata,
          updated_at: nowIso,
        }, { onConflict: 'source_scenario_id' })
        .select('id')
        .single()

        if (error) {
          throw error
        }

      scenarioRecordId = (scenarioRecord as { id?: string } | null)?.id || null
    } catch {
      const { data: legacyScenarioRecord, error: legacyError } = await supabase
        .from('call_scenarios')
        .upsert({
          scenario_id: input.sourceScenarioId,
          trainer_id: input.trainerId || null,
          title: resolvedTitle,
          description: input.description?.trim() || null,
          topic: resolvedTopic,
          target_kpis: input.targetKpis,
          script_flow: sanitizedScriptFlow,
          ringer_audio_url: input.ringerAudioUrl || null,
          hold_audio_url: input.holdAudioUrl || null,
          passing_score: Number.isFinite(resolvedPassingScore) ? resolvedPassingScore : 80,
          updated_at: nowIso,
        }, { onConflict: 'scenario_id' })
        .select('id')
        .single()

      if (legacyError) {
        throw legacyError
      }

      scenarioRecordId = (legacyScenarioRecord as { id?: string } | null)?.id || null
    }

    let authoringSyncError: string | null = null
    try {
      authoringSyncError = await syncScenarioAuthoringTables(
        supabase,
        input,
        sanitizedScriptFlow,
        nowIso,
      )
    } catch (error) {
      authoringSyncError = error instanceof Error
        ? error.message
        : 'Unable to mirror the scenario and script rows to the normalized Supabase authoring tables.'
    }

    return {
      scenarioRecordId,
      syncError: authoringSyncError,
    }
  } catch (error) {
    return {
      scenarioRecordId: null,
      syncError: error instanceof Error ? error.message : 'Unable to sync the dialer scenario to Supabase.',
    }
  }
}

export async function deleteDialerScenarioFromSupabase(
  sourceScenarioId: string,
): Promise<DialerScenarioSyncResult> {
  try {
    const supabase = createSupabaseAdminClient()
    const normalizedScenarioId = normalizeUuidCandidate(sourceScenarioId)
    let deletedScenarioRecordId: string | null = null
    let cleanupError: string | null = null

    try {
      const { data: callScenarioRows, error: callScenarioError } = await supabase
        .from('call_scenarios')
        .delete()
        .eq('source_scenario_id', sourceScenarioId)
        .select('id')

      if (callScenarioError) {
        throw callScenarioError
      }

      deletedScenarioRecordId = callScenarioRows?.[0]?.id || null
    } catch {
      const { data: legacyCallScenarioRows, error: legacyCallScenarioError } = await supabase
        .from('call_scenarios')
        .delete()
        .eq('scenario_id', sourceScenarioId)
        .select('id')

      if (legacyCallScenarioError) {
        throw legacyCallScenarioError
      }

      deletedScenarioRecordId = legacyCallScenarioRows?.[0]?.id || null
    }

    if (normalizedScenarioId) {
      try {
        const { error: deleteScenarioGroupsError } = await supabase
          .from('scenario_groups')
          .delete()
          .eq('id', normalizedScenarioId)

        if (deleteScenarioGroupsError) {
          throw deleteScenarioGroupsError
        }

        const { error: scenarioDeleteError } = await supabase
          .from('scenarios')
          .delete()
          .eq('id', normalizedScenarioId)

        if (scenarioDeleteError) {
          throw scenarioDeleteError
        }
      } catch (error) {
        cleanupError = error instanceof Error
          ? error.message
          : 'Unable to remove the normalized Supabase scenario record.'
      }
    }

    return {
      scenarioRecordId: deletedScenarioRecordId,
      syncError: cleanupError,
    }
  } catch (error) {
    return {
      scenarioRecordId: null,
      syncError: error instanceof Error ? error.message : 'Unable to delete the dialer scenario from Supabase.',
    }
  }
}

export async function generateDialerFeedbackReport(input: DialerFeedbackInput): Promise<DialerFeedbackReport> {
  const apiKey = getGeminiApiKey()
  const modelName = getDialerGeminiModel()
  if (!apiKey) {
    return buildFallbackReport(input)
  }

  try {
    const client = new GoogleGenerativeAI(apiKey)
    const model = client.getGenerativeModel({ model: modelName })
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: buildDialerFeedbackPrompt(input) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    })

    const rawText = result.response.text()
    const parsed = JSON.parse(extractJsonCandidate(rawText)) as Omit<DialerFeedbackReport, 'provider' | 'model' | 'totalScore' | 'passingScore' | 'passed'> & {
      overallSummary?: string
    }

    return {
      provider: 'gemini',
      model: modelName,
      overallSummary: parsed.overallSummary || buildFallbackReport(input).overallSummary,
      totalScore: safeRound(input.totalScore),
      passingScore: safeRound(input.passingScore),
      passed: input.totalScore >= input.passingScore,
      scriptAccuracy: {
        score: safeRound(Number(parsed.scriptAccuracy?.score || input.speechAccuracy)),
        strengths: Array.isArray(parsed.scriptAccuracy?.strengths) ? parsed.scriptAccuracy.strengths.slice(0, 4) : [],
        misses: Array.isArray(parsed.scriptAccuracy?.misses) ? parsed.scriptAccuracy.misses.slice(0, 4) : [],
      },
      grammarAndPronunciation: {
        score: safeRound(Number(parsed.grammarAndPronunciation?.score || ((input.grammarScore + input.pronunciationScore) / 2))),
        notes: Array.isArray(parsed.grammarAndPronunciation?.notes) ? parsed.grammarAndPronunciation.notes.slice(0, 4) : [],
      },
      softSkills: {
        score: safeRound(Number(parsed.softSkills?.score || input.totalScore)),
        notes: Array.isArray(parsed.softSkills?.notes) ? parsed.softSkills.notes.slice(0, 4) : [],
      },
      pacingAndAht: {
        ahtSeconds: Math.max(0, Number(parsed.pacingAndAht?.ahtSeconds || input.ahtSeconds)),
        notes: Array.isArray(parsed.pacingAndAht?.notes) ? parsed.pacingAndAht.notes.slice(0, 4) : [],
      },
      coachingTips: Array.isArray(parsed.coachingTips) ? parsed.coachingTips.slice(0, 5) : [],
      rawModelText: rawText,
    }
  } catch {
    return buildFallbackReport(input)
  }
}

export async function syncDialerScoreToSupabase(
  input: DialerFeedbackInput,
  report: DialerFeedbackReport,
): Promise<DialerScoreSyncResult> {
  try {
    const supabase = createSupabaseAdminClient()
    const trainerIdFromKpis = typeof input.targetKpis.trainer_id === 'string' ? input.targetKpis.trainer_id : null
    let scenarioRecordId: string | null = null

    try {
      const { data: existingScenario, error: existingScenarioError } = await supabase
        .from('call_scenarios')
        .select('id')
        .eq('source_scenario_id', input.scenarioId)
        .maybeSingle()

      if (existingScenarioError) {
        throw existingScenarioError
      }

      scenarioRecordId = (existingScenario as { id?: string } | null)?.id || null
    } catch {
      const { data: legacyScenario, error: legacyScenarioError } = await supabase
        .from('call_scenarios')
        .select('id')
        .eq('scenario_id', input.scenarioId)
        .maybeSingle()

      if (legacyScenarioError) {
        throw legacyScenarioError
      }

      scenarioRecordId = (legacyScenario as { id?: string } | null)?.id || null
    }

    if (!scenarioRecordId && trainerIdFromKpis) {
      const scenarioSync = await syncDialerScenarioToSupabase({
        sourceScenarioId: input.scenarioId,
        trainerId: trainerIdFromKpis,
        title: input.scenarioTitle,
        topic: input.topic,
        targetKpis: input.targetKpis,
        scriptFlow: input.scriptFlow,
        passingScore: input.passingScore,
      })

      if (scenarioSync.syncError) {
        throw new Error(scenarioSync.syncError)
      }

      scenarioRecordId = scenarioSync.scenarioRecordId
    }

    const nowIso = new Date().toISOString()
    const fullTranscript = buildFullConversationTranscript(input.transcriptLog)
    const scriptComparisonLog = buildScriptComparisonLog(input.scriptFlow, input.turnLogs)
    const passed = input.totalScore >= input.passingScore

    let scoreRecordId: string | null = null
    let certificateRecordId: string | null = null
    let certificateSyncError: string | null = null
    let normalizedResultsSyncError: string | null = null

    try {
      const { data: scoreRecord, error: scoreError } = await supabase
        .from('call_simulation_scores')
        .upsert({
          session_id: input.sessionId,
          scenario_id: input.scenarioId,
          call_scenario_id: scenarioRecordId,
          trainee_id: input.traineeId,
          trainee_name: input.traineeName,
          scenario_topic: input.topic,
          total_score: input.totalScore,
          passing_score: input.passingScore,
          is_passed: input.totalScore >= input.passingScore,
          aht_seconds: input.ahtSeconds,
          speech_accuracy: input.speechAccuracy,
          grammar_score: input.grammarScore,
          pronunciation_score: input.pronunciationScore,
          pacing_score: input.pacingScore,
          empathy_count: Number(input.softSkillSignals.empathyCount || 0),
          probing_count: Number(input.softSkillSignals.probingCount || 0),
          sentiment_score: Number(input.softSkillSignals.sentimentScore || 0),
          rate_of_speech: Number(input.softSkillSignals.rateOfSpeech || 0),
          dead_air_seconds: Number(input.softSkillSignals.deadAirSeconds || 0),
          transcript_log: input.transcriptLog,
          turn_logs: input.turnLogs,
          full_transcript: fullTranscript,
          script_comparison_log: scriptComparisonLog,
          feedback_report: report,
          certificate_id: input.certificateId || null,
          supabase_certificate_id: null,
          updated_at: nowIso,
        }, { onConflict: 'session_id' })
        .select('id')
        .single()

      if (scoreError) {
        throw scoreError
      }

      scoreRecordId = (scoreRecord as { id?: string } | null)?.id || null
    } catch {
      const { data: legacyScoreRecord, error: legacyScoreError } = await supabase
        .from('call_simulation_scores')
        .upsert({
          session_id: input.sessionId,
          scenario_id: input.scenarioId,
          call_scenario_id: scenarioRecordId,
          trainee_id: input.traineeId,
          trainee_name: input.traineeName,
          total_score: input.totalScore,
          passing_score: input.passingScore,
          is_passed: input.totalScore >= input.passingScore,
          aht_seconds: input.ahtSeconds,
          speech_accuracy: input.speechAccuracy,
          grammar_score: input.grammarScore,
          pronunciation_score: input.pronunciationScore,
          pacing_score: input.pacingScore,
          empathy_count: Number(input.softSkillSignals.empathyCount || 0),
          probing_count: Number(input.softSkillSignals.probingCount || 0),
          sentiment_score: Number(input.softSkillSignals.sentimentScore || 0),
          rate_of_speech: Number(input.softSkillSignals.rateOfSpeech || 0),
          dead_air_seconds: Number(input.softSkillSignals.deadAirSeconds || 0),
          transcript_log: input.transcriptLog,
          turn_logs: input.turnLogs,
          feedback_report: report,
          certificate_id: input.certificateId || null,
          updated_at: nowIso,
        }, { onConflict: 'session_id' })
        .select('id')
        .single()

      if (legacyScoreError) {
        throw legacyScoreError
      }

      scoreRecordId = (legacyScoreRecord as { id?: string } | null)?.id || null
    }

    try {
      normalizedResultsSyncError = await syncUnifiedSimulationResults(
        supabase,
        input,
        report,
        nowIso,
      )
    } catch (error) {
      normalizedResultsSyncError = error instanceof Error
        ? error.message
        : 'Unable to sync the normalized Supabase results row.'
    }

    if (passed) {
      try {
        const { data: certificateRecord, error: certificateError } = await supabase
          .from('call_simulation_certificates')
          .upsert({
            session_id: input.sessionId,
            scenario_id: input.scenarioId,
            call_scenario_id: scenarioRecordId,
            trainee_id: input.traineeId,
            trainee_name: input.traineeName,
            scenario_topic: input.topic,
            total_score: input.totalScore,
            passing_score: input.passingScore,
            certificate_title: buildCertificateTitle(input.topic),
            feedback_report: report,
            local_certificate_id: input.certificateId || null,
            updated_at: nowIso,
          }, { onConflict: 'session_id' })
          .select('id')
          .single()

        if (certificateError) {
          throw certificateError
        }

        certificateRecordId = (certificateRecord as { id?: string } | null)?.id || null

        if (certificateRecordId) {
          try {
            await supabase
              .from('call_simulation_scores')
              .update({
                certificate_id: input.certificateId || null,
                supabase_certificate_id: certificateRecordId,
                updated_at: nowIso,
              })
              .eq('session_id', input.sessionId)
          } catch {
            // Leave the score row intact even if the follow-up certificate pointer update fails.
          }
        }
      } catch (error) {
        certificateSyncError = error instanceof Error
          ? error.message
          : 'Unable to sync the call simulation certificate to Supabase.'
      }
    }

    return {
      scoreRecordId,
      scenarioRecordId,
      certificateRecordId,
      syncError: [normalizedResultsSyncError, certificateSyncError].filter(Boolean).join(' ') || null,
    }
  } catch (error) {
    return {
      scoreRecordId: null,
      scenarioRecordId: null,
      certificateRecordId: null,
      syncError: error instanceof Error ? error.message : 'Unable to sync the dialer score to Supabase.',
    }
  }
}
