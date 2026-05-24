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
  max_attempts?: number | null;
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

interface DialerFeedbackKpiBreakdownItem {
  category: string;
  score: number;
  feedback: string;
}

interface DialerFeedbackReport {
  provider: 'gemini' | 'fallback';
  model: string;
  overallSummary: string;
  totalScore: number;
  passingScore: number;
  passed: boolean;
  summary: string;
  overall_score: number;
  strengths: string[];
  areas_for_improvement: string[];
  kpi_breakdown: DialerFeedbackKpiBreakdownItem[];
  coaching_recommendation: string;
  transcript_summary: string;
  scriptAccuracy: {
    score: number;
    strengths: string[];
    misses: string[];
  };
  grammarAndPronunciation: {
    score: number;
    notes: string[];
  };
  softSkills: {
    score: number;
    notes: string[];
  };
  pacingAndAht: {
    ahtSeconds: number;
    notes: string[];
  };
  coachingTips: string[];
}

interface InteractionSession {
  id: string;
  trainee_id?: string;
  trainee_name: string;
  batch_id?: string | null;
  batch_name?: string | null;
  batch_wave_number?: number | null;
  scenario_title: string;
  score: number;
  pass_fail: boolean;
  attempt_number: number;
  audio_url?: string;
  audio_duration_seconds?: number | null;
  transcript?: string;
  transcript_log?: Array<Record<string, unknown>>;
  turn_logs?: Array<Record<string, unknown>>;
  ai_feedback?: string;
  feedback_report?: DialerFeedbackReport | null;
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
  completed_at?: string | null;
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
  category: string;
  description: string;
  scenario_group_label: string;
  opening_prompt: string;
  expected_keywords: string;
  estimated_duration: string;
  passing_score: string;
  max_attempts: string;
  target_kpis_json: string;
  member_name: string;
  member_id: string;
  plan_type: string;
  verification_status: string;
  problem_statement: string;
  difficulty: string;
  ringer_audio_url: string;
  hold_audio_url: string;
  use_shared_ringer_audio: boolean;
  use_shared_hold_audio: boolean;
  rows: ScenarioRowForm[];
}

interface AudioAssetUploadResponse {
  audio_url: string;
  asset_kind: string;
  filename: string;
  scenario_id?: string | null;
  settings?: CallSimulationAudioSettings | null;
  audio_asset?: CallSimulationAudioAssetRecord | null;
}

interface MemberSpeechAssetResponse {
  audio_url?: string | null;
  warning?: string | null;
  storage_mode?: string | null;
  fallback_mode?: string | null;
  provider?: string | null;
  audio_asset?: CallSimulationAudioAssetRecord | null;
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

interface CallSimulationAudioAssetRecord {
  id: string;
  trainer_id: string;
  scenario_id?: string | null;
  script_turn_id?: string | null;
  step_number?: number | null;
  asset_kind: string;
  source_type: string;
  file_name: string;
  file_type: string;
  file_size?: number | null;
  bucket_name?: string | null;
  storage_path?: string | null;
  public_url: string;
  voice_used?: string | null;
  provider?: string | null;
  generated_text?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  topic: '',
  category: '',
  description: '',
  scenario_group_label: '',
  opening_prompt: '',
  expected_keywords: '',
  estimated_duration: '180',
  passing_score: String(defaultKpiForm.passing_score),
  max_attempts: '3',
  target_kpis_json: JSON.stringify(buildTargetKpisFromConfig(defaultKpiForm), null, 2),
  member_name: '',
  member_id: '',
  plan_type: '',
  verification_status: '',
  problem_statement: '',
  difficulty: 'intermediate',
  ringer_audio_url: '',
  hold_audio_url: '',
  use_shared_ringer_audio: true,
  use_shared_hold_audio: true,
  rows: createStarterScenarioRows(),
});

const createDefaultCallSimulationAudioSettings = (): CallSimulationAudioSettings => ({
  ringer_audio_url: '',
  hold_audio_url: '',
  ringer_audio_source: null,
  hold_audio_source: null,
  updated_at: null,
});

const CALL_SIMULATION_AUDIO_MAX_BYTES = 50 * 1024 * 1024;
const CALL_SIMULATION_AUDIO_ACCEPT = '.mp3,.wav,.ogg,.m4a,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,audio/mp3,audio/x-wav';
const CALL_SIMULATION_AUDIO_ALLOWED_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/vorbis',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
]);
const CALL_SIMULATION_AUDIO_ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);

const isEmbeddedAudioDataUrl = (value: string) => value.trim().startsWith('data:audio/');

const getManagedAudioReplacementUrl = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized || isEmbeddedAudioDataUrl(normalized)) {
    return '';
  }
  return normalized;
};

const formatGeneratedAudioValue = (value: string) => {
  if (!value.trim()) {
    return '';
  }
  return isEmbeddedAudioDataUrl(value)
    ? 'Embedded audio saved in the scenario record'
    : value;
};

const getAudioFileExtension = (fileName: string) => {
  const normalizedName = fileName.trim().toLowerCase();
  const dotIndex = normalizedName.lastIndexOf('.');
  return dotIndex >= 0 ? normalizedName.slice(dotIndex) : '';
};

const validateCallSimulationAudioFile = (file: File) => {
  const normalizedType = file.type.trim().toLowerCase();
  const extension = getAudioFileExtension(file.name);
  const typeAllowed = !normalizedType || CALL_SIMULATION_AUDIO_ALLOWED_TYPES.has(normalizedType);
  const extensionAllowed = CALL_SIMULATION_AUDIO_ALLOWED_EXTENSIONS.has(extension);

  if (file.size <= 0) {
    return 'Choose a non-empty audio file before uploading.';
  }
  if (!typeAllowed && !extensionAllowed) {
    return 'Upload an MP3, WAV, OGG, or M4A audio file.';
  }
  if (file.size > CALL_SIMULATION_AUDIO_MAX_BYTES) {
    return 'Call Simulation audio must be 50 MB or smaller.';
  }
  return null;
};

