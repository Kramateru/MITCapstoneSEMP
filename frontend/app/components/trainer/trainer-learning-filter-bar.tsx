'use client'

import { FilterX } from 'lucide-react'
import { useMemo } from 'react'

import {
  EMPTY_TRAINER_LEARNING_FILTERS,
  type TrainerLearningFilterState,
  type TrainerLearningInsightsResponse,
} from '@/app/lib/trainer-learning-insights'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

const NONE_VALUE = '__all__'

type Props = {
  value: TrainerLearningFilterState
  options: TrainerLearningInsightsResponse['filters'] | null
  onChange: (next: TrainerLearningFilterState) => void
}

export function TrainerLearningFilterBar({ value, options, onChange }: Props) {
  const traineeOptions = useMemo(() => {
    const rows = options?.trainees || []
    if (!value.batchId) {
      return rows
    }
    return rows.filter((row) => row.batch_ids.includes(value.batchId))
  }, [options?.trainees, value.batchId])

  const exerciseOptions = useMemo(() => {
    const rows = options?.exercises || []
    if (!value.moduleId) {
      return rows
    }
    return rows.filter((row) => row.module_id === value.moduleId)
  }, [options?.exercises, value.moduleId])

  const assessmentOptions = useMemo(() => {
    const rows = options?.assessments || []
    if (value.batchId) {
      return rows.filter(
        (row) =>
          row.assigned_batch_id === value.batchId
          || !row.assigned_batch_id,
      )
    }
    return rows
  }, [options?.assessments, value.batchId])

  const setField = <K extends keyof TrainerLearningFilterState>(field: K, nextValue: TrainerLearningFilterState[K]) => {
    const next = { ...value, [field]: nextValue }
    const allTrainees = options?.trainees || []
    const allExercises = options?.exercises || []
    const allAssessments = options?.assessments || []

    const nextTraineeOptions = next.batchId
      ? allTrainees.filter((row) => row.batch_ids.includes(next.batchId))
      : allTrainees
    const nextExerciseOptions = next.moduleId
      ? allExercises.filter((row) => row.module_id === next.moduleId)
      : allExercises
    const nextAssessmentOptions = next.batchId
      ? allAssessments.filter(
        (row) => row.assigned_batch_id === next.batchId || !row.assigned_batch_id,
      )
      : allAssessments

    if (field === 'batchId') {
      const batchSpecificTraineeStillMatches = !next.traineeId || nextTraineeOptions.some((row) => row.id === next.traineeId)
      if (!batchSpecificTraineeStillMatches) {
        next.traineeId = ''
      }

      const batchSpecificAssessmentStillMatches = !next.assessmentId || nextAssessmentOptions.some((row) => row.id === next.assessmentId)
      if (!batchSpecificAssessmentStillMatches) {
        next.assessmentId = ''
      }
    }

    if (field === 'moduleId') {
      const moduleSpecificExerciseStillMatches = !next.exerciseId || nextExerciseOptions.some((row) => row.id === next.exerciseId)
      if (!moduleSpecificExerciseStillMatches) {
        next.exerciseId = ''
      }
    }

    if (field === 'traineeId' && nextValue && !value.batchId) {
      const selectedTrainee = traineeOptions.find((row) => row.id === nextValue)
      if (selectedTrainee && selectedTrainee.batch_ids.length === 1) {
        next.batchId = selectedTrainee.batch_ids[0] || next.batchId
      }
    }

    onChange(next)
  }

  return (
    <div className="rounded-3xl border bg-white/85 p-4 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <Label>Batch</Label>
          <Select value={value.batchId || NONE_VALUE} onValueChange={(nextValue) => setField('batchId', nextValue === NONE_VALUE ? '' : nextValue)}>
            <SelectTrigger>
              <SelectValue placeholder="All batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>All batches</SelectItem>
              {(options?.batches || []).map((batch) => (
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
              {(options?.modules || []).map((module) => (
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
          <Label>Start Date</Label>
          <Input
            type="date"
            value={value.startDate}
            onChange={(event) => setField('startDate', event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>End Date</Label>
          <Input
            type="date"
            value={value.endDate}
            onChange={(event) => setField('endDate', event.target.value)}
          />
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onChange(EMPTY_TRAINER_LEARNING_FILTERS)}
          >
            <FilterX className="mr-2 size-4" />
            Clear Filters
          </Button>
        </div>
      </div>
    </div>
  )
}
