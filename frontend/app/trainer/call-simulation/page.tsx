'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Textarea } from '@/app/components/ui/textarea';
import { openCallSimulationRealtimeStream } from '@/app/lib/assessment/call-simulation-client';
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
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface AssignmentTarget {
  trainee_id: string;
  trainee_name: string;
  trainee_email: string;
  language_dialect?: string | null;
  batch_id: string;
  batch_name: string;
  wave_number?: number | null;
  is_assigned: boolean;
  assignment_id?: string | null;
  assigned_at?: string | null;
}

interface ScenarioStep {
  step_number: number;
  actor: string;
  speaker_label?: string | null;
  script: string;
  expected_keywords: string[];
  audio_url?: string | null;
  metadata?: Record<string, unknown>;
}

interface Scenario {
  id: string;
  title: string;
  description?: string | null;
  scenario_group?: string | null;
  opening_prompt: string;
  difficulty?: string | null;
  expected_keywords: string[];
  estimated_duration?: number | null;
  member_profile?: Record<string, unknown>;
  cxone_metadata?: Record<string, unknown>;
  call_simulation_config?: Record<string, unknown>;
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

interface ScenarioRowForm {
  actor_name: string;
  scenario: string;
  script: string;
  score: string;
  audio_url: string;
}

interface ScenarioFormState {
  title: string;
  topic: string;
  description: string;
  scenario_group_label: string;
  opening_prompt: string;
  expected_keywords: string;
  estimated_duration: string;
  target_kpis_json: string;
  member_name: string;
  member_id: string;
  plan_type: string;
  verification_status: string;
  problem_statement: string;
  difficulty: string;
  rows: ScenarioRowForm[];
}

interface AudioAssetUploadResponse {
  audio_url: string;
  asset_kind: string;
  filename: string;
  scenario_id: string;
  settings?: CallSimulationAudioSettings | null;
}

interface MemberSpeechAssetResponse {
  audio_url?: string | null;
  warning?: string | null;
  storage_mode?: string | null;
  detail?: string;
}

interface ScenarioKpiMetricPayload {
  metricName: string;
  weightPercentage: number;
}

interface CallSimulationAudioSettings {
  ringer_audio_url: string;
  hold_audio_url: string;
  ringer_audio_source?: string | null;
  hold_audio_source?: string | null;
  updated_at?: string | null;
}

type ScenarioRowPayload = {
  row_index: number;
  actor_name: string;
  scenario: string;
  script: string;
  score: number;
  audio_url?: string | null;
};

type ScenarioGroupPayload = {
  scenario_key: string;
  csr_variants: ScenarioRowPayload[];
  member_rows: ScenarioRowPayload[];
};

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

const createScenarioRow = (overrides: Partial<ScenarioRowForm> = {}): ScenarioRowForm => ({
  actor_name: overrides.actor_name || 'CSR',
  scenario: overrides.scenario || '',
  script: overrides.script || '',
  score: overrides.score || '',
  audio_url: overrides.audio_url || '',
});

const createStarterScenarioRows = (): ScenarioRowForm[] => ([
  createScenarioRow({ actor_name: 'CSR', scenario: '1' }),
  createScenarioRow({ actor_name: 'Member', scenario: '1' }),
  createScenarioRow({ actor_name: 'CSR', scenario: '2' }),
  createScenarioRow({ actor_name: 'Member', scenario: '2' }),
  createScenarioRow({ actor_name: 'CSR', scenario: '3' }),
]);

const createDefaultScenarioForm = (): ScenarioFormState => ({
  title: '',
  topic: 'Benefits verification and order support',
  description: '',
  scenario_group_label: '',
  opening_prompt: 'Answer the call, review the member context, and deliver the expected CSR spiel.',
  expected_keywords: 'thank you for calling, member id, verification',
  estimated_duration: '180',
  target_kpis_json: JSON.stringify(
    {
      passing_score: 80,
      aht_seconds: 240,
      soft_skills: ['empathy', 'ownership', 'clear pacing'],
      focus: ['script_accuracy', 'grammar', 'pronunciation'],
    },
    null,
    2,
  ),
  member_name: 'Calvin Smith',
  member_id: 'HBP-100245',
  plan_type: 'Healthy Benefits Plus',
  verification_status: 'Pending verification',
  problem_statement: 'Member wants help checking plan benefits and delivery status.',
  difficulty: 'intermediate',
  rows: createStarterScenarioRows(),
});

const createDefaultCallSimulationAudioSettings = (): CallSimulationAudioSettings => ({
  ringer_audio_url: '',
  hold_audio_url: '',
  ringer_audio_source: null,
  hold_audio_source: null,
  updated_at: null,
});

const isEmbeddedAudioDataUrl = (value: string) => value.trim().startsWith('data:audio/');

const formatGeneratedAudioValue = (value: string) => {
  if (!value.trim()) {
    return '';
  }
  return isEmbeddedAudioDataUrl(value)
    ? 'Embedded audio saved in the scenario record'
    : value;
};

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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function readPointValue(value: unknown, fallback = 0) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : fallback;
}

function parseScenarioConfig(scenario: Scenario) {
  return scenario.call_simulation_config && typeof scenario.call_simulation_config === 'object'
    ? scenario.call_simulation_config
    : {};
}

function parseTargetKpisJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      passing_score: 80,
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return typeof parsed === 'object' && parsed ? parsed : { passing_score: 80 };
  } catch {
    throw new Error('Target KPIs must be valid JSON.');
  }
}

function normalizeActorRole(value: string) {
  return value.trim().toLowerCase();
}

function normalizeScenarioRowActor(value: string) {
  return isCsrActor(value) ? 'CSR' : 'Member';
}