const formatAudioFileSize = (value?: number | null) => {
  if (!value || value <= 0) {
    return 'Unknown size';
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
};

const upsertAudioAssetRecord = (
  existingRecords: CallSimulationAudioAssetRecord[],
  nextRecord?: CallSimulationAudioAssetRecord | null,
) => {
  if (!nextRecord) {
    return existingRecords;
  }
  return [nextRecord, ...existingRecords.filter((record) => record.id !== nextRecord.id)];
};

const splitKeywords = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function readBooleanFlag(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

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

function formatBatchWaveLabel(batchName?: string | null, waveNumber?: number | null) {
  if (!batchName && typeof waveNumber !== 'number') {
    return 'Batch not assigned';
  }
  if (batchName && typeof waveNumber === 'number') {
    return `${batchName} - Wave ${waveNumber}`;
  }
  if (batchName) {
    return batchName;
  }
  return `Wave ${waveNumber}`;
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

function readAttemptLimit(value: unknown, fallback = 3) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? Math.max(1, Math.round(numericValue)) : fallback;
}

function resolveScenarioAttemptLimit(scenario?: Scenario | null, fallback = 3) {
  const configuredValue = scenario?.call_simulation_config?.max_attempts;
  return readAttemptLimit(configuredValue, fallback);
}

function resolveScenarioPassingScore(scenario?: Scenario | null, fallback = 90) {
  const config = scenario?.call_simulation_config;
  const targetKpis =
    config?.target_kpis && typeof config.target_kpis === 'object'
      ? config.target_kpis as Record<string, unknown>
      : {};
  const configuredValue =
    config?.passing_score
    ?? config?.certification_threshold
    ?? targetKpis.passing_score;

  return readPointValue(configuredValue, fallback);
}

function parseScenarioConfig(scenario: Scenario) {
  return scenario.call_simulation_config && typeof scenario.call_simulation_config === 'object'
    ? scenario.call_simulation_config
    : {};
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
    category: String(
      readString(scenarioConfig.category)
      || readString(scenarioConfig.scenario_category)
      || '',
    ),
    description: scenario.description || '',
    scenario_group_label: String(
      readString(scenarioConfig.scenario_group_label)
      || readString(scenario.scenario_group)
      || '',
    ),
    opening_prompt: scenario.opening_prompt || '',
    expected_keywords: (scenario.expected_keywords || []).join(', '),
    estimated_duration: String(scenario.estimated_duration || 120),
    passing_score: String(resolveScenarioPassingScore(scenario, defaultKpiForm.passing_score)),
    max_attempts: String(resolveScenarioAttemptLimit(scenario, 3)),
    target_kpis_json: JSON.stringify(
      typeof targetKpis === 'object' && targetKpis ? targetKpis : buildTargetKpisFromConfig(defaultKpiForm),
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
    ringer_audio_url: String(scenario.ringer_audio_url || ''),
    hold_audio_url: String(scenario.hold_audio_url || ''),
    use_shared_ringer_audio: readBooleanFlag(scenarioConfig.use_shared_ringer_audio, true),
    use_shared_hold_audio: readBooleanFlag(scenarioConfig.use_shared_hold_audio, true),
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
    aht_seconds: config.target_aht_seconds,
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
    : buildTargetKpisFromConfig(defaultKpiForm);
  const passingScoreCandidate =
    scenarioConfig.passing_score
    ?? targetKpis.passing_score
    ?? scenarioConfig.certification_threshold
    ?? defaultKpiForm.passing_score;
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
  const [selectedInteractionPlaybackUrl, setSelectedInteractionPlaybackUrl] = useState<string | null>(null);
  const [coachingNotes, setCoachingNotes] = useState('');
  const [verdictStatus, setVerdictStatus] = useState<'pending' | 'competent' | 'retake'>('pending');
  const [bulkTitle, setBulkTitle] = useState('');
  const [assignScenarioId, setAssignScenarioId] = useState('');
  const [assignBatchId, setAssignBatchId] = useState('');
  const [assignMaxAttempts, setAssignMaxAttempts] = useState('3');
  const [assignmentTargets, setAssignmentTargets] = useState<AssignmentTarget[]>([]);
  const [selectedAssignmentTrainees, setSelectedAssignmentTrainees] = useState<string[]>([]);
  const [loadingAssignmentTargets, setLoadingAssignmentTargets] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteScenarioId, setDeleteScenarioId] = useState<string | null>(null);
  const [deleteScenarioTitle, setDeleteScenarioTitle] = useState('');
  const [playbackTime, setPlaybackTime] = useState(0);
  const [callToneSettings, setCallToneSettings] = useState<CallSimulationAudioSettings>(createDefaultCallSimulationAudioSettings());
  const [sharedAudioAssets, setSharedAudioAssets] = useState<{ ringer: CallSimulationAudioAssetRecord | null; hold: CallSimulationAudioAssetRecord | null }>({
    ringer: null,
    hold: null,
  });
  const [scenarioAudioAssets, setScenarioAudioAssets] = useState<CallSimulationAudioAssetRecord[]>([]);
  const [loadingCallToneSettings, setLoadingCallToneSettings] = useState(false);
  const [savingCallToneTarget, setSavingCallToneTarget] = useState<string | null>(null);
  const [uploadingAudioTarget, setUploadingAudioTarget] = useState<string | null>(null);
  const [uploadingScenarioAudioTarget, setUploadingScenarioAudioTarget] = useState<string | null>(null);
  const [uploadingMemberAudioRowIndex, setUploadingMemberAudioRowIndex] = useState<number | null>(null);
  const [deletingScenarioAudioKey, setDeletingScenarioAudioKey] = useState<string | null>(null);
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

  const upsertScenarioAudioAsset = useCallback((asset?: CallSimulationAudioAssetRecord | null) => {
    setScenarioAudioAssets((previous) => upsertAudioAssetRecord(previous, asset));
  }, []);

  const fetchSharedAudioAssets = useCallback(async () => {
    const response = await authedFetch('/api/call-simulation/audio-assets?scope=shared');
    if (!response.ok) {
      throw new Error('Unable to load shared Call Simulation audio assets.');
    }
    const payload = (await response.json().catch(() => [])) as CallSimulationAudioAssetRecord[];
    setSharedAudioAssets({
      ringer: payload.find((asset) => asset.asset_kind === 'ringer') || null,
      hold: payload.find((asset) => asset.asset_kind === 'hold') || null,
    });
  }, [authedFetch]);

  const fetchScenarioAudioAssets = useCallback(async (scenarioId: string) => {
    const response = await authedFetch(`/api/call-simulation/audio-assets?scenario_id=${encodeURIComponent(scenarioId)}`);
    if (!response.ok) {
      throw new Error('Unable to load scenario audio assets.');
    }
    const payload = (await response.json().catch(() => [])) as CallSimulationAudioAssetRecord[];
    setScenarioAudioAssets(payload);
    return payload;
  }, [authedFetch]);

  const getScenarioAudioAssetByUrl = useCallback((audioUrl?: string | null, options?: { assetKind?: string; stepNumber?: number | null }) => {
    const normalizedUrl = String(audioUrl || '').trim();
    if (!normalizedUrl) {
      return null;
    }
    return scenarioAudioAssets.find((asset) => (
      asset.public_url === normalizedUrl
      && (!options?.assetKind || asset.asset_kind === options.assetKind)
      && (options?.stepNumber == null || asset.step_number === options.stepNumber)
    )) || null;
  }, [scenarioAudioAssets]);

  const deleteDraftScenarioAudioAsset = useCallback(async (
    asset: CallSimulationAudioAssetRecord,
    options?: { stepNumber?: number | null },
  ) => {
    const response = await authedFetch('/api/call-simulation/audio-assets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_kind: asset.asset_kind,
        audio_url: asset.public_url,
        scenario_id: asset.scenario_id || null,
        step_number: options?.stepNumber ?? asset.step_number ?? null,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to remove the draft audio asset.');
    }
  }, [authedFetch]);

  const syncScenarioRecordToSupabase = useCallback(async (scenarioInput: Scenario | string) => {
    const scenario = typeof scenarioInput === 'string'
      ? await (async () => {
          const query = selectedBatch ? `?batch_id=${encodeURIComponent(selectedBatch)}` : '';
          const response = await authedFetch(`/api/call-simulation/scenarios/${scenarioInput}${query}`);
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
  }, [authedFetch, selectedBatch]);

  const syncCallToneSettingsToSupabase = useCallback(async (settings: CallSimulationAudioSettings) => {
    const response = await authedFetch('/api/call-simulation/audio/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to sync the Call Simulation audio settings to Supabase.');
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

  const loadInteractionPlaybackUrl = useCallback(async (sessionId: string) => {
    const response = await authedFetch(`/api/call-simulation/session/${sessionId}/audio`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to load the saved call recording.');
    }
    if (!payload?.audio_url) {
      throw new Error('No playable call recording is available for this session.');
    }
    setSelectedInteractionPlaybackUrl(String(payload.audio_url));
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
      const firstAssignedAttemptLimit = payload.find((target) => target.is_assigned && typeof target.max_attempts === 'number')?.max_attempts;
      const scenarioAttemptLimit = resolveScenarioAttemptLimit(
        libraryScenarios.find((scenario) => scenario.id === scenarioId) || null,
      );
      setAssignMaxAttempts(String(readAttemptLimit(firstAssignedAttemptLimit, scenarioAttemptLimit)));
      setSelectedAssignmentTrainees(
        assignedIds.length > 0
          ? assignedIds
          : payload.map((target) => target.trainee_id),
      );
    } finally {
      setLoadingAssignmentTargets(false);
    }
  }, [authedFetch, libraryScenarios]);

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
          fetchSharedAudioAssets(),
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
              'Unable to load shared Call Simulation audio assets.',
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
  }, [fetchBatches, fetchCallToneSettings, fetchScenarioLibrary, fetchSharedAudioAssets]);

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
    if (!showScenarioDialog) {
      return;
    }

    setScenarioForm((previous) => ({
      ...previous,
      target_kpis_json: JSON.stringify(buildTargetKpisFromConfig(kpiForm), null, 2),
    }));
  }, [kpiForm, showScenarioDialog]);

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

  useEffect(() => {
    if (!selectedInteraction?.id) {
      setSelectedInteractionPlaybackUrl(null);
      return;
    }

    void loadInteractionPlaybackUrl(selectedInteraction.id).catch(() => {
      setSelectedInteractionPlaybackUrl(null);
    });
  }, [loadInteractionPlaybackUrl, selectedInteraction?.id]);

  const openCreateScenario = () => {
    setEditingScenarioId(null);
    const nextForm = createDefaultScenarioForm();
    nextForm.target_kpis_json = JSON.stringify(buildTargetKpisFromConfig(kpiForm), null, 2);
    setGeneratingSpeechRowIndex(null);
    setIsGeneratingAllMemberSpeech(false);
    setMemberSpeechGenerationProgress(null);
    setScenarioAudioAssets([]);
    setScenarioForm(nextForm);
    setShowScenarioDialog(true);
  };

  const openAssignDialog = (scenarioId?: string) => {
    const nextScenarioId = scenarioId || libraryScenarios[0]?.id || '';
    const selectedScenario = libraryScenarios.find((scenario) => scenario.id === nextScenarioId) || null;
    setAssignScenarioId(nextScenarioId);
    setAssignBatchId(selectedBatch || batches[0]?.id || '');
    setAssignMaxAttempts(String(resolveScenarioAttemptLimit(selectedScenario)));
    setAssignmentTargets([]);
    setSelectedAssignmentTrainees([]);
    setShowAssignDialog(true);
  };

  const openEditScenario = async (scenarioId: string) => {
    try {
      const query = selectedBatch ? `?batch_id=${encodeURIComponent(selectedBatch)}` : '';
      const [response, audioAssets] = await Promise.all([
        authedFetch(`/api/call-simulation/scenarios/${scenarioId}${query}`),
        fetchScenarioAudioAssets(scenarioId).catch((error) => {
          console.warn('Unable to load scenario audio assets:', error);
          return [] as CallSimulationAudioAssetRecord[];
        }),
      ]);
      if (!response.ok) throw new Error('Unable to load scenario details');
      const scenario: Scenario = await response.json();
      setEditingScenarioId(scenarioId);
      setGeneratingSpeechRowIndex(null);
      setIsGeneratingAllMemberSpeech(false);
      setMemberSpeechGenerationProgress(null);
      setScenarioAudioAssets(audioAssets);
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
        toast.error('Scenario archived, but the Supabase authoring mirror cleanup did not finish.');
      }

      toast.success(`"${deleteScenarioTitle}" has been deleted.`);
      setShowDeleteDialog(false);
      setDeleteScenarioId(null);
      setDeleteScenarioTitle('');
      try {
        await refreshScenarioData();
      } catch (refreshError) {
        console.error(refreshError);
        toast.error(`Module deleted, but ${getErrorMessage(refreshError, 'the Call Simulation workspace could not refresh right away.')}`);
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

    const scenarioPassingScore = readPointValue(scenarioForm.passing_score, defaultKpiForm.passing_score);
    const scenarioMaxAttempts = readAttemptLimit(scenarioForm.max_attempts, 3);
    const targetKpis = {
      ...buildTargetKpisFromConfig(kpiForm),
      passing_score: scenarioPassingScore,
    };

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
    const groupsWithMultipleMemberRows = groupedRows
      .filter((group) => group.member_rows.length > 1)
      .map((group) => group.scenario_key);
    if (groupsWithMultipleMemberRows.length > 0) {
      toast.error(
        `Each Scenario Group can contain only one Member row. Fix group${groupsWithMultipleMemberRows.length === 1 ? '' : 's'} ${groupsWithMultipleMemberRows.join(', ')} before saving.`,
      );
      return;
    }

    const aggregateKeywords = splitKeywords(scenarioForm.expected_keywords);
    const scriptFlow = groupedRows.map((group, index) => {
      const canonicalVariant = [...group.csr_variants].sort((left, right) => right.score - left.score)[0];
      const memberScript = group.member_rows.map((row) => row.script.trim()).filter(Boolean).join(' ').trim();
      const memberActorName = scenarioForm.member_name.trim() || group.member_rows[0]?.actor_name || 'Member';
      const memberAudioUrl = group.member_rows.find((row) => row.audio_url)?.audio_url || null;
      const pointValue = Math.max(...group.csr_variants.map((row) => row.score), 0);
      const hasMemberReply = Boolean(memberScript) || Boolean(memberAudioUrl);

      return {
        step_id: `scenario-${group.scenario_key}`,
        suggested_csr_script: canonicalVariant?.script || '',
        member_response_text: hasMemberReply ? memberScript : '',
        point_value: pointValue,
        expected_keywords: aggregateKeywords,
        actor_name: memberActorName,
        next_actor_name: hasMemberReply ? memberActorName : null,
        scenario: group.scenario_key,
        member_audio_url: hasMemberReply ? memberAudioUrl : null,
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
      const hasMemberReply = Boolean(memberScript) || Boolean(memberAudioUrl);
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
          is_closing: isClosing && !hasMemberReply,
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
          is_closing: isClosing,
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
          category: scenarioForm.category.trim() || null,
          scenario_category: scenarioForm.category.trim() || null,
          scenario_group_label: scenarioForm.scenario_group_label.trim() || null,
          target_kpis: targetKpis,
          passing_score: scenarioPassingScore,
          script_flow: scriptFlow,
          script_rows: rows,
          certification_threshold: scenarioPassingScore,
          max_attempts: scenarioMaxAttempts,
          interface: 'nice-cxone',
          trainee_talk_icon: true,
          member_talk_icon: true,
          show_actor_script_overlay: true,
          require_hold_before_member_response: true,
          use_shared_ringer_audio: scenarioForm.use_shared_ringer_audio,
          use_shared_hold_audio: scenarioForm.use_shared_hold_audio,
        },
        difficulty: scenarioForm.difficulty || 'intermediate',
        ringer_audio_url: scenarioForm.use_shared_ringer_audio ? null : (scenarioForm.ringer_audio_url.trim() || null),
        hold_audio_url: scenarioForm.use_shared_hold_audio ? null : (scenarioForm.hold_audio_url.trim() || null),
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
          toast.error('Scenario saved, but the Supabase authoring mirror did not finish updating.');
        }

        try {
          await syncScenarioKpiMetrics(
            [typeof scenarioReference === 'string' ? scenarioReference : scenarioReference.id],
            kpiForm,
          );
        } catch (syncError) {
          console.warn('Call simulation KPI metric Supabase sync failed:', syncError);
          toast.error('Scenario saved, but the Supabase KPI mirror did not finish updating.');
        }
      }

      setShowScenarioDialog(false);
      setEditingScenarioId(null);
      setScenarioAudioAssets([]);
      setScenarioForm(createDefaultScenarioForm());
      toast.success(editingScenarioId ? 'Scenario updated.' : 'Scenario created.');
      try {
        await refreshScenarioData();
      } catch (refreshError) {
        console.error(refreshError);
        toast.error(`Module saved, but ${getErrorMessage(refreshError, 'the Call Simulation workspace could not refresh right away.')}`);
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
      toast.error('Choose a module and batch before assigning.');
      return;
    }

    const resolvedAttemptLimit = readAttemptLimit(assignMaxAttempts, 3);
    setSaving(true);
    try {
      const response = await authedFetch('/api/call-simulation/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: assignScenarioId,
          batch_id: assignBatchId,
          trainee_ids: selectedAssignmentTrainees,
          max_attempts: resolvedAttemptLimit,
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
          ? `Scenario assigned to ${selectedAssignmentTrainees.length} trainee${selectedAssignmentTrainees.length === 1 ? '' : 's'} with a ${resolvedAttemptLimit}-attempt limit.`
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
          toast.error('KPI configuration saved, but the Supabase KPI mirror did not finish updating.');
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
          await syncScenarioRecordToSupabase(String(scenarioId));
        } catch (syncError) {
          console.warn('Call simulation bulk-upload Supabase sync failed:', syncError);
          toast.error('Bulk upload completed, but the Supabase authoring mirror did not finish updating.');
        }

        try {
          await syncScenarioKpiMetrics([String(scenarioId)], kpiForm);
        } catch (syncError) {
          console.warn('Call simulation bulk-upload KPI sync failed:', syncError);
          toast.error('Bulk upload completed, but the Supabase KPI mirror did not finish updating.');
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
      input.accept = CALL_SIMULATION_AUDIO_ACCEPT;

      input.onchange = async () => {
        const selectedFile = input.files?.[0];
        if (!selectedFile) {
          input.remove();
          return;
        }
        const validationError = validateCallSimulationAudioFile(selectedFile);
        if (validationError) {
          toast.error(validationError);
          input.remove();
          return;
        }

        setUploadingAudioTarget(target);

        try {
          const formData = new FormData();
          formData.append('file', selectedFile);
          formData.append('asset_kind', target);
          const replaceAudioUrl = getManagedAudioReplacementUrl(
            target === 'ringer' ? callToneSettings.ringer_audio_url : callToneSettings.hold_audio_url,
          );
          if (replaceAudioUrl) {
            formData.append('replace_audio_url', replaceAudioUrl);
          }

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
          if (payload.audio_asset) {
            setSharedAudioAssets((previous) => ({
              ...previous,
              [target]: payload.audio_asset || null,
            }));
          } else {
            await fetchSharedAudioAssets().catch(() => undefined);
          }
          
          try {
            const audioSettings = payload.settings || {
              ...callToneSettings,
              ...(target === 'ringer' ? { ringer_audio_url: payload.audio_url } : { hold_audio_url: payload.audio_url }),
            };
            await syncCallToneSettingsToSupabase(audioSettings);
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
    [applyCallToneSettings, authedFetch, callToneSettings, fetchSharedAudioAssets, refreshScenarioData, syncCallToneSettingsToSupabase],
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
      await fetchSharedAudioAssets().catch(() => undefined);
      
      try {
        await syncCallToneSettingsToSupabase(payload as CallSimulationAudioSettings);
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
  }, [applyCallToneSettings, authedFetch, callToneSettings.hold_audio_url, callToneSettings.ringer_audio_url, fetchSharedAudioAssets, refreshScenarioData, syncCallToneSettingsToSupabase]);

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
      setSharedAudioAssets((previous) => ({
        ...previous,
        [target]: null,
      }));
      try {
        await syncCallToneSettingsToSupabase(payload as CallSimulationAudioSettings);
      } catch (syncError) {
        console.warn('Call tone audio Supabase sync failed:', syncError);
      }
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
  }, [applyCallToneSettings, authedFetch, refreshScenarioData, syncCallToneSettingsToSupabase]);

  const handleUploadScenarioAudioAsset = useCallback(
    (target: 'scenario-ringer' | 'scenario-hold') => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = CALL_SIMULATION_AUDIO_ACCEPT;

      input.onchange = async () => {
        const selectedFile = input.files?.[0];
        if (!selectedFile) {
          input.remove();
          return;
        }
        const validationError = validateCallSimulationAudioFile(selectedFile);
        if (validationError) {
          toast.error(validationError);
          input.remove();
          return;
        }

        setUploadingScenarioAudioTarget(target);

        try {
          const formData = new FormData();
          formData.append('file', selectedFile);
          formData.append('asset_kind', target);
          if (editingScenarioId) {
            formData.append('scenario_id', editingScenarioId);
          }
          const replaceAudioUrl = getManagedAudioReplacementUrl(
            target === 'scenario-ringer' ? scenarioForm.ringer_audio_url : scenarioForm.hold_audio_url,
          );
          if (replaceAudioUrl) {
            formData.append('replace_audio_url', replaceAudioUrl);
          }

          const response = await authedFetch('/api/call-simulation/assets/audio', {
            method: 'POST',
            body: formData,
          });
          const payload = (await response.json().catch(() => null)) as AudioAssetUploadResponse | { detail?: string } | null;
          if (!response.ok || !payload || !('audio_url' in payload)) {
            throw new Error((payload && 'detail' in payload && payload.detail) || 'Unable to upload the scenario audio asset.');
          }

          setScenarioForm((previous) => ({
            ...previous,
            ...(target === 'scenario-ringer'
              ? { ringer_audio_url: payload.audio_url, use_shared_ringer_audio: false }
              : { hold_audio_url: payload.audio_url, use_shared_hold_audio: false }),
          }));
          if (replaceAudioUrl) {
            setScenarioAudioAssets((previous) => previous.filter((asset) => asset.public_url !== replaceAudioUrl));
          }
          if (payload.audio_asset) {
            upsertScenarioAudioAsset(payload.audio_asset);
          }
          toast.success(`${target === 'scenario-ringer' ? 'Scenario ringer' : 'Scenario hold'} audio uploaded.`);
        } catch (error) {
          console.error(error);
          toast.error(error instanceof Error ? error.message : 'Unable to upload the scenario audio asset.');
        } finally {
          setUploadingScenarioAudioTarget(null);
          input.remove();
        }
      };

      input.click();
    },
    [authedFetch, editingScenarioId, scenarioForm.hold_audio_url, scenarioForm.ringer_audio_url, upsertScenarioAudioAsset],
  );

  const handleUploadMemberAudioAsset = useCallback((rowIndex: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = CALL_SIMULATION_AUDIO_ACCEPT;

    input.onchange = async () => {
      const selectedFile = input.files?.[0];
      if (!selectedFile) {
        input.remove();
        return;
      }
      const validationError = validateCallSimulationAudioFile(selectedFile);
      if (validationError) {
        toast.error(validationError);
        input.remove();
        return;
      }

      setUploadingMemberAudioRowIndex(rowIndex);
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('asset_kind', 'member-step');
        formData.append('step_number', String(rowIndex + 1));
        if (editingScenarioId) {
          formData.append('scenario_id', editingScenarioId);
        }
        const replaceAudioUrl = getManagedAudioReplacementUrl(scenarioForm.rows[rowIndex]?.audio_url);
        if (replaceAudioUrl) {
          formData.append('replace_audio_url', replaceAudioUrl);
        }

        const response = await authedFetch('/api/call-simulation/assets/audio', {
          method: 'POST',
          body: formData,
        });
        const payload = (await response.json().catch(() => null)) as AudioAssetUploadResponse | { detail?: string } | null;
        if (!response.ok || !payload || !('audio_url' in payload)) {
          throw new Error((payload && 'detail' in payload && payload.detail) || 'Unable to upload member audio.');
        }

        setScenarioForm((previous) => ({
          ...previous,
          rows: previous.rows.map((row, index) => (
            index === rowIndex
              ? { ...row, audio_url: payload.audio_url }
              : row
          )),
        }));
        if (replaceAudioUrl) {
          setScenarioAudioAssets((previous) => previous.filter((asset) => asset.public_url !== replaceAudioUrl));
        }
        if (payload.audio_asset) {
          upsertScenarioAudioAsset(payload.audio_asset);
        }
        toast.success('Member audio uploaded and ready for trainee playback.');
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : 'Unable to upload member audio.');
      } finally {
        setUploadingMemberAudioRowIndex(null);
        input.remove();
      }
    };

    input.click();
  }, [authedFetch, editingScenarioId, scenarioForm.rows, upsertScenarioAudioAsset]);

  const handleRemoveScenarioAudioReference = useCallback(async (
    target: 'scenario-ringer' | 'scenario-hold' | 'member-step',
    options?: { rowIndex?: number },
  ) => {
    const stepNumber = typeof options?.rowIndex === 'number' ? options.rowIndex + 1 : null;
    const currentUrl = target === 'member-step'
      ? scenarioForm.rows[options?.rowIndex ?? -1]?.audio_url?.trim() || ''
      : (target === 'scenario-ringer' ? scenarioForm.ringer_audio_url : scenarioForm.hold_audio_url).trim();

    if (!currentUrl) {
      toast.info('No audio is attached yet.');
      return;
    }

    const matchingAsset = target === 'member-step'
      ? getScenarioAudioAssetByUrl(currentUrl, { assetKind: 'member-step', stepNumber })
      : getScenarioAudioAssetByUrl(currentUrl, { assetKind: target });
    const removalKey = `${target}:${stepNumber ?? 'slot'}`;

    setDeletingScenarioAudioKey(removalKey);
    try {
      if (!editingScenarioId && matchingAsset && !matchingAsset.scenario_id) {
        await deleteDraftScenarioAudioAsset(matchingAsset, { stepNumber });
      }

      setScenarioForm((previous) => {
        if (target === 'member-step' && typeof options?.rowIndex === 'number') {
          return {
            ...previous,
            rows: previous.rows.map((row, index) => (
              index === options.rowIndex
                ? { ...row, audio_url: '' }
                : row
            )),
          };
        }
        return {
          ...previous,
          ...(target === 'scenario-ringer' ? { ringer_audio_url: '', use_shared_ringer_audio: false } : { hold_audio_url: '', use_shared_hold_audio: false }),
        };
      });
      setScenarioAudioAssets((previous) => (
        matchingAsset
          ? previous.filter((asset) => asset.id !== matchingAsset.id)
          : previous.filter((asset) => asset.public_url !== currentUrl)
      ));

      if (editingScenarioId) {
        toast.info('Audio removed from the draft. Save the scenario to sync Supabase and update trainee playback.');
      } else if (matchingAsset) {
        toast.success('Draft audio asset removed.');
      } else {
        toast.success('Audio reference removed.');
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to remove the audio asset.');
    } finally {
      setDeletingScenarioAudioKey(null);
    }
  }, [deleteDraftScenarioAudioAsset, editingScenarioId, getScenarioAudioAssetByUrl, scenarioForm.hold_audio_url, scenarioForm.ringer_audio_url, scenarioForm.rows]);

  const requestMemberSpeechAsset = useCallback(async (
    script: string,
    rowIndex: number,
    replaceAudioUrl?: string | null,
  ) => {
      const params = new URLSearchParams({
        text: script.trim(),
        persist: 'true',
        require_supabase: 'true',
        asset_kind: 'member-step',
        step_number: String(rowIndex + 1),
      });
      if (editingScenarioId) {
        params.set('scenario_id', editingScenarioId);
      }
      const managedReplaceAudioUrl = getManagedAudioReplacementUrl(replaceAudioUrl);
      if (managedReplaceAudioUrl) {
        params.set('replace_audio_url', managedReplaceAudioUrl);
      }

      const response = await authedFetch(`/api/call-simulation/tts?${params.toString()}`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as MemberSpeechAssetResponse | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.detail || 'Unable to generate member speech');
      }

      return {
        audioUrl: payload.audio_url || null,
        warning: payload.warning || null,
        storageMode: payload.storage_mode || null,
        fallbackMode: payload.fallback_mode || null,
        audioAsset: payload.audio_asset || null,
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
      const replaceAudioUrl = getManagedAudioReplacementUrl(row.audio_url);
      const result = await requestMemberSpeechAsset(row.script.trim(), rowIndex, row.audio_url);

      setScenarioForm((previous) => ({
        ...previous,
        rows: previous.rows.map((entry, entryIndex) => (
          entryIndex === rowIndex
            ? { ...entry, audio_url: result.audioUrl || '' }
            : entry
        )),
      }));
      if (replaceAudioUrl && result.audioUrl !== replaceAudioUrl) {
        setScenarioAudioAssets((previous) => previous.filter((asset) => asset.public_url !== replaceAudioUrl));
      }
      if (result.audioAsset) {
        upsertScenarioAudioAsset(result.audioAsset);
      }
      if (result.fallbackMode === 'browser' || !result.audioUrl) {
        toast.info(result.warning || 'AI voice is using browser fallback mode.');
      } else if (result.storageMode === 'local') {
        toast.success('Member speech generated and saved to the local media folder.');
      } else if (result.storageMode === 'embedded') {
        toast.success('Member speech generated and embedded directly in the scenario.');
        if (result.warning) {
          toast.info(result.warning);
        }
      } else if (result.warning) {
        toast.success('Member speech generated and saved for trainee playback.');
        toast.info(result.warning);
      } else {
        toast.success('Member speech generated and stored in Supabase.');
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Unable to generate member speech.');
    } finally {
      setGeneratingSpeechRowIndex(null);
    }
  }, [requestMemberSpeechAsset, scenarioForm.rows, upsertScenarioAudioAsset]);

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
    let browserFallbackCount = 0;
    let localStorageCount = 0;
    let embeddedStorageCount = 0;
    let firstFailureMessage: string | null = null;

    try {
      for (const [sequenceIndex, entry] of memberRowsToGenerate.entries()) {
        setGeneratingSpeechRowIndex(entry.index);
        setMemberSpeechGenerationProgress({ current: sequenceIndex + 1, total: memberRowsToGenerate.length });

        try {
          const replaceAudioUrl = getManagedAudioReplacementUrl(entry.row.audio_url);
          const result = await requestMemberSpeechAsset(entry.row.script.trim(), entry.index, entry.row.audio_url);
          setScenarioForm((previous) => ({
            ...previous,
            rows: previous.rows.map((row, rowIndex) => (
              rowIndex === entry.index
                ? { ...row, audio_url: result.audioUrl || '' }
                : row
            )),
          }));
          if (replaceAudioUrl && result.audioUrl !== replaceAudioUrl) {
            setScenarioAudioAssets((previous) => previous.filter((asset) => asset.public_url !== replaceAudioUrl));
          }
          if (result.audioAsset) {
            upsertScenarioAudioAsset(result.audioAsset);
          }
          if (result.fallbackMode === 'browser' || !result.audioUrl) {
            browserFallbackCount += 1;
          } else if (result.storageMode === 'local') {
            localStorageCount += 1;
          } else if (result.storageMode === 'embedded') {
            embeddedStorageCount += 1;
          }
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
        if (browserFallbackCount > 0) {
          toast.info(
            browserFallbackCount === successCount
              ? 'AI voice is using browser fallback mode.'
              : `${browserFallbackCount} Member row${browserFallbackCount === 1 ? '' : 's'} will use browser fallback mode during live playback.`,
          );
        } else if (embeddedStorageCount === successCount) {
          toast.success(
            `Generated speech for ${successCount} Member row${successCount === 1 ? '' : 's'} and embedded it directly in the scenario.`,
          );
        } else if (localStorageCount === successCount) {
          toast.success(`Generated speech for ${successCount} Member row${successCount === 1 ? '' : 's'} and saved it to the local media folder.`);
        } else if (embeddedStorageCount > 0 && localStorageCount > 0) {
          toast.success(
            `Generated speech for ${successCount} Member row${successCount === 1 ? '' : 's'} with ${embeddedStorageCount} embedded and ${localStorageCount} saved locally.`,
          );
        } else if (embeddedStorageCount > 0) {
          toast.success(
            `Generated speech for ${successCount} Member row${successCount === 1 ? '' : 's'} with ${embeddedStorageCount} embedded directly in the scenario.`,
          );
        } else if (localStorageCount > 0) {
          toast.success(`Generated speech for ${successCount} Member row${successCount === 1 ? '' : 's'} and saved ${localStorageCount} locally.`);
        } else {
          toast.success(`Generated server-side speech for ${successCount} Member row${successCount === 1 ? '' : 's'}.`);
        }
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
  }, [requestMemberSpeechAsset, scenarioForm.rows, upsertScenarioAudioAsset]);

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
  const activeScenarioRingerAsset = useMemo(
    () => (
      scenarioForm.use_shared_ringer_audio
        ? sharedAudioAssets.ringer
        : getScenarioAudioAssetByUrl(scenarioForm.ringer_audio_url, { assetKind: 'scenario-ringer' })
    ),
    [getScenarioAudioAssetByUrl, scenarioForm.ringer_audio_url, scenarioForm.use_shared_ringer_audio, sharedAudioAssets.ringer],
  );
  const activeScenarioHoldAsset = useMemo(
    () => (
      scenarioForm.use_shared_hold_audio
        ? sharedAudioAssets.hold
        : getScenarioAudioAssetByUrl(scenarioForm.hold_audio_url, { assetKind: 'scenario-hold' })
    ),
    [getScenarioAudioAssetByUrl, scenarioForm.hold_audio_url, scenarioForm.use_shared_hold_audio, sharedAudioAssets.hold],
  );
  const activeScenarioRingerAudioUrl = useMemo(
    () => (scenarioForm.use_shared_ringer_audio ? callToneSettings.ringer_audio_url : scenarioForm.ringer_audio_url).trim(),
    [callToneSettings.ringer_audio_url, scenarioForm.ringer_audio_url, scenarioForm.use_shared_ringer_audio],
  );
  const activeScenarioHoldAudioUrl = useMemo(
    () => (scenarioForm.use_shared_hold_audio ? callToneSettings.hold_audio_url : scenarioForm.hold_audio_url).trim(),
    [callToneSettings.hold_audio_url, scenarioForm.hold_audio_url, scenarioForm.use_shared_hold_audio],
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
              Create trainer-owned call scenarios, assign them to batches or trainees, monitor scored mock calls, and coach
              completed sessions from one workspace.
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
                    {uploadingAudioTarget === 'ringer'
                      ? 'Uploading...'
                      : callToneSettings.ringer_audio_url.trim()
                        ? 'Replace Audio'
                        : 'Upload Audio'}
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
                  <p className="text-xs text-slate-500">
                    Supported uploads: MP3, WAV, OGG, or M4A up to 50 MB.
                  </p>
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
                  <div className="mt-4 space-y-3">
                    <audio controls preload="metadata" className="w-full" src={callToneSettings.ringer_audio_url}>
                      Your browser does not support audio preview.
                    </audio>
                    {sharedAudioAssets.ringer ? (
                      <div className="rounded-2xl border bg-slate-50 p-3 text-xs text-slate-600">
                        <div className="font-medium text-slate-900">{sharedAudioAssets.ringer.file_name}</div>
                        <div>Type: {sharedAudioAssets.ringer.file_type}</div>
                        <div>Size: {formatAudioFileSize(sharedAudioAssets.ringer.file_size)}</div>
                        <div>Saved: {formatDateTime(sharedAudioAssets.ringer.updated_at || sharedAudioAssets.ringer.created_at)}</div>
                        {sharedAudioAssets.ringer.provider ? <div>Provider: {sharedAudioAssets.ringer.provider}</div> : null}
                        {sharedAudioAssets.ringer.voice_used ? <div>Voice: {sharedAudioAssets.ringer.voice_used}</div> : null}
                      </div>
                    ) : null}
                  </div>
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
                    {uploadingAudioTarget === 'hold'
                      ? 'Uploading...'
                      : callToneSettings.hold_audio_url.trim()
                        ? 'Replace Audio'
                        : 'Upload Audio'}
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
                  <p className="text-xs text-slate-500">
                    Supported uploads: MP3, WAV, OGG, or M4A up to 50 MB.
                  </p>
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
                  <div className="mt-4 space-y-3">
                    <audio controls preload="metadata" className="w-full" src={callToneSettings.hold_audio_url}>
                      Your browser does not support audio preview.
                    </audio>
                    {sharedAudioAssets.hold ? (
                      <div className="rounded-2xl border bg-slate-50 p-3 text-xs text-slate-600">
                        <div className="font-medium text-slate-900">{sharedAudioAssets.hold.file_name}</div>
                        <div>Type: {sharedAudioAssets.hold.file_type}</div>
                        <div>Size: {formatAudioFileSize(sharedAudioAssets.hold.file_size)}</div>
                        <div>Saved: {formatDateTime(sharedAudioAssets.hold.updated_at || sharedAudioAssets.hold.created_at)}</div>
                        {sharedAudioAssets.hold.provider ? <div>Provider: {sharedAudioAssets.hold.provider}</div> : null}
                        {sharedAudioAssets.hold.voice_used ? <div>Voice: {sharedAudioAssets.hold.voice_used}</div> : null}
                      </div>
                    ) : null}
                  </div>
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
              <p className="text-xs text-muted-foreground">saved trainer modules</p>
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
                    No call modules are mapped to this batch yet.
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
                    <CardTitle>KPI Rubric Builder</CardTitle>
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
              View every saved call module, the batches it is assigned to, and the overall trainee completion snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {libraryScenarios.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                No saved call modules have been created yet.
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
            <CardTitle>Submitted Mock Calls</CardTitle>
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
                    <TableHead>Duration</TableHead>
                    <TableHead>AI KPI</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interactions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">
                        <div>{session.trainee_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatBatchWaveLabel(session.batch_name, session.batch_wave_number)}
                        </div>
                      </TableCell>
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
                      <TableCell>{formatClockTime(session.audio_duration_seconds)}</TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          G {session.grammar_score?.toFixed(0) ?? '0'} | P {session.pronunciation_score?.toFixed(0) ?? '0'} | Pace {session.pacing_score?.toFixed(0) ?? '0'}
                        </div>
                      </TableCell>
                      <TableCell>{formatDateTime(session.completed_at || session.created_at)}</TableCell>
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
        <DialogContent className="flex !max-h-[94vh] flex-col overflow-hidden p-0">
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
                        One click will convert every Member script into speech and require each generated file to be saved in Supabase.
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
                      placeholder="Inbound member support call"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scenario Topic</Label>
                    <Input
                      value={scenarioForm.topic}
                      onChange={(event) => setScenarioForm((previous) => ({ ...previous, topic: event.target.value }))}
                      placeholder="Verification, billing, eligibility, escalation"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Scenario Category</Label>
                      <Input
                        value={scenarioForm.category}
                        onChange={(event) => setScenarioForm((previous) => ({ ...previous, category: event.target.value }))}
                        placeholder="Billing, eligibility, escalation"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Difficulty</Label>
                      <Select
                        value={scenarioForm.difficulty}
                        onValueChange={(value) => setScenarioForm((previous) => ({ ...previous, difficulty: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select difficulty" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
                      placeholder="Verification, Escalation, Order Support"
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
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Estimated Duration</Label>
                        <Input type="number" value={scenarioForm.estimated_duration} onChange={(event) => setScenarioForm((previous) => ({ ...previous, estimated_duration: event.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Passing Score</Label>
                        <Input type="number" min="0" max="100" value={scenarioForm.passing_score} onChange={(event) => setScenarioForm((previous) => ({ ...previous, passing_score: event.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Max Attempts</Label>
                        <Input type="number" min="1" step="1" value={scenarioForm.max_attempts} onChange={(event) => setScenarioForm((previous) => ({ ...previous, max_attempts: event.target.value }))} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      Passing Score and Max Attempts travel with the scenario so trainee retake rules stay aligned even when the batch KPI defaults change later.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Target KPIs JSON</Label>
                    <Textarea
                      value={scenarioForm.target_kpis_json}
                      readOnly
                      rows={7}
                      className="bg-slate-50 text-slate-600"
                    />
                    <p className="text-xs text-slate-500">
                      Mirrored from the KPI Rubric Builder for the selected batch. Scenario-level Passing Score and Max Attempts above override the batch default only for this scenario.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950">
                    Shared ringer and hold audio now live in <span className="font-semibold">Call Simulation Management</span> above.
                    Keep the shared defaults enabled below, or switch them off to attach custom audio for this scenario only.
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-950">Scenario Ringer Override</div>
                          <p className="mt-1 text-xs text-slate-500">
                            Use the shared trainer ringer or attach a different incoming call tone for this scenario.
                          </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                          <Checkbox
                            checked={scenarioForm.use_shared_ringer_audio}
                            onCheckedChange={(value) =>
                              setScenarioForm((previous) => ({ ...previous, use_shared_ringer_audio: value === true }))
                            }
                          />
                          Use shared
                        </label>
                      </div>
                      <div className="mt-4 flex flex-col gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleUploadScenarioAudioAsset('scenario-ringer')}
                          disabled={scenarioForm.use_shared_ringer_audio || uploadingScenarioAudioTarget === 'scenario-ringer'}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          {uploadingScenarioAudioTarget === 'scenario-ringer'
                            ? 'Uploading...'
                            : scenarioForm.ringer_audio_url.trim()
                              ? 'Replace Scenario Ringer'
                              : 'Upload Scenario Ringer'}
                        </Button>
                        <Input
                          value={scenarioForm.ringer_audio_url}
                          onChange={(event) => setScenarioForm((previous) => ({ ...previous, ringer_audio_url: event.target.value }))}
                          placeholder="Paste a scenario-specific ringer audio URL"
                          disabled={scenarioForm.use_shared_ringer_audio}
                        />
                        <div className="text-xs text-slate-500">Supported uploads: MP3, WAV, OGG, or M4A up to 50 MB.</div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleRemoveScenarioAudioReference('scenario-ringer')}
                            disabled={scenarioForm.use_shared_ringer_audio || !scenarioForm.ringer_audio_url.trim() || deletingScenarioAudioKey === 'scenario-ringer:slot'}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {deletingScenarioAudioKey === 'scenario-ringer:slot' ? 'Removing...' : 'Clear Custom Audio'}
                          </Button>
                        </div>
                        <div className="text-xs text-slate-500">
                          {scenarioForm.use_shared_ringer_audio
                            ? 'The shared trainer workspace ringer will play for this scenario.'
                            : 'This custom ringer is stored on the scenario and overrides the shared workspace tone.'}
                        </div>
                        {activeScenarioRingerAudioUrl ? (
                          <div className="space-y-3">
                            <audio controls preload="metadata" className="w-full" src={activeScenarioRingerAudioUrl}>
                              Your browser does not support audio preview.
                            </audio>
                            {activeScenarioRingerAsset ? (
                              <div className="rounded-2xl border bg-white/80 p-3 text-xs text-slate-600">
                                <div className="font-medium text-slate-900">{activeScenarioRingerAsset.file_name}</div>
                                <div>Type: {activeScenarioRingerAsset.file_type}</div>
                                <div>Size: {formatAudioFileSize(activeScenarioRingerAsset.file_size)}</div>
                                <div>Saved: {formatDateTime(activeScenarioRingerAsset.updated_at || activeScenarioRingerAsset.created_at)}</div>
                                {activeScenarioRingerAsset.provider ? <div>Provider: {activeScenarioRingerAsset.provider}</div> : null}
                                {activeScenarioRingerAsset.voice_used ? <div>Voice: {activeScenarioRingerAsset.voice_used}</div> : null}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">No ringer audio is currently attached.</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-950">Scenario Hold Audio Override</div>
                          <p className="mt-1 text-xs text-slate-500">
                            Keep the shared hold loop or upload a different hold experience for this call flow.
                          </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                          <Checkbox
                            checked={scenarioForm.use_shared_hold_audio}
                            onCheckedChange={(value) =>
                              setScenarioForm((previous) => ({ ...previous, use_shared_hold_audio: value === true }))
                            }
                          />
                          Use shared
                        </label>
                      </div>
                      <div className="mt-4 flex flex-col gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleUploadScenarioAudioAsset('scenario-hold')}
                          disabled={scenarioForm.use_shared_hold_audio || uploadingScenarioAudioTarget === 'scenario-hold'}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          {uploadingScenarioAudioTarget === 'scenario-hold'
                            ? 'Uploading...'
                            : scenarioForm.hold_audio_url.trim()
                              ? 'Replace Scenario Hold'
                              : 'Upload Scenario Hold'}
                        </Button>
                        <Input
                          value={scenarioForm.hold_audio_url}
                          onChange={(event) => setScenarioForm((previous) => ({ ...previous, hold_audio_url: event.target.value }))}
                          placeholder="Paste a scenario-specific hold audio URL"
                          disabled={scenarioForm.use_shared_hold_audio}
                        />
                        <div className="text-xs text-slate-500">Supported uploads: MP3, WAV, OGG, or M4A up to 50 MB.</div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleRemoveScenarioAudioReference('scenario-hold')}
                            disabled={scenarioForm.use_shared_hold_audio || !scenarioForm.hold_audio_url.trim() || deletingScenarioAudioKey === 'scenario-hold:slot'}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {deletingScenarioAudioKey === 'scenario-hold:slot' ? 'Removing...' : 'Clear Custom Audio'}
                          </Button>
                        </div>
                        <div className="text-xs text-slate-500">
                          {scenarioForm.use_shared_hold_audio
                            ? 'The shared trainer workspace hold audio will play when the trainee places the call on hold.'
                            : 'This custom hold audio is stored on the scenario and overrides the shared workspace loop.'}
                        </div>
                        {activeScenarioHoldAudioUrl ? (
                          <div className="space-y-3">
                            <audio controls preload="metadata" className="w-full" src={activeScenarioHoldAudioUrl}>
                              Your browser does not support audio preview.
                            </audio>
                            {activeScenarioHoldAsset ? (
                              <div className="rounded-2xl border bg-white/80 p-3 text-xs text-slate-600">
                                <div className="font-medium text-slate-900">{activeScenarioHoldAsset.file_name}</div>
                                <div>Type: {activeScenarioHoldAsset.file_type}</div>
                                <div>Size: {formatAudioFileSize(activeScenarioHoldAsset.file_size)}</div>
                                <div>Saved: {formatDateTime(activeScenarioHoldAsset.updated_at || activeScenarioHoldAsset.created_at)}</div>
                                {activeScenarioHoldAsset.provider ? <div>Provider: {activeScenarioHoldAsset.provider}</div> : null}
                                {activeScenarioHoldAsset.voice_used ? <div>Voice: {activeScenarioHoldAsset.voice_used}</div> : null}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">No hold audio is currently attached.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 space-y-5 overflow-y-auto p-6 pb-8">
              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Script Builder</h3>
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
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Scenario Steps</div>
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
                const memberAudioAsset = memberRow
                  ? getScenarioAudioAssetByUrl(row.audio_url, { assetKind: 'member-step', stepNumber: index + 1 })
                  : null;
                const isRemovingMemberAudio = deletingScenarioAudioKey === `member-step:${index + 1}`;
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
                              Upload trainer audio or generate server-side speech for this Member row. Saved assets stay reusable in the trainee call flow, and browser fallback is still available when no stored audio is attached.
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleUploadMemberAudioAsset(index)}
                              disabled={uploadingMemberAudioRowIndex === index || isGeneratingAllMemberSpeech}
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              {uploadingMemberAudioRowIndex === index ? 'Uploading...' : row.audio_url ? 'Replace Upload' : 'Upload Audio'}
                            </Button>
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
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleRemoveScenarioAudioReference('member-step', { rowIndex: index })}
                              disabled={!row.audio_url.trim() || isRemovingMemberAudio}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {isRemovingMemberAudio ? 'Removing...' : 'Clear Audio'}
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          <Label>Saved Audio URL</Label>
                          <Input
                            value={formatGeneratedAudioValue(row.audio_url)}
                            onChange={(event) => updateScenarioRow(index, 'audio_url', event.target.value)}
                            placeholder="Stored or embedded audio for trainee playback"
                            readOnly={isEmbeddedAudioDataUrl(row.audio_url)}
                          />
                          {isEmbeddedAudioDataUrl(row.audio_url) ? (
                            <p className="text-xs text-cyan-900/80">
                              Supabase storage is unavailable right now, so this row is carrying embedded audio inside the saved scenario data.
                            </p>
                          ) : !row.audio_url ? (
                            <p className="text-xs text-cyan-900/80">
                              No stored audio asset is attached yet. The trainee call can still continue using browser fallback voice playback.
                            </p>
                          ) : memberAudioAsset ? (
                            <div className="rounded-2xl border border-cyan-200/60 bg-white/80 p-3 text-xs text-cyan-950">
                              <div className="font-medium">{memberAudioAsset.file_name}</div>
                              <div>Type: {memberAudioAsset.file_type}</div>
                              <div>Size: {formatAudioFileSize(memberAudioAsset.file_size)}</div>
                              <div>Saved: {formatDateTime(memberAudioAsset.updated_at || memberAudioAsset.created_at)}</div>
                              {memberAudioAsset.provider ? <div>Provider: {memberAudioAsset.provider}</div> : null}
                              {memberAudioAsset.voice_used ? <div>Voice: {memberAudioAsset.voice_used}</div> : null}
                            </div>
                          ) : null}
                          <p className="text-xs text-cyan-900/80">
                            Supported uploads: MP3, WAV, OGG, or M4A up to 50 MB.
                          </p>
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
                Keep at least 5 complete rows, make sure Member rows have playable audio, and use Save when the module is ready for trainees.
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
        <DialogContent className="flex !max-h-[90vh] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>KPI Rubric Builder</DialogTitle>
            <DialogDescription>
              Keep the KPI Rubric Builder wide and clean. The scoring weights below are saved to Supabase for the selected batch.
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
            <DialogTitle>Bulk Upload Call Scenarios</DialogTitle>
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
                For TXT and DOCX, the platform parses `Title_Topic_Description` into the module title, topic,
                and description before syncing the record to Supabase.
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
            <DialogTitle>Assign Call Scenario to Trainees</DialogTitle>
            <DialogDescription>
              Choose a batch, then select exactly which trainees should see this assigned call scenario on the trainee side.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Call Scenario</Label>
              <Select value={assignScenarioId} onValueChange={setAssignScenarioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a module" />
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
            <div className="space-y-2">
              <Label>Attempt Limit Per Trainee</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={assignMaxAttempts}
                onChange={(event) => setAssignMaxAttempts(event.target.value)}
                placeholder="Enter how many scored attempts each trainee can use"
              />
              <p className="text-xs text-muted-foreground">
                Trainees who fail can retake only until this limit is reached. Passed trainees stay locked unless you reassign them.
              </p>
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
                <div className="mt-1">
                  Each selected trainee can use up to {readAttemptLimit(assignMaxAttempts, 3)} scored attempt{readAttemptLimit(assignMaxAttempts, 3) === 1 ? '' : 's'}.
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
                            {target.is_assigned && target.max_attempts ? ` | Limit ${target.max_attempts} attempts` : ''}
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
        <DialogContent className="!max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Coaching Review</DialogTitle>
            <DialogDescription>
              Replay the recorded mock call, inspect each turn, review the KPI and Gemini evaluation, and decide whether the trainee is competent or needs a retake.
            </DialogDescription>
          </DialogHeader>
          {selectedInteraction ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Trainee</p>
                  <p className="font-semibold">{selectedInteraction.trainee_name}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Batch / Wave</p>
                  <p className="font-semibold">{formatBatchWaveLabel(selectedInteraction.batch_name, selectedInteraction.batch_wave_number)}</p>
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
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-semibold">{formatDateTime(selectedInteraction.completed_at || selectedInteraction.created_at)}</p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-muted-foreground">Call Duration</p>
                  <p className="font-semibold">{formatClockTime(selectedInteraction.audio_duration_seconds)}</p>
                </div>
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
              {selectedInteractionPlaybackUrl || selectedInteraction.audio_url ? (
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
                    src={selectedInteractionPlaybackUrl || selectedInteraction.audio_url}
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
                  <p className="text-sm font-medium text-muted-foreground">Gemini AI Summary</p>
                  <p className="mt-2">{selectedInteraction.ai_feedback}</p>
                </div>
              ) : null}
              {selectedInteraction.feedback_report ? (
                <div className="space-y-4 rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Structured Evaluation Report</p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">
                      {selectedInteraction.feedback_report.summary || selectedInteraction.feedback_report.overallSummary}
                    </p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Strengths</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        {(selectedInteraction.feedback_report.strengths || []).length ? (
                          selectedInteraction.feedback_report.strengths.map((item, index) => (
                            <div key={`${item}-${index}`}>{item}</div>
                          ))
                        ) : (
                          <div>No strengths were returned yet.</div>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Areas for Improvement</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        {(selectedInteraction.feedback_report.areas_for_improvement || []).length ? (
                          selectedInteraction.feedback_report.areas_for_improvement.map((item, index) => (
                            <div key={`${item}-${index}`}>{item}</div>
                          ))
                        ) : (
                          <div>No improvement areas were returned yet.</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Coaching Recommendation</div>
                      <div className="mt-3 text-sm leading-7 text-slate-700">
                        {selectedInteraction.feedback_report.coaching_recommendation || 'No coaching recommendation was returned yet.'}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Transcript Summary</div>
                      <div className="mt-3 text-sm leading-7 text-slate-700">
                        {selectedInteraction.feedback_report.transcript_summary || 'No transcript summary was returned yet.'}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">KPI Breakdown</div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {(selectedInteraction.feedback_report.kpi_breakdown || []).length ? (
                        selectedInteraction.feedback_report.kpi_breakdown.map((item, index) => (
                          <div key={`${item.category}-${index}`} className="rounded-lg border bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-slate-900">{item.category}</div>
                              <div className="text-sm font-semibold text-slate-700">{item.score.toFixed(1)}%</div>
                            </div>
                            <div className="mt-2 text-sm leading-6 text-slate-600">{item.feedback}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-slate-600">The KPI breakdown is not available for this session yet.</div>
                      )}
                    </div>
                  </div>
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
            <DialogTitle>Delete Call Scenario</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteScenarioTitle}"? This permanently removes the call module.
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
