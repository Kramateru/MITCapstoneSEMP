'use client'

import confetti from 'canvas-confetti'
import {
  Award,
  CheckCircle2,
  Clock3,
  Loader2,
  PlayCircle,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/app/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Progress } from '@/app/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group'
import { normalizeAssessmentAnswer } from '@/app/lib/assessment/scoring'
import type {
  SubmitAssessmentResponse,
  TraineeAssessmentSession,
} from '@/app/lib/assessment/types'

type QuestionAnswerMap = Record<string, string>
type StoredAssessmentDraft = {
  assignmentId: string
  assessmentId: string
  answers: QuestionAnswerMap
  currentQuestionIndex: number
  startedAtMs: number
}

const ASSESSMENT_DRAFT_STORAGE_PREFIX = 'spv-assessment-draft:'

function getAssessmentDraftStorageKey(assignmentId: string) {
  return `${ASSESSMENT_DRAFT_STORAGE_PREFIX}${assignmentId}`
}

function clearStoredAssessmentDraft(assignmentId?: string | null) {
  if (typeof window === 'undefined' || !assignmentId) {
    return
  }

  window.localStorage.removeItem(getAssessmentDraftStorageKey(assignmentId))
}

function readStoredAssessmentDraft(
  assessment: TraineeAssessmentSession | null,
  totalQuestions: number,
) {
  if (typeof window === 'undefined' || !assessment) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(getAssessmentDraftStorageKey(assessment.assignmentId))
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<StoredAssessmentDraft>
    if (
      parsed.assignmentId !== assessment.assignmentId
      || parsed.assessmentId !== assessment.assessmentId
      || typeof parsed.startedAtMs !== 'number'
      || !Number.isFinite(parsed.startedAtMs)
    ) {
      clearStoredAssessmentDraft(assessment.assignmentId)
      return null
    }

    const answers = parsed.answers && typeof parsed.answers === 'object'
      ? Object.fromEntries(
          Object.entries(parsed.answers).map(([questionId, value]) => [questionId, String(value || '')]),
        )
      : {}
    const currentQuestionIndex = Math.max(
      0,
      Math.min(
        Number.isFinite(Number(parsed.currentQuestionIndex)) ? Number(parsed.currentQuestionIndex) : 0,
        Math.max(totalQuestions - 1, 0),
      ),
    )

    return {
      assignmentId: assessment.assignmentId,
      assessmentId: assessment.assessmentId,
      answers,
      currentQuestionIndex,
      startedAtMs: parsed.startedAtMs,
    } satisfies StoredAssessmentDraft
  } catch {
    clearStoredAssessmentDraft(assessment.assignmentId)
    return null
  }
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

