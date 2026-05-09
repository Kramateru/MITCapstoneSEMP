'use client'

import {
  Award,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  ListChecks,
  Loader2,
  RefreshCw,
  RotateCcw,
  TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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

import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'
import {
  AssessmentSectionNav,
  EmptyState,
  MetricCard,
  PaginationBar,
  formatDateLabel,
  formatDateTimeLabel,
  formatDurationLabel,
  getAttemptTone,
} from '@/app/components/assessment/shared/assessment-ui'
import {
  fetchTraineeAssessmentDashboard,
  fetchTraineeAssessmentSession,
  openTraineeAssessmentStream,
  submitAssessmentAttemptRequest,
} from '@/app/lib/assessment/client'
import type {
  SubmitAssessmentResponse,
  TraineeAssessmentCard,
  TraineeAssessmentSession,
  TraineeDashboardResponse,
} from '@/app/lib/assessment/types'

import { AssessmentPlayer } from './assessment-player'

type TraineeSection = 'assigned' | 'take' | 'summary' | 'retake' | 'certificates'

const SECTION_OPTIONS: Array<{
  id: TraineeSection
  label: string
  description: string
  icon: ReactNode
}> = [
  {
    id: 'assigned',
    label: 'Assigned Assessments',
    description: 'Review the assessments currently available to your batch or trainee account.',
    icon: <BookOpenCheck className="size-4" />,
  },
  {
    id: 'take',
    label: 'Take Assessment',
    description: 'Open the live session, answer the served questions, and submit your score.',
    icon: <ListChecks className="size-4" />,
  },
  {
    id: 'summary',
    label: 'Assessment Summary',
    description: 'Track attempt history, score trends, and coaching insights.',
    icon: <BarChart3 className="size-4" />,
  },
  {
    id: 'retake',
    label: 'Retake Assessment',
    description: 'Jump straight into the assessments that still need a passing score.',
    icon: <RotateCcw className="size-4" />,
  },
  {
    id: 'certificates',
    label: 'Certificates',
    description: 'View the categories you have already completed successfully.',
    icon: <Award className="size-4" />,
  },
]

function normalizeSection(value: string | null): TraineeSection {
  return SECTION_OPTIONS.some((section) => section.id === value)
    ? (value as TraineeSection)
    : 'assigned'
}

function getAssessmentQueueStatus(assessment: TraineeAssessmentCard) {
  if (assessment.latestAttempt?.status === 'pass') {
    return 'passed'
  }

  if (assessment.canRetake) {
    return 'retake'
  }

  return 'new'
}

function getAssessmentQueueTone(status: 'passed' | 'retake' | 'new') {
  if (status === 'passed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  if (status === 'retake') {
    return 'border-amber-200 bg-amber-50 text-amber-700'
  }

  return 'border-sky-200 bg-sky-50 text-sky-700'
}

function buildCategoryPerformance(dashboard: TraineeDashboardResponse | null) {
  if (!dashboard) {
    return []
  }

  const categoryMap = new Map<
    string,
    {
      label: string
      totalScore: number
      attempts: number
    }
  >()

  for (const attempt of dashboard.attempts) {
    const current = categoryMap.get(attempt.categoryId) || {
      label: attempt.categoryTitle,
      totalScore: 0,
      attempts: 0,
    }
    current.totalScore += attempt.score
    current.attempts += 1
    categoryMap.set(attempt.categoryId, current)
  }

  return Array.from(categoryMap.values()).map((entry) => ({
    label: entry.label,
    averageScore: Number((entry.totalScore / Math.max(entry.attempts, 1)).toFixed(2)),
  }))
}

function getRecentAttemptTrend(dashboard: TraineeDashboardResponse | null) {
  return (dashboard?.attempts || [])
    .slice(0, 10)
    .reverse()
    .map((attempt) => ({
      label: `Attempt ${attempt.attemptNo}`,
      score: Number(attempt.score.toFixed(2)),
    }))
}

export function TraineeAssessmentWorkspace() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [dashboard, setDashboard] = useState<TraineeDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [liveStatus, setLiveStatus] = useState('Connecting assessment updates...')
  const [activeSection, setActiveSection] = useState<TraineeSection>(normalizeSection(searchParams.get('section')))
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [availableSearch, setAvailableSearch] = useState('')
  const [availableFilter, setAvailableFilter] = useState<'all' | 'new' | 'retake' | 'passed'>('all')
  const [summarySearch, setSummarySearch] = useState('')
  const [summaryStatusFilter, setSummaryStatusFilter] = useState<'all' | 'pass' | 'fail'>('all')
  const [summaryPage, setSummaryPage] = useState(1)
  const [certificateSearch, setCertificateSearch] = useState('')
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const [activeSession, setActiveSession] = useState<TraineeAssessmentSession | null>(null)

  const syncSection = useCallback((nextSection: TraineeSection) => {
    setActiveSection(nextSection)
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('section', nextSection)
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  const refreshDashboard = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    try {
      if (mode === 'initial') {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      setError('')
      const payload = await fetchTraineeAssessmentDashboard()
      setDashboard(payload)
    } catch (loadError) {
      console.error(loadError)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the assessment workspace.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshDashboard()
  }, [refreshDashboard])

  useEffect(() => {
    setActiveSection(normalizeSection(searchParams.get('section')))
  }, [searchParams])

  useEffect(() => {
    if (!dashboard?.availableAssessments.length) {
      setSelectedAssignmentId('')
      return
    }

    setSelectedAssignmentId((current) =>
      dashboard.availableAssessments.some((assessment) => assessment.assignmentId === current)
        ? current
        : dashboard.availableAssessments[0].assignmentId,
    )
  }, [dashboard?.availableAssessments])

  useEffect(() => {
    if (!dashboard) {
      return
    }

    let stream: EventSource | null = null
    try {
      stream = openTraineeAssessmentStream()
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; status?: string }
          if (payload.type === 'status' && payload.status) {
            setLiveStatus(`Supabase realtime: ${payload.status.toLowerCase().replace(/_/g, ' ')}`)
            return
          }

          if (
            payload.type === 'assignment_changed'
            || payload.type === 'attempt_changed'
            || payload.type === 'coaching_changed'
            || payload.type === 'certificate_changed'
          ) {
            setLiveStatus('Live assessment update received. Refreshing your workspace...')
            void refreshDashboard('refresh')
          }
        } catch {
          setLiveStatus('Assessment workspace update received.')
        }
      }
      stream.onerror = () => {
        setLiveStatus('Realtime stream disconnected. Manual refresh is still available.')
      }
    } catch (streamError) {
      console.error(streamError)
      setLiveStatus('Realtime updates are unavailable right now. Manual refresh is still available.')
    }

    return () => {
      stream?.close()
    }
  }, [dashboard, refreshDashboard])

  const filteredAvailableAssessments = useMemo(() => {
    const normalizedSearch = availableSearch.trim().toLowerCase()

    return (dashboard?.availableAssessments || []).filter((assessment) => {
      const queueStatus = getAssessmentQueueStatus(assessment)

      if (availableFilter !== 'all' && queueStatus !== availableFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        assessment.assignmentTitle || '',
        assessment.assessmentTitle,
        assessment.categoryTitle,
        assessment.targetLabel,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [availableFilter, availableSearch, dashboard?.availableAssessments])

  const selectedAssessment = useMemo(
    () =>
      filteredAvailableAssessments.find((assessment) => assessment.assignmentId === selectedAssignmentId)
      || dashboard?.availableAssessments.find((assessment) => assessment.assignmentId === selectedAssignmentId)
      || null,
    [dashboard?.availableAssessments, filteredAvailableAssessments, selectedAssignmentId],
  )

  const retakeAssessments = useMemo(
    () => (dashboard?.availableAssessments || []).filter((assessment) => assessment.canRetake),
    [dashboard?.availableAssessments],
  )

  const filteredAttempts = useMemo(() => {
    const normalizedSearch = summarySearch.trim().toLowerCase()

    return (dashboard?.attempts || []).filter((attempt) => {
      if (summaryStatusFilter !== 'all' && attempt.status !== summaryStatusFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        attempt.assessmentTitle,
        attempt.categoryTitle,
        attempt.batchName || '',
        attempt.certificateCode || '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [dashboard?.attempts, summarySearch, summaryStatusFilter])

  const summaryPageCount = Math.max(1, Math.ceil(filteredAttempts.length / 5))
  const paginatedAttempts = useMemo(() => {
    const currentPage = Math.min(summaryPage, summaryPageCount)
    const startIndex = (currentPage - 1) * 5
    return filteredAttempts.slice(startIndex, startIndex + 5)
  }, [filteredAttempts, summaryPage, summaryPageCount])

  useEffect(() => {
    setSummaryPage(1)
  }, [summarySearch, summaryStatusFilter])

  const filteredCertificates = useMemo(() => {
    const normalizedSearch = certificateSearch.trim().toLowerCase()

    return (dashboard?.certificates || []).filter((certificate) => {
      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        certificate.categoryTitle,
        certificate.assessmentTitle,
        certificate.certificateCode,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [certificateSearch, dashboard?.certificates])

  const recentTrendData = useMemo(() => getRecentAttemptTrend(dashboard), [dashboard])
  const categoryPerformance = useMemo(() => buildCategoryPerformance(dashboard), [dashboard])

  const loadAssessmentSession = useCallback(async (assignmentId: string, nextSection: TraineeSection = 'take') => {
    try {
      setSessionLoading(true)
      setSessionError('')
      const payload = await fetchTraineeAssessmentSession(assignmentId)
      setActiveSession(payload)
      setSelectedAssignmentId(assignmentId)
      syncSection(nextSection)
    } catch (loadError) {
      console.error(loadError)
      setSessionError(loadError instanceof Error ? loadError.message : 'Unable to load the selected assessment session.')
      syncSection('take')
    } finally {
      setSessionLoading(false)
    }
  }, [syncSection])

  const handleAttemptCommitted = useCallback(async (_result: SubmitAssessmentResponse) => {
    await refreshDashboard('refresh')
  }, [refreshDashboard])

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading assessment workspace...
      </div>
    )
  }

  if (!dashboard) {
    return (
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <CardTitle>Assessment workspace unavailable</CardTitle>
          <CardDescription>
            Your assessment dashboard could not load right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <div className="text-sm text-amber-900">{error}</div> : null}
          <Button type="button" className="mt-4" onClick={() => void refreshDashboard('refresh')} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">Assessment Hub</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Review your assigned assessments, take timed sessions, monitor progress, and unlock certificates once you reach the passing score.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refreshDashboard('refresh')} disabled={refreshing}>
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
        {liveStatus}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Assigned"
          value={String(dashboard.stats.assignedCount)}
          hint="Visible in your queue"
          icon={<BookOpenCheck className="size-4 text-sky-600" />}
        />
        <MetricCard
          label="Completed"
          value={String(dashboard.stats.completedCount)}
          hint="Recorded attempts"
          icon={<ListChecks className="size-4 text-slate-700" />}
        />
        <MetricCard
          label="Passed"
          value={String(dashboard.stats.passedCount)}
          hint="Passing score achieved"
          icon={<CheckCircle2 className="size-4 text-emerald-600" />}
        />
        <MetricCard
          label="Retakes"
          value={String(dashboard.stats.retakeCount || 0)}
          hint="Still below the threshold"
          icon={<RotateCcw className="size-4 text-amber-600" />}
        />
        <MetricCard
          label="Certificates"
          value={String(dashboard.stats.certificateCount || 0)}
          hint={`${dashboard.stats.averageScore.toFixed(2)}% average`}
          icon={<Award className="size-4 text-violet-600" />}
        />
      </div>

      <AssessmentSectionNav
        activeSection={activeSection}
        sections={SECTION_OPTIONS}
        onSelect={syncSection}
      />

      {activeSection === 'assigned' ? (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Assigned Queue</CardTitle>
              <CardDescription>Select an assigned assessment to review its details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={availableSearch}
                onChange={(event) => setAvailableSearch(event.target.value)}
                placeholder="Search category, assignment, or target"
              />
              <Select value={availableFilter} onValueChange={(value: 'all' | 'new' | 'retake' | 'passed') => setAvailableFilter(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All states</SelectItem>
                  <SelectItem value="new">New only</SelectItem>
                  <SelectItem value="retake">Retake only</SelectItem>
                  <SelectItem value="passed">Passed only</SelectItem>
                </SelectContent>
              </Select>

              {filteredAvailableAssessments.map((assessment) => {
                const queueStatus = getAssessmentQueueStatus(assessment)
                return (
                  <button
                    key={assessment.assignmentId}
                    type="button"
                    onClick={() => setSelectedAssignmentId(assessment.assignmentId)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedAssignmentId === assessment.assignmentId
                        ? 'border-sky-400 bg-sky-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{assessment.assignmentTitle || assessment.assessmentTitle}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                          {assessment.categoryTitle}
                        </div>
                      </div>
                      <Badge className={getAssessmentQueueTone(queueStatus)}>
                        {queueStatus === 'passed' ? 'Passed' : queueStatus === 'retake' ? 'Retake' : 'New'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{assessment.questionCount} questions</span>
                      <span>Pass at {assessment.passingScore}%</span>
                      <span>{assessment.targetLabel}</span>
                    </div>
                  </button>
                )
              })}

              {!filteredAvailableAssessments.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  {dashboard.availableAssessments.length
                    ? 'No assigned assessments match the current filters.'
                    : 'No assessments are assigned to your account yet.'}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {selectedAssessment ? (
            <Card>
              <CardHeader>
                <CardTitle>{selectedAssessment.assignmentTitle || selectedAssessment.assessmentTitle}</CardTitle>
                <CardDescription>{selectedAssessment.assessmentDescription || 'Assessment details are shown here before you start.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <MetricCard label="Questions" value={String(selectedAssessment.questionCount)} hint="Served per attempt" icon={<ListChecks className="size-4 text-slate-700" />} />
                  <MetricCard label="Passing Score" value={`${selectedAssessment.passingScore}%`} hint="Score target" icon={<TrendingUp className="size-4 text-sky-600" />} />
                  <MetricCard label="Attempts" value={selectedAssessment.attemptCount ? String(selectedAssessment.attemptCount) : '0'} hint={selectedAssessment.maximumAttempts ? `Max ${selectedAssessment.maximumAttempts}` : 'Unlimited'} icon={<RotateCcw className="size-4 text-amber-600" />} />
                  <MetricCard label="Certificate" value={selectedAssessment.certificate?.certificateCode || 'Pending'} hint="Completion record" icon={<Award className="size-4 text-violet-600" />} />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <DetailLine label="Category" value={selectedAssessment.categoryTitle} />
                    <DetailLine label="Target" value={selectedAssessment.targetLabel} />
                    <DetailLine label="Due Date" value={formatDateLabel(selectedAssessment.targetDueAt)} />
                    <DetailLine label="Timer" value={selectedAssessment.timeLimitMinutes ? `${selectedAssessment.timeLimitMinutes} minutes` : 'Untimed'} />
                  </div>
                </div>

                {selectedAssessment.latestAttempt ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${getAttemptTone(selectedAssessment.latestAttempt.status)}`}>
                    Latest recorded result: {selectedAssessment.latestAttempt.score.toFixed(2)}% on{' '}
                    {formatDateTimeLabel(selectedAssessment.latestAttempt.completedAt || selectedAssessment.latestAttempt.submittedAt)}.
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  {!selectedAssessment.isCompleted || selectedAssessment.canRetake ? (
                    <Button type="button" onClick={() => void loadAssessmentSession(selectedAssessment.assignmentId)}>
                      {sessionLoading && activeSession?.assignmentId !== selectedAssessment.assignmentId ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <BookOpenCheck className="size-4" />
                      )}
                      {selectedAssessment.canRetake ? 'Open Retake Session' : 'Start Assessment'}
                    </Button>
                  ) : null}
                  {selectedAssessment.certificate ? (
                    <Button type="button" variant="outline" onClick={() => syncSection('certificates')}>
                      <Award className="size-4" />
                      View Certificate
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              title="Select an assigned assessment"
              description="Choose an item from the queue to see its details and launch the live session."
            />
          )}
        </div>
      ) : null}

      {activeSection === 'take' ? (
        <>
          {sessionError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {sessionError}
            </div>
          ) : null}

          {sessionLoading ? (
            <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-600">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading assessment session...
            </div>
          ) : (
            <AssessmentPlayer
              assessment={activeSession}
              onSubmitAssessment={submitAssessmentAttemptRequest}
              onAttemptCommitted={handleAttemptCommitted}
              onViewCertificates={() => syncSection('certificates')}
              onRetakeRequested={async (assignmentId) => {
                await loadAssessmentSession(assignmentId, 'take')
              }}
            />
          )}

          {!sessionLoading && !activeSession ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>No active session loaded</CardTitle>
                <CardDescription>
                  Open an assigned assessment from the queue or the retake section to start.
                </CardDescription>
              </CardHeader>
              {selectedAssessment ? (
                <CardContent>
                  <Button type="button" onClick={() => void loadAssessmentSession(selectedAssessment.assignmentId)}>
                    Start Selected Assessment
                  </Button>
                </CardContent>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}

      {activeSection === 'summary' ? (
        <div className="space-y-6">
          {!dashboard.attempts.length ? (
            <EmptyState
              title="No attempt history yet"
              description="Your score trends and coaching summaries will appear after your first completed assessment."
            />
          ) : (
            <>
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Score Trend</CardTitle>
                    <CardDescription>Your latest recorded assessment scores.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={recentTrendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="score" stroke="#0284c7" strokeWidth={3} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Average Score by Category</CardTitle>
                    <CardDescription>Use this to identify which topics still need review.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={categoryPerformance}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" interval={0} angle={-12} textAnchor="end" height={64} />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Bar dataKey="averageScore" fill="#0f766e" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Attempt History</CardTitle>
                  <CardDescription>Saved attempts, result summaries, and coaching notes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <Input
                      value={summarySearch}
                      onChange={(event) => setSummarySearch(event.target.value)}
                      placeholder="Search assessment, category, batch, or certificate"
                    />
                    <Select value={summaryStatusFilter} onValueChange={(value: 'all' | 'pass' | 'fail') => setSummaryStatusFilter(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All results</SelectItem>
                        <SelectItem value="pass">Pass only</SelectItem>
                        <SelectItem value="fail">Fail only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {paginatedAttempts.map((attempt) => (
                    <div key={attempt.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold text-slate-950">{attempt.assessmentTitle}</div>
                            <Badge className={getAttemptTone(attempt.status)}>
                              {attempt.status === 'pass' ? 'Pass' : 'Fail'}
                            </Badge>
                            {attempt.certificateCode ? <Badge variant="outline">{attempt.certificateCode}</Badge> : null}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {attempt.categoryTitle} | Attempt #{attempt.attemptNo} | {formatDateTimeLabel(attempt.completedAt || attempt.submittedAt)}
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            {attempt.analysis?.summary || attempt.feedback || 'Assessment result saved.'}
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3">
                          <MetricCard label="Score" value={`${attempt.score.toFixed(2)}%`} icon={<TrendingUp className="size-4 text-sky-600" />} />
                          <MetricCard label="Correct" value={String(attempt.correctAnswers ?? attempt.questionResults.filter((result) => result.isCorrect).length)} icon={<CheckCircle2 className="size-4 text-emerald-600" />} />
                          <MetricCard label="Time" value={formatDurationLabel(attempt.timeSpentSeconds)} icon={<Clock3 className="size-4 text-amber-600" />} />
                        </div>
                      </div>
                    </div>
                  ))}

                  {!paginatedAttempts.length ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                      No attempts match the current filters.
                    </div>
                  ) : null}

                  <PaginationBar
                    currentPage={Math.min(summaryPage, summaryPageCount)}
                    totalPages={summaryPageCount}
                    itemCountLabel={`Showing ${paginatedAttempts.length} of ${filteredAttempts.length} attempts`}
                    onPrevious={() => setSummaryPage((current) => Math.max(current - 1, 1))}
                    onNext={() => setSummaryPage((current) => Math.min(current + 1, summaryPageCount))}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      ) : null}

      {activeSection === 'retake' ? (
        retakeAssessments.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {retakeAssessments.map((assessment) => (
              <Card key={assessment.assignmentId} className="border-amber-200 bg-amber-50/60">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{assessment.assignmentTitle || assessment.assessmentTitle}</CardTitle>
                      <CardDescription>{assessment.categoryTitle}</CardDescription>
                    </div>
                    <Badge className="border-amber-200 bg-amber-100 text-amber-800">Retake</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <DetailLine label="Latest Score" value={`${assessment.latestAttempt?.score.toFixed(2) || '0.00'}%`} />
                    <DetailLine label="Attempts Remaining" value={assessment.attemptsRemaining === null ? 'Unlimited' : String(assessment.attemptsRemaining)} />
                    <DetailLine label="Due Date" value={formatDateLabel(assessment.targetDueAt)} />
                  </div>
                  <Button type="button" onClick={() => void loadAssessmentSession(assessment.assignmentId, 'take')}>
                    <RotateCcw className="size-4" />
                    Start Retake
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No retakes queued"
            description="Any assessment below the passing score will appear here automatically."
          />
        )
      ) : null}

      {activeSection === 'certificates' ? (
        dashboard.certificates.length ? (
          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Earned Certificates</CardTitle>
                <CardDescription>Each passing category unlocks a durable completion record.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={certificateSearch}
                  onChange={(event) => setCertificateSearch(event.target.value)}
                  placeholder="Search category, assessment, or certificate code"
                />
                {filteredCertificates.map((certificate) => (
                  <div key={certificate.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{certificate.categoryTitle}</div>
                        <div className="mt-1 text-sm text-slate-600">{certificate.assessmentTitle}</div>
                      </div>
                      <Award className="size-5 text-amber-600" />
                    </div>
                    <div className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">Certificate Code</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{certificate.certificateCode}</div>
                    <div className="mt-3 text-xs text-slate-500">Earned {formatDateTimeLabel(certificate.earnedAt)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-[linear-gradient(135deg,rgba(254,249,195,0.75),rgba(255,255,255,0.95))]">
              <CardHeader>
                <CardTitle>Certificate Overview</CardTitle>
                <CardDescription>
                  Your completed categories remain here as proof of assessment completion.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard label="Certificates" value={String(dashboard.certificates.length)} hint="Assessment completions" icon={<Award className="size-4 text-amber-600" />} />
                  <MetricCard label="Categories Cleared" value={String(new Set(dashboard.certificates.map((certificate) => certificate.categoryId)).size)} hint="Passing threshold reached" icon={<CheckCircle2 className="size-4 text-emerald-600" />} />
                  <MetricCard label="Most Recent" value={dashboard.certificates[0] ? formatDateLabel(dashboard.certificates[0].earnedAt) : 'Today'} hint="Latest unlock" icon={<Clock3 className="size-4 text-sky-600" />} />
                </div>

                <div className="rounded-3xl border border-white/70 bg-white/85 p-5 text-sm leading-7 text-slate-700">
                  When a passing score is recorded, your certificate stays visible here along with its earned timestamp and code, so both you and your trainer can confirm the category is complete.
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <EmptyState
            title="No certificates earned yet"
            description="Pass an assigned assessment and the certificate will appear here automatically."
          />
        )
      ) : null}
    </div>
  )
}

function DetailLine({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  )
}
