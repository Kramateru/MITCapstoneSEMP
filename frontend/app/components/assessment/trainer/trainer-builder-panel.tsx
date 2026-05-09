'use client'

import { Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'
import { Textarea } from '@/app/components/ui/textarea'
import {
  archiveAssessmentCategory,
  createAssessmentCategory,
  createAssessmentDefinition,
  createAssessmentQuestion,
  deleteAssessmentDefinition,
  deleteAssessmentQuestion,
  updateAssessmentCategory,
  updateAssessmentDefinition,
} from '@/app/lib/assessment/client'
import { normalizeAssessmentAnswer } from '@/app/lib/assessment/scoring'
import type {
  CategoryRecord,
  TrainerBootstrapResponse,
} from '@/app/lib/assessment/types'

import { QuestionEditorCard } from './question-editor-card'

type CategoryDraft = {
  title: string
  description: string
  passingScore: number
}

type AssessmentDraft = {
  title: string
  description: string
  type: 'multiple_choice' | 'fill_blank' | 'mixed'
  isPublished: boolean
}

type NewQuestionDraft = {
  questionText: string
  questionType: 'multiple_choice' | 'fill_blank'
  options: string[]
  correctAnswer: string
  explanation: string
}

const emptyQuestionDraft = (): NewQuestionDraft => ({
  questionText: '',
  questionType: 'multiple_choice',
  options: ['', '', '', ''],
  correctAnswer: '',
  explanation: '',
})

export function TrainerBuilderPanel({
  workspace,
  onRefresh,
}: {
  workspace: TrainerBootstrapResponse
  onRefresh: () => Promise<void>
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('')
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>({
    title: '',
    description: '',
    passingScore: 80,
  })
  const [newCategoryDraft, setNewCategoryDraft] = useState<CategoryDraft>({
    title: '',
    description: '',
    passingScore: 80,
  })
  const [assessmentDraft, setAssessmentDraft] = useState<AssessmentDraft>({
    title: '',
    description: '',
    type: 'multiple_choice',
    isPublished: true,
  })
  const [newAssessmentDraft, setNewAssessmentDraft] = useState<AssessmentDraft>({
    title: '',
    description: '',
    type: 'multiple_choice',
    isPublished: true,
  })
  const [newQuestionDraft, setNewQuestionDraft] = useState<NewQuestionDraft>(emptyQuestionDraft)

  useEffect(() => {
    if (!workspace.categories.length) {
      setSelectedCategoryId('')
      return
    }
    setSelectedCategoryId((current) =>
      workspace.categories.some((category) => category.id === current)
        ? current
        : workspace.categories[0]?.id || '',
    )
  }, [workspace.categories])

  const selectedCategory = useMemo(
    () => workspace.categories.find((category) => category.id === selectedCategoryId) || null,
    [selectedCategoryId, workspace.categories],
  )

  useEffect(() => {
    if (!selectedCategory) {
      return
    }
    setCategoryDraft({
      title: selectedCategory.title,
      description: selectedCategory.description || '',
      passingScore: selectedCategory.passingScore,
    })
    setSelectedAssessmentId((current) =>
      selectedCategory.assessments.some((assessment) => assessment.id === current)
        ? current
        : selectedCategory.assessments[0]?.id || '',
    )
  }, [selectedCategory])

  const selectedAssessment = useMemo(
    () => selectedCategory?.assessments.find((assessment) => assessment.id === selectedAssessmentId) || null,
    [selectedAssessmentId, selectedCategory],
  )

  useEffect(() => {
    if (!selectedAssessment) {
      return
    }
    setAssessmentDraft({
      title: selectedAssessment.title,
      description: selectedAssessment.description || '',
      type: selectedAssessment.type,
      isPublished: selectedAssessment.isPublished,
    })
    setNewQuestionDraft(emptyQuestionDraft())
  }, [selectedAssessment])

  const handleCreateCategory = async () => {
    if (!newCategoryDraft.title.trim()) {
      toast.error('Category title is required.')
      return
    }
    await createAssessmentCategory(newCategoryDraft)
    toast.success('Assessment category created.')
    setNewCategoryDraft({ title: '', description: '', passingScore: 80 })
    await onRefresh()
  }

  const handleSaveCategory = async () => {
    if (!selectedCategory) {
      return
    }
    await updateAssessmentCategory(selectedCategory.id, categoryDraft)
    toast.success('Category updated.')
    await onRefresh()
  }

  const handleArchiveCategory = async () => {
    if (!selectedCategory || !window.confirm(`Archive "${selectedCategory.title}"?`)) {
      return
    }
    await archiveAssessmentCategory(selectedCategory.id)
    toast.success('Category archived.')
    await onRefresh()
  }

  const handleCreateAssessment = async () => {
    if (!selectedCategory || !newAssessmentDraft.title.trim()) {
      toast.error('Assessment title is required.')
      return
    }
    await createAssessmentDefinition({
      categoryId: selectedCategory.id,
      ...newAssessmentDraft,
    })
    toast.success('Assessment created.')
    setNewAssessmentDraft({
      title: '',
      description: '',
      type: 'multiple_choice',
      isPublished: true,
    })
    await onRefresh()
  }

  const handleSaveAssessment = async () => {
    if (!selectedAssessment) {
      return
    }
    await updateAssessmentDefinition(selectedAssessment.id, assessmentDraft)
    toast.success('Assessment updated.')
    await onRefresh()
  }

  const handleDeleteAssessment = async (assessmentId: string) => {
    if (!window.confirm('Delete this assessment and all of its questions?')) {
      return
    }
    await deleteAssessmentDefinition(assessmentId)
    toast.success('Assessment deleted.')
    await onRefresh()
  }

  const handleCreateQuestion = async () => {
    if (!selectedAssessment || !newQuestionDraft.questionText.trim() || !newQuestionDraft.correctAnswer.trim()) {
      toast.error('Question prompt and correct answer are required.')
      return
    }

    const sanitizedOptions = newQuestionDraft.options.map((option) => option.trim()).filter(Boolean)
    if (newQuestionDraft.questionType === 'multiple_choice' && sanitizedOptions.length < 2) {
      toast.error('Multiple-choice questions need at least two options.')
      return
    }

    if (
      newQuestionDraft.questionType === 'multiple_choice'
      && !sanitizedOptions.some(
        (option) => normalizeAssessmentAnswer(option) === normalizeAssessmentAnswer(newQuestionDraft.correctAnswer),
      )
    ) {
      toast.error('The correct answer needs to match one of the listed options.')
      return
    }

    await createAssessmentQuestion({
      assessmentId: selectedAssessment.id,
      questionNumber: selectedAssessment.questions.length + 1,
      questionText: newQuestionDraft.questionText,
      questionType: newQuestionDraft.questionType,
      options: newQuestionDraft.questionType === 'multiple_choice' ? sanitizedOptions : [],
      correctAnswer: newQuestionDraft.correctAnswer,
      explanation: newQuestionDraft.explanation,
      orderIndex: selectedAssessment.questions.length,
    })
    toast.success('Question created.')
    setNewQuestionDraft(emptyQuestionDraft())
    await onRefresh()
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!window.confirm('Delete this question?')) {
      return
    }
    await deleteAssessmentQuestion(questionId)
    toast.success('Question deleted.')
    await onRefresh()
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Category Bank</CardTitle>
          <CardDescription>Select a category to modify its metadata and question bank.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {workspace.categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategoryId(category.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selectedCategoryId === category.id
                  ? 'border-sky-400 bg-sky-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-slate-900">{category.title}</div>
              <div className="mt-1 text-xs text-slate-500">
                {category.assessments.length} assessments | Pass score {category.passingScore}%
              </div>
            </button>
          ))}

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="font-semibold text-slate-900">Create Category</div>
            <div className="mt-3 space-y-3">
              <Input
                placeholder="Category title"
                value={newCategoryDraft.title}
                onChange={(event) =>
                  setNewCategoryDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
              <Textarea
                placeholder="Category description"
                value={newCategoryDraft.description}
                onChange={(event) =>
                  setNewCategoryDraft((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={newCategoryDraft.passingScore}
                onChange={(event) =>
                  setNewCategoryDraft((current) => ({
                    ...current,
                    passingScore: Number(event.target.value) || 0,
                  }))
                }
              />
              <Button type="button" onClick={() => void handleCreateCategory()} className="w-full">
                <Plus className="size-4" />
                Add Category
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedCategory ? (
        <div className="space-y-6">
          <CategoryEditor
            category={selectedCategory}
            draft={categoryDraft}
            onDraftChange={setCategoryDraft}
            onSave={handleSaveCategory}
            onArchive={handleArchiveCategory}
          />

          <Card>
            <CardHeader>
              <CardTitle>Assessment Definitions</CardTitle>
              <CardDescription>Create mixed, multiple-choice, or fill-in checkpoints inside this category.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {selectedCategory.assessments.map((assessment) => (
                  <button
                    key={assessment.id}
                    type="button"
                    onClick={() => setSelectedAssessmentId(assessment.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selectedAssessmentId === assessment.id
                        ? 'border-sky-400 bg-sky-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{assessment.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {assessment.type.replace(/_/g, ' ')} | {assessment.questionCount} questions
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {assessment.isPublished ? 'Published' : 'Draft'}
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <div className="grid gap-3 lg:grid-cols-[1.2fr,1fr,180px,180px]">
                  <Input
                    placeholder="New assessment title"
                    value={newAssessmentDraft.title}
                    onChange={(event) =>
                      setNewAssessmentDraft((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                  <Textarea
                    placeholder="Description"
                    value={newAssessmentDraft.description}
                    onChange={(event) =>
                      setNewAssessmentDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    rows={2}
                  />
                  <Select
                    value={newAssessmentDraft.type}
                    onValueChange={(value: 'multiple_choice' | 'fill_blank' | 'mixed') =>
                      setNewAssessmentDraft((current) => ({ ...current, type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                      <SelectItem value="fill_blank">Fill Blank</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={() => void handleCreateAssessment()}>
                    <Plus className="size-4" />
                    Add Assessment
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedAssessment ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Assessment Settings</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[1fr,1fr,180px,180px]">
                  <Input
                    value={assessmentDraft.title}
                    onChange={(event) =>
                      setAssessmentDraft((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                  <Textarea
                    value={assessmentDraft.description}
                    onChange={(event) =>
                      setAssessmentDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    rows={2}
                  />
                  <Select
                    value={assessmentDraft.type}
                    onValueChange={(value: 'multiple_choice' | 'fill_blank' | 'mixed') =>
                      setAssessmentDraft((current) => ({ ...current, type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                      <SelectItem value="fill_blank">Fill Blank</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void handleSaveAssessment()} className="flex-1">
                      <Save className="size-4" />
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      onClick={() => void handleDeleteAssessment(selectedAssessment.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {selectedAssessment.questions.map((question) => (
                  <QuestionEditorCard
                    key={question.id}
                    question={question}
                    onDelete={handleDeleteQuestion}
                  />
                ))}

                <Card className="border-dashed border-slate-300 bg-slate-50">
                  <CardHeader>
                    <CardTitle className="text-base">Add Question</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      value={newQuestionDraft.questionText}
                      onChange={(event) =>
                        setNewQuestionDraft((current) => ({ ...current, questionText: event.target.value }))
                      }
                      placeholder="Question prompt"
                      rows={3}
                    />
                    <div className="grid gap-4 md:grid-cols-[220px,1fr]">
                      <Select
                        value={newQuestionDraft.questionType}
                        onValueChange={(value: 'multiple_choice' | 'fill_blank') =>
                          setNewQuestionDraft((current) => ({ ...current, questionType: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                          <SelectItem value="fill_blank">Fill Blank</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={newQuestionDraft.correctAnswer}
                        onChange={(event) =>
                          setNewQuestionDraft((current) => ({ ...current, correctAnswer: event.target.value }))
                        }
                        placeholder="Correct answer"
                      />
                    </div>

                    {newQuestionDraft.questionType === 'multiple_choice' ? (
                      <div className="space-y-2">
                        {newQuestionDraft.options.map((option, index) => (
                          <Input
                            key={`new-option-${index}`}
                            value={option}
                            onChange={(event) =>
                              setNewQuestionDraft((current) => {
                                const nextOptions = [...current.options]
                                nextOptions[index] = event.target.value
                                return { ...current, options: nextOptions }
                              })
                            }
                            placeholder={`Option ${String.fromCharCode(65 + index)}`}
                          />
                        ))}
                      </div>
                    ) : null}

                    <Textarea
                      value={newQuestionDraft.explanation}
                      onChange={(event) =>
                        setNewQuestionDraft((current) => ({ ...current, explanation: event.target.value }))
                      }
                      placeholder="Instant feedback / explanation"
                      rows={3}
                    />
                    <Button type="button" onClick={() => void handleCreateQuestion()}>
                      <Plus className="size-4" />
                      Add Question
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>No assessment selected</CardTitle>
                <CardDescription>Create an assessment inside this category to start adding questions.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No category selected</CardTitle>
            <CardDescription>Create or select a category to open the builder.</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}

function CategoryEditor({
  category,
  draft,
  onDraftChange,
  onSave,
  onArchive,
}: {
  category: CategoryRecord
  draft: CategoryDraft
  onDraftChange: (draft: CategoryDraft) => void
  onSave: () => Promise<void>
  onArchive: () => Promise<void>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Metadata</CardTitle>
        <CardDescription>Modify the category metadata and passing score.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr,1fr,180px]">
        <div>
          <Label>Title</Label>
          <Input
            className="mt-2"
            value={draft.title}
            onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
          />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            className="mt-2"
            value={draft.description}
            onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
            rows={3}
          />
        </div>
        <div className="space-y-3">
          <div>
            <Label>Passing Score</Label>
            <Input
              className="mt-2"
              type="number"
              min={0}
              max={100}
              value={draft.passingScore}
              onChange={(event) =>
                onDraftChange({ ...draft, passingScore: Number(event.target.value) || 0 })
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{category.attemptCount} attempts</Badge>
            <Badge variant="outline">{category.passRate.toFixed(1)}% pass rate</Badge>
          </div>
          <Button type="button" onClick={() => void onSave()} className="w-full">
            <Save className="size-4" />
            Save Category
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full border-rose-200 text-rose-700 hover:bg-rose-50"
            onClick={() => void onArchive()}
          >
            <Trash2 className="size-4" />
            Archive
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
