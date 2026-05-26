'use client'

import {
  ArrowRight,
  Award,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Loader2,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Target,
  XCircle,
} from 'lucide-react'
import type { ReactNode } from 'react'
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
type PlayerDisplayMode = 'overview' | 'review'

function getAssessmentState(
  assessment: TraineeAssessmentCard,
  options?: {
    isInProgress?: boolean
  },
) {
  if (options?.isInProgress) {
    return {
      label: 'In Progress',
      tone: 'border-sky-200 bg-sky-50 text-sky-700',
      actionLabel: 'Continue',
      disabled: false,
    }
  }

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
      label: 'Failed',
      tone: 'border-rose-200 bg-rose-50 text-rose-700',
      actionLabel: 'Failed',
      disabled: true,
    }
  }

  if (assessment.canRetake) {
    return {
      label: 'Completed',
      tone: 'border-violet-200 bg-violet-50 text-violet-700',
      actionLabel: 'Retake',
      disabled: false,
    }
  }

  return {
    label: 'Assigned',
    tone: 'border-sky-200 bg-sky-50 text-sky-700',
    actionLabel: 'Start',
    disabled: false,
  }
}

function getAssessmentPriority(assessment: TraineeAssessmentCard) {
  if (assessment.canStart && !assessment.latestAttempt) {
    return 4
  }
  if (assessment.canRetake) {
    return 3
  }
  if (assessment.latestAttempt?.status === 'fail') {
    return 2
  }
  if (assessment.latestAttempt?.status === 'pass') {
    return 1
  }
  return 0
}