function formatDuration(totalSeconds?: number | null) {
  const value = Math.max(Number(totalSeconds || 0), 0)
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function getStatusTone(status?: 'pass' | 'fail') {
  if (status === 'pass') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  if (status === 'fail') {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  return 'border-slate-200 bg-slate-50 text-slate-800'
}

function getQuestionAnswerMap(assessment: TraineeAssessmentSession | null) {
  if (!assessment) {
    return {}
  }

  return Object.fromEntries(
    assessment.questions.map((question) => [question.id, question.choices]),
  ) satisfies Record<string, string[]>
}

function formatTotalScore(
  submission: SubmitAssessmentResponse | null,
  correctAnswers: number,
  totalQuestions: number,
) {
  const earnedPoints = submission?.attempt.analysis?.earnedPoints
  const totalPoints = submission?.attempt.analysis?.totalPoints
  if (typeof earnedPoints === 'number' && typeof totalPoints === 'number' && totalPoints > 0) {
    return `${earnedPoints}/${totalPoints}`
  }

  return `${correctAnswers}/${totalQuestions}`
}

export function AssessmentPlayer({
  assessment,
  displayMode = 'overview',
  onSubmitAssessment,
  onAttemptCommitted,
  onViewCertificates,
  onRetakeRequested,
  onModeChange,
}: {
  assessment: TraineeAssessmentSession | null
  displayMode?: 'overview' | 'review'
  onSubmitAssessment: (payload: {
    assignmentId: string
    assessmentId: string
    answers: Record<string, string>
    questionIds: string[]
    choiceMap: Record<string, string[]>
    timeSpentSeconds: number
    startedAt: string
  }) => Promise<SubmitAssessmentResponse>
  onAttemptCommitted: (result: SubmitAssessmentResponse) => Promise<void>
  onViewCertificates: () => void
  onRetakeRequested: (assignmentId: string) => Promise<void>
  onModeChange?: (mode: 'overview' | 'in_progress' | 'submitted') => void
}) {
  const [mode, setMode] = useState<'overview' | 'in_progress' | 'submitted'>('overview')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<QuestionAnswerMap>({})
  const [submitting, setSubmitting] = useState(false)
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [submission, setSubmission] = useState<SubmitAssessmentResponse | null>(null)
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false)

  const questionIds = useMemo(
    () => assessment?.questions.map((question) => question.id) || [],
    [assessment],
  )
  const choiceMap = useMemo(() => getQuestionAnswerMap(assessment), [assessment])
  const answeredCount = useMemo(
    () =>
      questionIds.filter((questionId) => normalizeAssessmentAnswer(answers[questionId] || '') !== '').length,
    [answers, questionIds],
  )
  const totalQuestions = assessment?.questions.length || 0
  const progressValue = totalQuestions > 0 ? Number(((answeredCount / totalQuestions) * 100).toFixed(2)) : 0
  const currentQuestion = assessment?.questions[currentQuestionIndex] || null
  const timeLimitSeconds = assessment?.timeLimitMinutes ? assessment.timeLimitMinutes * 60 : null

  useEffect(() => {
    const nextSubmission = displayMode === 'review' && assessment?.latestAttempt
      ? {
          attempt: assessment.latestAttempt,
          certificate: assessment.certificate ?? null,
        }
      : null
    const restoredDraft = !nextSubmission
      ? readStoredAssessmentDraft(assessment, totalQuestions)
      : null

    if (nextSubmission) {
      clearStoredAssessmentDraft(assessment?.assignmentId)
    }

    setMode(nextSubmission ? 'submitted' : restoredDraft ? 'in_progress' : 'overview')
    setCurrentQuestionIndex(restoredDraft?.currentQuestionIndex ?? 0)
    setAnswers(restoredDraft?.answers ?? {})
    setSubmitting(false)
    setStartedAtMs(restoredDraft?.startedAtMs ?? null)
    setRemainingSeconds(
      restoredDraft?.startedAtMs && timeLimitSeconds
        ? Math.max(timeLimitSeconds - Math.max(Math.floor((Date.now() - restoredDraft.startedAtMs) / 1000), 0), 0)
        : timeLimitSeconds,
    )
    setSubmission(nextSubmission)
    setConfirmSubmitOpen(false)
  }, [
    assessment,
    assessment?.assignmentId,
    assessment?.certificate?.id,
    assessment?.latestAttempt?.id,
    displayMode,
    timeLimitSeconds,
    totalQuestions,
  ])

  useEffect(() => {
    onModeChange?.(mode)
  }, [mode, onModeChange])

  useEffect(() => {
    if (mode !== 'in_progress' || !timeLimitSeconds || !startedAtMs) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      const elapsedSeconds = Math.max(Math.floor((Date.now() - startedAtMs) / 1000), 0)
      const nextRemaining = Math.max(timeLimitSeconds - elapsedSeconds, 0)
      setRemainingSeconds(nextRemaining)
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [mode, startedAtMs, timeLimitSeconds])

  useEffect(() => {
    if (!assessment) {
      return
    }

    if (mode === 'submitted') {
      clearStoredAssessmentDraft(assessment.assignmentId)
      return
    }

    if (mode !== 'in_progress' || !startedAtMs) {
      return
    }

    const payload: StoredAssessmentDraft = {
      assignmentId: assessment.assignmentId,
      assessmentId: assessment.assessmentId,
      answers,
      currentQuestionIndex,
      startedAtMs,
    }

    try {
      window.localStorage.setItem(
        getAssessmentDraftStorageKey(assessment.assignmentId),
        JSON.stringify(payload),
      )
    } catch {
      // Keep the active assessment usable even if local draft persistence is unavailable.
    }
  }, [answers, assessment, currentQuestionIndex, mode, startedAtMs])

  const handleStartAssessment = () => {
    if (!assessment) {
      return
    }

    if (assessment.canStart === false || (!assessment.canRetake && (assessment.isCompleted || assessment.attemptsRemaining === 0))) {
      toast.error('This assigned assessment is already locked.')
      return
    }

    setMode('in_progress')
    setCurrentQuestionIndex(0)
    setAnswers({})
    setSubmission(null)
    setStartedAtMs(Date.now())
    setRemainingSeconds(timeLimitSeconds)
  }

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: value,
    }))
  }

  const handleSubmitAssessment = useCallback(async (allowPartial = false) => {
    if (!assessment || !questionIds.length) {
      return
    }

    if (!allowPartial && answeredCount !== questionIds.length) {
      toast.error('Answer every question before submitting the assessment.')
      return
    }

    const startedAt = startedAtMs ? new Date(startedAtMs).toISOString() : new Date().toISOString()
    const timeSpentSeconds = startedAtMs ? Math.max(Math.floor((Date.now() - startedAtMs) / 1000), 0) : 0

    setSubmitting(true)
    try {
      const result = await onSubmitAssessment({
        assignmentId: assessment.assignmentId,
        assessmentId: assessment.assessmentId,
        answers,
        questionIds,
        choiceMap,
        timeSpentSeconds,
        startedAt,
      })

      setSubmission(result)
      setMode('submitted')
      clearStoredAssessmentDraft(assessment.assignmentId)

      if (result.attempt.status === 'pass') {
        void confetti({
          particleCount: 140,
          spread: 72,
          origin: { y: 0.6 },
        })
        toast.success('Passing score achieved. The assessment is now locked as completed.')
      } else if (result.attempt.canRetake) {
        toast.error('Passing score not reached yet. Your result is saved, and you can retake while attempts remain.')
      } else {
        toast.error('The final allowed attempt has been used. The saved result is now locked.')
      }

      await onAttemptCommitted(result)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to submit this assessment.')
    } finally {
      setSubmitting(false)
    }
  }, [
    answeredCount,
    answers,
    assessment,
    choiceMap,
    onAttemptCommitted,
    onSubmitAssessment,
    questionIds,
    startedAtMs,
  ])

  useEffect(() => {
    if (mode !== 'in_progress' || !assessment || !timeLimitSeconds || remainingSeconds !== 0 || submitting) {
      return
    }

    toast.error('Time is up. Your assessment is being submitted automatically.')
    void handleSubmitAssessment(true)
  }, [assessment, handleSubmitAssessment, mode, remainingSeconds, submitting, timeLimitSeconds])

  const handleRetake = async () => {
    if (!assessment) {
      return
    }

    clearStoredAssessmentDraft(assessment.assignmentId)
    await onRetakeRequested(assessment.assignmentId)
  }

  const handleConfirmSubmit = async () => {
    setConfirmSubmitOpen(false)
    await handleSubmitAssessment(false)
  }

  const latestAttempt = submission?.attempt || assessment?.latestAttempt || null
  const hasSavedReview = Boolean(latestAttempt?.questionResults?.length)
  const correctAnswers = latestAttempt?.correctAnswers ?? latestAttempt?.questionResults.filter((result) => result.isCorrect).length ?? 0
  const remainingAttempts = submission?.attempt.attemptsRemaining ?? assessment?.attemptsRemaining ?? null
  const passingScore = submission?.attempt.passingScore ?? assessment?.passingScore ?? 0
  const canStartAssessment = assessment?.canStart ?? (
    assessment?.attemptsRemaining === null
      || typeof assessment?.attemptsRemaining === 'undefined'
      || assessment.attemptsRemaining > 0
  )
  const canRetakeAfterSubmission = Boolean(
    submission
      && submission.attempt.status === 'fail'
      && (submission.attempt.canRetake || remainingAttempts === null || remainingAttempts > 0),
  )
  const overviewStatusLabel = mode === 'in_progress'
    ? 'In Progress'
    : assessment?.statusLabel || (assessment?.isCompleted ? 'Passed' : assessment?.canRetake ? 'Failed' : 'Not Started')
  const latestAttemptStatusLabel = assessment?.statusLabel === 'Attempts Used'
    ? 'Attempts Used'
    : latestAttempt?.status === 'pass'
      ? 'Passed'
      : 'Failed'

  if (!assessment) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Choose an assigned assessment</CardTitle>
          <CardDescription>
            Select one of your saved assessment assignments to open the question flow.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!assessment.questions.length && !hasSavedReview) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>No active questions were found</CardTitle>
          <CardDescription>
            This assigned assessment does not currently have a saved question set. Please contact your trainer.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="border-slate-200 bg-white/95 shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{assessment.categoryTitle}</Badge>
              <Badge variant="outline">{assessment.questionCount} questions</Badge>
              <Badge variant="outline">Pass at {assessment.passingScore}%</Badge>
              {assessment.maximumAttempts ? (
                <Badge variant="outline">{assessment.attemptCount || 0}/{assessment.maximumAttempts} attempts used</Badge>
              ) : (
                <Badge variant="outline">Unlimited attempts</Badge>
              )}
            </div>
            <CardTitle className="text-2xl text-slate-950">{assessment.assignmentTitle || assessment.assessmentTitle}</CardTitle>
            <CardDescription className="max-w-3xl text-sm text-slate-600">
              {assessment.description || 'Open the assigned question set, answer one question at a time, and submit to save your result in the database.'}
            </CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SnapshotTile label="Due Date" value={formatDate(assessment.targetDueAt)} icon={<Clock3 className="size-4 text-sky-700" />} />
            <SnapshotTile label="Status" value={overviewStatusLabel} icon={<CheckCircle2 className="size-4 text-slate-700" />} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {mode === 'overview' ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <ResultTile label="Question Count" value={String(assessment.questionCount)} />
              <ResultTile label="Passing Rate" value={`${assessment.passingScore}%`} />
              <ResultTile
                label="Attempts Left"
                value={assessment.attemptsRemaining === null ? 'Unlimited' : String(assessment.attemptsRemaining)}
              />
              <ResultTile
                label="Current Attempt"
                value={assessment.attemptCount ? String(assessment.attemptCount) : '0'}
              />
            </div>

            {assessment.latestAttempt ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${getStatusTone(assessment.latestAttempt.status)}`}>
                <div className="font-semibold">
                  Latest saved result: {latestAttemptStatusLabel}
                </div>
                <div className="mt-1">
                  Attempt #{assessment.latestAttempt.attemptNo} scored {assessment.latestAttempt.score.toFixed(2)}% on{' '}
                  {formatDateTime(assessment.latestAttempt.completedAt || assessment.latestAttempt.submittedAt)}.
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,rgba(240,249,255,0.95),rgba(255,255,255,0.95))] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Assessment Flow</div>
                  <div className="text-sm text-slate-700">
                    Questions are shown one at a time. Use Next to move forward, then Submit on the final question to save your result.
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {canStartAssessment && !assessment.isCompleted ? (
                    <Button type="button" onClick={handleStartAssessment}>
                      {assessment.canRetake ? <RotateCcw className="size-4" /> : <PlayCircle className="size-4" />}
                      {assessment.canRetake ? 'Start Retake' : 'Start Assessment'}
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" disabled>
                      {assessment.latestAttempt?.status === 'pass' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                      {assessment.latestAttempt?.status === 'pass' ? 'Completed' : 'Attempts Used'}
                    </Button>
                  )}
                  {assessment.certificate ? (
                    <Button type="button" variant="outline" onClick={onViewCertificates}>
                      <Award className="size-4" />
                      Open Certificate
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {mode === 'in_progress' && currentQuestion ? (
          <>
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-900">
                    Question {currentQuestionIndex + 1} of {totalQuestions}
                  </div>
                  <div className="text-xs text-slate-500">
                    {answeredCount} answered so far. The final question will show the Submit button.
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                  <span>Progress {progressValue.toFixed(0)}%</span>
                  <span>{remainingSeconds === null ? 'Untimed' : `${formatDuration(remainingSeconds)} left`}</span>
                </div>
              </div>
              <Progress value={progressValue} className="h-2.5" />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <SnapshotTile label="Answered" value={`${answeredCount}/${totalQuestions}`} icon={<CheckCircle2 className="size-4 text-emerald-700" />} />
              <SnapshotTile label="Passing Rate" value={`${assessment.passingScore}%`} icon={<CheckCircle2 className="size-4 text-sky-700" />} />
              <SnapshotTile
                label="Time Left"
                value={remainingSeconds === null ? 'Untimed' : formatDuration(remainingSeconds)}
                icon={<Clock3 className="size-4 text-amber-700" />}
              />
              <SnapshotTile label="Due Date" value={formatDate(assessment.targetDueAt)} icon={<Clock3 className="size-4 text-slate-700" />} />
            </div>

            <QuestionCard
              question={currentQuestion}
              index={currentQuestionIndex}
              totalQuestions={totalQuestions}
              answer={answers[currentQuestion.id] || ''}
              onAnswerChange={handleAnswerChange}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex((current) => Math.max(current - 1, 0))}
              >
                Previous
              </Button>
              <div className="flex flex-wrap gap-2">
                {assessment.questions.map((question, index) => {
                  const isAnswered = normalizeAssessmentAnswer(answers[question.id] || '') !== ''
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => setCurrentQuestionIndex(index)}
                      className={`inline-flex size-10 items-center justify-center rounded-2xl border text-sm font-semibold transition ${
                        currentQuestionIndex === index
                          ? 'border-sky-400 bg-sky-50 text-sky-700'
                          : isAnswered
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {index + 1}
                    </button>
                  )
                })}
              </div>
              <Button
                type="button"
                onClick={() =>
                  currentQuestionIndex === totalQuestions - 1
                    ? setConfirmSubmitOpen(true)
                    : setCurrentQuestionIndex((current) => Math.min(current + 1, totalQuestions - 1))
                }
                disabled={submitting}
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {currentQuestionIndex === totalQuestions - 1 ? 'Submit' : 'Next'}
              </Button>
            </div>
          </>
        ) : null}

        {mode === 'submitted' && submission ? (
          <>
            <div className={`rounded-3xl border px-5 py-5 ${getStatusTone(submission.attempt.status)}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {submission.attempt.status === 'pass' ? (
                      <CheckCircle2 className="size-8 text-emerald-600" />
                    ) : (
                      <XCircle className="size-8 text-amber-600" />
                    )}
                    <div>
                      <div className="text-2xl font-bold text-slate-950">
                        {submission.attempt.status === 'pass' ? 'Assessment passed' : 'Assessment failed'}
                      </div>
                      <div className="text-sm text-slate-600">
                        Attempt #{submission.attempt.attemptNo} saved on {formatDateTime(submission.attempt.completedAt || submission.attempt.submittedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-700">
                    {submission.attempt.feedback || 'Your assessment attempt has been saved successfully.'}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <ResultTile label="Total Score" value={formatTotalScore(submission, correctAnswers, submission.attempt.totalQuestions || totalQuestions)} />
                  <ResultTile label="Percentage" value={`${submission.attempt.score.toFixed(2)}%`} />
                  <ResultTile label="Passing Rate" value={`${passingScore.toFixed(2)}%`} />
                  <ResultTile label="Status" value={submission.attempt.statusLabel || (submission.attempt.status === 'pass' ? 'Passed' : 'Failed')} />
                  <ResultTile label="Remaining Attempts" value={remainingAttempts === null ? 'Unlimited' : String(remainingAttempts)} />
                  <ResultTile label="Time Spent" value={formatDuration(submission.attempt.timeSpentSeconds)} />
                </div>
              </div>
            </div>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Next Steps</CardTitle>
                <CardDescription>
                  Continue from this saved result based on your score and remaining attempts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-slate-700">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    {submission.attempt.status === 'pass'
                      ? 'You reached the required passing score. This assessment is saved as completed.'
                      : canRetakeAfterSubmission
                        ? 'You can retake this assessment from the dashboard while attempts remain.'
                        : 'No more retakes are available for this assessment assignment.'}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    Remaining attempts:{' '}
                    <span className="font-semibold">
                      {remainingAttempts === null ? 'Unlimited' : String(remainingAttempts)}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    {submission.certificate
                      ? 'Your certificate is ready to open from the certificates workspace.'
                      : 'Use the dashboard and assignment list to continue with your next required training step.'}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-3">
              {canRetakeAfterSubmission ? (
                <Button type="button" onClick={() => void handleRetake()}>
                  <RotateCcw className="size-4" />
                  Retake Assessment
                </Button>
              ) : null}
              {submission.certificate ? (
                <Button type="button" variant="outline" onClick={onViewCertificates}>
                  <Award className="size-4" />
                  Open Certificate
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>

      <AlertDialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit assessment now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will save attempt #{(assessment.attemptCount || 0) + 1} to the database and calculate your final result for this submission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Review Answers</AlertDialogCancel>
            <AlertDialogAction disabled={submitting} onClick={() => void handleConfirmSubmit()}>
              {submitting ? 'Submitting...' : 'Confirm Submit'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function QuestionCard({
  question,
  index,
  totalQuestions,
  answer,
  onAnswerChange,
}: {
  question: TraineeAssessmentSession['questions'][number]
  index: number
  totalQuestions: number
  answer: string
  onAnswerChange: (questionId: string, value: string) => void
}) {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg text-slate-950">
              Question {index + 1} of {totalQuestions}
            </CardTitle>
            <CardDescription className="mt-2 text-base leading-7 text-slate-700">
              {question.questionText}
            </CardDescription>
          </div>
          <Badge variant="outline">
            {question.questionType === 'multiple_choice' ? 'Multiple Choice' : 'Fill in the Blank'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {question.questionType === 'multiple_choice' ? (
          <RadioGroup value={answer} onValueChange={(value) => onAnswerChange(question.id, value)} className="space-y-3">
            {question.choices.map((choice, optionIndex) => (
              <label
                key={`${question.id}-${optionIndex}`}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                  answer === choice
                    ? 'border-sky-300 bg-sky-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <RadioGroupItem value={choice} id={`${question.id}-${optionIndex}`} className="mt-1" />
                <div className="flex-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Option {String.fromCharCode(65 + optionIndex)}
                  </div>
                  <div className="mt-1 text-sm text-slate-800">{choice}</div>
                </div>
              </label>
            ))}
          </RadioGroup>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={`${question.id}-answer`}>Your answer</Label>
            <Input
              id={`${question.id}-answer`}
              value={answer}
              onChange={(event) => onAnswerChange(question.id, event.target.value)}
              placeholder="Type your answer"
            />
            <p className="text-xs text-slate-500">
              Answers are normalized for casing and extra spaces before grading.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SnapshotTile({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  )
}

function ResultTile({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-center shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
    </div>
  )
}
