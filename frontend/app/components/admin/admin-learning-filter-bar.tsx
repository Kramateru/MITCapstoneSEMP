'use client'

import { FilterX } from 'lucide-react'
import { useMemo } from 'react'

import {
  ADMIN_COMPLETION_STATUS_OPTIONS,
  ADMIN_PERFORMANCE_LEVEL_OPTIONS,
  EMPTY_ADMIN_LEARNING_FILTERS,
  type AdminLearningFilterState,
  type AdminLearningInsightsResponse,
} from '@/app/lib/admin-learning-insights'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

const NONE_VALUE = '__all__'

type Props = {
  value: AdminLearningFilterState
  options: AdminLearningInsightsResponse['filters'] | null
  onChange: (next: AdminLearningFilterState) => void
}

export function AdminLearningFilterBar({ value, options, onChange }: Props) {
  const batchOptions = useMemo(() => {
    const rows = options?.batches || []
    if (!value.trainerId) {
      return rows
    }
    return rows.filter((row) => row.trainer_id === value.trainerId)
  }, [options?.batches, value.trainerId])

  const traineeOptions = useMemo(() => {
    let rows = options?.trainees || []
    if (value.trainerId) {
      rows = rows.filter((row) => row.trainer_ids.includes(value.trainerId))
    }
    if (value.batchId) {
      rows = rows.filter((row) => row.batch_ids.includes(value.batchId))
    }
    return rows
  }, [options?.trainees, value.trainerId, value.batchId])

  const moduleOptions = useMemo(() => {
    const rows = options?.modules || []
    if (!value.trainerId) {
      return rows
    }
    return rows.filter((row) => row.created_by === value.trainerId)
  }, [options?.modules, value.trainerId])

  const assessmentOptions = useMemo(() => {
    let rows = options?.assessments || []
    if (value.trainerId) {
      rows = rows.filter((row) => row.assigned_by === value.trainerId)
    }
    if (value.batchId) {
      rows = rows.filter((row) => row.assigned_batch_id === value.batchId || !row.assigned_batch_id)
    }
    return rows
  }, [options?.assessments, value.trainerId, value.batchId])

  const exerciseOptions = useMemo(() => {
    let rows = options?.exercises || []
    if (value.trainerId) {
      rows = rows.filter((row) => row.created_by === value.trainerId)
    }
    if (value.moduleId) {
      rows = rows.filter((row) => row.module_id === value.moduleId)
    }
    return rows
  }, [options?.exercises, value.trainerId, value.moduleId])

  const setField = <K extends keyof AdminLearningFilterState>(
    field: K,
    nextValue: AdminLearningFilterState[K],
  ) => {
    const next = { ...value, [field]: nextValue }
    const allBatches = options?.batches || []
    const allTrainees = options?.trainees || []
    const allModules = options?.modules || []
    const allAssessments = options?.assessments || []
    const allExercises = options?.exercises || []

    const nextBatchOptions = next.trainerId
      ? allBatches.filter((row) => row.trainer_id === next.trainerId)
      : allBatches
    const nextTraineeOptions = allTrainees.filter((row) => {
      if (next.trainerId && !row.trainer_ids.includes(next.trainerId)) {
        return false
      }
      if (next.batchId && !row.batch_ids.includes(next.batchId)) {
        return false
      }
      return true
    })
    const nextModuleOptions = next.trainerId
      ? allModules.filter((row) => row.created_by === next.trainerId)
      : allModules
    const nextAssessmentOptions = allAssessments.filter((row) => {
      if (next.trainerId && row.assigned_by !== next.trainerId) {
        return false
      }
      if (next.batchId && row.assigned_batch_id !== next.batchId && row.assigned_batch_id) {
        return false
      }
      return true
    })
    const nextExerciseOptions = allExercises.filter((row) => {
      if (next.trainerId && row.created_by !== next.trainerId) {
        return false
      }
      if (next.moduleId && row.module_id !== next.moduleId) {
        return false
      }
      return true
    })

    if (field === 'trainerId') {
      if (next.batchId && !nextBatchOptions.some((row) => row.id === next.batchId)) {
        next.batchId = ''
      }
      if (next.traineeId && !nextTraineeOptions.some((row) => row.id === next.traineeId)) {
        next.traineeId = ''
      }
      if (next.moduleId && !nextModuleOptions.some((row) => row.id === next.moduleId)) {
        next.moduleId = ''
      }
      if (next.assessmentId && !nextAssessmentOptions.some((row) => row.id === next.assessmentId)) {
        next.assessmentId = ''
      }
      if (next.exerciseId && !nextExerciseOptions.some((row) => row.id === next.exerciseId)) {
        next.exerciseId = ''
      }
    }

    if (field === 'batchId') {
      if (next.traineeId && !nextTraineeOptions.some((row) => row.id === next.traineeId)) {
        next.traineeId = ''
      }
      if (next.assessmentId && !nextAssessmentOptions.some((row) => row.id === next.assessmentId)) {
        next.assessmentId = ''
      }
    }

    if (field === 'moduleId' && next.exerciseId && !nextExerciseOptions.some((row) => row.id === next.exerciseId)) {
      next.exerciseId = ''
    }

    if (field === 'traineeId' && nextValue && !next.batchId) {
      const selectedTrainee = allTrainees.find((row) => row.id === nextValue)
      if (selectedTrainee?.batch_ids.length === 1) {
        next.batchId = selectedTrainee.batch_ids[0] || next.batchId
      }
    }

    onChange(next)
  }

  return (
    <div className="rounded-3xl border bg-white/90 p-4 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-2">
          <Label>Trainer</Label>
          <Select value={value.trainerId || NONE_VALUE} onValueChange={(nextValue) => setField('trainerId', nextValue === NONE_VALUE ? '' : nextValue)}>
            <SelectTrigger>
              <SelectValue placeholder="All trainers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>All trainers</SelectItem>
              {(options?.trainers || []).map((trainer) => (
                <SelectItem key={trainer.id} value={trainer.id}>
                  {trainer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Batch</Label>
          <Select value={value.batchId || NONE_VALUE} onValueChange={(nextValue) => setField('batchId', nextValue === NONE_VALUE ? '' : nextValue)}>
            <SelectTrigger>
              <SelectValue placeholder="All batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>All batches</SelectItem>
              {batchOptions.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Trainee</Label>
          <Select value={value.traineeId || NONE_VALUE} onValueChange={(nextValue) => setField('traineeId', nextValue === NONE_VALUE ? '' : nextValue)}>
            <SelectTrigger>
              <SelectValue placeholder="All trainees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>All trainees</SelectItem>
              {traineeOptions.map((trainee) => (
                <SelectItem key={trainee.id} value={trainee.id}>
                  {trainee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Module</Label>
          <Select value={value.moduleId || NONE_VALUE} onValueChange={(nextValue) => setField('moduleId', nextValue === NONE_VALUE ? '' : nextValue)}>
            <SelectTrigger>
              <SelectValue placeholder="All modules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>All modules</SelectItem>
              {moduleOptions.map((module) => (
                <SelectItem key={module.id} value={module.id}>
                  {module.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Assessment</Label>
          <Select value={value.assessmentId || NONE_VALUE} onValueChange={(nextValue) => setField('assessmentId', nextValue === NONE_VALUE ? '' : nextValue)}>
            <SelectTrigger>
              <SelectValue placeholder="All assessments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>All assessments</SelectItem>
              {assessmentOptions.map((assessment) => (
                <SelectItem key={assessment.id} value={assessment.id}>
                  {assessment.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Exercise</Label>
          <Select value={value.exerciseId || NONE_VALUE} onValueChange={(nextValue) => setField('exerciseId', nextValue === NONE_VALUE ? '' : nextValue)}>
            <SelectTrigger>
              <SelectValue placeholder="All exercises" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>All exercises</SelectItem>
              {exerciseOptions.map((exercise) => (
                <SelectItem key={exercise.id} value={exercise.id}>
                  {exercise.module_title} - {exercise.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Completion Status</Label>
          <Select value={value.completionStatus || NONE_VALUE} onValueChange={(nextValue) => setField('completionStatus', nextValue === NONE_VALUE ? '' : nextValue)}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>All statuses</SelectItem>
              {ADMIN_COMPLETION_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Performance Level</Label>
          <Select value={value.performanceLevel || NONE_VALUE} onValueChange={(nextValue) => setField('performanceLevel', nextValue === NONE_VALUE ? '' : nextValue)}>
            <SelectTrigger>
              <SelectValue placeholder="All levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>All levels</SelectItem>
              {ADMIN_PERFORMANCE_LEVEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Start Date</Label>
          <Input type="date" value={value.startDate} onChange={(event) => setField('startDate', event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>End Date</Label>
          <Input type="date" value={value.endDate} onChange={(event) => setField('endDate', event.target.value)} />
        </div>

        <div className="flex items-end">
          <Button type="button" variant="outline" className="w-full" onClick={() => onChange(EMPTY_ADMIN_LEARNING_FILTERS)}>
            <FilterX className="mr-2 size-4" />
            Clear Filters
          </Button>
        </div>
      </div>
    </div>
  )
}
