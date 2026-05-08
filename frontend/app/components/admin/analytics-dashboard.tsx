'use client'

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Gauge,
  GraduationCap,
  Loader2,
  RefreshCw,
  Target,
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

import { AdminLearningFilterBar } from '@/app/components/admin/admin-learning-filter-bar'
import {
  buildAdminLearningInsightsUrl,
  EMPTY_ADMIN_LEARNING_FILTERS,
  type AdminLearningFilterState,
  type AdminLearningInsightsResponse,
} from '@/app/lib/admin-learning-insights'
import { apiFetch } from '@/app/utils/api'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Progress } from '../ui/progress'

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
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
        </div>
        <Badge variant="outline" className="border-slate-300 text-slate-700">
          {badge}
        </Badge>
      </div>
    </div>
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
      <div className="mt-3 space-y-2 text-sm text-slate-600">
        {rows.map((row) => (
          <p key={row}>{row}</p>
        ))}
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadAnalytics('auto')
    }, AUTO_REFRESH_MS)

    return () => window.clearInterval(timer)
  }, [loadAnalytics])

  const summary = data?.summary
  const hasLearningData = Boolean(
    (summary?.assigned_module_records || 0) > 0
      || (summary?.assigned_assessment_records || 0) > 0,
  )
  const scopeLabel = data?.scope.label || 'All Admin Learning Data'

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Admin Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Professional analytics built only from saved trainer-owned modules, assigned assessments,
            exercise attempts, trainee results, and batch-linked learning records.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void loadAnalytics('refresh')}
          disabled={loading || refreshing}
          className="rounded-full"
        >
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh Analytics
        </Button>
      </div>

      <Card className="border-sky-200 bg-sky-50 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-sky-900 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="font-semibold">Current Analytics Scope</div>
            <div className="mt-1 text-sky-800">{scopeLabel}</div>
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
              Analytics will populate after trainers assign modules or assessments and trainees start producing
              saved exercise or assessment results.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Active Trainers"
              value={formatCount(summary?.total_trainers)}
              helper="Trainers represented in the current analytics scope"
              icon={Users}
            />
            <SummaryCard
              title="Tracked Batches"
              value={formatCount(summary?.total_batches)}
              helper="Batches contributing learning results in this scope"
              icon={BarChart3}
            />
            <SummaryCard
              title="Tracked Trainees"
              value={formatCount(summary?.total_trainees)}
              helper="Trainees with scoped assignments or results"
              icon={Users}
            />
            <SummaryCard
              title="Overall Score"
              value={formatPercent(summary?.overall_score)}
              helper="Combined exercise and assessment result average"
              icon={Target}
            />
            <SummaryCard
              title="Completion Rate"
              value={formatPercent(summary?.completion_rate)}
              helper="Completed modules and assessments across assigned items"
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
              title="Avg Exercise"
              value={formatPercent(summary?.average_exercise_score)}
              helper={`${formatCount(summary?.completed_modules)} completed module outcomes`}
              icon={Gauge}
            />
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>AI Analysis</CardTitle>
              <CardDescription>
                Management-focused notes generated from real batch, trainer, module, assessment, and exercise outcomes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
                {data?.ai_analysis.overview}
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <AnalysisColumn title="Trainer Effectiveness" rows={data?.ai_analysis.trainer_effectiveness || []} />
                <AnalysisColumn title="Batch Performance" rows={data?.ai_analysis.batch_performance || []} />
                <AnalysisColumn title="Module and Assessment" rows={data?.ai_analysis.module_and_assessment || []} />
              </div>

              <div className="grid gap-4 xl:grid-cols-4">
                <AnalysisColumn title="Exercise Performance" rows={data?.ai_analysis.exercise_performance || []} />
                <AnalysisColumn title="Weak Areas" rows={data?.ai_analysis.weak_areas || []} />
                <AnalysisColumn title="Opportunities" rows={data?.ai_analysis.opportunities || []} />
                <AnalysisColumn title="Recommended Actions" rows={data?.ai_analysis.recommended_actions || []} />
              </div>
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
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={trainerRows.slice(0, 10)} margin={{ top: 12, right: 12, left: 0, bottom: 64 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="trainer_name" interval={0} angle={-18} textAnchor="end" height={84} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Bar dataKey="overall_score" fill="#1d4ed8" radius={[8, 8, 0, 0]} name="Overall Score" />
                      <Bar dataKey="completion_rate" fill="#0f766e" radius={[8, 8, 0, 0]} name="Completion Rate" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <SectionEmpty message="Trainer comparison will appear once trainer-owned learning data is available." />
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
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={batchRows.slice(0, 10)} margin={{ top: 12, right: 12, left: 0, bottom: 64 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="batch_label" interval={0} angle={-14} textAnchor="end" height={80} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Bar dataKey="overall_score" fill="#2563eb" radius={[8, 8, 0, 0]} name="Overall Score" />
                      <Bar dataKey="completion_rate" fill="#f59e0b" radius={[8, 8, 0, 0]} name="Completion Rate" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <SectionEmpty message="Batch comparison will appear after scoped batch results are recorded." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Module Progress Trend</CardTitle>
                <CardDescription>
                  Completion rate and average score for the active module set in the current admin scope.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {moduleRows.length ? (
                  <ResponsiveContainer width="100%" height={340}>
                    <LineChart data={moduleRows.slice(0, 12)} margin={{ top: 12, right: 16, left: 0, bottom: 84 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="module_title" interval={0} angle={-18} textAnchor="end" height={100} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="completion_rate" stroke="#0f766e" strokeWidth={3} name="Completion Rate" />
                      <Line type="monotone" dataKey="average_score" stroke="#2563eb" strokeWidth={2} name="Average Score" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <SectionEmpty message="Module trend analytics will appear after trainers assign modules and trainees start completing them." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Score Distribution</CardTitle>
                <CardDescription>
                  Combined spread of saved exercise and assessment scores in the current admin filter scope.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.score_distribution || []).some((row) => row.count > 0) ? (
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={data?.score_distribution || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="range_label" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]} name="Results">
                        {(data?.score_distribution || []).map((row, index) => (
                          <Cell key={row.range_label} fill={SCORE_DISTRIBUTION_COLORS[index % SCORE_DISTRIBUTION_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <SectionEmpty message="Score distribution will populate once trainees complete exercises or assessments in this scope." />
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
                          (row.count / Math.max(
                            (summary?.assigned_module_records || 0) + (summary?.assigned_assessment_records || 0),
                            1,
                          )) * 100
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
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data?.performance_breakdown || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#334155" radius={[8, 8, 0, 0]} name="Results" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <SectionEmpty message="Performance banding will appear once scored results are available." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Assessment Performance</CardTitle>
                <CardDescription>Top assessment averages by title in the current admin filter scope.</CardDescription>
              </CardHeader>
              <CardContent>
                {assessmentRows.length ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={assessmentRows.slice(0, 8)} margin={{ top: 12, right: 10, left: 0, bottom: 72 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="assessment_title" interval={0} angle={-18} textAnchor="end" height={92} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Bar dataKey="average_score" fill="#7c3aed" radius={[8, 8, 0, 0]} name="Average Score" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <SectionEmpty message="Assessment performance will appear once scoped assessment submissions exist." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
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
                  <SectionEmpty message="Top trainer rankings will appear when trainer-owned results are available." />
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
                  <SectionEmpty message="At-risk batches will appear once weak performance signals emerge." />
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Trainee Ranking</CardTitle>
                <CardDescription>Top trainee results across modules and assessments in the current admin scope.</CardDescription>
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
                  <SectionEmpty message="Trainee rankings will appear after scoped learning results are recorded." />
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
                  <SectionEmpty message="Weak module patterns will appear once more module results are available." />
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
                  <SectionEmpty message="Assessment weak areas will appear once assessment results are in scope." />
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
                  <SectionEmpty message="Exercise performance will appear after trainees start generating attempt data." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest module and assessment events contributing to the current analytics scope.</CardDescription>
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
                  <SectionEmpty message="Recent activity will appear after the current scope produces module or assessment events." />
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
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                        <div>Score: {formatPercent(row.overall_score)}</div>
                        <div>Completion: {formatPercent(row.completion_rate)}</div>
                        <div>Pass: {formatPercent(row.pass_rate)}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <SectionEmpty message="No trainee is currently flagged for targeted improvement in this scope." />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
