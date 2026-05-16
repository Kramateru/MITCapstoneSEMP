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
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { ChartCountLabelList, ChartPercentLabelList } from '@/app/components/ui/chart-data-labels'
import { Progress } from '@/app/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { TrainerLearningFilterBar } from '@/app/components/trainer/trainer-learning-filter-bar'
import {
  buildTrainerLearningInsightsPdfUrl,
  buildTrainerLearningInsightsUrl,
  EMPTY_TRAINER_LEARNING_FILTERS,
  type TrainerLearningFilterState,
  type TrainerLearningInsightsResponse,
} from '@/app/lib/trainer-learning-insights'
import { trainerSidebarItems } from '@/app/trainer/nav'
import { apiFetch, downloadApiFile } from '@/app/utils/api'

const AUTO_REFRESH_MS = 60_000
const SCORE_DISTRIBUTION_COLORS = ['#e2e8f0', '#cbd5e1', '#93c5fd', '#60a5fa', '#2563eb']

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
  const [data, setData] = useState<TrainerLearningInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadNotice, setDownloadNotice] = useState<{ tone: 'warning' | 'error'; message: string } | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadReports('auto')
    }, AUTO_REFRESH_MS)

    return () => window.clearInterval(timer)
  }, [loadReports])

  const summary = data?.summary
  const hasTrainerData = Boolean(
    (summary?.assigned_module_records || 0) > 0
      || (summary?.assigned_assessment_records || 0) > 0,
  )
  const scopeLabel = data?.scope.label || 'Trainer scope'

  const batchRows = useMemo(() => data?.batch_comparison || [], [data?.batch_comparison])
  const traineeRows = useMemo(() => data?.trainee_ranking || [], [data?.trainee_ranking])
  const moduleRows = useMemo(() => data?.module_progress || [], [data?.module_progress])
  const exerciseRows = useMemo(() => data?.exercise_performance || [], [data?.exercise_performance])
  const assessmentRows = useMemo(() => data?.assessment_results || [], [data?.assessment_results])
  const assignmentRows = useMemo(() => data?.module_assignments || [], [data?.module_assignments])
  const recentRows = useMemo(() => data?.recent_activity || [], [data?.recent_activity])
  const improvementRows = useMemo(
    () => data?.trainees_needing_improvement || [],
    [data?.trainees_needing_improvement],
  )
  const weakestModules = useMemo(() => data?.weakest_modules || [], [data?.weakest_modules])
  const weakestAreas = useMemo(
    () => data?.weakest_assessment_areas || [],
    [data?.weakest_assessment_areas],
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
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="text-muted-foreground">
              Database-driven batch and trainee reporting based only on trainer-created modules,
              trainer-assigned learning, and saved trainee results.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDownloadPdf()}
              disabled={downloadingPdf}
              className="rounded-full"
            >
              {downloadingPdf ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              Download PDF Report
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => void loadReports('refresh')}
              disabled={loading || refreshing || downloadingPdf}
              className="rounded-full"
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
                Reports will appear after this trainer assigns modules or assessments and trainees begin
                generating real completion, exercise, or assessment results.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                helper={`${formatCount(summary?.pending_modules)} assignments still pending`}
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
                helper={`${formatCount(summary?.passed_assessments)} assessment passes tracked`}
                icon={GraduationCap}
              />
              <SummaryCard
                title="Attempts"
                value={formatCount(summary?.total_attempts)}
                helper={`${formatCount(summary?.assigned_assessment_records)} assigned assessment records in scope`}
                icon={Activity}
              />
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="flex h-auto flex-wrap gap-2 rounded-2xl bg-slate-100 p-2">
                <TabsTrigger value="overview" className="rounded-xl">Overview</TabsTrigger>
                <TabsTrigger value="batches" className="rounded-xl">Batch Summary</TabsTrigger>
                <TabsTrigger value="trainees" className="rounded-xl">Trainee Summary</TabsTrigger>
                <TabsTrigger value="learning" className="rounded-xl">Learning Performance</TabsTrigger>
                <TabsTrigger value="results" className="rounded-xl">Detailed Results</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>AI Analysis</CardTitle>
                    <CardDescription>
                      Professional notes generated from real module completion, exercise outcomes, and assessment results.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
                      {data?.ai_analysis.headline}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                      <div className="rounded-2xl border bg-white p-4">
                        <div className="text-sm font-semibold text-slate-950">Strengths</div>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                          {(data?.ai_analysis.strengths || []).map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border bg-white p-4">
                        <div className="text-sm font-semibold text-slate-950">Weak Areas</div>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                          {(data?.ai_analysis.weak_areas || []).map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border bg-white p-4">
                        <div className="text-sm font-semibold text-slate-950">Recommended Action Plan</div>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                          {(data?.ai_analysis.recommended_actions || []).map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Batch Performance Comparison</CardTitle>
                      <CardDescription>
                        Overall learning score and completion rate by batch for the current trainer scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {batchRows.length ? (
                        <ResponsiveContainer width="100%" height={320}>
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
                      ) : (
                        <SectionEmpty message="Batch comparison will appear once trainer-assigned learning is active." />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Score Distribution</CardTitle>
                      <CardDescription>
                        Combined spread of saved exercise and assessment scores in the selected report scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(data?.score_distribution || []).some((row) => row.count > 0) ? (
                        <ResponsiveContainer width="100%" height={320}>
                          <BarChart data={data?.score_distribution || []} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="range_label" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]} name="Results">
                              <ChartCountLabelList />
                              {(data?.score_distribution || []).map((row, index) => (
                                <Cell key={row.range_label} fill={SCORE_DISTRIBUTION_COLORS[index % SCORE_DISTRIBUTION_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <SectionEmpty message="Score distribution will populate once trainees complete exercises or assessments." />
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Recent Trainee Activity</CardTitle>
                      <CardDescription>
                        Latest module and assessment events connected to trainer-created and trainer-assigned learning.
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
                      <CardTitle>Module Progress Chart</CardTitle>
                      <CardDescription>
                        Completion rate and average score for the trainer-created modules in the selected scope.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {moduleRows.length ? (
                        <ResponsiveContainer width="100%" height={340}>
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
                      ) : (
                        <SectionEmpty message="Module progress will appear after trainees start trainer-assigned modules." />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle>Weakest Assessment Areas</CardTitle>
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
                      <CardTitle>Module Performance</CardTitle>
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
                      <CardTitle>Exercise Performance Summary</CardTitle>
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
                      <CardTitle>Module Assignment Results</CardTitle>
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
                      <CardTitle>Assessment Results</CardTitle>
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
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
