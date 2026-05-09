'use client'

import { Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

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
import { createAssessmentAssignment } from '@/app/lib/assessment/client'
import type { TrainerBootstrapResponse } from '@/app/lib/assessment/types'

export function TrainerAssignmentPanel({
  workspace,
  onRefresh,
}: {
  workspace: TrainerBootstrapResponse
  onRefresh: () => Promise<void>
}) {
  const [draft, setDraft] = useState({
    categoryId: '',
    assessmentId: 'all',
    targetType: 'batch' as 'batch' | 'trainee',
    targetId: '',
    dueAt: '',
  })
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [assignmentTargetFilter, setAssignmentTargetFilter] = useState<'all' | 'batch' | 'trainee'>('all')

  useEffect(() => {
    if (!workspace.categories.length) {
      return
    }
    setDraft((current) => ({
      ...current,
      categoryId: current.categoryId || workspace.categories[0].id,
      assessmentId: current.assessmentId || workspace.categories[0].assessments[0]?.id || 'all',
    }))
  }, [workspace.categories])

  const selectedCategory = workspace.categories.find((category) => category.id === draft.categoryId)
  const targetOptions = draft.targetType === 'batch' ? workspace.batches : workspace.trainees
  const filteredAssignments = useMemo(() => {
    const normalizedSearch = assignmentSearch.trim().toLowerCase()

    return workspace.assignments.filter((assignment) => {
      if (assignmentTargetFilter !== 'all' && assignment.targetType !== assignmentTargetFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        assignment.categoryTitle,
        assignment.assessmentTitle || '',
        assignment.targetLabel,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [assignmentSearch, assignmentTargetFilter, workspace.assignments])

  const handleCreateAssignment = async () => {
    if (!draft.categoryId || !draft.targetId) {
      toast.error('Select a category and a target.')
      return
    }

    await createAssessmentAssignment({
      categoryId: draft.categoryId,
      assessmentId: draft.assessmentId === 'all' ? null : draft.assessmentId,
      batchId: draft.targetType === 'batch' ? draft.targetId : null,
      traineeId: draft.targetType === 'trainee' ? draft.targetId : null,
      dueAt: draft.dueAt || null,
      title: `${selectedCategory?.title || 'Assessment'} Assignment`,
      assignmentMode: draft.assessmentId === 'all' ? 'entire_category' : 'selected_questions',
    })

    toast.success('Assignment created.')
    await onRefresh()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assignment Center</CardTitle>
          <CardDescription>Assign an entire category or a single assessment to a batch or trainee.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[1fr,1fr,220px,220px,220px]">
          <Select
            value={draft.categoryId}
            onValueChange={(value) =>
              setDraft((current) => ({
                ...current,
                categoryId: value,
                assessmentId:
                  workspace.categories.find((category) => category.id === value)?.assessments[0]?.id || 'all',
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {workspace.categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={draft.assessmentId}
            onValueChange={(value) => setDraft((current) => ({ ...current, assessmentId: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Assessment scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Entire Category</SelectItem>
              {(selectedCategory?.assessments || []).map((assessment) => (
                <SelectItem key={assessment.id} value={assessment.id}>
                  {assessment.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={draft.targetType}
            onValueChange={(value: 'batch' | 'trainee') =>
              setDraft((current) => ({ ...current, targetType: value, targetId: '' }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="batch">Batch</SelectItem>
              <SelectItem value="trainee">Trainee</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={draft.targetId}
            onValueChange={(value) => setDraft((current) => ({ ...current, targetId: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={draft.targetType === 'batch' ? 'Select batch' : 'Select trainee'} />
            </SelectTrigger>
            <SelectContent>
              {targetOptions.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  {'name' in target ? target.name : target.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Input
              type="date"
              value={draft.dueAt}
              onChange={(event) => setDraft((current) => ({ ...current, dueAt: event.target.value }))}
            />
            <Button type="button" onClick={() => void handleCreateAssignment()}>
              <Users className="size-4" />
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Assignments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <Input
              value={assignmentSearch}
              onChange={(event) => setAssignmentSearch(event.target.value)}
              placeholder="Search category, assessment, or assignment target"
            />
            <Select
              value={assignmentTargetFilter}
              onValueChange={(value: 'all' | 'batch' | 'trainee') => setAssignmentTargetFilter(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All targets</SelectItem>
                <SelectItem value="batch">Batch assignments</SelectItem>
                <SelectItem value="trainee">Direct trainee assignments</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredAssignments.map((assignment) => (
            <div key={assignment.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{assignment.categoryTitle}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {assignment.assessmentTitle ? `Assessment: ${assignment.assessmentTitle}` : 'Entire category'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{assignment.targetType}</Badge>
                  <Badge variant="outline">{assignment.targetLabel}</Badge>
                  {assignment.dueAt ? <Badge variant="outline">Due {assignment.dueAt.slice(0, 10)}</Badge> : null}
                </div>
              </div>
            </div>
          ))}

          {!filteredAssignments.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              {workspace.assignments.length
                ? 'No assignments match the current filters.'
                : 'No assignments yet. Push a category into a batch to populate trainee dashboards.'}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
