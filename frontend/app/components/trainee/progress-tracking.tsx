'use client'

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MessageSquare,
  Mic,
  RefreshCw,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useLiveRefresh } from '@/app/hooks/useLiveRefresh'
import type { AppUser } from '@/app/types/user'
import { apiFetch } from '@/app/utils/api'
import { dedupeMessages } from '@/app/utils/runtime-errors'
import { getBackendWebSocketUrl } from '@/app/utils/ws'

import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Progress } from '../ui/progress'

interface ProgressTrackingProps {
  user: AppUser
  title?: string
  description?: string
  summaryTitle?: string
  summaryDescription?: string
}

type SimFloorReport = {
  summary: {
    total_sessions: number
    average_score: number
    pass_rate: number
    retakes: number
    latest_score: number
    passing_score?: number
  }
  coaching_summary?: {
    total_logs?: number
    pending?: number
    acknowledged?: number
    retake_required?: number
  }
  top_failed_kpis?: Record<string, number>
  kpi_scores?: Record<string, number>
  scenario_performance: Array<{
    scenario_id: string
    title: string
    attempts: number
    average_score: number
    best_score?: number
    pass_rate: number
    latest_attempt_at?: string | null
  }>
  recent_sessions: Array<{
    session_id: string
    scenario_title: string
    score: number
    status?: string | null
    attempt_number?: number
    ai_feedback?: string | null
    trainer_verdict_status?: string | null
    created_at?: string | null
    coaching_id?: string | null
    coaching_status?: string | null
  }>
  certificates: Array<{
    certificate_id: string
    certificate_no: string
  }>
}

type SimFloorScenario = {
  id: string
  title: string
  topic?: string | null
  description?: string | null
  assigned_at?: string | null
  attempt_count: number
  retake_required: boolean
  competent: boolean
  latest_score: number
  latest_status?: string | null
  latest_completed_at?: string | null
  active_session_id?: string | null
  can_retake?: boolean
  remaining_attempts?: number | null
  launch_blocked?: boolean
  launch_block_reason?: string | null
}

type MicrolearningReport = {
  summary: {
    assignment_count: number
    in_progress_count: number
    completed_count: number
    certified_count: number
    average_score: number
    pass_rate: number
    total_duration_minutes?: number
  }
  topic_progress: Array<{
    topic_category_name: string
    assignment_count: number
    completed_count: number
    certified_count: number
    average_score: number
  }>
  assignments: Array<{
    id: string
    module_title?: string | null
    title?: string | null
    status: string
    average_score: number
    completion_percentage: number
    completed_exercises?: number
    certificate_id?: string | null
  }>
}

type AssessmentRecord = {
  id: string
  title: string
  category_name?: string | null
  is_completed: boolean
  is_passed?: boolean | null
  status?: 'pending' | 'passed' | 'failed'
  can_retake?: boolean
  score_percentage?: number | null
  due_date?: string | null
  submitted_at?: string | null
  certificate_no?: string | null
}

type AssessmentResponse = {
  assessments: AssessmentRecord[]
}

type CoachingLog = {
  id: string
  coaching_id: string
  scenario_title?: string | null
  trainer_name?: string | null
  status: 'sent' | 'acknowledged' | 'draft'
  competency_status: 'pending' | 'competent' | 'not_competent'
  strengths?: string | null
  opportunities?: string | null
  action_plan?: string | null
  trainer_remarks?: string | null
  created_at?: string | null
  acknowledged_at?: string | null
}

type CoachingResponse = {
  logs: CoachingLog[]
}

const AUTO_REFRESH_MS = 15_000

