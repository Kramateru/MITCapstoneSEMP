'use client'

import {
  Award,
  BookOpenCheck,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Target,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

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
  AssessmentWorkspaceHero,
  EmptyState,
  MetricCard,
  formatDateLabel,
  formatDateTimeLabel,
  getAttemptTone,
} from '@/app/components/assessment/shared/assessment-ui'
import {
  fetchTraineeAssessmentDashboard,
  fetchTraineeAssessmentSession,
  submitAssessmentAttemptRequest,
} from '@/app/lib/assessment/client'
import type {
  TraineeAssessmentCard,
  TraineeAssessmentSession,
  TraineeDashboardResponse,
} from '@/app/lib/assessment/types'

import { AssessmentPlayer } from './assessment-player'

type AssessmentFilter = 'all' | 'assigned' | 'retake' | 'passed' | 'failed'

function getAssessmentState(assessment: TraineeAssessmentCard) {
  if (assessment.latestAttempt?.status === 'pass') {
    return {
      label: 'Passed',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      actionLabel: 'Completed',
      disabled: true,
    }
  }

  if (assessment.latestAttempt?.status === 'fail' && !assessment.canRetake) {
    return {
      label: 'Attempts Used',
      tone: 'border-rose-200 bg-rose-50 text-rose-700',
      actionLabel: 'Attempts Used',
      disabled: true,
    }
  }

  if (assessment.canRetake) {
    return {
      label: 'Failed',
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
      actionLabel: 'Retake',
      disabled: false,
    }
  }

  return {
    label: 'Not Started',
    tone: 'border-sky-200 bg-sky-50 text-sky-700',
    actionLabel: 'Start',
    disabled: false,
  }
}

function matchesFilter(assessment: TraineeAssessmentCard, filter: AssessmentFilter) {
  if (filter === 'all') {
    return true
  }
  if (filter === 'assigned') {
    return !assessment.latestAttempt
  }
  if (filter === 'retake') {
    return assessment.canRetake
  }
  if (filter === 'passed') {
    return assessment.latestAttempt?.status === 'pass'
  }
  return assessment.latestAttempt?.status === 'fail' && !assessment.canRetake
}

