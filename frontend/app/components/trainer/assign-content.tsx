'use client';

import {
  startTransition,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  BookOpen,
  ClipboardList,
  Clock3,
  Layers3,
  PencilLine,
  PlusCircle,
  RefreshCw,
  Target,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/app/context/AuthContext';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';

type ModuleCategory = 'pronunciation' | 'fluency' | 'grammar' | 'empathy' | 'clarity';
type ModuleDifficulty = 'basic' | 'intermediate' | 'advanced';
type AssignmentStatus = 'assigned' | 'in_progress' | 'completed';
type MicrolearningPanel = 'builder' | 'assign' | 'assessment' | 'tracker';

interface TrainerBatch {
  id: string;
  name: string;
  description?: string | null;
  users_count: number;
  created_at?: string;
  wave_number?: number | null;
  lob?: string | null;
}

interface ModuleExercise {
  id: string;
  title: string;
  prompt: string;
  type?: 'multiple_choice' | 'keyword_response' | string;
}

interface AssessmentMethod {
  id: string;
  slug: string;
  name: string;
  summary?: string | null;
  method_description?: string | null;
  measures: string[];
  lesson_count: number;
  required_example_count?: number;
  example_titles?: string[];
}

interface MicrolearningModule {
  id: string;
  title: string;
  description?: string | null;
  category: ModuleCategory;
  duration_minutes: number;
  skill_focus?: string | null;
  content_url?: string | null;
  difficulty: ModuleDifficulty;
  exercise_count: number;
  exercises: ModuleExercise[];
  assessment_method_id?: string | null;
  assessment_method_slug?: string | null;
  assessment_method_name?: string | null;
  assessment_method_summary?: string | null;
  assessment_measures?: string[];
  assignment_count?: number;
  created_at?: string;
}

interface MicrolearningAssignment {
  id: string;
  status: AssignmentStatus;
  completion_percentage: number;
  assigned_at?: string;
  due_date?: string | null;
  completed_at?: string | null;
  exercise_count: number;
  completed_exercises: number;
  user_id: string;
  trainee_name?: string | null;
  module_title?: string | null;
  module_category?: ModuleCategory | null;
  assessment_method_id?: string | null;
  assessment_method_slug?: string | null;
  assessment_method_name?: string | null;
  batch_id?: string | null;
  batch_name?: string | null;
  batch_wave_number?: number | null;
  batch_label?: string | null;
  batch_lob?: string | null;
  notes?: string | null;
  is_mandatory: boolean;
}

type LessonFormState = {
  title: string;
  description: string;
  category: ModuleCategory;
  durationMinutes: string;
  skillFocus: string;
  contentUrl: string;
  difficulty: ModuleDifficulty;
};

type AssessmentLessonFormState = LessonFormState & {
  assessmentMethodId: string;
};

type BatchAssignmentFormState = {
  batchId: string;
  moduleIds: string[];
  dueDate: string;
  notes: string;
  isMandatory: boolean;
};

const CATEGORY_OPTIONS: { value: ModuleCategory; label: string }[] = [
  { value: 'pronunciation', label: 'Pronunciation' },
  { value: 'fluency', label: 'Fluency' },
  { value: 'grammar', label: 'Grammar' },
  { value: 'empathy', label: 'Empathy' },
  { value: 'clarity', label: 'Clarity' },
];

const DIFFICULTY_OPTIONS: { value: ModuleDifficulty; label: string }[] = [
  { value: 'basic', label: 'Basic' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

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

const PANEL_OPTIONS: {
  id: MicrolearningPanel;
  label: string;
  description: string;
  icon: typeof Layers3;
}[] = [
  {
    id: 'builder',
    label: 'Activity Builder',
    description: 'Create and review trainer-owned microlearning lessons.',
    icon: Layers3,
  },
  {
    id: 'assign',
    label: 'Assign to Batch / Wave',
    description: 'Select one batch or wave, then add one or more saved activity titles.',
    icon: Users,
  },
  {
    id: 'assessment',
    label: 'Assessment Lesson Studio',
    description: 'Build lessons from database-backed BPO assessment methods.',
    icon: Target,
  },
  {
    id: 'tracker',
    label: 'Delivery Tracker',
    description: 'Monitor live microlearning assignment progress for your trainer activity deliveries.',
    icon: ClipboardList,
  },
];

const emptyLessonForm = (): LessonFormState => ({
  title: '',
  description: '',
  category: 'pronunciation',
  durationMinutes: '5',
  skillFocus: '',
  contentUrl: '',
  difficulty: 'basic',
});

const emptyAssessmentLessonForm = (): AssessmentLessonFormState => ({
  assessmentMethodId: '',
  ...emptyLessonForm(),
  category: 'clarity',
  durationMinutes: '3',
});

const emptyBatchAssignmentForm = (): BatchAssignmentFormState => ({
  batchId: '',
  moduleIds: [],
  dueDate: '',
  notes: '',
  isMandatory: true,
});

function formatLabel(value?: string | null) {
  if (!value) return 'Not set';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value?: string | null) {
  if (!value) return 'No date set';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatBatchLabel(batch?: Pick<TrainerBatch, 'name' | 'wave_number'> | null) {
  if (!batch) return 'No batch selected';
  if (batch.name && batch.wave_number !== null && batch.wave_number !== undefined) {
    return `${batch.name} | Wave ${batch.wave_number}`;
  }
  if (batch.name) return batch.name;
  if (batch.wave_number !== null && batch.wave_number !== undefined) {
    return `Wave ${batch.wave_number}`;
  }
  return 'Unnamed batch';
}

function formatAssignmentBatchLabel(assignment: MicrolearningAssignment) {
  if (assignment.batch_label) return assignment.batch_label;
  if (assignment.batch_name && assignment.batch_wave_number !== null && assignment.batch_wave_number !== undefined) {
    return `${assignment.batch_name} | Wave ${assignment.batch_wave_number}`;
  }
  if (assignment.batch_name) return assignment.batch_name;
  if (assignment.batch_wave_number !== null && assignment.batch_wave_number !== undefined) {
    return `Wave ${assignment.batch_wave_number}`;
  }
  return 'No batch assigned';
}

function MethodBadge({ methodName }: { methodName?: string | null }) {
  if (!methodName) return null;
  return (
    <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
      {methodName}
    </Badge>
  );
}

function buildLessonFormFromModule(module: MicrolearningModule): AssessmentLessonFormState {
  return {
    title: module.title,
    description: module.description || '',
    category: module.category,
    durationMinutes: String(module.duration_minutes || 1),
    skillFocus: module.skill_focus || '',
    contentUrl: module.content_url || '',
    difficulty: module.difficulty,
    assessmentMethodId: module.assessment_method_id || '',
  };
}

export default function AssignContent() {
  const { token, isLoading: isAuthLoading } = useAuth();

  const [activePanel, setActivePanel] = useState<MicrolearningPanel>('builder');
  const [batches, setBatches] = useState<TrainerBatch[]>([]);
  const [modules, setModules] = useState<MicrolearningModule[]>([]);
  const [assignments, setAssignments] = useState<MicrolearningAssignment[]>([]);
  const [assessmentMethods, setAssessmentMethods] = useState<AssessmentMethod[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [isAssigningActivities, setIsAssigningActivities] = useState(false);
  const [isCreatingAssessmentLesson, setIsCreatingAssessmentLesson] = useState(false);
  const [isUpdatingModule, setIsUpdatingModule] = useState(false);
  const [deletingModuleId, setDeletingModuleId] = useState<string | null>(null);
  const [assignmentPickerValue, setAssignmentPickerValue] = useState('');
  const [moduleForm, setModuleForm] = useState<LessonFormState>(emptyLessonForm());
  const [assessmentForm, setAssessmentForm] = useState<AssessmentLessonFormState>(emptyAssessmentLessonForm());
  const [assignmentForm, setAssignmentForm] = useState<BatchAssignmentFormState>(emptyBatchAssignmentForm());
  const [editingModule, setEditingModule] = useState<MicrolearningModule | null>(null);
  const [editForm, setEditForm] = useState<AssessmentLessonFormState>(emptyAssessmentLessonForm());

  async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!token) throw new Error('Your session has expired. Please sign in again.');

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(path, { ...init, cache: 'no-store', headers });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      throw new Error((payload as { detail?: string } | null)?.detail || 'Request failed. Please try again.');
    }
    return payload as T;
  }

  async function loadWorkspace(showSuccessToast = false) {
    if (!token) {
      setIsLoadingWorkspace(false);
      return;
    }

    setIsLoadingWorkspace(true);
    try {
      const [batchData, moduleData, assignmentData, methodData] = await Promise.all([
        apiRequest<{ batches: TrainerBatch[] }>('/api/trainer/batches'),
        apiRequest<{ modules: MicrolearningModule[] }>('/api/trainer/microlearning-modules'),
        apiRequest<{ assignments: MicrolearningAssignment[] }>('/api/trainer/microlearning-assignments'),
        apiRequest<{ methods: AssessmentMethod[] }>('/api/trainer/microlearning-assessment-methods'),
      ]);

      const nextBatches = batchData.batches || [];
      const nextModules = moduleData.modules || [];
      const nextMethods = methodData.methods || [];
      const nextBatchIds = new Set(nextBatches.map((batch) => batch.id));
      const nextModuleIds = new Set(nextModules.map((module) => module.id));
      startTransition(() => {
        setBatches(nextBatches);
        setModules(nextModules);
        setAssignments(assignmentData.assignments || []);
        setAssessmentMethods(nextMethods);
        setAssessmentForm((current) => ({
          ...current,
          assessmentMethodId:
            current.assessmentMethodId && nextMethods.some((method) => method.id === current.assessmentMethodId)
              ? current.assessmentMethodId
              : nextMethods[0]?.id || '',
        }));
        setAssignmentForm((current) => ({
          ...current,
          batchId: current.batchId && nextBatchIds.has(current.batchId) ? current.batchId : '',
          moduleIds: current.moduleIds.filter((moduleId) => nextModuleIds.has(moduleId)),
        }));
        setEditingModule((current) => {
          if (!current) return null;
          return nextModules.find((module) => module.id === current.id) || null;
        });
      });

      if (showSuccessToast) toast.success('Microlearning workspace refreshed from the database.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load microlearning data.');
    } finally {
      setIsLoadingWorkspace(false);
    }
  }

  useEffect(() => {
    if (!isAuthLoading) void loadWorkspace();
  }, [isAuthLoading, token]);

  async function handleCreateModule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = moduleForm.title.trim();
    const durationMinutes = Number(moduleForm.durationMinutes);

    if (!trimmedTitle) return toast.error('Please enter a lesson title.');
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return toast.error('Duration must be a valid number of minutes.');
    }

    setIsCreatingModule(true);
    try {
      await apiRequest<{ module: MicrolearningModule }>('/api/trainer/microlearning-modules', {
        method: 'POST',
        body: JSON.stringify({
          title: trimmedTitle,
          description: moduleForm.description.trim() || null,
          category: moduleForm.category,
          duration_minutes: durationMinutes,
          skill_focus: moduleForm.skillFocus.trim() || null,
          content_url: moduleForm.contentUrl.trim() || null,
          difficulty: moduleForm.difficulty,
        }),
      });

      setModuleForm(emptyLessonForm());
      toast.success('Microlearning lesson saved to the database.');
      await loadWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create lesson.');
    } finally {
      setIsCreatingModule(false);
    }
  }

  async function handleCreateAssessmentLesson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = assessmentForm.title.trim();
    const durationMinutes = Number(assessmentForm.durationMinutes);

    if (!assessmentForm.assessmentMethodId) {
      return toast.error('Select an assessment method before creating the lesson.');
    }
    if (!trimmedTitle) {
      return toast.error('Please enter an assessment lesson title.');
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return toast.error('Duration must be a valid number of minutes.');
    }

    setIsCreatingAssessmentLesson(true);
    try {
      await apiRequest<{ module: MicrolearningModule }>('/api/trainer/microlearning-modules', {
        method: 'POST',
        body: JSON.stringify({
          title: trimmedTitle,
          description: assessmentForm.description.trim() || null,
          category: assessmentForm.category,
          duration_minutes: durationMinutes,
          skill_focus: assessmentForm.skillFocus.trim() || null,
          content_url: assessmentForm.contentUrl.trim() || null,
          difficulty: assessmentForm.difficulty,
          assessment_method_id: assessmentForm.assessmentMethodId,
        }),
      });

      setAssessmentForm((current) => ({
        ...emptyAssessmentLessonForm(),
        assessmentMethodId: current.assessmentMethodId,
      }));
      toast.success('Assessment-based lesson saved to the database.');
      await loadWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create the assessment lesson.');
    } finally {
      setIsCreatingAssessmentLesson(false);
    }
  }

  async function handleAssignActivities(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignmentForm.batchId) {
      return toast.error('Select a batch or wave before assigning activities.');
    }
    if (!assignmentForm.moduleIds.length) {
      return toast.error('Select at least one activity title to assign.');
    }

    setIsAssigningActivities(true);
    try {
      const response = await apiRequest<{
        assigned_count: number;
        skipped_count: number;
      }>('/api/trainer/microlearning-assignments', {
        method: 'POST',
        body: JSON.stringify({
          batch_id: assignmentForm.batchId,
          module_ids: assignmentForm.moduleIds,
          due_date: assignmentForm.dueDate ? `${assignmentForm.dueDate}T23:59:59` : null,
          notes: assignmentForm.notes.trim() || null,
          is_mandatory: assignmentForm.isMandatory,
        }),
      });

      toast.success(
        `Assigned ${response.assigned_count} activity row${response.assigned_count === 1 ? '' : 's'} to the selected batch.${response.skipped_count ? ` ${response.skipped_count} duplicate row${response.skipped_count === 1 ? '' : 's'} were skipped.` : ''}`,
      );
      setAssignmentForm((current) => ({
        ...emptyBatchAssignmentForm(),
        batchId: current.batchId,
      }));
      setActivePanel('tracker');
      await loadWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to assign activities.');
    } finally {
      setIsAssigningActivities(false);
    }
  }

  function handleEditModule(module: MicrolearningModule) {
    setEditingModule(module);
    setEditForm(buildLessonFormFromModule(module));
  }

  async function handleUpdateModule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingModule) return;

    const trimmedTitle = editForm.title.trim();
    const durationMinutes = Number(editForm.durationMinutes);

    if (!trimmedTitle) {
      return toast.error('Please enter an activity title.');
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return toast.error('Duration must be a valid number of minutes.');
    }

    setIsUpdatingModule(true);
    try {
      const response = await apiRequest<{
        module: MicrolearningModule;
        exercises_regenerated: boolean;
        exercises_locked: boolean;
      }>(`/api/trainer/microlearning-modules/${editingModule.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: trimmedTitle,
          description: editForm.description.trim() || null,
          category: editForm.category,
          duration_minutes: durationMinutes,
          skill_focus: editForm.skillFocus.trim() || null,
          content_url: editForm.contentUrl.trim() || null,
          difficulty: editForm.difficulty,
          assessment_method_id: editForm.assessmentMethodId || null,
        }),
      });

      setEditingModule(null);
      setEditForm(emptyAssessmentLessonForm());
      if (response.exercises_locked) {
        toast.success('Activity updated. Existing exercise content stayed unchanged to preserve assigned trainee progress.');
      } else if (response.exercises_regenerated) {
        toast.success('Activity updated and its exercise set was refreshed in the database.');
      } else {
        toast.success('Activity updated in the database.');
      }
      await loadWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update activity.');
    } finally {
      setIsUpdatingModule(false);
    }
  }

  async function handleDeleteModule(module: MicrolearningModule) {
    if (!window.confirm(`Delete "${module.title}" from the active microlearning library? Existing trainee assignment rows will stay in the database.`)) {
      return;
    }

    setDeletingModuleId(module.id);
    try {
      await apiRequest(`/api/trainer/microlearning-modules/${module.id}`, {
        method: 'DELETE',
      });
      setAssignmentForm((current) => ({
        ...current,
        moduleIds: current.moduleIds.filter((moduleId) => moduleId !== module.id),
      }));
      if (editingModule?.id === module.id) {
        setEditingModule(null);
        setEditForm(emptyAssessmentLessonForm());
      }
      toast.success('Activity removed from the active library.');
      await loadWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete activity.');
    } finally {
      setDeletingModuleId(null);
    }
  }

  function addAssignedModule(moduleId: string) {
    setAssignmentForm((current) => ({
      ...current,
      moduleIds: Array.from(new Set([...current.moduleIds, moduleId])),
    }));
  }

  function removeAssignedModule(moduleId: string) {
    setAssignmentForm((current) => ({
      ...current,
      moduleIds: current.moduleIds.filter((id) => id !== moduleId),
    }));
  }

  function toggleAssignedModule(moduleId: string, checked: boolean) {
    if (checked) {
      addAssignedModule(moduleId);
      return;
    }
    removeAssignedModule(moduleId);
  }

  const activeAssignments = assignments.filter((assignment) => assignment.status !== 'completed').length;
  const completedAssignments = assignments.filter((assignment) => assignment.status === 'completed').length;
  const batchReach = batches.reduce((total, batch) => total + (batch.users_count || 0), 0);
  const assessmentModules = useMemo(() => modules.filter((module) => !!module.assessment_method_id), [modules]);
  const selectedAssessmentMethod = useMemo(
    () => assessmentMethods.find((method) => method.id === assessmentForm.assessmentMethodId) || null,
    [assessmentForm.assessmentMethodId, assessmentMethods],
  );
  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === assignmentForm.batchId) || null,
    [assignmentForm.batchId, batches],
  );
  const selectedAssignmentModules = useMemo(
    () => modules.filter((module) => assignmentForm.moduleIds.includes(module.id)),
    [assignmentForm.moduleIds, modules],
  );
  const availableAssignmentModules = useMemo(
    () => modules.filter((module) => !assignmentForm.moduleIds.includes(module.id)),
    [assignmentForm.moduleIds, modules],
  );

  if (!isAuthLoading && !token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Session Required</CardTitle>
          <CardDescription>
            Sign in as a trainer to manage microlearning lessons and assessment-based lesson records.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-none bg-gradient-to-r from-sky-50 via-white to-emerald-50 shadow-sm">
        <CardHeader>
          <CardTitle>Microlearning Builder</CardTitle>
          <CardDescription>
            Build trainer activities, manage saved lessons, and assign selected activity titles to your batches or
            waves from one workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryTile icon={<Layers3 className="size-4" />} label="All Lessons" value={String(modules.length)} hint="Database-backed microlearning lessons" />
          <SummaryTile icon={<Target className="size-4" />} label="Assessment Lessons" value={String(assessmentModules.length)} hint="Lessons tied to BPO assessment methods" />
          <SummaryTile icon={<Users className="size-4" />} label="Batches / Waves" value={String(batches.length)} hint="Trainer-owned cohorts" />
          <SummaryTile icon={<BookOpen className="size-4" />} label="Trainee Reach" value={String(batchReach)} hint="Trainees attached to your batches" />
          <SummaryTile icon={<ClipboardList className="size-4" />} label="Active Deliveries" value={String(activeAssignments)} hint={`${completedAssignments} completed assignment rows`} />
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        {PANEL_OPTIONS.map((panel) => {
          const Icon = panel.icon;
          const isActive = activePanel === panel.id;
          return (
            <button
              key={panel.id}
              type="button"
              onClick={() => setActivePanel(panel.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                isActive
                  ? 'border-blue-300 bg-blue-50/80 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-xl p-2 ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <Icon className="size-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">{panel.label}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{panel.description}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {activePanel === 'builder' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Create Standard Microlearning Lesson</CardTitle>
              <CardDescription>
                Create trainer-owned lessons for the shared library. These lessons are saved directly in the database
                and can later be assigned to a batch or wave.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleCreateModule}>
                <LessonFormFields form={moduleForm} onChange={setModuleForm} />
                <Button className="w-full" type="submit" disabled={isCreatingModule}>
                  <PlusCircle className="mr-2 size-4" />
                  {isCreatingModule ? 'Saving Lesson...' : 'Create Lesson'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Saved Activities</CardTitle>
                <CardDescription>
                  Review, edit, or delete the trainer-owned activities already stored in the database.
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => void loadWorkspace(true)} disabled={isLoadingWorkspace}>
                <RefreshCw className="mr-2 size-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingWorkspace ? (
                <EmptyState message="Loading saved microlearning activities..." />
              ) : modules.length === 0 ? (
                <EmptyState message="No microlearning activities are saved yet. Create one to populate the shared trainer library." />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {modules.map((module) => (
                    <ModuleCard
                      key={module.id}
                      module={module}
                      onEdit={handleEditModule}
                      onDelete={handleDeleteModule}
                      isDeleting={deletingModuleId === module.id}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activePanel === 'assign' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Assign Activities to Batch / Wave</CardTitle>
              <CardDescription>
                Select one trainer batch or wave, then choose as many saved activity titles as you want from the
                microlearning library. Each selected title is saved as a trainee assignment row for delivery tracking.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!batches.length ? (
                <EmptyState message="Create a trainer batch or wave first before assigning microlearning activities." />
              ) : !modules.length ? (
                <EmptyState message="Create at least one microlearning activity before assigning it to a batch or wave." />
              ) : (
                <form className="space-y-5" onSubmit={handleAssignActivities}>
                  <div className="space-y-2">
                    <Label>Batch / Wave</Label>
                    <Select
                      value={assignmentForm.batchId || undefined}
                      onValueChange={(value) => setAssignmentForm((current) => ({ ...current, batchId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a batch or wave" />
                      </SelectTrigger>
                      <SelectContent>
                        {batches.map((batch) => (
                          <SelectItem key={batch.id} value={batch.id}>
                            {formatBatchLabel(batch)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Activity Title</Label>
                      <Select
                        value={assignmentPickerValue || undefined}
                        onValueChange={(value) => {
                          addAssignedModule(value);
                          setAssignmentPickerValue('');
                        }}
                        disabled={!availableAssignmentModules.length}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              availableAssignmentModules.length
                                ? 'Select a saved activity title to add'
                                : 'All saved activity titles are already selected'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {availableAssignmentModules.map((module) => (
                            <SelectItem key={module.id} value={module.id}>
                              {module.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-slate-500">
                        Add as many saved activity titles as needed for the selected batch or wave.
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-700">Selected Activity Titles</div>
                        <Badge variant="outline">{selectedAssignmentModules.length} selected</Badge>
                      </div>
                      {selectedAssignmentModules.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedAssignmentModules.map((module) => (
                            <button
                              key={`selected-${module.id}`}
                              type="button"
                              onClick={() => removeAssignedModule(module.id)}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                            >
                              <span>{module.title}</span>
                              <span className="text-xs text-slate-500">Remove</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-slate-500">
                          No activity titles selected yet. Pick one from the selector or the saved activity library below.
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Label>Saved Activity Library</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setAssignmentForm((current) => ({
                              ...current,
                              moduleIds: modules.map((module) => module.id),
                            }))
                          }
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setAssignmentForm((current) => ({
                              ...current,
                              moduleIds: [],
                            }))
                          }
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                      {modules.map((module) => {
                        const isChecked = assignmentForm.moduleIds.includes(module.id);
                        return (
                          <label
                            key={module.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                              isChecked ? 'border-blue-300 bg-blue-50/80' : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => toggleAssignedModule(module.id, checked === true)}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-slate-950">{module.title}</span>
                                <Badge className={CATEGORY_BADGE_STYLES[module.category]}>
                                  {formatLabel(module.category)}
                                </Badge>
                                <Badge variant="outline">{module.duration_minutes} min</Badge>
                                <Badge variant="outline">{module.assignment_count || 0} assigned</Badge>
                                <MethodBadge methodName={module.assessment_method_name} />
                              </div>
                              <div className="mt-1 text-sm text-slate-600">
                                {module.description || 'No description provided yet.'}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="assignment-due-date">Due Date</Label>
                      <Input
                        id="assignment-due-date"
                        type="date"
                        value={assignmentForm.dueDate}
                        onChange={(event) =>
                          setAssignmentForm((current) => ({
                            ...current,
                            dueDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <Checkbox
                        checked={assignmentForm.isMandatory}
                        onCheckedChange={(checked) =>
                          setAssignmentForm((current) => ({
                            ...current,
                            isMandatory: checked === true,
                          }))
                        }
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-900">Mandatory activity set</div>
                        <div className="text-xs text-slate-500">Trainees will see these activity titles as required.</div>
                      </div>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assignment-notes">Assignment Notes</Label>
                    <Textarea
                      id="assignment-notes"
                      placeholder="Add rollout guidance, daily completion expectations, or coaching reminders."
                      value={assignmentForm.notes}
                      onChange={(event) =>
                        setAssignmentForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <Button className="w-full" type="submit" disabled={isAssigningActivities}>
                    <PlusCircle className="mr-2 size-4" />
                    {isAssigningActivities ? 'Assigning Activities...' : 'Assign Selected Activities'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment Preview</CardTitle>
              <CardDescription>
                Review the selected batch or wave and the activity titles that will be created as trainee assignment
                rows once you submit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-medium text-slate-500">Selected Batch / Wave</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {selectedBatch ? formatBatchLabel(selectedBatch) : 'No batch selected yet'}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {selectedBatch
                    ? `${selectedBatch.users_count || 0} trainee${selectedBatch.users_count === 1 ? '' : 's'} currently belong to this cohort.${selectedBatch.lob ? ` LOB: ${selectedBatch.lob}.` : ''}`
                    : 'Choose a batch or wave to preview the trainee cohort.'}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-500">Selected Activity Titles</div>
                  <Badge variant="outline">{selectedAssignmentModules.length} selected</Badge>
                </div>
                {selectedAssignmentModules.length ? (
                  <div className="mt-4 space-y-3">
                    {selectedAssignmentModules.map((module) => (
                      <div key={module.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-slate-950">{module.title}</div>
                          <Badge className={CATEGORY_BADGE_STYLES[module.category]}>
                            {formatLabel(module.category)}
                          </Badge>
                          <Badge variant="outline">{module.exercise_count} exercises</Badge>
                          <MethodBadge methodName={module.assessment_method_name} />
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {module.description || 'No description provided yet.'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-slate-500">
                    Select one or more saved activity titles from the left to build the batch assignment set.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activePanel === 'assessment' ? (
        <div className="space-y-6">
          <Card className="border-violet-200 bg-violet-50/70">
            <CardContent className="pt-6">
              <div className="space-y-1">
                <div className="text-lg font-semibold text-violet-950">Assessment Lesson Studio</div>
                <div className="text-sm text-violet-900/90">
                  Build trainer lessons from the five BPO assessment methods stored in the database. Create, edit, and
                  assign lessons here, and every change stays tied to the active database records.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Create Assessment-Based Lesson</CardTitle>
                <CardDescription>
                  Select one assessment method from the database catalog, then save a lesson whose practice items are
                  generated around that method.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form className="space-y-4" onSubmit={handleCreateAssessmentLesson}>
                  <div className="space-y-2">
                    <Label>Assessment Method</Label>
                    <Select
                      value={assessmentForm.assessmentMethodId || undefined}
                      onValueChange={(value) => setAssessmentForm((current) => ({ ...current, assessmentMethodId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an assessment method" />
                      </SelectTrigger>
                      <SelectContent>
                        {assessmentMethods.map((method) => (
                          <SelectItem key={method.id} value={method.id}>
                            {method.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedAssessmentMethod ? (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
                      <div className="font-semibold">{selectedAssessmentMethod.name}</div>
                      <div className="mt-1 text-violet-900/90">
                        {selectedAssessmentMethod.summary || selectedAssessmentMethod.method_description}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedAssessmentMethod.measures.map((measure) => (
                          <Badge key={`${selectedAssessmentMethod.id}-${measure}`} variant="outline" className="border-violet-200 bg-white text-violet-700">
                            {measure}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <LessonFormFields
                    form={assessmentForm}
                    onChange={setAssessmentForm}
                  />
                  <Button className="w-full" type="submit" disabled={isCreatingAssessmentLesson}>
                    <PlusCircle className="mr-2 size-4" />
                    {isCreatingAssessmentLesson ? 'Saving Assessment Lesson...' : 'Create Assessment Lesson'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assessment Method Catalog</CardTitle>
                <CardDescription>
                  These method cards are loaded from the backend database catalog and show how many trainer lessons are
                  already attached to each assessment style.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingWorkspace ? (
                  <EmptyState message="Loading assessment methods from the database..." />
                ) : !assessmentMethods.length ? (
                  <EmptyState message="No assessment methods are available yet in the database." />
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {assessmentMethods.map((method) => (
                      <div key={method.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-950">{method.name}</div>
                            <div className="mt-1 text-sm text-slate-600">
                              {method.summary || method.method_description}
                            </div>
                          </div>
                          <Badge variant="outline">{method.lesson_count} lesson(s)</Badge>
                        </div>
                        <div className="mt-3 text-xs text-slate-500">
                          Trainer lessons saved in the current database for this assessment method.
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {method.measures.map((measure) => (
                            <Badge key={`${method.id}-${measure}`} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                              {measure}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Saved Assessment Lessons</CardTitle>
              <CardDescription>
                Every lesson below is already saved and grouped by the assessment method it belongs to.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingWorkspace ? (
                <EmptyState message="Loading assessment lessons from the database..." />
              ) : !assessmentMethods.length ? (
                <EmptyState message="The assessment method catalog is empty." />
              ) : (
                assessmentMethods.map((method) => {
                  const methodModules = assessmentModules.filter((module) => module.assessment_method_id === method.id);
                  return (
                    <div key={method.id} className="space-y-3">
                      <div className="flex flex-col gap-1">
                        <div className="text-lg font-semibold text-slate-950">{method.name}</div>
                        <div className="text-sm text-slate-600">
                          {methodModules.length
                            ? `${methodModules.length} database lesson(s) currently tied to this assessment method.`
                            : 'No lessons saved for this method yet. Use the form above to create the first one.'}
                        </div>
                      </div>
                      {methodModules.length ? (
                        <div className="grid gap-4 lg:grid-cols-2">
                          {methodModules.map((module) => (
                            <ModuleCard
                              key={module.id}
                              module={module}
                              onEdit={handleEditModule}
                              onDelete={handleDeleteModule}
                              isDeleting={deletingModuleId === module.id}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-sm text-slate-500">
                          No assessment lessons saved yet for this method.
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activePanel === 'tracker' ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Batch Delivery Tracker</CardTitle>
              <CardDescription>
                Trainer and trainee views share the same saved assignment rows. Everything below is read from the
                current microlearning assignment records.
              </CardDescription>
            </div>
            <div className="text-sm text-slate-500">
              Showing {assignments.length} row{assignments.length === 1 ? '' : 's'} across all batches
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingWorkspace ? (
              <EmptyState message="Loading batch delivery records..." />
            ) : assignments.length === 0 ? (
              <EmptyState message="No trainee microlearning records are available yet in the current database." />
            ) : (
              <div className="space-y-4">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{assignment.module_title || 'Untitled activity'}</h3>
                          {assignment.module_category ? (
                            <Badge className={CATEGORY_BADGE_STYLES[assignment.module_category]}>
                              {formatLabel(assignment.module_category)}
                            </Badge>
                          ) : null}
                          <MethodBadge methodName={assignment.assessment_method_name} />
                          <Badge className={STATUS_BADGE_STYLES[assignment.status]}>
                            {formatLabel(assignment.status)}
                          </Badge>
                          {assignment.is_mandatory ? <Badge variant="outline">Mandatory</Badge> : null}
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                          <span>Batch / Wave: {formatAssignmentBatchLabel(assignment)}</span>
                          <span>Trainee: {assignment.trainee_name || assignment.user_id}</span>
                          {assignment.batch_lob ? <span>LOB: {assignment.batch_lob}</span> : null}
                        </div>
                        {assignment.notes ? (
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{assignment.notes}</div>
                        ) : null}
                      </div>
                      <div className="text-sm text-slate-500">
                        <p>Assigned: {formatDate(assignment.assigned_at)}</p>
                        <p>Due: {formatDate(assignment.due_date)}</p>
                        {assignment.completed_at ? <p>Completed: {formatDate(assignment.completed_at)}</p> : null}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>{assignment.completed_exercises}/{assignment.exercise_count} exercises completed</span>
                        <span>{Math.round(assignment.completion_percentage)}%</span>
                      </div>
                      <Progress value={assignment.completion_percentage || 0} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={!!editingModule}
        onOpenChange={(open) => {
          if (!open) {
            setEditingModule(null);
            setEditForm(emptyAssessmentLessonForm());
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Saved Activity</DialogTitle>
            <DialogDescription>
              Update this trainer activity in the database. If the activity already has trainee assignments, its
              existing exercise content stays unchanged so current progress is preserved.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleUpdateModule}>
            <div className="space-y-2">
              <Label>Assessment Method</Label>
              <Select
                value={editForm.assessmentMethodId || 'none'}
                onValueChange={(value) =>
                  setEditForm((current) => ({
                    ...current,
                    assessmentMethodId: value === 'none' ? '' : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an assessment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Standard activity only</SelectItem>
                  {assessmentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <LessonFormFields form={editForm} onChange={setEditForm} />
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingModule(null);
                  setEditForm(emptyAssessmentLessonForm());
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdatingModule}>
                {isUpdatingModule ? 'Saving Changes...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border bg-white/80 p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="text-sm text-slate-500">{hint}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function LessonFormFields<T extends LessonFormState>({
  form,
  onChange,
}: {
  form: T;
  onChange: Dispatch<SetStateAction<T>>;
}) {
  const updateField = <K extends keyof LessonFormState>(field: K, value: LessonFormState[K]) => {
    onChange((current) => ({ ...current, [field]: value }));
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="lesson-title">Lesson Title</Label>
        <Input
          id="lesson-title"
          placeholder="Voice Tone Recovery Drill"
          value={form.title}
          onChange={(event) => updateField('title', event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lesson-description">Description</Label>
        <Textarea
          id="lesson-description"
          placeholder="Describe the customer-service behavior this lesson should reinforce."
          value={form.description}
          onChange={(event) => updateField('description', event.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(value: ModuleCategory) => updateField('category', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Difficulty</Label>
          <Select
            value={form.difficulty}
            onValueChange={(value: ModuleDifficulty) => updateField('difficulty', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select difficulty" />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lesson-duration">Duration (minutes)</Label>
          <Input
            id="lesson-duration"
            type="number"
            min="1"
            value={form.durationMinutes}
            onChange={(event) => updateField('durationMinutes', event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lesson-skill-focus">Skill Focus</Label>
          <Input
            id="lesson-skill-focus"
            placeholder="Empathy tone and escalation clarity"
            value={form.skillFocus}
            onChange={(event) => updateField('skillFocus', event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="lesson-content-url">Content URL</Label>
        <Input
          id="lesson-content-url"
          placeholder="https://..."
          value={form.contentUrl}
          onChange={(event) => updateField('contentUrl', event.target.value)}
        />
      </div>
    </>
  );
}

function ModuleCard({
  module,
  onEdit,
  onDelete,
  isDeleting = false,
}: {
  module: MicrolearningModule;
  onEdit?: (module: MicrolearningModule) => void;
  onDelete?: (module: MicrolearningModule) => void;
  isDeleting?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{module.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{module.description || 'No description provided yet.'}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge className={CATEGORY_BADGE_STYLES[module.category]}>{formatLabel(module.category)}</Badge>
          {onEdit ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onEdit(module)}>
              <PencilLine className="size-4" />
              Edit
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDeleting}
              onClick={() => onDelete(module)}
            >
              <Trash2 className="size-4" />
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
        <Badge variant="outline">{formatLabel(module.difficulty)}</Badge>
        <Badge variant="outline">{module.exercise_count} exercises</Badge>
        <Badge variant="outline">{module.duration_minutes} minutes</Badge>
        <Badge variant="outline">{module.assignment_count || 0} assignment row(s)</Badge>
        <MethodBadge methodName={module.assessment_method_name} />
      </div>
      <div className="mt-3 text-xs text-slate-500">
        Saved: {formatDate(module.created_at)}.
        {' '}
        {module.assignment_count
          ? `This activity already has ${module.assignment_count} trainee assignment row(s), so editing updates the saved activity while delete only removes it from the active library.`
          : 'This activity has not been assigned yet, so you can freely modify or remove it from the saved library.'}
      </div>
      {module.assessment_measures?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {module.assessment_measures.slice(0, 3).map((measure) => (
            <Badge key={`${module.id}-${measure}`} variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
              {measure}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Clock3 className="size-4" />
          Exercise Preview
        </div>
        {(module.exercises || []).slice(0, 2).map((exercise) => (
          <div key={exercise.id} className="rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{exercise.title}</p>
              {exercise.type ? <Badge variant="outline">{formatLabel(exercise.type)}</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">{exercise.prompt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
