'use client'

import {
  AlertTriangle,
  BarChart3,
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
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { AdminLearningFilterBar } from '@/app/components/admin/admin-learning-filter-bar'
import {
  buildAdminLearningInsightsUrl,
  EMPTY_ADMIN_LEARNING_FILTERS,
  type AdminLearningFilterState,
  type AdminLearningInsightsResponse,
} from '@/app/lib/admin-learning-insights'
import { useLiveRefresh } from '@/app/hooks/useLiveRefresh'
import { apiFetch } from '@/app/utils/api'
import { getBackendWebSocketUrl } from '@/app/utils/ws'
import { AiInsightBoard, type AiInsightSection } from '../ui/ai-insight-board'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { ChartCountLabelList, ChartPercentLabelList } from '../ui/chart-data-labels'
import { Progress } from '../ui/progress'

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

function performanceLabel(level?: string | null) {
  switch (level) {
    case 'excellent':
      return 'Excellent'
    case 'healthy':
      return 'Healthy'
    case 'developing':
      return 'Developing'
    case 'at_risk':
      return 'At Risk'
    default:
      return 'Unscored'
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Unable to load admin analytics right now.'
}

function SummaryCard({
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
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-500">{title}</div>
          <div className="mt-2 break-words text-2xl font-semibold text-slate-950 sm:text-3xl">{value}</div>
          <div className="mt-2 text-xs leading-5 text-slate-500">{helper}</div>
        </div>
        <div className="self-start rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function average(values: number[]) {
  if (!values.length) {
    return 0
  }
  return values.reduce((total, value) => total + value, 0) / values.length
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

export default function AnalyticsDashboard() {
  const [filters, setFilters] = useState<AdminLearningFilterState>(EMPTY_ADMIN_LEARNING_FILTERS)
  const [data, setData] = useState<AdminLearningInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState('Connecting to admin live analytics...')

  const requestUrl = useMemo(() => buildAdminLearningInsightsUrl(filters), [filters])

  const loadAnalytics = useCallback(
    async (mode: 'initial' | 'refresh' | 'auto' = 'initial') => {
      if (mode === 'initial') {
        setLoading(true)
      } else if (mode === 'refresh') {
        setRefreshing(true)
      }

      setError(null)

      try {
        const payload = await apiFetch<AdminLearningInsightsResponse>(requestUrl)
        setData(payload)
        setLastSyncedAt(new Date().toISOString())
      } catch (loadError) {
        setError(getErrorMessage(loadError))
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
    const token = sessionStorage.getItem('token')
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
            `${message.session?.user_name || message.details?.trainee_name || 'A trainee'} updated ${activityLabel}. Refreshing admin analytics...`,
          )
          void loadAnalytics('refresh')
        }
      } catch (parseError) {
        console.error('Admin analytics live update parse error:', parseError)
      }
    }

    socket.onopen = () => {
      setLiveStatus('Live admin analytics websocket connected.')
    }

    socket.onclose = () => {
      setLiveStatus('Live admin analytics websocket disconnected. Auto-refresh remains active.')
    }

    return () => {
      socket.close()
    }
  }, [loadAnalytics])

  const summary = data?.summary
  const hasLearningData = Boolean(
    (summary?.assigned_module_records || 0) > 0
      || (summary?.assigned_assessment_records || 0) > 0
      || (summary?.assigned_call_simulation_records || 0) > 0
      || (summary?.published_coaching_logs || 0) > 0,
  )
  const scopeLabel = data?.scope.label || 'All Admin Learning Data'
  const totalTrackedAssigned =
    (summary?.assigned_module_records || 0)
    + (summary?.assigned_assessment_records || 0)
    + (summary?.assigned_call_simulation_records || 0)

  const trainerRows = useMemo(() => data?.trainer_comparison || [], [data?.trainer_comparison])
  const batchRows = useMemo(() => data?.batch_comparison || [], [data?.batch_comparison])
  const moduleRows = useMemo(() => data?.module_progress || [], [data?.module_progress])
  const assessmentRows = useMemo(() => data?.assessment_performance || [], [data?.assessment_performance])
  const exerciseRows = useMemo(() => data?.exercise_performance || [], [data?.exercise_performance])
  const recentRows = useMemo(() => data?.recent_activity || [], [data?.recent_activity])
  const traineeRows = useMemo(() => data?.trainee_ranking || [], [data?.trainee_ranking])
  const weakestModules = useMemo(() => data?.weakest_modules || [], [data?.weakest_modules])
  const weakestAreas = useMemo(() => data?.weakest_assessment_areas || [], [data?.weakest_assessment_areas])
  const atRiskTrainers = useMemo(() => data?.at_risk_trainers || [], [data?.at_risk_trainers])
  const atRiskBatches = useMemo(() => data?.at_risk_batches || [], [data?.at_risk_batches])
  const callSimulationRows = useMemo(() => data?.call_simulation_performance || [], [data?.call_simulation_performance])
  const callSimulationKpis = useMemo(() => data?.call_simulation_kpi_breakdown || [], [data?.call_simulation_kpi_breakdown])
  const coachingNotes = useMemo(() => data?.coaching_notes_summary || [], [data?.coaching_notes_summary])
  const qualityKpiRows = useMemo(
    () => callSimulationKpis.filter((metric) => metric.unit === '%').slice(0, 5),
    [callSimulationKpis],
  )
  const operationalKpiRows = useMemo(
    () => callSimulationKpis.filter((metric) => metric.unit !== '%').slice(0, 3),
    [callSimulationKpis],
  )
  const adminAiSections = useMemo<AiInsightSection[]>(
    () => [
      {
        title: 'Strengths',
        items: data?.ai_analysis.strengths || data?.ai_analysis.trainer_effectiveness || [],
        tone: 'emerald',
        emptyMessage: 'No admin-scope strengths were generated yet.',
      },
      {
        title: 'Opportunities For Improvement',
        items: data?.ai_analysis.opportunities || [],
        tone: 'sky',
        emptyMessage: 'No improvement opportunity was generated yet.',
      },
      {
        title: 'Weak Modules / Categories',
        items: data?.ai_analysis.weak_modules_categories || data?.ai_analysis.module_and_assessment || [],
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
        items: data?.ai_analysis.exercise_improvement_notes || data?.ai_analysis.exercise_performance || [],
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
  const moduleEffectivenessRows = useMemo(() => moduleRows.slice(0, 8), [moduleRows])
  const assessmentEffectivenessRows = useMemo(() => assessmentRows.slice(0, 8), [assessmentRows])

  return (
    <div className="analytics-page-shell">
      <div className="analytics-page-header">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Admin Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Professional analytics built from real microlearning, assessments, Call Simulation results,
            coaching records, and batch-linked learning activity.
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
            Refresh Analytics
          </Button>
        </div>
      </div>

      <Card className="border-sky-200 bg-sky-50 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-sky-900 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="font-semibold">Current Analytics Scope</div>
            <div className="mt-1 text-sky-800">{scopeLabel}</div>
            <div className="mt-1 text-xs text-sky-700">{liveStatus}</div>
          </div>
          <div className="text-sky-800">
            Last synced: {formatDateTime(lastSyncedAt)}
          </div>
        </CardContent>
      </Card>

      <AdminLearningFilterBar value={filters} options={data?.filters || null} onChange={setFilters} />

      {error ? (
        <Card className="border-rose-200 bg-rose-50 shadow-sm">
          <CardContent className="p-4 text-sm text-rose-700">{error}</CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading admin analytics...
          </CardContent>
        </Card>
      ) : !hasLearningData ? (
        <Card className="border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No admin learning analytics yet</CardTitle>
            <CardDescription>
              Analytics will populate after trainers assign learning activities and trainees start producing
              saved microlearning, assessment, Call Simulation, or coaching results.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="analytics-summary-grid">
            <SummaryCard
              title="Total Trainers"
              value={formatCount(summary?.total_trainers)}
              helper="Trainers represented in the current analytics scope"
              icon={Users}
            />
            <SummaryCard
              title="Total Batches"
              value={formatCount(summary?.total_batches)}
              helper="Batches contributing learning results in this scope"
              icon={BarChart3}
            />
            <SummaryCard
              title="Total Trainees"
              value={formatCount(summary?.total_trainees)}
              helper="Trainees with scoped assignments or results"
              icon={Users}
            />
            <SummaryCard
              title="Active Trainees"
              value={formatCount(summary?.active_trainees)}
              helper="Trainees with recent saved activity in the current scope"
              icon={TrendingUp}
            />
            <SummaryCard
              title="Overall Score"
              value={formatPercent(summary?.overall_score)}
              helper="Combined microlearning, assessment, and Call Simulation result average"
              icon={Target}
            />
            <SummaryCard
              title="Completion Rate"
              value={formatPercent(summary?.completion_rate)}
              helper="Completed modules, assessments, and Call Simulation work across assigned items"
              icon={CheckCircle2}
            />
            <SummaryCard
              title="Pass Rate"
              value={formatPercent(summary?.pass_rate)}
              helper="Completed learning items meeting the passing threshold"
              icon={GraduationCap}
            />
            <SummaryCard
              title="Avg Assessment"
              value={formatPercent(summary?.average_assessment_score)}
              helper={`${formatCount(summary?.completed_assessments)} completed assessment results`}
              icon={ClipboardList}
            />
            <SummaryCard
              title="Avg Microlearning"
              value={formatPercent(summary?.average_exercise_score)}
              helper={`${formatCount(summary?.completed_modules)} completed module outcomes`}
              icon={Gauge}
            />
            <SummaryCard
              title="Avg Call KPI"
              value={formatPercent(summary?.average_call_simulation_score)}
              helper={`${formatCount(summary?.completed_call_simulations)} completed mock calls`}
              icon={Mic}
            />
            <SummaryCard
              title="Call Pass Rate"
              value={formatPercent(summary?.call_simulation_pass_rate)}
              helper={`${formatCount(summary?.assigned_call_simulation_records)} assigned call simulations tracked`}
              icon={Mic}
            />
            <SummaryCard
              title="Coaching Completion"
              value={formatPercent(summary?.coaching_completion_rate)}
              helper={`${formatCount(summary?.pending_coaching_logs)} published coaching logs still waiting for acknowledgement`}
              icon={MessageSquare}
            />
            <SummaryCard
              title="Support Needed"
              value={formatCount(summary?.intervention_needed_count)}
              helper="Activities flagged by failed outcomes, repeated attempts, low scores, or incomplete coaching"
              icon={AlertTriangle}
            />
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>AI Analysis</CardTitle>
              <CardDescription>
                Management-focused AI-style notes generated from real batch, trainer, microlearning,
                assessment, Call Simulation, coaching, and exercise outcomes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AiInsightBoard
                headline={data?.ai_analysis.overview}
                sections={adminAiSections}
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Trainer Comparison</CardTitle>
                <CardDescription>
                  Overall learning score and completion rate by trainer using real assignment and result records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trainerRows.length ? (
                  <AnalyticsChartPanel
                    meta={[
                      {
                        label: 'Top trainer',
                        value: `${truncateChartLabel(trainerRows[0]?.trainer_name, 14)} ${formatPercent(trainerRows[0]?.overall_score)}`,
                        tone: 'info',
                      },
                      {
                        label: 'Best completion',
                        value: `${truncateChartLabel([...trainerRows].sort((left, right) => right.completion_rate - left.completion_rate)[0]?.trainer_name, 14)} ${formatPercent([...trainerRows].sort((left, right) => right.completion_rate - left.completion_rate)[0]?.completion_rate)}`,
                        tone: 'success',
                      },
                    ]}
                    note="This view compares trainer-owned cohorts on the two management signals that matter most: completion follow-through and overall result quality."
                  >
                    <div className="chart-scroll-shell">
                      <div className="chart-scroll-inner h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={trainerRows.slice(0, 10)} margin={{ top: 44, right: 12, left: 0, bottom: 72 }}>
                            <CartesianGrid strokeDasharray="4 4" vertical={false} />
                            <Legend
                              verticalAlign="top"
                              align="left"
                              wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                            />
                            <XAxis
                              dataKey="trainer_name"
                              interval={0}
                              angle={-18}
                              textAnchor="end"
                              height={92}
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
                  <AnalyticsChartEmpty message="Trainer comparison will appear once trainer-owned learning data is available." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Batch Comparison</CardTitle>
                <CardDescription>
                  Batch-level score and completion movement based on actual trainee learning records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {batchRows.length ? (
                  <AnalyticsChartPanel
                    meta={[
                      {
                        label: 'Top batch',
                        value: `${truncateChartLabel(batchRows[0]?.batch_label, 16)} ${formatPercent(batchRows[0]?.overall_score)}`,
                        tone: 'info',
                      },
                      {
                        label: 'Best pass rate',
                        value: `${truncateChartLabel([...batchRows].sort((left, right) => right.pass_rate - left.pass_rate)[0]?.batch_label, 16)} ${formatPercent([...batchRows].sort((left, right) => right.pass_rate - left.pass_rate)[0]?.pass_rate)}`,
                        tone: 'success',
                      },
                    ]}
                    note="This comparison helps spot whether a batch is underperforming because it is incomplete, low scoring, or both."
                  >
                    <div className="chart-scroll-shell">
                      <div className="chart-scroll-inner h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={batchRows.slice(0, 10)} margin={{ top: 44, right: 12, left: 0, bottom: 72 }}>
                            <CartesianGrid strokeDasharray="4 4" vertical={false} />
                            <Legend
                              verticalAlign="top"
                              align="left"
                              wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                            />
                            <XAxis
                              dataKey="batch_label"
                              interval={0}
                              angle={-14}
                              textAnchor="end"
                              height={88}
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
                            <Bar dataKey="completion_rate" fill={ANALYTICS_COLORS.amber} radius={[10, 10, 0, 0]} maxBarSize={36} name="Completion Rate">
                              <ChartPercentLabelList />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </AnalyticsChartPanel>
                ) : (
                  <AnalyticsChartEmpty message="Batch comparison will appear after scoped batch results are recorded." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Module Effectiveness</CardTitle>
                <CardDescription>
                  Completion rate and average score for the active module set in the current admin scope.
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
                        label: 'Weakest module',
                        value: weakestModules[0]
                          ? `${truncateChartLabel(weakestModules[0].module_title, 16)} ${formatPercent(weakestModules[0].average_score)}`
                          : 'No data',
                        tone: 'warning',
                      },
                    ]}
                    note="A horizontal comparison works better here because module names are long and the goal is ranking effectiveness, not showing a time series."
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
                  <AnalyticsChartEmpty message="Module effectiveness will appear after trainers assign modules and trainees start completing them." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Call Simulation Scenario Performance</CardTitle>
                <CardDescription>
                  Average score and pass rate by assigned Call Simulation scenario in the current admin scope.
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
                    note="This view separates scenario difficulty from execution quality by showing score and pass rate together."
                  >
                    <div className="chart-scroll-shell">
                      <div className="chart-scroll-inner h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={callSimulationRows.slice(0, 10)} margin={{ top: 44, right: 12, left: 0, bottom: 78 }}>
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
                  <AnalyticsChartEmpty message="Call Simulation scenario analytics will appear after scoped mock call results are saved." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Call and Coaching Overview</CardTitle>
                <CardDescription>
                  KPI quality from completed calls and the latest coaching follow-up signals in the current scope.
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
                    note="These KPI percentages reflect the call-quality signals coming back from completed mock-call evaluations."
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
                  <AnalyticsChartEmpty message="Call Simulation KPI trends will appear after scoped mock calls receive scored outcomes." />
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
                    {coachingNotes.slice(0, 5).map((note) => (
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
                  <AnalyticsChartEmpty message="Coaching summaries will appear after trainers publish coaching feedback for the current scope." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Completion Status Mix</CardTitle>
                <CardDescription>Pending, in-progress, and completed learning items in the current scope.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(data?.completion_breakdown || []).map((row) => (
                  <div key={row.label} className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-950">{row.label}</div>
                      <Badge variant="outline" className="border-slate-300 text-slate-700">
                        {formatCount(row.count)}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <Progress
                        value={
                          (row.count / Math.max(totalTrackedAssigned, 1)) * 100
                        }
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Performance Level Mix</CardTitle>
                <CardDescription>How current results are distributed across performance bands.</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.performance_breakdown || []).some((row) => row.count > 0) ? (
                  <AnalyticsChartPanel
                    meta={[
                      {
                        label: 'At risk',
                        value: formatCount((data?.performance_breakdown || []).find((row) => row.level === 'at_risk')?.count),
                        tone: 'danger',
                      },
                    ]}
                    note="This mix quickly shows whether the current scope is healthy overall or hiding a long tail of risky results."
                  >
                    <div className="chart-scroll-shell">
                      <div className="chart-scroll-inner h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data?.performance_breakdown || []} margin={{ top: 24, right: 12, left: 0, bottom: 6 }}>
                            <CartesianGrid strokeDasharray="4 4" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis
                              allowDecimals={false}
                              tickFormatter={formatCountTick}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              {...ANALYTICS_TOOLTIP_PROPS}
                              formatter={(value: number, name: string) => [formatCount(value), name]}
                            />
                            <Bar dataKey="count" radius={[10, 10, 0, 0]} name="Results" maxBarSize={44}>
                              <ChartCountLabelList />
                              {(data?.performance_breakdown || []).map((row) => (
                                <Cell
                                  key={row.level}
                                  fill={
                                    row.level === 'excellent'
                                      ? ANALYTICS_COLORS.emerald
                                      : row.level === 'healthy'
                                        ? ANALYTICS_COLORS.teal
                                        : row.level === 'developing'
                                          ? ANALYTICS_COLORS.amber
                                          : ANALYTICS_COLORS.rose
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </AnalyticsChartPanel>
                ) : (
                  <AnalyticsChartEmpty message="Performance banding will appear once scored results are available." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Assessment Effectiveness</CardTitle>
                <CardDescription>Average score and pass rate by assessment title in the current admin filter scope.</CardDescription>
              </CardHeader>
              <CardContent>
                {assessmentEffectivenessRows.length ? (
                  <AnalyticsChartPanel
                    meta={[
                      {
                        label: 'Top assessment',
                        value: `${truncateChartLabel(assessmentEffectivenessRows[0]?.assessment_title, 16)} ${formatPercent(assessmentEffectivenessRows[0]?.average_score)}`,
                        tone: 'success',
                      },
                      {
                        label: 'Best pass rate',
                        value: `${truncateChartLabel([...assessmentEffectivenessRows].sort((left, right) => right.pass_rate - left.pass_rate)[0]?.assessment_title, 16)} ${formatPercent([...assessmentEffectivenessRows].sort((left, right) => right.pass_rate - left.pass_rate)[0]?.pass_rate)}`,
                        tone: 'info',
                      },
                    ]}
                    note="Showing both score and pass rate reveals whether an assessment is difficult, poorly retained, or simply under-attempted."
                  >
                    <div className="chart-scroll-shell">
                      <div
                        className="chart-scroll-inner"
                        style={{ minWidth: 0, height: `${getCategoricalChartHeight(assessmentEffectivenessRows.length, 320, 48, 520)}px` }}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={assessmentEffectivenessRows} layout="vertical" margin={{ top: 40, right: 18, left: 12, bottom: 8 }}>
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
                              dataKey="assessment_title"
                              width={138}
                              tickFormatter={(value) => truncateChartLabel(value, 18)}
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              {...ANALYTICS_TOOLTIP_PROPS}
                              formatter={(value: number, name: string) => [formatPercent(value), name]}
                            />
                            <Bar dataKey="average_score" fill={ANALYTICS_COLORS.violet} radius={[0, 10, 10, 0]} maxBarSize={24} name="Average Score">
                              <ChartPercentLabelList position="right" offset={8} />
                            </Bar>
                            <Bar dataKey="pass_rate" fill={ANALYTICS_COLORS.teal} radius={[0, 10, 10, 0]} maxBarSize={24} name="Pass Rate">
                              <ChartPercentLabelList position="right" offset={8} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </AnalyticsChartPanel>
                ) : (
                  <AnalyticsChartEmpty message="Assessment effectiveness will appear once scoped assessment submissions exist." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Top Trainers</CardTitle>
                <CardDescription>Best trainer signals by score and completion in the current scope.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {trainerRows.length ? (
                  trainerRows.slice(0, 5).map((row, index) => (
                    <InsightRow
                      key={row.trainer_id}
                      title={`${index + 1}. ${row.trainer_name}`}
                      subtitle={`${formatPercent(row.overall_score)} overall | ${formatPercent(row.completion_rate)} completion`}
                      badge={`${formatCount(row.trainee_count)} trainees`}
                    />
                  ))
                ) : (
                  <AnalyticsChartEmpty message="Top trainer rankings will appear when trainer-owned results are available." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>At-Risk Trainers</CardTitle>
                <CardDescription>Trainers currently showing low score, low completion, or open coaching risk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {atRiskTrainers.length ? (
                  atRiskTrainers.map((row) => (
                    <InsightRow
                      key={row.trainer_id}
                      title={row.trainer_name}
                      subtitle={`${formatPercent(row.overall_score)} overall | ${formatPercent(row.completion_rate)} completion`}
                      badge={`${formatCount(row.pending_coaching)} coaching open`}
                    />
                  ))
                ) : (
                  <AnalyticsChartEmpty message="At-risk trainers will appear once weak performance signals emerge." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>At-Risk Batches</CardTitle>
                <CardDescription>Batch groups currently trailing on completion or score performance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {atRiskBatches.length ? (
                  atRiskBatches.map((row) => (
                    <InsightRow
                      key={row.batch_id}
                      title={row.batch_label}
                      subtitle={`${formatPercent(row.overall_score)} overall | ${formatPercent(row.pass_rate)} pass`}
                      badge={`${formatCount(row.assigned_items)} items`}
                    />
                  ))
                ) : (
                  <AnalyticsChartEmpty message="At-risk batches will appear once weak performance signals emerge." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Trainee Ranking</CardTitle>
                <CardDescription>Top trainee results across microlearning, assessments, Call Simulation, and coaching follow-up.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {traineeRows.length ? (
                  traineeRows.slice(0, 6).map((row, index) => (
                    <InsightRow
                      key={row.trainee_id}
                      title={`${index + 1}. ${row.trainee_name}`}
                      subtitle={`${row.batch_label} | ${formatPercent(row.overall_score)} overall | ${formatPercent(row.completion_rate)} completion`}
                      badge={performanceLabel(row.performance_level)}
                    />
                  ))
                ) : (
                  <AnalyticsChartEmpty message="Trainee rankings will appear after scoped learning results are recorded." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Weakest Modules</CardTitle>
                <CardDescription>Modules currently underperforming on completion or score.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {weakestModules.length ? (
                  weakestModules.map((row) => (
                    <div key={row.module_id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-950">{row.module_title}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.topic_category_name || row.module_type || 'Module'}
                          </div>
                        </div>
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          {formatPercent(row.average_score)}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        <div className="flex justify-between">
                          <span>Completion</span>
                          <span>{formatPercent(row.completion_rate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pass rate</span>
                          <span>{formatPercent(row.pass_rate)}</span>
                        </div>
                        <Progress value={row.completion_rate} />
                      </div>
                    </div>
                  ))
                ) : (
                  <AnalyticsChartEmpty message="Weak module patterns will appear once more module results are available." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Weakest Assessment Areas</CardTitle>
                <CardDescription>Assessment categories dragging down the current admin learning scope.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {weakestAreas.length ? (
                  weakestAreas.map((row) => (
                    <div key={row.category_name} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-950">{row.category_name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatCount(row.assigned_count)} assigned | {formatCount(row.completed_count)} completed
                          </div>
                        </div>
                        <Badge variant="outline" className="border-rose-300 text-rose-700">
                          {formatPercent(row.average_score)}
                        </Badge>
                      </div>
                      <div className="mt-3 text-sm text-slate-600">
                        Pass rate {formatPercent(row.pass_rate)}
                      </div>
                    </div>
                  ))
                ) : (
                  <AnalyticsChartEmpty message="Assessment weak areas will appear once assessment results are in scope." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Exercise Performance</CardTitle>
                <CardDescription>Real exercise result quality and completion from module attempt records.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {exerciseRows.length ? (
                  exerciseRows.slice(0, 8).map((row) => (
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
                      <div className="mt-3 grid gap-2 text-sm text-slate-600">
                        <div className="flex justify-between">
                          <span>Assigned</span>
                          <span>{formatCount(row.assigned_count)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Attempts</span>
                          <span>{formatCount(row.attempt_count)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Completion</span>
                          <span>{formatPercent(row.completion_rate)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <AnalyticsChartEmpty message="Exercise performance will appear after trainees start generating attempt data." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest microlearning, assessment, Call Simulation, and coaching events contributing to the current analytics scope.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentRows.length ? (
                  recentRows.slice(0, 10).map((row) => (
                    <div key={row.id} className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-950">{row.title}</div>
                          <div className="mt-1 text-sm text-slate-600">{row.detail}</div>
                          <div className="mt-2 text-xs text-slate-500">
                            {(row.trainer_name || 'Trainer scope')} | {(row.batch_label || 'Direct assignment')} | {formatDateTime(row.activity_at)}
                          </div>
                        </div>
                        <Badge variant="outline" className="border-slate-300 text-slate-700">
                          {row.status?.replace(/_/g, ' ') || row.activity_type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <AnalyticsChartEmpty message="Recent activity will appear after the current scope produces saved learning or coaching events." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Trainees Needing Improvement</CardTitle>
                <CardDescription>Priority follow-up list based on score, completion, and pass-rate risk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.trainees_needing_improvement || []).length ? (
                  (data?.trainees_needing_improvement || []).slice(0, 10).map((row) => (
                    <div key={row.trainee_id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-950">{row.trainee_name}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {row.batch_label} | {(row.trainer_names || []).join(', ') || 'Unassigned trainer scope'}
                          </div>
                        </div>
                        <AlertTriangle className="size-5 text-amber-600" />
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                        <div>Score: {formatPercent(row.overall_score)}</div>
                        <div>Completion: {formatPercent(row.completion_rate)}</div>
                        <div>Pass: {formatPercent(row.pass_rate)}</div>
                        <div>Open Coaching: {formatCount(row.pending_coaching)}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <AnalyticsChartEmpty message="No trainee is currently flagged for targeted improvement in this scope." />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
