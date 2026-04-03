'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import MCQManager from '@/app/components/shared/mcq-manager';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Progress } from '@/app/components/ui/progress';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { Textarea } from '@/app/components/ui/textarea';
import {
  BookOpenCheck,
  ClipboardList,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

type TrainerBatch = {
  id: string;
  name: string;
  description?: string | null;
  wave_number?: number | null;
  lob?: string | null;
  users_count?: number;
};

type TrainerTrainee = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  batch?: TrainerBatch | null;
  batches?: TrainerBatch[];
  batch_ids?: string[];
  batch_names?: string[];
};

type TrainerMcqCategory = {
  id: string;
  name: string;
  description?: string | null;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  passing_threshold: number;
  question_count: number;
  created_by_name?: string | null;
};

type TrainerMcqQuestion = {
  id: string;
  question_text: string;
  options: Record<string, string>;
  explanation?: string | null;
};

type TrainerMcqAssignmentTrainee = {
  id: string;
  full_name: string;
  email: string;
  batch_id?: string | null;
  batch_name?: string | null;
  status: 'pending' | 'completed';
  score_percentage?: number | null;
  is_passed?: boolean | null;
  submitted_at?: string | null;
  certificate_id?: string | null;
  certificate_no?: string | null;
};

type TrainerMcqAssignment = {
  id: string;
  title: string;
  description?: string | null;
  category_id: string;
  category_name?: string | null;
  category_description?: string | null;
  passing_threshold: number;
  assigned_by_name?: string | null;
  assigned_batch_id?: string | null;
  assigned_batch_name?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  question_ids?: string[];
  category_question_count?: number;
  question_count: number;
  total_trainees: number;
  completed_trainees: number;
  pending_trainees: number;
  passed_trainees: number;
  certificate_count: number;
  completion_rate: number;
  is_complete: boolean;
  due_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  trainees: TrainerMcqAssignmentTrainee[];
};

type AssignmentTargetType = 'batch' | 'trainee';
type TrainerMcqPanel = 'assign' | 'progress' | 'manager';

type AssignmentForm = {
  categoryId: string;
  title: string;
  description: string;
  targetType: AssignmentTargetType;
  batchId: string;
  traineeId: string;
  dueDate: string;
};

type McqCoachingForm = {
  strengths: string;
  opportunities: string;
  actionPlan: string;
  targetDate: string;
  coachingMinutes: number;
  trainerRemarks: string;
  competencyStatus: 'pending' | 'competent' | 'not_competent';
};

type CoachingTarget = {
  assignment: TrainerMcqAssignment;
  trainee: TrainerMcqAssignmentTrainee;
};

const emptyForm = (): AssignmentForm => ({
  categoryId: '',
  title: '',
  description: '',
  targetType: 'batch',
  batchId: '',
  traineeId: '',
  dueDate: '',
});

const mcqPanels: {
  id: TrainerMcqPanel;
  label: string;
  description: string;
  icon: typeof BookOpenCheck;
}[] = [
  {
    id: 'assign',
    label: 'Assignment Center',
    description: 'Select a category, choose the exact questions, and assign them to a batch or trainee.',
    icon: BookOpenCheck,
  },
  {
    id: 'progress',
    label: 'Results and Coaching',
    description: 'Monitor completion, scores, certificates, and trainer coaching follow-ups.',
    icon: Users,
  },
  {
    id: 'manager',
    label: 'Question Bank Manager',
    description: 'Create, edit, and review the saved categories and active MCQ questions.',
    icon: ClipboardList,
  },
];