function formatDate(value?: string | null) {
  if (!value) {
    return 'No date yet'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'No date yet'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function formatScore(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0.0%'
  }
  return `${value.toFixed(1)}%`
}

function average(values: number[]) {
  const cleaned = values.filter((value) => Number.isFinite(value))
  return cleaned.length ? cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length : 0
}

function getAssessmentStatus(assessment: AssessmentRecord) {
  if (assessment.status) {
    return assessment.status
  }
  if (assessment.is_completed && assessment.is_passed) {
    return 'passed'
  }
  if (assessment.is_completed) {
    return 'failed'
  }
  return 'pending'
}

function statusTone(status: string) {
  switch (status) {
    case 'passed':
    case 'completed':
    case 'competent':
    case 'acknowledged':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'failed':
    case 'retake':
    case 'not_competent':
      return 'bg-rose-100 text-rose-700 border-rose-200'
    case 'in_progress':
    case 'sent':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

function getCallSimulationStatus(scenario: SimFloorScenario) {
  if (scenario.competent) {
    return 'passed'
  }
  if (scenario.active_session_id) {
    return 'in_progress'
  }
  if (scenario.attempt_count > 0) {
    return 'failed'
  }
  return 'pending'
}

export default function ProgressTracking({
  user,
  title = 'My Progress',
  description = 'See your real progress across Microlearning Hub, Assessments, Call Simulation, and Coaching in one place.',
  summaryTitle = 'Overall Progress Summary',
  summaryDescription = 'All progress cards, scores, and status badges below are based on your saved activity records in the database.',
}: ProgressTrackingProps) {
  const [simFloorReport, setSimFloorReport] = useState<SimFloorReport | null>(null)
  const [callSimulationAssignments, setCallSimulationAssignments] = useState<SimFloorScenario[]>([])
  const [microlearningReport, setMicrolearningReport] = useState<MicrolearningReport | null>(null)
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([])
  const [coachingLogs, setCoachingLogs] = useState<CoachingLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [messages, setMessages] = useState<string[]>([])
  const [liveStatus, setLiveStatus] = useState('')

  const traineeId = user.id || user.user_id

  const loadProgress = useCallback(async (mode: 'initial' | 'refresh' | 'auto' = 'initial') => {
    if (!traineeId) {
      setMessages(['Missing trainee account ID. Please sign in again.'])
      setLoading(false)
      setRefreshing(false)
      return
    }

    if (mode === 'initial') {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    const results = await Promise.allSettled([
      apiFetch<SimFloorReport>(`/api/call-simulation/reports/trainee/${traineeId}`),
      apiFetch<{ scenarios: SimFloorScenario[] }>('/api/call-simulation/available'),
      apiFetch<MicrolearningReport>('/api/trainee/microlearning-report'),
      apiFetch<AssessmentResponse>('/api/certification/mcq/my-assessments'),
      apiFetch<CoachingResponse>('/api/certification/coaching/logs'),
    ])

    const nextMessages: string[] = []

    if (results[0].status === 'fulfilled') {
      setSimFloorReport(results[0].value)
    } else {
      setSimFloorReport(null)
      nextMessages.push(results[0].reason instanceof Error ? results[0].reason.message : 'Unable to load Call Simulation progress.')
    }

    if (results[1].status === 'fulfilled') {
      setCallSimulationAssignments(results[1].value.scenarios || [])
    } else {
      setCallSimulationAssignments([])
      nextMessages.push(results[1].reason instanceof Error ? results[1].reason.message : 'Unable to load assigned Call Simulation scenarios.')
    }

    if (results[2].status === 'fulfilled') {
      setMicrolearningReport(results[2].value)
    } else {
      setMicrolearningReport(null)
      nextMessages.push(results[2].reason instanceof Error ? results[2].reason.message : 'Unable to load microlearning progress.')
    }

    if (results[3].status === 'fulfilled') {
      setAssessments(results[3].value.assessments || [])
    } else {
      setAssessments([])
      nextMessages.push(results[3].reason instanceof Error ? results[3].reason.message : 'Unable to load assessment progress.')
    }

    if (results[4].status === 'fulfilled') {
      setCoachingLogs(results[4].value.logs || [])
    } else {
      setCoachingLogs([])
      nextMessages.push(results[4].reason instanceof Error ? results[4].reason.message : 'Unable to load coaching progress.')
    }

    setMessages(dedupeMessages(nextMessages))
    setLoading(false)
    setRefreshing(false)
  }, [traineeId])

  useEffect(() => {
    void loadProgress()
  }, [loadProgress])

  useLiveRefresh({
    enabled: Boolean(traineeId),
    intervalMs: AUTO_REFRESH_MS,
    onRefresh: () => loadProgress('auto'),
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || !traineeId) {
      return undefined
    }

    const socket = new WebSocket(
      getBackendWebSocketUrl(`/api/trainee/live-updates?token=${encodeURIComponent(token)}`),
    )

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string
          session?: { scenario_title?: string }
          details?: { module_title?: string; assessment_title?: string; scenario_title?: string }
        }

        if (
          payload.type === 'microlearning_assignments_changed'
          || payload.type === 'microlearning_module_deleted'
          || payload.type === 'module_completed'
          || payload.type === 'assessment_submitted'
          || payload.type === 'call_simulation_completed'
          || payload.type === 'practice_session_completed'
        ) {
          const activityLabel =
            payload.details?.module_title
            || payload.details?.assessment_title
            || payload.details?.scenario_title
            || payload.session?.scenario_title
            || 'your progress data'
          setLiveStatus(`Live progress update received for ${activityLabel}. Refreshing now.`)
          void loadProgress('refresh')
        }
      } catch (parseError) {
        console.error('Trainee progress live update parse error:', parseError)
      }
    }

    socket.onopen = () => {
      setLiveStatus('Live progress updates connected.')
    }

    socket.onclose = () => {
      setLiveStatus('Live progress updates disconnected. Background refresh is still active.')
    }

    return () => {
      socket.close()
    }
  }, [loadProgress, traineeId])

  const assessmentSummary = useMemo(() => {
    const completed = assessments.filter((assessment) => assessment.is_completed).length
    const passed = assessments.filter((assessment) => getAssessmentStatus(assessment) === 'passed').length
    const failed = assessments.filter((assessment) => getAssessmentStatus(assessment) === 'failed').length
    const pending = assessments.length - completed
    const averageScore = average(
      assessments
        .map((assessment) => Number(assessment.score_percentage))
        .filter((score) => Number.isFinite(score)),
    )

    return {
      assigned: assessments.length,
      completed,
      passed,
      failed,
      pending,
      averageScore,
    }
  }, [assessments])

  const callSimulationSummary = useMemo(() => {
    const assigned = callSimulationAssignments.length
    const scenarioStatuses = callSimulationAssignments.map((scenario) => ({
      scenario,
      status: getCallSimulationStatus(scenario),
    }))
    const completed = scenarioStatuses.filter(({ status }) => status === 'passed' || status === 'failed').length
    const inProgress = scenarioStatuses.filter(({ status }) => status === 'in_progress').length
    const passed = scenarioStatuses.filter(({ status }) => status === 'passed').length
    const failed = scenarioStatuses.filter(({ status }) => status === 'failed').length
    const pending = scenarioStatuses.filter(({ status }) => status === 'pending').length
    const retakeAvailable = scenarioStatuses.filter(
      ({ scenario, status }) => status === 'failed' && Boolean(scenario.can_retake),
    ).length
    const lockedFinal = scenarioStatuses.filter(
      ({ scenario, status }) => status === 'failed' && !scenario.can_retake,
    ).length
    const averageScore = Number(simFloorReport?.summary.average_score || 0)

    return {
      assigned,
      completed,
      inProgress,
      passed,
      failed,
      pending,
      retakeAvailable,
      lockedFinal,
      averageScore,
    }
  }, [callSimulationAssignments, simFloorReport?.summary.average_score])

  const coachingSummary = useMemo(() => {
    return {
      total: coachingLogs.length,
      pending: coachingLogs.filter((log) => log.status === 'sent').length,
      acknowledged: coachingLogs.filter((log) => log.status === 'acknowledged').length,
      retake: coachingLogs.filter((log) => log.competency_status === 'not_competent').length,
    }
  }, [coachingLogs])

  const overallSummary = useMemo(() => {
    const microlearningAssignments = microlearningReport?.summary.assignment_count || 0
    const microlearningCompleted = microlearningReport?.summary.completed_count || 0
    const microlearningPassed = microlearningReport?.summary.certified_count || 0
    const microlearningFailed = Math.max(microlearningCompleted - microlearningPassed, 0)

    const totalAssigned = microlearningAssignments + assessmentSummary.assigned + callSimulationSummary.assigned
    const totalCompleted = microlearningCompleted + assessmentSummary.completed + callSimulationSummary.completed
    const totalPassed = microlearningPassed + assessmentSummary.passed + callSimulationSummary.passed
    const totalFailed = microlearningFailed + assessmentSummary.failed + callSimulationSummary.failed
    const totalInProgress = (microlearningReport?.summary.in_progress_count || 0) + callSimulationSummary.inProgress
    const totalPending = Math.max(totalAssigned - totalCompleted, 0)
    const microlearningScoreTotal = Number(microlearningReport?.summary.average_score || 0) * microlearningCompleted
    const assessmentScoreTotal = assessmentSummary.averageScore * assessmentSummary.completed
    const callSimulationCompletedAttempts = Number(simFloorReport?.summary.total_sessions || 0)
    const callSimulationScoreTotal = Number(simFloorReport?.summary.average_score || 0) * callSimulationCompletedAttempts
    const scoredAttemptCount = microlearningCompleted + assessmentSummary.completed + callSimulationCompletedAttempts
    const averageScore = scoredAttemptCount
      ? (microlearningScoreTotal + assessmentScoreTotal + callSimulationScoreTotal) / scoredAttemptCount
      : 0

    return {
      totalAssigned,
      totalCompleted,
      totalPassed,
      totalFailed,
      totalPending,
      inProgress: totalInProgress,
      completionRate: totalAssigned ? (totalCompleted / totalAssigned) * 100 : 0,
      passRate: totalCompleted ? (totalPassed / totalCompleted) * 100 : 0,
      averageScore,
    }
  }, [assessmentSummary, callSimulationSummary, microlearningReport, simFloorReport?.summary.average_score, simFloorReport?.summary.total_sessions])

  const latestFeedback = useMemo(() => {
    const latestCoaching = [...coachingLogs].sort((left, right) => {
      const leftTime = new Date(left.created_at || 0).getTime()
      const rightTime = new Date(right.created_at || 0).getTime()
      return rightTime - leftTime
    })[0]

    if (latestCoaching) {
      return {
        title: latestCoaching.scenario_title || latestCoaching.coaching_id,
        detail:
          latestCoaching.trainer_remarks
          || latestCoaching.action_plan
          || latestCoaching.opportunities
          || latestCoaching.strengths
          || 'A coaching record is available for review.',
        status: latestCoaching.status,
        date: latestCoaching.created_at,
      }
    }

    const latestCallSession = simFloorReport?.recent_sessions?.[0]
    if (latestCallSession) {
      return {
        title: latestCallSession.scenario_title,
        detail:
          latestCallSession.ai_feedback
          || `Latest Call Simulation verdict: ${(latestCallSession.trainer_verdict_status || latestCallSession.status || 'pending').replace(/_/g, ' ')}`,
        status: latestCallSession.trainer_verdict_status || latestCallSession.status || 'pending',
        date: latestCallSession.created_at,
      }
    }

    return null
  }, [coachingLogs, simFloorReport?.recent_sessions])

  const improvementAreas = useMemo(() => {
    const areas: string[] = []
    const weakestTopic = [...(microlearningReport?.topic_progress || [])]
      .filter((topic) => topic.assignment_count > 0)
      .sort((left, right) => left.average_score - right.average_score)[0]
    const weakestScenario = [...(simFloorReport?.scenario_performance || [])]
      .filter((scenario) => scenario.attempts > 0)
      .sort((left, right) => left.average_score - right.average_score)[0]
    const weakestAssessment = [...assessments]
      .filter((assessment) => assessment.score_percentage !== null && assessment.score_percentage !== undefined)
      .sort((left, right) => Number(left.score_percentage || 0) - Number(right.score_percentage || 0))[0]

    if (coachingSummary.pending > 0) {
      areas.push(`You still have ${coachingSummary.pending} coaching log${coachingSummary.pending === 1 ? '' : 's'} waiting for acknowledgement.`)
    }
    if (callSimulationSummary.lockedFinal > 0) {
      areas.push(
        `You have ${callSimulationSummary.lockedFinal} Call Simulation result${callSimulationSummary.lockedFinal === 1 ? '' : 's'} saved as final after the allowed attempts were used.`,
      )
    }
    if (weakestTopic && weakestTopic.average_score < 75) {
      areas.push(`Microlearning topic to revisit: ${weakestTopic.topic_category_name} (${formatScore(weakestTopic.average_score)} average).`)
    }
    if (weakestAssessment && Number(weakestAssessment.score_percentage || 0) < 75) {
      areas.push(`Assessment category needing improvement: ${weakestAssessment.category_name || weakestAssessment.title} (${formatScore(weakestAssessment.score_percentage)}).`)
    }
    if (weakestScenario && weakestScenario.average_score < 80) {
      areas.push(`Call Simulation scenario needing reinforcement: ${weakestScenario.title} (${formatScore(weakestScenario.average_score)} average).`)
    }
    if (!areas.length) {
      areas.push('Your saved progress does not show any major risk area right now. Keep your current pace and finish the next pending activity.')
    }

    return areas.slice(0, 4)
  }, [
    assessments,
    callSimulationSummary.lockedFinal,
    coachingSummary.pending,
    microlearningReport?.topic_progress,
    simFloorReport?.scenario_performance,
  ])

  const recommendedNextSteps = useMemo(() => {
    const nextSteps: string[] = []

    if (coachingSummary.pending > 0) {
      nextSteps.push('Open your latest coaching log first and acknowledge it so your trainer feedback loop is complete.')
    }
    if ((microlearningReport?.summary.in_progress_count || 0) > 0) {
      nextSteps.push('Continue your in-progress microlearning module and finish the remaining exercises.')
    }
    if (assessmentSummary.pending > 0) {
      nextSteps.push('Complete your next pending assessment category while the assignment is still active.')
    }
    if (callSimulationSummary.inProgress > 0) {
      nextSteps.push('Resume your in-progress Call Simulation and finish the active mock call before starting another one.')
    } else if (callSimulationSummary.pending > 0 || callSimulationSummary.retakeAvailable > 0) {
      nextSteps.push('Start or retake your assigned Call Simulation scenario and focus on the weakest KPI areas.')
    } else if (callSimulationSummary.lockedFinal > 0) {
      nextSteps.push('Review your latest Call Simulation coaching feedback. The final saved score will stay in your progress until a trainer resets the scenario.')
    }
    if (!nextSteps.length) {
      nextSteps.push('You are up to date right now. Keep checking back for new assignments, coaching, or trainer feedback.')
    }

    return nextSteps.slice(0, 4)
  }, [
    assessmentSummary.pending,
    callSimulationSummary.inProgress,
    callSimulationSummary.lockedFinal,
    callSimulationSummary.pending,
    callSimulationSummary.retakeAvailable,
    coachingSummary.pending,
    microlearningReport?.summary.in_progress_count,
  ])

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading progress analytics...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-2xl font-bold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <Button type="button" variant="outline" onClick={() => void loadProgress('refresh')} disabled={refreshing}>
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </Button>
      </div>

      {messages.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {messages.join(' ')}
        </div>
      ) : null}

      {liveStatus ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {liveStatus}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryMetric
          title="Overall Completion"
          value={formatScore(overallSummary.completionRate)}
          helper={`${overallSummary.totalCompleted}/${overallSummary.totalAssigned} assigned activities completed`}
          icon={Target}
        />
        <SummaryMetric
          title="Average Score"
          value={formatScore(overallSummary.averageScore)}
          helper="Combined average across completed scored microlearning, assessments, and Call Simulation attempts"
          icon={TrendingUp}
        />
        <SummaryMetric
          title="Passed"
          value={String(overallSummary.totalPassed)}
          helper="Activities already cleared"
          icon={CheckCircle2}
        />
        <SummaryMetric
          title="Pending"
          value={String(overallSummary.totalPending)}
          helper="Assigned activities still waiting to be finished"
          icon={AlertTriangle}
        />
        <SummaryMetric
          title="In Progress"
          value={String(overallSummary.inProgress)}
          helper="Activities currently underway"
          icon={BookOpen}
        />
        <SummaryMetric
          title="Coaching Open"
          value={String(coachingSummary.pending)}
          helper="Coaching logs still waiting for acknowledgement"
          icon={MessageSquare}
        />
      </div>

      <Card className="border-sky-200 bg-[linear-gradient(135deg,rgba(239,246,255,0.95),rgba(255,255,255,0.98))]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-5 text-sky-700" />
            {summaryTitle}
          </CardTitle>
          <CardDescription>{summaryDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                <span>Program completion</span>
                <span>{formatScore(overallSummary.completionRate)}</span>
              </div>
              <Progress value={overallSummary.completionRate} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <MiniMetric label="Completed" value={String(overallSummary.totalCompleted)} />
              <MiniMetric label="Failed" value={String(overallSummary.totalFailed)} />
              <MiniMetric label="Passing Rate" value={formatScore(overallSummary.passRate)} />
            </div>
          </div>

          <div className="rounded-2xl border bg-white/90 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Latest Feedback</div>
            {latestFeedback ? (
              <>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="font-semibold text-slate-950">{latestFeedback.title}</div>
                  <Badge className={statusTone(latestFeedback.status || 'pending')}>
                    {(latestFeedback.status || 'pending').replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="mt-3 text-sm text-slate-600">{latestFeedback.detail}</div>
                <div className="mt-3 text-xs text-slate-500">{formatDate(latestFeedback.date)}</div>
              </>
            ) : (
              <div className="mt-3 text-sm text-slate-500">
                Your latest feedback will appear here after a trainer saves coaching notes or a Call Simulation verdict.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <DomainCard
          title="Microlearning Completion"
          description="Assigned modules, topic progress, and saved completion scores."
          icon={BookOpen}
          metrics={[
            { label: 'Assigned', value: String(microlearningReport?.summary.assignment_count || 0) },
            { label: 'Completed', value: String(microlearningReport?.summary.completed_count || 0) },
            { label: 'Certified', value: String(microlearningReport?.summary.certified_count || 0) },
            { label: 'Average', value: formatScore(microlearningReport?.summary.average_score) },
          ]}
        >
          {(microlearningReport?.topic_progress || []).slice(0, 4).map((topic) => (
            <ProgressRow
              key={topic.topic_category_name}
              title={topic.topic_category_name}
              helper={`${topic.completed_count}/${topic.assignment_count} completed`}
              value={topic.assignment_count ? (topic.completed_count / topic.assignment_count) * 100 : 0}
              trailing={formatScore(topic.average_score)}
            />
          ))}

          {!microlearningReport?.topic_progress.length ? (
            <EmptyState message="No microlearning activity is recorded yet." />
          ) : null}
        </DomainCard>

        <DomainCard
          title="Assessment Performance"
          description="Assigned assessments, pass or fail status, and retake visibility."
          icon={ClipboardList}
          metrics={[
            { label: 'Assigned', value: String(assessmentSummary.assigned) },
            { label: 'Passed', value: String(assessmentSummary.passed) },
            { label: 'Failed', value: String(assessmentSummary.failed) },
            { label: 'Average', value: formatScore(assessmentSummary.averageScore) },
          ]}
        >
          {assessments.slice(0, 5).map((assessment) => {
            const status = getAssessmentStatus(assessment)
            return (
              <StatusRow
                key={assessment.id}
                title={assessment.title}
                subtitle={`${assessment.category_name || 'Assessment category'} | ${assessment.score_percentage !== null && assessment.score_percentage !== undefined ? formatScore(assessment.score_percentage) : 'Not taken yet'}`}
                badge={status}
                footer={assessment.submitted_at ? `Submitted ${formatDate(assessment.submitted_at)}` : assessment.due_date ? `Due ${formatDate(assessment.due_date)}` : 'Pending'}
              />
            )
          })}

          {!assessments.length ? <EmptyState message="No assessment assignments are recorded yet." /> : null}
        </DomainCard>

        <DomainCard
          title="Call Simulation Performance"
          description="Assigned mock calls, retakes, and your latest saved results."
          icon={Mic}
          metrics={[
            { label: 'Assigned', value: String(callSimulationSummary.assigned) },
            { label: 'Passed', value: String(callSimulationSummary.passed) },
            { label: 'Open', value: String(callSimulationSummary.pending + callSimulationSummary.inProgress) },
            { label: 'Average', value: formatScore(callSimulationSummary.averageScore) },
          ]}
        >
          {callSimulationAssignments.slice(0, 5).map((scenario) => {
            const scenarioStatus = getCallSimulationStatus(scenario)

            return (
              <StatusRow
                key={scenario.id}
                title={scenario.title}
                subtitle={`${scenario.topic || 'Call Simulation'} | ${scenario.attempt_count ? formatScore(scenario.latest_score) : 'Not started yet'}`}
                badge={scenarioStatus}
                footer={
                  scenario.active_session_id
                    ? 'Call in progress'
                    : scenario.can_retake
                      ? `Retake available${scenario.remaining_attempts !== null && scenario.remaining_attempts !== undefined ? ` - ${scenario.remaining_attempts} left` : ''}`
                      : scenarioStatus === 'failed'
                        ? scenario.launch_block_reason || 'Attempt limit reached. Final score saved.'
                      : scenario.launch_block_reason || `Assigned ${formatDate(scenario.assigned_at)}`
                }
              />
            )
          })}

          {!callSimulationAssignments.length ? (
            <EmptyState message="No assigned Call Simulation scenarios are recorded yet." />
          ) : null}
        </DomainCard>

        <DomainCard
          title="Coaching Status"
          description="Published coaching records, acknowledgement status, and improvement guidance."
          icon={MessageSquare}
          metrics={[
            { label: 'Total Logs', value: String(coachingSummary.total) },
            { label: 'Pending Ack', value: String(coachingSummary.pending) },
            { label: 'Acknowledged', value: String(coachingSummary.acknowledged) },
            { label: 'Retake', value: String(coachingSummary.retake) },
          ]}
        >
          {coachingLogs.slice(0, 5).map((log) => (
            <StatusRow
              key={log.id}
              title={log.scenario_title || log.coaching_id}
              subtitle={`${log.trainer_name || 'Trainer'} | ${log.trainer_remarks || log.action_plan || log.opportunities || 'Feedback saved'}`}
              badge={log.status === 'acknowledged' ? 'acknowledged' : log.competency_status}
              footer={log.acknowledged_at ? `Acknowledged ${formatDate(log.acknowledged_at)}` : `Created ${formatDate(log.created_at)}`}
            />
          ))}

          {!coachingLogs.length ? <EmptyState message="No coaching logs are recorded yet." /> : null}
        </DomainCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600" />
              Improvement Areas
            </CardTitle>
            <CardDescription>The saved records below show where your attention should go first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {improvementAreas.map((item) => (
              <div key={item} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-5 text-sky-600" />
              Recommended Next Steps
            </CardTitle>
            <CardDescription>Use these next actions to keep your progress moving forward.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendedNextSteps.map((item) => (
              <div key={item} className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummaryMetric({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string
  value: string
  helper: string
  icon: LucideIcon
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <div className="text-sm text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
          <div className="mt-2 text-xs text-slate-500">{helper}</div>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function DomainCard({
  title,
  description,
  icon: Icon,
  metrics,
  children,
}: {
  title: string
  description: string
  icon: LucideIcon
  metrics: Array<{ label: string; value: string }>
  children: ReactNode
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-5 text-slate-700" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          {metrics.map((metric) => (
            <MiniMetric key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-slate-50 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-950">{value}</div>
    </div>
  )
}

function ProgressRow({
  title,
  helper,
  value,
  trailing,
}: {
  title: string
  helper: string
  value: number
  trailing: string
}) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-sm text-slate-500">{helper}</div>
        </div>
        <Badge variant="outline" className="border-slate-300 text-slate-700">
          {trailing}
        </Badge>
      </div>
      <div className="mt-3">
        <Progress value={value} />
      </div>
    </div>
  )
}

function StatusRow({
  title,
  subtitle,
  badge,
  footer,
}: {
  title: string
  subtitle: string
  badge: string
  footer: string
}) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-sm text-slate-600">{subtitle}</div>
        </div>
        <Badge className={statusTone(badge)}>{badge.replace(/_/g, ' ')}</Badge>
      </div>
      <div className="mt-3 text-xs text-slate-500">{footer}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
      {message}
    </div>
  )
}