function getSortableDate(value?: string | null, fallback = Number.MAX_SAFE_INTEGER) {
  if (!value) {
    return fallback
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? fallback : parsed
}

function sortAssessments(assessments: TraineeAssessmentCard[]) {
  return [...assessments].sort((left, right) => {
    const priorityDifference = getAssessmentPriority(right) - getAssessmentPriority(left)
    if (priorityDifference !== 0) {
      return priorityDifference
    }

    const dueDifference = getSortableDate(left.targetDueAt) - getSortableDate(right.targetDueAt)
    if (dueDifference !== 0) {
      return dueDifference
    }

    return (right.attemptCount || 0) - (left.attemptCount || 0)
  })
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

function getAssessmentErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback
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
  const [playerDisplayMode, setPlayerDisplayMode] = useState<PlayerDisplayMode>('overview')
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
      setError(getAssessmentErrorMessage(loadError, 'Unable to load your assigned assessments.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshDashboard()
  }, [refreshDashboard])

  const prioritizedAssessments = useMemo(
    () => sortAssessments(dashboard?.availableAssessments || []),
    [dashboard?.availableAssessments],
  )

  useEffect(() => {
    if (!prioritizedAssessments.length) {
      setSelectedAssignmentId('')
      return
    }

    setSelectedAssignmentId((current) =>
      prioritizedAssessments.some((assessment) => assessment.assignmentId === current)
        ? current
        : prioritizedAssessments[0].assignmentId,
    )
  }, [prioritizedAssessments])

  const filteredAssessments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return prioritizedAssessments.filter((assessment) => {
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
  }, [filter, prioritizedAssessments, search])

  useEffect(() => {
    if (playerMode === 'in_progress') {
      return
    }

    if (!filteredAssessments.length) {
      setSelectedAssignmentId('')
      return
    }

    if (!filteredAssessments.some((assessment) => assessment.assignmentId === selectedAssignmentId)) {
      setSelectedAssignmentId(filteredAssessments[0].assignmentId)
    }
  }, [filteredAssessments, playerMode, selectedAssignmentId])

  const loadAssessmentSession = useCallback(async (
    assignmentId: string,
    options: { displayMode?: PlayerDisplayMode } = {},
  ) => {
    try {
      setSessionLoading(true)
      setSessionError('')
      setPlayerDisplayMode(options.displayMode || 'overview')
      const payload = await fetchTraineeAssessmentSession(assignmentId)
      setActiveSession(payload)
      setSelectedAssignmentId(assignmentId)
    } catch (loadError) {
      setSessionError(getAssessmentErrorMessage(loadError, 'Unable to open this assigned assessment.'))
    } finally {
      setSessionLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedAssignmentId || playerMode === 'in_progress') {
      return
    }

    if (activeSession?.assignmentId === selectedAssignmentId) {
      return
    }

    void loadAssessmentSession(selectedAssignmentId, { displayMode: 'overview' })
  }, [activeSession?.assignmentId, loadAssessmentSession, playerMode, selectedAssignmentId])

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

  const selectedAssessment = useMemo(
    () =>
      prioritizedAssessments.find((assessment) => assessment.assignmentId === selectedAssignmentId)
      || filteredAssessments[0]
      || null,
    [filteredAssessments, prioritizedAssessments, selectedAssignmentId],
  )

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
          <CardTitle>Assigned Module Navigation</CardTitle>
          <CardDescription>
            Navigate between trainer-assigned modules here. The focused assignment opens below, with a clear Start, Retake, or View Result action based on your saved progress.
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
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="retake">Retake available</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!filteredAssessments.length ? (
            <EmptyState
              title="No assigned assessments found"
              description="Only saved trainer assignments appear here. Adjust the filters or wait for a trainer to assign a new assessment."
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="space-y-3">
                {filteredAssessments.map((assessment) => {
                  const state = getAssessmentState(assessment, {
                    isInProgress: assessment.assignmentId === activeSession?.assignmentId && playerMode === 'in_progress',
                  })
                  const isSelected = assessment.assignmentId === selectedAssessment?.assignmentId

                  return (
                    <button
                      key={assessment.assignmentId}
                      type="button"
                      onClick={() => setSelectedAssignmentId(assessment.assignmentId)}
                      className={`w-full rounded-3xl border p-4 text-left transition ${
                        isSelected
                          ? 'border-sky-400 bg-sky-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{assessment.categoryTitle}</Badge>
                            <Badge className={state.tone}>{assessment.statusLabel || state.label}</Badge>
                          </div>
                          <div className="mt-3 font-semibold text-slate-950">
                            {assessment.assignmentTitle || assessment.assessmentTitle}
                          </div>
                          <div className="mt-2 text-sm text-slate-600">
                            {assessment.latestAttempt
                              ? `Latest score ${assessment.latestAttempt.score.toFixed(2)}%`
                              : 'Ready for first attempt'}
                          </div>
                        </div>
                        <ArrowRight className={`mt-1 size-4 shrink-0 ${isSelected ? 'text-sky-700' : 'text-slate-400'}`} />
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <DetailChip label="Questions" value={String(assessment.questionCount)} />
                        <DetailChip
                          label="Attempts Left"
                          value={assessment.attemptsRemaining === null ? 'Unlimited' : String(assessment.attemptsRemaining)}
                        />
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedAssessment ? (
                <FocusedAssessmentCard
                  assessment={selectedAssessment}
                  activeSession={activeSession}
                  playerDisplayMode={playerDisplayMode}
                  playerMode={playerMode}
                  onContinue={focusAssessmentPlayer}
                  onOpenOverview={(assignmentId) => void loadAssessmentSession(assignmentId, { displayMode: 'overview' })}
                  onOpenReview={(assignmentId) => void loadAssessmentSession(assignmentId, { displayMode: 'review' })}
                  onOpenCertificates={() => router.push('/trainee/certificates')}
                />
              ) : null}
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
            displayMode={playerDisplayMode}
            onSubmitAssessment={submitAssessmentAttemptRequest}
            onAttemptCommitted={handleAttemptCommitted}
            onViewCertificates={() => router.push('/trainee/certificates')}
            onRetakeRequested={async (assignmentId) => {
              await loadAssessmentSession(assignmentId, { displayMode: 'overview' })
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

function FocusedAssessmentCard({
  assessment,
  activeSession,
  playerDisplayMode,
  playerMode,
  onContinue,
  onOpenOverview,
  onOpenReview,
  onOpenCertificates,
}: {
  assessment: TraineeAssessmentCard
  activeSession: TraineeAssessmentSession | null
  playerDisplayMode: PlayerDisplayMode
  playerMode: 'overview' | 'in_progress' | 'submitted'
  onContinue: () => void
  onOpenOverview: (assignmentId: string) => void
  onOpenReview: (assignmentId: string) => void
  onOpenCertificates: () => void
}) {
  const state = getAssessmentState(assessment, {
    isInProgress: activeSession?.assignmentId === assessment.assignmentId && playerMode === 'in_progress',
  })
  const isCurrentSession = activeSession?.assignmentId === assessment.assignmentId
  const isReviewing = isCurrentSession && playerDisplayMode === 'review'
  const showContinue = isCurrentSession && playerMode === 'in_progress' && !state.disabled
  const showFocusPlayer = isCurrentSession && playerMode === 'overview' && !state.disabled
  const primaryActionLabel = showContinue
    ? 'Continue Assessment'
    : showFocusPlayer
      ? assessment.canRetake
        ? 'Go to Retake'
        : 'Go to Start'
      : assessment.canRetake
        ? 'Open Retake'
        : 'Open Assessment'

  const handlePrimaryAction = () => {
    if (showContinue || showFocusPlayer) {
      onContinue()
      return
    }

    onOpenOverview(assessment.assignmentId)
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(224,242,254,0.7),transparent_32%),linear-gradient(160deg,rgba(255,255,255,0.99),rgba(248,250,252,0.98))] p-6 shadow-sm">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{assessment.categoryTitle}</Badge>
              <Badge className={state.tone}>{assessment.statusLabel || state.label}</Badge>
              <Badge variant="outline">Pass at {assessment.passingScore}%</Badge>
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Focused Assignment</div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                {assessment.assignmentTitle || assessment.assessmentTitle}
              </div>
              <div className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                {assessment.assessmentDescription || 'This trainer-assigned assessment is ready in the navigation flow below. Questions open one at a time, and the final item reveals the Submit button.'}
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FocusSnapshot
              label="Due Date"
              value={formatDateLabel(assessment.targetDueAt)}
              icon={<Clock3 className="size-4 text-sky-700" />}
            />
            <FocusSnapshot
              label="Target"
              value={assessment.targetLabel}
              icon={<Target className="size-4 text-slate-700" />}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DetailChip label="Questions" value={String(assessment.questionCount)} />
          <DetailChip label="Attempts Taken" value={assessment.maximumAttempts ? `${assessment.attemptCount || 0}/${assessment.maximumAttempts}` : `${assessment.attemptCount || 0}/Unlimited`} />
          <DetailChip
            label="Attempts Left"
            value={assessment.attemptsRemaining === null ? 'Unlimited' : String(assessment.attemptsRemaining)}
          />
          <DetailChip
            label="Latest Score"
            value={assessment.latestAttempt ? `${assessment.latestAttempt.score.toFixed(2)}%` : 'Assigned'}
          />
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/80 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-950">
                {assessment.latestAttempt?.status === 'pass'
                  ? 'This assigned module is complete and locked after passing.'
                  : assessment.latestAttempt?.status === 'fail' && !assessment.canRetake
                    ? 'All allowed attempts were used. The last saved score is now the final result for this assignment.'
                    : assessment.canRetake
                      ? 'The last score was below the passing rate. A retake is available while attempts remain.'
                      : 'This assigned module is ready to start.'}
              </div>
              <div className="text-sm text-slate-600">
                {isReviewing
                  ? 'Saved review is currently open below.'
                  : 'Open the assignment, answer each question one at a time, and submit on the final question to save the result.'}
              </div>
              {assessment.latestAttempt ? (
                <div className={`inline-flex rounded-2xl border px-4 py-2 text-sm ${getAttemptTone(assessment.latestAttempt.status)}`}>
                  Attempt #{assessment.latestAttempt.attemptNo} saved on {formatDateTimeLabel(assessment.latestAttempt.completedAt || assessment.latestAttempt.submittedAt)}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              {!state.disabled ? (
                <Button type="button" onClick={handlePrimaryAction}>
                  {showContinue ? <BookOpenCheck className="size-4" /> : assessment.canRetake ? <RotateCcw className="size-4" /> : <PlayCircle className="size-4" />}
                  {primaryActionLabel}
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled>
                  {assessment.latestAttempt?.status === 'pass' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                  {state.actionLabel}
                </Button>
              )}
              {assessment.latestAttempt ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenReview(assessment.assignmentId)}
                >
                  <BookOpenCheck className="size-4" />
                  View Saved Result
                </Button>
              ) : null}
              {assessment.certificate ? (
                <Button type="button" variant="outline" onClick={onOpenCertificates}>
                  <Award className="size-4" />
                  Certificates
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FocusSnapshot({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-950">{value}</div>
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
