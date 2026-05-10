'use client'

import confetti from 'canvas-confetti'
import {
  Award,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ListChecks,
  Loader2,
  PlayCircle,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Progress } from '@/app/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { normalizeAssessmentAnswer } from '@/app/lib/assessment/scoring'
import type {
  SubmitAssessmentResponse,
  TraineeAssessmentSession,
} from '@/app/lib/assessment/types'

type QuestionAnswerMap = Record<string, string>

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

export function AssessmentPlayer({
  assessment,
  onSubmitAssessment,
  onAttemptCommitted,
  onViewCertificates,
  onRetakeRequested,
}: {
  assessment: TraineeAssessmentSession | null
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
}) {
  const [mode, setMode] = useState<'overview' | 'in_progress' | 'submitted'>('overview')
  const [viewMode, setViewMode] = useState<'single' | 'full'>('single')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<QuestionAnswerMap>({})
  const [submitting, setSubmitting] = useState(false)
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [submission, setSubmission] = useState<SubmitAssessmentResponse | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)

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
    setMode('overview')
    setCurrentQuestionIndex(0)
    setAnswers({})
    setSubmitting(false)
    setStartedAtMs(null)
    setRemainingSeconds(timeLimitSeconds)
    setSubmission(null)
    setSummaryOpen(false)
  }, [assessment?.assignmentId, timeLimitSeconds])

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

  const handleStartAssessment = () => {
    if (!assessment) {
      return
    }

    if (assessment.isCompleted && !assessment.canRetake) {
      toast.error('This assessment is already completed.')
      return
    }

    setMode('in_progress')
    setCurrentQuestionIndex(0)
    setAnswers({})
    setSubmission(null)
    setSummaryOpen(false)
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
      setSummaryOpen(true)

      if (result.attempt.status === 'pass') {
        void confetti({
          particleCount: 140,
          spread: 72,
          origin: { y: 0.6 },
        })
        toast.success('Passing score achieved. Your certificate is now available.')
      } else {
        toast.error('Passing score not reached yet. Review the summary and try again.')
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

    await onRetakeRequested(assessment.assignmentId)
  }

  const canRetakeAfterSubmission = useMemo(() => {
    if (!assessment || !submission || submission.attempt.status === 'pass') {
      return false
    }

    if (!assessment.maximumAttempts) {
      return true
    }

    return submission.attempt.attemptNo < assessment.maximumAttempts
  }, [assessment, submission])

  const attempt = submission?.attempt || assessment?.latestAttempt || null
  const correctAnswers = attempt?.correctAnswers ?? attempt?.questionResults.filter((result) => result.isCorrect).length ?? 0
  const incorrectAnswers = attempt?.incorrectAnswers ?? attempt?.questionResults.filter((result) => !result.isCorrect).length ?? 0

  if (!assessment) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Open an assigned assessment</CardTitle>
          <CardDescription>
            Pick an item from your assigned queue to load the live assessment session.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!assessment.questions.length) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Question set unavailable</CardTitle>
          <CardDescription>
            This assessment does not currently have an active question set. Please contact your trainer.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-slate-200 bg-white/95 shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{assessment.categoryTitle}</Badge>
                <Badge variant="outline">{assessment.questionCount} questions</Badge>
                <Badge variant="outline">Pass at {assessment.passingScore}%</Badge>
                {assessment.timeLimitMinutes ? (
                  <Badge variant="outline">{assessment.timeLimitMinutes} min timer</Badge>
                ) : (
                  <Badge variant="outline">Untimed</Badge>
                )}
              </div>
              <CardTitle className="text-2xl text-slate-950">{assessment.assignmentTitle || assessment.assessmentTitle}</CardTitle>
              <CardDescription className="max-w-3xl text-sm text-slate-600">
                {assessment.description || 'Complete the served question set to record your score and update your assessment progress.'}
              </CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SnapshotTile label="Due Date" value={formatDate(assessment.targetDueAt)} icon={<Clock3 className="size-4 text-sky-700" />} />
              <SnapshotTile label="Attempts" value={assessment.attemptCount ? String(assessment.attemptCount) : '0'} icon={<ListChecks className="size-4 text-slate-700" />} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {mode === 'overview' ? (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <ResultTile label="Question Count" value={String(assessment.questionCount)} />
                <ResultTile label="Passing Score" value={`${assessment.passingScore}%`} />
                <ResultTile
                  label="Attempts Remaining"
                  value={assessment.attemptsRemaining === null ? 'Unlimited' : String(assessment.attemptsRemaining)}
                />
                <ResultTile
                  label="Latest Result"
                  value={assessment.latestAttempt ? `${assessment.latestAttempt.score.toFixed(2)}%` : 'Not started'}
                />
              </div>

              {assessment.latestAttempt ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${getStatusTone(assessment.latestAttempt.status)}`}>
                  <div className="font-semibold">
                    Latest result: {assessment.latestAttempt.status === 'pass' ? 'Passed' : 'Needs retake'}
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
                      Your session is served from the live assignment, including randomized answer choices and any trainer-configured timer or attempt cap.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {!assessment.isCompleted || assessment.canRetake ? (
                      <Button type="button" onClick={handleStartAssessment}>
                        <PlayCircle className="size-4" />
                        {assessment.canRetake ? 'Start Retake' : 'Start Assessment'}
                      </Button>
                    ) : null}
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

          {mode === 'in_progress' ? (
            <>
              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-slate-900">
                      {answeredCount} of {totalQuestions} answered
                    </div>
                    <div className="text-xs text-slate-500">
                      Submit only when every item is complete. The final score is calculated automatically after submission.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={viewMode === 'single' ? 'default' : 'outline'}
                      onClick={() => setViewMode('single')}
                    >
                      One Question
                    </Button>
                    <Button
                      type="button"
                      variant={viewMode === 'full' ? 'default' : 'outline'}
                      onClick={() => setViewMode('full')}
                    >
                      Full Page
                    </Button>
                  </div>
                </div>
                <Progress value={progressValue} className="h-2.5" />
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <SnapshotTile label="Progress" value={`${progressValue.toFixed(0)}%`} icon={<ListChecks className="size-4 text-slate-700" />} />
                <SnapshotTile label="Answered" value={`${answeredCount}/${totalQuestions}`} icon={<CheckCircle2 className="size-4 text-emerald-700" />} />
                <SnapshotTile
                  label="Time Left"
                  value={remainingSeconds === null ? 'Untimed' : formatDuration(remainingSeconds)}
                  icon={<Clock3 className="size-4 text-amber-700" />}
                />
                <SnapshotTile label="Due Date" value={formatDate(assessment.targetDueAt)} icon={<CircleAlert className="size-4 text-sky-700" />} />
              </div>

              {viewMode === 'single' && currentQuestion ? (
                <div className="space-y-5">
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
                      variant={currentQuestionIndex === totalQuestions - 1 ? 'default' : 'outline'}
                      onClick={() =>
                        currentQuestionIndex === totalQuestions - 1
                          ? void handleSubmitAssessment(false)
                          : setCurrentQuestionIndex((current) => Math.min(current + 1, totalQuestions - 1))
                      }
                      disabled={submitting}
                    >
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                      {currentQuestionIndex === totalQuestions - 1 ? 'Submit Assessment' : 'Next'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {viewMode === 'full' ? (
                <div className="space-y-6">
                  {assessment.questions.map((question, index) => (
                    <QuestionCard
                      key={question.id}
                      question={question}
                      index={index}
                      totalQuestions={totalQuestions}
                      answer={answers[question.id] || ''}
                      onAnswerChange={handleAnswerChange}
                    />
                  ))}

                  <div className="flex justify-end">
                    <Button type="button" onClick={() => void handleSubmitAssessment(false)} disabled={submitting}>
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                      Submit Assessment
                    </Button>
                  </div>
                </div>
              ) : null}
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
                          {submission.attempt.status === 'pass' ? 'Assessment passed' : 'Retake available'}
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

                  <div className="grid gap-3 sm:grid-cols-4">
                    <ResultTile label="Score" value={`${submission.attempt.score.toFixed(2)}%`} />
                    <ResultTile label="Correct" value={String(correctAnswers)} />
                    <ResultTile label="Incorrect" value={String(incorrectAnswers)} />
                    <ResultTile label="Time Spent" value={formatDuration(submission.attempt.timeSpentSeconds)} />
                  </div>
                </div>
              </div>

              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle>Attempt Analysis</CardTitle>
                  <CardDescription>
                    Strengths, missed areas, and coaching recommendations from the saved result.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 xl:grid-cols-3">
                  <AnalysisList
                    title="Strengths"
                    items={submission.attempt.analysis?.strengths || []}
                    tone="emerald"
                  />
                  <AnalysisList
                    title="Areas for Improvement"
                    items={submission.attempt.analysis?.improvements || []}
                    tone="amber"
                  />
                  <AnalysisList
                    title="Recommendations"
                    items={submission.attempt.analysis?.recommendations || []}
                    tone="sky"
                  />
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle>Detailed Review</CardTitle>
                  <CardDescription>Each answer below matches the saved attempt data in Supabase.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[420px] pr-4">
                    <div className="space-y-4">
                      {submission.attempt.questionResults.map((result, index) => (
                        <div
                          key={result.questionId}
                          className={`rounded-2xl border p-4 ${
                            result.isCorrect
                              ? 'border-emerald-200 bg-emerald-50/60'
                              : 'border-amber-200 bg-amber-50/60'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {result.isCorrect ? (
                              <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
                            ) : (
                              <XCircle className="mt-0.5 size-5 text-amber-600" />
                            )}
                            <div className="space-y-3">
                              <div className="font-semibold text-slate-950">
                                Q{index + 1}. {result.questionText}
                              </div>
                              <div className="text-sm text-slate-700">
                                Your answer: <span className="font-semibold">{result.userAnswer || 'No answer submitted'}</span>
                              </div>
                              <div className="text-sm text-slate-700">
                                Correct answer: <span className="font-semibold">{result.correctAnswer}</span>
                              </div>
                              {result.options?.length ? (
                                <div className="space-y-2">
                                  {result.options.map((option, optionIndex) => {
                                    const isCorrectAnswer =
                                      normalizeAssessmentAnswer(option) === normalizeAssessmentAnswer(result.correctAnswer)
                                    const isSelectedAnswer =
                                      normalizeAssessmentAnswer(option) === normalizeAssessmentAnswer(result.userAnswer)

                                    return (
                                      <div
                                        key={`${result.questionId}-${optionIndex}`}
                                        className={`rounded-xl border px-3 py-2 text-sm ${
                                          isCorrectAnswer
                                            ? 'border-emerald-200 bg-emerald-50'
                                            : isSelectedAnswer
                                              ? 'border-amber-200 bg-amber-50'
                                              : 'border-slate-200 bg-white'
                                        }`}
                                      >
                                        {option}
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : null}
                              {result.explanation ? (
                                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                                  {result.explanation}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-3">
                {canRetakeAfterSubmission ? (
                  <Button type="button" onClick={() => void handleRetake()}>
                    <RotateCcw className="size-4" />
                    Start Fresh Retake
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
      </Card>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-sky-600" />
              Post-Assessment Summary
            </DialogTitle>
            <DialogDescription>
              Immediate scoring, coaching highlights, and certificate outcome for the most recent attempt.
            </DialogDescription>
          </DialogHeader>

          {submission ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <ResultTile label="Score" value={`${submission.attempt.score.toFixed(2)}%`} />
                <ResultTile label="Status" value={submission.attempt.status.toUpperCase()} />
                <ResultTile label="Correct" value={String(correctAnswers)} />
                <ResultTile label="Incorrect" value={String(incorrectAnswers)} />
                <ResultTile label="Target" value={`${submission.attempt.passingScore || assessment.passingScore}%`} />
                <ResultTile label="Time Spent" value={formatDuration(submission.attempt.timeSpentSeconds)} />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-sm font-semibold text-slate-900">
                  {submission.attempt.analysis?.summary || submission.attempt.feedback || 'Assessment result saved.'}
                </div>
                {submission.certificate ? (
                  <div className="mt-2 text-sm text-emerald-700">
                    Certificate unlocked: <span className="font-semibold">{submission.certificate.certificateCode}</span>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <AnalysisList
                  title="Strengths"
                  items={submission.attempt.analysis?.strengths || []}
                  tone="emerald"
                />
                <AnalysisList
                  title="Areas for Improvement"
                  items={submission.attempt.analysis?.improvements || []}
                  tone="amber"
                />
                <AnalysisList
                  title="Recommendations"
                  items={submission.attempt.analysis?.recommendations || []}
                  tone="sky"
                />
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-900">Category Performance Breakdown</div>
                {(submission.attempt.analysis?.categoryBreakdown || []).map((entry) => (
                  <div key={`${entry.categoryId}-${entry.categoryTitle}`} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">{entry.categoryTitle}</div>
                        <div className="text-sm text-slate-600">
                          {entry.correctAnswers} correct of {entry.totalQuestions} questions
                        </div>
                      </div>
                      <Badge variant="outline">{entry.score.toFixed(2)}%</Badge>
                    </div>
                    <Progress value={entry.score} className="mt-3 h-2" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
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

function AnalysisList({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'emerald' | 'amber' | 'sky'
}) {
  const toneClassName =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/80'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/80'
        : 'border-sky-200 bg-sky-50/80'

  return (
    <div className={`rounded-2xl border p-4 ${toneClassName}`}>
      <div className="font-semibold text-slate-950">{title}</div>
      {items.length ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item} className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-700">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-slate-600">No notes recorded for this section yet.</div>
      )}
    </div>
  )
}
