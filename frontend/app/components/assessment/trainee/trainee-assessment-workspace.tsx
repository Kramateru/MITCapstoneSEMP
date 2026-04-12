'use client'

import {
  Award,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Loader2,
  Medal,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import {
  fetchTraineeAssessmentDashboard,
  openTraineeAssessmentStream,
  submitAssessmentAttemptRequest,
} from '@/app/lib/assessment/client'
import type {
  CoachingNoteRecord,
  SubmitAssessmentPayload,
  TraineeAssessmentCard,
  TraineeDashboardResponse,
} from '@/app/lib/assessment/types'

import { AssessmentPlayer } from './assessment-player'

type WorkspaceTab = 'available' | 'progress' | 'certificates'
const ATTEMPTS_PER_PAGE = 5

function getAssessmentInstanceKey(assessment: TraineeAssessmentCard) {
  return `${assessment.assessmentId}:${assessment.assignmentId || 'direct'}`
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'No due date'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'No due date'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'No timestamp'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'No timestamp'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function getAttemptTone(status?: 'pass' | 'fail') {
  if (status === 'pass') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (status === 'fail') {
    return 'bg-amber-100 text-amber-700'
  }

  return 'bg-slate-100 text-slate-700'
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
      attemptCount: number
      passCount: number
    }
  >()

  for (const attempt of dashboard.attempts) {
    const current = categoryMap.get(attempt.categoryId) || {
      label: attempt.categoryTitle,
      totalScore: 0,
      attemptCount: 0,
      passCount: 0,
    }
    current.totalScore += attempt.score
    current.attemptCount += 1
    current.passCount += attempt.status === 'pass' ? 1 : 0
    categoryMap.set(attempt.categoryId, current)
  }

  return Array.from(categoryMap.values()).map((entry) => ({
    label: entry.label,
    averageScore: Number((entry.totalScore / Math.max(entry.attemptCount, 1)).toFixed(2)),
    passRate: Number(((entry.passCount / Math.max(entry.attemptCount, 1)) * 100).toFixed(2)),
  }))
}

export function TraineeAssessmentWorkspace({
  initialTab = 'available',
}: {
  initialTab?: WorkspaceTab
}) {
  const [dashboard, setDashboard] = useState<TraineeDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [liveStatus, setLiveStatus] = useState('Connecting assessment updates...')
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab)
  const [selectedAssessmentKey, setSelectedAssessmentKey] = useState('')
  const [availableSearch, setAvailableSearch] = useState('')
  const [availableStatusFilter, setAvailableStatusFilter] = useState<'all' | 'new' | 'retake' | 'passed'>('all')
  const [progressSearch, setProgressSearch] = useState('')
  const [progressStatusFilter, setProgressStatusFilter] = useState<'all' | 'pass' | 'fail'>('all')
  const [progressPage, setProgressPage] = useState(1)
  const [certificateSearch, setCertificateSearch] = useState('')

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
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the trainee assessment workspace.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshDashboard()
  }, [refreshDashboard])

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
    if (!dashboard) {
      return []
    }

    const normalizedSearch = availableSearch.trim().toLowerCase()

    return dashboard.availableAssessments.filter((assessment) => {
      const derivedStatus = assessment.latestAttempt?.status === 'pass'
        ? 'passed'
        : assessment.latestAttempt?.status === 'fail'
          ? 'retake'
          : 'new'

      if (availableStatusFilter !== 'all' && derivedStatus !== availableStatusFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        assessment.assessmentTitle,
        assessment.categoryTitle,
        assessment.assessmentDescription || '',
        assessment.targetLabel,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [availableSearch, availableStatusFilter, dashboard])

  const orderedAssessments = useMemo(() => {
    return [...filteredAvailableAssessments].sort((left, right) => {
      const leftDue = left.targetDueAt ? new Date(left.targetDueAt).getTime() : Number.MAX_SAFE_INTEGER
      const rightDue = right.targetDueAt ? new Date(right.targetDueAt).getTime() : Number.MAX_SAFE_INTEGER
      const leftPriority = left.latestAttempt?.status === 'fail' ? -2 : left.latestAttempt ? 1 : -1
      const rightPriority = right.latestAttempt?.status === 'fail' ? -2 : right.latestAttempt ? 1 : -1

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority
      }

      if (leftDue !== rightDue) {
        return leftDue - rightDue
      }

      return left.assessmentTitle.localeCompare(right.assessmentTitle)
    })
  }, [filteredAvailableAssessments])

  useEffect(() => {
    if (!orderedAssessments.length) {
      setSelectedAssessmentKey('')
      return
    }

    setSelectedAssessmentKey((current) =>
      orderedAssessments.some((assessment) => getAssessmentInstanceKey(assessment) === current)
        ? current
        : getAssessmentInstanceKey(orderedAssessments[0]),
    )
  }, [orderedAssessments])

  const selectedAssessment = useMemo(
    () =>
      orderedAssessments.find((assessment) => getAssessmentInstanceKey(assessment) === selectedAssessmentKey) || null,
    [orderedAssessments, selectedAssessmentKey],
  )

  const coachingNotesByAttempt = useMemo(() => {
    const noteMap = new Map<string, CoachingNoteRecord[]>()

    for (const note of dashboard?.coachingNotes || []) {
      const current = noteMap.get(note.attemptId) || []
      current.push(note)
      noteMap.set(note.attemptId, current)
    }

    return noteMap
  }, [dashboard?.coachingNotes])

  const attemptTrendData = useMemo(
    () =>
      (dashboard?.attempts || [])
        .slice(0, 12)
        .reverse()
        .map((attempt) => ({
          label: `A${attempt.attemptNo}`,
          score: attempt.score,
          submittedAt: formatDate(attempt.submittedAt),
        })),
    [dashboard?.attempts],
  )

  const categoryPerformance = useMemo(() => buildCategoryPerformance(dashboard), [dashboard])
  const filteredAttempts = useMemo(() => {
    const normalizedSearch = progressSearch.trim().toLowerCase()

    return (dashboard?.attempts || []).filter((attempt) => {
      if (progressStatusFilter !== 'all' && attempt.status !== progressStatusFilter) {
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
  }, [dashboard?.attempts, progressSearch, progressStatusFilter])
  const progressPageCount = Math.max(1, Math.ceil(filteredAttempts.length / ATTEMPTS_PER_PAGE))
  const paginatedAttempts = useMemo(() => {
    const currentPage = Math.min(progressPage, progressPageCount)
    const startIndex = (currentPage - 1) * ATTEMPTS_PER_PAGE
    return filteredAttempts.slice(startIndex, startIndex + ATTEMPTS_PER_PAGE)
  }, [filteredAttempts, progressPage, progressPageCount])
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

  const latestAttempt = dashboard?.attempts[0] || null
  const recentCoachingNotes = useMemo(() => (dashboard?.coachingNotes || []).slice(0, 6), [dashboard?.coachingNotes])

  const handleSubmitAssessment = async (payload: SubmitAssessmentPayload) =>
    submitAssessmentAttemptRequest(payload)

  const handleAttemptCommitted = async () => {
    await refreshDashboard('refresh')
  }

  useEffect(() => {
    setProgressPage(1)
  }, [progressSearch, progressStatusFilter])

  useEffect(() => {
    if (progressPage > progressPageCount) {
      setProgressPage(progressPageCount)
    }
  }, [progressPage, progressPageCount])

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
      <Card className="border-amber-200 bg-amber-50/70">
        <CardHeader className="space-y-3">
          <CardTitle className="text-slate-950">Assessment workspace is temporarily unavailable</CardTitle>
          <CardDescription className="text-sm text-slate-700">
            Your assessment dashboard could not load right now. You can still continue with the working trainee
            assessment tools below while the shared data service is unavailable.
          </CardDescription>
          {error ? (
            <div className="rounded-2xl border border-amber-200 bg-white/90 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void refreshDashboard('refresh')} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Retry
          </Button>
          <Button asChild variant="outline">
            <Link href="/trainee/mcq">Open MCQ Assessments</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/trainee/reports">Open Reports</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/trainee/coaching">Open Coaching</Link>
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
            Take assigned assessments, review coaching notes, monitor your score history, and unlock certificates after each passing result.
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Assigned Assessments"
          value={String(dashboard.stats.assignedCount)}
          icon={<BookOpenCheck className="size-4 text-sky-600" />}
          hint="Current queue"
        />
        <MetricCard
          label="Completed Attempts"
          value={String(dashboard.stats.completedCount)}
          icon={<BarChart3 className="size-4 text-violet-600" />}
          hint="Saved in Supabase"
        />
        <MetricCard
          label="Passed Attempts"
          value={String(dashboard.stats.passedCount)}
          icon={<CheckCircle2 className="size-4 text-emerald-600" />}
          hint="Passing score reached"
        />
        <MetricCard
          label="Average Score"
          value={`${dashboard.stats.averageScore.toFixed(2)}%`}
          icon={<TrendingUp className="size-4 text-amber-600" />}
          hint={latestAttempt ? `Latest ${latestAttempt.score.toFixed(2)}%` : 'No attempts yet'}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as WorkspaceTab)} className="space-y-6">
        <TabsList className="grid w-full max-w-3xl grid-cols-3">
          <TabsTrigger value="available">Available Tests</TabsTrigger>
          <TabsTrigger value="progress">My Progress</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="space-y-6">
          {!orderedAssessments.length ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>{dashboard.availableAssessments.length ? 'No assessments match the current filters' : 'No assessments assigned'}</CardTitle>
                <CardDescription>
                  {dashboard.availableAssessments.length
                    ? 'Try a broader search or reset the status filter to view the rest of your queue.'
                    : 'When a trainer assigns an assessment category to your batch, it will appear here automatically.'}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Assessment Queue</CardTitle>
                  <CardDescription>Select a category to start or retake its assessment.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3">
                    <Input
                      value={availableSearch}
                      onChange={(event) => setAvailableSearch(event.target.value)}
                      placeholder="Search assessments, categories, or targets"
                    />
                    <Select
                      value={availableStatusFilter}
                      onValueChange={(value: 'all' | 'new' | 'retake' | 'passed') => setAvailableStatusFilter(value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All queue states</SelectItem>
                        <SelectItem value="new">New only</SelectItem>
                        <SelectItem value="retake">Retake only</SelectItem>
                        <SelectItem value="passed">Passed only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {orderedAssessments.map((assessment) => {
                    const assessmentKey = getAssessmentInstanceKey(assessment)
                    const isSelected = assessmentKey === selectedAssessmentKey

                    return (
                      <button
                        key={assessmentKey}
                        type="button"
                        onClick={() => setSelectedAssessmentKey(assessmentKey)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? 'border-sky-400 bg-sky-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-950">{assessment.assessmentTitle}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                              {assessment.categoryTitle}
                            </div>
                          </div>
                          <Badge className={getAttemptTone(assessment.latestAttempt?.status)}>
                            {assessment.latestAttempt?.status === 'pass'
                              ? 'Passed'
                              : assessment.latestAttempt?.status === 'fail'
                                ? 'Retake'
                                : 'New'}
                          </Badge>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{assessment.questionCount} questions</span>
                          <span>{assessment.passingScore}% pass mark</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {assessment.targetLabel} | Due {formatDate(assessment.targetDueAt)}
                        </div>

                        {assessment.latestAttempt ? (
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600">
                            Latest attempt: {assessment.latestAttempt.score.toFixed(2)}% on {formatDateTime(assessment.latestAttempt.submittedAt)}
                          </div>
                        ) : null}

                        {assessment.certificate ? (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <Award className="size-3.5" />
                            {assessment.certificate.certificateCode}
                          </div>
                        ) : null}
                      </button>
                    )
                  })}
                </CardContent>
              </Card>

              <AssessmentPlayer
                assessment={selectedAssessment}
                onSubmitAssessment={handleSubmitAssessment}
                onAttemptCommitted={handleAttemptCommitted}
                onViewCertificates={() => setActiveTab('certificates')}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="progress" className="space-y-6">
          {!dashboard.attempts.length ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>No progress data yet</CardTitle>
                <CardDescription>
                  Your attempt history, charts, and trainer coaching notes will appear after the first completed assessment.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Attempt Trend</CardTitle>
                    <CardDescription>Your most recent recorded assessment scores.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={attemptTrendData}>
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
                    <CardTitle>Category Performance</CardTitle>
                    <CardDescription>Average score and pass rate by assessment category.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={categoryPerformance}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" interval={0} angle={-10} textAnchor="end" height={60} />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Bar dataKey="averageScore" fill="#0f766e" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_360px]">
                <Card>
                  <CardHeader>
                    <CardTitle>Attempt History</CardTitle>
                    <CardDescription>Each attempt includes saved scoring, instant feedback, and trainer follow-up notes.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <Input
                        value={progressSearch}
                        onChange={(event) => setProgressSearch(event.target.value)}
                        placeholder="Search assessments, categories, batches, or certificates"
                      />
                      <Select
                        value={progressStatusFilter}
                        onValueChange={(value: 'all' | 'pass' | 'fail') => setProgressStatusFilter(value)}
                      >
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

                    {paginatedAttempts.map((attempt) => {
                      const coachingNotes = coachingNotesByAttempt.get(attempt.id) || []
                      const correctAnswers = attempt.questionResults.filter((result) => result.isCorrect).length

                      return (
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
                                {attempt.categoryTitle} | Attempt #{attempt.attemptNo} | {formatDateTime(attempt.submittedAt)}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {correctAnswers}/{attempt.questionResults.length} correct answers
                              </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <MiniScoreCard label="Score" value={`${attempt.score.toFixed(2)}%`} />
                              <MiniScoreCard label="Batch" value={attempt.batchName || 'Direct assignment'} />
                            </div>
                          </div>

                          {attempt.feedback ? (
                            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                              <div className="font-semibold">System feedback</div>
                              <div className="mt-1">{attempt.feedback}</div>
                            </div>
                          ) : null}

                          {attempt.trainerNote ? (
                            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                              <div className="font-semibold">Trainer note</div>
                              <div className="mt-1">{attempt.trainerNote}</div>
                            </div>
                          ) : null}

                          {coachingNotes.length ? (
                            <div className="mt-4 space-y-3">
                              {coachingNotes.map((note) => (
                                <div key={note.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">
                                      {note.visibility === 'shared' ? 'Shared coaching' : 'Private trainer note'}
                                    </Badge>
                                    <span className="text-xs text-slate-500">{formatDateTime(note.createdAt)}</span>
                                  </div>
                                  <div className="mt-2 text-sm text-slate-800">{note.note}</div>
                                  {note.actionItems ? (
                                    <div className="mt-2 text-xs text-slate-600">
                                      Action items: <span className="font-medium">{note.actionItems}</span>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}

                    {!paginatedAttempts.length ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                        No attempt history matches the current filters.
                      </div>
                    ) : null}

                    {filteredAttempts.length > ATTEMPTS_PER_PAGE ? (
                      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-slate-500">
                          Showing {paginatedAttempts.length} of {filteredAttempts.length} attempts
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={progressPage <= 1}
                            onClick={() => setProgressPage((current) => Math.max(1, current - 1))}
                          >
                            Previous
                          </Button>
                          <div className="inline-flex items-center rounded-xl border border-slate-200 px-3 text-sm text-slate-600">
                            Page {Math.min(progressPage, progressPageCount)} of {progressPageCount}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={progressPage >= progressPageCount}
                            onClick={() => setProgressPage((current) => Math.min(progressPageCount, current + 1))}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Latest Snapshot</CardTitle>
                      <CardDescription>Most recent result and coaching activity for quick review.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <SnapshotRow
                        icon={<Clock3 className="size-4 text-sky-700" />}
                        label="Latest attempt"
                        value={latestAttempt ? `${latestAttempt.assessmentTitle} | ${latestAttempt.score.toFixed(2)}%` : 'No attempt yet'}
                      />
                      <SnapshotRow
                        icon={<Medal className="size-4 text-emerald-700" />}
                        label="Certificates earned"
                        value={String(dashboard.certificates.length)}
                      />
                      <SnapshotRow
                        icon={<Award className="size-4 text-amber-700" />}
                        label="Latest certificate"
                        value={dashboard.certificates[0]?.certificateCode || 'Not earned yet'}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Coaching</CardTitle>
                      <CardDescription>Shared trainer coaching notes tied to your assessment attempts.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {recentCoachingNotes.length ? (
                        recentCoachingNotes.map((note) => (
                          <div key={note.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs text-slate-500">{formatDateTime(note.createdAt)}</div>
                            <div className="mt-2 text-sm font-medium text-slate-900">{note.note}</div>
                            {note.actionItems ? (
                              <div className="mt-1 text-xs text-slate-600">Action items: {note.actionItems}</div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                          Trainer coaching notes will appear here when feedback is added to one of your attempts.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="certificates" className="space-y-6">
          {!dashboard.certificates.length ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>No certificates earned yet</CardTitle>
                <CardDescription>
                  Pass an assigned assessment and the certificate will appear here automatically with its earned timestamp and certificate code.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" onClick={() => setActiveTab('available')}>
                  Open Available Tests
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Earned Certificates</CardTitle>
                  <CardDescription>Each passing category creates a durable certificate record in Supabase.</CardDescription>
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
                      <div className="mt-3 text-xs text-slate-500">Earned {formatDateTime(certificate.earnedAt)}</div>
                    </div>
                  ))}
                  {!filteredCertificates.length ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                      No certificates match the current search yet.
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-[linear-gradient(135deg,rgba(254,249,195,0.6),rgba(255,255,255,0.95))]">
                <CardHeader>
                  <CardTitle>Certificate Overview</CardTitle>
                  <CardDescription>Your completed categories stay visible here as proof of assessment completion.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <MetricCard
                      label="Certificates"
                      value={String(dashboard.certificates.length)}
                      icon={<Award className="size-4 text-amber-600" />}
                      hint="Assessment module"
                    />
                    <MetricCard
                      label="Categories Cleared"
                      value={String(new Set(dashboard.certificates.map((certificate) => certificate.categoryId)).size)}
                      icon={<CheckCircle2 className="size-4 text-emerald-600" />}
                      hint="Passing score reached"
                    />
                    <MetricCard
                      label="Latest Earned"
                      value={dashboard.certificates[0] ? formatDate(dashboard.certificates[0].earnedAt) : 'Today'}
                      icon={<Clock3 className="size-4 text-sky-600" />}
                      hint="Most recent unlock"
                    />
                  </div>

                  <div className="rounded-3xl border border-white/70 bg-white/80 p-5 text-sm leading-7 text-slate-700">
                    Once a passing score is recorded, the linked assessment remains visible in this Certificates section so you and your trainer can confirm completion without checking attempt history manually.
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button type="button" onClick={() => setActiveTab('progress')}>
                      Review My Progress
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setActiveTab('available')}>
                      Take Another Assessment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string
  value: string
  icon: React.ReactNode
  hint: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-600">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-slate-950">{value}</div>
        <div className="mt-1 text-xs text-slate-500">{hint}</div>
      </CardContent>
    </Card>
  )
}

function MiniScoreCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function SnapshotRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  )
}
