'use client'

import confetti from 'canvas-confetti'
import {
  Award,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  Loader2,
  PlayCircle,
  RotateCcw,
  Target,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Progress } from '@/app/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { normalizeAssessmentAnswer } from '@/app/lib/assessment/scoring'
import type {
  AssessmentQuestionRecord,
  SubmitAssessmentPayload,
  SubmitAssessmentResponse,
  TraineeAssessmentCard,
} from '@/app/lib/assessment/types'

type QuestionFeedback = {
  isCorrect: boolean
  userAnswer: string
}

function getAssessmentInstanceKey(assessment: TraineeAssessmentCard | null) {
  if (!assessment) {
    return 'empty'
  }
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

function formatQuestionType(question: AssessmentQuestionRecord) {
  return question.questionType === 'multiple_choice' ? 'Multiple Choice' : 'Fill in the Blank'
}

export function AssessmentPlayer({
  assessment,
  onSubmitAssessment,
  onAttemptCommitted,
  onViewCertificates,
}: {
  assessment: TraineeAssessmentCard | null
  onSubmitAssessment: (payload: SubmitAssessmentPayload) => Promise<SubmitAssessmentResponse>
  onAttemptCommitted: (result: SubmitAssessmentResponse) => Promise<void>
  onViewCertificates: () => void
}) {
  const assessmentKey = getAssessmentInstanceKey(assessment)
  const [mode, setMode] = useState<'overview' | 'in_progress' | 'submitted'>('overview')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [feedbackByQuestionId, setFeedbackByQuestionId] = useState<Record<string, QuestionFeedback>>({})
  const [submission, setSubmission] = useState<SubmitAssessmentResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setMode('overview')
    setCurrentQuestionIndex(0)
    setAnswers({})
    setFeedbackByQuestionId({})
    setSubmission(null)
    setSubmitting(false)
  }, [assessmentKey])

  const currentQuestion = assessment?.questions[currentQuestionIndex] || null
  const currentQuestionFeedback = currentQuestion ? feedbackByQuestionId[currentQuestion.id] : null
  const reviewedQuestionCount = Object.keys(feedbackByQuestionId).length
  const localCorrectCount = Object.values(feedbackByQuestionId).filter((entry) => entry.isCorrect).length
  const localScore = assessment?.questions.length
    ? Number(((localCorrectCount / assessment.questions.length) * 100).toFixed(2))
    : 0
  const progressValue = assessment?.questions.length
    ? ((currentQuestionIndex + 1) / assessment.questions.length) * 100
    : 0

  const answeredQuestionIds = useMemo(
    () => Object.keys(answers).filter((questionId) => normalizeAssessmentAnswer(answers[questionId] || '') !== ''),
    [answers],
  )

  const startAssessment = () => {
    if (!assessment?.questions.length) {
      toast.error('This assessment does not have any questions yet.')
      return
    }

    if (answeredQuestionIds.length || reviewedQuestionCount) {
      setMode('in_progress')
      return
    }

    setMode('in_progress')
    setCurrentQuestionIndex(0)
    setAnswers({})
    setFeedbackByQuestionId({})
    setSubmission(null)
  }

  const recordCurrentFeedback = () => {
    if (!assessment || !currentQuestion) {
      return false
    }

    const userAnswer = answers[currentQuestion.id] || ''
    if (!normalizeAssessmentAnswer(userAnswer)) {
      toast.error('Enter an answer before checking feedback.')
      return false
    }

    if (feedbackByQuestionId[currentQuestion.id]) {
      return true
    }

    const isCorrect =
      normalizeAssessmentAnswer(userAnswer) === normalizeAssessmentAnswer(currentQuestion.correctAnswer)

    setFeedbackByQuestionId((current) => ({
      ...current,
      [currentQuestion.id]: {
        isCorrect,
        userAnswer,
      },
    }))

    if (isCorrect) {
      toast.success('Correct answer recorded.')
    } else {
      toast.error('Incorrect answer. Review the explanation before moving on.')
    }

    return true
  }

  const goToNextQuestion = () => {
    if (!assessment || !currentQuestion) {
      return
    }

    if (!recordCurrentFeedback()) {
      return
    }

    if (currentQuestionIndex >= assessment.questions.length - 1) {
      void submitAssessment()
      return
    }

    setCurrentQuestionIndex((current) => current + 1)
  }

  const submitAssessment = async () => {
    if (!assessment) {
      return
    }

    if (assessment.questions.some((question) => !normalizeAssessmentAnswer(answers[question.id] || ''))) {
      toast.error('Answer every question before submitting the assessment.')
      return
    }

    setSubmitting(true)
    try {
      const result = await onSubmitAssessment({
        assessmentId: assessment.assessmentId,
        assignmentId: assessment.assignmentId,
        answers,
      })

      setSubmission(result)
      setMode('submitted')

      if (result.attempt.status === 'pass') {
        void confetti({
          particleCount: 120,
          spread: 68,
          origin: { y: 0.62 },
        })
        toast.success('Passing score achieved. Your certificates section has been updated.')
      } else {
        toast.error('Passing score not reached yet. You can retake the assessment immediately.')
      }

      await onAttemptCommitted(result)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Unable to submit this assessment.')
    } finally {
      setSubmitting(false)
    }
  }

  const retakeAssessment = () => {
    setMode('in_progress')
    setCurrentQuestionIndex(0)
    setAnswers({})
    setFeedbackByQuestionId({})
    setSubmission(null)
  }

  if (!assessment) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Pick an assessment</CardTitle>
          <CardDescription>Select an assigned assessment from the queue to start answering questions.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!assessment.questions.length) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Question bank is empty</CardTitle>
          <CardDescription>Your trainer still needs to publish questions for this assessment.</CardDescription>
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
            </div>
            <CardTitle className="text-2xl text-slate-950">{assessment.assessmentTitle}</CardTitle>
            <CardDescription className="max-w-2xl text-sm text-slate-600">
              {assessment.assessmentDescription || 'Work through each question, review instant feedback, and submit your final score for trainer review.'}
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Assignment target</div>
            <div className="mt-1">{assessment.targetLabel}</div>
            <div className="mt-1 text-xs text-slate-500">Due {formatDate(assessment.targetDueAt)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {mode === 'overview' ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <StatPill
                icon={<BookOpenCheck className="size-4 text-sky-700" />}
                label="Question Types"
                value={assessment.questionTypes.map((type) => type.replace(/_/g, ' ')).join(', ')}
              />
              <StatPill
                icon={<Target className="size-4 text-emerald-700" />}
                label="Latest Result"
                value={
                  assessment.latestAttempt
                    ? `${assessment.latestAttempt.score.toFixed(2)}% | ${assessment.latestAttempt.status.toUpperCase()}`
                    : 'No attempts yet'
                }
              />
              <StatPill
                icon={<Award className="size-4 text-amber-700" />}
                label="Certificate"
                value={assessment.certificate?.certificateCode || 'Not earned yet'}
              />
            </div>

            {assessment.latestAttempt ? (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  assessment.latestAttempt.status === 'pass'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                Your latest recorded attempt scored {assessment.latestAttempt.score.toFixed(2)}%.{' '}
                {assessment.latestAttempt.status === 'pass'
                  ? 'You already cleared this category, and your certificate is available below.'
                  : 'You can retake this immediately to improve your result.'}
              </div>
            ) : null}

            <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,rgba(240,249,255,0.95),rgba(255,255,255,0.92))] p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Assessment Flow</div>
                  <div className="text-sm text-slate-700">
                    Answer one question at a time, check instant feedback, then finish to save your attempt and update your certificates section automatically after a passing score.
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={startAssessment}>
                    <PlayCircle className="size-4" />
                    {answeredQuestionIds.length || reviewedQuestionCount
                      ? 'Resume Assessment'
                      : assessment.latestAttempt?.status === 'fail'
                        ? 'Retake Now'
                        : 'Start Assessment'}
                  </Button>
                  {assessment.certificate ? (
                    <Button type="button" variant="outline" onClick={onViewCertificates}>
                      <Award className="size-4" />
                      Open Certificates
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {mode === 'in_progress' && currentQuestion ? (
          <>
            <div className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-900">
                    Question {currentQuestionIndex + 1} of {assessment.questions.length}
                  </div>
                  <div className="text-xs text-slate-500">
                    {answeredQuestionIds.length} answered | {reviewedQuestionCount} feedback cards reviewed | Local score {localScore.toFixed(2)}%
                  </div>
                </div>
                <Badge variant="outline">{formatQuestionType(currentQuestion)}</Badge>
              </div>
              <Progress value={progressValue} className="h-2.5" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-5">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Prompt
                  </div>
                  <div className="mt-3 text-lg font-semibold leading-8 text-slate-950">
                    {currentQuestion.questionText}
                  </div>
                </div>

                {currentQuestion.questionType === 'multiple_choice' ? (
                  <RadioGroup
                    value={answers[currentQuestion.id] || ''}
                    onValueChange={(value) =>
                      setAnswers((current) => ({
                        ...current,
                        [currentQuestion.id]: value,
                      }))
                    }
                    className="space-y-3"
                  >
                    {currentQuestion.options.map((option, index) => {
                      const isLocked = !!currentQuestionFeedback
                      const isSelected = (answers[currentQuestion.id] || '') === option
                      const isCorrectAnswer =
                        currentQuestionFeedback &&
                        normalizeAssessmentAnswer(option) === normalizeAssessmentAnswer(currentQuestion.correctAnswer)
                      const isIncorrectSelected =
                        currentQuestionFeedback &&
                        isSelected &&
                        normalizeAssessmentAnswer(option) !== normalizeAssessmentAnswer(currentQuestion.correctAnswer)

                      return (
                        <label
                          key={`${currentQuestion.id}-option-${index}`}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                            isCorrectAnswer
                              ? 'border-emerald-300 bg-emerald-50'
                              : isIncorrectSelected
                                ? 'border-rose-300 bg-rose-50'
                                : isSelected
                                  ? 'border-sky-300 bg-sky-50'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                          } ${isLocked ? 'cursor-default' : ''}`}
                        >
                          <RadioGroupItem
                            value={option}
                            id={`${currentQuestion.id}-option-${index}`}
                            disabled={isLocked}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Option {String.fromCharCode(65 + index)}
                            </div>
                            <div className="mt-1 text-sm text-slate-800">{option}</div>
                          </div>
                        </label>
                      )
                    })}
                  </RadioGroup>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor={`${currentQuestion.id}-answer`}>Your answer</Label>
                    <Input
                      id={`${currentQuestion.id}-answer`}
                      value={answers[currentQuestion.id] || ''}
                      disabled={!!currentQuestionFeedback}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [currentQuestion.id]: event.target.value,
                        }))
                      }
                      placeholder="Type your best answer"
                    />
                    <p className="text-xs text-slate-500">
                      Fill-in-the-blank answers are checked with trimmed, lower-case text to avoid capitalization misses.
                    </p>
                  </div>
                )}

                {currentQuestionFeedback ? (
                  <div
                    className={`rounded-2xl border px-4 py-4 text-sm ${
                      currentQuestionFeedback.isCorrect
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {currentQuestionFeedback.isCorrect ? (
                        <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
                      ) : (
                        <CircleAlert className="mt-0.5 size-5 text-amber-600" />
                      )}
                      <div className="space-y-2">
                        <div className="font-semibold">
                          {currentQuestionFeedback.isCorrect ? 'Correct answer' : 'Incorrect answer'}
                        </div>
                        <div>
                          Expected answer: <span className="font-semibold">{currentQuestion.correctAnswer}</span>
                        </div>
                        {currentQuestion.explanation ? (
                          <div className="text-sm leading-6 text-current">{currentQuestion.explanation}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="outline" onClick={() => setMode('overview')}>
                    Pause and Review
                  </Button>
                  <Button type="button" variant="outline" disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex((current) => current - 1)}>
                    Previous
                  </Button>
                  {!currentQuestionFeedback ? (
                    <Button type="button" onClick={() => void recordCurrentFeedback()}>
                      Check Answer
                    </Button>
                  ) : (
                    <Button type="button" onClick={goToNextQuestion} disabled={submitting}>
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                      {currentQuestionIndex === assessment.questions.length - 1 ? 'Finish Assessment' : 'Next Question'}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Question Tracker</div>
                <div className="grid grid-cols-5 gap-2">
                  {assessment.questions.map((question, index) => {
                    const feedback = feedbackByQuestionId[question.id]
                    return (
                      <button
                        key={question.id}
                        type="button"
                        onClick={() => setCurrentQuestionIndex(index)}
                        className={`inline-flex h-11 items-center justify-center rounded-2xl border text-sm font-semibold transition ${
                          currentQuestionIndex === index
                            ? 'border-sky-400 bg-sky-50 text-sky-700'
                            : feedback?.isCorrect
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : feedback
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : answers[question.id]
                                  ? 'border-slate-300 bg-white text-slate-700'
                                  : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        {index + 1}
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Answered</span>
                    <span>{answeredQuestionIds.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Reviewed</span>
                    <span>{reviewedQuestionCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Local correct</span>
                    <span>{localCorrectCount}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {mode === 'submitted' && submission ? (
          <>
            <div
              className={`rounded-3xl border px-5 py-5 ${
                submission.attempt.status === 'pass'
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-amber-200 bg-amber-50'
              }`}
            >
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
                        Attempt #{submission.attempt.attemptNo} recorded at {new Date(submission.attempt.submittedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-700">
                    {submission.attempt.feedback || 'Your final score has been saved to the assessment module.'}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ResultTile label="Score" value={`${submission.attempt.score.toFixed(2)}%`} />
                  <ResultTile
                    label="Correct"
                    value={String(submission.attempt.questionResults.filter((result) => result.isCorrect).length)}
                  />
                  <ResultTile label="Target" value={`${assessment.passingScore}%`} />
                </div>
              </div>
            </div>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Final Review</CardTitle>
                <CardDescription>Each answer below matches the result saved in Supabase for this attempt.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[420px] pr-4">
                  <div className="space-y-4">
                    {submission.attempt.questionResults.map((result, index) => (
                      <div
                        key={result.questionId}
                        className={`rounded-2xl border p-4 ${
                          result.isCorrect ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {result.isCorrect ? (
                            <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
                          ) : (
                            <XCircle className="mt-0.5 size-5 text-amber-600" />
                          )}
                          <div className="space-y-2">
                            <div className="font-semibold text-slate-950">
                              Q{index + 1}. {result.questionText}
                            </div>
                            <div className="text-sm text-slate-700">
                              Your answer: <span className="font-semibold">{result.userAnswer || 'No answer submitted'}</span>
                            </div>
                            <div className="text-sm text-slate-700">
                              Correct answer: <span className="font-semibold">{result.correctAnswer}</span>
                            </div>
                            {result.explanation ? (
                              <div className="text-sm leading-6 text-slate-700">{result.explanation}</div>
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
              <Button type="button" onClick={retakeAssessment}>
                <RotateCcw className="size-4" />
                {submission.attempt.status === 'pass' ? 'Practice Again' : 'Retake Now'}
              </Button>
              {submission.certificate ? (
                <Button type="button" variant="outline" onClick={onViewCertificates}>
                  <Award className="size-4" />
                  View Certificate
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function StatPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{value}</div>
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
    <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-center shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
    </div>
  )
}