function getNextScenarioGroupValue(rows: ScenarioRowForm[]) {
  const numericGroups = rows
    .map((row) => Number(row.scenario.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  const fallbackGroup = numericGroups.length > 0 ? Math.max(...numericGroups) + 1 : 1;
  return String(fallbackGroup);
}

function isCsrActor(value: string) {
  const normalized = normalizeActorRole(value);
  return normalized === 'csr' || normalized === 'agent' || normalized === 'trainee';
}

function buildScenarioRowsPayload(rows: ScenarioRowForm[]) {
  return rows
    .map((row, index) => ({
      row_index: index + 1,
      actor_name: row.actor_name.trim(),
      scenario: row.scenario.trim(),
      script: row.script.trim(),
      score: readPointValue(row.score, 0),
      audio_url: row.audio_url.trim() || null,
    }))
    .filter((row) => row.actor_name && row.scenario && row.script);
}

function buildScenarioGroups(rows: ScenarioRowPayload[]) {
  const groups = new Map<string, ScenarioGroupPayload>();

  for (const row of rows) {
    const scenarioKey = row.scenario.trim();
    if (!groups.has(scenarioKey)) {
      groups.set(scenarioKey, {
        scenario_key: scenarioKey,
        csr_variants: [],
        member_rows: [],
      });
    }

    const group = groups.get(scenarioKey)!;
    if (isCsrActor(row.actor_name)) {
      group.csr_variants.push(row);
    } else {
      group.member_rows.push(row);
    }
  }

  return Array.from(groups.values());
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

function buildScenarioRowsFromSteps(scenario: Scenario) {
  const orderedSteps = [...(scenario.steps || [])].sort((left, right) => left.step_number - right.step_number);
  if (!orderedSteps.length) {
    return createStarterScenarioRows();
  }

  return orderedSteps.map((step, index) => {
    const scenarioGroup =
      String(step.metadata?.scenario_group || step.metadata?.script_flow_step_id || Math.floor(index / 2) + 1);

    return {
      actor_name: step.actor === 'member' ? 'Member' : 'CSR',
      scenario: scenarioGroup,
      script: step.script || '',
      score: step.actor === 'csr'
        ? String(readPointValue(step.metadata?.point_value ?? 0, 0))
        : '',
      audio_url: step.actor === 'member' ? String(readString(step.audio_url) || '') : '',
    };
  });
}

function createScenarioFormFromScenario(scenario: Scenario): ScenarioFormState {
  const scenarioConfig = parseScenarioConfig(scenario);
  const targetKpis = scenarioConfig.target_kpis;
  const configuredRows = Array.isArray(scenarioConfig.script_rows)
    ? (scenarioConfig.script_rows as Array<Record<string, unknown>>)
    : [];
  const sourceRows: ScenarioRowForm[] =
    configuredRows.length > 0
      ? configuredRows.map((row) => ({
          actor_name: normalizeScenarioRowActor(String(row.actor || row.actor_name || '')),
          scenario: String(row.scenario || '').trim(),
          script: String(row.script || row.suggested_csr_script || '').trim(),
          score: isCsrActor(String(row.actor || row.actor_name || ''))
            ? String(readPointValue(row.score ?? row.point_value, 0))
            : String(readPointValue(row.score ?? row.point_value, 0) || ''),
          audio_url: String(readString(row.audio_url) || readString(row.member_audio_url) || ''),
        }))
      : buildScenarioRowsFromSteps(scenario);

  return {
    title: scenario.title || '',
    topic: String(readString(scenarioConfig.topic) || scenario.title || 'Call scenario'),
    description: scenario.description || '',
    scenario_group_label: String(
      readString(scenarioConfig.scenario_group_label)
      || readString(scenario.scenario_group)
      || '',
    ),
    opening_prompt: scenario.opening_prompt || '',
    expected_keywords: (scenario.expected_keywords || []).join(', '),
    estimated_duration: String(scenario.estimated_duration || 120),
    target_kpis_json: JSON.stringify(
      typeof targetKpis === 'object' && targetKpis ? targetKpis : { passing_score: 80 },
      null,
      2,
    ),
    member_name: String(scenario.member_profile?.name || scenario.cxone_metadata?.member_name || 'Scenario Member'),
    member_id: String(scenario.member_profile?.member_id || scenario.cxone_metadata?.member_id || ''),
    plan_type: String(scenario.member_profile?.plan_type || ''),
    verification_status: String(scenario.member_profile?.verification_status || ''),
    problem_statement: String(
      scenario.member_profile?.problem_statement || scenario.cxone_metadata?.problem_statement || scenario.description || '',
    ),
    difficulty: scenario.difficulty || 'intermediate',
    rows: sourceRows.length > 0 ? sourceRows : [createScenarioRow()],
  };
}

function parseBulkScenarioFileName(fileName: string) {
  const cleanedName = fileName.replace(/\.[^.]+$/, '').trim();
  if (!cleanedName) {
    return {
      title: '',
      topic: '',
      description: '',
    };
  }

  const underscoreParts = cleanedName
    .split('_')
    .map((segment) => segment.replace(/-/g, ' ').trim())
    .filter(Boolean);

  if (underscoreParts.length >= 3) {
    return {
      title: underscoreParts[0] || '',
      topic: underscoreParts[1] || underscoreParts[0] || '',
      description: underscoreParts.slice(2).join(' ').trim() || underscoreParts[1] || underscoreParts[0] || '',
    };
  }

  const dashedParts = cleanedName
    .split(/\s+-\s+/)
    .map((segment) => segment.replace(/_/g, ' ').trim())
    .filter(Boolean);

  if (dashedParts.length >= 2) {
    const title = dashedParts[0] || '';
    const topic = dashedParts[1] || title;
    const description = dashedParts.slice(2).join(' ').trim() || cleanedName.replace(/_/g, ' ').trim();
    return {
      title,
      topic,
      description: description || topic || title,
    };
  }

  const normalized = cleanedName.replace(/[_-]+/g, ' ').trim();
  return {
    title: normalized,
    topic: normalized,
    description: normalized,
  };
}

function buildTargetKpisFromConfig(config: KPIConfig) {
  return {
    speech_to_text_weight: config.speech_to_text_weight,
    aht_weight: config.aht_weight,
    rate_of_speech_weight: config.rate_of_speech_weight,
    dead_air_weight: config.dead_air_weight,
    empathy_statements_weight: config.empathy_statements_weight,
    probing_questions_weight: config.probing_questions_weight,
    grammar_weight: config.grammar_weight,
    pronunciation_weight: config.pronunciation_weight,
    pacing_weight: config.pacing_weight,
    forbidden_words_penalty: config.forbidden_words_penalty,
    passing_score: config.passing_score,
    target_aht_seconds: config.target_aht_seconds,
    target_ros_words_per_min: config.target_ros_words_per_min,
    target_dead_air_seconds: config.target_dead_air_seconds,
    forbidden_words: config.forbidden_words,
    empathy_keywords: config.empathy_keywords,
    probing_keywords: config.probing_keywords,
  };
}

function buildScenarioKpiMetricPayload(config: KPIConfig): ScenarioKpiMetricPayload[] {
  return [
    { metricName: 'Script Accuracy', weightPercentage: config.speech_to_text_weight },
    { metricName: 'AHT', weightPercentage: config.aht_weight },
    { metricName: 'Rate of Speech', weightPercentage: config.rate_of_speech_weight },
    { metricName: 'Dead Air', weightPercentage: config.dead_air_weight },
    { metricName: 'Empathy', weightPercentage: config.empathy_statements_weight },
    { metricName: 'Probing', weightPercentage: config.probing_questions_weight },
    { metricName: 'Grammar', weightPercentage: config.grammar_weight },
    { metricName: 'Pronunciation', weightPercentage: config.pronunciation_weight },
    { metricName: 'Pacing', weightPercentage: config.pacing_weight },
  ];
}

function buildSupabaseScriptFlowFromScenario(scenario: Scenario) {
  const scenarioConfig = parseScenarioConfig(scenario);
  const configuredFlow = Array.isArray(scenarioConfig.script_flow)
    ? (scenarioConfig.script_flow as Array<Record<string, unknown>>)
    : [];

  if (!configuredFlow.length) {
    return [];
  }

  return configuredFlow.map((step, index) => ({
    step_id: String(step.step_id || `step-${index + 1}`),
    suggested_csr_script: String(step.suggested_csr_script || ''),
    member_response_text: String(step.member_response_text || ''),
    point_value: readPointValue(step.point_value, 0),
    expected_keywords: Array.isArray(step.expected_keywords)
      ? step.expected_keywords.map((keyword) => String(keyword).trim()).filter(Boolean)
      : [],
    member_audio_url: readString(step.member_audio_url),
  }));
}

function buildSupabaseScenarioSyncBody(scenario: Scenario) {
  const scenarioConfig = parseScenarioConfig(scenario);
  const targetKpis = typeof scenarioConfig.target_kpis === 'object' && scenarioConfig.target_kpis
    ? scenarioConfig.target_kpis as Record<string, unknown>
    : { passing_score: 80 };
  const passingScoreCandidate = targetKpis.passing_score ?? scenarioConfig.certification_threshold ?? 80;
  const passingScore = typeof passingScoreCandidate === 'number'
    ? passingScoreCandidate
    : Number(passingScoreCandidate || 80);

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    description: scenario.description || null,
    topic: String(readString(scenarioConfig.topic) || scenario.title || 'Call scenario'),
    scenarioGroup: readString(scenarioConfig.scenario_group_label) || readString(scenario.scenario_group) || null,
    targetKpis,
    scriptFlow: buildSupabaseScriptFlowFromScenario(scenario),
    ringerAudioUrl: scenario.ringer_audio_url || null,
    holdAudioUrl: scenario.hold_audio_url || null,
    difficulty: scenario.difficulty || null,
    estimatedDurationSeconds: scenario.estimated_duration ?? null,
    passingScore: Number.isFinite(passingScore) ? passingScore : 80,
    isPublished: true,
    isActive: true,
    metadata: scenarioConfig,
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
  const [assignmentTargets, setAssignmentTargets] = useState<AssignmentTarget[]>([]);
  const [selectedAssignmentTrainees, setSelectedAssignmentTrainees] = useState<string[]>([]);
  const [loadingAssignmentTargets, setLoadingAssignmentTargets] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteScenarioId, setDeleteScenarioId] = useState<string | null>(null);
  const [deleteScenarioTitle, setDeleteScenarioTitle] = useState('');
  const [playbackTime, setPlaybackTime] = useState(0);
  const [callToneSettings, setCallToneSettings] = useState<CallSimulationAudioSettings>(createDefaultCallSimulationAudioSettings());
  const [loadingCallToneSettings, setLoadingCallToneSettings] = useState(false);
  const [savingCallToneTarget, setSavingCallToneTarget] = useState<string | null>(null);
  const [uploadingAudioTarget, setUploadingAudioTarget] = useState<string | null>(null);
  const [generatingSpeechRowIndex, setGeneratingSpeechRowIndex] = useState<number | null>(null);
  const [isGeneratingAllMemberSpeech, setIsGeneratingAllMemberSpeech] = useState(false);
  const [memberSpeechGenerationProgress, setMemberSpeechGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionAudioRef = useRef<HTMLAudioElement | null>(null);

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = localStorage.getItem('token') || '';
    const headers = new Headers(init?.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(url, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  const syncScenarioRecordToSupabase = useCallback(async (scenarioInput: Scenario | string) => {
    const scenario = typeof scenarioInput === 'string'
      ? await (async () => {
          const response = await authedFetch(`/api/call-simulation/scenarios/${scenarioInput}`);
          if (!response.ok) {
            const error = await response.json().catch(() => null);
            throw new Error(error?.detail || 'Unable to load the saved scenario for Supabase sync.');
          }
          return response.json() as Promise<Scenario>;
        })()
      : scenarioInput;

    const response = await authedFetch('/api/call-simulation/scenarios/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSupabaseScenarioSyncBody(scenario)),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.syncError || payload?.detail || 'Unable to sync the scenario and scripts to Supabase.');
    }

    return payload;
  }, [authedFetch]);

  const syncScenarioKpiMetrics = useCallback(async (scenarioGroupIds: string[], config: KPIConfig) => {
    const response = await authedFetch('/api/call-simulation/kpi/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioGroupIds,
        metrics: buildScenarioKpiMetricPayload(config),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.syncError || payload?.detail || 'Unable to sync KPI metrics to Supabase.');
    }
    return payload;
  }, [authedFetch]);

  const deleteScenarioRecordFromSupabase = useCallback(async (scenarioId: string) => {
    const response = await authedFetch('/api/call-simulation/scenarios/sync', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.syncError || payload?.detail || 'Unable to remove the Supabase scenario mirror.');
    }

    return payload;
  }, [authedFetch]);

  const applyCallToneSettings = useCallback((payload: Partial<CallSimulationAudioSettings> | null | undefined) => {
    setCallToneSettings({
      ringer_audio_url: typeof payload?.ringer_audio_url === 'string' ? payload.ringer_audio_url : '',
      hold_audio_url: typeof payload?.hold_audio_url === 'string' ? payload.hold_audio_url : '',
      ringer_audio_source: typeof payload?.ringer_audio_source === 'string' ? payload.ringer_audio_source : null,
      hold_audio_source: typeof payload?.hold_audio_source === 'string' ? payload.hold_audio_source : null,
      updated_at: typeof payload?.updated_at === 'string' ? payload.updated_at : null,
    });
  }, []);

  const fetchCallToneSettings = useCallback(async () => {
    setLoadingCallToneSettings(true);
    try {
      const response = await authedFetch('/api/call-simulation/audio-settings');
      if (!response.ok) {
        console.warn('Unable to load Call Simulation audio settings.');
        applyCallToneSettings(null);
        return;
      }
      const payload = (await response.json().catch(() => null)) as CallSimulationAudioSettings | null;
      applyCallToneSettings(payload);
    } finally {
      setLoadingCallToneSettings(false);
    }
  }, [applyCallToneSettings, authedFetch]);

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
    const response = await authedFetch('/api/call-simulation/scenarios');
    if (!response.ok) throw new Error('Unable to load the scenario library');
    setLibraryScenarios(await response.json());
  }, [authedFetch]);

  const fetchScenarios = useCallback(async (batchId: string) => {
    const response = await authedFetch(`/api/call-simulation/batch/${batchId}/scenarios`);
    if (!response.ok) throw new Error('Unable to load scenarios');
    setScenarios(await response.json());
  }, [authedFetch]);

  const fetchKpiConfig = useCallback(async (batchId: string) => {
    const response = await authedFetch(`/api/call-simulation/kpi-config/${batchId}`);
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
    const response = await authedFetch(`/api/call-simulation/coaching/interactions?batch_id=${batchId}&limit=20`);
    if (!response.ok) throw new Error('Unable to load interactions');
    const data = await response.json();
    setInteractions(data.sessions || []);
  }, [authedFetch]);

  const fetchAssignmentTargets = useCallback(async (scenarioId: string, batchId: string) => {
    if (!scenarioId || !batchId) {
      setAssignmentTargets([]);
      setSelectedAssignmentTrainees([]);
      return;
    }

    setLoadingAssignmentTargets(true);
    try {
      const response = await authedFetch(
        `/api/call-simulation/assignment-targets?scenario_id=${encodeURIComponent(scenarioId)}&batch_id=${encodeURIComponent(batchId)}`,
      );
      if (!response.ok) {
        throw new Error('Unable to load assignment targets');
      }

      const payload = (await response.json()) as AssignmentTarget[];
      setAssignmentTargets(payload);
      const assignedIds = payload.filter((target) => target.is_assigned).map((target) => target.trainee_id);
      setSelectedAssignmentTrainees(
        assignedIds.length > 0
          ? assignedIds
          : payload.map((target) => target.trainee_id),
      );
    } finally {
      setLoadingAssignmentTargets(false);
    }
  }, [authedFetch]);

  const loadBatchData = useCallback(async (batchId: string) => {
    const results = await Promise.allSettled([
      fetchScenarios(batchId),
      fetchKpiConfig(batchId),
      fetchInteractions(batchId),
      fetchScenarioLibrary(),
    ]);

    if (results[0].status === 'rejected') {
      throw results[0].reason;
    }

    const nonCriticalErrors = results
      .slice(1)
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result, index) => {
        const fallbackMessages = [
          'Unable to load KPI configuration.',
          'Unable to load interactions.',
          'Unable to load the scenario library.',
        ];
        return getErrorMessage(result.reason, fallbackMessages[index]);
      });

    if (nonCriticalErrors.length > 0) {
      toast.error(nonCriticalErrors.join(' '));
    }
  }, [fetchInteractions, fetchKpiConfig, fetchScenarioLibrary, fetchScenarios]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const results = await Promise.allSettled([
          fetchBatches(),
          fetchScenarioLibrary(),
          fetchCallToneSettings(),
        ]);

        if (results[0].status === 'rejected') {
          throw results[0].reason;
        }

        const nonCriticalErrors = results
          .slice(1)
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result, index) => {
            const fallbackMessages = [
              'Unable to load the scenario library.',
              'Unable to load Call Simulation audio settings.',
            ];
            return getErrorMessage(result.reason, fallbackMessages[index]);
          });

        if (nonCriticalErrors.length > 0) {
          toast.error(nonCriticalErrors.join(' '));
        }
      } catch (error) {
        console.error(error);
        toast.error('Unable to load Call Simulation batches.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [fetchBatches, fetchCallToneSettings, fetchScenarioLibrary]);

  useEffect(() => {
    if (!selectedBatch) return;
    setAssignBatchId((previous) => previous || selectedBatch);
    void loadBatchData(selectedBatch).catch((error) => {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to load Call Simulation data.');
    });
  }, [loadBatchData, selectedBatch]);

  useEffect(() => {
    if (!showAssignDialog || !assignScenarioId || !assignBatchId) {
      return;
    }

    void fetchAssignmentTargets(assignScenarioId, assignBatchId).catch((error) => {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to load trainees for assignment.');
    });
  }, [assignBatchId, assignScenarioId, fetchAssignmentTargets, showAssignDialog]);

  const refreshScenarioData = useCallback(async () => {
    if (!selectedBatch) return;
    await Promise.all([fetchScenarios(selectedBatch), fetchScenarioLibrary(), fetchInteractions(selectedBatch)]);
  }, [fetchInteractions, fetchScenarioLibrary, fetchScenarios, selectedBatch]);

  useEffect(() => {
    if (!selectedBatch) {
      return undefined;
    }

    let stream: EventSource | null = null;

    try {
      stream = openCallSimulationRealtimeStream({ batchId: selectedBatch });
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (
            payload.type === 'assignment_changed'
            || payload.type === 'session_changed'
            || payload.type === 'coaching_changed'
          ) {
            void refreshScenarioData().catch(() => undefined);
          }
        } catch {
          // Keep the trainer dashboard usable even if a realtime payload is malformed.
        }
      };
    } catch {
      // Realtime is optional for this page.
    }

    return () => {
      stream?.close();
    };
  }, [refreshScenarioData, selectedBatch]);

  useEffect(() => {
    if (!selectedInteraction) {
      return;
    }

    const refreshedInteraction = interactions.find((interaction) => interaction.id === selectedInteraction.id);
    if (refreshedInteraction && refreshedInteraction !== selectedInteraction) {
      setSelectedInteraction(refreshedInteraction);
    }
  }, [interactions, selectedInteraction]);

  const openCreateScenario = () => {
    setEditingScenarioId(null);
    const nextForm = createDefaultScenarioForm();
    nextForm.target_kpis_json = JSON.stringify(buildTargetKpisFromConfig(kpiForm), null, 2);
    setGeneratingSpeechRowIndex(null);
    setIsGeneratingAllMemberSpeech(false);
    setMemberSpeechGenerationProgress(null);
    setScenarioForm(nextForm);
    setShowScenarioDialog(true);
  };

  const openAssignDialog = (scenarioId?: string) => {
    setAssignScenarioId(scenarioId || libraryScenarios[0]?.id || '');
    setAssignBatchId(selectedBatch || batches[0]?.id || '');
    setAssignmentTargets([]);
    setSelectedAssignmentTrainees([]);
    setShowAssignDialog(true);
  };

  const openEditScenario = async (scenarioId: string) => {
    try {
      const response = await authedFetch(`/api/call-simulation/scenarios/${scenarioId}`);
      if (!response.ok) throw new Error('Unable to load scenario details');
      const scenario: Scenario = await response.json();
      setEditingScenarioId(scenarioId);
      setGeneratingSpeechRowIndex(null);
      setIsGeneratingAllMemberSpeech(false);
      setMemberSpeechGenerationProgress(null);
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
      const scenarioIdToDelete = deleteScenarioId;
      const response = await authedFetch(`/api/call-simulation/scenarios/${deleteScenarioId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Unable to delete scenario');
      }

      try {
        await deleteScenarioRecordFromSupabase(scenarioIdToDelete);
      } catch (syncError) {
        console.warn('Call simulation scenario Supabase delete sync failed:', syncError);
        toast.error('Scenario deleted locally, but Supabase cleanup did not complete.');
      }

      toast.success(`"${deleteScenarioTitle}" has been deleted.`);
      setShowDeleteDialog(false);
      setDeleteScenarioId(null);
      setDeleteScenarioTitle('');
      try {
        await refreshScenarioData();
      } catch (refreshError) {
        console.error(refreshError);
        toast.error(`Scenario deleted, but ${getErrorMessage(refreshError, 'the Call Simulation workspace could not refresh right away.')}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to delete scenario.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveScenario = async () => {
    if (!selectedBatch || !scenarioForm.title.trim()) {
      toast.error('Add a scenario title before saving.');
      return;
    }
    if (!scenarioForm.topic.trim() || !scenarioForm.description.trim() || !scenarioForm.scenario_group_label.trim()) {
      toast.error('Add the scenario topic, description, and scenario group before saving.');
      return;
    }

    let targetKpis: Record<string, unknown>;
    try {
      targetKpis = parseTargetKpisJson(scenarioForm.target_kpis_json);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Target KPIs must be valid JSON.');
      return;
    }

    const rows = buildScenarioRowsPayload(scenarioForm.rows).map((row) =>
      isCsrActor(row.actor_name)
        ? row
        : {
            ...row,
            actor_name: scenarioForm.member_name.trim() || 'Member',
          },
    );
    if (rows.length < 5) {
      toast.error('Add at least five complete Actor, Script, Score, and Scenario rows before saving.');
      return;
    }

    const groupedRows = buildScenarioGroups(rows).filter((group) => group.csr_variants.length > 0);
    if (groupedRows.length === 0) {
      toast.error('Each scenario needs at least one CSR row with a scored script.');
      return;
    }

    const aggregateKeywords = splitKeywords(scenarioForm.expected_keywords);
    const scriptFlow = groupedRows.map((group, index) => {
      const canonicalVariant = [...group.csr_variants].sort((left, right) => right.score - left.score)[0];
      const memberScript = group.member_rows.map((row) => row.script.trim()).filter(Boolean).join(' ').trim();
      const memberActorName = scenarioForm.member_name.trim() || group.member_rows[0]?.actor_name || 'Member';
      const memberAudioUrl = group.member_rows.find((row) => row.audio_url)?.audio_url || null;
      const pointValue = Math.max(...group.csr_variants.map((row) => row.score), 0);

      return {
        step_id: `scenario-${group.scenario_key}`,
        suggested_csr_script: canonicalVariant?.script || '',
        member_response_text: index < groupedRows.length - 1 ? memberScript : '',
        point_value: pointValue,
        expected_keywords: aggregateKeywords,
        actor_name: memberActorName,
        next_actor_name: index < groupedRows.length - 1 ? memberActorName : null,
        scenario: group.scenario_key,
        member_audio_url: index < groupedRows.length - 1 ? memberAudioUrl : null,
        accepted_variants: group.csr_variants.map((row) => ({
          actor_name: row.actor_name,
          script: row.script,
          score: row.score,
          scenario: row.scenario,
        })),
      };
    });
    const steps = groupedRows.flatMap((group, index) => {
      const canonicalVariant = [...group.csr_variants].sort((left, right) => right.score - left.score)[0];
      const memberScript = group.member_rows.map((row) => row.script.trim()).filter(Boolean).join(' ').trim();
      const memberActorName =
        scenarioForm.member_name.trim()
        || group.member_rows[0]?.actor_name
        || 'Member';
      const memberAudioUrl = group.member_rows.find((row) => row.audio_url)?.audio_url || null;
      const pointValue = Math.max(...group.csr_variants.map((row) => row.score), 0);
      const hasMemberReply = Boolean(memberScript) && index < groupedRows.length - 1;
      const isClosing = index === groupedRows.length - 1;
      const generatedSteps: Array<{
        step_number: number;
        actor: string;
        speaker_label: string;
        script: string;
        expected_keywords: string[];
        audio_url: string | null;
        metadata: Record<string, unknown>;
        is_closing: boolean;
      }> = [
        {
          step_number: (index * 2) + 1,
          actor: 'csr',
          speaker_label: 'CSR',
          script: canonicalVariant?.script || '',
          expected_keywords: aggregateKeywords,
          audio_url: null,
          metadata: {
            point_value: pointValue,
            script_flow_step_id: `scenario-${group.scenario_key}`,
            actor_name: memberActorName,
            scenario: memberScript || group.scenario_key,
            scenario_group: group.scenario_key,
            accepted_variants: group.csr_variants.map((row) => ({
              actor_name: row.actor_name,
              script: row.script,
              score: row.score,
              scenario: row.scenario,
            })),
            member_script: memberScript,
            member_audio_url: memberAudioUrl,
          },
          is_closing: isClosing,
        },
      ];
      if (hasMemberReply) {
        generatedSteps.push({
          step_number: (index * 2) + 2,
          actor: 'member',
          speaker_label: memberActorName,
          script: memberScript,
          expected_keywords: [],
          audio_url: memberAudioUrl,
          metadata: {
            point_value: 0,
            script_flow_step_id: '',
            actor_name: memberActorName,
            scenario: memberScript || group.scenario_key,
            scenario_group: group.scenario_key,
            accepted_variants: [],
            member_script: memberScript,
            member_audio_url: memberAudioUrl,
          },
          is_closing: false,
        });
      }
      return generatedSteps;
    });

    setSaving(true);
    try {
      const firstGroup = groupedRows[0];
      const firstMemberLine = firstGroup?.member_rows[0]?.script || '';
      const firstMemberActor = firstGroup?.member_rows[0]?.actor_name || '';
      const variations = groupedRows.flatMap((group) =>
        group.csr_variants.map((row) => ({
          actor_name: row.actor_name,
          script: row.script,
          score: row.score,
          branching_logic: row.scenario,
        })),
      );
      const payload = {
        title: scenarioForm.title.trim(),
        description: scenarioForm.description.trim() || null,
        opening_prompt: scenarioForm.opening_prompt.trim() || 'Answer the call and deliver the expected CSR spiel.',
        batch_id: selectedBatch,
        expected_keywords: aggregateKeywords,
        estimated_duration: Number(scenarioForm.estimated_duration || 120),
        script_rows: rows,
        member_profile: {
          name: scenarioForm.member_name.trim() || firstMemberActor || 'Scenario Member',
          member_id: scenarioForm.member_id.trim() || null,
          plan_type: scenarioForm.plan_type.trim() || null,
          verification_status: scenarioForm.verification_status.trim() || null,
          problem_statement: scenarioForm.problem_statement.trim() || firstMemberLine || null,
        },
        cxone_metadata: {
          member_name: scenarioForm.member_name.trim() || firstMemberActor || 'Scenario Member',
          member_id: scenarioForm.member_id.trim() || null,
          plan_type: scenarioForm.plan_type.trim() || null,
          verification_status: scenarioForm.verification_status.trim() || null,
          scenario_group: scenarioForm.scenario_group_label.trim() || null,
          problem_statement: scenarioForm.problem_statement.trim() || firstMemberLine || scenarioForm.description.trim() || null,
        },
        call_simulation_config: {
          mode: 'dialer_call_scenario',
          topic: scenarioForm.topic.trim() || scenarioForm.title.trim(),
          scenario_group_label: scenarioForm.scenario_group_label.trim() || null,
          target_kpis: targetKpis,
          script_flow: scriptFlow,
          script_rows: rows,
          certification_threshold: Number(targetKpis.passing_score || 80),
          interface: 'nice-cxone',
          trainee_talk_icon: true,
          member_talk_icon: true,
          show_actor_script_overlay: true,
          require_hold_before_member_response: true,
        },
        difficulty: scenarioForm.difficulty || 'intermediate',
        steps,
        variations,
      };

      const response = await authedFetch(
        editingScenarioId ? `/api/call-simulation/scenarios/${editingScenarioId}` : '/api/call-simulation/scenarios',
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

      const savedScenario = (await response.json().catch(() => null)) as Scenario | null;
      const scenarioReference = savedScenario?.id ? savedScenario : editingScenarioId;

      if (scenarioReference) {
        try {
          await syncScenarioRecordToSupabase(scenarioReference);
        } catch (syncError) {
          console.warn('Call simulation scenario Supabase sync failed:', syncError);
          toast.error('Scenario saved locally, but Supabase scenario/script sync did not complete.');
        }

        try {
          await syncScenarioKpiMetrics(
            [typeof scenarioReference === 'string' ? scenarioReference : scenarioReference.id],
            kpiForm,
          );
        } catch (syncError) {
          console.warn('Call simulation KPI metric Supabase sync failed:', syncError);
          toast.error('Scenario saved locally, but KPI metric sync to Supabase did not complete.');
        }
      }

      setShowScenarioDialog(false);
      setEditingScenarioId(null);
      setScenarioForm(createDefaultScenarioForm());
      toast.success(editingScenarioId ? 'Scenario updated.' : 'Scenario created.');
      try {
        await refreshScenarioData();
      } catch (refreshError) {
        console.error(refreshError);
        toast.error(`Scenario saved, but ${getErrorMessage(refreshError, 'the Call Simulation workspace could not refresh right away.')}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to save scenario.');
    } finally {
      setSaving(false);
    }
  };

  const toggleAssignmentTrainee = (traineeId: string, checked: boolean) => {
    setSelectedAssignmentTrainees((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(traineeId);
      } else {
        next.delete(traineeId);
      }
      return Array.from(next);
    });
  };

  const handleAssignScenario = async () => {
    if (!assignScenarioId || !assignBatchId) {
      toast.error('Choose a scenario and batch before assigning.');
      return;
    }

    setSaving(true);
    try {
      const response = await authedFetch('/api/call-simulation/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: assignScenarioId,
          batch_id: assignBatchId,
          trainee_ids: selectedAssignmentTrainees,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Unable to assign scenario');
      }
      setShowAssignDialog(false);
      setAssignmentTargets([]);
      setSelectedAssignmentTrainees([]);
      if (assignBatchId !== selectedBatch) {
        setSelectedBatch(assignBatchId);
      } else {
        await refreshScenarioData();
      }
      toast.success(
        selectedAssignmentTrainees.length > 0
          ? `Scenario assigned to ${selectedAssignmentTrainees.length} trainee${selectedAssignmentTrainees.length === 1 ? '' : 's'}.`
          : 'Scenario removed from all trainee assignments in this batch.',
      );
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
        kpiConfig ? `/api/call-simulation/kpi-config/${selectedBatch}` : '/api/call-simulation/kpi-config',
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
      const scenarioIds = scenarios.map((scenario) => scenario.id).filter(Boolean);
      if (scenarioIds.length > 0) {
        try {
          await syncScenarioKpiMetrics(scenarioIds, kpiForm);
        } catch (syncError) {
          console.warn('Call simulation KPI management Supabase sync failed:', syncError);
          toast.error('KPI configuration saved locally, but KPI metric sync to Supabase did not complete.');
        }
      }
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
      const response = await authedFetch(`/api/call-simulation/bulk-upload-template?format=${format}`);
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Unable to download the upload template');
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = format === 'csv' ? 'call-simulation-template.csv' : 'call-simulation-template.xlsx';
      anchor.click();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to download the upload template.');
    }
  };

  const handleBulkUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!selectedBatch || !file) {
      toast.error(
        !selectedBatch
          ? 'Select a batch and choose a CSV, Excel, TXT, or DOCX scenario file first.'
          : 'Choose a CSV, Excel, TXT, or DOCX scenario file first.',
      );
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const params = new URLSearchParams({ batch_id: selectedBatch });
      if (bulkTitle.trim()) {
        params.set('scenario_title', bulkTitle.trim());
      }
      const response = await authedFetch(`/api/call-simulation/bulk-upload?${params.toString()}`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Unable to bulk upload scenarios');
      }

      const scenarioId = payload?.scenario_id;
      if (scenarioId) {
        try {
          const syncResponse = await authedFetch('/api/call-simulation/scenarios/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenarioId, syncFromDatabase: true }),
          });
          if (!syncResponse.ok) {
            throw new Error('Supabase scenario sync failed');
          }
          await syncScenarioRecordToSupabase(String(scenarioId));
        } catch (syncError) {
          console.warn('Call simulation bulk-upload Supabase sync failed:', syncError);
          toast.error('Bulk upload saved locally, but Supabase scenario/script sync did not complete.');
        }

        try {
          await syncScenarioKpiMetrics([String(scenarioId)], kpiForm);
        } catch (syncError) {
          console.warn('Call simulation bulk-upload KPI sync failed:', syncError);
          toast.error('Bulk upload saved locally, but KPI metric sync to Supabase did not complete.');
        }
      }

      setBulkTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowBulkDialog(false);
      toast.success('Bulk upload completed.');
      try {
        await refreshScenarioData();
      } catch (refreshError) {
        console.error(refreshError);
        toast.error(`Bulk upload saved, but ${getErrorMessage(refreshError, 'the Call Simulation workspace could not refresh right away.')}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to bulk upload scenarios.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadCallToneAsset = useCallback(
    (target: 'ringer' | 'hold') => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';

      input.onchange = async () => {
        const selectedFile = input.files?.[0];
        if (!selectedFile) {
          input.remove();
          return;
        }

        setUploadingAudioTarget(target);

        try {
          const formData = new FormData();
          formData.append('file', selectedFile);
          formData.append('asset_kind', target);

          const response = await authedFetch('/api/call-simulation/assets/audio', {
            method: 'POST',
            body: formData,
          });
          const payload = (await response.json().catch(() => null)) as AudioAssetUploadResponse | { detail?: string } | null;
          if (!response.ok || !payload || !('audio_url' in payload)) {
            throw new Error((payload && 'detail' in payload && payload.detail) || 'Unable to upload the audio asset');
          }

          applyCallToneSettings(payload.settings || {
            ...callToneSettings,
            ...(target === 'ringer' ? { ringer_audio_url: payload.audio_url } : { hold_audio_url: payload.audio_url }),
          });
          
          try {
            const audioSettings = payload.settings || {
              ...callToneSettings,
              ...(target === 'ringer' ? { ringer_audio_url: payload.audio_url } : { hold_audio_url: payload.audio_url }),
            };
            await authedFetch('/api/call-simulation/audio/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ settings: audioSettings }),
            });
          } catch (syncError) {
            console.warn('Call tone audio Supabase sync failed:', syncError);
          }

          toast.success(`${target === 'ringer' ? 'Ringer' : 'Hold'} audio uploaded and applied to your Call Simulation scenarios.`);
          try {
            await refreshScenarioData();
          } catch (refreshError) {
            console.error(refreshError);
            toast.error(`${target === 'ringer' ? 'Ringer' : 'Hold'} audio was saved, but ${getErrorMessage(refreshError, 'the Call Simulation workspace could not refresh right away.')}`);
          }
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
    [applyCallToneSettings, authedFetch, callToneSettings, refreshScenarioData],
  );

  const handleSaveCallTone = useCallback(async (target: 'ringer' | 'hold') => {
    const audioUrl = target === 'ringer' ? callToneSettings.ringer_audio_url.trim() : callToneSettings.hold_audio_url.trim();
    setSavingCallToneTarget(target);
    try {
      const response = await authedFetch('/api/call-simulation/audio-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(target === 'ringer' ? { ringer_audio_url: audioUrl || null } : { hold_audio_url: audioUrl || null }),
        }),
      });
      const payload = (await response.json().catch(() => null)) as CallSimulationAudioSettings | { detail?: string } | null;
      if (!response.ok || !payload) {
        throw new Error((payload && 'detail' in payload && payload.detail) || 'Unable to save the audio setting');
      }

      applyCallToneSettings(payload as CallSimulationAudioSettings);
      
      try {
        await authedFetch('/api/call-simulation/audio/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: payload }),
        });
      } catch (syncError) {
        console.warn('Call tone audio Supabase sync failed:', syncError);
      }

      toast.success(`${target === 'ringer' ? 'Ringer' : 'Hold'} audio saved for all of your Call Simulation scenarios.`);
      try {
        await refreshScenarioData();
      } catch (refreshError) {
        console.error(refreshError);
        toast.error(`${target === 'ringer' ? 'Ringer' : 'Hold'} audio was saved, but ${getErrorMessage(refreshError, 'the Call Simulation workspace could not refresh right away.')}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to save the audio setting.');
    } finally {
      setSavingCallToneTarget(null);
    }
  }, [applyCallToneSettings, authedFetch, callToneSettings.hold_audio_url, callToneSettings.ringer_audio_url, refreshScenarioData]);

  const handleDeleteCallTone = useCallback(async (target: 'ringer' | 'hold') => {
    setSavingCallToneTarget(target);
    try {
      const response = await authedFetch(`/api/call-simulation/audio-settings?asset_kind=${encodeURIComponent(target)}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => null)) as CallSimulationAudioSettings | { detail?: string } | null;
      if (!response.ok || !payload) {
        throw new Error((payload && 'detail' in payload && payload.detail) || 'Unable to remove the audio setting');
      }

      applyCallToneSettings(payload as CallSimulationAudioSettings);
      toast.success(`${target === 'ringer' ? 'Ringer' : 'Hold'} audio removed from your Call Simulation scenarios.`);
      try {
        await refreshScenarioData();
      } catch (refreshError) {
        console.error(refreshError);
        toast.error(`${target === 'ringer' ? 'Ringer' : 'Hold'} audio was removed, but ${getErrorMessage(refreshError, 'the Call Simulation workspace could not refresh right away.')}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to remove the audio setting.');
    } finally {
      setSavingCallToneTarget(null);
    }
  }, [applyCallToneSettings, authedFetch, refreshScenarioData]);

  const requestMemberSpeechAsset = useCallback(async (script: string, rowIndex: number) => {
      const params = new URLSearchParams({
        text: script.trim(),
        persist: 'true',
        asset_kind: 'member-step',
        step_number: String(rowIndex + 1),
      });
      if (editingScenarioId) {
        params.set('scenario_id', editingScenarioId);
      }

      const response = await authedFetch(`/api/call-simulation/tts?${params.toString()}`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as MemberSpeechAssetResponse | null;
      if (!response.ok || !payload?.audio_url) {
        throw new Error(payload?.detail || 'Unable to generate member speech');
      }

      return {
        audioUrl: payload.audio_url,
        warning: payload.warning || null,
        storageMode: payload.storage_mode || null,
      };
    }, [authedFetch, editingScenarioId]);

  const handleGenerateMemberSpeech = useCallback(async (rowIndex: number) => {
    const row = scenarioForm.rows[rowIndex];
    if (!row || isCsrActor(row.actor_name)) {
      toast.error('Generate speech is only available for Member rows.');
      return;
    }
    if (!row.script.trim()) {
      toast.error('Add the Member script first before generating speech.');
      return;
    }

    setGeneratingSpeechRowIndex(rowIndex);
    try {
      const result = await requestMemberSpeechAsset(row.script.trim(), rowIndex);

      setScenarioForm((previous) => ({
        ...previous,
        rows: previous.rows.map((entry, entryIndex) => (
          entryIndex === rowIndex
            ? { ...entry, audio_url: result.audioUrl || '' }
            : entry
        )),
      }));
      if (result.warning) {
        toast.success('Member speech generated and saved for trainee playback.');
        toast(result.warning);
      } else {
        toast.success('Member speech generated and stored in Supabase.');
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to generate member speech.');
    } finally {
      setGeneratingSpeechRowIndex(null);
    }
  }, [requestMemberSpeechAsset, scenarioForm.rows]);

  const handleGenerateAllMemberSpeech = useCallback(async () => {
    const memberRowsToGenerate = scenarioForm.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !isCsrActor(row.actor_name) && row.script.trim());

    if (memberRowsToGenerate.length === 0) {
      toast.error('Add at least one Member script before generating speech.');
      return;
    }

    setIsGeneratingAllMemberSpeech(true);
    setMemberSpeechGenerationProgress({ current: 0, total: memberRowsToGenerate.length });

    let successCount = 0;
    let failedCount = 0;
    let firstFailureMessage: string | null = null;

    try {
      for (const [sequenceIndex, entry] of memberRowsToGenerate.entries()) {
        setGeneratingSpeechRowIndex(entry.index);
        setMemberSpeechGenerationProgress({ current: sequenceIndex + 1, total: memberRowsToGenerate.length });

        try {
          const result = await requestMemberSpeechAsset(entry.row.script.trim(), entry.index);
          setScenarioForm((previous) => ({
            ...previous,
            rows: previous.rows.map((row, rowIndex) => (
              rowIndex === entry.index
                ? { ...row, audio_url: result.audioUrl || '' }
                : row
            )),
          }));
          successCount += 1;
        } catch (error) {
          console.error(error);
          failedCount += 1;
          if (!firstFailureMessage) {
            firstFailureMessage =
              error instanceof Error
                ? error.message
                : `Unable to generate speech for Member row ${entry.index + 1}.`;
          }
        }
      }

      if (failedCount === 0) {
        toast.success(`Generated Gemini speech for ${successCount} Member row${successCount === 1 ? '' : 's'}.`);
        return;
      }

      if (successCount > 0) {
        toast.error(
          `${successCount} Member row${successCount === 1 ? '' : 's'} generated, but ${failedCount} failed. ${firstFailureMessage || ''}`.trim(),
        );
        return;
      }

      throw new Error(firstFailureMessage || 'Unable to generate Member speech.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to generate Member speech.');
    } finally {
      setGeneratingSpeechRowIndex(null);
      setIsGeneratingAllMemberSpeech(false);
      setMemberSpeechGenerationProgress(null);
    }
  }, [requestMemberSpeechAsset, scenarioForm.rows]);

  const handleBulkFileSelected = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    if (!bulkTitle.trim()) {
      const inferredTitle = parseBulkScenarioFileName(selectedFile.name).title;
      if (inferredTitle) {
        setBulkTitle(inferredTitle);
      }
    }
  }, [bulkTitle]);

  const openCoachingDialog = (interaction: InteractionSession) => {
    setSelectedInteraction(interaction);
    setCoachingNotes(interaction.trainer_verdict_notes || interaction.coaching_notes || '');
    setVerdictStatus(normalizeVerdictStatus(interaction.trainer_verdict_status));
    setPlaybackTime(0);
    setShowCoachingDialog(true);
  };

  const persistCoachingNotes = useCallback(async () => {
    if (!selectedInteraction) return null;
    const response = await authedFetch(`/api/call-simulation/coaching/interactions/${selectedInteraction.id}/notes`, {
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
      const response = await authedFetch(`/api/call-simulation/coaching/interactions/${selectedInteraction.id}/verdict`, {
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
  const memberRows = useMemo(
    () => scenarioForm.rows.filter((row) => !isCsrActor(row.actor_name)),
    [scenarioForm.rows],
  );
  const scenarioGroupSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          scenarioForm.rows
            .map((row) => row.scenario.trim())
            .filter(Boolean),
        ),
      ),
    [scenarioForm.rows],
  );
  const completeScenarioRowCount = useMemo(
    () => scenarioForm.rows.filter((row) => row.actor_name.trim() && row.scenario.trim() && row.script.trim()).length,
    [scenarioForm.rows],
  );
  const memberRowsWithScriptCount = useMemo(
    () => memberRows.filter((row) => row.script.trim()).length,
    [memberRows],
  );
  const memberAudioReadyCount = useMemo(
    () => memberRows.filter((row) => row.audio_url.trim()).length,
    [memberRows],
  );
  const updateScenarioRow = useCallback((index: number, field: keyof ScenarioRowForm, value: string) => {
    setScenarioForm((previous) => ({
      ...previous,
      rows: previous.rows.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }
        if (field === 'actor_name') {
          const nextActor = normalizeScenarioRowActor(value);
          return {
            ...row,
            actor_name: nextActor,
            score: row.score.trim() || (nextActor === 'Member' ? '0' : row.score),
          };
        }
        return { ...row, [field]: value };
      }),
    }));
  }, []);
  const addScenarioRow = useCallback(() => {
    setScenarioForm((previous) => {
      const lastRow = previous.rows[previous.rows.length - 1];
      const nextGroup = getNextScenarioGroupValue(previous.rows);
      const newRow = lastRow
        ? createScenarioRow({
            actor_name: isCsrActor(lastRow.actor_name) ? 'Member' : 'CSR',
            scenario: isCsrActor(lastRow.actor_name)
              ? (lastRow.scenario.trim() || nextGroup)
              : nextGroup,
          })
        : createScenarioRow({ actor_name: 'CSR', scenario: '1' });

      return {
        ...previous,
        rows: [...previous.rows, newRow],
      };
    });
  }, []);
  const removeScenarioRow = useCallback((index: number) => {
    setScenarioForm((previous) => ({
      ...previous,
      rows: previous.rows.length === 1 ? previous.rows : previous.rows.filter((_, rowIndex) => rowIndex !== index),
    }));
  }, []);

  return (
    <DashboardLayout sidebarItems={sidebarItems} userRole="trainer">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Call Simulation Management</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage the full scenario library, assign scenarios to batches, monitor CSR response scoring, and review
              trainee recordings for coaching.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (!selectedBatch) return;
              void Promise.all([loadBatchData(selectedBatch), fetchCallToneSettings()]);
            }}
            disabled={!selectedBatch || loading}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <Card className="border-sky-200/80 bg-slate-50/70 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Shared Call Audio</CardTitle>
                <CardDescription>
                  Upload or paste the trainer-wide ringer and hold audio once. These tones are saved to Supabase and automatically
                  applied across every Call Simulation scenario you create.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit bg-white text-slate-700">
                {callToneSettings.updated_at ? `Updated ${new Date(callToneSettings.updated_at).toLocaleString()}` : 'No shared audio saved yet'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Ringer Audio</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Plays when the trainee starts a scenario and receives the incoming mock call.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUploadCallToneAsset('ringer')}
                    disabled={uploadingAudioTarget === 'ringer'}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadingAudioTarget === 'ringer' ? 'Uploading...' : 'Upload Audio'}
                  </Button>
                </div>
                <div className="mt-4 space-y-2">
                  <Label>Ringer Audio URL</Label>
                  <Input
                    value={callToneSettings.ringer_audio_url}
                    onChange={(event) => setCallToneSettings((previous) => ({ ...previous, ringer_audio_url: event.target.value }))}
                    placeholder="Paste a Supabase or public audio URL"
                    disabled={loadingCallToneSettings}
                  />
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleSaveCallTone('ringer')}
                    disabled={savingCallToneTarget === 'ringer' || loadingCallToneSettings}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {savingCallToneTarget === 'ringer' ? 'Saving...' : 'Save Ringer Audio'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleDeleteCallTone('ringer')}
                    disabled={savingCallToneTarget === 'ringer' || uploadingAudioTarget === 'ringer' || !callToneSettings.ringer_audio_url.trim()}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove Audio
                  </Button>
                </div>
                {callToneSettings.ringer_audio_url ? (
                  <audio controls preload="metadata" className="mt-4 w-full" src={callToneSettings.ringer_audio_url}>
                    Your browser does not support audio preview.
                  </audio>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                    No shared ringer audio has been saved yet.
                  </div>
                )}
              </div>

              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Hold Audio</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Plays whenever the trainee places the caller on hold before the Member response continues.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUploadCallToneAsset('hold')}
                    disabled={uploadingAudioTarget === 'hold'}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadingAudioTarget === 'hold' ? 'Uploading...' : 'Upload Audio'}
                  </Button>
                </div>
                <div className="mt-4 space-y-2">
                  <Label>Hold Audio URL</Label>
                  <Input
                    value={callToneSettings.hold_audio_url}
                    onChange={(event) => setCallToneSettings((previous) => ({ ...previous, hold_audio_url: event.target.value }))}
                    placeholder="Paste a Supabase or public audio URL"
                    disabled={loadingCallToneSettings}
                  />
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleSaveCallTone('hold')}
                    disabled={savingCallToneTarget === 'hold' || loadingCallToneSettings}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {savingCallToneTarget === 'hold' ? 'Saving...' : 'Save Hold Audio'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleDeleteCallTone('hold')}
                    disabled={savingCallToneTarget === 'hold' || uploadingAudioTarget === 'hold' || !callToneSettings.hold_audio_url.trim()}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove Audio
                  </Button>
                </div>
                {callToneSettings.hold_audio_url ? (
                  <audio controls preload="metadata" className="mt-4 w-full" src={callToneSettings.hold_audio_url}>
                    Your browser does not support audio preview.
                  </audio>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                    No shared hold audio has been saved yet.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

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
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="h-full">
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
                                <div key={`${variation.actor_name}-${index}`}>{variation.actor_name}: {variation.score} pts</div>
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

            <Card className="h-full">
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
                            <div key={`${scenario.id}-variation-${index}`}>{variation.actor_name}: {variation.score} pts</div>
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
            <CardTitle>Accomplished Mock Calls</CardTitle>
            <CardDescription>Review finished trainee scenarios, replay the Supabase recording, and send coaching or retake guidance.</CardDescription>
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

      <Dialog
        open={showScenarioDialog}
        onOpenChange={(open) => {
          setShowScenarioDialog(open);
          if (!open) {
            setGeneratingSpeechRowIndex(null);
            setIsGeneratingAllMemberSpeech(false);
            setMemberSpeechGenerationProgress(null);
          }
        }}
      >
        <DialogContent className="flex h-[94vh] max-h-[94vh] max-w-[98vw] flex-col overflow-hidden p-0 sm:max-w-7xl 2xl:max-w-[1800px]">
          <DialogHeader className="shrink-0 border-b bg-white px-6 py-5">
            <DialogTitle>{editingScenarioId ? 'Edit Scenario' : 'Create Scenario'}</DialogTitle>
            <DialogDescription>
              Build a clean trainer flow with Scenario title, topic, description, then alternating CSR and Member rows
              that persist to Supabase and drive the trainee mock call.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
            <div className="min-h-0 space-y-5 overflow-y-auto border-b bg-slate-50/70 p-6 pb-8 lg:border-b-0 lg:border-r">
              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Scenario Overview</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      These values become the trainer-facing title, trainee topic label, and saved Supabase scenario metadata.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full shrink-0 xl:w-auto"
                    onClick={() => void handleGenerateAllMemberSpeech()}
                    disabled={isGeneratingAllMemberSpeech || memberRowsWithScriptCount === 0}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isGeneratingAllMemberSpeech ? 'animate-spin' : ''}`} />
                    {isGeneratingAllMemberSpeech
                      ? `Generating ${memberSpeechGenerationProgress?.current ?? 0}/${memberSpeechGenerationProgress?.total ?? memberRowsWithScriptCount}`
                      : 'Generate Speech'}
                  </Button>
                </div>
                <div className="mb-4 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-cyan-950">Member AI audio coverage</div>
                      <p className="mt-1 text-xs text-cyan-900/80">
                        One click will convert every Member script into Gemini speech and store each audio file in Supabase.
                      </p>
                    </div>
                    <Badge variant="secondary" className="w-fit bg-white text-cyan-950">
                      {memberAudioReadyCount}/{memberRowsWithScriptCount || memberRows.length || 0} ready
                    </Badge>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Scenario Title</Label>
                    <Input
                      value={scenarioForm.title}
                      onChange={(event) => setScenarioForm((previous) => ({ ...previous, title: event.target.value }))}
                      placeholder="Healthy Benefits Plus verification flow"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scenario Topic</Label>
                    <Input
                      value={scenarioForm.topic}
                      onChange={(event) => setScenarioForm((previous) => ({ ...previous, topic: event.target.value }))}
                      placeholder="Benefits verification, escalations, billing dispute"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={scenarioForm.description}
                      onChange={(event) => setScenarioForm((previous) => ({ ...previous, description: event.target.value }))}
                      rows={4}
                      placeholder="Describe the call objective, customer need, and coaching focus."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scenario Group</Label>
                    <Input
                      value={scenarioForm.scenario_group_label}
                      onChange={(event) => setScenarioForm((previous) => ({ ...previous, scenario_group_label: event.target.value }))}
                      placeholder="Benefits Balance, Card Replacement, Billing Escalation"
                    />
                    <p className="text-xs text-slate-500">
                      Save the broader scenario family here, then use the row-level Scenario Group field to organize each call turn.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-slate-950">Member Context</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    This information appears in the BPO-style trainee call workspace and helps anchor the conversation.
                  </p>
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
                  <div className="space-y-2">
                    <Label>Plan Type</Label>
                    <Input value={scenarioForm.plan_type} onChange={(event) => setScenarioForm((previous) => ({ ...previous, plan_type: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Verification Status</Label>
                    <Input value={scenarioForm.verification_status} onChange={(event) => setScenarioForm((previous) => ({ ...previous, verification_status: event.target.value }))} />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Label>Problem Statement</Label>
                  <Textarea value={scenarioForm.problem_statement} onChange={(event) => setScenarioForm((previous) => ({ ...previous, problem_statement: event.target.value }))} rows={4} />
                </div>
              </div>

              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-slate-950">Call Setup and KPI Metadata</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Keep the whitespace clean here and use these advanced settings to tune playback, timing, and scoring.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Opening Prompt</Label>
                    <Textarea value={scenarioForm.opening_prompt} onChange={(event) => setScenarioForm((previous) => ({ ...previous, opening_prompt: event.target.value }))} rows={3} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Global KPI Keywords</Label>
                      <Textarea value={scenarioForm.expected_keywords} onChange={(event) => setScenarioForm((previous) => ({ ...previous, expected_keywords: event.target.value }))} rows={3} />
                    </div>
                    <div className="space-y-2">
                      <Label>Estimated Duration</Label>
                      <Input type="number" value={scenarioForm.estimated_duration} onChange={(event) => setScenarioForm((previous) => ({ ...previous, estimated_duration: event.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Target KPIs JSON</Label>
                    <Textarea
                      value={scenarioForm.target_kpis_json}
                      onChange={(event) => setScenarioForm((previous) => ({ ...previous, target_kpis_json: event.target.value }))}
                      rows={7}
                    />
                    <p className="text-xs text-slate-500">
                      Stored in Supabase-linked scenario metadata and reused by the dialer feedback sync route.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950">
                    Shared ringer and hold audio now live in <span className="font-semibold">Call Simulation Management</span> above.
                    Any change there is saved to Supabase and applied automatically to every scenario you create.
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 space-y-5 overflow-y-auto p-6 pb-8">
              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Scenario Builder</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Use Actor, Script, Score, and Scenario Group rows. Keep at least 5 completed rows, and generate Member audio for hold playback.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => addScenarioRow()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Script
                  </Button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Completed Rows</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{completeScenarioRowCount}</div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Scenario Groups</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{scenarioGroupSuggestions.length || 0}</div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Member Audio Rows</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">
                      {memberAudioReadyCount}
                    </div>
                  </div>
                </div>
              </div>

              {scenarioForm.rows.map((row, index) => {
                const memberRow = !isCsrActor(row.actor_name);
                return (
                  <div key={`row-${index}`} className="space-y-4 rounded-3xl border bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">Row {index + 1}</Badge>
                        <Badge variant={memberRow ? 'secondary' : 'default'}>
                          {memberRow ? 'Member (AI)' : 'CSR'}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeScenarioRow(index)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove Row
                      </Button>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Actor</Label>
                          <Select value={normalizeScenarioRowActor(row.actor_name)} onValueChange={(value) => updateScenarioRow(index, 'actor_name', value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select actor" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CSR">CSR</SelectItem>
                              <SelectItem value="Member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Scenario Group</Label>
                          <Input
                            list="call-simulation-scenario-groups"
                            value={row.scenario}
                            onChange={(event) => updateScenarioRow(index, 'scenario', event.target.value)}
                            placeholder="1"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Score</Label>
                          <Input
                            type="number"
                            min="0"
                            value={row.score}
                            onChange={(event) => updateScenarioRow(index, 'score', event.target.value)}
                            placeholder={memberRow ? '0 or optional weight' : '0-100'}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Script</Label>
                        <Textarea
                          value={row.script}
                          onChange={(event) => updateScenarioRow(index, 'script', event.target.value)}
                          rows={4}
                          placeholder={memberRow ? 'Write the Member reply that Gemini should read on hold.' : 'Write the exact CSR script the trainee should say.'}
                        />
                      </div>
                    </div>

                    {memberRow ? (
                      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-medium text-cyan-950">Member AI Speech</div>
                            <p className="mt-1 text-xs text-cyan-900/80">
                              Generate Gemini speech for this Member row and store the playable asset in Supabase storage.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleGenerateMemberSpeech(index)}
                            disabled={isGeneratingAllMemberSpeech || generatingSpeechRowIndex === index || !row.script.trim()}
                          >
                            <RefreshCw className={`mr-2 h-4 w-4 ${generatingSpeechRowIndex === index ? 'animate-spin' : ''}`} />
                            {generatingSpeechRowIndex === index ? 'Generating...' : row.audio_url ? 'Regenerate Speech' : 'Generate Speech'}
                          </Button>
                        </div>
                        <div className="mt-3 space-y-2">
                          <Label>Generated Audio URL</Label>
                          <Input
                            value={formatGeneratedAudioValue(row.audio_url)}
                            onChange={(event) => updateScenarioRow(index, 'audio_url', event.target.value)}
                            placeholder="Stored Supabase audio URL"
                            readOnly={isEmbeddedAudioDataUrl(row.audio_url)}
                          />
                          {isEmbeddedAudioDataUrl(row.audio_url) ? (
                            <p className="text-xs text-cyan-900/80">
                              Supabase storage is unavailable right now, so this row is carrying embedded audio inside the saved scenario data.
                            </p>
                          ) : null}
                          {row.audio_url ? (
                            <audio controls className="w-full" src={row.audio_url}>
                              Your browser does not support audio preview.
                            </audio>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                        CSR rows become the trainee scoring checkpoints. Add acceptable spiel variants with the same Scenario Group if the trainer wants multiple correct answers.
                      </div>
                    )}
                  </div>
                );
              })}

              <datalist id="call-simulation-scenario-groups">
                {scenarioGroupSuggestions.map((group) => (
                  <option key={group} value={group} />
                ))}
              </datalist>

              <div className="rounded-3xl border border-dashed bg-slate-50 p-4 text-sm text-slate-600">
                Bulk upload tip: spreadsheet uploads use the exact `Actor`, `Script`, `Score`, and `Scenario` columns.
                TXT and DOCX uploads use the file name pattern `Title_Topic_Description`, then structured lines like
                `Actor | Script | Score | Scenario`.
              </div>
            </div>
          </div>
          <div className="shrink-0 border-t bg-white px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-xs text-slate-500">
                Keep at least 5 complete rows, make sure Member rows have playable audio, and use Save when the scenario is ready for trainees.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setShowScenarioDialog(false)}>Cancel</Button>
                <Button onClick={handleSaveScenario} disabled={saving || isGeneratingAllMemberSpeech}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : editingScenarioId ? 'Update Scenario' : 'Create Scenario'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showKpiDialog} onOpenChange={setShowKpiDialog}>
        <DialogContent className="max-h-[90vh] h-[90vh] max-w-[96vw] overflow-hidden p-0 sm:max-w-6xl 2xl:max-w-7xl">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>KPI Management</DialogTitle>
            <DialogDescription>
              Keep the KPI Management panel wide and clean. The scoring weights below are saved to Supabase for the selected batch.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="grid flex-1 overflow-hidden gap-0 lg:grid-cols-2">
              <div className="space-y-5 overflow-y-auto border-b bg-slate-50/70 p-6 lg:border-b-0 lg:border-r">
                <div className="rounded-3xl border bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-950">Score Balance</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    The core and behavioral weights should stay close to 100% so the trainee’s final score remains predictable.
                  </p>
                  <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Weight</div>
                    <div className="mt-2 text-3xl font-semibold text-slate-950">{Math.round(totalWeight * 10) / 10}%</div>
                    <p className="mt-2 text-sm text-slate-500">
                      Passing score, AHT, rate of speech, and dead-air targets are also persisted with this batch configuration.
                    </p>
                  </div>
                </div>
                <div className="rounded-3xl border bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-950">Keyword Lists</h3>
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Forbidden Words</Label>
                      <Textarea value={kpiForm.forbidden_words.join(', ')} onChange={(event) => setKpiForm((previous) => ({ ...previous, forbidden_words: splitKeywords(event.target.value) }))} rows={4} />
                    </div>
                    <div className="space-y-2">
                      <Label>Empathy Keywords</Label>
                      <Textarea value={kpiForm.empathy_keywords.join(', ')} onChange={(event) => setKpiForm((previous) => ({ ...previous, empathy_keywords: splitKeywords(event.target.value) }))} rows={4} />
                    </div>
                    <div className="space-y-2">
                      <Label>Probing Keywords</Label>
                      <Textarea value={kpiForm.probing_keywords.join(', ')} onChange={(event) => setKpiForm((previous) => ({ ...previous, probing_keywords: splitKeywords(event.target.value) }))} rows={4} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="overflow-y-auto p-6">
                <div className="rounded-3xl border bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-950">Weight Inputs</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 border-t bg-white px-6 py-4">
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
              Upload a CSV, Excel, TXT, or DOCX file. Spreadsheet uploads use `Actor`, `Script`, `Score`, and
              `Scenario` columns, while TXT or DOCX files use the file name pattern `Title_Topic_Description` and structured
              lines like `Actor | Script | Score | Scenario`.
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
              <Label>Scenario Title Override</Label>
              <Input value={bulkTitle} onChange={(event) => setBulkTitle(event.target.value)} placeholder="Optional. Leave blank to use the file name title segment." />
            </div>
            <div className="space-y-2">
              <Label>Upload File</Label>
              <Input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.txt,.docx" onChange={handleBulkFileSelected} />
              <p className="text-xs text-slate-500">
                For TXT and DOCX, the platform parses `Title_Topic_Description` into the Scenario Title, Scenario Topic,
                and Description before syncing the scenario to Supabase.
              </p>
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
            <DialogTitle>Assign Scenario to Trainees</DialogTitle>
            <DialogDescription>
              Choose a batch, then select exactly which trainees should see this Call Simulation on the trainee side.
            </DialogDescription>
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
                <div className="font-medium text-slate-900">{selectedAssignScenario.title}</div>
                <div className="mt-1">
                  {selectedAssignScenario.variations_count} scored CSR responses are available for this scenario.
                </div>
                <div className="mt-1">
                  {selectedAssignmentTrainees.length} trainee{selectedAssignmentTrainees.length === 1 ? '' : 's'} will receive the assignment in this batch.
                </div>
              </div>
            ) : null}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Trainees</Label>
                  <p className="text-xs text-muted-foreground">
                    Only checked trainees will see this scenario and be able to start the mock call.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedAssignmentTrainees(assignmentTargets.map((target) => target.trainee_id))}
                    disabled={loadingAssignmentTargets || assignmentTargets.length === 0}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedAssignmentTrainees([])}
                    disabled={loadingAssignmentTargets || assignmentTargets.length === 0}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              {loadingAssignmentTargets ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Loading trainees for this batch...
                </div>
              ) : assignmentTargets.length ? (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {assignmentTargets.map((target) => {
                    const checked = selectedAssignmentTrainees.includes(target.trainee_id);
                    return (
                      <label
                        key={target.trainee_id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition hover:border-slate-300"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleAssignmentTrainee(target.trainee_id, value === true)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900">{target.trainee_name}</div>
                          <div className="text-sm text-muted-foreground">{target.trainee_email}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {target.language_dialect ? `Dialect: ${target.language_dialect}` : 'Dialect not set'}
                            {target.is_assigned && target.assigned_at ? ` | Already assigned on ${formatDateTime(target.assigned_at)}` : ''}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No active trainees were found in this batch.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignScenario} disabled={saving || loadingAssignmentTargets || assignmentTargets.length === 0}>
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
                    <div key={`${turn.turn_attempt_id || turn.step_number || index}-${index}`} className="rounded-lg bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium text-slate-900">
                          Turn {String(turn.step_number || index + 1)}
                          {turn.turn_attempt_number ? ` - Attempt ${String(turn.turn_attempt_number)}` : ''}
                          {turn.speaker_label ? ` - ${String(turn.speaker_label)}` : ''}
                        </div>
                        <div className="text-xs text-slate-500">
                          Accuracy {Number(turn.speech_to_text_accuracy || 0).toFixed(0)}% | Grammar {Number(turn.grammar_score || 0).toFixed(0)}%
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{String(turn.transcript || 'No transcript captured.')}</p>
                      {turn.requires_repeat ? (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Repeat requested: {String(turn.repeat_reason || "The saved response did not match the expected spiel closely enough.")}
                        </div>
                      ) : null}
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
