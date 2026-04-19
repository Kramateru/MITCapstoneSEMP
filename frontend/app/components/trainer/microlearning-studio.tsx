'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Loader2, Pencil, Plus, RefreshCw, Send, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Progress } from '@/app/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Textarea } from '@/app/components/ui/textarea';

import {
  AssessmentMethod,
  Batch,
  CATEGORY_STYLES,
  CategoryFormState,
  emptyModuleForm,
  formatDate,
  formatLabel,
  MicrolearningAssignment,
  MicrolearningModule,
  MODULE_TEMPLATE_PRESETS,
  ModuleFormState,
  NONE_VALUE,
  STATUS_STYLES,
  TopicCategory,
  TrainerReportOverview,
  User,
  buildContentData,
  moduleToForm,
} from './microlearning-studio-utils';

export default function TrainerMicrolearningStudio() {
  const [methods, setMethods] = useState<AssessmentMethod[]>([]);
  const [categories, setCategories] = useState<TopicCategory[]>([]);
  const [modules, setModules] = useState<MicrolearningModule[]>([]);
  const [assignments, setAssignments] = useState<MicrolearningAssignment[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [report, setReport] = useState<TrainerReportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showModuleDialog, setShowModuleDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [editingModule, setEditingModule] = useState<MicrolearningModule | null>(null);
  const [editingCategory, setEditingCategory] = useState<TopicCategory | null>(null);
  const [moduleForm, setModuleForm] = useState<ModuleFormState>(emptyModuleForm());
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({ name: '', description: '' });
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [assignmentBatchId, setAssignmentBatchId] = useState('');
  const [assignmentTraineeId, setAssignmentTraineeId] = useState('');
  const [assignmentDueDate, setAssignmentDueDate] = useState('');
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const trainees = useMemo<User[]>(() => {
    const seen = new Set<string>();
    const rows: User[] = [];
    batches.forEach((batch) => {
      (batch.users || []).forEach((trainee) => {
        if (!seen.has(trainee.id)) {
          seen.add(trainee.id);
          rows.push(trainee);
        }
      });
    });
    return rows;
  }, [batches]);

  function formatBatchWindow(batch: Batch) {
    if (!batch.start_date && !batch.end_date) {
      return 'Dates not set';
    }
    const start = batch.start_date ? new Date(batch.start_date).toLocaleDateString() : 'Open start';
    const end = batch.end_date ? new Date(batch.end_date).toLocaleDateString() : 'Open end';
    return `${start} - ${end}`;
  }

  function applyTemplate(templateKey: string) {
    const template = MODULE_TEMPLATE_PRESETS.find((item) => item.key === templateKey);
    if (!template) {
      return;
    }
    setModuleForm({
      ...template.form,
      topic_category_id: moduleForm.topic_category_id || template.form.topic_category_id,
      assessment_method_id: moduleForm.assessment_method_id || template.form.assessment_method_id,
    });
  }

  const authedFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      if (!token) throw new Error('Not authenticated.');
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const response = await fetch(url, { ...init, headers });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || 'Request failed.');
      }
      return response;
    },
    [token],
  );

  const loadData = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const modulesRes = await authedFetch('/api/trainer/microlearning-modules');
      const [methodsRes, categoriesRes, assignmentsRes, batchesRes, reportsRes] = await Promise.all([
        authedFetch('/api/trainer/microlearning-assessment-methods'),
        authedFetch('/api/trainer/microlearning-topic-categories'),
        authedFetch('/api/trainer/microlearning-assignments'),
        authedFetch('/api/trainer/batches'),
        authedFetch('/api/trainer/microlearning-reports/overview'),
      ]);
      setMethods((await methodsRes.json()).methods || []);
      setCategories((await categoriesRes.json()).categories || []);
      setModules((await modulesRes.json()).modules || []);
      setAssignments((await assignmentsRes.json()).assignments || []);
      setBatches((await batchesRes.json()).batches || []);
      setReport(await reportsRes.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load microlearning data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authedFetch, token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function uploadAsset(file: File) {
    if (!token) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/trainer/microlearning-assets/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Upload failed.');
      }
      setModuleForm((current) => ({ ...current, content_url: payload?.asset_url || '' }));
      toast.success('Asset uploaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Asset upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function saveCategory() {
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required.');
      return;
    }
    setSaving(true);
    try {
      await authedFetch(
        editingCategory
          ? `/api/trainer/microlearning-topic-categories/${editingCategory.id}`
          : '/api/trainer/microlearning-topic-categories',
        {
          method: editingCategory ? 'PUT' : 'POST',
          body: JSON.stringify({
            name: categoryForm.name.trim(),
            description: categoryForm.description.trim() || null,
          }),
        },
      );
      setShowCategoryDialog(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save category.');
    } finally {
      setSaving(false);
    }
  }

  async function saveModule() {
    if (!moduleForm.title.trim()) {
      toast.error('Module title is required.');
      return;
    }
    setSaving(true);
    try {
      await authedFetch(editingModule ? `/api/trainer/microlearning-modules/${editingModule.id}` : '/api/trainer/microlearning-modules', {
        method: editingModule ? 'PUT' : 'POST',
        body: JSON.stringify({
          title: moduleForm.title.trim(),
          description: moduleForm.description.trim() || null,
          category: moduleForm.category,
          module_type: moduleForm.module_type,
          duration_minutes: Number(moduleForm.duration_minutes),
          passing_score: Number(moduleForm.passing_score),
          skill_focus: moduleForm.skill_focus.trim() || null,
          content_url: moduleForm.content_url.trim() || null,
          difficulty: moduleForm.difficulty,
          assessment_method_id: moduleForm.assessment_method_id || null,
          topic_category_id: moduleForm.topic_category_id || null,
          content_data: buildContentData(moduleForm),
        }),
      });
      setShowModuleDialog(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save module.');
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(url: string, label: string) {
    if (!window.confirm(`Delete ${label}?`)) {
      return;
    }
    try {
      await authedFetch(url, { method: 'DELETE' });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed.');
    }
  }

  async function removeAssignment(assignment: MicrolearningAssignment) {
    if (!window.confirm(`Remove the assignment for "${assignment.title}"?`)) {
      return;
    }
    try {
      await authedFetch(`/api/trainer/microlearning-assignments/${assignment.id}`, { method: 'DELETE' });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to remove assignment.');
    }
  }

  async function assignModules() {
    if (!selectedModuleIds.length) {
      toast.error('Select at least one module.');
      return;
    }
    if (!assignmentBatchId && !assignmentTraineeId) {
      toast.error('Choose a batch or trainee.');
      return;
    }
    setSaving(true);
    try {
      await authedFetch('/api/trainer/microlearning-assignments', {
        method: 'POST',
        body: JSON.stringify({
          module_ids: selectedModuleIds,
          batch_id: assignmentBatchId || undefined,
          user_id: assignmentBatchId ? undefined : assignmentTraineeId || undefined,
          due_date: assignmentDueDate ? new Date(`${assignmentDueDate}T23:59:00`).toISOString() : undefined,
          is_mandatory: true,
        }),
      });
      setShowAssignDialog(false);
      setSelectedModuleIds([]);
      setAssignmentBatchId('');
      setAssignmentTraineeId('');
      setAssignmentDueDate('');
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to assign modules.');
    } finally {
      setSaving(false);
    }
  }

  const activeTemplate = MODULE_TEMPLATE_PRESETS.find((template) => template.module_type === moduleForm.module_type);
  const needsMediaAsset = ['video', 'infographic', 'case_study'].includes(moduleForm.module_type);
  const mediaAssetLabel =
    moduleForm.module_type === 'video'
      ? 'Video or YouTube Link'
      : moduleForm.module_type === 'infographic'
        ? 'Infographic / Image Upload'
        : moduleForm.module_type === 'case_study'
          ? 'Audio Upload'
          : 'Supporting Asset';
  const mediaAssetDescription =
    moduleForm.module_type === 'video'
      ? 'Upload a trainer video or paste a YouTube link trainees should review before the practice prompt.'
      : moduleForm.module_type === 'infographic'
        ? 'Upload the infographic or image trainees should review.'
        : moduleForm.module_type === 'case_study'
          ? 'Upload the audio file trainees should analyze with the transcript.'
          : 'Upload a supporting media asset.';

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Loading microlearning studio...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Microlearning Studio</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trainer microlearning authoring, assignment, certification, and reporting.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setRefreshing(true); void loadData(); }} disabled={refreshing}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button onClick={() => { setEditingModule(null); setModuleForm(emptyModuleForm()); setShowModuleDialog(true); }}>
            <Plus className="size-4" />
            Create Module
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Categories</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{report?.summary.topic_category_count || categories.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Modules</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{report?.summary.module_count || modules.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Assignments</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{report?.summary.assignment_count || assignments.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Trainees</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{trainees.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Topic Categories</CardTitle>
            <CardDescription>Trainer-managed categories for grammar, empathy, pronunciation, language, and other BPO practice topics.</CardDescription>
          </div>
          <Button variant="outline" onClick={() => { setEditingCategory(null); setCategoryForm({ name: '', description: '' }); setShowCategoryDialog(true); }}>
            <Plus className="size-4" />
            Add Category
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <div key={category.id} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{category.name}</div>
                  <div className="text-xs text-muted-foreground">{category.slug}</div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setEditingCategory(category); setCategoryForm({ name: category.name, description: category.description || '' }); setShowCategoryDialog(true); }}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void removeItem(`/api/trainer/microlearning-topic-categories/${category.id}`, category.name)}>
                    <Trash2 className="size-4 text-rose-600" />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{category.description || 'No description yet.'}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Modules</CardTitle>
            <CardDescription>Create and edit typed microlearning modules, then upload supporting media to Supabase.</CardDescription>
          </div>
          <Button variant="outline" onClick={() => setShowAssignDialog(true)} disabled={!modules.length}>
            <Send className="size-4" />
            Assign Modules
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Passing</TableHead>
                <TableHead>Assignments</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((module) => (
                <TableRow key={module.id}>
                  <TableCell>
                    <div className="font-medium">{module.title}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge className={CATEGORY_STYLES[module.category]}>{formatLabel(module.category)}</Badge>
                      <Badge variant="outline">{formatLabel(module.module_type)}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>{module.topic_category_name || 'Uncategorized'}</TableCell>
                  <TableCell>{module.passing_score}%</TableCell>
                  <TableCell>{module.assignment_count}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingModule(module); setModuleForm(moduleToForm(module)); setShowModuleDialog(true); }}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void removeItem(`/api/trainer/microlearning-modules/${module.id}`, module.title)}>
                      <Trash2 className="size-4 text-rose-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignments</CardTitle>
          <CardDescription>Assigned modules appear for trainees, and passing completions move into certificates and trainer reports.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Trainee</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>{assignment.title}</TableCell>
                  <TableCell>{assignment.trainee_name || 'Unknown trainee'}</TableCell>
                  <TableCell>{assignment.batch_label || 'Individual'}</TableCell>
                  <TableCell><Badge className={STATUS_STYLES[assignment.status]}>{formatLabel(assignment.status)}</Badge></TableCell>
                  <TableCell>{Number(assignment.average_score || 0).toFixed(1)}% {assignment.certificate_id ? '(Certified)' : assignment.is_passed ? '(Passed)' : ''}</TableCell>
                  <TableCell>{formatDate(assignment.due_date)}</TableCell>
                  <TableCell className="text-right">
                    {!assignment.certificate_id ? (
                      <Button variant="ghost" size="sm" onClick={() => void removeAssignment(assignment)}>
                        <Trash2 className="size-4 text-rose-600" />
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Locked</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Batch Progress</CardTitle>
            <CardDescription>Microlearning completion and certification by batch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(report?.batch_progress || []).map((row) => (
              <div key={row.batch_id || row.batch_label} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{row.batch_label}</div>
                    <div className="text-xs text-muted-foreground">{row.trainee_count} trainees | {row.assignment_count} assignments | {row.certified_count} certified</div>
                  </div>
                  <Badge variant="outline">{Number(row.average_score || 0).toFixed(1)}%</Badge>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Pass rate</span><span>{Number(row.pass_rate || 0).toFixed(1)}%</span></div>
                  <Progress value={row.pass_rate || 0} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trainee Progress</CardTitle>
            <CardDescription>Trainer view of accomplishment and analytics per trainee.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(report?.trainee_progress || []).slice(0, 10).map((row) => (
              <div key={row.trainee_id || `${row.trainee_name}-${row.batch_label}`} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{row.trainee_name}</div>
                    <div className="text-xs text-muted-foreground">{row.batch_label}</div>
                  </div>
                  <Badge className={row.certified_count ? STATUS_STYLES.certified : STATUS_STYLES.in_progress}>{row.certified_count} certified</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{row.completed_count}/{row.assignment_count} completed | Avg {Number(row.average_score || 0).toFixed(1)}% | Pass rate {Number(row.pass_rate || 0).toFixed(1)}%</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Certificates</CardTitle>
          <CardDescription>Passing microlearning modules appear in the trainee certificate navigation and this trainer report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(report?.recent_certificates || []).map((certificate) => (
            <div key={certificate.certificate_id} className="rounded-2xl border p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{certificate.module_title || 'Microlearning module'}</div>
                  <div className="text-muted-foreground">{certificate.trainee_name || 'Unknown trainee'}</div>
                </div>
                <Badge variant="outline"><Award className="mr-1 size-3" />{certificate.certificate_no}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Issued {formatDate(certificate.issued_at)}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Create Category'}</DialogTitle>
            <DialogDescription>Trainers can add, modify, and delete microlearning categories.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} /></div>
            <div><Label>Description</Label><Textarea rows={4} value={categoryForm.description} onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>Cancel</Button>
            <Button onClick={() => void saveCategory()} disabled={saving}>{saving ? 'Saving...' : 'Save Category'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Modules</DialogTitle>
            <DialogDescription>Select trainer-created modules and send them to a batch or one trainee.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl border p-3">
              {modules.map((module) => (
                <label key={module.id} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={selectedModuleIds.includes(module.id)}
                    onChange={(event) => setSelectedModuleIds((current) => event.target.checked ? [...current, module.id] : current.filter((moduleId) => moduleId !== module.id))}
                  />
                  <div>
                    <div className="font-medium">{module.title}</div>
                    <div className="text-xs text-muted-foreground">{module.topic_category_name || 'Uncategorized'} | {module.passing_score}% passing</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Batch</Label>
                <Select value={assignmentBatchId || NONE_VALUE} onValueChange={(value) => { setAssignmentBatchId(value === NONE_VALUE ? '' : value); if (value !== NONE_VALUE) setAssignmentTraineeId(''); }}>
                  <SelectTrigger><SelectValue placeholder="Optional batch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.name}
                        {batch.wave_number ? ` | Wave ${batch.wave_number}` : ''}
                        {` | ${formatBatchWindow(batch)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Trainee</Label>
                <Select value={assignmentTraineeId || NONE_VALUE} onValueChange={(value) => { setAssignmentTraineeId(value === NONE_VALUE ? '' : value); if (value !== NONE_VALUE) setAssignmentBatchId(''); }}>
                  <SelectTrigger><SelectValue placeholder="Optional trainee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {trainees.map((trainee) => <SelectItem key={trainee.id} value={trainee.id}>{trainee.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Due Date</Label><Input type="date" value={assignmentDueDate} onChange={(event) => setAssignmentDueDate(event.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
            <Button onClick={() => void assignModules()} disabled={saving}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModuleDialog} onOpenChange={setShowModuleDialog}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingModule ? 'Edit Module' : 'Create Module'}</DialogTitle>
            <DialogDescription>Video, quiz, flashcard, infographic, and case-study templates all save into Supabase-backed microlearning content.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-medium">Create From a Sample Template</div>
                  <div className="text-sm text-muted-foreground">
                    Use the five requested microlearning defaults to jump-start authoring for trainers.
                  </div>
                </div>
                {activeTemplate ? (
                  <Badge variant="outline">
                    {activeTemplate.feature_name}: {activeTemplate.seed_title}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {MODULE_TEMPLATE_PRESETS.map((template) => (
                  <Button
                    key={template.key}
                    type="button"
                    variant={moduleForm.title === template.form.title ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => applyTemplate(template.key)}
                  >
                    {template.feature_name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label>Title</Label><Input value={moduleForm.title} onChange={(event) => setModuleForm((current) => ({ ...current, title: event.target.value }))} /></div>
              <div><Label>Skill Focus</Label><Input value={moduleForm.skill_focus} onChange={(event) => setModuleForm((current) => ({ ...current, skill_focus: event.target.value }))} /></div>
            </div>
            <div><Label>Description</Label><Textarea rows={3} value={moduleForm.description} onChange={(event) => setModuleForm((current) => ({ ...current, description: event.target.value }))} /></div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Category</Label>
                <Select value={moduleForm.category} onValueChange={(value) => setModuleForm((current) => ({ ...current, category: value as ModuleFormState['category'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pronunciation">Pronunciation</SelectItem>
                    <SelectItem value="fluency">Fluency</SelectItem>
                    <SelectItem value="grammar">Grammar</SelectItem>
                    <SelectItem value="empathy">Empathy</SelectItem>
                    <SelectItem value="clarity">Clarity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={moduleForm.module_type} onValueChange={(value) => setModuleForm((current) => ({ ...current, module_type: value as ModuleFormState['module_type'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="quiz">Quiz</SelectItem>
                    <SelectItem value="flashcard">Flashcard</SelectItem>
                    <SelectItem value="infographic">Infographic</SelectItem>
                    <SelectItem value="case_study">Case Study</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select value={moduleForm.difficulty} onValueChange={(value) => setModuleForm((current) => ({ ...current, difficulty: value as ModuleFormState['difficulty'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div><Label>Minutes</Label><Input type="number" value={moduleForm.duration_minutes} onChange={(event) => setModuleForm((current) => ({ ...current, duration_minutes: Number(event.target.value || 0) }))} /></div>
              <div><Label>Passing Score</Label><Input type="number" value={moduleForm.passing_score} onChange={(event) => setModuleForm((current) => ({ ...current, passing_score: Number(event.target.value || 0) }))} /></div>
              <div>
                <Label>Topic Category</Label>
                <Select value={moduleForm.topic_category_id || NONE_VALUE} onValueChange={(value) => setModuleForm((current) => ({ ...current, topic_category_id: value === NONE_VALUE ? '' : value }))}>
                  <SelectTrigger><SelectValue placeholder="Optional topic" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Method</Label>
                <Select value={moduleForm.assessment_method_id || NONE_VALUE} onValueChange={(value) => setModuleForm((current) => ({ ...current, assessment_method_id: value === NONE_VALUE ? '' : value }))}>
                  <SelectTrigger><SelectValue placeholder="Optional method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {methods.map((method) => <SelectItem key={method.id} value={method.id}>{method.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {needsMediaAsset ? (
              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{mediaAssetLabel}</div>
                    <div className="text-sm text-muted-foreground">{mediaAssetDescription}</div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium">
                    <Upload className="size-4" />
                    {uploading ? 'Uploading...' : 'Upload'}
                    <input type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file); event.currentTarget.value = ''; }} />
                  </label>
                </div>
                <Input className="mt-3" value={moduleForm.content_url} onChange={(event) => setModuleForm((current) => ({ ...current, content_url: event.target.value }))} placeholder="https://youtube.com/... or /media/..." />
              </div>
            ) : null}

            {moduleForm.module_type === 'video' ? (
              <>
                <div className="rounded-2xl border p-4">
                  <div className="font-medium">De-escalation Toolkit</div>
                  <div className="text-sm text-muted-foreground">Video uploader with a practice prompt text area for HEARD-based coaching.</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label>Practice Prompt</Label><Textarea rows={4} value={moduleForm.practice_prompt} onChange={(event) => setModuleForm((current) => ({ ...current, practice_prompt: event.target.value }))} /></div>
                  <div><Label>Suggested Response</Label><Textarea rows={4} value={moduleForm.sample_answer} onChange={(event) => setModuleForm((current) => ({ ...current, sample_answer: event.target.value }))} /></div>
                </div>
                <div><Label>Passing Keywords</Label><Textarea rows={3} value={moduleForm.required_keywords} onChange={(event) => setModuleForm((current) => ({ ...current, required_keywords: event.target.value }))} placeholder="One keyword or phrase per line" /></div>
              </>
            ) : null}

            {moduleForm.module_type === 'quiz' ? (
              <>
                <div className="rounded-2xl border p-4">
                  <div className="font-medium">Spot the Tone</div>
                  <div className="text-sm text-muted-foreground">Multi-choice builder with feedback logic for options A, B, and C.</div>
                </div>
                <div><Label>Quiz Question</Label><Textarea rows={4} value={moduleForm.quiz_question} onChange={(event) => setModuleForm((current) => ({ ...current, quiz_question: event.target.value }))} /></div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div><Label>Option A</Label><Textarea rows={3} value={moduleForm.option_a} onChange={(event) => setModuleForm((current) => ({ ...current, option_a: event.target.value }))} /></div>
                  <div><Label>Option B</Label><Textarea rows={3} value={moduleForm.option_b} onChange={(event) => setModuleForm((current) => ({ ...current, option_b: event.target.value }))} /></div>
                  <div><Label>Option C</Label><Textarea rows={3} value={moduleForm.option_c} onChange={(event) => setModuleForm((current) => ({ ...current, option_c: event.target.value }))} /></div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Correct Option</Label>
                    <Select value={moduleForm.correct_option || NONE_VALUE} onValueChange={(value) => setModuleForm((current) => ({ ...current, correct_option: value === NONE_VALUE ? '' : (value as 'A' | 'B' | 'C') }))}>
                      <SelectTrigger><SelectValue placeholder="Select the correct option" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>None</SelectItem>
                        <SelectItem value="A">Option A</SelectItem>
                        <SelectItem value="B">Option B</SelectItem>
                        <SelectItem value="C">Option C</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Optional Answer Keywords</Label><Textarea rows={3} value={moduleForm.required_keywords} onChange={(event) => setModuleForm((current) => ({ ...current, required_keywords: event.target.value }))} placeholder="Optional helper keywords" /></div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div><Label>Feedback A</Label><Textarea rows={3} value={moduleForm.feedback_a} onChange={(event) => setModuleForm((current) => ({ ...current, feedback_a: event.target.value }))} /></div>
                  <div><Label>Feedback B</Label><Textarea rows={3} value={moduleForm.feedback_b} onChange={(event) => setModuleForm((current) => ({ ...current, feedback_b: event.target.value }))} /></div>
                  <div><Label>Feedback C</Label><Textarea rows={3} value={moduleForm.feedback_c} onChange={(event) => setModuleForm((current) => ({ ...current, feedback_c: event.target.value }))} /></div>
                </div>
              </>
            ) : null}

            {moduleForm.module_type === 'flashcard' ? (
              <>
                <div className="rounded-2xl border p-4">
                  <div className="font-medium">Product Flashcards</div>
                  <div className="text-sm text-muted-foreground">Front and back card editor with markdown support for technical product coaching.</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label>Front (Markdown Supported)</Label><Textarea rows={5} value={moduleForm.card_front} onChange={(event) => setModuleForm((current) => ({ ...current, card_front: event.target.value }))} /></div>
                  <div><Label>Back (Markdown Supported)</Label><Textarea rows={5} value={moduleForm.card_back} onChange={(event) => setModuleForm((current) => ({ ...current, card_back: event.target.value }))} /></div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label>Mastery Prompt</Label><Textarea rows={4} value={moduleForm.mastery_prompt} onChange={(event) => setModuleForm((current) => ({ ...current, mastery_prompt: event.target.value }))} /></div>
                  <div><Label>Expected Answer</Label><Textarea rows={4} value={moduleForm.sample_answer} onChange={(event) => setModuleForm((current) => ({ ...current, sample_answer: event.target.value }))} /></div>
                </div>
                <div><Label>Required Keywords</Label><Textarea rows={3} value={moduleForm.required_keywords} onChange={(event) => setModuleForm((current) => ({ ...current, required_keywords: event.target.value }))} placeholder="One keyword or step per line" /></div>
              </>
            ) : null}

            {moduleForm.module_type === 'infographic' ? (
              <>
                <div className="rounded-2xl border p-4">
                  <div className="font-medium">Empathy Challenge</div>
                  <div className="text-sm text-muted-foreground">Infographic or image module with a power phrase editor for customer-safe language.</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label>Power Phrases</Label><Textarea rows={5} value={moduleForm.power_phrases} onChange={(event) => setModuleForm((current) => ({ ...current, power_phrases: event.target.value }))} placeholder="One power phrase per line" /></div>
                  <div><Label>Wall Phrases</Label><Textarea rows={5} value={moduleForm.wall_phrases} onChange={(event) => setModuleForm((current) => ({ ...current, wall_phrases: event.target.value }))} placeholder="One blocking phrase per line" /></div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label>Power Phrase Reflection</Label><Textarea rows={4} value={moduleForm.reflection_prompt} onChange={(event) => setModuleForm((current) => ({ ...current, reflection_prompt: event.target.value }))} /></div>
                  <div><Label>Suggested Response</Label><Textarea rows={4} value={moduleForm.sample_answer} onChange={(event) => setModuleForm((current) => ({ ...current, sample_answer: event.target.value }))} /></div>
                </div>
                <div><Label>Required Keywords</Label><Textarea rows={3} value={moduleForm.required_keywords} onChange={(event) => setModuleForm((current) => ({ ...current, required_keywords: event.target.value }))} placeholder="One keyword or phrase per line" /></div>
              </>
            ) : null}

            {moduleForm.module_type === 'case_study' ? (
              <>
                <div className="rounded-2xl border p-4">
                  <div className="font-medium">What Went Wrong?</div>
                  <div className="text-sm text-muted-foreground">Audio case study with transcript, analysis prompt, and root-cause coaching.</div>
                </div>
                <div><Label>Transcript</Label><Textarea rows={6} value={moduleForm.transcript} onChange={(event) => setModuleForm((current) => ({ ...current, transcript: event.target.value }))} /></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label>Analysis Field</Label><Textarea rows={4} value={moduleForm.analysis_prompt} onChange={(event) => setModuleForm((current) => ({ ...current, analysis_prompt: event.target.value }))} /></div>
                  <div><Label>Suggested Recovery Response</Label><Textarea rows={4} value={moduleForm.sample_answer} onChange={(event) => setModuleForm((current) => ({ ...current, sample_answer: event.target.value }))} /></div>
                </div>
                <div><Label>Root Cause Question</Label><Textarea rows={3} value={moduleForm.root_cause_question} onChange={(event) => setModuleForm((current) => ({ ...current, root_cause_question: event.target.value }))} /></div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div><Label>Option A</Label><Textarea rows={3} value={moduleForm.option_a} onChange={(event) => setModuleForm((current) => ({ ...current, option_a: event.target.value }))} /></div>
                  <div><Label>Option B</Label><Textarea rows={3} value={moduleForm.option_b} onChange={(event) => setModuleForm((current) => ({ ...current, option_b: event.target.value }))} /></div>
                  <div><Label>Option C</Label><Textarea rows={3} value={moduleForm.option_c} onChange={(event) => setModuleForm((current) => ({ ...current, option_c: event.target.value }))} /></div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Correct Option</Label>
                    <Select value={moduleForm.correct_option || NONE_VALUE} onValueChange={(value) => setModuleForm((current) => ({ ...current, correct_option: value === NONE_VALUE ? '' : (value as 'A' | 'B' | 'C') }))}>
                      <SelectTrigger><SelectValue placeholder="Select the correct option" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>None</SelectItem>
                        <SelectItem value="A">Option A</SelectItem>
                        <SelectItem value="B">Option B</SelectItem>
                        <SelectItem value="C">Option C</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Required Keywords</Label><Textarea rows={3} value={moduleForm.required_keywords} onChange={(event) => setModuleForm((current) => ({ ...current, required_keywords: event.target.value }))} placeholder="One keyword or phrase per line" /></div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div><Label>Feedback A</Label><Textarea rows={3} value={moduleForm.feedback_a} onChange={(event) => setModuleForm((current) => ({ ...current, feedback_a: event.target.value }))} /></div>
                  <div><Label>Feedback B</Label><Textarea rows={3} value={moduleForm.feedback_b} onChange={(event) => setModuleForm((current) => ({ ...current, feedback_b: event.target.value }))} /></div>
                  <div><Label>Feedback C</Label><Textarea rows={3} value={moduleForm.feedback_c} onChange={(event) => setModuleForm((current) => ({ ...current, feedback_c: event.target.value }))} /></div>
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModuleDialog(false)}>Cancel</Button>
            <Button onClick={() => void saveModule()} disabled={saving}>{saving ? 'Saving...' : 'Save Module'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
