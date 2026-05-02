'use client';

import { Loader2, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Progress } from '@/app/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Switch } from '@/app/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Textarea } from '@/app/components/ui/textarea';
import { useAuth } from '@/app/context/AuthContext';
import { deleteModuleAndDependencies } from '@/app/lib/microlearning/client';

import {
    buildContentData,
    CATEGORY_STYLES,
    emptyModuleForm,
    formatLabel,
    MicrolearningModule,
    ModuleFormState,
    moduleToForm,
    NONE_VALUE,
    splitToList,
    STATUS_STYLES,
    TopicCategory,
    TrainerReportOverview
} from './microlearning-studio-utils';

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const candidate = payload as { detail?: unknown; error?: unknown; message?: unknown };
    for (const value of [candidate.detail, candidate.error, candidate.message]) {
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }

  return fallback;
}

function getSelectableOptionEntries(options?: string[]) {
  return (options || [])
    .map((option, index) => ({ index, label: option.trim(), raw: option }))
    .filter((option) => option.label.length > 0);
}

function getSelectedOptionIndexValue(options: string[] | undefined, selectedOption: string) {
  if (!selectedOption.trim()) {
    return '';
  }

  const selectedIndex = (options || []).findIndex(
    (option) => option.trim().length > 0 && option === selectedOption,
  );

  return selectedIndex >= 0 ? String(selectedIndex) : '';
}

function hasTwoValidOptions(options?: string[]) {
  return getSelectableOptionEntries(options).length >= 2;
}

