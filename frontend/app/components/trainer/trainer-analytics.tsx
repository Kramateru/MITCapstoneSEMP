'use client'

import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Gauge,
  GraduationCap,
  Loader2,
  MessageSquare,
  Mic,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  buildTrainerLearningInsightsUrl,
  EMPTY_TRAINER_LEARNING_FILTERS,
  type TrainerLearningFilterState,
  type TrainerLearningInsightsResponse,
} from '@/app/lib/trainer-learning-insights'
import { useLiveRefresh } from '@/app/hooks/useLiveRefresh'
import { apiFetch } from '@/app/utils/api'
import { getBackendWebSocketUrl } from '@/app/utils/ws'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { AiInsightBoard, type AiInsightSection } from '../ui/ai-insight-board'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import {
  ANALYTICS_COLORS,
  ANALYTICS_TOOLTIP_PROPS,
  AnalyticsChartEmpty,
  AnalyticsChartPanel,
  formatCountTick,
  formatPercentTick,
  getCategoricalChartHeight,
  truncateChartLabel,
} from '../ui/analytics-chart-helpers'
import { ChartCountLabelList, ChartPercentLabelList } from '../ui/chart-data-labels'
import { Progress } from '../ui/progress'
import { TrainerLearningFilterBar } from './trainer-learning-filter-bar'

const AUTO_REFRESH_MS = 20_000

function formatPercent(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0.0%'
  }
  return `${value.toFixed(1)}%`
}

function formatCount(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0'
  }
  return value.toLocaleString()
}

function formatMetricValue(value?: number | null, unit?: string | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return unit === 'wpm' || unit === 'sec' ? `0 ${unit}` : '0.0%'
  }
  if (unit === 'wpm' || unit === 'sec') {
    return `${value.toFixed(1)} ${unit}`
  }
  return `${value.toFixed(1)}%`
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'No activity yet'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'No activity yet'
  }

  return parsed.toLocaleString()
}

function activityLabel(activityType: string) {
  switch (activityType) {
    case 'module_completed':
      return 'Module Completed'
    case 'module_started':
      return 'Module Started'
    case 'assessment_submitted':
      return 'Assessment Submitted'
    case 'call_simulation_completed':
      return 'Call Completed'
    case 'call_simulation_started':
      return 'Call In Progress'
    case 'coaching_sent':
      return 'Coaching Sent'
    case 'coaching_acknowledged':
      return 'Coaching Acknowledged'
    default:
      return 'Recent Activity'
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Unable to load trainer learning analytics right now.'
}

function SummaryCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode
  label: string
  value: string
  helper: string
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-500">{label}</div>
          <div className="mt-2 break-words text-2xl font-semibold text-slate-950 sm:text-3xl">{value}</div>
          <div className="mt-2 text-xs leading-5 text-slate-500">{helper}</div>
        </div>
        <div className="self-start rounded-2xl bg-slate-100 p-3 text-slate-700">{icon}</div>
      </CardContent>
    </Card>
  )
}

function InsightRow({
  title,
  subtitle,
  badge,
}: {
  title: string
  subtitle: string
  badge: string
}) {
  return (
    <div className="analytics-note-card rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
        </div>
        <Badge variant="outline" className="self-start border-slate-300 text-slate-700">
          {badge}
        </Badge>
      </div>
    </div>
  )
}

function average(values: number[]) {
  if (!values.length) {
    return 0
  }
  return values.reduce((total, value) => total + value, 0) / values.length
}

