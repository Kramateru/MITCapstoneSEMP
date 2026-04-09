'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Separator } from '@/app/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Textarea } from '@/app/components/ui/textarea';
import { trainerSidebarItems } from '@/app/trainer/nav';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileBadge2,
  Headphones,
  Link2,
  Mic,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

interface Batch {
  id: string;
  name: string;
  wave_number?: number;
}

interface AssignedBatchSummary {
  batch_id: string;
  batch_name: string;
  wave_number?: number | null;
  assigned_at?: string | null;
  trainee_count: number;
  completed_sessions: number;
  passed_sessions: number;
  average_score: number;
  pass_rate: number;
  latest_completed_at?: string | null;
}

interface ScenarioVariation {
  actor_name: string;
  script: string;
  score: number;
  branching_logic?: string | null;
}

interface ScenarioStep {
  step_number: number;
  actor: string;
  speaker_label?: string | null;
  script: string;
  expected_keywords: string[];
  audio_url?: string | null;
}

interface Scenario {
  id: string;
  title: string;
  description?: string | null;
  opening_prompt: string;
  difficulty?: string | null;
  expected_keywords: string[];
  estimated_duration?: number | null;
  member_profile?: Record<string, unknown>;
  cxone_metadata?: Record<string, unknown>;
  sim_floor_config?: Record<string, unknown>;
  ringer_audio_url?: string | null;
  hold_audio_url?: string | null;
  variations_count: number;
  variations: ScenarioVariation[];
  steps_count: number;
  steps: ScenarioStep[];
  assigned_batches: AssignedBatchSummary[];
  member_count: number;
  completed_sessions: number;
  passed_sessions: number;
  average_score: number;
  pass_rate: number;
  latest_completed_at?: string | null;
}

interface KPIConfig {
  id?: string;
  speech_to_text_weight: number;
  aht_weight: number;
  rate_of_speech_weight: number;
  dead_air_weight: number;
  empathy_statements_weight: number;
  probing_questions_weight: number;
  grammar_weight: number;
  pronunciation_weight: number;
  pacing_weight: number;
  forbidden_words_penalty: number;
  passing_score: number;
  forbidden_words: string[];
  empathy_keywords: string[];
  probing_keywords: string[];
  target_aht_seconds: number;
  target_ros_words_per_min: number;
  target_dead_air_seconds: number;
}

interface InteractionSession {
  id: string;
  trainee_id?: string;
  trainee_name: string;
  scenario_title: string;
  score: number;
  pass_fail: boolean;
  attempt_number: number;
  audio_url?: string;
  transcript?: string;
  transcript_log?: Array<Record<string, unknown>>;
  turn_logs?: Array<Record<string, unknown>>;
  ai_feedback?: string;
  coaching_notes?: string;
  grammar_score?: number;
  pronunciation_score?: number;
  pacing_score?: number;
  sentiment_score?: number;
  keyword_compliance?: {
    score?: number;
    missing?: string[];
    items?: Array<{
      id: string;
      label: string;
      required_phrase: string;
      matched: boolean;
    }>;
  };
  speech_to_text_accuracy?: number;
  rate_of_speech?: number;
  dead_air_seconds?: number;
  trainer_verdict_status?: string;
  trainer_verdict_notes?: string;
  trainer_evaluated_at?: string;
  certificate_id?: string | null;
  coaching_id?: string | null;
  coaching_status?: string | null;
  coaching_acknowledged_at?: string | null;
  created_at?: string;
}

interface TranscriptTimelineEntry {
  actor: string;
  speaker_label?: string | null;
  step_number?: number;
  script?: string | null;
  transcript?: string | null;
  coach_note?: string | null;
  timeline_start_seconds?: number | null;
  timeline_end_seconds?: number | null;
}

interface ScenarioStepForm {
  actor: 'csr' | 'member';
  speaker_label: string;
  script: string;
  expected_keywords: string;
  audio_url: string;
}

interface ScenarioFormState {
  title: string;
  description: string;
  opening_prompt: string;
  expected_keywords: string;
  estimated_duration: string;
  member_name: string;
  member_id: string;
  plan_type: string;
  verification_status: string;
  problem_statement: string;
  ringer_audio_url: string;
  hold_audio_url: string;
  steps: ScenarioStepForm[];
}

interface AudioAssetUploadResponse {
  audio_url: string;
  asset_kind: string;
  filename: string;
  scenario_id: string;
}

const defaultKpiForm: KPIConfig = {
  speech_to_text_weight: 25,
  aht_weight: 20,
  rate_of_speech_weight: 15,
  dead_air_weight: 15,
  empathy_statements_weight: 10,
  probing_questions_weight: 10,
  grammar_weight: 2.5,
  pronunciation_weight: 1,
  pacing_weight: 1,
  forbidden_words_penalty: 5,
  passing_score: 90,
  forbidden_words: [],
  empathy_keywords: [],
  probing_keywords: [],
  target_aht_seconds: 120,
  target_ros_words_per_min: 150,
  target_dead_air_seconds: 3,
};

const createScenarioStep = (actor: 'csr' | 'member' = 'csr'): ScenarioStepForm => ({
  actor,
  speaker_label: actor === 'csr' ? 'CSR' : 'Member Actor',
  script: '',
  expected_keywords: '',
  audio_url: '',
});

const createDefaultScenarioForm = (): ScenarioFormState => ({
  title: '',
  description: '',
  opening_prompt: 'Thank you for calling Healthy Benefits Plus Member Support. This is [CSR Name]. How can I assist you today?',
  expected_keywords: 'thank you for calling, member id, verification',
  estimated_duration: '180',
  member_name: 'Calvin Smith',
  member_id: 'HBP-100245',
  plan_type: 'Healthy Benefits Plus',
  verification_status: 'Pending verification',
  problem_statement: 'Member wants help checking plan benefits and delivery status.',
  ringer_audio_url: '',
  hold_audio_url: '',
  steps: [createScenarioStep('csr'), createScenarioStep('member')],
});

const splitKeywords = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function formatDateTime(value?: string | null) {
  if (!value) return 'No attempts yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No attempts yet' : date.toLocaleString();
}

