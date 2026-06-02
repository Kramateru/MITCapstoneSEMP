'use client'

import {
  Activity,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  Gauge,
  GraduationCap,
  Loader2,
  MessageSquare,
  Mic,
  RefreshCw,
  Target,
  TrendingDown,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import { AiInsightBoard, type AiInsightSection } from '@/app/components/ui/ai-insight-board'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { ChartPercentLabelList } from '@/app/components/ui/chart-data-labels'
import { Progress } from '@/app/components/ui/progress'
import { ReportNavigation, type ReportNavigationItem } from '@/app/components/ui/report-navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { TrainerLearningFilterBar } from '@/app/components/trainer/trainer-learning-filter-bar'
import { useLiveRefresh } from '@/app/hooks/useLiveRefresh'
import {
  buildTrainerLearningInsightsPdfUrl,
  buildTrainerLearningInsightsUrl,
  EMPTY_TRAINER_LEARNING_FILTERS,
  type TrainerLearningFilterState,
  type TrainerLearningInsightsResponse,
} from '@/app/lib/trainer-learning-insights'
import { trainerSidebarItems } from '@/app/trainer/nav'
import { apiFetch, downloadApiFile } from '@/app/utils/api'
import { getBackendWebSocketUrl } from '@/app/utils/ws'

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

function formatMetricValue(value?: number | null, unit?: string | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return unit === 'wpm' || unit === 'sec' ? `0 ${unit}` : '0.0%'
  }
  if (unit === 'wpm' || unit === 'sec') {
    return `${value.toFixed(1)} ${unit}`
  }
  return `${value.toFixed(1)}%`
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Unable to load trainer reports right now.'
}

function SectionEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
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

function getAssessmentBadge(row: TrainerLearningInsightsResponse['assessment_results'][number]) {
  if (row.status === 'completed' && row.is_passed) {
    return { label: 'Passed', variant: 'default' as const }
  }
  if (row.status === 'completed') {
    return { label: 'Failed', variant: 'destructive' as const }
  }
  return { label: 'Pending', variant: 'secondary' as const }
}