function normalizePanel(value?: string | null): TrainerMcqPanel | null {
  if (value === 'assign' || value === 'progress' || value === 'manager') {
    return value;
  }
  return null;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'No due date';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'No due date';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatBatchLabel(batch?: TrainerBatch | null) {
  if (!batch) {
    return 'Unassigned batch';
  }
  if (batch.wave_number !== null && batch.wave_number !== undefined) {
    return `${batch.name} | Wave ${batch.wave_number}`;
  }
  return batch.name;
}

function statusBadgeClass(isPassed?: boolean | null) {
  if (isPassed === true) {
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
  if (isPassed === false) {
    return 'bg-amber-100 text-amber-700 border-amber-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function buildMcqCoachingForm(target: CoachingTarget): McqCoachingForm {
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + 3);
  const scoreText =
    typeof target.trainee.score_percentage === 'number'
      ? `${target.trainee.score_percentage.toFixed(2)}%`
      : 'No submitted score yet';
  const passed = target.trainee.is_passed === true;

  return {
    strengths: passed
      ? `${target.trainee.full_name} completed ${target.assignment.category_name || target.assignment.title} with a score of ${scoreText}.`
      : '',
    opportunities: passed
      ? ''
      : `Review the missed ${target.assignment.category_name || 'MCQ'} items and reinforce the language skills covered in this category. Latest score: ${scoreText}.`,
    actionPlan: passed
      ? 'Reinforce the strongest response patterns and prepare the trainee for the next assigned category.'
      : 'Schedule a follow-up coaching session, review incorrect answers, and assign a focused retake plan before the next checkpoint.',
    targetDate: followUpDate.toISOString().slice(0, 10),
    coachingMinutes: 30,
    trainerRemarks: `MCQ follow-up for ${target.assignment.title}.`,
    competencyStatus: passed ? 'competent' : 'not_competent',
  };
}

type TrainerMcqWorkspaceProps = {
  panel?: TrainerMcqPanel;
};

export default function TrainerMcqWorkspace({ panel }: TrainerMcqWorkspaceProps) {
  const { token, isAuthenticated, isLoading: isAuthLoading, refreshToken, logout } = useAuth();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<TrainerMcqCategory[]>([]);
  const [batches, setBatches] = useState<TrainerBatch[]>([]);
  const [trainees, setTrainees] = useState<TrainerTrainee[]>([]);
  const [assignments, setAssignments] = useState<TrainerMcqAssignment[]>([]);
  const [availableQuestions, setAvailableQuestions] = useState<TrainerMcqQuestion[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [coachingTarget, setCoachingTarget] = useState<CoachingTarget | null>(null);
  const [coachingForm, setCoachingForm] = useState<McqCoachingForm | null>(null);
  const [savingCoachingLog, setSavingCoachingLog] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<AssignmentForm>(emptyForm());
  const activePanel = normalizePanel(panel) || normalizePanel(searchParams.get('panel')) || 'assign';

  const fetchWithAuthRetry = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const sendRequest = async (authToken: string | null) => {
        const nextHeaders = new Headers(init?.headers || undefined);
        if (authToken || token) {
          nextHeaders.set('Authorization', `Bearer ${authToken || token}`);
        }
        return fetch(input, {
          ...init,
          headers: nextHeaders,
          cache: 'no-store',
        });
      };

      let response = await sendRequest(token);
      if (response.status !== 401) {
        return response;
      }

      const nextToken = await refreshToken();
      if (!nextToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      response = await sendRequest(nextToken);
      if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please sign in again.');
      }

      return response;
    },
    [logout, refreshToken, token],
  );

  const readJson = useCallback(async <T,>(response: Response, fallback: string): Promise<T> => {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || fallback);
    }
    return payload as T;
  }, []);

  const loadCategoryQuestions = useCallback(
    async (categoryId: string) => {
      if (!categoryId) {
        setAvailableQuestions([]);
        setSelectedQuestionIds([]);
        setQuestionError('');
        return;
      }

      setLoadingQuestions(true);
      setQuestionError('');
      try {
        const response = await fetchWithAuthRetry(`/api/certification/mcq/questions/${categoryId}`);
        const payload = await readJson<{ questions: TrainerMcqQuestion[] }>(
          response,
          'Unable to load the questions for this category.',
        );
        const nextQuestions = payload.questions || [];
        setAvailableQuestions(nextQuestions);
        setSelectedQuestionIds(nextQuestions.map((question) => question.id));
      } catch (loadQuestionError) {
        setAvailableQuestions([]);
        setSelectedQuestionIds([]);
        setQuestionError(
          loadQuestionError instanceof Error
            ? loadQuestionError.message
            : 'Unable to load the questions for this category.',
        );
      } finally {
        setLoadingQuestions(false);
      }
    },
    [fetchWithAuthRetry, readJson],
  );

  const loadWorkspace = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (isAuthLoading) {
        return;
      }

      if (!isAuthenticated || !token) {
        setCategories([]);
        setBatches([]);
        setTrainees([]);
        setAssignments([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (mode === 'initial') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError('');

      try {
        const [categoryRes, batchRes, traineeRes, assignmentRes] = await Promise.all([
          fetchWithAuthRetry('/api/certification/mcq/categories'),
          fetchWithAuthRetry('/api/trainer/batches'),
          fetchWithAuthRetry('/api/trainer/trainees'),
          fetchWithAuthRetry('/api/certification/mcq/assignments'),
        ]);

        const categoryPayload = await readJson<{ categories: TrainerMcqCategory[] }>(
          categoryRes,
          'Unable to load MCQ categories.',
        );
        const batchPayload = await readJson<{ batches: TrainerBatch[] }>(
          batchRes,
          'Unable to load trainer batches.',
        );
        const traineePayload = await readJson<{ trainees: TrainerTrainee[] }>(
          traineeRes,
          'Unable to load trainer trainees.',
        );
        const assignmentPayload = await readJson<{ assignments: TrainerMcqAssignment[] }>(
          assignmentRes,
          'Unable to load assigned MCQ progress.',
        );

        setCategories(categoryPayload.categories || []);
        setBatches(batchPayload.batches || []);
        setTrainees(traineePayload.trainees || []);
        setAssignments(assignmentPayload.assignments || []);
        setForm((current) => {
          const nextCategoryId =
            current.categoryId && categoryPayload.categories.some((category) => category.id === current.categoryId)
              ? current.categoryId
              : categoryPayload.categories[0]?.id || '';
          const nextBatchId =
            current.batchId && batchPayload.batches.some((batch) => batch.id === current.batchId)
              ? current.batchId
              : batchPayload.batches[0]?.id || '';
          const nextTraineeId =
            current.traineeId && traineePayload.trainees.some((trainee) => trainee.id === current.traineeId)
              ? current.traineeId
              : traineePayload.trainees[0]?.id || '';

          return {
            ...current,
            categoryId: nextCategoryId,
            batchId: nextBatchId,
            traineeId: nextTraineeId,
          };
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load the trainer MCQ workspace.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchWithAuthRetry, isAuthLoading, isAuthenticated, readJson, token],
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    void loadCategoryQuestions(form.categoryId);
  }, [form.categoryId, loadCategoryQuestions]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === form.categoryId) || null,
    [categories, form.categoryId],
  );
  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === form.batchId) || null,
    [batches, form.batchId],
  );
  const selectedTrainee = useMemo(
    () => trainees.find((trainee) => trainee.id === form.traineeId) || null,
    [form.traineeId, trainees],
  );
  const batchTrainees = useMemo(
    () =>
      trainees.filter((trainee) =>
        trainee.batch_ids?.includes(form.batchId) || trainee.batch?.id === form.batchId,
      ),
    [form.batchId, trainees],
  );

  const autoGeneratedTitle = useMemo(() => {
    if (!selectedCategory) {
      return '';
    }
    if (form.targetType === 'batch' && selectedBatch) {
      return `${selectedCategory.name} - ${selectedBatch.name}`;
    }
    if (form.targetType === 'trainee' && selectedTrainee) {
      return `${selectedCategory.name} - ${selectedTrainee.full_name}`;
    }
    return selectedCategory.name;
  }, [form.targetType, selectedBatch, selectedCategory, selectedTrainee]);

  const categoryCoverage = useMemo(
    () =>
      categories.reduce(
        (total, category) => total + (typeof category.question_count === 'number' ? category.question_count : 0),
        0,
      ),
    [categories],
  );
  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => !assignment.is_complete).length,
    [assignments],
  );
  const completedAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.is_complete).length,
    [assignments],
  );
  const selectedQuestionCount = selectedQuestionIds.length;
  const allQuestionsSelected =
    !!availableQuestions.length && selectedQuestionCount === availableQuestions.length;

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestionIds((current) =>
      current.includes(questionId)
        ? current.filter((existingId) => existingId !== questionId)
        : [...current, questionId],
    );
  };

  const openCoachingDialog = (assignment: TrainerMcqAssignment, trainee: TrainerMcqAssignmentTrainee) => {
    const nextTarget = { assignment, trainee };
    setCoachingTarget(nextTarget);
    setCoachingForm(buildMcqCoachingForm(nextTarget));
  };

  const closeCoachingDialog = () => {
    setCoachingTarget(null);
    setCoachingForm(null);
  };

  const saveCoachingFollowUp = async (publish: boolean) => {
    if (!coachingTarget || !coachingForm) {
      toast.error('Select a trainee result before creating a coaching log.');
      return;
    }

    if (
      publish &&
      (!coachingForm.strengths.trim() ||
        !coachingForm.opportunities.trim() ||
        !coachingForm.actionPlan.trim() ||
        !coachingForm.targetDate)
    ) {
      toast.error('Complete the required coaching fields before sending the log.');
      return;
    }

    setSavingCoachingLog(true);
    try {
      const scoreText =
        typeof coachingTarget.trainee.score_percentage === 'number'
          ? ` Latest MCQ score: ${coachingTarget.trainee.score_percentage.toFixed(2)}%.`
          : '';
      const response = await fetchWithAuthRetry('/api/certification/coaching/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trainee_id: coachingTarget.trainee.id,
          coaching_minutes: coachingForm.coachingMinutes,
          strengths: coachingForm.strengths.trim(),
          opportunities: coachingForm.opportunities.trim(),
          action_plan: coachingForm.actionPlan.trim(),
          target_date: coachingForm.targetDate ? new Date(coachingForm.targetDate).toISOString() : undefined,
          trainer_remarks: `${coachingForm.trainerRemarks.trim()}${scoreText}`.trim(),
          status: publish ? 'sent' : 'draft',
          competency_status: coachingForm.competencyStatus,
        }),
      });

      await readJson<{ coaching_log_id: string }>(response, 'Unable to save the MCQ coaching follow-up.');
      toast.success(
        publish
          ? `Coaching log sent to ${coachingTarget.trainee.full_name}.`
          : `Draft coaching log saved for ${coachingTarget.trainee.full_name}.`,
      );
      closeCoachingDialog();
    } catch (coachingError) {
      toast.error(
        coachingError instanceof Error
          ? coachingError.message
          : 'Unable to save the MCQ coaching follow-up.',
      );
    } finally {
      setSavingCoachingLog(false);
    }
  };

  const assignCategory = async () => {
    if (!selectedCategory) {
      toast.error('Select a category before assigning it.');
      return;
    }
    if (availableQuestions.length <= 0 || selectedCategory.question_count <= 0) {
      toast.error('This category has no active questions yet.');
      return;
    }
    if (!selectedQuestionIds.length) {
      toast.error('Select at least one question to include in this assignment.');
      return;
    }
    if (form.targetType === 'batch' && !form.batchId) {
      toast.error('Select a target batch first.');
      return;
    }
    if (form.targetType === 'trainee' && !form.traineeId) {
      toast.error('Select a trainee first.');
      return;
    }

    setAssigning(true);
    try {
      const response = await fetchWithAuthRetry('/api/certification/mcq/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: form.title.trim() || autoGeneratedTitle,
          description: form.description.trim() || selectedCategory.description || undefined,
          category_id: selectedCategory.id,
          question_ids: selectedQuestionIds,
          assigned_batch_id: form.targetType === 'batch' ? form.batchId : undefined,
          assigned_user_id: form.targetType === 'trainee' ? form.traineeId : undefined,
          due_date: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        }),
      });
      const payload = await readJson<{ assessment: TrainerMcqAssignment }>(
        response,
        'Unable to assign the selected MCQ category.',
      );
      toast.success(
        `Assigned ${payload.assessment.category_name || selectedCategory.name} to ${
          payload.assessment.assigned_batch_name || payload.assessment.assigned_user_name || 'the target cohort'
        }.`,
      );
      setForm((current) => ({
        ...current,
        title: '',
        description: '',
        dueDate: '',
      }));
      await loadWorkspace('refresh');
      await loadCategoryQuestions(selectedCategory.id);
    } catch (assignError) {
      toast.error(assignError instanceof Error ? assignError.message : 'Unable to assign the selected MCQ category.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-3 text-3xl font-bold text-foreground">
            <ClipboardList className="size-8 text-blue-700" />
            Trainer MCQ Navigation
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            The trainer MCQ navigation is organized into separate panels for assignment, results and coaching, and
            question-bank management so each workflow is easier to use.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadWorkspace('refresh')} disabled={loading || refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {activePanel !== 'manager' ? (
        <Card className="border-sky-200 bg-sky-50/70">
          <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Question Categories" value={String(categories.length)} hint="Trainer-owned MCQ banks" />
            <MetricTile label="Active Questions" value={String(categoryCoverage)} hint="Questions available for assignment" />
            <MetricTile label="Open Assignments" value={String(activeAssignments)} hint="Cohorts still in progress" />
            <MetricTile label="Completed Assignments" value={String(completedAssignments)} hint="All target trainees finished" />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        {mcqPanels.map((item) => {
          const Icon = item.icon;
          const isActive = activePanel === item.id;
          return (
            <Link
              key={item.id}
              href={`/trainer/mcq?panel=${item.id}`}
              className={`rounded-2xl border p-4 transition ${
                isActive
                  ? 'border-blue-300 bg-blue-50/80 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`rounded-xl p-2 ${
                    isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{item.label}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{item.description}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {activePanel === 'assign' ? (
        <>
          <Card className="border-amber-200 bg-amber-50/70">
            <CardContent className="pt-6 text-sm text-amber-900">
              Pick a trainer-owned category, choose the exact questions to include, and assign that set to one batch,
              wave, or trainee from this panel.
            </CardContent>
          </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assign Category to Batch / Trainee</CardTitle>
            <CardDescription>
              Pick one saved category, choose the exact questions to include, and assign only that selected set to the
              target batch, wave, or trainee.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="mcq-category">Question Category</Label>
              <select
                id="mcq-category"
                className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={form.categoryId}
                onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
              >
                <option value="">{categories.length ? 'Select category' : 'No categories available'}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.question_count} questions)
                  </option>
                ))}
              </select>
              {selectedCategory ? (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Difficulty: <span className="font-semibold text-slate-900">{selectedCategory.difficulty}</span>
                  {' '}| Passing threshold: <span className="font-semibold text-slate-900">{selectedCategory.passing_threshold}%</span>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label>Questions Included in this Assignment</Label>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Choose the exact questions that should be sent to the selected batch or trainee.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedQuestionIds(availableQuestions.map((question) => question.id))}
                    disabled={!availableQuestions.length || allQuestionsSelected}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedQuestionIds([])}
                    disabled={!selectedQuestionIds.length}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {selectedCategory ? (
                  <span>
                    Selected <span className="font-semibold text-slate-950">{selectedQuestionCount}</span> of{' '}
                    <span className="font-semibold text-slate-950">{availableQuestions.length}</span> active question(s)
                    from <span className="font-semibold text-slate-950">{selectedCategory.name}</span>.
                  </span>
                ) : (
                  'Select a category to load its question bank.'
                )}
              </div>

              {questionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                  {questionError}
                </div>
              ) : null}

              <ScrollArea className="h-[280px] rounded-2xl border bg-white">
                <div className="space-y-3 p-4">
                  {loadingQuestions ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading category questions...
                    </div>
                  ) : null}

                  {!loadingQuestions && !availableQuestions.length ? (
                    <div className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                      {selectedCategory
                        ? 'This category does not have active questions yet.'
                        : 'Select a category to preview and choose questions.'}
                    </div>
                  ) : null}

                  {!loadingQuestions
                    ? availableQuestions.map((question, index) => {
                        const isSelected = selectedQuestionIds.includes(question.id);
                        return (
                          <label
                            key={question.id}
                            className={`block cursor-pointer rounded-2xl border p-4 transition ${
                              isSelected
                                ? 'border-sky-300 bg-sky-50/80'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 size-4 rounded border-slate-300"
                                checked={isSelected}
                                onChange={() => toggleQuestionSelection(question.id)}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-foreground">
                                  Q{index + 1}. {question.question_text}
                                </div>
                                <div className="mt-2 grid gap-2 md:grid-cols-2">
                                  {(['A', 'B', 'C', 'D'] as const).map((optionKey) => (
                                    <div
                                      key={`${question.id}-${optionKey}`}
                                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                                    >
                                      <span className="font-semibold text-slate-900">{optionKey}.</span>{' '}
                                      {question.options?.[optionKey] || 'No option text'}
                                    </div>
                                  ))}
                                </div>
                                {question.explanation ? (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    Explanation: {question.explanation}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </label>
                        );
                      })
                    : null}
                </div>
              </ScrollArea>
            </div>

            <div>
              <Label>Assign To</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, targetType: 'batch' }))}
                  className={`rounded-full border px-3 py-2 text-sm ${
                    form.targetType === 'batch'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Entire Batch
                </button>
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, targetType: 'trainee' }))}
                  className={`rounded-full border px-3 py-2 text-sm ${
                    form.targetType === 'trainee'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  One Trainee
                </button>
              </div>
            </div>

            {form.targetType === 'batch' ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="mcq-batch">Target Batch / Wave</Label>
                  <select
                    id="mcq-batch"
                    className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={form.batchId}
                    onChange={(event) => setForm((current) => ({ ...current, batchId: event.target.value }))}
                  >
                    <option value="">{batches.length ? 'Select batch' : 'No batches available'}</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {formatBatchLabel(batch)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    {selectedBatch ? formatBatchLabel(selectedBatch) : 'Batch preview'}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {batchTrainees.length
                      ? `${batchTrainees.length} trainee(s) will receive this category assignment.`
                      : 'No active trainees are assigned to this batch yet.'}
                  </div>
                  {batchTrainees.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {batchTrainees.map((trainee) => (
                        <Badge key={trainee.id} variant="outline">
                          {trainee.full_name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="mcq-trainee">Target Trainee</Label>
                  <select
                    id="mcq-trainee"
                    className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={form.traineeId}
                    onChange={(event) => setForm((current) => ({ ...current, traineeId: event.target.value }))}
                  >
                    <option value="">{trainees.length ? 'Select trainee' : 'No trainees available'}</option>
                    {trainees.map((trainee) => (
                      <option key={trainee.id} value={trainee.id}>
                        {trainee.full_name} ({trainee.batch?.name || trainee.batch_names?.[0] || 'No batch'})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedTrainee ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">{selectedTrainee.full_name}</div>
                    <div>{selectedTrainee.email}</div>
                    <div className="mt-1">
                      Batch: {selectedTrainee.batch?.name || selectedTrainee.batch_names?.join(', ') || 'No batch'}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <Label htmlFor="mcq-title">Assignment Title</Label>
              <Input
                id="mcq-title"
                className="mt-2"
                placeholder={autoGeneratedTitle || 'Language Assessment - Batch 1'}
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />
              {autoGeneratedTitle ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Suggested title: <span className="font-semibold text-foreground">{autoGeneratedTitle}</span>
                </div>
              ) : null}
            </div>

            <div>
              <Label htmlFor="mcq-description">Assignment Notes</Label>
              <Textarea
                id="mcq-description"
                className="mt-2"
                placeholder="Add context or instructions for this batch assignment."
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="mcq-due-date">Due Date</Label>
              <Input
                id="mcq-due-date"
                type="date"
                className="mt-2"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
              />
            </div>

            <Button onClick={() => void assignCategory()} disabled={assigning || !selectedCategory}>
              {assigning ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
              Assign Selected Questions
            </Button>
          </CardContent>
        </Card>
        </>
      ) : null}

      {activePanel === 'progress' ? (
        <Card>
          <CardHeader>
            <CardTitle>Assignment Progress</CardTitle>
            <CardDescription>
              Completion, scores, and certificates update here when trainees finish the MCQ assigned to their batch or
              account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[560px] pr-4">
              <div className="space-y-4">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-2xl border p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-semibold text-foreground">{assignment.title}</div>
                          <Badge variant="outline">{assignment.category_name || 'Category'}</Badge>
                          <Badge variant="outline">
                            {assignment.question_count}
                            {assignment.category_question_count &&
                            assignment.category_question_count !== assignment.question_count
                              ? ` / ${assignment.category_question_count}`
                              : ''}
                            {' '}questions
                          </Badge>
                          <Badge variant="outline">{assignment.passing_threshold}% pass mark</Badge>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {assignment.description || assignment.category_description || 'No description provided.'}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Target:{' '}
                          <span className="font-semibold text-foreground">
                            {assignment.assigned_batch_name || assignment.assigned_user_name || 'Unknown'}
                          </span>
                          {' '}| Due: <span className="font-semibold text-foreground">{formatDate(assignment.due_date)}</span>
                          {assignment.assigned_by_name ? (
                            <>
                              {' '}| Assigned by:{' '}
                              <span className="font-semibold text-foreground">{assignment.assigned_by_name}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm xl:min-w-[220px]">
                        <MiniStat label="Completed" value={`${assignment.completed_trainees}/${assignment.total_trainees}`} />
                        <MiniStat label="Passed" value={String(assignment.passed_trainees)} />
                        <MiniStat label="Pending" value={String(assignment.pending_trainees)} />
                        <MiniStat label="Certificates" value={String(assignment.certificate_count)} />
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Completion rate</span>
                        <span>{assignment.completion_rate.toFixed(0)}%</span>
                      </div>
                      <Progress value={assignment.completion_rate} />
                    </div>

                    <div className="mt-4 space-y-2">
                      {assignment.trainees.map((trainee) => (
                        <div key={trainee.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="font-medium text-foreground">{trainee.full_name}</div>
                              <div className="text-xs text-muted-foreground">{trainee.email}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {trainee.batch_name || assignment.assigned_batch_name || 'No batch'}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge className={statusBadgeClass(trainee.is_passed)}>
                                {trainee.status === 'completed'
                                  ? trainee.is_passed
                                    ? 'Completed / Passed'
                                    : 'Completed'
                                  : 'Pending'}
                              </Badge>
                              {trainee.certificate_no ? (
                                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                  <Trophy className="mr-1 size-3.5" />
                                  {trainee.certificate_no}
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span>
                              Score:{' '}
                              <span className="font-semibold text-foreground">
                                {typeof trainee.score_percentage === 'number'
                                  ? `${trainee.score_percentage.toFixed(2)}%`
                                  : 'Not submitted'}
                              </span>
                            </span>
                            <span>
                              Submitted:{' '}
                              <span className="font-semibold text-foreground">
                                {trainee.submitted_at ? formatDate(trainee.submitted_at) : 'Waiting'}
                              </span>
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openCoachingDialog(assignment, trainee)}
                              disabled={trainee.status !== 'completed'}
                            >
                              <MessageSquarePlus className="size-4" />
                              Coach Trainee
                            </Button>
                          </div>
                        </div>
                      ))}

                      {!assignment.trainees.length ? (
                        <div className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
                          This assignment does not have any active target trainees yet.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {!assignments.length && !loading ? (
                  <div className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    No MCQ categories have been assigned yet. Create a category first, then assign it to a batch or
                    trainee.
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}

      {activePanel === 'manager' ? (
        <>
          <Card className="border-amber-200 bg-amber-50/70">
            <CardContent className="pt-6 text-sm text-amber-900">
              The trainer manager below now shows every active MCQ question saved in the database. You can still create,
              edit, and delete only the categories and questions owned by your trainer account.
            </CardContent>
          </Card>
          <MCQManager scope="all" />
        </>
      ) : null}

      <Dialog open={!!coachingTarget && !!coachingForm} onOpenChange={(open) => !open && closeCoachingDialog()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>MCQ Coaching Follow-up</DialogTitle>
            <DialogDescription>
              Save a draft or send a coaching log to the trainee based on the selected MCQ result.
            </DialogDescription>
          </DialogHeader>

          {coachingTarget && coachingForm ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MiniStat label="Trainee" value={coachingTarget.trainee.full_name} />
                <MiniStat
                  label="Score"
                  value={
                    typeof coachingTarget.trainee.score_percentage === 'number'
                      ? `${coachingTarget.trainee.score_percentage.toFixed(2)}%`
                      : 'Not submitted'
                  }
                />
                <MiniStat
                  label="Certificate"
                  value={coachingTarget.trainee.certificate_no || 'Not issued'}
                />
                <MiniStat
                  label="Verdict"
                  value={
                    coachingTarget.trainee.is_passed === true
                      ? 'Passed'
                      : coachingTarget.trainee.is_passed === false
                        ? 'Needs follow-up'
                        : 'Pending'
                  }
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Assignment: <span className="font-semibold text-slate-950">{coachingTarget.assignment.title}</span>
                {' '}| Category:{' '}
                <span className="font-semibold text-slate-950">
                  {coachingTarget.assignment.category_name || 'MCQ Category'}
                </span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcq-coach-strengths">Strengths</Label>
                <Textarea
                  id="mcq-coach-strengths"
                  rows={4}
                  value={coachingForm.strengths}
                  onChange={(event) =>
                    setCoachingForm((current) =>
                      current ? { ...current, strengths: event.target.value } : current,
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcq-coach-opportunities">Opportunities</Label>
                <Textarea
                  id="mcq-coach-opportunities"
                  rows={4}
                  value={coachingForm.opportunities}
                  onChange={(event) =>
                    setCoachingForm((current) =>
                      current ? { ...current, opportunities: event.target.value } : current,
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcq-coach-action-plan">Action Plan</Label>
                <Textarea
                  id="mcq-coach-action-plan"
                  rows={4}
                  value={coachingForm.actionPlan}
                  onChange={(event) =>
                    setCoachingForm((current) =>
                      current ? { ...current, actionPlan: event.target.value } : current,
                    )
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="mcq-coach-target-date">Target Date</Label>
                  <Input
                    id="mcq-coach-target-date"
                    type="date"
                    value={coachingForm.targetDate}
                    onChange={(event) =>
                      setCoachingForm((current) =>
                        current ? { ...current, targetDate: event.target.value } : current,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcq-coach-minutes">Coaching Minutes</Label>
                  <Input
                    id="mcq-coach-minutes"
                    type="number"
                    min={1}
                    value={coachingForm.coachingMinutes}
                    onChange={(event) =>
                      setCoachingForm((current) =>
                        current
                          ? {
                              ...current,
                              coachingMinutes: Number(event.target.value) || 0,
                            }
                          : current,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcq-coach-verdict">Verdict</Label>
                  <select
                    id="mcq-coach-verdict"
                    className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={coachingForm.competencyStatus}
                    onChange={(event) =>
                      setCoachingForm((current) =>
                        current
                          ? {
                              ...current,
                              competencyStatus: event.target.value as McqCoachingForm['competencyStatus'],
                            }
                          : current,
                      )
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="competent">Competent</option>
                    <option value="not_competent">Not Competent</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcq-coach-remarks">Trainer Remarks</Label>
                <Textarea
                  id="mcq-coach-remarks"
                  rows={3}
                  value={coachingForm.trainerRemarks}
                  onChange={(event) =>
                    setCoachingForm((current) =>
                      current ? { ...current, trainerRemarks: event.target.value } : current,
                    )
                  }
                />
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="outline" onClick={closeCoachingDialog} disabled={savingCoachingLog}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void saveCoachingFollowUp(false)}
                  disabled={savingCoachingLog}
                >
                  {savingCoachingLog ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save Draft
                </Button>
                <Button type="button" onClick={() => void saveCoachingFollowUp(true)} disabled={savingCoachingLog}>
                  {savingCoachingLog ? <Loader2 className="size-4 animate-spin" /> : <MessageSquarePlus className="size-4" />}
                  Send to Trainee
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
