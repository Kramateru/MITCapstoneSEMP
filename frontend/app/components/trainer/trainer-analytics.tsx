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
  Cell,
  Line,
  LineChart,
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
import { apiFetch } from '@/app/utils/api'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { ChartCountLabelList, ChartPercentLabelList } from '../ui/chart-data-labels'
import { Progress } from '../ui/progress'
import { TrainerLearningFilterBar } from './trainer-learning-filter-bar'

const AUTO_REFRESH_MS = 45_000
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

function activityLabel(activityType: string) {
  switch (activityType) {
    case 'module_completed':
      return 'Module Completed'
    case 'module_started':
      return 'Module Started'
    case 'assessment_submitted':
      return 'Assessment Submitted'
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
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
          <div className="mt-2 text-xs text-slate-500">{helper}</div>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">{icon}</div>
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
          payload.summary.assigned_module_records || payload.summary.assigned_assessment_records
            ? `Live analytics synced at ${new Date().toLocaleTimeString()} using real trainer-created modules, assigned assessments, and trainee results.`
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadAnalytics('auto')
    }, AUTO_REFRESH_MS)

    return () => window.clearInterval(timer)
  }, [loadAnalytics])

  const summary = data?.summary
  const hasAssignedLearning = Boolean(
    (summary?.assigned_module_records || 0) > 0
      || (summary?.assigned_assessment_records || 0) > 0,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Live Analytics Hub</h2>
          <p className="text-sm text-muted-foreground">
            Professional trainer analytics based only on real trainer-created modules, trainer-assigned assessments,
            and saved trainee results from the database.
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
          Refresh Live Analytics
        </Button>
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
              assessments, and the trainee results saved against them.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Trainees"
              value={formatCount(summary?.total_trainees)}
              helper="Active trainees with matching trainer-owned learning records"
              icon={<Users className="size-5 text-sky-600" />}
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
              helper={`${formatCount(summary?.pending_modules)} still pending`}
              icon={<CheckCircle2 className="size-5 text-emerald-600" />}
            />
            <SummaryCard
              label="Completion Rate"
              value={formatPercent(summary?.completion_rate)}
              helper="Across modules and trainer-assigned assessments"
              icon={<Target className="size-5 text-violet-600" />}
            />
            <SummaryCard
              label="Avg Assessment"
              value={formatPercent(summary?.average_assessment_score)}
              helper={`${formatCount(summary?.completed_assessments)} completed assessment results`}
              icon={<ClipboardList className="size-5 text-amber-600" />}
            />
            <SummaryCard
              label="Avg Exercise"
              value={formatPercent(summary?.average_exercise_score)}
              helper={`${formatCount(summary?.passed_modules)} passed module outcomes`}
              icon={<Gauge className="size-5 text-cyan-600" />}
            />
            <SummaryCard
              label="Pass Rate"
              value={formatPercent(summary?.pass_rate)}
              helper="Completed learning items meeting the required score"
              icon={<GraduationCap className="size-5 text-indigo-600" />}
            />
            <SummaryCard
              label="Attempts"
              value={formatCount(summary?.total_attempts)}
              helper={`${formatCount(summary?.assigned_assessment_records)} assigned assessments tracked`}
              icon={<Activity className="size-5 text-rose-600" />}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>AI Analysis</CardTitle>
                <CardDescription>
                  Professional guidance generated from the current trainer-scoped module, exercise, and assessment results.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
                  {data?.ai_analysis.headline}
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">Strengths</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {(data?.ai_analysis.strengths || []).map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">Weak Areas</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {(data?.ai_analysis.weak_areas || []).map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">Recommended Actions</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {(data?.ai_analysis.recommended_actions || []).map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
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

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Batch Performance Comparison</CardTitle>
                <CardDescription>
                  Overall learning score and completion rate by trainer-managed batch.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={completionTrendRows} margin={{ top: 26, right: 10, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" interval={0} angle={-14} textAnchor="end" height={72} />
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
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Score Distribution</CardTitle>
                <CardDescription>
                  Combined spread of saved exercise and assessment scores for the selected trainer scope.
                </CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Module Progress Chart</CardTitle>
                <CardDescription>
                  Completion rate by trainer-created module assignment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={data?.module_progress || []} margin={{ top: 28, right: 14, left: 0, bottom: 72 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="module_title" interval={0} angle={-18} textAnchor="end" height={90} />
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
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Trainee Performance Ranking</CardTitle>
                <CardDescription>
                  Ranking reflects only trainer-scoped module and assessment outcomes.
                </CardDescription>
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
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    No trainee ranking data is available for the current filter selection.
                  </div>
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
                      subtitle={`${row.batch_label} | Score ${formatPercent(row.overall_score)} | Pass ${formatPercent(row.pass_rate)}`}
                      badge={row.module_completed || row.assessment_completed ? 'Needs focus' : 'Low activity'}
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
                <CardTitle>Current Module Workload</CardTitle>
                <CardDescription>Assignment status snapshot from live trainer-owned module rows.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.module_assignments || []).length ? (
                  (data?.module_assignments || []).slice(0, 8).map((row) => (
                    <div key={row.id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-950">{row.module_title}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.trainee_name} | {row.batch_label}</div>
                        </div>
                        <Badge variant="outline" className="border-slate-300 text-slate-700">
                          {row.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                          <span>Progress</span>
                          <span>{Math.round(row.completion_percentage || 0)}%</span>
                        </div>
                        <Progress value={row.completion_percentage || 0} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    Module workload details will appear when trainer assignments are available.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