export default function ReportsPage() {
  const [filters, setFilters] = useState<TrainerLearningFilterState>(EMPTY_TRAINER_LEARNING_FILTERS)
  const [activeTab, setActiveTab] = useState('overview')
  const [data, setData] = useState<TrainerLearningInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadNotice, setDownloadNotice] = useState<{ tone: 'warning' | 'error'; message: string } | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState('Connecting to live trainer reports...')

  const requestUrl = useMemo(() => buildTrainerLearningInsightsUrl(filters), [filters])
  const pdfUrl = useMemo(() => buildTrainerLearningInsightsPdfUrl(filters), [filters])

  const loadReports = useCallback(
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
    void loadReports('initial')
  }, [loadReports])

  useLiveRefresh({
    intervalMs: AUTO_REFRESH_MS,
    onRefresh: () => loadReports('auto'),
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
            `${message.session?.user_name || message.details?.trainee_name || 'A trainee'} updated ${activityLabel}. Refreshing trainer reports...`,
          )
          void loadReports('refresh')
        }
      } catch (parseError) {
        console.error('Trainer reports live update parse error:', parseError)
      }
    }

    socket.onopen = () => {
      setLiveStatus('Live trainer report websocket connected.')
    }

    socket.onclose = () => {
      setLiveStatus('Live trainer report websocket disconnected. Auto-refresh remains active.')
    }

    return () => {
      socket.close()
    }
  }, [loadReports])

  const summary = data?.summary
  const hasTrainerData = Boolean(
    (summary?.assigned_module_records || 0) > 0
      || (summary?.assigned_assessment_records || 0) > 0
      || (summary?.assigned_call_simulation_records || 0) > 0
      || (summary?.published_coaching_logs || 0) > 0,
  )
  const scopeLabel = data?.scope.label || 'Trainer scope'

  const batchRows = useMemo(() => data?.batch_comparison || [], [data?.batch_comparison])
  const traineeRows = useMemo(() => data?.trainee_ranking || [], [data?.trainee_ranking])
  const moduleRows = useMemo(() => data?.module_progress || [], [data?.module_progress])
  const exerciseRows = useMemo(() => data?.exercise_performance || [], [data?.exercise_performance])
  const assessmentRows = useMemo(() => data?.assessment_results || [], [data?.assessment_results])
  const assignmentRows = useMemo(() => data?.module_assignments || [], [data?.module_assignments])
  const recentRows = useMemo(() => data?.recent_activity || [], [data?.recent_activity])
  const callSimulationRows = useMemo(() => data?.call_simulation_performance || [], [data?.call_simulation_performance])
  const callSimulationResultRows = useMemo(() => data?.call_simulation_results || [], [data?.call_simulation_results])
  const callSimulationKpis = useMemo(() => data?.call_simulation_kpi_breakdown || [], [data?.call_simulation_kpi_breakdown])
  const coachingNotes = useMemo(() => data?.coaching_notes_summary || [], [data?.coaching_notes_summary])
  const coachingSummary = data?.coaching_summary || null
  const improvementRows = useMemo(
    () => data?.trainees_needing_improvement || [],
    [data?.trainees_needing_improvement],
  )
  const weakestModules = useMemo(() => data?.weakest_modules || [], [data?.weakest_modules])
  const weakestAreas = useMemo(
    () => data?.weakest_assessment_areas || [],
    [data?.weakest_assessment_areas],
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
  const reportNavigationItems = useMemo<ReportNavigationItem[]>(
    () => [
      {
        value: 'overview',
        title: 'Overview',
        description: 'Progress summary, strengths, weak areas, coaching posture, and mock-call KPI context for the selected scope.',
        icon: Activity,
        metrics: [
          { label: 'Completion', value: formatPercent(summary?.completion_rate) },
          { label: 'Pass Rate', value: formatPercent(summary?.pass_rate) },
          { label: 'Open Coaching', value: formatCount(summary?.pending_coaching_logs) },
        ],
      },
      {
        value: 'batches',
        title: 'Batch Report',
        description: 'Batch-level completion, scores, attempts, and pass/fail signals built only from assigned trainer learning.',
        icon: Users,
        metrics: [
          { label: 'Batches', value: formatCount(batchRows.length) },
          { label: 'Top Completion', value: formatPercent(Math.max(0, ...batchRows.map((row) => row.completion_rate || 0))) },
          { label: 'Avg Mock Call', value: formatPercent(summary?.average_call_simulation_score) },
        ],
      },
      {
        value: 'trainees',
        title: 'Trainee Report',
        description: 'Per-trainee scores, completion rates, pass/fail outcomes, attempts, and intervention flags for coaching review.',
        icon: GraduationCap,
        metrics: [
          { label: 'Trainees', value: formatCount(traineeRows.length) },
          { label: 'Need Support', value: formatCount(improvementRows.length) },
          { label: 'Attempts', value: formatCount(summary?.total_attempts) },
        ],
      },
      {
        value: 'learning',
        title: 'Modules & Categories',
        description: 'Microlearning progress, module-level performance, exercise results, and low-scoring category patterns.',
        icon: BookOpen,
        metrics: [
          { label: 'Modules', value: formatCount(summary?.assigned_module_records) },
          { label: 'Avg Microlearning', value: formatPercent(summary?.average_exercise_score) },
          { label: 'Weak Areas', value: formatCount(weakestModules.length + weakestAreas.length) },
        ],
      },
      {
        value: 'results',
        title: 'Results & Coaching',
        description: 'Assessment breakdowns, Call Simulation outcomes, coaching status, and detailed saved activity rows.',
        icon: ClipboardList,
        metrics: [
          { label: 'Assessments', value: formatCount(assessmentRows.length) },
          { label: 'Mock Calls', value: formatCount(callSimulationResultRows.length) },
          { label: 'KPI Metrics', value: formatCount(callSimulationKpis.length) },
        ],
      },
    ],
    [
      assessmentRows.length,
      batchRows,
      callSimulationKpis.length,
      callSimulationResultRows.length,
      improvementRows.length,
      summary?.average_call_simulation_score,
      summary?.average_exercise_score,
      summary?.completion_rate,
      summary?.pass_rate,
      summary?.pending_coaching_logs,
      summary?.total_attempts,
      summary?.assigned_module_records,
      traineeRows.length,
      weakestAreas.length,
      weakestModules.length,
    ],
  )

  const handleDownloadPdf = useCallback(async () => {
    setDownloadNotice(null)

    if (!hasTrainerData) {
      setDownloadNotice({
        tone: 'warning',
        message: 'No report data is available for the selected filters yet.',
      })
      return
    }

    setDownloadingPdf(true)
    try {
      await downloadApiFile(
        pdfUrl,
        `Trainer_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
      )
    } catch (downloadError) {
      setDownloadNotice({
        tone: 'error',
        message: getErrorMessage(downloadError),
      })
    } finally {
      setDownloadingPdf(false)
    }
  }, [hasTrainerData, pdfUrl])

  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <div className="analytics-page-shell">
        <div className="analytics-page-header">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl">Reports</h1>
            <p className="text-muted-foreground">
              Database-driven batch and trainee reporting based only on trainer-created modules,
              trainer-assigned learning, and saved trainee results.
            </p>
          </div>

          <div className="analytics-page-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDownloadPdf()}
              disabled={downloadingPdf}
              className="min-h-11 rounded-full"
            >
              {downloadingPdf ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              Download PDF Report
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => void loadReports('refresh')}
              disabled={loading || refreshing || downloadingPdf}
              className="min-h-11 rounded-full"
            >
              {refreshing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
              Refresh Reports
            </Button>
          </div>
        </div>

        <Card className="border-sky-200 bg-sky-50 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-sky-900 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-semibold">Current Report Scope</div>
              <div className="mt-1 text-sky-800">{scopeLabel}</div>
              <div className="mt-1 text-xs text-sky-700">{liveStatus}</div>
            </div>
            <div className="text-sky-800">
              Last synced: {formatDateTime(lastSyncedAt)}
            </div>
          </CardContent>
        </Card>

        <TrainerLearningFilterBar value={filters} options={data?.filters || null} onChange={setFilters} />

        {error ? (
          <Card className="border-rose-200 bg-rose-50 shadow-sm">
            <CardContent className="p-4 text-sm text-rose-700">{error}</CardContent>
          </Card>
        ) : null}

        {downloadNotice ? (
          <Card
            className={
              downloadNotice.tone === 'warning'
                ? 'border-amber-200 bg-amber-50 shadow-sm'
                : 'border-rose-200 bg-rose-50 shadow-sm'
            }
          >
            <CardContent
              className={
                downloadNotice.tone === 'warning'
                  ? 'p-4 text-sm text-amber-800'
                  : 'p-4 text-sm text-rose-700'
              }
            >
              {downloadNotice.message}
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <Card>
            <CardContent className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading trainer reports...
            </CardContent>
          </Card>
        ) : !hasTrainerData ? (
          <Card className="border-dashed shadow-sm">
            <CardHeader>
              <CardTitle>No trainer-scoped report data yet</CardTitle>
              <CardDescription>
                Reports will appear after this trainer assigns learning and trainees begin generating real module,
                assessment, Call Simulation, or coaching results.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="analytics-summary-grid 2xl:grid-cols-6">
              <SummaryCard
                title="Total Trainees"
                value={formatCount(summary?.total_trainees)}
                helper="Trainees with active trainer-owned learning records"
                icon={Users}
              />
              <SummaryCard
                title="Assigned Modules"
                value={formatCount(summary?.assigned_module_records)}
                helper={`${formatCount(summary?.trainer_assigned_modules)} unique modules assigned`}
                icon={BookOpen}
              />
              <SummaryCard
                title="Completed Modules"
                value={formatCount(summary?.completed_modules)}
                helper={`${formatCount(summary?.pending_modules)} assignments still incomplete`}
                icon={CheckCircle2}
              />
              <SummaryCard
                title="Completion Rate"
                value={formatPercent(summary?.completion_rate)}
                helper="Modules plus assessments completed"
                icon={Target}
              />
              <SummaryCard
                title="Avg Assessment Score"
                value={formatPercent(summary?.average_assessment_score)}
                helper={`${formatCount(summary?.completed_assessments)} completed submissions`}
                icon={ClipboardList}
              />
              <SummaryCard
                title="Avg Exercise Score"
                value={formatPercent(summary?.average_exercise_score)}
                helper="Performance inside trainer-authored module exercises"
                icon={Gauge}
              />
              <SummaryCard
                title="Pass Rate"
                value={formatPercent(summary?.pass_rate)}
                helper="Completed items meeting the passing threshold across all tracked learning"
                icon={GraduationCap}
              />
              <SummaryCard
                title="Attempts"
                value={formatCount(summary?.total_attempts)}
                helper="Attempts recorded across modules, assessments, and Call Simulation"
                icon={Activity}
              />
              <SummaryCard
                title="Assigned Call Sim"
                value={formatCount(summary?.assigned_call_simulation_records)}
                helper={`${formatCount(summary?.completed_call_simulations)} completed | ${formatCount(summary?.pending_call_simulations)} incomplete`}
                icon={Mic}
              />
              <SummaryCard
                title="Avg Call Sim Score"
                value={formatPercent(summary?.average_call_simulation_score)}
                helper={`${formatPercent(summary?.call_simulation_pass_rate)} pass rate across completed mock calls`}
                icon={Mic}
              />
              <SummaryCard
                title="Coaching Completion"
                value={formatPercent(summary?.coaching_completion_rate)}
                helper={`${formatCount(summary?.published_coaching_logs)} published coaching logs in scope`}
                icon={MessageSquare}
              />
              <SummaryCard
                title="Open Coaching"
                value={formatCount(summary?.pending_coaching_logs)}
                helper={`${formatCount(summary?.acknowledged_coaching_logs)} already acknowledged by trainees`}
                icon={MessageSquare}
              />
            </div>

            <ReportNavigation
              title="Report Navigation"
              description="Jump to batch, trainee, module/category, and detailed result views using live analytics for the selected trainer scope."
              items={reportNavigationItems}
              activeValue={activeTab}
              onChange={setActiveTab}
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="flex h-auto flex-wrap gap-2 rounded-2xl bg-slate-100 p-2">
                <TabsTrigger value="overview" className="rounded-xl">Overview</TabsTrigger>
                <TabsTrigger value="batches" className="rounded-xl">Batch Report</TabsTrigger>
                <TabsTrigger value="trainees" className="rounded-xl">Trainee Report</TabsTrigger>
                <TabsTrigger value="learning" className="rounded-xl">Modules & Categories</TabsTrigger>
                <TabsTrigger value="results" className="rounded-xl">Results & Coaching</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>AI Analysis</CardTitle>
                    <CardDescription>
                      Professional AI-style explanation generated from real module completion, exercise outcomes,
                      assessment results, assigned Call Simulation work, and coaching follow-up.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AiInsightBoard
                      headline={data?.ai_analysis.headline}
                      sections={trainerAiSections}
                    />
                  </CardContent>
                </Card>

                <div className="grid gap-6">
                  <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Batch Performance Comparison</CardTitle>
                    <CardDescription>
                      Overall learning score and completion rate by batch for the current trainer scope.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {batchRows.length ? (
                      <div className="chart-scroll-shell">
                        <div className="chart-scroll-inner h-[320px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={batchRows} margin={{ top: 28, right: 12, left: 0, bottom: 56 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="batch_label" interval={0} angle={-14} textAnchor="end" height={70} />
                              <YAxis domain={[0, 100]} />
                              <Tooltip />
                              <Bar dataKey="overall_score" fill="#1d4ed8" radius={[8, 8, 0, 0]} name="Overall Score">
                                <ChartPercentLabelList />
                              </Bar>
                              <Bar dataKey="completion_rate" fill="#0f766e" radius={[8, 8, 0, 0]} name="Completion Rate">
                                <ChartPercentLabelList />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : (
                      <SectionEmpty message="Batch comparison will appear once trainer-assigned learning is active." />
                    )}
                  </CardContent>
                </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Recent Trainee Activity</CardTitle>
                    <CardDescription>
                      Latest module, assessment, Call Simulation, and coaching events connected to trainer-created and
                      trainer-assigned learning.
                    </CardDescription>
                  </CardHeader>
                    <CardContent className="space-y-3">
                      {recentRows.length ? (
                        recentRows.slice(0, 8).map((row) => (
                          <div key={row.id} className="rounded-2xl border bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-950">{row.title}</div>
                                <div className="mt-1 text-sm text-slate-600">{row.detail}</div>
                                <div className="mt-2 text-xs text-slate-500">
                                  {row.trainee_name || 'Trainee'} | {row.batch_label || 'Direct assignment'} | {formatDateTime(row.activity_at)}
                                </div>
                              </div>
                              <Badge variant="outline" className="border-slate-300 text-slate-700">
                                {row.status?.replace(/_/g, ' ') || row.activity_type.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <SectionEmpty message="No recent trainee activity has been recorded for this report selection yet." />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Opportunities For Improvement</CardTitle>
                      <CardDescription>
                        The lowest-performing modules, assessment areas, and trainees in the current report scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {weakestModules.slice(0, 2).map((row) => (
                        <div key={row.module_id} className="rounded-2xl border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-950">{row.module_title}</div>
                              <div className="mt-1 text-xs text-slate-500">Module improvement priority</div>
                            </div>
                            <Badge variant="outline" className="border-amber-300 text-amber-700">
                              {formatPercent(row.average_score)}
                            </Badge>
                          </div>
                          <div className="mt-3 text-sm text-slate-600">
                            Completion {formatPercent(row.completion_rate)} | Pass rate {formatPercent(row.pass_rate)}
                          </div>
                        </div>
                      ))}

                      {weakestAreas.slice(0, 2).map((row) => (
                        <div key={row.category_name} className="rounded-2xl border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-950">{row.category_name}</div>
                              <div className="mt-1 text-xs text-slate-500">Assessment weakness</div>
                            </div>
                            <Badge variant="outline" className="border-rose-300 text-rose-700">
                              {formatPercent(row.average_score)}
                            </Badge>
                          </div>
                          <div className="mt-3 text-sm text-slate-600">
                            Pass rate {formatPercent(row.pass_rate)} | {formatCount(row.completed_count)} completed results
                          </div>
                        </div>
                      ))}

                      {improvementRows.slice(0, 2).map((row) => (
                        <div key={row.trainee_id} className="rounded-2xl border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-950">{row.trainee_name}</div>
                              <div className="mt-1 text-xs text-slate-500">{row.batch_label}</div>
                            </div>
                            <Badge variant="secondary">Needs focus</Badge>
                          </div>
                          <div className="mt-3 text-sm text-slate-600">
                            Overall score {formatPercent(row.overall_score)} | Completion {formatPercent(row.completion_rate)}
                          </div>
                        </div>
                      ))}

                      {!weakestModules.length && !weakestAreas.length && !improvementRows.length ? (
                        <SectionEmpty message="No current improvement flags are available for the selected report scope." />
                      ) : null}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Call Simulation Scenario Performance</CardTitle>
                      <CardDescription>
                        Average score and pass rate by assigned scenario for the current report scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {callSimulationRows.length ? (
                        <div className="chart-scroll-shell">
                          <div className="chart-scroll-inner h-[340px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={callSimulationRows.slice(0, 8)} margin={{ top: 28, right: 12, left: 0, bottom: 76 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="scenario_title" interval={0} angle={-18} textAnchor="end" height={96} />
                                <YAxis domain={[0, 100]} />
                                <Tooltip />
                                <Bar dataKey="average_score" fill="#6d28d9" radius={[8, 8, 0, 0]} name="Average Score">
                                  <ChartPercentLabelList />
                                </Bar>
                                <Bar dataKey="pass_rate" fill="#0f766e" radius={[8, 8, 0, 0]} name="Pass Rate">
                                  <ChartPercentLabelList />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ) : (
                        <SectionEmpty message="Call Simulation scenario analytics will appear once trainees complete assigned mock calls." />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Call KPI and Coaching Snapshot</CardTitle>
                      <CardDescription>
                        KPI averages and coaching follow-up notes generated from saved trainer-scoped mock-call results.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {callSimulationKpis.length ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {callSimulationKpis.slice(0, 6).map((metric) => (
                            <div key={metric.metric} className="rounded-2xl border bg-slate-50 px-4 py-4">
                              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{metric.metric}</div>
                              <div className="mt-2 text-xl font-semibold text-slate-950">
                                {formatMetricValue(metric.value, metric.unit)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <SectionEmpty message="KPI averages will appear after trainees complete scored Call Simulation attempts." />
                      )}

                      {(coachingSummary?.published_logs || 0) > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border bg-slate-50 px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Published</div>
                            <div className="mt-2 text-xl font-semibold text-slate-950">{formatCount(coachingSummary?.published_logs)}</div>
                          </div>
                          <div className="rounded-2xl border bg-slate-50 px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Pending Ack</div>
                            <div className="mt-2 text-xl font-semibold text-amber-700">{formatCount(coachingSummary?.pending_logs)}</div>
                          </div>
                          <div className="rounded-2xl border bg-slate-50 px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Retake Coaching</div>
                            <div className="mt-2 text-xl font-semibold text-rose-700">{formatCount(coachingSummary?.retake_required_logs)}</div>
                          </div>
                        </div>
                      ) : null}

                      {coachingNotes.length ? (
                        <div className="space-y-3">
                          {coachingNotes.slice(0, 4).map((note) => (
                            <div key={note.id} className="rounded-2xl border p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-slate-950">{note.scenario_title}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {note.trainee_name || 'Trainee'} | {note.trainer_name || 'Trainer'}
                                  </div>
                                </div>
                                <Badge variant="outline" className="border-slate-300 text-slate-700">
                                  {note.status.replace(/_/g, ' ')}
                                </Badge>
                              </div>
                              <div className="mt-3 text-sm text-slate-600">{note.feedback_summary}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <SectionEmpty message="Coaching notes will appear here after trainers publish feedback for completed mock calls." />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="batches" className="space-y-6">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Batch Summary</CardTitle>
                    <CardDescription>
                      Compare assigned learning volume, completion, pass rate, and average scores across batches.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {batchRows.length ? (
                      batchRows.map((row) => (
                        <div key={row.batch_id} className="rounded-2xl border p-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <div className="font-semibold text-slate-950">{row.batch_label}</div>
                              <div className="mt-1 text-sm text-slate-500">
                                {formatCount(row.trainee_count)} trainees | {formatCount(row.assigned_items)} assigned items | {formatCount(row.total_attempts)} attempts
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-4">
                              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                                <div className="text-slate-500">Completed</div>
                                <div className="mt-1 font-semibold text-slate-950">{formatCount(row.completed_items)}</div>
                              </div>
                              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                                <div className="text-slate-500">Completion</div>
                                <div className="mt-1 font-semibold text-slate-950">{formatPercent(row.completion_rate)}</div>
                              </div>
                              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                                <div className="text-slate-500">Pass Rate</div>
                                <div className="mt-1 font-semibold text-slate-950">{formatPercent(row.pass_rate)}</div>
                              </div>
                              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                                <div className="text-slate-500">Overall Score</div>
                                <div className="mt-1 font-semibold text-slate-950">{formatPercent(row.overall_score)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <SectionEmpty message="No batch summary is available for the current selection." />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="trainees" className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Trainee Performance Ranking</CardTitle>
                      <CardDescription>
                        Ranking by overall score, completion rate, and pass rate using real trainer-scoped results only.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {traineeRows.length ? (
                        traineeRows.map((row, index) => (
                          <div key={row.trainee_id} className="rounded-2xl border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-950">{index + 1}. {row.trainee_name}</div>
                                <div className="mt-1 text-sm text-slate-500">{row.batch_label}</div>
                              </div>
                              <Badge variant="outline" className="border-slate-300 text-slate-700">
                                {formatPercent(row.overall_score)}
                              </Badge>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                              <div>Completion: {formatPercent(row.completion_rate)}</div>
                              <div>Pass rate: {formatPercent(row.pass_rate)}</div>
                              <div>Attempts: {formatCount(row.total_attempts)}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <SectionEmpty message="No trainee ranking is available for the current filter selection." />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Trainees Needing Improvement</CardTitle>
                      <CardDescription>
                        Trainees with weaker completion, lower pass rate, or lower overall performance in this report scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {improvementRows.length ? (
                        improvementRows.map((row) => (
                          <div key={row.trainee_id} className="rounded-2xl border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-950">{row.trainee_name}</div>
                                <div className="mt-1 text-sm text-slate-500">{row.batch_label}</div>
                              </div>
                              <TrendingDown className="size-5 text-amber-600" />
                            </div>
                            <div className="mt-3 space-y-2 text-sm text-slate-600">
                              <div className="flex justify-between">
                                <span>Overall score</span>
                                <span>{formatPercent(row.overall_score)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Completion rate</span>
                                <span>{formatPercent(row.completion_rate)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Pass rate</span>
                                <span>{formatPercent(row.pass_rate)}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <SectionEmpty message="No trainee is currently flagged for improvement in this scope." />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="learning" className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-2">
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Microlearning Progress</CardTitle>
                      <CardDescription>
                        Completion rate and average score for the trainer-created modules in the selected scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {moduleRows.length ? (
                        <div className="chart-scroll-shell">
                          <div className="chart-scroll-inner h-[340px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={moduleRows} margin={{ top: 28, right: 16, left: 0, bottom: 80 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="module_title" interval={0} angle={-18} textAnchor="end" height={96} />
                                <YAxis domain={[0, 100]} />
                                <Tooltip />
                                <Line type="monotone" dataKey="completion_rate" stroke="#0f766e" strokeWidth={3} name="Completion Rate">
                                  <ChartPercentLabelList position="top" />
                                </Line>
                                <Line type="monotone" dataKey="average_score" stroke="#2563eb" strokeWidth={2} name="Average Score">
                                  <ChartPercentLabelList position="bottom" />
                                </Line>
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ) : (
                        <SectionEmpty message="Module progress will appear after trainees start trainer-assigned modules." />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Assessment Category Breakdown</CardTitle>
                      <CardDescription>
                        Low-scoring assessment categories for the selected batch, trainee, or module scope.
                      </CardDescription>
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
                        <SectionEmpty message="No assessment-area breakdown is available yet for this selection." />
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-3">
                  <Card className="border-slate-200 shadow-sm xl:col-span-1">
                    <CardHeader>
                      <CardTitle>Microlearning Module Breakdown</CardTitle>
                      <CardDescription>
                        Completion and score summary per trainer-created module.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {moduleRows.length ? (
                        moduleRows.slice(0, 8).map((row) => (
                          <div key={row.module_id} className="rounded-2xl border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-950">{row.module_title}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {row.topic_category_name || row.module_type || 'Module'}
                                </div>
                              </div>
                              <Badge variant="outline" className="border-slate-300 text-slate-700">
                                {formatPercent(row.average_score)}
                              </Badge>
                            </div>
                            <div className="mt-3 space-y-2 text-sm text-slate-600">
                              <div className="flex justify-between">
                                <span>Completion</span>
                                <span>{formatPercent(row.completion_rate)}</span>
                              </div>
                              <Progress value={row.completion_rate} />
                            </div>
                          </div>
                        ))
                      ) : (
                        <SectionEmpty message="No module performance rows are available yet." />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm xl:col-span-1">
                    <CardHeader>
                      <CardTitle>Weakest Modules</CardTitle>
                      <CardDescription>
                        Modules currently underperforming on completion or score.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {weakestModules.length ? (
                        weakestModules.map((row) => (
                          <div key={row.module_id} className="rounded-2xl border p-4">
                            <div className="font-semibold text-slate-950">{row.module_title}</div>
                            <div className="mt-3 grid gap-2 text-sm text-slate-600">
                              <div className="flex justify-between">
                                <span>Completion</span>
                                <span>{formatPercent(row.completion_rate)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Pass rate</span>
                                <span>{formatPercent(row.pass_rate)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Average score</span>
                                <span>{formatPercent(row.average_score)}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <SectionEmpty message="No weak-module pattern has appeared yet." />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm xl:col-span-1">
                    <CardHeader>
                      <CardTitle>Microlearning Exercise Breakdown</CardTitle>
                      <CardDescription>
                        Exercise results based on actual trainee attempts inside trainer-authored modules.
                      </CardDescription>
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
                        <SectionEmpty message="Exercise analytics will appear after trainees begin practice work." />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="results" className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-2">
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Microlearning Assignment Results</CardTitle>
                      <CardDescription>
                        Live progress status for trainer-assigned modules in the selected report scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {assignmentRows.length ? (
                        assignmentRows.slice(0, 12).map((row) => (
                          <div key={row.id} className="rounded-2xl border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-950">{row.module_title}</div>
                                <div className="mt-1 text-sm text-slate-500">
                                  {row.trainee_name || 'Trainee'} | {row.batch_label}
                                </div>
                              </div>
                              <Badge variant={row.is_passed ? 'default' : 'outline'}>
                                {row.status.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            <div className="mt-3 space-y-2">
                              <div className="flex items-center justify-between text-xs text-slate-500">
                                <span>Completion</span>
                                <span>{Math.round(row.completion_percentage || 0)}%</span>
                              </div>
                              <Progress value={row.completion_percentage || 0} />
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                              <div>Avg score: {formatPercent(row.average_score)}</div>
                              <div>Attempts: {formatCount(row.attempt_number)}</div>
                              <div>Completed exercises: {formatCount(row.completed_exercises)}/{formatCount(row.exercise_count)}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <SectionEmpty message="No module assignment results are available for this scope." />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Assessment Breakdown</CardTitle>
                      <CardDescription>
                        Pass/fail status, attempts, and scores for trainer-assigned assessments.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {assessmentRows.length ? (
                        assessmentRows.slice(0, 12).map((row) => {
                          const badge = getAssessmentBadge(row)

                          return (
                            <div key={row.id} className="rounded-2xl border p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-slate-950">{row.assessment_title}</div>
                                  <div className="mt-1 text-sm text-slate-500">
                                    {row.trainee_name} | {row.batch_label}
                                  </div>
                                </div>
                                <Badge variant={badge.variant}>{badge.label}</Badge>
                              </div>
                              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                                <div>Category: {row.category_name}</div>
                                <div>Score: {formatPercent(row.score_percentage)}</div>
                                <div>Attempts: {formatCount(row.attempt_count)}</div>
                                <div>Submitted: {formatDateTime(row.submitted_at)}</div>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <SectionEmpty message="No assessment results are available for the current scope." />
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Call Simulation Breakdown</CardTitle>
                      <CardDescription>
                        Latest mock-call results, pass status, attempts, and coaching state for this report scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {callSimulationResultRows.length ? (
                        callSimulationResultRows.slice(0, 10).map((row) => (
                          <div key={row.id} className="rounded-2xl border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-950">{row.scenario_title}</div>
                                <div className="mt-1 text-sm text-slate-500">
                                  {row.trainee_name || 'Trainee'} | {row.batch_label}
                                </div>
                              </div>
                              <Badge variant={row.is_passed ? 'success' : row.completion_status === 'in_progress' ? 'warning' : 'outline'}>
                                {row.status.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                              <div>Score: {formatPercent(row.score_value)}</div>
                              <div>Attempts: {formatCount(row.attempt_count)}</div>
                              <div>Completed: {formatDateTime(row.completed_at || row.activity_at)}</div>
                              <div>Coaching: {(row.coaching_status || 'not logged').replace(/_/g, ' ')}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <SectionEmpty message="No Call Simulation result rows are available for this scope." />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Coaching Follow-Up Notes</CardTitle>
                      <CardDescription>
                        Published coaching feedback linked to saved mock-call results in the current report scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {coachingNotes.length ? (
                        coachingNotes.slice(0, 8).map((note) => (
                          <div key={note.id} className="rounded-2xl border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-950">{note.scenario_title}</div>
                                <div className="mt-1 text-sm text-slate-500">
                                  {note.trainee_name || 'Trainee'} | {note.trainer_name || 'Trainer'}
                                </div>
                              </div>
                              <Badge variant="outline" className="border-slate-300 text-slate-700">
                                {note.competency_status.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            <div className="mt-3 text-sm text-slate-600">{note.feedback_summary}</div>
                            <div className="mt-3 text-xs text-slate-500">
                              Recommended next action: {note.action_plan}
                            </div>
                          </div>
                        ))
                      ) : (
                        <SectionEmpty message="No coaching notes are available for the current report scope." />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