export default function TrainerAnalytics() {
  const [filters, setFilters] = useState<TrainerLearningFilterState>(EMPTY_TRAINER_LEARNING_FILTERS)
  const [data, setData] = useState<TrainerLearningInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState('Connecting to trainer-owned learning analytics...')

  const requestUrl = useMemo(() => buildTrainerLearningInsightsUrl(filters), [filters])

  const loadAnalytics = useCallback(
    async (mode: 'initial' | 'refresh' | 'auto' = 'initial') => {
      if (mode === 'initial') {
        setLoading(true)
      } else if (mode === 'refresh') {
        setRefreshing(true)
      }

      setError(null)

      try {
        const payload = await apiFetch<TrainerLearningInsightsResponse>(requestUrl)
        setData(payload)
        const syncMessage =
          payload.summary.assigned_module_records
          || payload.summary.assigned_assessment_records
          || payload.summary.assigned_call_simulation_records
          || payload.summary.published_coaching_logs
            ? `Live analytics synced at ${new Date().toLocaleTimeString()} using real microlearning, assessments, Call Simulation results, and coaching activity from the database.`
            : 'Live analytics are connected. Create assignments or wait for trainee activity to populate this dashboard.'
        setLiveStatus(syncMessage)
      } catch (loadError) {
        setError(getErrorMessage(loadError))
        setLiveStatus('Live analytics could not sync just now. Showing the latest saved view if one is available.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [requestUrl],
  )

  useEffect(() => {
    void loadAnalytics('initial')
  }, [loadAnalytics])

  useLiveRefresh({
    intervalMs: AUTO_REFRESH_MS,
    onRefresh: () => loadAnalytics('auto'),
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      return undefined
    }

    const socket = new WebSocket(
      getBackendWebSocketUrl(`/api/trainer/live-updates?token=${encodeURIComponent(token)}`),
    )

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          type?: string
          session?: { user_name?: string; scenario_title?: string }
          details?: { trainee_name?: string; scenario_title?: string; module_title?: string; assessment_title?: string }
        }

        if (
          message.type === 'practice_session_completed'
          || message.type === 'call_simulation_completed'
          || message.type === 'module_completed'
          || message.type === 'assessment_submitted'
        ) {
          const activityLabel =
            message.details?.module_title
            || message.details?.assessment_title
            || message.session?.scenario_title
            || message.details?.scenario_title
            || 'an activity'
          setLiveStatus(
            `${message.session?.user_name || message.details?.trainee_name || 'A trainee'} updated ${activityLabel}. Refreshing trainer analytics...`,
          )
          void loadAnalytics('refresh')
        }
      } catch (parseError) {
        console.error('Trainer analytics live update parse error:', parseError)
      }
    }

    socket.onopen = () => {
      setLiveStatus('Live analytics websocket connected to trainer activity updates.')
    }

    socket.onclose = () => {
      setLiveStatus('Live analytics websocket disconnected. Auto-refresh will keep the view current.')
    }

    return () => {
      socket.close()
    }
  }, [loadAnalytics])

  const summary = data?.summary
  const hasAssignedLearning = Boolean(
    (summary?.assigned_module_records || 0) > 0
      || (summary?.assigned_assessment_records || 0) > 0
      || (summary?.assigned_call_simulation_records || 0) > 0
      || (summary?.published_coaching_logs || 0) > 0,
  )

  const completionTrendRows = useMemo(
    () =>
      (data?.batch_comparison || []).map((row) => ({
        label: row.batch_label,
        completion_rate: row.completion_rate,
        overall_score: row.overall_score,
      })),
    [data?.batch_comparison],
  )

  const traineeSpotlightRows = useMemo(
    () => (data?.trainee_ranking || []).slice(0, 8),
    [data?.trainee_ranking],
  )

  const weakestModuleRows = useMemo(
    () => (data?.weakest_modules || []).slice(0, 6),
    [data?.weakest_modules],
  )

  const weakAreaRows = useMemo(
    () => (data?.weakest_assessment_areas || []).slice(0, 6),
    [data?.weakest_assessment_areas],
  )

  const improvementRows = useMemo(
    () => (data?.trainees_needing_improvement || []).slice(0, 6),
    [data?.trainees_needing_improvement],
  )

  const callSimulationRows = useMemo(
    () => (data?.call_simulation_performance || []).slice(0, 8),
    [data?.call_simulation_performance],
  )

  const callSimulationKpis = useMemo(
    () => data?.call_simulation_kpi_breakdown || [],
    [data?.call_simulation_kpi_breakdown],
  )

  const qualityKpiRows = useMemo(
    () => callSimulationKpis.filter((metric) => metric.unit === '%').slice(0, 5),
    [callSimulationKpis],
  )

  const operationalKpiRows = useMemo(
    () => callSimulationKpis.filter((metric) => metric.unit !== '%').slice(0, 3),
    [callSimulationKpis],
  )
  const trainerAiSections = useMemo<AiInsightSection[]>(
    () => [
      {
        title: 'Strengths',
        items: data?.ai_analysis.strengths || [],
        tone: 'emerald',
        emptyMessage: 'No trainer-scope strengths were generated yet.',
      },
      {
        title: 'Opportunities For Improvement',
        items: data?.ai_analysis.opportunities || [],
        tone: 'sky',
        emptyMessage: 'No improvement opportunity was generated yet.',
      },
      {
        title: 'Weak Modules / Categories',
        items: data?.ai_analysis.weak_modules_categories || data?.ai_analysis.weak_areas || [],
        tone: 'amber',
        emptyMessage: 'No weak module or category pattern is standing out yet.',
      },
      {
        title: 'Assessment Improvement Notes',
        items: data?.ai_analysis.assessment_improvement_notes || [],
        tone: 'violet',
        emptyMessage: 'No assessment improvement note was generated yet.',
      },
      {
        title: 'Exercise Improvement Notes',
        items: data?.ai_analysis.exercise_improvement_notes || [],
        tone: 'teal',
        emptyMessage: 'No exercise improvement note was generated yet.',
      },
      {
        title: 'Call Simulation KPI Coaching Notes',
        items: data?.ai_analysis.call_simulation_kpi_coaching_notes || [],
        tone: 'rose',
        emptyMessage: 'No Call Simulation KPI coaching note was generated yet.',
      },
      {
        title: 'Recommended Next Action',
        items: data?.ai_analysis.recommended_next_action || data?.ai_analysis.recommended_actions || [],
        tone: 'sky',
        emptyMessage: 'No recommended next action was generated yet.',
      },
      {
        title: 'Betterment Notes',
        items: data?.ai_analysis.betterment_notes || [],
        tone: 'slate',
        emptyMessage: 'No betterment note was generated yet.',
      },
    ],
    [data?.ai_analysis],
  )

  const coachingNotes = useMemo(
    () => (data?.coaching_notes_summary || []).slice(0, 6),
    [data?.coaching_notes_summary],
  )

  const moduleEffectivenessRows = useMemo(
    () => (data?.module_progress || []).slice(0, 8),
    [data?.module_progress],
  )

  const assessmentAttemptRows = useMemo(() => {
    const totals = new Map<
      string,
      {
        assessment_title: string
        attempt_count: number
        completed_count: number
        passed_count: number
        scores: number[]
      }
    >()

    for (const row of data?.assessment_results || []) {
      const key = row.assessment_id || row.assessment_title
      const bucket = totals.get(key) || {
        assessment_title: row.assessment_title,
        attempt_count: 0,
        completed_count: 0,
        passed_count: 0,
        scores: [],
      }

      bucket.attempt_count += Math.max(row.attempt_count || 0, 0)
      if (typeof row.score_percentage === 'number') {
        bucket.completed_count += 1
        bucket.scores.push(row.score_percentage)
      }
      if (row.is_passed) {
        bucket.passed_count += 1
      }

      totals.set(key, bucket)
    }

    return Array.from(totals.values())
      .map((row) => ({
        assessment_title: row.assessment_title,
        attempt_count: row.attempt_count,
        completed_count: row.completed_count,
        average_score: average(row.scores),
        pass_rate: row.completed_count ? (row.passed_count / row.completed_count) * 100 : 0,
      }))
      .sort(
        (left, right) =>
          right.attempt_count - left.attempt_count
          || right.average_score - left.average_score,
      )
      .slice(0, 8)
  }, [data?.assessment_results])

  return (
    <div className="analytics-page-shell">
      <div className="analytics-page-header">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Live Analytics Hub</h2>
          <p className="text-sm text-muted-foreground">
            Professional trainer analytics built from real microlearning, assessment, Call Simulation, and coaching
            records saved in the database.
          </p>
        </div>

        <div className="analytics-page-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadAnalytics('refresh')}
            disabled={loading || refreshing}
            className="min-h-11 rounded-full"
          >
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh Live Analytics
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        {liveStatus}
      </div>

      <TrainerLearningFilterBar value={filters} options={data?.filters || null} onChange={setFilters} />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading trainer learning analytics...
          </CardContent>
        </Card>
      ) : !hasAssignedLearning ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No trainer-assigned learning data yet</CardTitle>
            <CardDescription>
              This live analytics view only counts real trainer-created microlearning modules, trainer-assigned
              assessments, assigned Call Simulation work, coaching follow-up, and the trainee results saved against them.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="analytics-summary-grid">
            <SummaryCard
              label="Assigned Trainees"
              value={formatCount(summary?.total_trainees)}
              helper="Active trainees with matching trainer-owned learning records"
              icon={<Users className="size-5 text-sky-600" />}
            />
            <SummaryCard
              label="Active Trainees"
              value={formatCount(summary?.active_trainees)}
              helper="Trainees with recent saved activity in the current filter scope"
              icon={<TrendingUp className="size-5 text-cyan-600" />}
            />
            <SummaryCard
              label="Assigned Modules"
              value={formatCount(summary?.assigned_module_records)}
              helper={`${formatCount(summary?.trainer_assigned_modules)} distinct modules across trainer assignments`}
              icon={<BookOpen className="size-5 text-emerald-600" />}
            />
            <SummaryCard
              label="Completed Modules"
              value={formatCount(summary?.completed_modules)}
              helper={`${formatCount(summary?.pending_modules)} not yet completed`}
              icon={<CheckCircle2 className="size-5 text-emerald-600" />}
            />
            <SummaryCard
              label="Completion Rate"
              value={formatPercent(summary?.completion_rate)}
              helper="Across modules, assessments, and assigned Call Simulation work"
              icon={<Target className="size-5 text-violet-600" />}
            />
            <SummaryCard
              label="Avg Assessment"
              value={formatPercent(summary?.average_assessment_score)}
              helper={`${formatCount(summary?.completed_assessments)} completed assessment results`}
              icon={<ClipboardList className="size-5 text-amber-600" />}
            />
            <SummaryCard
              label="Avg Microlearning"
              value={formatPercent(summary?.average_exercise_score)}
              helper={`${formatCount(summary?.passed_modules)} passed module outcomes`}
              icon={<Gauge className="size-5 text-cyan-600" />}
            />
            <SummaryCard
              label="Avg Call KPI"
              value={formatPercent(summary?.average_call_simulation_score)}
              helper={`${formatCount(summary?.completed_call_simulations)} completed mock calls`}
              icon={<Mic className="size-5 text-violet-600" />}
            />
            <SummaryCard
              label="Pass Rate"
              value={formatPercent(summary?.pass_rate)}
              helper="Completed learning items meeting the required score across all tracked activities"
              icon={<GraduationCap className="size-5 text-indigo-600" />}
            />
            <SummaryCard
              label="Call Pass Rate"
              value={formatPercent(summary?.call_simulation_pass_rate)}
              helper={`${formatCount(summary?.assigned_call_simulation_records)} assigned call simulations tracked`}
              icon={<Mic className="size-5 text-fuchsia-600" />}
            />
            <SummaryCard
              label="Coaching Completion"
              value={formatPercent(summary?.coaching_completion_rate)}
              helper={`${formatCount(summary?.pending_coaching_logs)} logs still waiting for acknowledgement`}
              icon={<MessageSquare className="size-5 text-amber-600" />}
            />
            <SummaryCard
              label="Tracked Attempts"
              value={formatCount(summary?.total_attempts)}
              helper="Attempts recorded across modules, assessments, and Call Simulation"
              icon={<Activity className="size-5 text-rose-600" />}
            />
            <SummaryCard
              label="Needs Intervention"
              value={formatCount(summary?.intervention_needed_count)}
              helper="Activities flagged by failed outcomes, repeated attempts, low scores, or incomplete coaching"
              icon={<AlertTriangle className="size-5 text-amber-600" />}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>AI Analysis</CardTitle>
                <CardDescription>
                  Professional AI-style guidance generated from trainer-scoped microlearning, assessments,
                  Call Simulation, and coaching records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AiInsightBoard
                  headline={data?.ai_analysis.headline}
                  sections={trainerAiSections}
                />
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Recent Trainee Activity</CardTitle>
                <CardDescription>Latest completion and submission events tied to trainer-owned learning assignments.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.recent_activity || []).length ? (
                  (data?.recent_activity || []).map((row) => (
                    <div key={row.id} className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-950">{row.title}</div>
                          <div className="mt-1 text-sm text-slate-600">{row.detail}</div>
                          <div className="mt-2 text-xs text-slate-500">
                            {row.batch_label || 'Trainer scope'} | {formatDateTime(row.activity_at)}
                          </div>
                        </div>
                        <Badge variant="outline" className="border-slate-300 text-slate-700">
                          {activityLabel(row.activity_type)}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    No recent activity has been recorded for the current filter selection yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Batch Performance Comparison</CardTitle>
                <CardDescription>
                  Overall learning score and completion rate by trainer-managed batch.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {completionTrendRows.length ? (
                  <AnalyticsChartPanel
                    meta={[
                      {
                        label: 'Top score',
                        value: `${truncateChartLabel(completionTrendRows[0]?.label, 14)} ${formatPercent(completionTrendRows[0]?.overall_score)}`,
                        tone: 'info',
                      },
                      {
                        label: 'Best completion',
                        value: `${truncateChartLabel([...completionTrendRows].sort((left, right) => right.completion_rate - left.completion_rate)[0]?.label, 14)} ${formatPercent([...completionTrendRows].sort((left, right) => right.completion_rate - left.completion_rate)[0]?.completion_rate)}`,
                        tone: 'success',
                      },
                    ]}
                    note="Grouped bars make it easier to compare delivery quality and completion side by side for each batch."
                  >
                    <div className="chart-scroll-shell">
                      <div className="chart-scroll-inner h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={completionTrendRows} margin={{ top: 44, right: 10, left: 0, bottom: 72 }}>
                            <CartesianGrid strokeDasharray="4 4" vertical={false} />
                            <Legend
                              verticalAlign="top"
                              align="left"
                              wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                            />
                            <XAxis
                              dataKey="label"
                              interval={0}
                              angle={-14}
                              textAnchor="end"
                              height={82}
                              tickFormatter={(value) => truncateChartLabel(value, 18)}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              domain={[0, 100]}
                              tickFormatter={formatPercentTick}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                              label={{ value: 'Percent', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontSize: 12 } }}
                            />
                            <Tooltip
                              {...ANALYTICS_TOOLTIP_PROPS}
                              formatter={(value: number, name: string) => [formatPercent(value), name]}
                            />
                            <Bar dataKey="overall_score" fill={ANALYTICS_COLORS.blue} radius={[10, 10, 0, 0]} maxBarSize={36} name="Overall Score">
                              <ChartPercentLabelList />
                            </Bar>
                            <Bar dataKey="completion_rate" fill={ANALYTICS_COLORS.teal} radius={[10, 10, 0, 0]} maxBarSize={36} name="Completion Rate">
                              <ChartPercentLabelList />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </AnalyticsChartPanel>
                ) : (
                  <AnalyticsChartEmpty message="Batch comparison will appear once the current trainer scope has saved trainee activity." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Call Simulation Scenario Performance</CardTitle>
                <CardDescription>
                  Average score and pass rate by assigned Call Simulation scenario.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {callSimulationRows.length ? (
                  <AnalyticsChartPanel
                    meta={[
                      {
                        label: 'Best scenario',
                        value: `${truncateChartLabel(callSimulationRows[0]?.scenario_title, 16)} ${formatPercent(callSimulationRows[0]?.average_score)}`,
                        tone: 'info',
                      },
                      {
                        label: 'Avg attempts',
                        value: callSimulationRows.length
                          ? average(callSimulationRows.map((row) => row.average_attempts || 0)).toFixed(1)
                          : '0.0',
                        tone: 'warning',
                      },
                    ]}
                    note="Compare scenario quality and pass rate together to see whether failures come from script difficulty or coaching gaps."
                  >
                    <div className="chart-scroll-shell">
                      <div className="chart-scroll-inner h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={callSimulationRows} margin={{ top: 44, right: 12, left: 0, bottom: 78 }}>
                            <CartesianGrid strokeDasharray="4 4" vertical={false} />
                            <Legend
                              verticalAlign="top"
                              align="left"
                              wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                            />
                            <XAxis
                              dataKey="scenario_title"
                              interval={0}
                              angle={-18}
                              textAnchor="end"
                              height={98}
                              tickFormatter={(value) => truncateChartLabel(value, 20)}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              domain={[0, 100]}
                              tickFormatter={formatPercentTick}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                              label={{ value: 'Percent', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontSize: 12 } }}
                            />
                            <Tooltip
                              {...ANALYTICS_TOOLTIP_PROPS}
                              formatter={(value: number, name: string) => [formatPercent(value), name]}
                            />
                            <Bar dataKey="average_score" fill={ANALYTICS_COLORS.violet} radius={[10, 10, 0, 0]} maxBarSize={36} name="Average Score">
                              <ChartPercentLabelList />
                            </Bar>
                            <Bar dataKey="pass_rate" fill={ANALYTICS_COLORS.teal} radius={[10, 10, 0, 0]} maxBarSize={36} name="Pass Rate">
                              <ChartPercentLabelList />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </AnalyticsChartPanel>
                ) : (
                  <AnalyticsChartEmpty message="Call Simulation analytics will appear after trainees start completing assigned mock calls." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Call and Coaching Follow-Up</CardTitle>
                <CardDescription>
                  KPI mix from completed calls and the latest coaching feedback that still needs action.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {qualityKpiRows.length ? (
                  <AnalyticsChartPanel
                    meta={[
                      {
                        label: 'Strongest KPI',
                        value: `${qualityKpiRows[0]?.metric || 'KPI'} ${formatMetricValue(qualityKpiRows[0]?.value, qualityKpiRows[0]?.unit)}`,
                        tone: 'success',
                      },
                      {
                        label: 'Coaching completion',
                        value: formatPercent(summary?.coaching_completion_rate),
                        tone: 'warning',
                      },
                    ]}
                    note="These percentages reflect the scored quality signals coming back from completed mock calls."
                  >
                    <div className="chart-scroll-shell">
                      <div className="chart-scroll-inner" style={{ minWidth: 0, height: `${getCategoricalChartHeight(qualityKpiRows.length, 280, 48, 420)}px` }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={qualityKpiRows} layout="vertical" margin={{ top: 12, right: 18, left: 12, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="4 4" horizontal={false} />
                            <XAxis
                              type="number"
                              domain={[0, 100]}
                              tickFormatter={formatPercentTick}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="metric"
                              width={120}
                              tickFormatter={(value) => truncateChartLabel(value, 16)}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              {...ANALYTICS_TOOLTIP_PROPS}
                              formatter={(value: number, name: string) => [formatPercent(value), name]}
                            />
                            <Bar dataKey="value" fill={ANALYTICS_COLORS.violet} radius={[0, 10, 10, 0]} name="KPI Score">
                              <ChartPercentLabelList position="right" offset={10} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </AnalyticsChartPanel>
                ) : (
                  <AnalyticsChartEmpty message="KPI averages will appear after trainees complete scored Call Simulation attempts." />
                )}

                {operationalKpiRows.length ? (
                  <div className="analytics-inline-stats">
                    {operationalKpiRows.map((metric) => (
                      <div key={metric.metric} className="analytics-note-card rounded-2xl border p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{metric.metric}</div>
                        <div className="mt-2 text-xl font-semibold text-slate-950">
                          {formatMetricValue(metric.value, metric.unit)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {(data?.coaching_summary?.published_logs || 0) > 0 ? (
                  <div className="analytics-inline-stats">
                    <div className="analytics-note-card rounded-2xl border p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Published</div>
                      <div className="mt-2 text-xl font-semibold text-slate-950">
                        {formatCount(data?.coaching_summary?.published_logs)}
                      </div>
                    </div>
                    <div className="analytics-note-card rounded-2xl border p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Pending Ack</div>
                      <div className="mt-2 text-xl font-semibold text-amber-700">
                        {formatCount(data?.coaching_summary?.pending_logs)}
                      </div>
                    </div>
                    <div className="analytics-note-card rounded-2xl border p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Retake Coaching</div>
                      <div className="mt-2 text-xl font-semibold text-rose-700">
                        {formatCount(data?.coaching_summary?.retake_required_logs)}
                      </div>
                    </div>
                  </div>
                ) : null}

                {coachingNotes.length ? (
                  <div className="space-y-3">
                    {coachingNotes.map((note) => (
                      <div key={note.id} className="analytics-note-card rounded-2xl border p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-950">{note.scenario_title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {note.trainee_name || 'Trainee'} | {note.trainer_name || 'Trainer'}
                            </div>
                          </div>
                          <Badge variant="outline" className="self-start border-slate-300 text-slate-700">
                            {note.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <div className="mt-3 text-sm text-slate-600">{note.feedback_summary}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <AnalyticsChartEmpty message="Coaching follow-up notes will appear here after trainers publish coaching feedback." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Module Effectiveness</CardTitle>
                <CardDescription>
                  Completion rate and average score by trainer-owned module assignment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {moduleEffectivenessRows.length ? (
                  <AnalyticsChartPanel
                    meta={[
                      {
                        label: 'Strongest module',
                        value: `${truncateChartLabel(moduleEffectivenessRows[0]?.module_title, 16)} ${formatPercent(moduleEffectivenessRows[0]?.average_score)}`,
                        tone: 'success',
                      },
                      {
                        label: 'Weakest pass rate',
                        value: weakestModuleRows[0]
                          ? `${truncateChartLabel(weakestModuleRows[0].module_title, 16)} ${formatPercent(weakestModuleRows[0].pass_rate)}`
                          : 'No data',
                        tone: 'warning',
                      },
                    ]}
                    note="Horizontal bars keep long module names readable while showing where completion and score are moving together or drifting apart."
                  >
                    <div className="chart-scroll-shell">
                      <div
                        className="chart-scroll-inner"
                        style={{ minWidth: 0, height: `${getCategoricalChartHeight(moduleEffectivenessRows.length, 340, 48, 520)}px` }}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={moduleEffectivenessRows} layout="vertical" margin={{ top: 40, right: 18, left: 12, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="4 4" horizontal={false} />
                            <Legend
                              verticalAlign="top"
                              align="left"
                              wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                            />
                            <XAxis
                              type="number"
                              domain={[0, 100]}
                              tickFormatter={formatPercentTick}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="module_title"
                              width={134}
                              tickFormatter={(value) => truncateChartLabel(value, 18)}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              {...ANALYTICS_TOOLTIP_PROPS}
                              formatter={(value: number, name: string) => [formatPercent(value), name]}
                            />
                            <Bar dataKey="average_score" fill={ANALYTICS_COLORS.blue} radius={[0, 10, 10, 0]} maxBarSize={24} name="Average Score">
                              <ChartPercentLabelList position="right" offset={8} />
                            </Bar>
                            <Bar dataKey="completion_rate" fill={ANALYTICS_COLORS.teal} radius={[0, 10, 10, 0]} maxBarSize={24} name="Completion Rate">
                              <ChartPercentLabelList position="right" offset={8} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </AnalyticsChartPanel>
                ) : (
                  <AnalyticsChartEmpty message="Module effectiveness will appear once trainer-owned module assignments start producing trainee results." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Assessment Attempts and Accuracy</CardTitle>
                <CardDescription>
                  Attempt volume and score quality across the trainer-assigned assessments currently in scope.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assessmentAttemptRows.length ? (
                  <AnalyticsChartPanel
                    meta={[
                      {
                        label: 'Most attempted',
                        value: `${truncateChartLabel(assessmentAttemptRows[0]?.assessment_title, 16)} ${formatCount(assessmentAttemptRows[0]?.attempt_count)}`,
                        tone: 'warning',
                      },
                      {
                        label: 'Best accuracy',
                        value: (() => {
                          const strongestAssessment = [...assessmentAttemptRows].sort((left, right) => right.average_score - left.average_score)[0]
                          return strongestAssessment
                            ? `${truncateChartLabel(strongestAssessment.assessment_title, 16)} ${formatPercent(strongestAssessment.average_score)}`
                            : 'No data'
                        })(),
                        tone: 'success',
                      },
                    ]}
                    note="Bars show where trainees are spending retries, while the score line shows whether those extra attempts are converting into stronger outcomes."
                  >
                    <div className="chart-scroll-shell">
                      <div className="chart-scroll-inner h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={assessmentAttemptRows} margin={{ top: 44, right: 18, left: 0, bottom: 78 }}>
                            <CartesianGrid strokeDasharray="4 4" vertical={false} />
                            <Legend
                              verticalAlign="top"
                              align="left"
                              wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                            />
                            <XAxis
                              dataKey="assessment_title"
                              interval={0}
                              angle={-18}
                              textAnchor="end"
                              height={96}
                              tickFormatter={(value) => truncateChartLabel(value, 18)}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              yAxisId="left"
                              allowDecimals={false}
                              tickFormatter={formatCountTick}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                              label={{ value: 'Attempts', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontSize: 12 } }}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              domain={[0, 100]}
                              tickFormatter={formatPercentTick}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              {...ANALYTICS_TOOLTIP_PROPS}
                              formatter={(value: number, name: string) => [
                                name === 'Attempts' ? formatCount(value) : formatPercent(value),
                                name,
                              ]}
                            />
                            <Bar yAxisId="left" dataKey="attempt_count" fill={ANALYTICS_COLORS.amber} radius={[10, 10, 0, 0]} maxBarSize={36} name="Attempts">
                              <ChartCountLabelList />
                            </Bar>
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="average_score"
                              stroke={ANALYTICS_COLORS.violet}
                              strokeWidth={3}
                              dot={{ r: 4, fill: ANALYTICS_COLORS.violet }}
                              activeDot={{ r: 6 }}
                              name="Average Score"
                            >
                              <ChartPercentLabelList position="top" />
                            </Line>
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </AnalyticsChartPanel>
                ) : (
                  <AnalyticsChartEmpty message="Assessment attempt trends will appear after trainer-assigned assessments start collecting real submissions." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Weakest Modules</CardTitle>
                <CardDescription>Modules with the softest completion and score outcomes right now.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {weakestModuleRows.length ? (
                  weakestModuleRows.map((row) => (
                    <div key={row.module_id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-950">{row.module_title}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.topic_category_name || row.module_type || 'Module'}
                          </div>
                        </div>
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          {formatPercent(row.completion_rate)}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        <div className="flex justify-between">
                          <span>Average score</span>
                          <span>{formatPercent(row.average_score)}</span>
                        </div>
                        <Progress value={row.completion_rate} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    No weak-module pattern has appeared yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Weakest Assessment Areas</CardTitle>
                <CardDescription>Low-scoring assessment categories across current trainer-owned results.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {weakAreaRows.length ? (
                  weakAreaRows.map((row) => (
                    <div key={row.category_name} className="rounded-2xl border p-4">
                      <div className="font-semibold text-slate-950">{row.category_name}</div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600">
                        <div className="flex justify-between">
                          <span>Average score</span>
                          <span>{formatPercent(row.average_score)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pass rate</span>
                          <span>{formatPercent(row.pass_rate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Completed</span>
                          <span>{formatCount(row.completed_count)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    No assessment-area weakness has been recorded yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Trainees Needing Improvement</CardTitle>
                <CardDescription>Priority follow-up list based on score, completion, and pass-rate risk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {improvementRows.length ? (
                  improvementRows.map((row) => (
                    <InsightRow
                      key={row.trainee_id}
                      title={row.trainee_name}
                      subtitle={`${row.batch_label} | Score ${formatPercent(row.overall_score)} | Pass ${formatPercent(row.pass_rate)} | Coaching ${formatCount(row.pending_coaching)} open`}
                      badge={row.call_simulation_completed || row.module_completed || row.assessment_completed ? 'Needs focus' : 'Low activity'}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    No trainee is currently flagged for targeted improvement.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Exercise Performance Summary</CardTitle>
                <CardDescription>How trainees are performing inside the actual trainer-authored module exercises.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.exercise_performance || []).length ? (
                  (data?.exercise_performance || []).slice(0, 8).map((row) => (
                    <div key={row.exercise_filter_id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-950">{row.exercise_title}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.module_title}</div>
                        </div>
                        <Badge variant="outline" className="border-slate-300 text-slate-700">
                          {formatPercent(row.average_score)}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                        <div>Assigned: {formatCount(row.assigned_count)}</div>
                        <div>Attempts: {formatCount(row.attempt_count)}</div>
                        <div>Completion: {formatPercent(row.completion_rate)}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    Exercise analytics will appear after trainees start answering module exercises.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Trainee Performance Ranking</CardTitle>
                <CardDescription>Ranking reflects trainer-scoped microlearning, assessments, Call Simulation, and coaching follow-up.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {traineeSpotlightRows.length ? (
                  traineeSpotlightRows.map((row, index) => (
                    <InsightRow
                      key={row.trainee_id}
                      title={`${index + 1}. ${row.trainee_name}`}
                      subtitle={`${row.batch_label} | Score ${formatPercent(row.overall_score)} | Completion ${formatPercent(row.completion_rate)}`}
                      badge={`${formatCount(row.total_attempts)} attempts`}
                    />
                  ))
                ) : (
                  <AnalyticsChartEmpty message="No trainee ranking data is available for the current filter selection." />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
