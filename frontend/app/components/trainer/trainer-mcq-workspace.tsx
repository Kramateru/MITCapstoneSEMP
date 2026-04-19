'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, ClipboardList, Layers3, Loader2, Pencil, RefreshCw, Save, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

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
import { useAuth } from '@/app/context/AuthContext';

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
  selected_question_ids?: string[];
  selected_question_count?: number;
  assignment_count?: number;
};

type TrainerMcqQuestion = {
  id: string;
  category_id: string;
  question_text: string;
  options: Record<string, string>;
  explanation?: string | null;
  is_selected_for_assessment?: boolean;
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
  attempt_count?: number;
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
  passing_threshold: number;
  time_limit_minutes: number;
  assigned_batch_id?: string | null;
  assigned_batch_name?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  question_ids?: string[];
  category_question_count?: number;
  question_bank_count?: number;
  question_count: number;
  total_trainees: number;
  completed_trainees: number;
  pending_trainees: number;
  passed_trainees: number;
  certificate_count: number;
  completion_rate: number;
  due_date?: string | null;
  trainees: TrainerMcqAssignmentTrainee[];
};

type AssignmentTargetType = 'batch' | 'trainee';
type TrainerPanel = 'builder' | 'question-set' | 'assigned';

type AssignmentForm = {
  targetType: AssignmentTargetType;
  batchIds: string[];
  traineeId: string;
  title: string;
  description: string;
  dueDate: string;
  timeLimitMinutes: number;
};

type AssignmentEditForm = {
  categoryId: string;
  targetType: AssignmentTargetType;
  batchId: string;
  traineeId: string;
  title: string;
  description: string;
  dueDate: string;
  timeLimitMinutes: number;
};

const emptyAssignmentForm = (): AssignmentForm => ({
  targetType: 'batch',
  batchIds: [],
  traineeId: '',
  title: '',
  description: '',
  dueDate: '',
  timeLimitMinutes: 30,
});

const emptyAssignmentEditForm = (): AssignmentEditForm => ({
  categoryId: '',
  targetType: 'batch',
  batchId: '',
  traineeId: '',
  title: '',
  description: '',
  dueDate: '',
  timeLimitMinutes: 30,
});

const panels: Array<{
  id: TrainerPanel;
  label: string;
  description: string;
  icon: typeof ClipboardList;
}> = [
  {
    id: 'builder',
    label: '1. Categories + Question Bank',
    description: 'Create assessment categories and save multiple-choice question bank items with choices A to D.',
    icon: ClipboardList,
  },
  {
    id: 'question-set',
    label: '2. Assign Questions + Publish',
    description: 'Assign question-bank items to the category, then assign the category to a batch, wave, or one trainee.',
    icon: Layers3,
  },
  {
    id: 'assigned',
    label: '3. Assigned Categories',
    description: 'Review assigned category progress and edit or delete active batch, wave, or trainee assignments.',
    icon: Users,
  },
];

