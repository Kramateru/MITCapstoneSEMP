'use client';

import { startTransition, useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/app/context/AuthContext';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Textarea } from '../ui/textarea';

type ModuleCategory = 'pronunciation' | 'fluency' | 'grammar' | 'empathy' | 'clarity';
type ModuleDifficulty = 'basic' | 'intermediate' | 'advanced';
type AssignmentStatus = 'assigned' | 'in_progress' | 'completed';

interface AssignmentSummary {
  id: string;
  module_id: string;
  title: string;
  description?: string | null;
  category?: ModuleCategory | null;
  skill_focus?: string | null;
  duration_minutes?: number | null;
  difficulty?: ModuleDifficulty | null;
  content_url?: string | null;
  status: AssignmentStatus;
  completion_percentage: number;
  exercise_count: number;
  completed_exercises: number;
  assigned_at?: string;
  due_date?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  is_mandatory?: boolean;
  batch_name?: string | null;
  batch_wave_number?: number | null;
  batch_label?: string | null;
  assigned_by_name?: string | null;
}

interface ExerciseAttempt {
  id: string;
  response_text?: string | null;
  selected_option?: string | null;
  score?: number | null;
  feedback?: string | null;
  is_completed: boolean;
  submitted_at?: string | null;
}

interface AssignmentExercise {
  id: string;
  title: string;
  type: 'multiple_choice' | 'keyword_response';
  prompt: string;
  options?: string[];
  required_keywords?: string[];
  tips?: string[];
  explanation?: string;
  sample_answer?: string;
  attempt?: ExerciseAttempt | null;
}

interface AssignmentDetailResponse {
  assignment: AssignmentSummary;
  exercises: AssignmentExercise[];
}

interface ExerciseResponseState {
  responseText: string;
  selectedOption: string;
}

const CATEGORY_BADGE_STYLES: Record<ModuleCategory, string> = {
  pronunciation: 'bg-sky-100 text-sky-700 border-sky-200',
  fluency: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  grammar: 'bg-amber-100 text-amber-700 border-amber-200',
  empathy: 'bg-rose-100 text-rose-700 border-rose-200',
  clarity: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const STATUS_BADGE_STYLES: Record<AssignmentStatus, string> = {
  assigned: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function formatLabel(value?: string | null) {
  if (!value) {
    return 'Not set';
  }

  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'No date set';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatBatchLabel(assignment?: AssignmentSummary | null) {
  if (!assignment) {
    return 'No batch assigned';
  }

  if (assignment.batch_label) {
    return assignment.batch_label;
  }

  if (assignment.batch_name && assignment.batch_wave_number !== null && assignment.batch_wave_number !== undefined) {
    return `${assignment.batch_name} | Wave ${assignment.batch_wave_number}`;
  }

  if (assignment.batch_name) {
    return assignment.batch_name;
  }

  if (assignment.batch_wave_number !== null && assignment.batch_wave_number !== undefined) {
    return `Wave ${assignment.batch_wave_number}`;
  }

  return 'No batch assigned';
}

export default function MicrolearningHub() {
  const { token, isLoading: isAuthLoading } = useAuth();

  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState('');
  const [assignmentDetail, setAssignmentDetail] = useState<AssignmentDetailResponse | null>(null);
  const [exerciseResponses, setExerciseResponses] = useState<Record<string, ExerciseResponseState>>({});
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [submittingExerciseId, setSubmittingExerciseId] = useState('');

  async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!token) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);

    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(path, {
      ...init,
      cache: 'no-store',
      headers,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok) {
      const message =
        (payload as { detail?: string } | null)?.detail || 'Request failed. Please try again.';
      throw new Error(message);
    }

    return payload as T;
  }

  async function loadAssignmentDetail(assignmentId: string) {
    if (!assignmentId) {
      setAssignmentDetail(null);
      setExerciseResponses({});
      return;
    }

    setIsLoadingDetail(true);

    try {
      const detail = await apiRequest<AssignmentDetailResponse>(
        `/api/trainee/microlearning-assignments/${assignmentId}`,
      );

      const nextResponses: Record<string, ExerciseResponseState> = {};
      (detail.exercises || []).forEach((exercise) => {
        nextResponses[exercise.id] = {
          responseText: exercise.attempt?.response_text || '',
          selectedOption: exercise.attempt?.selected_option || '',
        };
      });

      startTransition(() => {
        setAssignmentDetail(detail);
        setExerciseResponses(nextResponses);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load this module.';
      toast.error(message);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function loadAssignments(preferredAssignmentId?: string) {
    if (!token) {
      setIsLoadingAssignments(false);
      return;
    }

    setIsLoadingAssignments(true);

    try {
      const response = await apiRequest<{ assignments: AssignmentSummary[] }>(
        '/api/trainee/microlearning-assignments',
      );
      const nextAssignments = response.assignments || [];
      const nextActiveId =
        (preferredAssignmentId && nextAssignments.some((assignment) => assignment.id === preferredAssignmentId)
          ? preferredAssignmentId
          : undefined) ||
        (activeAssignmentId && nextAssignments.some((assignment) => assignment.id === activeAssignmentId)
          ? activeAssignmentId
          : undefined) ||
        nextAssignments.find((assignment) => assignment.status !== 'completed')?.id ||
        nextAssignments[0]?.id ||
        '';

      startTransition(() => {
        setAssignments(nextAssignments);
        setActiveAssignmentId(nextActiveId);
      });

      if (nextActiveId) {
        await loadAssignmentDetail(nextActiveId);
      } else {
        setAssignmentDetail(null);
        setExerciseResponses({});
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load your assignments.';
      toast.error(message);
    } finally {
      setIsLoadingAssignments(false);
    }
  }

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    void loadAssignments();
  }, [isAuthLoading, token]);

  function updateExerciseResponse(exerciseId: string, patch: Partial<ExerciseResponseState>) {
    setExerciseResponses((current) => ({
      ...current,
      [exerciseId]: {
        responseText: current[exerciseId]?.responseText || '',
        selectedOption: current[exerciseId]?.selectedOption || '',
        ...patch,
      },
    }));
  }

  async function handleSelectAssignment(assignmentId: string) {
    setActiveAssignmentId(assignmentId);
    await loadAssignmentDetail(assignmentId);
  }

  async function handleSubmitExercise(exercise: AssignmentExercise) {
    if (!activeAssignmentId) {
      toast.error('Choose a module before saving an exercise.');
      return;
    }

    const response = exerciseResponses[exercise.id] || {
      responseText: '',
      selectedOption: '',
    };

    if (exercise.type === 'multiple_choice' && !response.selectedOption) {
      toast.error('Choose an answer before submitting.');
      return;
    }

    if (exercise.type === 'keyword_response' && !response.responseText.trim()) {
      toast.error('Type your answer before submitting.');
      return;
    }

    setSubmittingExerciseId(exercise.id);

    try {
      await apiRequest(
        `/api/trainee/microlearning-assignments/${activeAssignmentId}/exercises/${exercise.id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            response_text: response.responseText || null,
            selected_option: response.selectedOption || null,
          }),
        },
      );

      toast.success('Exercise saved successfully.');
      await loadAssignments(activeAssignmentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save this exercise.';
      toast.error(message);
    } finally {
      setSubmittingExerciseId('');
    }
  }

  const completedAssignments = assignments.filter((assignment) => assignment.status === 'completed').length;
  const inProgressAssignments = assignments.filter((assignment) => assignment.status === 'in_progress').length;
  const assignedCount = assignments.length;
  const activeAssignment = assignmentDetail?.assignment || null;

  if (!isAuthLoading && !token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Session Required</CardTitle>
          <CardDescription>Sign in as a trainee to access your assigned microlearning modules.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!isLoadingAssignments && assignments.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Microlearning Assignment Center</CardTitle>
            <CardDescription>
              Your trainer can assign category-based modules here. Once assigned, you can answer the exercises and track your progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="rounded-lg bg-slate-50 p-6 text-sm text-slate-600">
            No modules are assigned to you yet. Please wait for your trainer to send a microlearning module.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-none bg-gradient-to-r from-sky-50 via-white to-emerald-50 shadow-sm">
        <CardHeader>
          <CardTitle>Microlearning Assignment Center</CardTitle>
          <CardDescription>
            Work through the assigned exercises for your coaching category and save your responses as you go.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-white/80 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <BookOpen className="size-4" />
              Assigned Modules
            </div>
            <p className="mt-3 text-3xl font-semibold">{assignedCount}</p>
            <p className="text-sm text-slate-500">Modules currently in your queue</p>
          </div>

          <div className="rounded-xl border bg-white/80 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <CircleDashed className="size-4" />
              In Progress
            </div>
            <p className="mt-3 text-3xl font-semibold">{inProgressAssignments}</p>
            <p className="text-sm text-slate-500">Modules you have already started</p>
          </div>

          <div className="rounded-xl border bg-white/80 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <CheckCircle2 className="size-4" />
              Completed
            </div>
            <p className="mt-3 text-3xl font-semibold">{completedAssignments}</p>
            <p className="text-sm text-slate-500">Finished microlearning modules</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Your Assigned Modules</CardTitle>
            <CardDescription>Select a module to open its exercises and continue your work.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAssignments ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                Loading your modules...
              </div>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment) => {
                  const isActive = assignment.id === activeAssignmentId;

                  return (
                    <button
                      key={assignment.id}
                      type="button"
                      onClick={() => void handleSelectAssignment(assignment.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        isActive ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-sky-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{assignment.title}</p>
                        {assignment.category ? (
                          <Badge className={CATEGORY_BADGE_STYLES[assignment.category]}>
                            {formatLabel(assignment.category)}
                          </Badge>
                        ) : null}
                      </div>

                      <p className="mt-2 text-sm text-slate-600">
                        {assignment.description || 'No description provided yet.'}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <Badge className={STATUS_BADGE_STYLES[assignment.status]}>
                          {formatLabel(assignment.status)}
                        </Badge>
                        {assignment.is_mandatory ? <Badge variant="outline">Mandatory</Badge> : null}
                        <span>{assignment.completed_exercises}/{assignment.exercise_count} exercises</span>
                        <span>{assignment.duration_minutes || 0} minutes</span>
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        Batch / Wave: {formatBatchLabel(assignment)}
                        {assignment.assigned_by_name ? ` | Assigned by: ${assignment.assigned_by_name}` : ''}
                      </div>

                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Progress</span>
                          <span>{Math.round(assignment.completion_percentage)}%</span>
                        </div>
                        <Progress value={assignment.completion_percentage || 0} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{activeAssignment?.title || 'Module Detail'}</CardTitle>
            <CardDescription>
              {activeAssignment?.skill_focus || 'Open a module to view the exercise instructions and save your answers.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDetail || !assignmentDetail || !activeAssignment ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">
                {isLoadingDetail ? 'Loading module detail...' : 'Select a module to begin.'}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {activeAssignment.category ? (
                          <Badge className={CATEGORY_BADGE_STYLES[activeAssignment.category]}>
                            {formatLabel(activeAssignment.category)}
                          </Badge>
                        ) : null}
                        <Badge className={STATUS_BADGE_STYLES[activeAssignment.status]}>
                          {formatLabel(activeAssignment.status)}
                        </Badge>
                        {activeAssignment.difficulty ? (
                          <Badge variant="outline">{formatLabel(activeAssignment.difficulty)}</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-600">
                        {activeAssignment.description || 'No description provided yet.'}
                      </p>
                      <div className="text-sm text-slate-500">
                        Batch / Wave: {formatBatchLabel(activeAssignment)}
                        {activeAssignment.assigned_by_name ? ` | Assigned by: ${activeAssignment.assigned_by_name}` : ''}
                      </div>
                    </div>

                    <div className="space-y-1 text-sm text-slate-500">
                      <p>Assigned: {formatDate(activeAssignment.assigned_at)}</p>
                      <p>Due: {formatDate(activeAssignment.due_date)}</p>
                      {activeAssignment.completed_at ? <p>Completed: {formatDate(activeAssignment.completed_at)}</p> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-white p-3">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Clock3 className="size-4" />
                        Duration
                      </div>
                      <p className="mt-2 text-lg font-semibold">{activeAssignment.duration_minutes || 0} minutes</p>
                    </div>
                    <div className="rounded-lg border bg-white p-3">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <FileText className="size-4" />
                        Exercises
                      </div>
                      <p className="mt-2 text-lg font-semibold">
                        {activeAssignment.completed_exercises}/{activeAssignment.exercise_count}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-white p-3">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <CheckCircle2 className="size-4" />
                        Completion
                      </div>
                      <p className="mt-2 text-lg font-semibold">
                        {Math.round(activeAssignment.completion_percentage)}%
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>Overall progress</span>
                      <span>{Math.round(activeAssignment.completion_percentage)}%</span>
                    </div>
                    <Progress value={activeAssignment.completion_percentage || 0} />
                  </div>

                  {activeAssignment.notes ? (
                    <div className="mt-4 rounded-lg border bg-white p-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-700">Trainer Notes</p>
                      <p className="mt-2 whitespace-pre-wrap">{activeAssignment.notes}</p>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {assignmentDetail.exercises.map((exercise, index) => {
                    const response = exerciseResponses[exercise.id] || {
                      responseText: '',
                      selectedOption: '',
                    };
                    const isSaving = submittingExerciseId === exercise.id;

                    return (
                      <Card key={exercise.id} className="border-slate-200">
                        <CardHeader>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <CardTitle className="text-base">
                                Exercise {index + 1}: {exercise.title}
                              </CardTitle>
                              <CardDescription>{exercise.prompt}</CardDescription>
                            </div>
                            <Badge variant="outline">{formatLabel(exercise.type)}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {exercise.required_keywords && exercise.required_keywords.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-slate-700">Target keywords</p>
                              <div className="flex flex-wrap gap-2">
                                {exercise.required_keywords.map((keyword) => (
                                  <Badge key={keyword} variant="outline">
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {exercise.tips && exercise.tips.length > 0 ? (
                            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                              <p className="font-medium text-slate-700">Coaching tips</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {exercise.tips.map((tip) => (
                                  <Badge key={tip} variant="outline">
                                    {tip}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {exercise.type === 'multiple_choice' ? (
                            <RadioGroup
                              value={response.selectedOption}
                              onValueChange={(value) =>
                                updateExerciseResponse(exercise.id, { selectedOption: value })
                              }
                            >
                              {(exercise.options || []).map((option, optionIndex) => {
                                const optionId = `${exercise.id}-option-${optionIndex}`;

                                return (
                                  <label
                                    key={option}
                                    htmlFor={optionId}
                                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                                  >
                                    <RadioGroupItem id={optionId} value={option} />
                                    <span className="text-sm text-slate-700">{option}</span>
                                  </label>
                                );
                              })}
                            </RadioGroup>
                          ) : (
                            <div className="space-y-2">
                              <Label htmlFor={exercise.id}>Your response</Label>
                              <Textarea
                                id={exercise.id}
                                value={response.responseText}
                                placeholder="Type your response here."
                                onChange={(event) =>
                                  updateExerciseResponse(exercise.id, {
                                    responseText: event.target.value,
                                  })
                                }
                              />
                            </div>
                          )}

                          {exercise.sample_answer ? (
                            <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-600">
                              <p className="font-medium text-slate-700">Sample answer</p>
                              <p className="mt-2">{exercise.sample_answer}</p>
                            </div>
                          ) : null}

                          {exercise.attempt ? (
                            <div className="rounded-lg border bg-emerald-50 p-3 text-sm text-slate-700">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium">Latest result</p>
                                <Badge className="bg-white text-emerald-700 border-emerald-200">
                                  Score: {Math.round(exercise.attempt.score || 0)}%
                                </Badge>
                              </div>
                              <p className="mt-2">{exercise.attempt.feedback || 'Saved successfully.'}</p>
                              {exercise.attempt.submitted_at ? (
                                <p className="mt-2 text-xs text-slate-500">
                                  Last submitted: {formatDate(exercise.attempt.submitted_at)}
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <Button type="button" onClick={() => void handleSubmitExercise(exercise)} disabled={isSaving}>
                            {isSaving ? 'Saving Exercise...' : 'Save Exercise'}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