function formatClockTime(totalSeconds?: number | null) {
  const normalized = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(normalized / 60);
  const secs = normalized % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeVerdictStatus(value?: string | null) {
  const normalized = (value || '').toLowerCase();
  if (normalized === 'competent') return 'competent';
  if (normalized === 'retake') return 'retake';
  return 'pending';
}

function getVerdictLabel(value?: string | null) {
  const normalized = normalizeVerdictStatus(value);
  if (normalized === 'competent') return 'Competent';
  if (normalized === 'retake') return 'Needs Retake';
  return 'Pending Review';
}

function createScenarioFormFromScenario(scenario: Scenario): ScenarioFormState {
  const sourceSteps: ScenarioStepForm[] =
    scenario.steps?.length > 0
      ? scenario.steps.map((step) => ({
          actor: step.actor === 'csr' ? 'csr' : 'member',
          speaker_label: step.speaker_label || (step.actor === 'csr' ? 'CSR' : 'Member Actor'),
          script: step.script || '',
          expected_keywords: (step.expected_keywords || []).join(', '),
          audio_url: step.audio_url || '',
        }))
      : scenario.variations?.map((variation) => ({
          actor: 'csr' as const,
          speaker_label: variation.actor_name || 'CSR',
          script: variation.script || '',
          expected_keywords: '',
          audio_url: '',
        })) || [];

  return {
    title: scenario.title || '',
    description: scenario.description || '',
    opening_prompt: scenario.opening_prompt || '',
    expected_keywords: (scenario.expected_keywords || []).join(', '),
    estimated_duration: String(scenario.estimated_duration || 120),
    member_name: String(scenario.member_profile?.name || scenario.cxone_metadata?.member_name || 'Scenario Member'),
    member_id: String(scenario.member_profile?.member_id || scenario.cxone_metadata?.member_id || ''),
    plan_type: String(scenario.member_profile?.plan_type || ''),
    verification_status: String(scenario.member_profile?.verification_status || ''),
    problem_statement: String(
      scenario.member_profile?.problem_statement || scenario.cxone_metadata?.problem_statement || scenario.description || '',
    ),
    ringer_audio_url: scenario.ringer_audio_url || '',
    hold_audio_url: scenario.hold_audio_url || '',
    steps: sourceSteps.length > 0 ? sourceSteps : [createScenarioStep('csr'), createScenarioStep('member')],
  };
}

export default function TrainerSimFloorPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [libraryScenarios, setLibraryScenarios] = useState<Scenario[]>([]);
  const [interactions, setInteractions] = useState<InteractionSession[]>([]);
  const [kpiConfig, setKpiConfig] = useState<KPIConfig | null>(null);
  const [kpiForm, setKpiForm] = useState<KPIConfig>(defaultKpiForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showScenarioDialog, setShowScenarioDialog] = useState(false);
  const [showKpiDialog, setShowKpiDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showCoachingDialog, setShowCoachingDialog] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [scenarioForm, setScenarioForm] = useState<ScenarioFormState>(createDefaultScenarioForm());
  const [selectedInteraction, setSelectedInteraction] = useState<InteractionSession | null>(null);
  const [coachingNotes, setCoachingNotes] = useState('');
  const [verdictStatus, setVerdictStatus] = useState<'pending' | 'competent' | 'retake'>('pending');
  const [bulkTitle, setBulkTitle] = useState('');
  const [assignScenarioId, setAssignScenarioId] = useState('');
  const [assignBatchId, setAssignBatchId] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteScenarioId, setDeleteScenarioId] = useState<string | null>(null);
  const [deleteScenarioTitle, setDeleteScenarioTitle] = useState('');
  const [playbackTime, setPlaybackTime] = useState(0);
  const [uploadingAudioTarget, setUploadingAudioTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionAudioRef = useRef<HTMLAudioElement | null>(null);

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = localStorage.getItem('token');
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });
  }, []);

  const fetchBatches = useCallback(async () => {
    const response = await authedFetch('/api/trainer/batches');
    if (!response.ok) throw new Error('Unable to load batches');
    const data = await response.json();
    const nextBatches = data.batches || [];
    setBatches(nextBatches);
    if (nextBatches.length > 0) {
      setSelectedBatch((current) => current || nextBatches[0].id);
      setAssignBatchId((current) => current || nextBatches[0].id);
    }
  }, [authedFetch]);

  const fetchScenarioLibrary = useCallback(async () => {
    const response = await authedFetch('/api/sim-floor/scenarios');
    if (!response.ok) throw new Error('Unable to load the scenario library');
    setLibraryScenarios(await response.json());
  }, [authedFetch]);

  const fetchScenarios = useCallback(async (batchId: string) => {
    const response = await authedFetch(`/api/sim-floor/batch/${batchId}/scenarios`);
    if (!response.ok) throw new Error('Unable to load scenarios');
    setScenarios(await response.json());
  }, [authedFetch]);

  const fetchKpiConfig = useCallback(async (batchId: string) => {
    const response = await authedFetch(`/api/sim-floor/kpi-config/${batchId}`);
    if (response.status === 404) {
      setKpiConfig(null);
      setKpiForm(defaultKpiForm);
      return;
    }
    if (!response.ok) throw new Error('Unable to load KPI configuration');
    const data = await response.json();
    setKpiConfig(data);
    setKpiForm(data);
  }, [authedFetch]);

  const fetchInteractions = useCallback(async (batchId: string) => {
    const response = await authedFetch(`/api/sim-floor/coaching/interactions?batch_id=${batchId}&limit=20`);
    if (!response.ok) throw new Error('Unable to load interactions');
    const data = await response.json();
    setInteractions(data.sessions || []);
  }, [authedFetch]);

  const loadBatchData = useCallback(async (batchId: string) => {
    await Promise.all([fetchScenarios(batchId), fetchKpiConfig(batchId), fetchInteractions(batchId), fetchScenarioLibrary()]);
  }, [fetchInteractions, fetchKpiConfig, fetchScenarioLibrary, fetchScenarios]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        await Promise.all([fetchBatches(), fetchScenarioLibrary()]);
      } catch (error) {
        console.error(error);
        toast.error('Unable to load Sim Floor batches.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [fetchBatches, fetchScenarioLibrary]);

  useEffect(() => {
    if (!selectedBatch) return;
    setAssignBatchId((previous) => previous || selectedBatch);
    void loadBatchData(selectedBatch).catch((error) => {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to load Sim Floor data.');
    });
  }, [loadBatchData, selectedBatch]);

  const refreshScenarioData = async () => {
    if (!selectedBatch) return;
    await Promise.all([fetchScenarios(selectedBatch), fetchScenarioLibrary(), fetchInteractions(selectedBatch)]);
  };

  const openCreateScenario = () => {
    setEditingScenarioId(null);
    setScenarioForm(createDefaultScenarioForm());
    setShowScenarioDialog(true);
  };

  const openAssignDialog = (scenarioId?: string) => {
    setAssignScenarioId(scenarioId || libraryScenarios[0]?.id || '');
    setAssignBatchId(selectedBatch || batches[0]?.id || '');
    setShowAssignDialog(true);
  };

  const openEditScenario = async (scenarioId: string) => {
    try {
      const response = await authedFetch(`/api/sim-floor/scenarios/${scenarioId}`);
      if (!response.ok) throw new Error('Unable to load scenario details');
      const scenario: Scenario = await response.json();
      setEditingScenarioId(scenarioId);
      setScenarioForm(createScenarioFormFromScenario(scenario));
      setShowScenarioDialog(true);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to open scenario.');
    }
  };

  const openDeleteDialog = (scenarioId: string, scenarioTitle: string) => {
    setDeleteScenarioId(scenarioId);
    setDeleteScenarioTitle(scenarioTitle);
    setShowDeleteDialog(true);
  };

  const handleDeleteScenario = async () => {
    if (!deleteScenarioId) return;

    try {
      setSaving(true);
      const response = await authedFetch(`/api/sim-floor/scenarios/${deleteScenarioId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Unable to delete scenario');
      }

      toast.success(`"${deleteScenarioTitle}" has been deleted.`);
      setShowDeleteDialog(false);
      setDeleteScenarioId(null);
      setDeleteScenarioTitle('');
      await fetchScenarioLibrary();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to delete scenario.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveScenario = async () => {
    if (!selectedBatch || !scenarioForm.title.trim() || !scenarioForm.opening_prompt.trim()) {
      toast.error('Add a title and opening prompt before saving.');
      return;
    }

    const steps = scenarioForm.steps
      .map((step, index) => ({
        step_number: index + 1,
        actor: step.actor,
        speaker_label: step.speaker_label.trim() || (step.actor === 'csr' ? 'CSR' : 'Member Actor'),
        script: step.script.trim(),
        expected_keywords: splitKeywords(step.expected_keywords),
        audio_url: step.audio_url.trim() || null,
      }))
      .filter((step) => step.script);

    const csrSteps = steps.filter((step) => step.actor === 'csr');

    if (steps.length === 0 || csrSteps.length === 0) {
      toast.error('Add at least one CSR turn with script content before saving.');
      return;
    }

    setSaving(true);
    try {
      const variations = csrSteps.map((step) => ({
        actor_name: step.speaker_label || 'CSR',
        script: step.script,
        score: Math.max(step.expected_keywords.length, 1),
        branching_logic: null,
      }));
      const aggregateKeywords = splitKeywords(scenarioForm.expected_keywords);
      const mergedKeywords = Array.from(
        new Set([...aggregateKeywords, ...csrSteps.flatMap((step) => step.expected_keywords || [])]),
      );
      const openingPrompt = csrSteps[0]?.script || scenarioForm.opening_prompt.trim();
      const payload = {
        title: scenarioForm.title.trim(),
        description: scenarioForm.description.trim() || null,
        opening_prompt: openingPrompt,
        batch_id: selectedBatch,
        expected_keywords: mergedKeywords,
        estimated_duration: Number(scenarioForm.estimated_duration || 120),
        member_profile: {
          name: scenarioForm.member_name.trim() || 'Scenario Member',
          member_id: scenarioForm.member_id.trim() || null,
          plan_type: scenarioForm.plan_type.trim() || null,
          verification_status: scenarioForm.verification_status.trim() || null,
          problem_statement: scenarioForm.problem_statement.trim() || null,
        },
        cxone_metadata: {
          member_name: scenarioForm.member_name.trim() || 'Scenario Member',
          member_id: scenarioForm.member_id.trim() || null,
          plan_type: scenarioForm.plan_type.trim() || null,
          verification_status: scenarioForm.verification_status.trim() || null,
          problem_statement: scenarioForm.problem_statement.trim() || scenarioForm.description.trim() || null,
        },
        sim_floor_config: {
          interface: 'nice-cxone',
          trainee_talk_icon: true,
          member_talk_icon: true,
          show_actor_script_overlay: true,
        },
        ringer_audio_url: scenarioForm.ringer_audio_url.trim() || null,
        hold_audio_url: scenarioForm.hold_audio_url.trim() || null,
        steps,
        variations,
      };

      const response = await authedFetch(
        editingScenarioId ? `/api/sim-floor/scenarios/${editingScenarioId}` : '/api/sim-floor/scenarios',
        {
          method: editingScenarioId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Unable to save scenario');
      }

      setShowScenarioDialog(false);
      setEditingScenarioId(null);
      setScenarioForm(createDefaultScenarioForm());
      await refreshScenarioData();
      toast.success(editingScenarioId ? 'Scenario updated.' : 'Scenario created.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to save scenario.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignScenario = async () => {
    if (!assignScenarioId || !assignBatchId) {
      toast.error('Choose a scenario and batch before assigning.');
      return;
    }

    setSaving(true);
    try {
      const response = await authedFetch('/api/sim-floor/batch-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: assignScenarioId, batch_id: assignBatchId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Unable to assign scenario');
      }
      setShowAssignDialog(false);
      if (assignBatchId !== selectedBatch) {
        setSelectedBatch(assignBatchId);
      } else {
        await refreshScenarioData();
      }
      toast.success('Scenario assigned to the selected batch.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to assign scenario.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKpi = async () => {
    if (!selectedBatch) return;
    setSaving(true);
    try {
      const response = await authedFetch(
        kpiConfig ? `/api/sim-floor/kpi-config/${selectedBatch}` : '/api/sim-floor/kpi-config',
        {
          method: kpiConfig ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...kpiForm, batch_id: selectedBatch }),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Unable to save KPI configuration');
      }
      setShowKpiDialog(false);
      await fetchKpiConfig(selectedBatch);
      toast.success('KPI configuration saved.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to save KPI configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = async (format: 'csv' | 'xlsx' = 'csv') => {
    try {
      const response = await authedFetch(`/api/sim-floor/bulk-upload-template?format=${format}`);
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Unable to download the upload template');
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = format === 'csv' ? 'sim-floor-template.csv' : 'sim-floor-template.xlsx';
      anchor.click();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to download the upload template.');
    }
  };

  const handleBulkUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!selectedBatch || !bulkTitle.trim() || !file) {
      toast.error('Add a scenario title and choose a CSV or Excel file first.');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await authedFetch(
        `/api/sim-floor/bulk-upload?batch_id=${selectedBatch}&scenario_title=${encodeURIComponent(bulkTitle.trim())}`,
        { method: 'POST', body: formData },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Unable to bulk upload scenarios');
      }
      setBulkTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowBulkDialog(false);
      await refreshScenarioData();
      toast.success('Bulk upload completed.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to bulk upload scenarios.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadAudioAsset = useCallback(
    (target: { type: 'ringer' | 'hold' | 'step'; stepIndex?: number }) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';

      input.onchange = async () => {
        const selectedFile = input.files?.[0];
        if (!selectedFile) {
          input.remove();
          return;
        }

        const targetKey = target.type === 'step' ? `step-${target.stepIndex ?? 0}` : target.type;
        setUploadingAudioTarget(targetKey);

        try {
          const formData = new FormData();
          formData.append('file', selectedFile);
          formData.append('asset_kind', target.type === 'step' ? 'member-step' : target.type);
          if (editingScenarioId) {
            formData.append('scenario_id', editingScenarioId);
          }
          if (target.type === 'step' && typeof target.stepIndex === 'number') {
            formData.append('step_number', String(target.stepIndex + 1));
          }

          const response = await authedFetch('/api/sim-floor/assets/audio', {
            method: 'POST',
            body: formData,
          });
          const payload = (await response.json().catch(() => null)) as AudioAssetUploadResponse | { detail?: string } | null;
          if (!response.ok || !payload || !('audio_url' in payload)) {
            throw new Error((payload && 'detail' in payload && payload.detail) || 'Unable to upload the audio asset');
          }

          const uploadedUrl = payload.audio_url;
          setScenarioForm((previous) => {
            if (target.type === 'ringer') {
              return { ...previous, ringer_audio_url: uploadedUrl };
            }
            if (target.type === 'hold') {
              return { ...previous, hold_audio_url: uploadedUrl };
            }
            if (typeof target.stepIndex === 'number') {
              return {
                ...previous,
                steps: previous.steps.map((step, stepIndex) =>
                  stepIndex === target.stepIndex ? { ...step, audio_url: uploadedUrl } : step,
                ),
              };
            }
            return previous;
          });

          toast.success(
            target.type === 'step'
              ? 'Member-turn audio uploaded and attached to this step.'
              : `${target.type === 'ringer' ? 'Ringer' : 'Hold'} audio uploaded.`,
          );
        } catch (error) {
          console.error(error);
          toast.error(error instanceof Error ? error.message : 'Unable to upload the audio asset.');
        } finally {
          setUploadingAudioTarget(null);
          input.remove();
        }
      };

      input.click();
    },
    [authedFetch, editingScenarioId],
  );

  const openCoachingDialog = (interaction: InteractionSession) => {
    setSelectedInteraction(interaction);
    setCoachingNotes(interaction.trainer_verdict_notes || interaction.coaching_notes || '');
    setVerdictStatus(normalizeVerdictStatus(interaction.trainer_verdict_status));
    setPlaybackTime(0);
    setShowCoachingDialog(true);
  };

  const persistCoachingNotes = useCallback(async () => {
    if (!selectedInteraction) return null;
    const response = await authedFetch(`/api/sim-floor/coaching/interactions/${selectedInteraction.id}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: coachingNotes }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || 'Unable to save coaching notes');
    }
    return response.json().catch(() => null);
  }, [authedFetch, coachingNotes, selectedInteraction]);

  const handleSaveCoachingNotes = async () => {
    if (!selectedInteraction) return;
    setSaving(true);
    try {
      await persistCoachingNotes();
      await fetchInteractions(selectedBatch);
      toast.success('Coaching notes saved.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to save coaching notes.');
    } finally {
      setSaving(false);
    }
  };

  const appendTimestampedNote = useCallback(
    (seconds?: number | null) => {
      const stamp = formatClockTime(seconds ?? playbackTime);
      setCoachingNotes((previous) => `${previous ? `${previous}\n` : ''}[${stamp}] `);
    },
    [playbackTime],
  );

  const handleSubmitVerdict = async (status: 'competent' | 'retake' | 'pending') => {
    if (!selectedInteraction) return;
    setSaving(true);
    try {
      const response = await authedFetch(`/api/sim-floor/coaching/interactions/${selectedInteraction.id}/verdict`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict_status: status, notes: coachingNotes }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Unable to update trainer verdict');
      }
      setVerdictStatus(status);
      setShowCoachingDialog(false);
      await fetchInteractions(selectedBatch);
      toast.success(
        status === 'competent'
          ? 'Scenario marked as competent and certificate tracking was updated.'
          : status === 'retake'
            ? 'Scenario marked for retake.'
            : 'Trainer verdict reset to pending.',
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to update trainer verdict.');
    } finally {
      setSaving(false);
    }
  };

  const selectedTranscriptEntries = useMemo<TranscriptTimelineEntry[]>(() => {
    if (!selectedInteraction?.transcript_log?.length) {
      return [];
    }

    return selectedInteraction.transcript_log
      .map((entry) => ({
        actor: readString(entry.actor) || 'system',
        speaker_label: readString(entry.speaker_label),
        step_number: readNumber(entry.step_number) ?? undefined,
        script: readString(entry.script),
        transcript: readString(entry.transcript),
        coach_note: readString(entry.coach_note),
        timeline_start_seconds: readNumber(entry.timeline_start_seconds),
        timeline_end_seconds: readNumber(entry.timeline_end_seconds),
      }))
      .sort(
        (left, right) =>
          (left.timeline_start_seconds ?? left.step_number ?? 0) -
          (right.timeline_start_seconds ?? right.step_number ?? 0),
      );
  }, [selectedInteraction?.transcript_log]);

  const activeTranscriptIndex = useMemo(
    () =>
      selectedTranscriptEntries.findIndex((entry) => {
        if (entry.timeline_start_seconds == null) {
          return false;
        }
        const start = entry.timeline_start_seconds;
        const end = entry.timeline_end_seconds ?? start + 4;
        return playbackTime >= start && playbackTime <= end;
      }),
    [playbackTime, selectedTranscriptEntries],
  );

  const seekToTranscriptEntry = useCallback((entry: TranscriptTimelineEntry) => {
    if (!sessionAudioRef.current || entry.timeline_start_seconds == null) {
      return;
    }
    sessionAudioRef.current.currentTime = entry.timeline_start_seconds;
    setPlaybackTime(entry.timeline_start_seconds);
  }, []);

  const totalWeight =
    (kpiForm.speech_to_text_weight || 0) +
    (kpiForm.aht_weight || 0) +
    (kpiForm.rate_of_speech_weight || 0) +
    (kpiForm.dead_air_weight || 0) +
    (kpiForm.empathy_statements_weight || 0) +
    (kpiForm.probing_questions_weight || 0) +
    (kpiForm.grammar_weight || 0) +
    (kpiForm.pronunciation_weight || 0) +
    (kpiForm.pacing_weight || 0);

  const selectedBatchName = useMemo(
    () => batches.find((batch) => batch.id === selectedBatch)?.name || 'Selected batch',
    [batches, selectedBatch],
  );
  const selectedAssignScenario = useMemo(
    () => libraryScenarios.find((scenario) => scenario.id === assignScenarioId) || null,
    [assignScenarioId, libraryScenarios],
  );
  const batchPassRate =
    interactions.length > 0
      ? Math.round(
          (interactions.filter((item) => {
            const verdict = normalizeVerdictStatus(item.trainer_verdict_status);
            return verdict === 'competent' || (verdict === 'pending' && item.pass_fail);
          }).length /
            interactions.length) *
            100,
        )
      : 0;
  const sidebarItems = trainerSidebarItems();
  const updateScenarioStep = useCallback((index: number, field: keyof ScenarioStepForm, value: string) => {
    setScenarioForm((previous) => ({
      ...previous,
      steps: previous.steps.map((step, stepIndex) => (stepIndex === index ? { ...step, [field]: value } : step)),
    }));
  }, []);
  const addScenarioStep = useCallback((actor: 'csr' | 'member' = 'csr') => {
    setScenarioForm((previous) => ({
      ...previous,
      steps: [...previous.steps, createScenarioStep(actor)],
    }));
  }, []);
  const removeScenarioStep = useCallback((index: number) => {
    setScenarioForm((previous) => ({
      ...previous,
      steps: previous.steps.length === 1 ? previous.steps : previous.steps.filter((_, stepIndex) => stepIndex !== index),
    }));
  }, []);

  return (
    <DashboardLayout sidebarItems={sidebarItems} userRole="trainer">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Sim Floor Management</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage the full scenario library, assign scenarios to batches, monitor CSR response scoring, and review
              trainee recordings for coaching.
            </p>
          </div>
          <Button variant="outline" onClick={() => selectedBatch && loadBatchData(selectedBatch)} disabled={!selectedBatch || loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Select Batch</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a batch" />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.name} {batch.wave_number ? `(Wave ${batch.wave_number})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Batch Scenarios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{scenarios.length}</div>
              <p className="text-xs text-muted-foreground">{selectedBatchName}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Scenario Library</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{libraryScenarios.length}</div>
              <p className="text-xs text-muted-foreground">saved trainer scenarios</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{interactions.length}</div>
              <p className="text-xs text-muted-foreground">ready for coaching</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pass Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{batchPassRate}%</div>
              <p className="text-xs text-muted-foreground">90% passing target</p>
            </CardContent>
          </Card>
        </div>

        {selectedBatch ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Batch Scenario Queue</CardTitle>
                    <CardDescription>
                      Title, members, CSR response variations, and score performance for {selectedBatchName}.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowBulkDialog(true)}>
                      <Upload className="mr-2 h-4 w-4" />
                      Bulk Upload
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openAssignDialog()}>
                      <Link2 className="mr-2 h-4 w-4" />
                      Assign Existing
                    </Button>
                    <Button size="sm" onClick={openCreateScenario}>
                      <Plus className="mr-2 h-4 w-4" />
                      New Scenario
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {scenarios.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                    No scenarios are mapped to this batch yet.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Members</TableHead>
                        <TableHead>CSR Responses</TableHead>
                        <TableHead>Score Snapshot</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scenarios.map((scenario) => (
                        <TableRow key={scenario.id}>
                          <TableCell className="align-top">
                            <div className="font-medium">{scenario.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{scenario.description || scenario.opening_prompt}</div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="font-semibold">{scenario.member_count}</div>
                            <div className="text-xs text-muted-foreground">trainees assigned</div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="font-semibold">{scenario.variations_count}</div>
                            <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                              {scenario.variations.slice(0, 2).map((variation, index) => (
                                <div key={`${variation.actor_name}-${index}`}>{variation.actor_name}: {variation.score}/5</div>
                              ))}
                              {scenario.variations.length > 2 ? <div>+{scenario.variations.length - 2} more</div> : null}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="font-semibold">{scenario.average_score.toFixed(1)}%</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {scenario.completed_sessions} taken | {scenario.pass_rate.toFixed(1)}% pass
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="ghost" size="sm" onClick={() => openEditScenario(scenario.id)}>
                                <Pencil className="mr-1 h-3 w-3" />
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openAssignDialog(scenario.id)}>
                                <Link2 className="mr-1 h-3 w-3" />
                                Assign
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => {
                                setDeleteScenarioId(scenario.id);
                                setDeleteScenarioTitle(scenario.title);
                                setShowDeleteDialog(true);
                              }}>
                                <Trash2 className="mr-1 h-3 w-3" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>KPI Management</CardTitle>
                    <CardDescription>Weight scenario scoring and enforce the 90% passing threshold for this batch.</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setShowKpiDialog(true)}>
                    <Settings className="mr-2 h-4 w-4" />
                    {kpiConfig ? 'Edit Config' : 'Create Config'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {kpiConfig ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Passing Score</p>
                      <p className="text-2xl font-bold">{kpiConfig.passing_score}%</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Total Weight</p>
                      <p className="text-2xl font-bold">{Math.round(totalWeight * 10) / 10}%</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Target AHT</p>
                      <p className="text-2xl font-bold">{kpiConfig.target_aht_seconds}s</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Target ROS</p>
                      <p className="text-2xl font-bold">{kpiConfig.target_ros_words_per_min}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Empathy Keywords</p>
                      <p className="text-sm text-muted-foreground">
                        {kpiConfig.empathy_keywords.length ? kpiConfig.empathy_keywords.join(', ') : 'Not configured'}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Probing Keywords</p>
                      <p className="text-sm text-muted-foreground">
                        {kpiConfig.probing_keywords.length ? kpiConfig.probing_keywords.join(', ') : 'Not configured'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                    No KPI configuration exists for this batch yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Scenario Library</CardTitle>
            <CardDescription>
              View every saved scenario, the batches it is assigned to, and the overall trainee completion snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {libraryScenarios.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                No saved scenarios have been created yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Assigned Batches</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>CSR Responses</TableHead>
                    <TableHead>Performance</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {libraryScenarios.map((scenario) => (
                    <TableRow key={scenario.id}>
                      <TableCell className="align-top">
                        <div className="font-medium">{scenario.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{scenario.description || 'No description added yet.'}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-2">
                          {scenario.assigned_batches.length ? (
                            scenario.assigned_batches.map((assignment) => (
                              <Badge key={`${scenario.id}-${assignment.batch_id}`} variant="outline">
                                {assignment.batch_name}
                                {assignment.wave_number ? ` W${assignment.wave_number}` : ''}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">Unassigned</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold">{scenario.member_count}</div>
                        <div className="text-xs text-muted-foreground">assigned members</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold">{scenario.variations_count}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {scenario.variations.slice(0, 2).map((variation, index) => (
                            <div key={`${scenario.id}-variation-${index}`}>{variation.actor_name}: {variation.score}/5</div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold">{scenario.average_score.toFixed(1)}%</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {scenario.completed_sessions} completions | {scenario.pass_rate.toFixed(1)}% pass
                        </div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(scenario.latest_completed_at)}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openAssignDialog(scenario.id)}>
                            <Link2 className="mr-1 h-3 w-3" />
                            Assign
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditScenario(scenario.id)}>
                            <Pencil className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => openDeleteDialog(scenario.id, scenario.title)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Interactions</CardTitle>
            <CardDescription>Review finished trainee scenarios, replay recorded turns, and mark competent or retake.</CardDescription>
          </CardHeader>
          <CardContent>
            {interactions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                No completed sessions are available for this batch yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trainee</TableHead>
                    <TableHead>Scenario</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempt</TableHead>
                    <TableHead>AI KPI</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interactions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.trainee_name}</TableCell>
                      <TableCell>{session.scenario_title}</TableCell>
                      <TableCell>{session.score.toFixed(1)}%</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            normalizeVerdictStatus(session.trainer_verdict_status) === 'competent'
                              ? 'default'
                              : normalizeVerdictStatus(session.trainer_verdict_status) === 'retake'
                                ? 'destructive'
                                : session.pass_fail
                                  ? 'secondary'
                                  : 'outline'
                          }
                        >
                          {getVerdictLabel(session.trainer_verdict_status)}
                        </Badge>
                        {session.coaching_status ? (
                          <Badge variant={session.coaching_status === 'acknowledged' ? 'default' : session.coaching_status === 'sent' ? 'outline' : 'secondary'}>
                            {session.coaching_status === 'acknowledged'
                              ? 'Acked'
                              : session.coaching_status === 'sent'
                                ? 'Awaiting Ack'
                                : 'Draft Coaching'}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{session.attempt_number}</TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          G {session.grammar_score?.toFixed(0) ?? '0'} | P {session.pronunciation_score?.toFixed(0) ?? '0'} | Pace {session.pacing_score?.toFixed(0) ?? '0'}
                        </div>
                      </TableCell>
                      <TableCell>{session.created_at ? new Date(session.created_at).toLocaleDateString() : 'N/A'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openCoachingDialog(session)}>
                          <Mic className="mr-1 h-3 w-3" />
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showScenarioDialog} onOpenChange={setShowScenarioDialog}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingScenarioId ? 'Edit Scenario' : 'Create Scenario'}</DialogTitle>
            <DialogDescription>
              Build a turn-by-turn Sim Floor scenario. This matches the sample Excel format with Actor, Script, keywords,
              and optional member audio per turn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Scenario Title</Label>
              <Input value={scenarioForm.title} onChange={(event) => setScenarioForm((previous) => ({ ...previous, title: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={scenarioForm.description} onChange={(event) => setScenarioForm((previous) => ({ ...previous, description: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Opening Prompt</Label>
              <Textarea value={scenarioForm.opening_prompt} onChange={(event) => setScenarioForm((previous) => ({ ...previous, opening_prompt: event.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Global KPI Keywords</Label>
                <Textarea value={scenarioForm.expected_keywords} onChange={(event) => setScenarioForm((previous) => ({ ...previous, expected_keywords: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Estimated Duration</Label>
                <Input type="number" value={scenarioForm.estimated_duration} onChange={(event) => setScenarioForm((previous) => ({ ...previous, estimated_duration: event.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Member Name</Label>
                <Input value={scenarioForm.member_name} onChange={(event) => setScenarioForm((previous) => ({ ...previous, member_name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Member ID</Label>
                <Input value={scenarioForm.member_id} onChange={(event) => setScenarioForm((previous) => ({ ...previous, member_id: event.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Plan Type</Label>
                <Input value={scenarioForm.plan_type} onChange={(event) => setScenarioForm((previous) => ({ ...previous, plan_type: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Verification Status</Label>
                <Input value={scenarioForm.verification_status} onChange={(event) => setScenarioForm((previous) => ({ ...previous, verification_status: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Problem Statement</Label>
              <Textarea value={scenarioForm.problem_statement} onChange={(event) => setScenarioForm((previous) => ({ ...previous, problem_statement: event.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Ringer Audio URL</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUploadAudioAsset({ type: 'ringer' })}
                    disabled={uploadingAudioTarget === 'ringer'}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadingAudioTarget === 'ringer' ? 'Uploading...' : 'Upload Audio'}
                  </Button>
                </div>
                <Input value={scenarioForm.ringer_audio_url} onChange={(event) => setScenarioForm((previous) => ({ ...previous, ringer_audio_url: event.target.value }))} placeholder="Optional uploaded or public URL" />
                {scenarioForm.ringer_audio_url ? (
                  <audio controls className="w-full" src={scenarioForm.ringer_audio_url}>
                    Your browser does not support audio preview.
                  </audio>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Hold Audio URL</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUploadAudioAsset({ type: 'hold' })}
                    disabled={uploadingAudioTarget === 'hold'}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadingAudioTarget === 'hold' ? 'Uploading...' : 'Upload Audio'}
                  </Button>
                </div>
                <Input value={scenarioForm.hold_audio_url} onChange={(event) => setScenarioForm((previous) => ({ ...previous, hold_audio_url: event.target.value }))} placeholder="Optional uploaded or public URL" />
                {scenarioForm.hold_audio_url ? (
                  <audio controls className="w-full" src={scenarioForm.hold_audio_url}>
                    Your browser does not support audio preview.
                  </audio>
                ) : null}
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Sim Floor Turns</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Alternate CSR and Member turns so the ping-pong mock call can run from start to finish.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => addScenarioStep('member')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Member Turn
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addScenarioStep('csr')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add CSR Turn
                  </Button>
                </div>
              </div>
              {scenarioForm.steps.map((step, index) => (
                <div key={`${step.actor}-${index}`} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">Turn {index + 1}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => removeScenarioStep(index)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Turn
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[160px,1fr]">
                    <div className="space-y-2">
                      <Label>Actor</Label>
                      <Select value={step.actor} onValueChange={(value: 'csr' | 'member') => updateScenarioStep(index, 'actor', value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="csr">CSR</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Speaker Label</Label>
                      <Input value={step.speaker_label} onChange={(event) => updateScenarioStep(index, 'speaker_label', event.target.value)} placeholder={step.actor === 'csr' ? 'CSR' : 'Member Actor'} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Script</Label>
                    <Textarea value={step.script} onChange={(event) => updateScenarioStep(index, 'script', event.target.value)} rows={4} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Expected Keywords</Label>
                      <Input value={step.expected_keywords} onChange={(event) => updateScenarioStep(index, 'expected_keywords', event.target.value)} placeholder="greeting, empathy, verify member" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label>Member Audio URL</Label>
                        {step.actor === 'member' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleUploadAudioAsset({ type: 'step', stepIndex: index })}
                            disabled={uploadingAudioTarget === `step-${index}`}
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            {uploadingAudioTarget === `step-${index}` ? 'Uploading...' : 'Upload Audio'}
                          </Button>
                        ) : null}
                      </div>
                      <Input value={step.audio_url} onChange={(event) => updateScenarioStep(index, 'audio_url', event.target.value)} placeholder="Optional for member turns" />
                      {step.audio_url ? (
                        <audio controls className="w-full" src={step.audio_url}>
                          Your browser does not support audio preview.
                        </audio>
                      ) : null}
                    </div>
                  </div>
                  {step.actor === 'member' ? (
                    <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
                      Member turns can play uploaded audio during the mock call. Upload an MP3/WAV clip here or paste a URL; if no audio URL is provided, the app falls back to on-screen script and text-to-speech.
                    </div>
                  ) : (
                    <div className="rounded-lg bg-sky-50 p-3 text-xs text-sky-950">
                      CSR turns are scored against these expected keywords and saved as recorded coaching playback for the trainer.
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-600">
              Upload tip: the bulk upload dialog accepts the same workbook structure you shared, with columns
              <span className="font-medium text-slate-900"> Actor</span>,
              <span className="font-medium text-slate-900"> Script</span>,
              <span className="font-medium text-slate-900"> Score</span>, and optional
              <span className="font-medium text-slate-900"> Branching Logic</span>.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScenarioDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveScenario} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : editingScenarioId ? 'Update Scenario' : 'Create Scenario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showKpiDialog} onOpenChange={setShowKpiDialog}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>KPI Management</DialogTitle>
            <DialogDescription>Weights should total about 100% and passing score remains at 90% unless you adjust it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['speech_to_text_weight', 'Speech-to-Text Weight'],
              ['aht_weight', 'AHT Weight'],
              ['rate_of_speech_weight', 'Rate of Speech Weight'],
              ['dead_air_weight', 'Dead Air Weight'],
              ['empathy_statements_weight', 'Empathy Weight'],
              ['probing_questions_weight', 'Probing Weight'],
              ['grammar_weight', 'Grammar Weight'],
              ['pronunciation_weight', 'Pronunciation Weight'],
              ['pacing_weight', 'Pacing Weight'],
              ['forbidden_words_penalty', 'Forbidden Word Penalty'],
              ['passing_score', 'Passing Score'],
              ['target_aht_seconds', 'Target AHT Seconds'],
              ['target_ros_words_per_min', 'Target ROS WPM'],
              ['target_dead_air_seconds', 'Target Dead Air Seconds'],
            ].map(([field, label]) => (
              <div key={field} className="space-y-2">
                <Label>{label}</Label>
                <Input type="number" value={String((kpiForm as any)[field] ?? '')} onChange={(event) => setKpiForm((previous) => ({ ...previous, [field]: Number(event.target.value) }))} />
              </div>
            ))}
          </div>
          <div className="rounded-lg border p-4 text-sm">Total KPI weight: <span className="font-semibold">{Math.round(totalWeight * 10) / 10}%</span></div>
          <div className="space-y-2">
            <Label>Forbidden Words</Label>
            <Textarea value={kpiForm.forbidden_words.join(', ')} onChange={(event) => setKpiForm((previous) => ({ ...previous, forbidden_words: splitKeywords(event.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>Empathy Keywords</Label>
            <Textarea value={kpiForm.empathy_keywords.join(', ')} onChange={(event) => setKpiForm((previous) => ({ ...previous, empathy_keywords: splitKeywords(event.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>Probing Keywords</Label>
            <Textarea value={kpiForm.probing_keywords.join(', ')} onChange={(event) => setKpiForm((previous) => ({ ...previous, probing_keywords: splitKeywords(event.target.value) }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKpiDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveKpi} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Upload Scenarios</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file with `Actor`, `Script`, `Score`, and optional `Branching Logic` columns. A template is available below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" type="button" onClick={() => void handleDownloadTemplate('csv')}>
                <Download className="mr-2 h-4 w-4" />
                CSV Template
              </Button>
              <Button variant="outline" type="button" onClick={() => void handleDownloadTemplate('xlsx')}>
                <Download className="mr-2 h-4 w-4" />
                Excel Template
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Scenario Title</Label>
              <Input value={bulkTitle} onChange={(event) => setBulkTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CSV or Excel File</Label>
              <Input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>Cancel</Button>
            <Button onClick={handleBulkUpload} disabled={saving}>
              <Upload className="mr-2 h-4 w-4" />
              {saving ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Scenario to Batch</DialogTitle>
            <DialogDescription>Map an existing Sim Floor scenario to a batch so only batch members can see and take it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Scenario</Label>
              <Select value={assignScenarioId} onValueChange={setAssignScenarioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a scenario" />
                </SelectTrigger>
                <SelectContent>
                  {libraryScenarios.map((scenario) => (
                    <SelectItem key={scenario.id} value={scenario.id}>{scenario.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Batch</Label>
              <Select value={assignBatchId} onValueChange={setAssignBatchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a batch" />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.name} {batch.wave_number ? `(Wave ${batch.wave_number})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedAssignScenario ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                {selectedAssignScenario.title} has {selectedAssignScenario.variations_count} scored CSR responses and is currently assigned to {selectedAssignScenario.assigned_batches.length || 0} batch{selectedAssignScenario.assigned_batches.length === 1 ? '' : 'es'}.
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignScenario} disabled={saving}>
              <Link2 className="mr-2 h-4 w-4" />
              {saving ? 'Assigning...' : 'Assign Scenario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCoachingDialog}
        onOpenChange={(open) => {
          setShowCoachingDialog(open);
          if (!open && sessionAudioRef.current) {
            sessionAudioRef.current.pause();
            sessionAudioRef.current.currentTime = 0;
            setPlaybackTime(0);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Coaching Player</DialogTitle>
            <DialogDescription>
              Replay the recorded mock call, inspect each turn, and decide whether the trainee is competent or needs a retake.
            </DialogDescription>
          </DialogHeader>
          {selectedInteraction ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Trainee</p>
                  <p className="font-semibold">{selectedInteraction.trainee_name}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Scenario</p>
                  <p className="font-semibold">{selectedInteraction.scenario_title}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Trainer Verdict</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge
                      variant={
                        verdictStatus === 'competent'
                          ? 'default'
                          : verdictStatus === 'retake'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {getVerdictLabel(verdictStatus)}
                    </Badge>
                    {selectedInteraction.certificate_id ? (
                      <Badge variant="outline">
                        <FileBadge2 className="mr-1 h-3 w-3" />
                        Certificate
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Overall</p>
                  <p className="font-semibold">{selectedInteraction.score?.toFixed(1) ?? '0.0'}%</p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Speech Accuracy</p>
                  <p className="font-semibold">{selectedInteraction.speech_to_text_accuracy?.toFixed(1) ?? '0.0'}%</p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Rate of Speech</p>
                  <p className="font-semibold">{selectedInteraction.rate_of_speech?.toFixed(0) ?? '0'} WPM</p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Dead Air</p>
                  <p className="font-semibold">{selectedInteraction.dead_air_seconds?.toFixed(1) ?? '0.0'}s</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Grammar</p>
                  <p className="font-semibold">{selectedInteraction.grammar_score?.toFixed(1) ?? '0.0'}%</p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Pronunciation</p>
                  <p className="font-semibold">{selectedInteraction.pronunciation_score?.toFixed(1) ?? '0.0'}%</p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Pacing</p>
                  <p className="font-semibold">{selectedInteraction.pacing_score?.toFixed(1) ?? '0.0'}%</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Sentiment</p>
                  <p className="font-semibold">
                    {typeof selectedInteraction.sentiment_score === 'number'
                      ? `${selectedInteraction.sentiment_score.toFixed(2)}`
                      : 'Pending'}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Keyword Compliance</p>
                  <p className="font-semibold">
                    {Number(selectedInteraction.keyword_compliance?.score || 0).toFixed(0)}%
                  </p>
                </div>
              </div>
              {(selectedInteraction.keyword_compliance?.items || []).length ? (
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-muted-foreground">Compliance Checks</p>
                    <Badge variant="outline">
                      {(selectedInteraction.keyword_compliance?.items || []).filter((item) => item.matched).length}/
                      {(selectedInteraction.keyword_compliance?.items || []).length} matched
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(selectedInteraction.keyword_compliance?.items || []).map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                          item.matched ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
                        }`}
                      >
                        <div>
                          <div className="font-medium text-slate-900">{item.label}</div>
                          <div className="text-xs text-slate-500">{item.required_phrase}</div>
                        </div>
                        <div className={`font-medium ${item.matched ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {item.matched ? 'Matched' : 'Missing'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedInteraction.audio_url ? (
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-muted-foreground">Session Audio</p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Synchronized with transcript timeline</span>
                    <span>{formatClockTime(playbackTime)}</span>
                  </div>
                  <audio
                    ref={sessionAudioRef}
                    controls
                    className="mt-3 w-full"
                    src={selectedInteraction.audio_url}
                    onTimeUpdate={(event) => setPlaybackTime(event.currentTarget.currentTime || 0)}
                    onEnded={() => setPlaybackTime(0)}
                  >
                    Your browser does not support the audio player.
                  </audio>
                  <div className="mt-3 flex justify-end">
                    <Button type="button" variant="outline" onClick={() => appendTimestampedNote()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Coaching Note
                    </Button>
                  </div>
                </div>
              ) : null}
              {selectedInteraction.turn_logs?.length ? (
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Headphones className="h-4 w-4" />
                    Recorded CSR Turns
                  </div>
                  {selectedInteraction.turn_logs.map((turn, index) => (
                    <div key={`${turn.step_number || index}`} className="rounded-lg bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium text-slate-900">
                          Turn {String(turn.step_number || index + 1)} {turn.speaker_label ? `- ${String(turn.speaker_label)}` : ''}
                        </div>
                        <div className="text-xs text-slate-500">
                          Accuracy {Number(turn.speech_to_text_accuracy || 0).toFixed(0)}% | Grammar {Number(turn.grammar_score || 0).toFixed(0)}%
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{String(turn.transcript || 'No transcript captured.')}</p>
                      {typeof turn.audio_url === 'string' && turn.audio_url ? (
                        <audio controls className="mt-3 w-full" src={turn.audio_url}>
                          Your browser does not support the audio player.
                        </audio>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No per-turn recordings were uploaded for this session.
                </div>
              )}
              {selectedInteraction.ai_feedback ? (
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-muted-foreground">AI Feedback</p>
                  <p className="mt-2">{selectedInteraction.ai_feedback}</p>
                </div>
              ) : null}
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium text-muted-foreground">Transcript Timeline</p>
                {selectedTranscriptEntries.length ? (
                  <div className="mt-3 space-y-3">
                    {selectedTranscriptEntries.map((entry, index) => (
                      <button
                        key={`${entry.step_number || index}-${entry.actor}`}
                        type="button"
                        onClick={() => seekToTranscriptEntry(entry)}
                        className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                          activeTranscriptIndex === index
                            ? 'border-cyan-300 bg-cyan-50'
                            : 'border-transparent bg-slate-50 hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-slate-900">
                            {entry.actor.toUpperCase()} {entry.step_number ? `#${String(entry.step_number)}` : ''}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            {entry.timeline_start_seconds != null ? <span>{formatClockTime(entry.timeline_start_seconds)}</span> : null}
                            {entry.speaker_label ? <span>{entry.speaker_label}</span> : null}
                          </div>
                        </div>
                        <p className="mt-2 text-slate-600">{entry.transcript || entry.script || 'No transcript available.'}</p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          {entry.coach_note ? (
                            <span className="text-xs text-amber-700">Saved note: {entry.coach_note}</span>
                          ) : (
                            <span className="text-xs text-slate-400">Click row to jump playback</span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={(event) => {
                              event.stopPropagation();
                              appendTimestampedNote(entry.timeline_start_seconds);
                            }}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add Coaching Note
                          </Button>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">{selectedInteraction.transcript || 'No transcript available.'}</p>
                )}
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium text-muted-foreground">Final Decision</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant={verdictStatus === 'pending' ? 'default' : 'outline'}
                    onClick={() => setVerdictStatus('pending')}
                  >
                    Pending
                  </Button>
                  <Button
                    type="button"
                    variant={verdictStatus === 'competent' ? 'default' : 'outline'}
                    className={verdictStatus === 'competent' ? 'bg-emerald-600 hover:bg-emerald-600' : ''}
                    onClick={() => setVerdictStatus('competent')}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Competent
                  </Button>
                  <Button
                    type="button"
                    variant={verdictStatus === 'retake' ? 'destructive' : 'outline'}
                    onClick={() => setVerdictStatus('retake')}
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Needs Retake
                  </Button>
                </div>
                {selectedInteraction.trainer_evaluated_at ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Last evaluated: {formatDateTime(selectedInteraction.trainer_evaluated_at)}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Coaching Notes</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => appendTimestampedNote()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Coaching Note
                  </Button>
                </div>
                <Textarea value={coachingNotes} onChange={(event) => setCoachingNotes(event.target.value)} rows={6} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCoachingDialog(false)}>Close</Button>
            <Button variant="outline" onClick={handleSaveCoachingNotes} disabled={saving || !selectedInteraction}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Notes'}
            </Button>
            <Button
              onClick={() => void handleSubmitVerdict(verdictStatus)}
              disabled={saving || !selectedInteraction}
              className={verdictStatus === 'retake' ? 'bg-rose-600 hover:bg-rose-600' : verdictStatus === 'competent' ? 'bg-emerald-600 hover:bg-emerald-600' : ''}
            >
              {verdictStatus === 'competent' ? (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              ) : verdictStatus === 'retake' ? (
                <AlertTriangle className="mr-2 h-4 w-4" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? 'Submitting...' : verdictStatus === 'competent' ? 'Mark Competent' : verdictStatus === 'retake' ? 'Require Retake' : 'Save Verdict'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Scenario</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteScenarioTitle}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteScenario} 
              disabled={saving}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {saving ? 'Deleting...' : 'Delete Scenario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
