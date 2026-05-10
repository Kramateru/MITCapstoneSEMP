'use client'

import Link from 'next/link'
import {
  BookOpen,
  ClipboardList,
  Download,
  FileBarChart,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { AdminLearningFilterBar } from '@/app/components/admin/admin-learning-filter-bar'
import {
  buildAdminLearningInsightsPdfUrl,
  buildAdminLearningInsightsUrl,
  EMPTY_ADMIN_LEARNING_FILTERS,
  type AdminLearningFilterState,
  type AdminLearningInsightsResponse,
} from '@/app/lib/admin-learning-insights'
import { apiFetch, downloadApiFile } from '@/app/utils/api'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Progress } from '../ui/progress'
import { ScrollArea } from '../ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'

const AUTO_REFRESH_MS = 75_000

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
    : 'Unable to load the admin reports right now.'
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

function statusLabel(value?: string | null) {
  return (value || 'pending').replace(/_/g, ' ')
}

function performanceBadgeClass(level?: string | null) {
  switch (level) {
    case 'excellent':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'healthy':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'developing':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'at_risk':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

function statusBadgeClass(status?: string | null) {
  switch (status) {
    case 'completed':
    case 'certified':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'in_progress':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

function SectionEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function TableEmpty({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
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

function AnalysisColumn({
  title,
  rows,
}: {
  title: string
  rows: string[]
}) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {rows.length ? rows.map((row) => <p key={row}>{row}</p>) : <p>No insight available yet.</p>}
      </div>
    </div>
  )
}

function ScopeBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
      {label}
    </Badge>
  )
}

export function AdminLearningReportWorkspace() {
  const [filters, setFilters] = useState<AdminLearningFilterState>(EMPTY_ADMIN_LEARNING_FILTERS)
  const [data, setData] = useState<AdminLearningInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadNotice, setDownloadNotice] = useState<{ tone: 'warning' | 'error'; message: string } | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const requestUrl = useMemo(() => buildAdminLearningInsightsUrl(filters), [filters])
  const pdfUrl = useMemo(() => buildAdminLearningInsightsPdfUrl(filters), [filters])

  const loadReport = useCallback(
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
    void loadReport('initial')
  }, [loadReport])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadReport('auto')
    }, AUTO_REFRESH_MS)

    return () => window.clearInterval(timer)
  }, [loadReport])

  const summary = data?.summary
  const hasLearningData = Boolean(
    (summary?.assigned_module_records || 0) > 0
      || (summary?.assigned_assessment_records || 0) > 0,
  )

  const handleDownloadPdf = useCallback(async () => {
    setDownloadNotice(null)

    if (!hasLearningData) {
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
        `Admin_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
      )
    } catch (downloadError) {
      setDownloadNotice({
        tone: 'error',
        message: getErrorMessage(downloadError),
      })
    } finally {
      setDownloadingPdf(false)
    }
  }, [hasLearningData, pdfUrl])

  const trainerRows = useMemo(() => data?.trainer_comparison || [], [data?.trainer_comparison])
  const batchRows = useMemo(() => data?.batch_comparison || [], [data?.batch_comparison])
  const traineeRows = useMemo(() => data?.trainee_ranking || [], [data?.trainee_ranking])
  const moduleRows = useMemo(() => data?.module_progress || [], [data?.module_progress])
  const assessmentRows = useMemo(() => data?.assessment_performance || [], [data?.assessment_performance])
  const exerciseRows = useMemo(() => data?.exercise_performance || [], [data?.exercise_performance])
  const weakestModules = useMemo(() => data?.weakest_modules || [], [data?.weakest_modules])
  const weakestAreas = useMemo(() => data?.weakest_assessment_areas || [], [data?.weakest_assessment_areas])
  const improvementRows = useMemo(
    () => data?.trainees_needing_improvement || [],
    [data?.trainees_needing_improvement],
  )
  const recentActivityRows = useMemo(() => data?.recent_activity || [], [data?.recent_activity])
  const moduleAssignmentRows = useMemo(() => data?.module_assignments || [], [data?.module_assignments])
  const assessmentResultRows = useMemo(() => data?.assessment_results || [], [data?.assessment_results])

  const scopeBadges = useMemo(() => {
    if (!data?.scope) {
      return [] as string[]
    }

    const badges: string[] = []
    if (data.scope.trainer_id) badges.push('Trainer scoped')
    if (data.scope.batch_id) badges.push('Batch scoped')
    if (data.scope.trainee_id) badges.push('Trainee scoped')
    if (data.scope.module_id) badges.push('Module scoped')
    if (data.scope.assessment_id) badges.push('Assessment scoped')
    if (data.scope.exercise_id) badges.push('Exercise scoped')
    if (data.scope.completion_status) {
      badges.push(`Status: ${statusLabel(data.scope.completion_status)}`)
    }
    if (data.scope.performance_level) {
      badges.push(`Performance: ${performanceLabel(data.scope.performance_level)}`)
    }
    if (data.scope.start_date || data.scope.end_date) {
      badges.push(
        `Date range: ${data.scope.start_date || 'Start'} to ${data.scope.end_date || 'Today'}`,
      )
    }

    return badges
  }, [data?.scope])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Reports</h1>
          <p className="text-sm text-muted-foreground">
            Report-ready analytics sourced only from saved trainer modules, trainee exercise outcomes,
            assessment submissions, batch memberships, and certificate records in the database.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/analytics"
            className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <FileBarChart className="mr-2 size-4" />
            Open Analytics
          </Link>
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
            onClick={() => void loadReport('refresh')}
            disabled={loading || refreshing || downloadingPdf}
            className="rounded-full"
          >
            {refreshing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-sky-200 bg-sky-50 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-sky-950">Current Report Scope</div>
            <div className="mt-1 text-sm text-sky-900">{data?.scope.label || 'All Admin Learning Data'}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {scopeBadges.length ? (
                scopeBadges.map((badge) => <ScopeBadge key={badge} label={badge} />)
              ) : (
                <ScopeBadge label="All admin learning data" />
              )}
            </div>
          </div>
          <div className="text-sm text-sky-900">Last synced: {formatDateTime(lastSyncedAt)}</div>
        </CardContent>
      </Card>

      <div className="print:hidden">
        <AdminLearningFilterBar value={filters} options={data?.filters || null} onChange={setFilters} />
      </div>

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
            Loading admin reports...
          </CardContent>
        </Card>
      ) : !hasLearningData ? (
        <Card className="border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No admin reports available yet</CardTitle>
            <CardDescription>
              Reports will populate after trainers assign modules or assessments and trainees start
              producing saved results.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Trainers in Scope"
              value={formatCount(summary?.total_trainers)}
              helper="Trainer records contributing to this report"
              icon={Users}
            />
            <SummaryCard
              title="Batches in Scope"
              value={formatCount(summary?.total_batches)}
              helper="Batch groups represented by the current filters"
              icon={TrendingUp}
            />
            <SummaryCard
              title="Trainees in Scope"
              value={formatCount(summary?.total_trainees)}
              helper="Trainee result sets included in this report"
              icon={Users}
            />
            <SummaryCard
              title="Overall Score"
              value={formatPercent(summary?.overall_score)}
              helper="Combined exercise and assessment average"
              icon={Target}
            />
            <SummaryCard
              title="Completion Rate"
              value={formatPercent(summary?.completion_rate)}
              helper="Completed modules and assessments across assigned items"
              icon={ShieldCheck}
            />
            <SummaryCard
              title="Pass Rate"
              value={formatPercent(summary?.pass_rate)}
              helper="Completed items meeting the passing threshold"
              icon={ClipboardList}
            />
            <SummaryCard
              title="Assigned Modules"
              value={formatCount(summary?.assigned_module_records)}
              helper={`${formatCount(summary?.completed_modules)} completed | ${formatCount(summary?.pending_modules)} pending`}
              icon={BookOpen}
            />
            <SummaryCard
              title="Assigned Assessments"
              value={formatCount(summary?.assigned_assessment_records)}
              helper={`${formatCount(summary?.completed_assessments)} completed | ${formatCount(summary?.pending_assessments)} pending`}
              icon={Sparkles}
            />
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="w-full justify-start overflow-x-auto rounded-2xl p-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="rankings">Rankings</TabsTrigger>
              <TabsTrigger value="modules">Modules</TabsTrigger>
              <TabsTrigger value="assessments">Assessments</TabsTrigger>
              <TabsTrigger value="results">Detailed Results</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Executive Summary</CardTitle>
                  <CardDescription>
                    AI-style reporting notes generated from the actual trainer, batch, module, assessment,
                    exercise, and trainee results in this scope.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
                    {data?.ai_analysis.overview}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-4">
                    <AnalysisColumn title="Trainer Effectiveness" rows={data?.ai_analysis.trainer_effectiveness || []} />
                    <AnalysisColumn title="Batch Performance" rows={data?.ai_analysis.batch_performance || []} />
                    <AnalysisColumn title="Weak Areas" rows={data?.ai_analysis.weak_areas || []} />
                    <AnalysisColumn title="Recommended Actions" rows={data?.ai_analysis.recommended_actions || []} />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Score Distribution</CardTitle>
                    <CardDescription>
                      Distribution of saved exercise and assessment scores under the current report scope.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(data?.score_distribution || []).some((row) => row.count > 0) ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={data?.score_distribution || []}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="range_label" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="count" fill="#2563eb" radius={[8, 8, 0, 0]} name="Results" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <SectionEmpty message="Score distribution will appear once scored results are available in this scope." />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Completion and Performance Mix</CardTitle>
                    <CardDescription>
                      Completion-state counts and performance-level mix for the currently scoped report.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-3">
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
                                (row.count / Math.max(
                                  (summary?.assigned_module_records || 0) + (summary?.assigned_assessment_records || 0),
                                  1,
                                )) * 100
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {(data?.performance_breakdown || []).some((row) => row.count > 0) ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={data?.performance_breakdown || []}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="count" fill="#334155" radius={[8, 8, 0, 0]} name="Results" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <SectionEmpty message="Performance distribution will appear when scored results exist in this scope." />
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Report Totals</CardTitle>
                  <CardDescription>
                    Core metrics that can be referenced directly inside management summaries and reviews.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Trainer-created Modules</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{formatCount(summary?.trainer_created_modules)}</div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Certificates Issued</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{formatCount(summary?.certificates_issued)}</div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Average Assessment</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{formatPercent(summary?.average_assessment_score)}</div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Average Exercise</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{formatPercent(summary?.average_exercise_score)}</div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rankings" className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Trainer Comparison</CardTitle>
                    <CardDescription>Completion, pass, and score results by trainer in the current scope.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[420px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Trainer</TableHead>
                            <TableHead>Trainees</TableHead>
                            <TableHead>Batches</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Completion</TableHead>
                            <TableHead>Pass</TableHead>
                            <TableHead>Overall</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trainerRows.length ? (
                            trainerRows.map((row) => (
                              <TableRow key={row.trainer_id}>
                                <TableCell>
                                  <div className="font-medium text-slate-950">{row.trainer_name}</div>
                                  <div className="text-xs text-slate-500">{performanceLabel(row.performance_level)}</div>
                                </TableCell>
                                <TableCell>{formatCount(row.trainee_count)}</TableCell>
                                <TableCell>{formatCount(row.batch_count)}</TableCell>
                                <TableCell>{formatCount(row.assigned_items)}</TableCell>
                                <TableCell>{formatPercent(row.completion_rate)}</TableCell>
                                <TableCell>{formatPercent(row.pass_rate)}</TableCell>
                                <TableCell>
                                  <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
                                    {formatPercent(row.overall_score)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableEmpty colSpan={7} message="No trainer rows are available for this report scope." />
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Batch Comparison</CardTitle>
                    <CardDescription>Batch-level learning performance inside the current scope.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[420px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Batch</TableHead>
                            <TableHead>Trainer</TableHead>
                            <TableHead>Trainees</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Completion</TableHead>
                            <TableHead>Pass</TableHead>
                            <TableHead>Overall</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {batchRows.length ? (
                            batchRows.map((row) => (
                              <TableRow key={row.batch_id}>
                                <TableCell>
                                  <div className="font-medium text-slate-950">{row.batch_label}</div>
                                </TableCell>
                                <TableCell>{row.trainer_name || 'Direct / mixed assignment'}</TableCell>
                                <TableCell>{formatCount(row.trainee_count)}</TableCell>
                                <TableCell>{formatCount(row.assigned_items)}</TableCell>
                                <TableCell>{formatPercent(row.completion_rate)}</TableCell>
                                <TableCell>{formatPercent(row.pass_rate)}</TableCell>
                                <TableCell>
                                  <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
                                    {formatPercent(row.overall_score)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableEmpty colSpan={7} message="No batch rows are available for this report scope." />
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Trainee Ranking</CardTitle>
                    <CardDescription>Ranked trainee performance across modules and assessments.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[440px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Trainee</TableHead>
                            <TableHead>Batch</TableHead>
                            <TableHead>Trainer</TableHead>
                            <TableHead>Overall</TableHead>
                            <TableHead>Completion</TableHead>
                            <TableHead>Pass</TableHead>
                            <TableHead>Latest Activity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {traineeRows.length ? (
                            traineeRows.map((row) => (
                              <TableRow key={row.trainee_id}>
                                <TableCell>
                                  <div className="font-medium text-slate-950">{row.trainee_name}</div>
                                  <div className="text-xs text-slate-500">
                                    {formatCount(row.module_completed)}/{formatCount(row.module_assigned)} modules completed
                                  </div>
                                </TableCell>
                                <TableCell>{row.batch_label}</TableCell>
                                <TableCell>{row.trainer_names.join(', ') || 'Unassigned trainer scope'}</TableCell>
                                <TableCell>
                                  <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
                                    {formatPercent(row.overall_score)}
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatPercent(row.completion_rate)}</TableCell>
                                <TableCell>{formatPercent(row.pass_rate)}</TableCell>
                                <TableCell>{formatDateTime(row.latest_activity_at)}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableEmpty colSpan={7} message="No trainee rankings are available for this report scope." />
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Improvement Priority List</CardTitle>
                    <CardDescription>Lowest-scoring or lowest-completion trainees requiring follow-up.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {improvementRows.length ? (
                      improvementRows.slice(0, 10).map((row) => (
                        <div key={row.trainee_id} className="rounded-2xl border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-950">{row.trainee_name}</div>
                              <div className="mt-1 text-sm text-slate-500">{row.batch_label}</div>
                            </div>
                            <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
                              {performanceLabel(row.performance_level)}
                            </Badge>
                          </div>
                          <div className="mt-3 grid gap-2 text-sm text-slate-600">
                            <div className="flex justify-between">
                              <span>Overall score</span>
                              <span>{formatPercent(row.overall_score)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Completion</span>
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
                      <SectionEmpty message="No trainee is currently flagged for priority improvement in this scope." />
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="modules" className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Module Progress Report</CardTitle>
                    <CardDescription>
                      Completion rate and average score by module across the current report scope.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {moduleRows.length ? (
                      <ResponsiveContainer width="100%" height={340}>
                        <LineChart data={moduleRows.slice(0, 10)} margin={{ top: 12, right: 16, left: 0, bottom: 84 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="module_title" interval={0} angle={-18} textAnchor="end" height={100} />
                          <YAxis domain={[0, 100]} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="completion_rate" stroke="#0f766e" strokeWidth={3} name="Completion Rate" />
                          <Line type="monotone" dataKey="average_score" stroke="#2563eb" strokeWidth={2} name="Average Score" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <SectionEmpty message="Module progress data will appear when trainer-owned module results exist in this scope." />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Weakest Modules</CardTitle>
                    <CardDescription>Modules currently underperforming on completion or average score.</CardDescription>
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
                            <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
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
                      <SectionEmpty message="Weak module patterns will appear after more module records are available." />
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Module Performance Table</CardTitle>
                    <CardDescription>Completion, pass rate, and average score per module.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[420px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Module</TableHead>
                            <TableHead>Trainer</TableHead>
                            <TableHead>Assigned</TableHead>
                            <TableHead>Completed</TableHead>
                            <TableHead>Completion</TableHead>
                            <TableHead>Pass</TableHead>
                            <TableHead>Average</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {moduleRows.length ? (
                            moduleRows.map((row) => (
                              <TableRow key={row.module_id}>
                                <TableCell>
                                  <div className="font-medium text-slate-950">{row.module_title}</div>
                                  <div className="text-xs text-slate-500">
                                    {row.topic_category_name || row.module_type || 'Module'}
                                  </div>
                                </TableCell>
                                <TableCell>{row.created_by_name || 'Trainer-owned module'}</TableCell>
                                <TableCell>{formatCount(row.assigned_count)}</TableCell>
                                <TableCell>{formatCount(row.completed_count)}</TableCell>
                                <TableCell>{formatPercent(row.completion_rate)}</TableCell>
                                <TableCell>{formatPercent(row.pass_rate)}</TableCell>
                                <TableCell>
                                  <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
                                    {formatPercent(row.average_score)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableEmpty colSpan={7} message="No module performance rows are available for this report scope." />
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Exercise Performance Table</CardTitle>
                    <CardDescription>Exercise-level detail from module attempt records.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[420px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Exercise</TableHead>
                            <TableHead>Module</TableHead>
                            <TableHead>Trainer</TableHead>
                            <TableHead>Assigned</TableHead>
                            <TableHead>Attempts</TableHead>
                            <TableHead>Completion</TableHead>
                            <TableHead>Average</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {exerciseRows.length ? (
                            exerciseRows.map((row) => (
                              <TableRow key={row.exercise_filter_id}>
                                <TableCell>
                                  <div className="font-medium text-slate-950">{row.exercise_title}</div>
                                  <div className="text-xs text-slate-500">{row.exercise_type}</div>
                                </TableCell>
                                <TableCell>{row.module_title}</TableCell>
                                <TableCell>{row.trainer_names.join(', ') || 'Trainer-owned module'}</TableCell>
                                <TableCell>{formatCount(row.assigned_count)}</TableCell>
                                <TableCell>{formatCount(row.attempt_count)}</TableCell>
                                <TableCell>{formatPercent(row.completion_rate)}</TableCell>
                                <TableCell>
                                  <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
                                    {formatPercent(row.average_score)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableEmpty colSpan={7} message="No exercise performance rows are available for this report scope." />
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="assessments" className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Assessment Performance Report</CardTitle>
                    <CardDescription>
                      Average score and pass rate per assessment in the current scope.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {assessmentRows.length ? (
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={assessmentRows.slice(0, 10)} margin={{ top: 12, right: 10, left: 0, bottom: 84 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="assessment_title" interval={0} angle={-18} textAnchor="end" height={100} />
                          <YAxis domain={[0, 100]} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="average_score" fill="#7c3aed" radius={[8, 8, 0, 0]} name="Average Score" />
                          <Bar dataKey="pass_rate" fill="#2563eb" radius={[8, 8, 0, 0]} name="Pass Rate" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <SectionEmpty message="Assessment performance data will appear once scoped submissions exist." />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Weakest Assessment Areas</CardTitle>
                    <CardDescription>Assessment categories that need reinforcement or content review.</CardDescription>
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
                            <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
                              {formatPercent(row.average_score)}
                            </Badge>
                          </div>
                          <div className="mt-3 text-sm text-slate-600">Pass rate {formatPercent(row.pass_rate)}</div>
                        </div>
                      ))
                    ) : (
                      <SectionEmpty message="Weak assessment areas will appear when low-scoring categories are detected." />
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Assessment Performance Table</CardTitle>
                  <CardDescription>Assessment-level reporting for trainer, batch, and trainee review.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[440px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Assessment</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Trainer</TableHead>
                          <TableHead>Assigned</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Pass</TableHead>
                          <TableHead>Average</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assessmentRows.length ? (
                          assessmentRows.map((row) => (
                            <TableRow key={row.assessment_id}>
                              <TableCell>
                                <div className="font-medium text-slate-950">{row.assessment_title}</div>
                              </TableCell>
                              <TableCell>{row.category_name}</TableCell>
                              <TableCell>{row.assigned_by_name || 'Trainer assignment'}</TableCell>
                              <TableCell>{formatCount(row.assigned_count)}</TableCell>
                              <TableCell>{formatCount(row.completed_count)}</TableCell>
                              <TableCell>{formatPercent(row.pass_rate)}</TableCell>
                              <TableCell>
                                <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
                                  {formatPercent(row.average_score)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableEmpty colSpan={7} message="No assessment performance rows are available for this report scope." />
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="results" className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Module Assignment Results</CardTitle>
                    <CardDescription>Newest module assignment rows from the current report scope.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[440px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Trainee</TableHead>
                            <TableHead>Module</TableHead>
                            <TableHead>Batch</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Completion</TableHead>
                            <TableHead>Average</TableHead>
                            <TableHead>Attempts</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {moduleAssignmentRows.length ? (
                            moduleAssignmentRows.map((row) => (
                              <TableRow key={row.id}>
                                <TableCell>
                                  <div className="font-medium text-slate-950">{row.trainee_name || 'Trainee'}</div>
                                  <div className="text-xs text-slate-500">{row.assigned_by_name || 'Trainer assignment'}</div>
                                </TableCell>
                                <TableCell>{row.module_title}</TableCell>
                                <TableCell>{row.batch_label}</TableCell>
                                <TableCell>
                                  <Badge className={statusBadgeClass(row.status)} variant="outline">
                                    {statusLabel(row.status)}
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatPercent(row.completion_percentage)}</TableCell>
                                <TableCell>
                                  <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
                                    {formatPercent(row.score_value)}
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatCount(row.attempt_number)}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableEmpty colSpan={7} message="No module assignment rows are available for this report scope." />
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle>Assessment Result Rows</CardTitle>
                    <CardDescription>Newest assessment result rows from the current report scope.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[440px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Trainee</TableHead>
                            <TableHead>Assessment</TableHead>
                            <TableHead>Batch</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Score</TableHead>
                            <TableHead>Pass</TableHead>
                            <TableHead>Attempts</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {assessmentResultRows.length ? (
                            assessmentResultRows.map((row) => (
                              <TableRow key={row.id}>
                                <TableCell>
                                  <div className="font-medium text-slate-950">{row.trainee_name}</div>
                                  <div className="text-xs text-slate-500">{row.category_name}</div>
                                </TableCell>
                                <TableCell>{row.assessment_title}</TableCell>
                                <TableCell>{row.batch_label}</TableCell>
                                <TableCell>
                                  <Badge className={statusBadgeClass(row.completion_status)} variant="outline">
                                    {statusLabel(row.completion_status)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge className={performanceBadgeClass(row.performance_level)} variant="outline">
                                    {formatPercent(row.score_percentage)}
                                  </Badge>
                                </TableCell>
                                <TableCell>{row.is_passed ? 'Passed' : 'Pending / Failed'}</TableCell>
                                <TableCell>{formatCount(row.attempt_count)}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableEmpty colSpan={7} message="No assessment result rows are available for this report scope." />
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Recent Activity Log</CardTitle>
                  <CardDescription>
                    Latest module and assessment events contributing to the current report scope.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recentActivityRows.length ? (
                    recentActivityRows.map((row) => (
                      <div key={row.id} className="rounded-2xl border bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-950">{row.title}</div>
                            <div className="mt-1 text-sm text-slate-600">{row.detail}</div>
                            <div className="mt-2 text-xs text-slate-500">
                              {(row.trainer_name || 'Trainer scope')} | {(row.batch_label || 'Direct assignment')} | {formatDateTime(row.activity_at)}
                            </div>
                          </div>
                          <Badge className={statusBadgeClass(row.status)} variant="outline">
                            {statusLabel(row.status || row.activity_type)}
                          </Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <SectionEmpty message="No recent activity is available for this report scope." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