export function TraineeAssessmentWorkspace() {
  const router = useRouter()

  const [dashboard, setDashboard] = useState<TraineeDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<AssessmentFilter>('all')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const [activeSession, setActiveSession] = useState<TraineeAssessmentSession | null>(null)
  const [playerMode, setPlayerMode] = useState<'overview' | 'in_progress' | 'submitted'>('overview')

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
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your assigned assessments.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshDashboard()
  }, [refreshDashboard])

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

  const filteredAssessments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return (dashboard?.availableAssessments || []).filter((assessment) => {
      if (!matchesFilter(assessment, filter)) {
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
  }, [dashboard?.availableAssessments, filter, search])

  const loadAssessmentSession = useCallback(async (assignmentId: string) => {
    try {
      setSessionLoading(true)
      setSessionError('')
      const payload = await fetchTraineeAssessmentSession(assignmentId)
      setActiveSession(payload)
      setSelectedAssignmentId(assignmentId)
    } catch (loadError) {
      console.error(loadError)
      setSessionError(loadError instanceof Error ? loadError.message : 'Unable to open this assigned assessment.')
    } finally {
      setSessionLoading(false)
    }
  }, [])

  const focusAssessmentPlayer = useCallback(() => {
    if (typeof document === 'undefined') {
      return
    }

    document.getElementById('trainee-assessment-player')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [])

  const handleAttemptCommitted = useCallback(async () => {
    await refreshDashboard('refresh')
  }, [refreshDashboard])

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading assigned assessments...
      </div>
    )
  }

  if (!dashboard) {
    return (
      <Card className="border-amber-200 bg-amber-50/80">
        <CardHeader>
          <CardTitle>Assessment page unavailable</CardTitle>
          <CardDescription>
            Your assigned assessment page could not load right now.
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
      <AssessmentWorkspaceHero
        eyebrow="Trainee Assessments"
        title="Assigned Assessments"
        description="Only trainer-assigned assessment modules saved in the database appear here. Start one assignment at a time, answer each question in order, and submit your result to save your pass or fail status."
        actions={(
          <Button type="button" variant="outline" onClick={() => void refreshDashboard('refresh')} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        )}
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

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
          hint="Saved submissions"
          icon={<CheckCircle2 className="size-4 text-slate-700" />}
        />
        <MetricCard
          label="Passed"
          value={String(dashboard.stats.passedCount)}
          hint="Locked after passing"
          icon={<Award className="size-4 text-emerald-600" />}
        />
        <MetricCard
          label="Retakes"
          value={String(dashboard.stats.retakeCount || 0)}
          hint="Still below passing rate"
          icon={<RotateCcw className="size-4 text-amber-600" />}
        />
        <MetricCard
          label="Average Score"
          value={`${dashboard.stats.averageScore.toFixed(2)}%`}
          hint={`${dashboard.stats.certificateCount || 0} certificates earned`}
          icon={<Target className="size-4 text-violet-600" />}
        />
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Assessment Queue</CardTitle>
          <CardDescription>
            Each card below is a real trainer assignment from the database. Only assigned items appear here, and failed items can only be retaken while attempts remain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search assessment, category, or target"
                className="pl-9"
              />
            </div>
            <Select value={filter} onValueChange={(value: AssessmentFilter) => setFilter(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assigned items</SelectItem>
                <SelectItem value="assigned">Not started</SelectItem>
                <SelectItem value="retake">Retake available</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="failed">Attempts used</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!filteredAssessments.length ? (
            <EmptyState
              title="No assigned assessments found"
              description="Only saved trainer assignments appear here. Adjust the filters or wait for a trainer to assign a new assessment."
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredAssessments.map((assessment) => {
                const state = getAssessmentState(assessment)
                const isSelected = assessment.assignmentId === selectedAssignmentId
                const isCurrentPlayerAssignment = activeSession?.assignmentId === assessment.assignmentId
                const showContinue = isCurrentPlayerAssignment && playerMode === 'in_progress' && !state.disabled
                const primaryActionLabel = showContinue
                  ? 'Continue'
                  : assessment.canRetake
                    ? 'Retake'
                    : state.actionLabel
                const handlePrimaryAction = () => {
                  if (showContinue) {
                    focusAssessmentPlayer()
                    return
                  }

                  void loadAssessmentSession(assessment.assignmentId)
                }

                return (
                  <div
                    key={assessment.assignmentId}
                    onClick={() => setSelectedAssignmentId(assessment.assignmentId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedAssignmentId(assessment.assignmentId)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className={`rounded-3xl border p-5 text-left transition ${
                      isSelected
                        ? 'border-sky-400 bg-sky-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{assessment.categoryTitle}</Badge>
                            <Badge className={state.tone}>{assessment.statusLabel || state.label}</Badge>
                          </div>
                          <div className="mt-3 text-xl font-semibold text-slate-950">
                            {assessment.assignmentTitle || assessment.assessmentTitle}
                          </div>
                          <div className="mt-2 text-sm text-slate-600">
                            {assessment.assessmentDescription || 'No description was saved for this assigned assessment.'}
                          </div>
                        </div>
                        {assessment.certificate ? (
                          <Badge variant="outline">{assessment.certificate.certificateCode}</Badge>
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailChip label="Passing Rate" value={`${assessment.passingScore}%`} />
                        <DetailChip
                          label="Attempts"
                          value={
                            assessment.maximumAttempts
                              ? `${assessment.attemptCount || 0}/${assessment.maximumAttempts}`
                              : `${assessment.attemptCount || 0}/Unlimited`
                          }
                        />
                        <DetailChip
                          label="Attempts Left"
                          value={assessment.attemptsRemaining === null ? 'Unlimited' : String(assessment.attemptsRemaining)}
                        />
                        <DetailChip
                          label="Status"
                          value={assessment.statusLabel || state.label}
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailChip label="Target" value={assessment.targetLabel} />
                        <DetailChip label="Due Date" value={formatDateLabel(assessment.targetDueAt)} />
                        <DetailChip label="Questions" value={String(assessment.questionCount)} />
                        <DetailChip
                          label="Latest Score"
                          value={assessment.latestAttempt ? `${assessment.latestAttempt.score.toFixed(2)}%` : 'Not started'}
                        />
                      </div>

                      {assessment.latestAttempt ? (
                        <div className={`rounded-2xl border px-4 py-3 text-sm ${getAttemptTone(assessment.latestAttempt.status)}`}>
                          Latest submission: Attempt #{assessment.latestAttempt.attemptNo} on{' '}
                          {formatDateTimeLabel(assessment.latestAttempt.completedAt || assessment.latestAttempt.submittedAt)}.
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-3">
                        {state.disabled ? (
                          <>
                            <Button type="button" variant="outline" disabled>
                              {assessment.latestAttempt?.status === 'pass' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                              {state.actionLabel}
                            </Button>
                            {assessment.latestAttempt ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void loadAssessmentSession(assessment.assignmentId)
                                }}
                              >
                                View Result
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handlePrimaryAction()
                            }}
                          >
                            {showContinue ? <BookOpenCheck className="size-4" /> : assessment.canRetake ? <RotateCcw className="size-4" /> : <BookOpenCheck className="size-4" />}
                            {primaryActionLabel}
                          </Button>
                        )}
                        {!state.disabled && assessment.latestAttempt ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation()
                              void loadAssessmentSession(assessment.assignmentId)
                            }}
                          >
                            View Result
                          </Button>
                        ) : null}
                        {assessment.certificate ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation()
                              router.push('/trainee/certificates')
                            }}
                          >
                            <Award className="size-4" />
                            Certificates
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {sessionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {sessionError}
        </div>
      ) : null}

      {sessionLoading ? (
        <div id="trainee-assessment-player" className="flex min-h-[240px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-600">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading selected assessment...
        </div>
      ) : (
        <div id="trainee-assessment-player">
          <AssessmentPlayer
            assessment={activeSession}
            onSubmitAssessment={submitAssessmentAttemptRequest}
            onAttemptCommitted={handleAttemptCommitted}
            onViewCertificates={() => router.push('/trainee/certificates')}
            onRetakeRequested={async (assignmentId) => {
              await loadAssessmentSession(assignmentId)
            }}
            onModeChange={setPlayerMode}
          />
        </div>
      )}

      {dashboard.attempts.length ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Recent Saved Results</CardTitle>
            <CardDescription>
              These are the latest assessment attempts already saved in the database for your trainee account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.attempts.slice(0, 6).map((attempt) => (
              <div key={attempt.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-slate-950">{attempt.assessmentTitle}</div>
                      <Badge className={getAttemptTone(attempt.status)}>
                        {attempt.statusLabel || (attempt.status === 'pass' ? 'Passed' : 'Failed')}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {attempt.categoryTitle} | Attempt #{attempt.attemptNo} | {formatDateTimeLabel(attempt.completedAt || attempt.submittedAt)}
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      {attempt.feedback || 'Assessment result saved.'}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <DetailChip label="Score" value={`${attempt.score.toFixed(2)}%`} />
                    <DetailChip label="Passing Rate" value={`${(attempt.passingScore || 0).toFixed(2)}%`} />
                    <DetailChip
                      label="Correct"
                      value={String(attempt.correctAnswers ?? attempt.questionResults.filter((result) => result.isCorrect).length)}
                    />
                    <DetailChip label="Time" value={attempt.timeSpentSeconds ? `${attempt.timeSpentSeconds}s` : '0s'} />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {!dashboard.availableAssessments.length ? (
        <EmptyState
          title="No trainer assignments yet"
          description="Only assessments assigned by a trainer or batch will appear here. Unassigned assessments are hidden from the trainee role."
        />
      ) : null}
    </div>
  )
}

function DetailChip({
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
