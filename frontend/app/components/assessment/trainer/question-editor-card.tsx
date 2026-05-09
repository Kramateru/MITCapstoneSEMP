'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Textarea } from '@/app/components/ui/textarea'
import { updateAssessmentQuestion } from '@/app/lib/assessment/client'
import { normalizeAssessmentAnswer } from '@/app/lib/assessment/scoring'
import type { AssessmentQuestionRecord } from '@/app/lib/assessment/types'

type QuestionDraft = {
  assessmentId: string
  categoryId?: string
  questionNumber: number
  questionText: string
  questionType: 'multiple_choice' | 'fill_blank'
  options: string[]
  correctAnswer: string
  explanation: string
  orderIndex: number
}

function toDraft(question: AssessmentQuestionRecord): QuestionDraft {
  return {
    assessmentId: question.assessmentId,
    categoryId: question.categoryId,
    questionNumber: question.questionNumber || question.orderIndex + 1,
    questionText: question.questionText,
    questionType: question.questionType,
    options: question.options.length ? [...question.options] : ['', '', '', ''],
    correctAnswer: question.correctAnswer,
    explanation: question.explanation || '',
    orderIndex: question.orderIndex,
  }
}

export function QuestionEditorCard({
  question,
  onDelete,
  onPersist,
}: {
  question: AssessmentQuestionRecord
  onDelete: (questionId: string) => Promise<void>
  onPersist?: (questionId: string, nextQuestion: AssessmentQuestionRecord) => void
}) {
  const [draft, setDraft] = useState<QuestionDraft>(() => toDraft(question))
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const serializedBaselineRef = useRef(JSON.stringify(toDraft(question)))

  useEffect(() => {
    const nextDraft = toDraft(question)
    setDraft(nextDraft)
    serializedBaselineRef.current = JSON.stringify(nextDraft)
    setSaveState('idle')
  }, [question])

  const sanitizedOptions = useMemo(
    () => draft.options.map((option) => option.trim()).filter(Boolean),
    [draft.options],
  )
  const isDraftReadyToPersist = useMemo(() => {
    if (!draft.questionText.trim() || !draft.correctAnswer.trim()) {
      return false
    }

    if (draft.questionType === 'multiple_choice') {
      return (
        sanitizedOptions.length >= 2
        && sanitizedOptions.some(
          (option) => normalizeAssessmentAnswer(option) === normalizeAssessmentAnswer(draft.correctAnswer),
        )
      )
    }

    return true
  }, [draft.correctAnswer, draft.questionText, draft.questionType, sanitizedOptions])

  useEffect(() => {
    const serializedDraft = JSON.stringify(draft)
    if (serializedDraft === serializedBaselineRef.current) {
      return
    }

    if (!isDraftReadyToPersist) {
      setSaveState('idle')
      return
    }

    setSaveState('saving')
    const timeoutId = window.setTimeout(async () => {
      try {
        const payload = {
          assessmentId: draft.assessmentId,
          categoryId: draft.categoryId,
          questionNumber: draft.questionNumber,
          questionText: draft.questionText,
          questionType: draft.questionType,
          options: draft.questionType === 'multiple_choice' ? sanitizedOptions : [],
          correctAnswer: draft.correctAnswer,
          explanation: draft.explanation,
          orderIndex: draft.orderIndex,
        }

        const updated = (await updateAssessmentQuestion(question.id, payload)) as {
          id: string
          assessment_id: string
          category_id?: string
          question_number?: number
          question_text: string
          question_type: 'multiple_choice' | 'fill_blank'
          options: string[]
          correct_answer: string
          explanation?: string | null
          order_index: number
          metadata?: Record<string, unknown>
        }

        const nextQuestion: AssessmentQuestionRecord = {
          id: updated.id,
          assessmentId: updated.assessment_id,
          categoryId: updated.category_id,
          questionNumber: updated.question_number,
          questionText: updated.question_text,
          questionType: updated.question_type,
          options: updated.options || [],
          correctAnswer: updated.correct_answer,
          explanation: updated.explanation,
          orderIndex: updated.order_index,
          metadata: updated.metadata || {},
        }

        serializedBaselineRef.current = JSON.stringify({
          assessmentId: nextQuestion.assessmentId,
          categoryId: nextQuestion.categoryId,
          questionNumber: nextQuestion.questionNumber || nextQuestion.orderIndex + 1,
          questionText: nextQuestion.questionText,
          questionType: nextQuestion.questionType,
          options: nextQuestion.options.length ? nextQuestion.options : ['', '', '', ''],
          correctAnswer: nextQuestion.correctAnswer,
          explanation: nextQuestion.explanation || '',
          orderIndex: nextQuestion.orderIndex,
        })
        onPersist?.(question.id, nextQuestion)
        setSaveState('saved')
      } catch (error) {
        console.error(error)
        setSaveState('error')
        toast.error(error instanceof Error ? error.message : 'Unable to save question changes.')
      }
    }, 800)

    return () => window.clearTimeout(timeoutId)
  }, [draft, isDraftReadyToPersist, onPersist, question.id, sanitizedOptions])

  const updateOption = (index: number, nextValue: string) => {
    setDraft((current) => {
      const nextOptions = [...current.options]
      const previousValue = nextOptions[index] || ''
      nextOptions[index] = nextValue

      const nextCorrectAnswer =
        current.correctAnswer === previousValue
          ? nextValue
          : current.correctAnswer

      return {
        ...current,
        options: nextOptions,
        correctAnswer: nextCorrectAnswer,
      }
    })
  }

  return (
    <Card className="border-slate-200 bg-white/95 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold text-slate-900">
            Question {draft.orderIndex + 1}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {draft.questionType === 'multiple_choice' ? 'Multiple Choice' : 'Fill Blank'}
            </Badge>
            <Badge
              variant="outline"
              className={
                saveState === 'saved'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : saveState === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
              }
            >
              {saveState === 'saving' ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  Saving
                </span>
              ) : saveState === 'saved' ? (
                'Saved'
              ) : saveState === 'error' ? (
                'Save error'
              ) : (
                'Ready'
              )}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-rose-200 text-rose-700 hover:bg-rose-50"
              onClick={() => void onDelete(question.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr,160px]">
          <div>
            <Label>Question Prompt</Label>
            <Textarea
              value={draft.questionText}
              onChange={(event) =>
                setDraft((current) => ({ ...current, questionText: event.target.value }))
              }
              rows={3}
              className="mt-2"
            />
          </div>
          <div>
            <Label>Order</Label>
            <Input
              type="number"
              min={0}
              value={draft.orderIndex}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  orderIndex: Number(event.target.value) || 0,
                }))
              }
              className="mt-2"
            />
          </div>
        </div>

        {draft.questionType === 'multiple_choice' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Options</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    options: [...current.options, ''],
                  }))
                }
              >
                <Plus className="size-4" />
                Add Option
              </Button>
            </div>
            <div className="space-y-2">
              {draft.options.map((option, index) => (
                <div key={`${question.id}-option-${index}`} className="flex items-center gap-3">
                  <button
                    type="button"
                    className={`inline-flex size-8 items-center justify-center rounded-full border text-xs font-semibold ${
                      draft.correctAnswer === option
                        ? 'border-sky-500 bg-sky-50 text-sky-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        correctAnswer: current.options[index] || current.correctAnswer,
                      }))
                    }
                  >
                    {String.fromCharCode(65 + index)}
                  </button>
                  <Input
                    value={option}
                    onChange={(event) => updateOption(index, event.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <Label>Accepted Answer</Label>
            <Input
              value={draft.correctAnswer}
              onChange={(event) =>
                setDraft((current) => ({ ...current, correctAnswer: event.target.value }))
              }
              className="mt-2"
              placeholder="Expected text answer"
            />
            <p className="mt-2 text-xs text-slate-500">
              Fill-in submissions are compared with lower-case trimmed text to avoid capitalization mismatches.
            </p>
          </div>
        )}

        <div>
          <Label>Explanation / Instant Feedback</Label>
          <Textarea
            value={draft.explanation}
            onChange={(event) =>
              setDraft((current) => ({ ...current, explanation: event.target.value }))
            }
            rows={3}
            className="mt-2"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <Save className="size-3.5" />
            Live modify mode
          </div>
          <p className="mt-1">
            Changes save automatically after a short pause once the prompt, answer, and any required options are valid.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