function normalizePanel(value?: string | null): TrainerPanel {
  if (value === 'builder' || value === 'question-set' || value === 'assigned') {
    return value;
  }
  return 'builder';
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

function formatInputDate(value?: string | null) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

function formatBatchLabel(batch?: TrainerBatch | null) {
  if (!batch) {
    return 'No batch';
  }

  if (batch.wave_number !== null && batch.wave_number !== undefined) {
    return `${batch.name} | Wave ${batch.wave_number}`;
  }

  return batch.name;
}

function sortIds(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
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

type TrainerMcqWorkspaceProps = {
  panel?: TrainerPanel;
};

export default function TrainerMcqWorkspace({ panel }: TrainerMcqWorkspaceProps) {
  const { token, isAuthenticated, isLoading: isAuthLoading, refreshToken, logout } = useAuth();
  const searchParams = useSearchParams();
  const activePanel = normalizePanel(panel || searchParams.get('panel'));

  const [categories, setCategories] = useState<TrainerMcqCategory[]>([]);
  const [batches, setBatches] = useState<TrainerBatch[]>([]);
  const [trainees, setTrainees] = useState<TrainerTrainee[]>([]);
  const [assignments, setAssignments] = useState<TrainerMcqAssignment[]>([]);
  const [availableQuestions, setAvailableQuestions] = useState<TrainerMcqQuestion[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [assignForm, setAssignForm] = useState<AssignmentForm>(emptyAssignmentForm());
  const [editingAssignment, setEditingAssignment] = useState<TrainerMcqAssignment | null>(null);
  const [editForm, setEditForm] = useState<AssignmentEditForm>(emptyAssignmentEditForm());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [savingQuestionSet, setSavingQuestionSet] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState('');
  const [error, setError] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentTargetFilter, setAssignmentTargetFilter] = useState<'all' | AssignmentTargetType>('all');
  const [assignmentProgressFilter, setAssignmentProgressFilter] = useState<'all' | 'pending' | 'active' | 'passed'>('all');

  const fetchWithAuthRetry = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const sendRequest = async (authToken: string | null) => {
        const headers = new Headers(init?.headers || undefined);
        if (authToken || token) {
          headers.set('Authorization', `Bearer ${authToken || token}`);
        }
        return fetch(input, {
          ...init,
          headers,
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
    async (categoryId: string, categorySelection?: string[]) => {
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
          'Unable to load the question bank for this category.',
        );
        setAvailableQuestions(payload.questions || []);
        setSelectedQuestionIds(sortIds(categorySelection || []));
      } catch (loadQuestionError) {
        setAvailableQuestions([]);
        setSelectedQuestionIds([]);
        setQuestionError(
          loadQuestionError instanceof Error
            ? loadQuestionError.message
            : 'Unable to load the question bank for this category.',
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
        setAvailableQuestions([]);
        setSelectedCategoryId('');
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
          'Unable to load assessment categories.',
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
          'Unable to load assigned categories.',
        );

        const nextCategories = categoryPayload.categories || [];
        const nextBatches = batchPayload.batches || [];
        const nextTrainees = traineePayload.trainees || [];
        const nextAssignments = assignmentPayload.assignments || [];

        setCategories(nextCategories);
        setBatches(nextBatches);
        setTrainees(nextTrainees);
        setAssignments(nextAssignments);
        setSelectedCategoryId((current) => {
          if (current && nextCategories.some((category) => category.id === current)) {
            return current;
          }
          return nextCategories[0]?.id || '';
        });
        setAssignForm((current) => ({
          ...current,
          batchIds: current.batchIds.filter((batchId) => nextBatches.some((batch) => batch.id === batchId)),
          traineeId:
            current.traineeId && nextTrainees.some((trainee) => trainee.id === current.traineeId)
              ? current.traineeId
              : '',
        }));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load the assessment navigation.');
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

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) || null,
    [categories, selectedCategoryId],
  );

  useEffect(() => {
    if (!selectedCategory) {
      setAvailableQuestions([]);
      setSelectedQuestionIds([]);
      return;
    }

    void loadCategoryQuestions(selectedCategory.id, selectedCategory.selected_question_ids || []);
  }, [loadCategoryQuestions, selectedCategory]);

  const hasSelectionChanges = useMemo(() => {
    const savedSelection = sortIds(selectedCategory?.selected_question_ids || []);
    return JSON.stringify(savedSelection) !== JSON.stringify(sortIds(selectedQuestionIds));
  }, [selectedCategory?.selected_question_ids, selectedQuestionIds]);

  const selectedTrainee = useMemo(
    () => trainees.find((trainee) => trainee.id === assignForm.traineeId) || null,
    [assignForm.traineeId, trainees],
  );

  const questionBankCount = useMemo(
    () => categories.reduce((total, category) => total + Number(category.question_count || 0), 0),
    [categories],
  );

  const savedQuestionSetCount = useMemo(
    () => categories.reduce((total, category) => total + Number(category.selected_question_count || 0), 0),
    [categories],
  );

  const categoriesReadyToPublish = useMemo(
    () => categories.filter((category) => Number(category.selected_question_count || 0) > 0).length,
    [categories],
  );

  const categoriesNeedingQuestionSet = useMemo(
    () => categories.filter((category) => Number(category.selected_question_count || 0) <= 0).length,
    [categories],
  );

  const completionSummary = useMemo(() => {
    const completed = assignments.reduce((total, assignment) => total + Number(assignment.completed_trainees || 0), 0);
    const passed = assignments.reduce((total, assignment) => total + Number(assignment.passed_trainees || 0), 0);
    return {
      activeAssignments: assignments.length,
      completed,
      passed,
    };
  }, [assignments]);

  const filteredAvailableQuestions = useMemo(() => {
    const normalizedSearch = questionSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return availableQuestions;
    }

    return availableQuestions.filter((question) => {
      const haystack = [
        question.question_text,
        question.explanation || '',
        question.options?.A || '',
        question.options?.B || '',
        question.options?.C || '',
        question.options?.D || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [availableQuestions, questionSearch]);

  const filteredAssignments = useMemo(() => {
    const normalizedSearch = assignmentSearch.trim().toLowerCase();

    return assignments.filter((assignment) => {
      const targetType: AssignmentTargetType = assignment.assigned_batch_id ? 'batch' : 'trainee';
      if (assignmentTargetFilter !== 'all' && targetType !== assignmentTargetFilter) {
        return false;
      }

      const progressState: 'pending' | 'active' | 'passed' =
        assignment.total_trainees > 0 && assignment.passed_trainees >= assignment.total_trainees
          ? 'passed'
          : assignment.completed_trainees > 0
            ? 'active'
            : 'pending';

      if (assignmentProgressFilter !== 'all' && progressState !== assignmentProgressFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        assignment.title,
        assignment.description || '',
        assignment.category_name || '',
        assignment.assigned_batch_name || '',
        assignment.assigned_user_name || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [assignmentProgressFilter, assignmentSearch, assignmentTargetFilter, assignments]);

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestionIds((current) =>
      current.includes(questionId)
        ? current.filter((existingId) => existingId !== questionId)
        : [...current, questionId],
    );
  };

  const saveQuestionSet = async () => {
    if (!selectedCategory) {
      toast.error('Select an assessment category first.');
      return;
    }
    if (!availableQuestions.length) {
      toast.error('This category does not have any saved question-bank items yet.');
      return;
    }
    if (!selectedQuestionIds.length) {
      toast.error('Select at least one question to save to this category.');
      return;
    }

    setSavingQuestionSet(true);
    try {
      const response = await fetchWithAuthRetry(
        `/api/certification/mcq/categories/${selectedCategory.id}/selected-questions`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question_ids: sortIds(selectedQuestionIds),
          }),
        },
      );
      const payload = await readJson<{ category: TrainerMcqCategory }>(
        response,
        'Unable to save the selected questions for this category.',
      );

      setCategories((current) =>
        current.map((category) => (category.id === payload.category.id ? payload.category : category)),
      );
      setSelectedQuestionIds(sortIds(payload.category.selected_question_ids || []));
      toast.success(`Saved ${payload.category.selected_question_count || 0} question(s) to ${payload.category.name}.`);
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : 'Unable to save the selected questions for this category.',
      );
    } finally {
      setSavingQuestionSet(false);
    }
  };

  const assignCategory = async () => {
    if (!selectedCategory) {
      toast.error('Select an assessment category first.');
      return;
    }
    if ((selectedCategory.selected_question_count || 0) <= 0) {
      toast.error('Save the category question set before publishing it to a batch or trainee.');
      return;
    }
    if (hasSelectionChanges) {
      toast.error('Save the updated category question set before assigning it.');
      return;
    }
    if (assignForm.targetType === 'batch' && !assignForm.batchIds.length) {
      toast.error('Select at least one target batch or wave.');
      return;
    }
    if (assignForm.targetType === 'trainee' && !assignForm.traineeId) {
      toast.error('Select one trainee.');
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
          category_id: selectedCategory.id,
          title: assignForm.title.trim() || undefined,
          description: assignForm.description.trim() || undefined,
          assigned_batch_ids: assignForm.targetType === 'batch' ? assignForm.batchIds : undefined,
          assigned_user_id: assignForm.targetType === 'trainee' ? assignForm.traineeId : undefined,
          due_date: assignForm.dueDate ? new Date(assignForm.dueDate).toISOString() : undefined,
          time_limit_minutes: Math.max(Number(assignForm.timeLimitMinutes) || 0, 1),
        }),
      });
      const payload = await readJson<{ count: number }>(
        response,
        'Unable to assign the selected assessment category.',
      );

      toast.success(
        assignForm.targetType === 'batch'
          ? `Published ${selectedCategory.name} to ${payload.count} batch${payload.count === 1 ? '' : 'es'}.`
          : `Published ${selectedCategory.name} to ${selectedTrainee?.full_name || 'the trainee'}.`,
      );

      setAssignForm((current) => ({
        ...emptyAssignmentForm(),
        targetType: current.targetType,
      }));
      await loadWorkspace('refresh');
    } catch (assignError) {
      toast.error(assignError instanceof Error ? assignError.message : 'Unable to assign the selected category.');
    } finally {
      setAssigning(false);
    }
  };

  const openAssignmentEditor = (assignment: TrainerMcqAssignment) => {
    setEditingAssignment(assignment);
    setEditForm({
      categoryId: assignment.category_id,
      targetType: assignment.assigned_batch_id ? 'batch' : 'trainee',
      batchId: assignment.assigned_batch_id || '',
      traineeId: assignment.assigned_user_id || '',
      title: assignment.title || '',
      description: assignment.description || '',
      dueDate: formatInputDate(assignment.due_date),
      timeLimitMinutes: assignment.time_limit_minutes || 30,
    });
  };

  const closeAssignmentEditor = () => {
    setEditingAssignment(null);
    setEditForm(emptyAssignmentEditForm());
  };

  const saveAssignmentChanges = async () => {
    if (!editingAssignment) {
      return;
    }
    if (!editForm.categoryId) {
      toast.error('Select an assessment category.');
      return;
    }
    if (editForm.targetType === 'batch' && !editForm.batchId) {
      toast.error('Select one batch or wave.');
      return;
    }
    if (editForm.targetType === 'trainee' && !editForm.traineeId) {
      toast.error('Select one trainee.');
      return;
    }

    setSavingAssignment(true);
    try {
      const response = await fetchWithAuthRetry(`/api/certification/mcq/assignments/${editingAssignment.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category_id: editForm.categoryId,
          assigned_batch_id: editForm.targetType === 'batch' ? editForm.batchId : undefined,
          assigned_user_id: editForm.targetType === 'trainee' ? editForm.traineeId : undefined,
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          due_date: editForm.dueDate ? new Date(editForm.dueDate).toISOString() : null,
          time_limit_minutes: Math.max(Number(editForm.timeLimitMinutes) || 0, 1),
        }),
      });
      await readJson<{ assessment: TrainerMcqAssignment }>(
        response,
        'Unable to update the assigned assessment category.',
      );
      toast.success('Assigned assessment category updated successfully.');
      closeAssignmentEditor();
      await loadWorkspace('refresh');
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : 'Unable to update the assigned assessment category.',
      );
    } finally {
      setSavingAssignment(false);
    }
  };

  const deleteAssignment = async (assignment: TrainerMcqAssignment) => {
    const confirmed = window.confirm(
      `Delete the assigned category "${assignment.title}" from ${assignment.assigned_batch_name || assignment.assigned_user_name || 'this target'}?`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingAssignmentId(assignment.id);
    try {
      const response = await fetchWithAuthRetry(`/api/certification/mcq/assignments/${assignment.id}`, {
        method: 'DELETE',
      });
      await readJson<{ status: string }>(response, 'Unable to delete the assigned assessment category.');
      toast.success('Assigned assessment category deleted successfully.');
      await loadWorkspace('refresh');
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error ? deleteError.message : 'Unable to delete the assigned assessment category.',
      );
    } finally {
      setDeletingAssignmentId('');
    }
  };

  const selectedCategoryTrainees = useMemo(() => {
    if (assignForm.targetType === 'batch') {
      const lookup = new Map<string, TrainerTrainee>();
      for (const trainee of trainees) {
        const belongsToBatch = assignForm.batchIds.some(
          (batchId) => trainee.batch_ids?.includes(batchId) || trainee.batch?.id === batchId,
        );
        if (belongsToBatch) {
          lookup.set(trainee.id, trainee);
        }
      }
      return Array.from(lookup.values());
    }

    return selectedTrainee ? [selectedTrainee] : [];
  }, [assignForm.batchIds, assignForm.targetType, selectedTrainee, trainees]);

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading assessment navigation...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-3 text-3xl font-bold text-foreground">
            <BookOpenCheck className="size-8 text-blue-700" />
            Assessment Navigation
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Trainers now manage assessments in one Supabase-backed workflow: create the assessment category, create
            multiple-choice question bank items, assign those questions to the category, then assign the category to
            trainer-owned batches or waves with a time limit.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadWorkspace('refresh')} disabled={refreshing}>
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <Card className="border-sky-200 bg-sky-50/70">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Assessment Categories" value={String(categories.length)} hint="Trainer-created category records" />
          <MetricTile label="Question Bank Items" value={String(questionBankCount)} hint="Saved multiple-choice questions" />
          <MetricTile
            label="Ready To Publish"
            value={String(categoriesReadyToPublish)}
            hint={`${categoriesNeedingQuestionSet} categories still need saved question sets`}
          />
          <MetricTile
            label="Published Categories"
            value={String(completionSummary.activeAssignments)}
            hint={`${completionSummary.completed} completed | ${completionSummary.passed} passed`}
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white/90">
        <CardHeader className="pb-4">
          <CardTitle>Trainer Workflow</CardTitle>
          <CardDescription>
            Follow the same sequence every time so category creation, question-bank authoring, assignment, and trainee delivery stay easy to track.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-4">
          <WorkflowStepCard
            step="1"
            title="Create Category"
            description="Add the assessment category and set the pass mark."
            status={categories.length ? `${categories.length} saved` : 'Start here'}
          />
          <WorkflowStepCard
            step="2"
            title="Build Question Bank"
            description="Save multiple-choice questions with options A to D."
            status={questionBankCount ? `${questionBankCount} questions ready` : 'Add questions'}
          />
          <WorkflowStepCard
            step="3"
            title="Save Category Set"
            description="Choose which item-bank questions belong to the category."
            status={savedQuestionSetCount ? `${savedQuestionSetCount} mapped` : 'Map questions'}
          />
          <WorkflowStepCard
            step="4"
            title="Assign To Batch / Wave"
            description="Publish the category with a timer and monitor trainee results."
            status={completionSummary.activeAssignments ? `${completionSummary.activeAssignments} live` : 'Publish first assignment'}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        {panels.map((panelItem) => {
          const Icon = panelItem.icon;
          const isActive = activePanel === panelItem.id;
          const panelBadge =
            panelItem.id === 'builder'
              ? 'Steps 1-2'
              : panelItem.id === 'question-set'
                ? 'Steps 3-4'
                : 'Monitor';

          return (
            <Link
              key={panelItem.id}
              href={`/trainer/assessments?panel=${panelItem.id}`}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-foreground">{panelItem.label}</div>
                    <Badge variant={isActive ? 'default' : 'outline'}>{panelBadge}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{panelItem.description}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {activePanel === 'builder' ? (
        <>
          <Card className="border-amber-200 bg-amber-50/70">
            <CardContent className="pt-6 text-sm text-amber-900">
              Use this manager to add, edit, delete, and save the assessment category records plus the multiple-choice
              question bank items that belong to each category.
            </CardContent>
          </Card>
          <MCQManager scope="owned" onDataChanged={() => loadWorkspace('refresh')} />
        </>
      ) : null}

      {activePanel === 'question-set' ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Assign Questions From Question Bank</CardTitle>
              <CardDescription>
                Pick one category, then choose which question-bank items should become the saved assessment question set.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="question-set-category">Assessment Category</Label>
                <select
                  id="question-set-category"
                  className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  value={selectedCategoryId}
                  onChange={(event) => setSelectedCategoryId(event.target.value)}
                >
                  <option value="">{categories.length ? 'Select category' : 'No categories available'}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.question_count} bank items)
                    </option>
                  ))}
                </select>
              </div>

              {selectedCategory ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div>
                    Difficulty: <span className="font-semibold text-slate-950">{selectedCategory.difficulty}</span>
                  </div>
                  <div className="mt-1">
                    Passing threshold:{' '}
                    <span className="font-semibold text-slate-950">{selectedCategory.passing_threshold}%</span>
                  </div>
                  <div className="mt-1">
                    Saved question set:{' '}
                    <span className="font-semibold text-slate-950">
                      {selectedCategory.selected_question_count || 0}
                    </span>
                    {' '}of{' '}
                    <span className="font-semibold text-slate-950">{selectedCategory.question_count}</span>
                    {' '}question-bank item(s)
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedQuestionIds(availableQuestions.map((question) => question.id))}
                  disabled={!availableQuestions.length}
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

              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  hasSelectionChanges
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}
              >
                {hasSelectionChanges
                  ? 'The question set changed. Save it before publishing this category.'
                  : 'The saved question set is ready to publish.'}
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input
                  value={questionSearch}
                  onChange={(event) => setQuestionSearch(event.target.value)}
                  placeholder="Search question text, options, or explanation"
                />
                <Badge variant="outline" className="justify-center px-3 py-2">
                  {selectedQuestionIds.length} selected
                </Badge>
                <Badge variant="outline" className="justify-center px-3 py-2">
                  {filteredAvailableQuestions.length}/{availableQuestions.length} shown
                </Badge>
              </div>

              {questionError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                  {questionError}
                </div>
              ) : null}

              <ScrollArea className="h-[420px] rounded-2xl border bg-white">
                <div className="space-y-3 p-4">
                  {loadingQuestions ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading question bank...
                    </div>
                  ) : null}

                  {!loadingQuestions && !availableQuestions.length ? (
                    <div className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                      {selectedCategory
                        ? 'This category does not have any question-bank items yet.'
                        : 'Select a category to load its question bank.'}
                    </div>
                  ) : null}

                  {!loadingQuestions && !!availableQuestions.length && !filteredAvailableQuestions.length ? (
                    <div className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                      No question-bank items match the current search.
                    </div>
                  ) : null}

                  {!loadingQuestions
                    ? filteredAvailableQuestions.map((question, index) => {
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
                                checked={isSelected}
                                onChange={() => toggleQuestionSelection(question.id)}
                                className="mt-1 size-4 rounded border-slate-300"
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

              <Button type="button" onClick={() => void saveQuestionSet()} disabled={savingQuestionSet || !selectedCategory}>
                {savingQuestionSet ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save Category Question Set
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 4: Assign Assessment Category to Batch / Wave</CardTitle>
              <CardDescription>
                Assign the saved category question set to one or more trainer-owned batches or waves, or to one trainee account, and add the assessment timer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {selectedCategory ? (
                  <>
                    <div>
                      Category: <span className="font-semibold text-slate-950">{selectedCategory.name}</span>
                    </div>
                    <div className="mt-1">
                      Saved questions:{' '}
                      <span className="font-semibold text-slate-950">
                        {selectedCategory.selected_question_count || 0}
                      </span>
                    </div>
                  </>
                ) : (
                  'Select an assessment category first.'
                )}
              </div>

              <div>
                <Label>Assign To</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAssignForm((current) => ({
                        ...current,
                        targetType: 'batch',
                        traineeId: '',
                      }))
                    }
                    className={`rounded-full border px-3 py-2 text-sm ${
                      assignForm.targetType === 'batch'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Batch / Wave
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAssignForm((current) => ({
                        ...current,
                        targetType: 'trainee',
                        batchIds: [],
                      }))
                    }
                    className={`rounded-full border px-3 py-2 text-sm ${
                      assignForm.targetType === 'trainee'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    One Trainee
                  </button>
                </div>
              </div>

              {assignForm.targetType === 'batch' ? (
                <div className="space-y-3">
                  <div>
                    <Label>Target Batch / Waves</Label>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {batches.length ? (
                        batches.map((batch) => {
                          const isSelected = assignForm.batchIds.includes(batch.id);
                          return (
                            <label
                              key={batch.id}
                              className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                                isSelected
                                  ? 'border-blue-400 bg-blue-50 text-blue-900'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() =>
                                  setAssignForm((current) => ({
                                    ...current,
                                    batchIds: current.batchIds.includes(batch.id)
                                      ? current.batchIds.filter((batchId) => batchId !== batch.id)
                                      : [...current.batchIds, batch.id],
                                  }))
                                }
                                className="mt-1"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-current">{formatBatchLabel(batch)}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {(batch.users_count || 0)} trainee(s) currently assigned
                                </div>
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
                          No trainer-owned batches are available yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <Label htmlFor="assign-trainee">Target Trainee</Label>
                  <select
                    id="assign-trainee"
                    className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={assignForm.traineeId}
                    onChange={(event) =>
                      setAssignForm((current) => ({
                        ...current,
                        traineeId: event.target.value,
                      }))
                    }
                  >
                    <option value="">{trainees.length ? 'Select trainee' : 'No trainees available'}</option>
                    {trainees.map((trainee) => (
                      <option key={trainee.id} value={trainee.id}>
                        {trainee.full_name} ({trainee.batch?.name || trainee.batch_names?.[0] || 'No batch'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Publish Preview</div>
                <div className="mt-1 text-xs text-slate-600">
                  {selectedCategoryTrainees.length
                    ? `${selectedCategoryTrainees.length} trainee(s) will receive this category assignment.`
                    : 'Select a batch, wave, or trainee to preview the targets.'}
                </div>
                {selectedCategoryTrainees.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedCategoryTrainees.map((trainee) => (
                      <Badge key={trainee.id} variant="outline">
                        {trainee.full_name}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <Label htmlFor="assignment-title">Assignment Title</Label>
                <Input
                  id="assignment-title"
                  className="mt-2"
                  placeholder={selectedCategory ? `${selectedCategory.name} - WAVE 1` : 'Customer Service Essentials - WAVE 1'}
                  value={assignForm.title}
                  onChange={(event) =>
                    setAssignForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <Label htmlFor="assignment-description">Assignment Notes</Label>
                <Textarea
                  id="assignment-description"
                  className="mt-2"
                  placeholder="Add context or instructions for this assessment category assignment."
                  value={assignForm.description}
                  onChange={(event) =>
                    setAssignForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="assignment-due-date">Due Date</Label>
                  <Input
                    id="assignment-due-date"
                    type="date"
                    className="mt-2"
                    value={assignForm.dueDate}
                    onChange={(event) =>
                      setAssignForm((current) => ({
                        ...current,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="assignment-time-limit">Assessment Timer (Minutes)</Label>
                  <Input
                    id="assignment-time-limit"
                    type="number"
                    min={1}
                    className="mt-2"
                    value={assignForm.timeLimitMinutes}
                    onChange={(event) =>
                      setAssignForm((current) => ({
                        ...current,
                        timeLimitMinutes: Math.max(Number(event.target.value) || 0, 1),
                      }))
                    }
                  />
                </div>
              </div>

              <Button type="button" onClick={() => void assignCategory()} disabled={assigning || !selectedCategory}>
                {assigning ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
                Publish Assessment Category
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activePanel === 'assigned' ? (
        <Card>
          <CardHeader>
            <CardTitle>Assigned Categories to Batch / Wave</CardTitle>
            <CardDescription>
              Edit or delete active category assignments and monitor each target batch or trainee progress.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
              <Input
                value={assignmentSearch}
                onChange={(event) => setAssignmentSearch(event.target.value)}
                placeholder="Search assignment title, category, batch, or trainee"
              />
              <select
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={assignmentTargetFilter}
                onChange={(event) => setAssignmentTargetFilter(event.target.value as 'all' | AssignmentTargetType)}
              >
                <option value="all">All targets</option>
                <option value="batch">Batch / Wave only</option>
                <option value="trainee">One trainee only</option>
              </select>
              <select
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={assignmentProgressFilter}
                onChange={(event) =>
                  setAssignmentProgressFilter(event.target.value as 'all' | 'pending' | 'active' | 'passed')
                }
              >
                <option value="all">All progress states</option>
                <option value="pending">Pending only</option>
                <option value="active">In progress</option>
                <option value="passed">Fully passed</option>
              </select>
            </div>

            <ScrollArea className="h-[720px] pr-4">
              <div className="space-y-4">
                {filteredAssignments.map((assignment) => {
                  const progressState =
                    assignment.total_trainees > 0 && assignment.passed_trainees >= assignment.total_trainees
                      ? 'passed'
                      : assignment.completed_trainees > 0
                        ? 'active'
                        : 'pending';
                  const targetTypeLabel = assignment.assigned_batch_id ? 'Batch / Wave' : 'One Trainee';

                  return (
                    <div key={assignment.id} className="rounded-2xl border p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-lg font-semibold text-foreground">{assignment.title}</div>
                            <Badge variant="outline">{assignment.category_name || 'Assessment category'}</Badge>
                            <Badge variant="outline">{assignment.question_count} saved question(s)</Badge>
                            <Badge variant="outline">{assignment.time_limit_minutes} min timer</Badge>
                            <Badge variant="outline">{assignment.passing_threshold}% pass mark</Badge>
                            <Badge variant="outline">{targetTypeLabel}</Badge>
                            <Badge
                              className={
                                progressState === 'passed'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : progressState === 'active'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-700'
                              }
                            >
                              {progressState === 'passed'
                                ? 'Fully Passed'
                                : progressState === 'active'
                                  ? 'In Progress'
                                  : 'Pending Start'}
                            </Badge>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            {assignment.description || 'No assignment notes were added.'}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Target:{' '}
                            <span className="font-semibold text-foreground">
                              {assignment.assigned_batch_name || assignment.assigned_user_name || 'Unknown target'}
                            </span>
                            {' '}| Due: <span className="font-semibold text-foreground">{formatDate(assignment.due_date)}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => openAssignmentEditor(assignment)}>
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void deleteAssignment(assignment)}
                            disabled={deletingAssignmentId === assignment.id}
                          >
                            {deletingAssignmentId === assignment.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                            Delete
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-4">
                        <MiniStat label="Completed" value={`${assignment.completed_trainees}/${assignment.total_trainees}`} />
                        <MiniStat label="Passed" value={String(assignment.passed_trainees)} />
                        <MiniStat label="Pending" value={String(assignment.pending_trainees)} />
                        <MiniStat label="Certificates" value={String(assignment.certificate_count)} />
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
                                      : 'Completed / Failed'
                                    : 'Pending'}
                                </Badge>
                                {trainee.certificate_no ? (
                                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
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
                                Attempts:{' '}
                                <span className="font-semibold text-foreground">{trainee.attempt_count || 0}</span>
                              </span>
                              <span>
                                Submitted:{' '}
                                <span className="font-semibold text-foreground">
                                  {trainee.submitted_at ? formatDate(trainee.submitted_at) : 'Waiting'}
                                </span>
                              </span>
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
                  );
                })}

                {!filteredAssignments.length ? (
                  <div className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    {assignments.length
                      ? 'No published category assignments match the current filters.'
                      : 'No assessment categories have been published yet. Save a category question set first, then publish it to a trainer-owned batch, wave, or trainee.'}
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={!!editingAssignment} onOpenChange={(open) => !open && closeAssignmentEditor()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Published Category</DialogTitle>
            <DialogDescription>
              Update the saved category assignment for the selected batch, wave, or trainee.
            </DialogDescription>
          </DialogHeader>

          {editingAssignment ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-category">Assessment Category</Label>
                <select
                  id="edit-category"
                  className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  value={editForm.categoryId}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                >
                  <option value="">{categories.length ? 'Select category' : 'No categories available'}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.selected_question_count || 0} saved question(s))
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Assign To</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditForm((current) => ({
                        ...current,
                        targetType: 'batch',
                        traineeId: '',
                      }))
                    }
                    className={`rounded-full border px-3 py-2 text-sm ${
                      editForm.targetType === 'batch'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Batch / Wave
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditForm((current) => ({
                        ...current,
                        targetType: 'trainee',
                        batchId: '',
                      }))
                    }
                    className={`rounded-full border px-3 py-2 text-sm ${
                      editForm.targetType === 'trainee'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    One Trainee
                  </button>
                </div>
              </div>

              {editForm.targetType === 'batch' ? (
                <div>
                  <Label htmlFor="edit-batch">Target Batch / Wave</Label>
                  <select
                    id="edit-batch"
                    className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={editForm.batchId}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        batchId: event.target.value,
                      }))
                    }
                  >
                    <option value="">{batches.length ? 'Select batch' : 'No batches available'}</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {formatBatchLabel(batch)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <Label htmlFor="edit-trainee">Target Trainee</Label>
                  <select
                    id="edit-trainee"
                    className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    value={editForm.traineeId}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        traineeId: event.target.value,
                      }))
                    }
                  >
                    <option value="">{trainees.length ? 'Select trainee' : 'No trainees available'}</option>
                    {trainees.map((trainee) => (
                      <option key={trainee.id} value={trainee.id}>
                        {trainee.full_name} ({trainee.batch?.name || trainee.batch_names?.[0] || 'No batch'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label htmlFor="edit-title">Assignment Title</Label>
                <Input
                  id="edit-title"
                  className="mt-2"
                  value={editForm.title}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <Label htmlFor="edit-description">Assignment Notes</Label>
                <Textarea
                  id="edit-description"
                  className="mt-2"
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="edit-due-date">Due Date</Label>
                  <Input
                    id="edit-due-date"
                    type="date"
                    className="mt-2"
                    value={editForm.dueDate}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="edit-time-limit">Assessment Timer (Minutes)</Label>
                  <Input
                    id="edit-time-limit"
                    type="number"
                    min={1}
                    className="mt-2"
                    value={editForm.timeLimitMinutes}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        timeLimitMinutes: Math.max(Number(event.target.value) || 0, 1),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="outline" onClick={closeAssignmentEditor} disabled={savingAssignment}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void saveAssignmentChanges()} disabled={savingAssignment}>
                  {savingAssignment ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save Changes
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

function WorkflowStepCard({
  step,
  title,
  description,
  status,
}: {
  step: string;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Step {step}</div>
      <div className="mt-2 text-lg font-semibold text-slate-950">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{description}</div>
      <Badge variant="outline" className="mt-4">
        {status}
      </Badge>
    </div>
  );
}