function getTrainerYouTubeEmbedUrl(url?: string | null) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url, 'http://localhost');
    const hostname = parsed.hostname.toLowerCase();
    let videoId = '';

    if (hostname === 'youtu.be') {
      videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
    } else if (hostname.includes('youtube.com') || hostname.includes('youtube-nocookie.com')) {
      if (parsed.pathname === '/watch') {
        videoId = parsed.searchParams.get('v') || '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/embed/')[1]?.split('/')[0] || '';
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
      }
    }

    return /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`
      : null;
  } catch {
    return null;
  }
}

function isTrainerDirectVideoFile(url?: string | null) {
  if (!url) {
    return false;
  }

  return /(^\/|\.mp4($|[?#])|\.webm($|[?#])|\.ogg($|[?#])|\.mov($|[?#])|\.m4v($|[?#]))/i.test(url);
}

function validateModuleForm(form: ModuleFormState) {
  if (!form.title.trim()) {
    return 'Module title is required.';
  }

  if (!Number.isFinite(form.duration_minutes) || form.duration_minutes <= 0) {
    return 'Duration must be greater than zero.';
  }

  if (!Number.isFinite(form.passing_score) || form.passing_score < 1 || form.passing_score > 100) {
    return 'Passing score must be between 1 and 100.';
  }

  if (form.module_type === 'video') {
    if (!form.content_url.trim()) {
      return 'Upload a trainer video to Supabase or paste a YouTube link before saving this video module.';
    }
    if (!form.video_questions.length) {
      return 'Add at least one video question for the module.';
    }

    for (const [index, question] of form.video_questions.entries()) {
      if (!question.question.trim()) {
        return `Video question ${index + 1} needs a prompt.`;
      }
      if (question.type === 'multiple_choice') {
        if (!hasTwoValidOptions(question.options)) {
          return `Video question ${index + 1} needs at least two non-empty choices.`;
        }
        if (!question.correct_option?.trim()) {
          return `Select the correct answer for video question ${index + 1}.`;
        }
      } else if (!question.sample_answer?.trim()) {
        return `Provide the trainer sample answer for video question ${index + 1}.`;
      }
    }
  }

  if (form.module_type === 'quiz') {
    if (!form.quiz_questions.length) {
      return 'Add at least one quiz question.';
    }

    for (const [index, question] of form.quiz_questions.entries()) {
      if (!question.question.trim()) {
        return `Quiz question ${index + 1} needs a prompt.`;
      }
      if (!hasTwoValidOptions(question.options)) {
        return `Quiz question ${index + 1} needs at least two non-empty choices.`;
      }
      if (!question.correct_option?.trim()) {
        return `Select the correct answer for quiz question ${index + 1}.`;
      }
    }
  }

  if (form.module_type === 'flashcard') {
    if (!form.flashcards.length) {
      return 'Add at least one flashcard.';
    }

    for (const [index, card] of form.flashcards.entries()) {
      if (!card.front.trim() || !card.back.trim()) {
        return `Flashcard ${index + 1} needs both front and back text.`;
      }
    }
  }

  if (form.module_type === 'infographic') {
    if (!form.infographic_questions.length) {
      return 'Add at least one infographic knowledge check.';
    }

    for (const [index, question] of form.infographic_questions.entries()) {
      if (!question.question.trim()) {
        return `Infographic question ${index + 1} needs a prompt.`;
      }
      if (!hasTwoValidOptions(question.options)) {
        return `Infographic question ${index + 1} needs at least two non-empty choices.`;
      }
      if (!question.correct_option?.trim()) {
        return `Select the correct answer for infographic question ${index + 1}.`;
      }
    }
  }

  if (form.module_type === 'case_study' || form.module_type === 'audio') {
    if (form.module_type === 'case_study' && !form.case_study_content.trim()) {
      return 'Case study scenario content is required.';
    }
    if (!form.case_study_questions.length) {
      return form.module_type === 'audio'
        ? 'Add at least one audio listening question.'
        : 'Add at least one case study question.';
    }

    for (const [index, question] of form.case_study_questions.entries()) {
      if (!question.question.trim()) {
        return `${form.module_type === 'audio' ? 'Audio' : 'Case study'} question ${index + 1} needs a prompt.`;
      }
      if (question.type === 'multiple_choice') {
        if (!hasTwoValidOptions(question.options)) {
          return `${form.module_type === 'audio' ? 'Audio' : 'Case study'} question ${index + 1} needs at least two non-empty choices.`;
        }
        if (!question.correct_option?.trim()) {
          return `Select the correct answer for ${form.module_type === 'audio' ? 'audio' : 'case study'} question ${index + 1}.`;
        }
      } else if (!question.sample_answer?.trim()) {
        return `Provide the trainer sample answer for ${form.module_type === 'audio' ? 'audio' : 'case study'} question ${index + 1}.`;
      }
    }
  }

  return null;
}

type TrainerBatchSummary = {
  id: string;
  name: string;
  wave_number?: number | null;
  lob?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  users_count?: number;
};

function formatBatchLabel(batch?: TrainerBatchSummary | null) {
  if (!batch) {
    return 'No batch / wave selected';
  }
  if (batch.wave_number !== null && batch.wave_number !== undefined) {
    return `${batch.name} | Wave ${batch.wave_number}`;
  }
  return batch.name;
}

export default function TrainerMicrolearningStudio() {
  const { token, isLoading: isAuthLoading } = useAuth();
  const [categories, setCategories] = useState<TopicCategory[]>([]);
  const [modules, setModules] = useState<MicrolearningModule[]>([]);
  const [batches, setBatches] = useState<TrainerBatchSummary[]>([]);
  const [report, setReport] = useState<TrainerReportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioProcessing, setAudioProcessing] = useState(false);
  const [showModuleDialog, setShowModuleDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingModule, setEditingModule] = useState<MicrolearningModule | null>(null);
  const [editingCategory, setEditingCategory] = useState<TopicCategory | null>(null);
  const [moduleForm, setModuleForm] = useState<ModuleFormState>(emptyModuleForm());
  const [audioPreviewUrl, setAudioPreviewUrl] = useState('');
  const [audioPreviewLoading, setAudioPreviewLoading] = useState(false);
  const [categoryForm, setCategoryForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [assignmentBatchId, setAssignmentBatchId] = useState<string>('');
  const [assignmentDueDate, setAssignmentDueDate] = useState<string>('');
  const assignmentSectionRef = useRef<HTMLDivElement | null>(null);
  const categorySectionRef = useRef<HTMLDivElement | null>(null);
  const librarySectionRef = useRef<HTMLDivElement | null>(null);
  const reportingSectionRef = useRef<HTMLDivElement | null>(null);

  const authedFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      if (!token) throw new Error('Not authenticated.');
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const response = await fetch(url, { ...init, cache: 'no-store', headers });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(getApiErrorMessage(payload, 'Request failed.'));
      }
      return response;
    },
    [token],
  );

  const loadData = useCallback(async () => {
    if (isAuthLoading) {
      return;
    }

    if (!token) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const modulesRes = await authedFetch('/api/trainer/microlearning-modules');
      const [categoriesRes, batchesRes, reportsRes] = await Promise.all([
        authedFetch('/api/trainer/microlearning-topic-categories'),
        authedFetch('/api/trainer/batches'),
        authedFetch('/api/trainer/microlearning-reports/overview'),
      ]);
      const categoriesPayload = await categoriesRes.json();
      const modulesPayload = await modulesRes.json();
      const batchesPayload = await batchesRes.json();
      const reportPayload = await reportsRes.json();
      const nextModules = modulesPayload.modules || [];
      const nextBatches = batchesPayload.batches || [];

      setCategories(categoriesPayload.categories || []);
      setModules(nextModules);
      setBatches(nextBatches);
      setReport(reportPayload);
      setSelectedModuleIds((current) =>
        current.filter((moduleId) => nextModules.some((module: MicrolearningModule) => module.id === moduleId)),
      );
      setAssignmentBatchId((current) =>
        nextBatches.some((batch: TrainerBatchSummary) => batch.id === current) ? current : '',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load microlearning data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authedFetch, isAuthLoading, token]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }
    void loadData();
  }, [isAuthLoading, loadData]);

  async function uploadAsset(file: File) {
    if (!token) {
      toast.error('Your session has expired. Please sign in again.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (editingModule?.id) {
        formData.append('module_id', editingModule.id);
      }
      formData.append('module_type', moduleForm.module_type);
      const response = await authedFetch('/api/trainer/microlearning-assets/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      setModuleForm((current) => ({
        ...current,
        content_url: payload?.asset_url || '',
        asset_record_id: typeof payload?.asset_record_id === 'string' ? payload.asset_record_id : '',
        asset_storage_path: typeof payload?.storage_path === 'string' ? payload.storage_path : '',
        asset_bucket_name: typeof payload?.bucket_name === 'string' ? payload.bucket_name : '',
        asset_content_type: typeof payload?.content_type === 'string' ? payload.content_type : (file.type || ''),
        asset_signed_url_required: Boolean(payload?.storage_path || payload?.signed_url_required),
      }));
      toast.success(
        moduleForm.module_type === 'video'
          ? 'Video uploaded to Supabase. Trainees will be able to watch it after the module is saved and assigned.'
          : 'Asset uploaded to Supabase.',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Asset upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const fetchAudioPreviewUrl = useCallback(
    async (moduleId: string) => {
      if (!token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      setAudioPreviewLoading(true);
      try {
        const response = await authedFetch(`/api/microlearning/audio-content/${moduleId}/signed-url`, {
          method: 'GET',
        });
        const payload = await response.json().catch(() => null);
        const nextUrl = typeof payload?.signed_url === 'string' ? payload.signed_url : '';
        setAudioPreviewUrl(nextUrl || '');
        return nextUrl;
      } finally {
        setAudioPreviewLoading(false);
      }
    },
    [authedFetch, token],
  );

  useEffect(() => {
    if (!showModuleDialog) {
      setAudioPreviewUrl('');
      setAudioPreviewLoading(false);
      return;
    }

    if (moduleForm.module_type !== 'audio') {
      setAudioPreviewUrl('');
      return;
    }

    const moduleId = editingModule?.id;
    if (!moduleId || !moduleForm.audio_content_id) {
      setAudioPreviewUrl(moduleForm.content_url || '');
      return;
    }

    void fetchAudioPreviewUrl(moduleId).catch(() => {
      setAudioPreviewUrl(moduleForm.content_url || '');
    });
  }, [
    editingModule?.id,
    fetchAudioPreviewUrl,
    moduleForm.audio_content_id,
    moduleForm.content_url,
    moduleForm.module_type,
    showModuleDialog,
  ]);

  async function uploadAudioForModule(file: File, moduleId: string) {
    if (!token) {
      toast.error('Your session has expired. Please sign in again.');
      return null;
    }
    setAudioUploading(true);
    setAudioProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('moduleId', moduleId);
      formData.append('title', moduleForm.title.trim() || file.name.replace(/\.mp3$/i, ''));
      formData.append('audioLanguage', moduleForm.audio_language || 'en-US');

      const response = await authedFetch('/api/microlearning/audio-content/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      setAudioPreviewUrl(result.signed_url || '');
      setModuleForm((current) => ({
        ...current,
        content_url: result.audio_url || current.content_url,
        case_study_content: result.transcript_text || result.transcript || current.case_study_content,
        audio_content_id: result.audio_content_id || current.audio_content_id,
        audio_storage_path: result.storage_path || current.audio_storage_path,
        audio_transcript_provider: result.transcript_provider || current.audio_transcript_provider,
        audio_duration_seconds: result.duration_seconds || current.audio_duration_seconds,
        audio_summary_text: result.summary_text || current.audio_summary_text,
      }));

      toast.success('MP3 uploaded to Supabase and processed with Gemini.');
      if (result.transcript_text || result.transcript) {
        toast.info('Transcript stored for live captions.');
      }
      if (result.summary_text) {
        toast.info('Lesson summary saved for trainee navigation.');
      }

      void loadData();
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Audio upload and transcription failed.');
      return null;
    } finally {
      setAudioUploading(false);
      setAudioProcessing(false);
    }
  }

  async function saveCategory() {
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required.');
      return;
    }
    setSaving(true);
    try {
      const response = await authedFetch(
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
      const result = await response.json().catch(() => null);
      setShowCategoryDialog(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '' });
      await loadData();
      const status = typeof result?.status === 'string' ? result.status : '';
      toast.success(
        status === 'restored'
          ? 'Category restored in the database.'
          : editingCategory
            ? 'Category updated in the database.'
            : 'Category created and saved to the database.',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save category.');
    } finally {
      setSaving(false);
    }
  }

  async function saveModule() {
    const validationError = validateModuleForm(moduleForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      const response = await authedFetch(editingModule ? `/api/trainer/microlearning-modules/${editingModule.id}` : '/api/trainer/microlearning-modules', {
        method: editingModule ? 'PUT' : 'POST',
        body: JSON.stringify({
          title: moduleForm.title.trim(),
          description: moduleForm.description.trim() || null,
          category: moduleForm.feedback_category,
          module_type: moduleForm.module_type,
          duration_minutes: Number(moduleForm.duration_minutes),
          passing_score: Number(moduleForm.passing_score),
          skill_focus: moduleForm.skill_focus.trim() || null,
          content_url: moduleForm.content_url.trim() || null,
          difficulty: moduleForm.difficulty,
          topic_category_id: moduleForm.topic_category_id || null,
          content_data: buildContentData(moduleForm),
        }),
      });
      const result = await response.json();
      setShowModuleDialog(false);
      setEditingModule(null);
      setModuleForm(emptyModuleForm());
      await loadData();
      toast.success(
        result?.exercises_locked
          ? 'Module updated. Existing assignments kept their current exercises.'
          : editingModule
            ? 'Module updated in the database.'
            : 'Module created and saved to the database.',
      );

      if (!editingModule && result?.module?.id) {
        setSelectedModuleIds([result.module.id]);
        window.requestAnimationFrame(() => {
          assignmentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save module.');
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(moduleId: string, label: string) {
    const confirmed = window.confirm(
      `Warning: Deleting this module will remove it from all assigned branches and erase all trainee scores/progress. This cannot be undone.\n\nDelete "${label}" now?`,
    );
    if (!confirmed) {
      return;
    }
    try {
      if (!token) {
        throw new Error('Your trainer session has expired. Sign in again before deleting a module.');
      }

      const result = await deleteModuleAndDependencies(moduleId, token);
      setModules((current) => current.filter((module) => module.id !== moduleId));
      setSelectedModuleIds((current) => current.filter((selectedId) => selectedId !== moduleId));
      void loadData();
      toast.success(
        `${result.title} deleted. ${result.deleted_assignments} assignment row${result.deleted_assignments === 1 ? '' : 's'} and ${result.deleted_certificates} accomplishment row${result.deleted_certificates === 1 ? '' : 's'} were removed.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Delete failed. Rollback notice: refresh the workspace before retrying this module delete.',
      );
    }
  }

  function getLinkedModuleCount(categoryId: string) {
    return modules.filter((module) => module.topic_category_id === categoryId).length;
  }

  async function deleteCategory(category: TopicCategory) {
    const linkedModuleCount = getLinkedModuleCount(category.id);
    const confirmationMessage =
      linkedModuleCount > 0
        ? `Delete ${category.name}? ${linkedModuleCount} linked module${linkedModuleCount === 1 ? '' : 's'} will be moved to Uncategorized.`
        : `Delete ${category.name}?`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    try {
      const response = await authedFetch(`/api/trainer/microlearning-topic-categories/${category.id}`, {
        method: 'DELETE',
      });
      const result = await response.json().catch(() => null);
      await loadData();
      const reassignedModuleCount =
        typeof result?.reassigned_module_count === 'number' ? result.reassigned_module_count : linkedModuleCount;

      toast.success(
        reassignedModuleCount > 0
          ? `${category.name} deleted. ${reassignedModuleCount} linked module${reassignedModuleCount === 1 ? '' : 's'} moved to Uncategorized.`
          : `${category.name} deleted.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed.');
    }
  }

  async function assignModules() {
    if (!selectedModuleIds.length) {
      toast.error('Select at least one saved topic to assign.');
      return;
    }
    if (!assignmentBatchId) {
      toast.error('Select one trainer batch or wave to assign to.');
      return;
    }
    setSaving(true);
    try {
      const selectedBatch = batches.find((batch) => batch.id === assignmentBatchId) || null;
      const response = await authedFetch('/api/trainer/microlearning-assignments', {
        method: 'POST',
        body: JSON.stringify({
          module_ids: selectedModuleIds,
          batch_id: assignmentBatchId,
          due_date: assignmentDueDate ? `${assignmentDueDate}T23:59:59` : null,
        }),
      });
      const result = await response.json().catch(() => null);
      setSelectedModuleIds([]);
      setAssignmentDueDate('');
      await loadData();
      const assignedCount = typeof result?.assigned_count === 'number' ? result.assigned_count : 0;
      const skippedCount = typeof result?.skipped_count === 'number' ? result.skipped_count : 0;
      const batchLabel = formatBatchLabel(selectedBatch);

      toast.success(
        `${assignedCount} trainee assignment row${assignedCount === 1 ? '' : 's'} saved to the active database for ${batchLabel}.` +
          (skippedCount
            ? ` ${skippedCount} duplicate row${skippedCount === 1 ? '' : 's'} were skipped.`
            : ' Selected topics now appear in trainee Microlearning.'),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign the selected topics.');
    } finally {
      setSaving(false);
    }
  }

  function formatBatchWindow(batch: TrainerBatchSummary | null | undefined) {
    if (!batch) return '';
    const parts = [];
    if (batch.start_date) parts.push(`Start: ${new Date(batch.start_date).toLocaleDateString()}`);
    if (batch.end_date) parts.push(`End: ${new Date(batch.end_date).toLocaleDateString()}`);
    return parts.join(' - ');
  }

  function openAssignmentCenter(moduleIds?: string[]) {
    if (moduleIds?.length) {
      setSelectedModuleIds(Array.from(new Set(moduleIds)));
    }
    window.requestAnimationFrame(() => {
      assignmentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }


  const needsMediaAsset = ['video', 'infographic', 'case_study', 'audio'].includes(moduleForm.module_type);
  const mediaAssetLabel =
    moduleForm.module_type === 'video'
      ? 'Video or YouTube Link'
      : moduleForm.module_type === 'infographic'
        ? 'Infographic / Image Upload'
        : moduleForm.module_type === 'case_study'
          ? 'Audio Upload'
          : moduleForm.module_type === 'audio'
            ? 'Audio File (MP3)'
            : 'Supporting Asset';
  const mediaAssetDescription =
    moduleForm.module_type === 'video'
      ? 'Upload a trainer video to Supabase storage or paste a YouTube link trainees should review before the practice prompt.'
      : moduleForm.module_type === 'infographic'
        ? 'Upload the infographic or image trainees should review.'
        : moduleForm.module_type === 'case_study'
          ? 'Upload the audio file trainees should analyze with the transcript.'
          : moduleForm.module_type === 'audio'
            ? 'Upload the audio file with automatic transcription and TTS generation for accessibility.'
            : 'Upload a supporting media asset.';
  const mediaAssetAccept =
    moduleForm.module_type === 'video'
      ? 'video/*'
      : moduleForm.module_type === 'infographic'
        ? 'image/*'
        : moduleForm.module_type === 'case_study' || moduleForm.module_type === 'audio'
          ? 'audio/*'
          : undefined;
  const authoredItemCount =
    moduleForm.module_type === 'video'
      ? moduleForm.video_questions.length
      : moduleForm.module_type === 'quiz'
        ? moduleForm.quiz_questions.length
        : moduleForm.module_type === 'flashcard'
          ? moduleForm.flashcards.length
          : moduleForm.module_type === 'infographic'
            ? moduleForm.infographic_questions.length
            : moduleForm.case_study_questions.length;
  const authoredItemLabel =
    moduleForm.module_type === 'video'
      ? 'video questions'
      : moduleForm.module_type === 'quiz'
        ? 'quiz questions'
        : moduleForm.module_type === 'flashcard'
          ? 'flashcards'
          : moduleForm.module_type === 'infographic'
            ? 'knowledge checks'
            : moduleForm.module_type === 'audio'
              ? 'audio questions'
              : 'analysis questions';
  const selectedTopicName =
    categories.find((category) => category.id === moduleForm.topic_category_id)?.name || 'No topic selected';
  const selectedFeedbackCategoryName = formatLabel(moduleForm.feedback_category);
  const trainerVideoPreviewUrl = moduleForm.module_type === 'video' ? moduleForm.content_url.trim() : '';
  const trainerYouTubePreviewUrl = getTrainerYouTubeEmbedUrl(trainerVideoPreviewUrl);
  const trainerShowsDirectVideoPreview =
    Boolean(trainerVideoPreviewUrl) && !trainerYouTubePreviewUrl && isTrainerDirectVideoFile(trainerVideoPreviewUrl);
  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === assignmentBatchId) || null,
    [assignmentBatchId, batches],
  );
  const sortedModules = useMemo(
    () =>
      [...modules].sort((left, right) => {
        const leftTopic = left.topic_category_name || 'Uncategorized';
        const rightTopic = right.topic_category_name || 'Uncategorized';
        return leftTopic.localeCompare(rightTopic) || left.title.localeCompare(right.title);
      }),
    [modules],
  );
  const selectedAssignmentModules = useMemo(
    () => modules.filter((module) => selectedModuleIds.includes(module.id)),
    [modules, selectedModuleIds],
  );
  const audioModuleCount = useMemo(
    () => modules.filter((module) => module.module_type === 'audio').length,
    [modules],
  );
  const transcribedAudioModuleCount = useMemo(
    () =>
      modules.filter((module) =>
        module.module_type === 'audio'
        && Boolean(
          module.audio_transcript
          || module.content_data?.transcript_text
          || module.content_data?.transcript
          || module.content_data?.captions_text,
        ),
      ).length,
    [modules],
  );
  const assignmentRowEstimate = (selectedBatch?.users_count || 0) * selectedAssignmentModules.length;

  if (isAuthLoading || loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Loading microlearning studio...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Microlearning Studio</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trainer microlearning authoring, assignment, progress, reporting, and audio lesson processing.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openAssignmentCenter()} disabled={!modules.length}>
            Assign Topics
          </Button>
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
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Assignments</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{report?.summary.assignment_count || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Audio Modules</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{audioModuleCount}</div><p className="mt-1 text-xs text-muted-foreground">{transcribedAudioModuleCount} with transcript + summary</p></CardContent></Card>
      </div>

      <div ref={categorySectionRef}>
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
        <CardContent className={categories.length ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' : ''}>
          {categories.length ? categories.map((category) => {
            const linkedModuleCount = getLinkedModuleCount(category.id);

            return (
              <div key={category.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{category.name}</div>
                    <div className="text-xs text-muted-foreground">{category.slug}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {linkedModuleCount} linked module{linkedModuleCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingCategory(category); setCategoryForm({ name: category.name, description: category.description || '' }); setShowCategoryDialog(true); }}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void deleteCategory(category)}>
                      <Trash2 className="size-4 text-rose-600" />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{category.description || 'No description yet.'}</p>
              </div>
            );
          }) : (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              No trainer-owned categories yet. Create your first category to organize the modules you will build.
            </div>
          )}
        </CardContent>
        </Card>
      </div>

      <div ref={librarySectionRef}>
        <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Saved Microlearning Topics</CardTitle>
            <CardDescription>Create and edit saved microlearning topics, then deliver them to a batch or wave from the assignment panel below.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {modules.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>Category</TableHead>
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
                    <TableCell>
                      <div>{module.assignment_count}</div>
                      {module.module_type === 'audio' ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {module.audio_transcript || module.content_data?.transcript_text || module.content_data?.transcript
                            ? 'Transcript ready'
                            : 'Awaiting MP3 processing'}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingModule(module); setModuleForm(moduleToForm(module)); setShowModuleDialog(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void removeItem(module.id, module.title)}>
                        <Trash2 className="size-4 text-rose-600" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openAssignmentCenter([module.id])}>
                        Assign to Batch
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              No trainer-owned topics yet. Create a topic after adding a category, then assign it when you are ready.
            </div>
          )}
        </CardContent>
        </Card>
      </div>

      <div ref={assignmentSectionRef}>
        <Card>
          <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle>Assign Topic to Batch / Wave</CardTitle>
              <CardDescription>
                Select one trainer batch or wave, then choose the saved microlearning topics you want to deliver.
                Every selected topic is saved as a trainee assignment row in the active Supabase-backed database,
                appears in trainee Microlearning, and can later unlock results plus certificates after completion.
              </CardDescription>
            </div>
            <Badge variant="outline">{assignmentRowEstimate} trainee row(s) ready</Badge>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Trainer Batch / Wave</Label>
                <Select
                  value={assignmentBatchId || NONE_VALUE}
                  onValueChange={(value) => setAssignmentBatchId(value === NONE_VALUE ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select one trainer batch or wave" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Select batch / wave</SelectItem>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {formatBatchLabel(batch)}
                        {batch.lob ? ` | ${batch.lob}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={assignmentDueDate}
                  onChange={(event) => setAssignmentDueDate(event.target.value)}
                />
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4 text-sm">
                <div className="font-medium text-foreground">Delivery Preview</div>
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <p>Batch / Wave: {formatBatchLabel(selectedBatch)}</p>
                  <p>Trainees in target: {selectedBatch?.users_count || 0}</p>
                  <p>Saved topics selected: {selectedAssignmentModules.length}</p>
                  <p>Trainee assignment rows to save: {assignmentRowEstimate}</p>
                  {selectedBatch?.lob ? <p>LOB: {selectedBatch.lob}</p> : null}
                  {formatBatchWindow(selectedBatch) ? <p>{formatBatchWindow(selectedBatch)}</p> : null}
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => void assignModules()}
                disabled={saving || !batches.length || !modules.length}
              >
                {saving ? 'Saving trainee assignment rows...' : 'Save Topic Delivery'}
              </Button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Choose Saved Topics</div>
                  <div className="text-sm text-muted-foreground">
                    Pick one or more trainer-saved microlearning topics to create trainee delivery rows.
                  </div>
                </div>
                {selectedModuleIds.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedModuleIds([])}>
                    Clear Selection
                  </Button>
                ) : null}
              </div>

              <div className="max-h-[440px] space-y-3 overflow-y-auto rounded-2xl border p-3">
                {sortedModules.length ? sortedModules.map((module) => {
                  const isSelected = selectedModuleIds.includes(module.id);

                  return (
                    <label
                      key={module.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={isSelected}
                        onChange={(event) =>
                          setSelectedModuleIds((current) =>
                            event.target.checked
                              ? Array.from(new Set([...current, module.id]))
                              : current.filter((moduleId) => moduleId !== module.id),
                          )
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{module.title}</div>
                          <Badge className={CATEGORY_STYLES[module.category]}>{formatLabel(module.category)}</Badge>
                          <Badge variant="outline">{formatLabel(module.module_type)}</Badge>
                          <Badge variant="outline">{module.passing_score}% passing</Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {module.topic_category_name || 'Uncategorized'} | {module.duration_minutes} minutes |{' '}
                          {module.assignment_count} existing assignment row{module.assignment_count === 1 ? '' : 's'}
                        </div>
                        {module.description ? (
                          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{module.description}</p>
                        ) : null}
                      </div>
                    </label>
                  );
                }) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    No saved topics are available yet. Create a topic first, then come back here to deliver it.
                  </div>
                )}
              </div>

              {selectedAssignmentModules.length ? (
                <div className="rounded-2xl border border-dashed p-4">
                  <div className="text-sm font-medium text-foreground">Selected Topic Summary</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedAssignmentModules.map((module) => (
                      <Badge key={module.id} variant="outline">
                        {module.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div ref={reportingSectionRef} className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Batch Progress</CardTitle>
            <CardDescription>Microlearning completion and performance by batch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(report?.batch_progress || []).map((row) => (
              <div key={row.batch_id || row.batch_label} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{row.batch_label}</div>
                    <div className="text-xs text-muted-foreground">{row.trainee_count} trainees | {row.assignment_count} assignments | Avg {Number(row.average_score || 0).toFixed(1)}%</div>
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
                  <Badge className={row.completed_count ? STATUS_STYLES.completed : STATUS_STYLES.in_progress}>{row.completed_count} completed</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{row.completed_count}/{row.assignment_count} completed | Avg {Number(row.average_score || 0).toFixed(1)}% | Pass rate {Number(row.pass_rate || 0).toFixed(1)}%</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

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

      <Dialog open={showModuleDialog} onOpenChange={setShowModuleDialog}>
        <DialogContent className="flex h-[95vh] min-h-0 w-[96vw] !max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:h-[93vh] sm:!max-w-[90vw] md:!max-w-[84vw] lg:!max-w-[78vw] xl:!max-w-[70vw] 2xl:!max-w-[60vw]">
          <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-7">
            <DialogTitle className="text-2xl sm:text-[1.65rem]">{editingModule ? 'Edit Module' : 'Create Module'}</DialogTitle>
            <DialogDescription className="max-w-4xl text-sm leading-6 sm:text-base">
              Modules created here are saved through the backend into the active database, including Supabase-backed setups.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col gap-6 px-4 py-4 text-sm leading-6 sm:px-7 sm:py-6 sm:text-base">
              <div className="grid gap-6">
                <div className="min-w-0 space-y-6">
                  <div className="rounded-2xl border p-5 sm:p-6">
                    <div className="mb-4">
                      <div className="text-lg font-semibold">Module Basics</div>
                      <div className="text-sm leading-6 text-muted-foreground">
                        Create a trainer-owned module from scratch by defining the title, objective, and learner-facing content.
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="module-title">Title</Label>
                        <Input
                          id="module-title"
                          value={moduleForm.title}
                          onChange={(event) => setModuleForm((current) => ({ ...current, title: event.target.value }))}
                          placeholder="Ex. HEARD de-escalation practice"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="module-skill-focus">Skill Focus</Label>
                        <Input
                          id="module-skill-focus"
                          value={moduleForm.skill_focus}
                          onChange={(event) => setModuleForm((current) => ({ ...current, skill_focus: event.target.value }))}
                          placeholder="Ex. Empathy and calm issue resolution"
                        />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <Label htmlFor="module-description">Description</Label>
                      <Textarea
                        id="module-description"
                        rows={4}
                        value={moduleForm.description}
                        onChange={(event) => setModuleForm((current) => ({ ...current, description: event.target.value }))}
                        placeholder="Briefly explain what the trainee will learn and how success should look."
                      />
                    </div>
                  </div>
                </div>

                <div className="min-w-0 space-y-6">
                  <div className="rounded-2xl border p-5 sm:p-6">
                    <div className="mb-4">
                      <div className="text-lg font-semibold">Module Settings</div>
                      <div className="text-sm leading-6 text-muted-foreground">
                        These settings control the module type, scoring, and reporting group.
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Module Format</Label>
                        <Select
                          value={moduleForm.module_type}
                          onValueChange={(value) =>
                            setModuleForm((current) => ({
                              ...current,
                              module_type: value as ModuleFormState['module_type'],
                            }))
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="video">Video</SelectItem>
                            <SelectItem value="quiz">Quiz</SelectItem>
                            <SelectItem value="flashcard">Flashcard</SelectItem>
                            <SelectItem value="infographic">Infographic</SelectItem>
                            <SelectItem value="audio">Audio Lesson</SelectItem>
                            {moduleForm.module_type === 'case_study' ? (
                              <SelectItem value="case_study">Legacy Case Study</SelectItem>
                            ) : null}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Feedback Category</Label>
                        <Select value={moduleForm.feedback_category} onValueChange={(value) => setModuleForm((current) => ({ ...current, feedback_category: value as 'pronunciation' | 'fluency' | 'grammar' | 'empathy' | 'clarity' }))}>
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
                      <div className="space-y-2">
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
                      <div className="space-y-2">
                        <Label htmlFor="module-duration">Minutes</Label>
                        <Input
                          id="module-duration"
                          type="number"
                          min={1}
                          value={moduleForm.duration_minutes}
                          onChange={(event) => setModuleForm((current) => ({ ...current, duration_minutes: Number(event.target.value || 0) }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="module-passing-score">Passing Score</Label>
                        <Input
                          id="module-passing-score"
                          type="number"
                          min={0}
                          max={100}
                          value={moduleForm.passing_score}
                          onChange={(event) => setModuleForm((current) => ({ ...current, passing_score: Number(event.target.value || 0) }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Topic Category</Label>
                        <Select value={moduleForm.topic_category_id || NONE_VALUE} onValueChange={(value) => setModuleForm((current) => ({ ...current, topic_category_id: value === NONE_VALUE ? '' : value }))}>
                          <SelectTrigger><SelectValue placeholder="Optional topic" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>None</SelectItem>
                            {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-slate-50 p-5 sm:p-6">
                    <div className="text-lg font-semibold">Quick Overview</div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <div className="rounded-xl border bg-white p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Module Type</div>
                        <div className="mt-1 font-medium">{formatLabel(moduleForm.module_type)}</div>
                      </div>
                      <div className="rounded-xl border bg-white p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Feedback Category</div>
                        <div className="mt-1 font-medium">{selectedFeedbackCategoryName}</div>
                      </div>
                      <div className="rounded-xl border bg-white p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Topic</div>
                        <div className="mt-1 font-medium">{selectedTopicName}</div>
                      </div>
                      <div className="rounded-xl border bg-white p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Authoring Progress</div>
                        <div className="mt-1 font-medium">{authoredItemCount} {authoredItemLabel}</div>
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-muted-foreground">
                      Recommended flow: choose a template, set the scoring, attach media if needed, then add the learner-facing questions.
                    </div>
                  </div>
                </div>
              </div>

              {needsMediaAsset ? (
                <div className="rounded-2xl border bg-slate-50 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="font-medium">{mediaAssetLabel}</div>
                      <div className="text-sm text-muted-foreground">{mediaAssetDescription}</div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium">
                      <Upload className="size-4" />
                      {uploading ? 'Uploading...' : 'Upload'}
                      <input type="file" accept={mediaAssetAccept} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file); event.currentTarget.value = ''; }} />
                    </label>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="module-content-url">{mediaAssetLabel}</Label>
                    <Input
                      id="module-content-url"
                      value={moduleForm.content_url}
                      onChange={(event) =>
                        setModuleForm((current) => {
                          const nextUrl = event.target.value;
                          const didChangeStoredAsset = nextUrl.trim() !== (current.content_url || '').trim();
                          return {
                            ...current,
                            content_url: nextUrl,
                            asset_record_id: didChangeStoredAsset ? '' : current.asset_record_id,
                            asset_storage_path: didChangeStoredAsset ? '' : current.asset_storage_path,
                            asset_bucket_name: didChangeStoredAsset ? '' : current.asset_bucket_name,
                            asset_content_type: didChangeStoredAsset ? '' : current.asset_content_type,
                            asset_signed_url_required: didChangeStoredAsset ? false : current.asset_signed_url_required,
                          };
                        })
                      }
                      placeholder="https://youtube.com/... or a Supabase-hosted asset URL"
                    />
                  </div>
                  {moduleForm.module_type === 'video' && trainerVideoPreviewUrl ? (
                    <div className="mt-4 rounded-xl border bg-white p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Trainer Preview</div>
                      {trainerYouTubePreviewUrl ? (
                        <div className="mt-3 overflow-hidden rounded-lg border">
                          <div className="aspect-video bg-slate-100">
                            <iframe
                              className="h-full w-full"
                              src={trainerYouTubePreviewUrl}
                              title={moduleForm.title || 'Video preview'}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      ) : trainerShowsDirectVideoPreview ? (
                        <video controls className="mt-3 w-full rounded-lg border" src={trainerVideoPreviewUrl} />
                      ) : (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                          External lesson reference saved. Trainees will open the same link from their microlearning workspace.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Audio Module Section - Upload audio with automatic transcription */}
              {(moduleForm.module_type === 'case_study' || moduleForm.module_type === 'audio') && (
                <div className="rounded-2xl border bg-slate-50 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="font-medium">
                        {moduleForm.module_type === 'audio' ? 'Microlearning Audio Module' : 'Audio Case Study'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Upload an `.mp3` lesson. The system will automatically:
                        <ul className="mt-2 list-inside list-disc space-y-1">
                          <li>Upload the file to the private Supabase `audio-modules` bucket</li>
                          <li>Send the audio to Gemini for a live-caption transcript and concise summary</li>
                          <li>Store the transcript, summary, and file metadata in `audio_content`</li>
                        </ul>
                      </div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium">
                      <Upload className="size-4" />
                      {audioUploading ? 'Uploading & Transcribing...' : audioProcessing ? 'Processing...' : 'Upload MP3'}
                      <input 
                        type="file" 
                        accept=".mp3,audio/mpeg" 
                        className="hidden" 
                        disabled={audioUploading || audioProcessing}
                        onChange={async (event) => { 
                          const file = event.target.files?.[0]; 
                          if (file) {
                            // First save the module to get an ID, then upload audio
                            const moduleId = editingModule?.id;
                            if (!moduleId) {
                              toast.error('Please save the module first, then upload audio.');
                              return;
                            }
                            await uploadAudioForModule(file, moduleId);
                          }
                          event.currentTarget.value = ''; 
                        }} 
                      />
                    </label>
                  </div>
                  
                  {/* Audio Processing Status */}
                  {(audioUploading || audioProcessing) && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                      <Loader2 className="size-4 animate-spin" />
                      <span>Processing audio: uploading to Supabase and generating the Gemini transcript + summary...</span>
                    </div>
                  )}
                  
                  {/* Audio Preview and Controls */}
                  {moduleForm.content_url && (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-lg border bg-white p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Audio Preview</div>
                        <audio controls className="mt-2 w-full" src={audioPreviewUrl || moduleForm.content_url} />
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={async () => {
                            const moduleId = editingModule?.id;
                            if (!moduleId) {
                              toast.error('Please save the module first.');
                              return;
                            }
                            try {
                              await fetchAudioPreviewUrl(moduleId);
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : 'Unable to refresh the signed preview URL.');
                            }
                          }}
                          disabled={audioProcessing || audioPreviewLoading}
                        >
                          <RefreshCw className="mr-2 size-4" />
                          {audioPreviewLoading ? 'Refreshing Preview...' : 'Refresh Preview URL'}
                        </Button>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-3">
                        <div className="rounded-lg border bg-white p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Transcript / Caption Text</div>
                          <div className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">
                            {moduleForm.case_study_content || 'Upload audio or regenerate transcript to populate the caption text.'}
                          </div>
                        </div>
                        <div className="rounded-lg border bg-white p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">AI Lesson Summary</div>
                          <div className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">
                            {moduleForm.audio_summary_text || 'Gemini will save a concise learner summary after the MP3 finishes processing.'}
                          </div>
                        </div>
                        <div className="rounded-lg border bg-white p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Audio Metadata</div>
                          <div className="mt-2 space-y-1 text-sm text-slate-600">
                            <div>Audio Content ID: {moduleForm.audio_content_id || 'Pending'}</div>
                            <div>Storage Path: {moduleForm.audio_storage_path || 'Pending'}</div>
                            <div>Language: {moduleForm.audio_language || 'en-US'}</div>
                            <div>Duration: {moduleForm.audio_duration_seconds ? `${moduleForm.audio_duration_seconds}s` : 'Pending'}</div>
                            <div>Transcript Provider: {moduleForm.audio_transcript_provider || 'Gemini (pending)'}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                        <strong>Note:</strong> After saving the module, upload the MP3 once. Trainee playback will request a signed Supabase URL on demand and use the stored transcript for simulated live captions plus the saved summary for lesson navigation.
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* Dynamic Content Based on Category */}
            {moduleForm.module_type === 'video' && (
              <div className="rounded-2xl border p-5 space-y-4">
                <div>
                  <div className="font-medium">Video Content</div>
                  <div className="text-sm text-muted-foreground">Add guided questions so trainees can answer after reviewing the video lesson.</div>
                </div>
                
                <div className="space-y-4">
                  {moduleForm.video_questions.map((question, index) => (
                    <div key={index} className="rounded-lg border p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>Question Type</Label>
                          <Select
                            value={question.type}
                            onValueChange={(value: 'open_ended' | 'multiple_choice') => {
                              const newQuestions = [...moduleForm.video_questions];
                              newQuestions[index].type = value;
                              setModuleForm(current => ({ ...current, video_questions: newQuestions }));
                            }}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open_ended">Open-Ended</SelectItem>
                              <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={question.stt_enabled}
                            onCheckedChange={(checked) => {
                              const newQuestions = [...moduleForm.video_questions];
                              newQuestions[index].stt_enabled = checked;
                              setModuleForm(current => ({ ...current, video_questions: newQuestions }));
                            }}
                          />
                          <Label>Enable STT</Label>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Label>Question</Label>
                        <Textarea
                          value={question.question}
                          onChange={(e) => {
                            const newQuestions = [...moduleForm.video_questions];
                            newQuestions[index].question = e.target.value;
                            setModuleForm(current => ({ ...current, video_questions: newQuestions }));
                          }}
                          placeholder="Enter question text"
                        />
                      </div>
                      {question.type === 'open_ended' && (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div>
                            <Label>Trainer Sample Answer</Label>
                            <Textarea
                              rows={4}
                              value={question.sample_answer || ''}
                              onChange={(e) => {
                                const newQuestions = [...moduleForm.video_questions];
                                newQuestions[index].sample_answer = e.target.value;
                                setModuleForm(current => ({ ...current, video_questions: newQuestions }));
                              }}
                              placeholder="Enter the model answer trainees will be compared against"
                            />
                          </div>
                          <div>
                            <Label>Key Phrases (optional)</Label>
                            <Textarea
                              rows={4}
                              value={question.required_keywords || ''}
                              onChange={(e) => {
                                const newQuestions = [...moduleForm.video_questions];
                                newQuestions[index].required_keywords = e.target.value;
                                setModuleForm(current => ({ ...current, video_questions: newQuestions }));
                              }}
                              placeholder="Comma or new-line separated phrases to reward"
                            />
                            <p className="mt-2 text-xs text-muted-foreground">
                              {splitToList(question.required_keywords || '').length} phrase(s) configured for auto-analysis.
                            </p>
                          </div>
                        </div>
                      )}
                      {question.type === 'multiple_choice' && (
                        <div className="mt-4 space-y-2">
                          <Label>Options</Label>
                          {question.options?.map((option, optIndex) => (
                            <div key={optIndex} className="flex gap-2">
                              <Input
                                value={option}
                                onChange={(e) => {
                                  const newQuestions = [...moduleForm.video_questions];
                                  if (newQuestions[index].options) {
                                    newQuestions[index].options![optIndex] = e.target.value;
                                  }
                                  setModuleForm(current => ({ ...current, video_questions: newQuestions }));
                                }}
                                placeholder={`Option ${optIndex + 1}`}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newQuestions = [...moduleForm.video_questions];
                                  if (newQuestions[index].options) {
                                    newQuestions[index].options = newQuestions[index].options.filter((_, i) => i !== optIndex);
                                  }
                                  setModuleForm(current => ({ ...current, video_questions: newQuestions }));
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newQuestions = [...moduleForm.video_questions];
                              if (!newQuestions[index].options) newQuestions[index].options = [];
                              newQuestions[index].options!.push('');
                              setModuleForm(current => ({ ...current, video_questions: newQuestions }));
                            }}
                          >
                            Add Option
                          </Button>
                          <div className="mt-2">
                            <Label>Correct Option</Label>
                            {(() => {
                              const selectableOptions = getSelectableOptionEntries(question.options);

                              return (
                            <Select
                              value={getSelectedOptionIndexValue(question.options, question.correct_option ?? '')}
                              onValueChange={(value) => {
                                const newQuestions = [...moduleForm.video_questions];
                                const selectedIndex = Number.parseInt(value, 10);
                                newQuestions[index].correct_option =
                                  Number.isNaN(selectedIndex)
                                    ? ''
                                    : newQuestions[index].options?.[selectedIndex] || '';
                                setModuleForm(current => ({ ...current, video_questions: newQuestions }));
                              }}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {selectableOptions.length ? (
                                  selectableOptions.map((option) => (
                                    <SelectItem key={`${option.index}-${option.label}`} value={String(option.index)}>
                                      {option.raw}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                    Type at least one non-empty option first.
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          const newQuestions = moduleForm.video_questions.filter((_, i) => i !== index);
                          setModuleForm(current => ({ ...current, video_questions: newQuestions }));
                        }}
                      >
                        Remove Question
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setModuleForm(current => ({
                      ...current,
                      video_questions: [
                        ...current.video_questions,
                        {
                          question: '',
                          type: 'open_ended',
                          stt_enabled: false,
                          options: [],
                          correct_option: '',
                          sample_answer: '',
                          required_keywords: '',
                        }
                      ]
                    }))}
                  >
                    <Plus className="size-4 mr-2" />
                    Add Question
                  </Button>
                </div>
              </div>
            )}

            {moduleForm.module_type === 'quiz' && (
              <div className="rounded-2xl border p-5 space-y-4">
                <div>
                  <div className="font-medium">Quiz Content</div>
                  <div className="text-sm text-muted-foreground">Create multiple-choice checks and mark the correct answer for reporting.</div>
                </div>
                
                <div className="space-y-4">
                  {moduleForm.quiz_questions.map((question, index) => (
                    <div key={index} className="rounded-lg border p-4">
                      <div className="mb-4">
                        <Label>Question {index + 1}</Label>
                        <Textarea
                          value={question.question}
                          onChange={(e) => {
                            const newQuestions = [...moduleForm.quiz_questions];
                            newQuestions[index].question = e.target.value;
                            setModuleForm(current => ({ ...current, quiz_questions: newQuestions }));
                          }}
                          placeholder="Enter question text"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Options</Label>
                        {question.options.map((option, optIndex) => (
                          <div key={optIndex} className="flex gap-2">
                            <Input
                              value={option}
                              onChange={(e) => {
                                const newQuestions = [...moduleForm.quiz_questions];
                                newQuestions[index].options[optIndex] = e.target.value;
                                setModuleForm(current => ({ ...current, quiz_questions: newQuestions }));
                              }}
                              placeholder={`Option ${String.fromCharCode(65 + optIndex)}`}
                            />
                            <RadioGroup
                              value={question.correct_option === option ? 'correct' : ''}
                              onValueChange={(value) => {
                                if (value === 'correct') {
                                  const newQuestions = [...moduleForm.quiz_questions];
                                  newQuestions[index].correct_option = option;
                                  setModuleForm(current => ({ ...current, quiz_questions: newQuestions }));
                                }
                              }}
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="correct" id={`correct-${index}-${optIndex}`} />
                                <Label htmlFor={`correct-${index}-${optIndex}`}>Correct</Label>
                              </div>
                            </RadioGroup>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          const newQuestions = moduleForm.quiz_questions.filter((_, i) => i !== index);
                          setModuleForm(current => ({ ...current, quiz_questions: newQuestions }));
                        }}
                      >
                        Remove Question
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setModuleForm(current => ({
                      ...current,
                      quiz_questions: [
                        ...current.quiz_questions,
                        { question: '', options: ['', '', '', ''], correct_option: '' }
                      ]
                    }))}
                  >
                    <Plus className="size-4 mr-2" />
                    Add Question
                  </Button>
                </div>
              </div>
            )}

            {moduleForm.module_type === 'flashcard' && (
              <div className="rounded-2xl border p-5 space-y-4">
                <div>
                  <div className="font-medium">Flashcard Deck</div>
                  <div className="text-sm text-muted-foreground">Build a front-and-back review deck for quick memorization and drill practice.</div>
                </div>
                
                <div className="space-y-4">
                  {moduleForm.flashcards.map((card, index) => (
                    <div key={index} className="rounded-lg border p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>Front Side</Label>
                          <Textarea
                            value={card.front}
                            onChange={(e) => {
                              const newCards = [...moduleForm.flashcards];
                              newCards[index].front = e.target.value;
                              setModuleForm(current => ({ ...current, flashcards: newCards }));
                            }}
                            placeholder="Question or term"
                          />
                        </div>
                        <div>
                          <Label>Back Side</Label>
                          <Textarea
                            value={card.back}
                            onChange={(e) => {
                              const newCards = [...moduleForm.flashcards];
                              newCards[index].back = e.target.value;
                              setModuleForm(current => ({ ...current, flashcards: newCards }));
                            }}
                            placeholder="Answer or explanation"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          const newCards = moduleForm.flashcards.filter((_, i) => i !== index);
                          setModuleForm(current => ({ ...current, flashcards: newCards }));
                        }}
                      >
                        Remove Card
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setModuleForm(current => ({
                      ...current,
                      flashcards: [
                        ...current.flashcards,
                        { front: '', back: '' }
                      ]
                    }))}
                  >
                    <Plus className="size-4 mr-2" />
                    Add Card
                  </Button>
                </div>
              </div>
            )}

            {moduleForm.module_type === 'infographic' && (
              <div className="rounded-2xl border p-5 space-y-4">
                <div>
                  <div className="font-medium">Infographic Content</div>
                  <div className="text-sm text-muted-foreground">Pair the visual asset with short knowledge checks so trainees confirm what they noticed.</div>
                </div>
                
                <div className="space-y-4">
                  {moduleForm.infographic_questions.map((question, index) => (
                    <div key={index} className="rounded-lg border p-4">
                      <div className="mb-4">
                        <Label>Question {index + 1}</Label>
                        <Textarea
                          value={question.question}
                          onChange={(e) => {
                            const newQuestions = [...moduleForm.infographic_questions];
                            newQuestions[index].question = e.target.value;
                            setModuleForm(current => ({ ...current, infographic_questions: newQuestions }));
                          }}
                          placeholder="Enter question text"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Options</Label>
                        {question.options.map((option, optIndex) => (
                          <div key={optIndex} className="flex gap-2">
                            <Input
                              value={option}
                              onChange={(e) => {
                                const newQuestions = [...moduleForm.infographic_questions];
                                newQuestions[index].options[optIndex] = e.target.value;
                                setModuleForm(current => ({ ...current, infographic_questions: newQuestions }));
                              }}
                              placeholder={`Option ${String.fromCharCode(65 + optIndex)}`}
                            />
                            <RadioGroup
                              value={question.correct_option === option ? 'correct' : ''}
                              onValueChange={(value) => {
                                if (value === 'correct') {
                                  const newQuestions = [...moduleForm.infographic_questions];
                                  newQuestions[index].correct_option = option;
                                  setModuleForm(current => ({ ...current, infographic_questions: newQuestions }));
                                }
                              }}
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="correct" id={`infographic-correct-${index}-${optIndex}`} />
                                <Label htmlFor={`infographic-correct-${index}-${optIndex}`}>Correct</Label>
                              </div>
                            </RadioGroup>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          const newQuestions = moduleForm.infographic_questions.filter((_, i) => i !== index);
                          setModuleForm(current => ({ ...current, infographic_questions: newQuestions }));
                        }}
                      >
                        Remove Question
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setModuleForm(current => ({
                      ...current,
                      infographic_questions: [
                        ...current.infographic_questions,
                        { question: '', type: 'multiple_choice', options: ['', '', '', ''], correct_option: '' }
                      ]
                    }))}
                  >
                    <Plus className="size-4 mr-2" />
                    Add Knowledge Check
                  </Button>
                </div>
              </div>
            )}

            {(moduleForm.module_type === 'case_study' || moduleForm.module_type === 'audio') && (
              <div className="rounded-2xl border p-5 space-y-4">
                <div>
                  <div className="font-medium">
                    {moduleForm.module_type === 'audio' ? 'Audio Lesson Questions' : 'Case Study Content'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {moduleForm.module_type === 'audio'
                      ? 'Use the auto-generated transcript as caption text, then add listening questions trainees must answer after replaying the audio.'
                      : 'Describe the scenario clearly, then add analysis questions or spoken responses for practice.'}
                  </div>
                </div>
                
                <div>
                  <Label>{moduleForm.module_type === 'audio' ? 'Transcript / Caption Text' : 'Case Study Scenario'}</Label>
                  <Textarea
                    rows={6}
                    value={moduleForm.case_study_content}
                    onChange={(e) => setModuleForm(current => ({ ...current, case_study_content: e.target.value }))}
                    placeholder={
                      moduleForm.module_type === 'audio'
                        ? 'Transcript will appear here after audio upload, but you can edit it before saving.'
                        : 'Enter the case study scenario or story'
                    }
                  />
                </div>
                
                <div className="space-y-4">
                  {moduleForm.case_study_questions.map((question, index) => (
                    <div key={index} className="rounded-lg border p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>Question Type</Label>
                          <Select
                            value={question.type}
                            onValueChange={(value: 'open_ended' | 'multiple_choice') => {
                              const newQuestions = [...moduleForm.case_study_questions];
                              newQuestions[index].type = value;
                              setModuleForm(current => ({ ...current, case_study_questions: newQuestions }));
                            }}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open_ended">Open-Ended</SelectItem>
                              <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={question.stt_enabled}
                            onCheckedChange={(checked) => {
                              const newQuestions = [...moduleForm.case_study_questions];
                              newQuestions[index].stt_enabled = checked;
                              setModuleForm(current => ({ ...current, case_study_questions: newQuestions }));
                            }}
                          />
                          <Label>Enable Speech-to-Text</Label>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Label>Question</Label>
                        <Textarea
                          value={question.question}
                          onChange={(e) => {
                            const newQuestions = [...moduleForm.case_study_questions];
                            newQuestions[index].question = e.target.value;
                            setModuleForm(current => ({ ...current, case_study_questions: newQuestions }));
                          }}
                          placeholder="Enter analysis question"
                        />
                      </div>
                      {question.type === 'open_ended' && (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div>
                            <Label>Trainer Sample Answer</Label>
                            <Textarea
                              rows={4}
                              value={question.sample_answer || ''}
                              onChange={(e) => {
                                const newQuestions = [...moduleForm.case_study_questions];
                                newQuestions[index].sample_answer = e.target.value;
                                setModuleForm(current => ({ ...current, case_study_questions: newQuestions }));
                              }}
                              placeholder="Enter the model answer trainees should be measured against"
                            />
                          </div>
                          <div>
                            <Label>Key Phrases (optional)</Label>
                            <Textarea
                              rows={4}
                              value={question.required_keywords || ''}
                              onChange={(e) => {
                                const newQuestions = [...moduleForm.case_study_questions];
                                newQuestions[index].required_keywords = e.target.value;
                                setModuleForm(current => ({ ...current, case_study_questions: newQuestions }));
                              }}
                              placeholder="Comma or new-line separated phrases to reward"
                            />
                            <p className="mt-2 text-xs text-muted-foreground">
                              {splitToList(question.required_keywords || '').length} phrase(s) configured for auto-analysis.
                            </p>
                          </div>
                        </div>
                      )}
                      {question.type === 'multiple_choice' && (
                        <div className="mt-4 space-y-2">
                          <Label>Options</Label>
                          {question.options?.map((option, optIndex) => (
                            <div key={optIndex} className="flex gap-2">
                              <Input
                                value={option}
                                onChange={(e) => {
                                  const newQuestions = [...moduleForm.case_study_questions];
                                  if (newQuestions[index].options) {
                                    newQuestions[index].options![optIndex] = e.target.value;
                                  }
                                  setModuleForm(current => ({ ...current, case_study_questions: newQuestions }));
                                }}
                                placeholder={`Option ${optIndex + 1}`}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newQuestions = [...moduleForm.case_study_questions];
                                  if (newQuestions[index].options) {
                                    newQuestions[index].options = newQuestions[index].options.filter((_, i) => i !== optIndex);
                                  }
                                  setModuleForm(current => ({ ...current, case_study_questions: newQuestions }));
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newQuestions = [...moduleForm.case_study_questions];
                              if (!newQuestions[index].options) newQuestions[index].options = [];
                              newQuestions[index].options!.push('');
                              setModuleForm(current => ({ ...current, case_study_questions: newQuestions }));
                            }}
                          >
                            Add Option
                          </Button>
                          <div className="mt-2">
                            <Label>Correct Option</Label>
                            {(() => {
                              const selectableOptions = getSelectableOptionEntries(question.options);

                              return (
                            <Select
                              value={getSelectedOptionIndexValue(question.options, question.correct_option ?? '')}
                              onValueChange={(value) => {
                                const newQuestions = [...moduleForm.case_study_questions];
                                const selectedIndex = Number.parseInt(value, 10);
                                newQuestions[index].correct_option =
                                  Number.isNaN(selectedIndex)
                                    ? ''
                                    : newQuestions[index].options?.[selectedIndex] || '';
                                setModuleForm(current => ({ ...current, case_study_questions: newQuestions }));
                              }}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {selectableOptions.length ? (
                                  selectableOptions.map((option) => (
                                    <SelectItem key={`${option.index}-${option.label}`} value={String(option.index)}>
                                      {option.raw}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                    Type at least one non-empty option first.
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          const newQuestions = moduleForm.case_study_questions.filter((_, i) => i !== index);
                          setModuleForm(current => ({ ...current, case_study_questions: newQuestions }));
                        }}
                      >
                        Remove Question
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setModuleForm(current => ({
                      ...current,
                      case_study_questions: [
                        ...current.case_study_questions,
                        {
                          question: '',
                          type: 'open_ended',
                          stt_enabled: false,
                          options: [],
                          correct_option: '',
                          sample_answer: '',
                          required_keywords: '',
                        }
                      ]
                    }))}
                  >
                    <Plus className="size-4 mr-2" />
                    {moduleForm.module_type === 'audio' ? 'Add Listening Question' : 'Add Analysis Question'}
                  </Button>
                </div>
              </div>
            )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-4 py-4 sm:px-6">
            <Button variant="outline" onClick={() => setShowModuleDialog(false)}>Cancel</Button>
            <Button onClick={() => void saveModule()} disabled={saving}>{saving ? 'Saving...' : 'Save Module'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
