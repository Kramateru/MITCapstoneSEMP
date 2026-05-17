'use client';

import {
    Award,
    BookOpen,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CircleDashed,
    Clock3,
    FileText,
    Mic,
    Pause,
    Play,
    RefreshCw,
    RotateCcw,
    Square,
    Volume2,
} from 'lucide-react';
import { startTransition, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@/app/context/AuthContext';
import { openTraineeMicrolearningLiveUpdates } from '@/app/lib/microlearning/client';
import { BROWSER_TTS_UNSUPPORTED_MESSAGE, browserTtsService } from '@/app/lib/tts/ttsService';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Textarea } from '../ui/textarea';

type FeedbackCategory = 'pronunciation' | 'fluency' | 'grammar' | 'empathy' | 'clarity';
type ModuleDifficulty = 'basic' | 'intermediate' | 'advanced';
type ModuleType = 'video' | 'quiz' | 'flashcard' | 'infographic' | 'case_study' | 'audio';
type MediaRequirement = 'video' | 'audio' | 'none';
type AssignmentStatus = 'assigned' | 'in_progress' | 'completed' | 'certified';
type FlashcardSide = 'front' | 'back';
type ModuleQueueFilter = 'all' | 'audio' | 'pending' | 'in_progress' | 'completed' | 'certified';

interface AssignmentSummary {
  id: string;
  module_id: string;
  title: string;
  description?: string | null;
  category?: FeedbackCategory | null;
  module_type?: ModuleType | null;
  skill_focus?: string | null;
  duration_minutes?: number | null;
  passing_score?: number | null;
  difficulty?: ModuleDifficulty | null;
  content_url?: string | null;
  status: AssignmentStatus;
  completion_percentage: number;
  average_score?: number;
  points_earned?: number;
  points_possible?: number;
  is_passed?: boolean;
  can_retake?: boolean;
  retake_count?: number;
  attempt_number?: number;
  exercise_count: number;
  completed_exercises: number;
  flashcard_answered_count?: number;
  flashcard_timed_out_count?: number;
  flashcard_unanswered_count?: number;
  certificate_id?: string | null;
  topic_category_name?: string | null;
  assigned_at?: string;
  started_at?: string | null;
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
  correct_answer?: string | null;
  result_status?: 'correct' | 'incorrect' | 'needs_review' | string | null;
  input_mode?: 'typed' | 'speech' | 'selection' | string | null;
  status?: 'answered' | 'unanswered' | 'timed_out' | string | null;
  study_time_seconds?: number | null;
  answer_time_seconds?: number | null;
  answered_at?: string | null;
  timer_expired?: boolean;
  matched_keywords?: string[];
  missing_keywords?: string[];
  score?: number | null;
  points_earned?: number | null;
  points_possible?: number | null;
  feedback?: string | null;
  revealed_side?: 'front' | 'back' | string | null;
  sample_similarity?: number | null;
  ai_provider?: string | null;
  is_completed: boolean;
  submitted_at?: string | null;
}

interface AssignmentExercise {
  id: string;
  title: string;
  type: 'multiple_choice' | 'keyword_response' | 'timestamp_question' | 'flashcard_recall';
  prompt: string;
  options?: string[];
  required_keywords?: string[];
  tips?: string[];
  explanation?: string;
  option_feedback?: Record<string, string>;
  sample_answer?: string;
  point_value?: number;
  front?: string;
  back?: string;
  study_time_seconds?: number;
  preview_seconds?: number;
  blank_seconds?: number;
  answer_time_seconds?: number;
  answer_time_limit_seconds?: number;
  attempt?: ExerciseAttempt | null;
  enable_stt?: boolean;
  timestamp?: number;
}

interface ModuleResultBreakdownItem {
  question_number: number;
  question_id: string;
  title: string;
  prompt: string;
  type?: string | null;
  trainee_answer?: string | null;
  correct_answer?: string | null;
  question_result?: 'correct' | 'incorrect' | 'needs_review' | string | null;
  score?: number | null;
  points_earned?: number | null;
  points_possible?: number | null;
  feedback?: string | null;
  submitted_at?: string | null;
  matched_keywords?: string[];
  missing_keywords?: string[];
}

interface ModuleResultSummary {
  attempt_number?: number | null;
  module_id?: string | null;
  module_title?: string | null;
  module_type?: string | null;
  total_score?: number | null;
  points_earned?: number | null;
  points_possible?: number | null;
  percentage_score?: number | null;
  passing_score?: number | null;
  status?: 'passed' | 'failed' | string | null;
  submitted_at?: string | null;
  overall_summary?: string | null;
  strengths?: string[];
  weak_areas?: string[];
  improvement_opportunities?: string[];
  recommended_next_steps?: string[];
  explanation?: string | null;
  provider?: string | null;
  breakdown?: ModuleResultBreakdownItem[];
}

interface FlashcardSessionState {
  enabled: boolean;
  phase: 'not_started' | 'study' | 'answer' | 'completed' | 'expired' | string;
  current_exercise_id?: string | null;
  current_card_index?: number | null;
  current_card_number?: number | null;
  current_card_title?: string | null;
  current_prompt_side?: FlashcardSide | string | null;
  revealed_side?: FlashcardSide | string | null;
  draft_response_text?: string;
  study_time_seconds: number;
  answer_time_seconds: number;
  study_started_at?: string | null;
  answer_started_at?: string | null;
  answer_deadline_at?: string | null;
  phase_started_at?: string | null;
  phase_deadline_at?: string | null;
  seconds_remaining?: number;
  phase_duration_seconds?: number;
  completed_cards: number;
  remaining_cards: number;
  total_cards: number;
  progress_percentage: number;
}

interface AssignmentDetailResponse {
  assignment: AssignmentSummary;
  module: {
    id: string;
    category?: FeedbackCategory | null;
    module_type: ModuleType;
    content_data: Record<string, any>;
    passing_score: number;
    content_url?: string | null;
    audio_url?: string | null;
    audio_transcript?: string | null;
    audio_tts_url?: string | null;
    audio_duration_seconds?: number | null;
    audio_language?: string | null;
    captions_url?: string | null;
    media_requirement?: MediaRequirement | string | null;
    media_ready?: boolean;
    media_status?: string | null;
  };
  flashcard_session?: FlashcardSessionState | null;
  exercises: AssignmentExercise[];
  result_summary?: ModuleResultSummary | null;
}

interface SubmitExerciseResponse {
  status: string;
  attempt: ExerciseAttempt;
  assignment: AssignmentSummary;
  flashcard_session?: FlashcardSessionState | null;
  result_summary?: ModuleResultSummary | null;
}

interface SubmitExerciseOptions {
  timerExpired?: boolean;
  allowBlank?: boolean;
  status?: 'answered' | 'unanswered' | 'timed_out';
  suppressSuccessToast?: boolean;
}

interface ExerciseResponseState {
  responseText: string;
  selectedOption: string;
  inputMode: 'typed' | 'speech' | 'selection';
  revealedSide?: 'front' | 'back' | '';
}

interface LoadAssignmentsOptions {
  preferredAssignmentId?: string;
  refreshDetail?: boolean;
}

interface LoadAssignmentDetailOptions {
  includeExercises?: boolean;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const FEEDBACK_BADGE_STYLES: Record<FeedbackCategory, string> = {
  pronunciation: 'bg-sky-100 text-sky-700 border-sky-200',
  fluency: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  grammar: 'bg-amber-100 text-amber-700 border-amber-200',
  empathy: 'bg-rose-100 text-rose-700 border-rose-200',
  clarity: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const STATUS_BADGE_STYLES: Record<AssignmentStatus, string> = {
  assigned: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-blue-100 text-blue-700 border-blue-200',
  certified: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const DEFAULT_FLASHCARD_PREVIEW_SECONDS = 30;
const DEFAULT_FLASHCARD_ANSWER_TIME_LIMIT_SECONDS = 60;
const FLASHCARD_DRAFT_STORAGE_PREFIX = 'microlearning:flashcard:draft';
const FLASHCARD_PENDING_STORAGE_PREFIX = 'microlearning:flashcard:pending';

interface PendingFlashcardSubmission {
  assignmentId: string;
  exerciseId: string;
  savedAt: string;
}

function getFlashcardDraftStorageKey(assignmentId: string, exerciseId: string) {
  return `${FLASHCARD_DRAFT_STORAGE_PREFIX}:${assignmentId}:${exerciseId}`;
}

function getPendingFlashcardStorageKey(assignmentId: string) {
  return `${FLASHCARD_PENDING_STORAGE_PREFIX}:${assignmentId}`;
}

function readFlashcardDraft(assignmentId: string, exerciseId: string) {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(getFlashcardDraftStorageKey(assignmentId, exerciseId)) || '';
  } catch {
    return '';
  }
}

function writeFlashcardDraft(assignmentId: string, exerciseId: string, value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const storageKey = getFlashcardDraftStorageKey(assignmentId, exerciseId);
    if (value.trim()) {
      window.localStorage.setItem(storageKey, value);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore storage write failures so training can continue.
  }
}

function clearFlashcardDraft(assignmentId: string, exerciseId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(getFlashcardDraftStorageKey(assignmentId, exerciseId));
  } catch {
    // Ignore storage cleanup failures.
  }
}

function readPendingFlashcardSubmission(assignmentId: string): PendingFlashcardSubmission | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getPendingFlashcardStorageKey(assignmentId));
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as PendingFlashcardSubmission | null;
    if (!parsed?.assignmentId || !parsed?.exerciseId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePendingFlashcardSubmission(pending: PendingFlashcardSubmission) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      getPendingFlashcardStorageKey(pending.assignmentId),
      JSON.stringify(pending),
    );
  } catch {
    // Ignore storage write failures so retries can still happen in-memory.
  }
}

function clearPendingFlashcardSubmission(assignmentId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(getPendingFlashcardStorageKey(assignmentId));
  } catch {
    // Ignore storage cleanup failures.
  }
}

function formatLabel(value?: string | null) {
  if (!value) {
    return 'Not set';
  }

  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatStatusLabel(status?: AssignmentStatus | null) {
  if (!status) {
    return 'Not Started';
  }

  return status === 'assigned' ? 'Not Started' : formatLabel(status);
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

function formatPoints(earned?: number | null, possible?: number | null) {
  const safePossible = Number(possible || 0);
  if (!Number.isFinite(safePossible) || safePossible <= 0) {
    return null;
  }

  const safeEarned = Number(earned || 0);
  const earnedLabel = Number.isInteger(safeEarned) ? String(safeEarned) : safeEarned.toFixed(1);
  const possibleLabel = Number.isInteger(safePossible) ? String(safePossible) : safePossible.toFixed(1);
  return `${earnedLabel}/${possibleLabel} pts`;
}

function formatAttemptScore(attempt?: ExerciseAttempt | null) {
  if (!attempt) {
    return '0%';
  }

  const pointsLabel = formatPoints(attempt.points_earned, attempt.points_possible);
  const percentLabel = `${Math.round(attempt.score || 0)}%`;
  return pointsLabel ? `${pointsLabel} • ${percentLabel}` : percentLabel;
}

function hasStartedAssignment(assignment?: AssignmentSummary | null) {
  return Boolean(
    assignment &&
      (assignment.started_at || assignment.status !== 'assigned' || assignment.completed_exercises > 0),
  );
}

function getAssignmentSortOrder(status: AssignmentStatus) {
  if (status === 'assigned') {
    return 0;
  }
  if (status === 'in_progress') {
    return 1;
  }
  return 2;
}

function sortAssignmentsForQueue(items: AssignmentSummary[]) {
  return [...items].sort((left, right) => {
    const statusOrder = getAssignmentSortOrder(left.status) - getAssignmentSortOrder(right.status);
    if (statusOrder !== 0) {
      return statusOrder;
    }

    const leftAssignedAt = left.assigned_at ? new Date(left.assigned_at).getTime() : 0;
    const rightAssignedAt = right.assigned_at ? new Date(right.assigned_at).getTime() : 0;
    if (leftAssignedAt !== rightAssignedAt) {
      return rightAssignedAt - leftAssignedAt;
    }

    return left.title.localeCompare(right.title);
  });
}

function getFirstContentArray(content: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(content[key]) && content[key].length > 0) {
      return content[key];
    }
  }

  return [];
}

function getFirstContentText(content: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (typeof content[key] === 'string' && content[key].trim()) {
      return content[key].trim();
    }
  }

  return '';
}

function getQuizReadingContent(content: Record<string, any>) {
  return getFirstContentText(content, ['reading_passage', 'reading_content', 'story_content', 'scenario_text']);
}

function getQuizReadingGateKey(assignment?: AssignmentSummary | null) {
  if (!assignment?.id) {
    return '';
  }

  return `${assignment.id}:${assignment.attempt_number || 1}`;
}

function formatTimestamp(seconds?: number | null) {
  const totalSeconds = Number(seconds || 0);
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function getPositiveWholeNumber(value: number | string | undefined | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getYouTubeEmbedUrl(url?: string | null) {
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

function isDirectVideoFile(url?: string | null) {
  if (!url) {
    return false;
  }

  return /(^\/|\.mp4($|[?#])|\.webm($|[?#])|\.ogg($|[?#])|\.mov($|[?#])|\.m4v($|[?#]))/i.test(url);
}

function getVideoAssetKind(url?: string | null) {
  if (!url) {
    return 'none' as const;
  }

  if (getYouTubeEmbedUrl(url)) {
    return 'youtube' as const;
  }

  if (isDirectVideoFile(url)) {
    return 'file' as const;
  }

  return 'external' as const;
}

function isSupabaseStoragePublicUrl(url?: string | null) {
  return Boolean(url && url.includes('/storage/v1/object/public/'));
}

function isDirectAudioFile(url?: string | null) {
  if (!url) {
    return false;
  }

  return /\.(mp3|wav|ogg|m4a|aac|flac|webm)($|[?#])/i.test(url);
}

interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

function parseCaptionTimestamp(value: string) {
  const match = value.trim().match(/(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})/);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const milliseconds = Number(match[4] || 0);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function parseCaptionCues(rawVtt: string) {
  return rawVtt
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes('-->'));
      if (timingIndex < 0) {
        return [];
      }

      const timingLine = lines[timingIndex];
      const [startValue, endValue] = timingLine.split(/\s+-->\s+/);
      const text = lines.slice(timingIndex + 1).join(' ').trim();
      if (!startValue || !endValue || !text) {
        return [];
      }

      return [
        {
          start: parseCaptionTimestamp(startValue),
          end: parseCaptionTimestamp(endValue.split(/\s+/)[0] || endValue),
          text,
        } satisfies CaptionCue,
      ];
    });
}

function buildSimulatedCaptionCues(transcript: string, durationSeconds?: number | null) {
  const normalizedTranscript = transcript.replace(/\s+/g, ' ').trim();
  if (!normalizedTranscript) {
    return [] as CaptionCue[];
  }

  const words = normalizedTranscript.split(' ').filter(Boolean);
  if (!words.length) {
    return [] as CaptionCue[];
  }

  const chunks: string[] = [];
  let buffer: string[] = [];

  for (const word of words) {
    buffer.push(word);
    const sentenceBoundary = /[.!?]$/.test(word);
    if (buffer.length >= 8 || sentenceBoundary) {
      chunks.push(buffer.join(' '));
      buffer = [];
    }
  }

  if (buffer.length) {
    chunks.push(buffer.join(' '));
  }

  const safeDuration =
    Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
      ? Number(durationSeconds)
      : Math.max(chunks.length * 2.8, words.length * 0.45);
  const secondsPerChunk = safeDuration / chunks.length;

  return chunks.map((text, index) => ({
    start: index * secondsPerChunk,
    end: index === chunks.length - 1 ? safeDuration : (index + 1) * secondsPerChunk,
    text,
  }));
}

function normalizeCaptionCueList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as CaptionCue[];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const cue = entry as { start?: unknown; end?: unknown; text?: unknown };
      const start = Number(cue.start);
      const end = Number(cue.end);
      const text = typeof cue.text === 'string' ? cue.text.trim() : '';
      if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return null;
      }

      return {
        start,
        end,
        text,
      } satisfies CaptionCue;
    })
    .filter((cue): cue is CaptionCue => Boolean(cue));
}

function collectSpeechTranscript(event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) {
  let transcript = '';

  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const alternative = result?.[0];
    if (alternative?.transcript) {
      transcript += `${alternative.transcript} `;
    }
  }

  return transcript.trim();
}

function getKeywordCoverage(responseText: string, keywords?: string[]) {
  const normalizedResponse = responseText.trim().toLowerCase();
  const normalizedKeywords = (keywords || [])
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);

  const matched = normalizedKeywords.filter((keyword) => normalizedResponse.includes(keyword));
  const missing = normalizedKeywords.filter((keyword) => !matched.includes(keyword));

  return { matched, missing };
}

function isCompletedAssignment(status?: AssignmentStatus | null) {
  return status === 'completed' || status === 'certified';
}

function getQuestionResultBadgeClass(result?: string | null) {
  if (result === 'correct') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (result === 'incorrect') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function getObservationTitle(provider?: string | null) {
  return provider === 'gemini' ? 'Gemini AI Observation' : 'AI Performance Observation';
}

interface ModuleMediaGateState {
  mediaRequirement: MediaRequirement;
  mediaReady: boolean;
  mediaStatus: string;
  rawAssetUrl: string;
  assetUrl: string;
  assetKind: 'none' | 'file' | 'youtube' | 'external';
  youtubeEmbedUrl: string | null;
  hasPlayableAudio: boolean;
  hasPlayableVideo: boolean;
  assessmentUnavailable: boolean;
  videoReviewLocked: boolean;
  isAssessmentLocked: boolean;
  lockMessage: string;
}

function normalizeMediaText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getModuleMediaGateState(
  moduleDetail: AssignmentDetailResponse['module'],
  assignment?: AssignmentSummary | null,
  storedAssetPlaybackUrl?: string,
  videoReviewed?: boolean,
): ModuleMediaGateState {
  const content = moduleDetail.content_data || {};
  const rawAssetUrl = normalizeMediaText(
    moduleDetail.audio_url ||
      moduleDetail.content_url ||
      content.audio_url ||
      content.asset_url ||
      assignment?.content_url,
  );
  const mediaRequirement =
    moduleDetail.media_requirement === 'video' || moduleDetail.media_requirement === 'audio'
      ? moduleDetail.media_requirement
      : 'none';
  const mediaReady = moduleDetail.media_ready !== false;
  const mediaStatus = normalizeMediaText(moduleDetail.media_status);
  const assetKind = getVideoAssetKind(rawAssetUrl);
  const youtubeEmbedUrl = getYouTubeEmbedUrl(rawAssetUrl);
  const hasProtectedAssetPath = normalizeMediaText(content.asset_storage_path).length > 0;
  const useProtectedSupabaseAsset =
    moduleDetail.module_type === 'infographic'
      ? Boolean(rawAssetUrl) && (hasProtectedAssetPath || isSupabaseStoragePublicUrl(rawAssetUrl))
      : moduleDetail.module_type === 'video'
        ? assetKind === 'file' && (hasProtectedAssetPath || isSupabaseStoragePublicUrl(rawAssetUrl))
        : false;
  const assetUrl =
    useProtectedSupabaseAsset && normalizeMediaText(storedAssetPlaybackUrl)
      ? normalizeMediaText(storedAssetPlaybackUrl)
      : rawAssetUrl;
  const hasPlayableVideo = assetKind === 'file' || assetKind === 'youtube';
  const hasPlayableAudio = Boolean(
    normalizeMediaText(moduleDetail.audio_url) ||
      normalizeMediaText(content.audio_url) ||
      normalizeMediaText(content.audio_storage_path) ||
      normalizeMediaText(content.audio_content_id) ||
      (rawAssetUrl && (isDirectAudioFile(rawAssetUrl) || isSupabaseStoragePublicUrl(rawAssetUrl))),
  );
  const assessmentUnavailable =
    mediaRequirement === 'video'
      ? !mediaReady || !hasPlayableVideo
      : mediaRequirement === 'audio'
        ? !mediaReady || !hasPlayableAudio
        : false;
  const videoReviewLocked =
    mediaRequirement === 'video'
      && !assessmentUnavailable
      && hasPlayableVideo
      && !videoReviewed;
  const fallbackUnavailableMessage =
    mediaRequirement === 'audio'
      ? 'This module needs a working uploaded audio file before the assessment can be opened.'
      : mediaRequirement === 'video'
        ? 'This module needs a working uploaded video before the assessment can be opened.'
        : '';
  const lockMessage = assessmentUnavailable
    ? mediaStatus || fallbackUnavailableMessage
    : videoReviewLocked
      ? assetKind === 'file'
        ? 'Complete the video first to unlock this practice prompt.'
        : 'Review the lesson reference and confirm it first to unlock this practice prompt.'
      : '';

  return {
    mediaRequirement,
    mediaReady,
    mediaStatus,
    rawAssetUrl,
    assetUrl,
    assetKind,
    youtubeEmbedUrl,
    hasPlayableAudio,
    hasPlayableVideo,
    assessmentUnavailable,
    videoReviewLocked,
    isAssessmentLocked: assessmentUnavailable || videoReviewLocked,
    lockMessage,
  };
}

async function readApiPayload<T>(response: Response): Promise<T | string | null> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return (await response.json().catch(() => null)) as T | null;
  }

  const text = await response.text().catch(() => '');
  return text.trim() || null;
}

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

interface AudioPlaybackCardProps {
  moduleId: string;
  audioUrl?: string | null;
  hasPrimaryAudio?: boolean;
  captionsUrl?: string | null;
  captionData?: unknown;
  transcriptText?: string | null;
  ttsUrl?: string | null;
  languageLabel?: string | null;
  durationSeconds?: number | null;
  title: string;
  transcriptHeading?: string;
  transcriptPlaceholder: string;
  description: string;
}

interface AuthorizedAudioPlaybackPayload {
  signed_url?: string | null;
  transcript?: string | null;
  transcript_text?: string | null;
  summary_text?: string | null;
  captions_url?: string | null;
  duration_seconds?: number | null;
}

interface ModuleAudioMetadataPayload {
  transcript?: string | null;
  captions_url?: string | null;
  audio_duration_seconds?: number | null;
  audio_url?: string | null;
}

interface GeneratedTranscriptPayload {
  transcript?: string | null;
  transcript_text?: string | null;
  summary_text?: string | null;
  duration_seconds?: number | null;
}

interface AuthorizedModuleAssetPlaybackPayload {
  signed_url?: string | null;
  asset_url?: string | null;
  storage_path?: string | null;
  bucket_name?: string | null;
  content_type?: string | null;
  signed_url_required?: boolean | null;
}

function AudioPlaybackCard({
  moduleId,
  audioUrl,
  hasPrimaryAudio,
  captionsUrl,
  captionData,
  transcriptText,
  ttsUrl,
  languageLabel,
  durationSeconds,
  title,
  transcriptHeading = 'Speech-to-Text Caption',
  transcriptPlaceholder,
  description,
}: AudioPlaybackCardProps) {
  const { token, refreshToken } = useAuth();
  const primaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>(() => normalizeCaptionCueList(captionData));
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(0);
  const [isPrimaryPlaying, setIsPrimaryPlaying] = useState(false);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [primaryPlaybackUrl, setPrimaryPlaybackUrl] = useState<string | null>(null);
  const [ttsPlaybackUrl, setTtsPlaybackUrl] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] = useState<'primary' | 'tts' | null>(null);
  const [resolvedTranscriptText, setResolvedTranscriptText] = useState(() => transcriptText?.trim() || '');
  const [resolvedCaptionsUrl, setResolvedCaptionsUrl] = useState(() => captionsUrl || '');

  const revokeTtsPlaybackUrl = useCallback(() => {
    if (!ttsObjectUrlRef.current) {
      setTtsPlaybackUrl(null);
      return;
    }

    URL.revokeObjectURL(ttsObjectUrlRef.current);
    ttsObjectUrlRef.current = null;
    setTtsPlaybackUrl(null);
  }, []);

  const cancelBrowserSpeech = useCallback(() => {
    browserTtsService.stop();
    setIsTtsPlaying(false);
  }, []);

  const fetchAuthorizedResponse = useCallback(
    async (path: string, fallback: string) => {
      if (!token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const makeRequest = async (accessToken: string) =>
        fetch(path, {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

      let response = await makeRequest(token);
      if (response.status === 401) {
        const refreshedToken = await refreshToken();
        if (refreshedToken) {
          response = await makeRequest(refreshedToken);
        }
      }

      if (!response.ok) {
        const payload = await readApiPayload(response);
        throw new Error(getApiErrorMessage(payload, fallback));
      }

      return response;
    },
    [refreshToken, token],
  );

  const hydrateModuleAudioMetadata = useCallback(async () => {
    const response = await fetchAuthorizedResponse(
      `/api/microlearning/modules/${moduleId}/audio`,
      'Unable to load the lesson transcript metadata.',
    );
    const payload = (await response.json().catch(() => null)) as ModuleAudioMetadataPayload | null;
    let hydratedTranscript = typeof payload?.transcript === 'string' ? payload.transcript.trim() : '';
    const hydratedCaptionsUrl = typeof payload?.captions_url === 'string' ? payload.captions_url : '';
    const hydratedDuration = Number(payload?.audio_duration_seconds);
    const hasAudioAsset = Boolean(audioUrl || (typeof payload?.audio_url === 'string' ? payload.audio_url.trim() : ''));

    if (!hydratedTranscript && hasAudioAsset) {
      const transcriptResponse = await fetchAuthorizedResponse(
        `/api/microlearning/modules/${moduleId}/transcript`,
        'Unable to generate the lesson transcript while audio is playing.',
      );
      const transcriptPayload = (await transcriptResponse.json().catch(() => null)) as GeneratedTranscriptPayload | null;
      hydratedTranscript =
        typeof transcriptPayload?.transcript_text === 'string'
          ? transcriptPayload.transcript_text.trim()
          : typeof transcriptPayload?.transcript === 'string'
            ? transcriptPayload.transcript.trim()
            : '';
      const generatedDuration = Number(transcriptPayload?.duration_seconds);

      if (Number.isFinite(generatedDuration) && generatedDuration > 0) {
        setResolvedDuration((current) => (current > 0 ? Math.max(current, generatedDuration) : generatedDuration));
      }
    }

    if (hydratedTranscript) {
      setResolvedTranscriptText(hydratedTranscript);
    }
    if (hydratedCaptionsUrl) {
      setResolvedCaptionsUrl(hydratedCaptionsUrl);
    }
    if (Number.isFinite(hydratedDuration) && hydratedDuration > 0) {
      setResolvedDuration((current) => (current > 0 ? Math.max(current, hydratedDuration) : hydratedDuration));
    }
  }, [fetchAuthorizedResponse, moduleId]);

  const ensureProtectedPlaybackSource = useCallback(
    async (mode: 'primary' | 'tts', forceRefresh: boolean = false) => {
      const target = mode === 'primary' ? primaryAudioRef.current : ttsAudioRef.current;

      if (mode === 'primary') {
        if (!forceRefresh && primaryPlaybackUrl) {
          if (target && target.src !== primaryPlaybackUrl) {
            target.src = primaryPlaybackUrl;
            target.load();
          }
          return primaryPlaybackUrl;
        }

        setLoadingMode('primary');
        try {
          const response = await fetchAuthorizedResponse(
            `/api/microlearning/audio-content/${moduleId}/signed-url`,
            'Unable to load the signed lesson audio URL.',
          );
          const payload = (await response.json().catch(() => null)) as AuthorizedAudioPlaybackPayload | null;
          const signedUrl = typeof payload?.signed_url === 'string' ? payload.signed_url : '';
          const hydratedTranscript =
            typeof payload?.transcript_text === 'string'
              ? payload.transcript_text.trim()
              : typeof payload?.transcript === 'string'
                ? payload.transcript.trim()
                : '';
          const hydratedCaptionsUrl = typeof payload?.captions_url === 'string' ? payload.captions_url : '';
          const hydratedDuration = Number(payload?.duration_seconds);

          if (!signedUrl) {
            throw new Error('The signed lesson audio URL is missing from the server response.');
          }

          if (hydratedTranscript) {
            setResolvedTranscriptText(hydratedTranscript);
          }
          if (hydratedCaptionsUrl) {
            setResolvedCaptionsUrl(hydratedCaptionsUrl);
          }
          if (Number.isFinite(hydratedDuration) && hydratedDuration > 0) {
            setResolvedDuration((current) => (current > 0 ? Math.max(current, hydratedDuration) : hydratedDuration));
          }

          setPrimaryPlaybackUrl(signedUrl);
          if (target) {
            target.src = signedUrl;
            target.load();
          }

          return signedUrl;
        } catch (error) {
          if (audioUrl) {
            setPrimaryPlaybackUrl(audioUrl);
            if (target) {
              target.src = audioUrl;
              target.load();
            }
            return audioUrl;
          }
          throw error;
        } finally {
          setLoadingMode((current) => (current === 'primary' ? null : current));
        }
      }

      if (ttsPlaybackUrl && !forceRefresh) {
        if (target && target.src !== ttsPlaybackUrl) {
          target.src = ttsPlaybackUrl;
          target.load();
        }
        return ttsPlaybackUrl;
      }

      setLoadingMode('tts');
      try {
        const response = await fetchAuthorizedResponse(
          `/api/microlearning/modules/${moduleId}/audio/stream?use_tts=true`,
          'Unable to load the TTS audio.',
        );
        const audioBlob = await response.blob();
        const playbackUrl = URL.createObjectURL(audioBlob);
        revokeTtsPlaybackUrl();
        ttsObjectUrlRef.current = playbackUrl;
        setTtsPlaybackUrl(playbackUrl);

        if (target) {
          target.src = playbackUrl;
          target.load();
        }

        return playbackUrl;
      } finally {
        setLoadingMode((current) => (current === 'tts' ? null : current));
      }
    },
    [
      audioUrl,
      fetchAuthorizedResponse,
      moduleId,
      primaryPlaybackUrl,
      revokeTtsPlaybackUrl,
      ttsPlaybackUrl,
    ],
  );

  useEffect(() => {
    const embeddedCaptionCues = normalizeCaptionCueList(captionData);
    if (embeddedCaptionCues.length) {
      setCaptionCues(embeddedCaptionCues);
      return;
    }

    const controller = new AbortController();

    if (!resolvedCaptionsUrl) {
      setCaptionCues([]);
      return () => controller.abort();
    }

    fetch(resolvedCaptionsUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load captions (${response.status})`);
        }

        const rawText = await response.text();
        setCaptionCues(parseCaptionCues(rawText));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCaptionCues([]);
        }
      });

    return () => controller.abort();
  }, [captionData, resolvedCaptionsUrl]);

  useEffect(() => {
    setShowTranscript(false);
    setCurrentTime(0);
    setResolvedDuration(0);
    setIsPrimaryPlaying(false);
    setIsTtsPlaying(false);
    setLoadingMode(null);
    setPrimaryPlaybackUrl(null);
    setResolvedTranscriptText(transcriptText?.trim() || '');
    setResolvedCaptionsUrl(captionsUrl || '');
    setCaptionCues(normalizeCaptionCueList(captionData));
    revokeTtsPlaybackUrl();
    cancelBrowserSpeech();

    if (primaryAudioRef.current) {
      primaryAudioRef.current.pause();
      primaryAudioRef.current.removeAttribute('src');
      primaryAudioRef.current.load();
      primaryAudioRef.current.currentTime = 0;
    }

    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
    }
  }, [audioUrl, cancelBrowserSpeech, captionData, captionsUrl, moduleId, revokeTtsPlaybackUrl, transcriptText, ttsUrl]);

  useEffect(() => {
    if (!(hasPrimaryAudio ?? Boolean(audioUrl))) {
      return;
    }

    void hydrateModuleAudioMetadata().catch(() => undefined);
    void ensureProtectedPlaybackSource('primary').catch(() => undefined);
  }, [audioUrl, ensureProtectedPlaybackSource, hasPrimaryAudio, hydrateModuleAudioMetadata]);

  useEffect(() => {
    const primaryAudio = primaryAudioRef.current;
    const ttsAudio = ttsAudioRef.current;

    return () => {
      if (primaryAudio) {
        primaryAudio.pause();
      }
      if (ttsAudio) {
        ttsAudio.pause();
      }
      revokeTtsPlaybackUrl();
      cancelBrowserSpeech();
    };
  }, [cancelBrowserSpeech, revokeTtsPlaybackUrl]);

  const transcriptBody =
    resolvedTranscriptText || captionCues.map((cue) => cue.text).join('\n').trim() || '';
  const canPlayPrimaryAudio = hasPrimaryAudio ?? Boolean(audioUrl);
  const canUseBrowserTtsFallback = Boolean(transcriptBody.trim());
  const shouldShowBrowserTtsFallback = !ttsUrl && canUseBrowserTtsFallback;
  const resolvedCaptionCues = captionCues.length
    ? captionCues
    : buildSimulatedCaptionCues(transcriptBody, resolvedDuration || durationSeconds);
  const activeCue =
    isPrimaryPlaying && resolvedCaptionCues.length
      ? resolvedCaptionCues.find((cue) => currentTime >= cue.start && currentTime <= cue.end) || null
      : null;
  const effectiveDuration =
    resolvedDuration
    || Number(durationSeconds || 0)
    || resolvedCaptionCues[resolvedCaptionCues.length - 1]?.end
    || 0;
  const progressValue = effectiveDuration > 0 ? Math.min((currentTime / effectiveDuration) * 100, 100) : 0;
  const transcriptVisible = showTranscript || isPrimaryPlaying || isTtsPlaying || loadingMode !== null;
  const playbackStatusLabel = loadingMode === 'primary'
    ? 'Fetching signed lesson audio URL...'
    : isPrimaryPlaying
      ? 'Now Playing'
        : currentTime > 0
          ? 'Paused'
        : canPlayPrimaryAudio || primaryPlaybackUrl
          ? 'Ready to Play'
          : 'Audio unavailable';

  async function restartPrimaryPlayback() {
    const target = primaryAudioRef.current;
    if (!target || loadingMode === 'primary' || !canPlayPrimaryAudio) {
      return;
    }

    try {
      await hydrateModuleAudioMetadata().catch(() => undefined);
      await ensureProtectedPlaybackSource('primary');
      target.currentTime = 0;
      setCurrentTime(0);
      await target.play();
    } catch {
      try {
        await ensureProtectedPlaybackSource('primary', true);
        target.currentTime = 0;
        setCurrentTime(0);
        await target.play();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Unable to replay this audio on the current device.',
        );
      }
    }
  }

  async function togglePrimaryPlayback() {
    const target = primaryAudioRef.current;
    if (!target || loadingMode === 'primary' || !canPlayPrimaryAudio) {
      return;
    }

    if (!target.paused) {
      target.pause();
      return;
    }

    if (ttsAudioRef.current && !ttsAudioRef.current.paused) {
      ttsAudioRef.current.pause();
    }
    cancelBrowserSpeech();

    setShowTranscript(true);

    try {
      await hydrateModuleAudioMetadata().catch(() => undefined);
      await ensureProtectedPlaybackSource('primary');
      await target.play();
    } catch {
      try {
        await hydrateModuleAudioMetadata().catch(() => undefined);
        await ensureProtectedPlaybackSource('primary', true);
        await target.play();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Unable to start audio playback on this device.',
        );
      }
    }
  }

  async function toggleTtsPlayback() {
    const target = ttsAudioRef.current;
    if (loadingMode === 'tts') {
      return;
    }

    if (!ttsUrl) {
      if (!shouldShowBrowserTtsFallback) {
        return;
      }

      if (!browserTtsService.isSupported()) {
        toast.error(BROWSER_TTS_UNSUPPORTED_MESSAGE);
        return;
      }

      if (isTtsPlaying) {
        cancelBrowserSpeech();
        return;
      }

      if (primaryAudioRef.current && !primaryAudioRef.current.paused) {
        primaryAudioRef.current.pause();
      }

      setShowTranscript(true);
      await hydrateModuleAudioMetadata().catch(() => undefined);

      setIsPrimaryPlaying(false);
      try {
        setIsTtsPlaying(true);
        await browserTtsService.speak(transcriptBody, {
          lang: languageLabel || 'en-US',
          rate: 0.96,
          voiceName: 'Google US English',
          onEnd: () => {
            setIsTtsPlaying(false);
          },
          onError: () => {
            setIsTtsPlaying(false);
          },
        });
      } catch (error) {
        setIsTtsPlaying(false);
        toast.error(error instanceof Error ? error.message : BROWSER_TTS_UNSUPPORTED_MESSAGE);
      }
      return;
    }

    if (!target) {
      return;
    }

    if (!target.paused) {
      target.pause();
      return;
    }

    if (primaryAudioRef.current && !primaryAudioRef.current.paused) {
      primaryAudioRef.current.pause();
    }
    cancelBrowserSpeech();

    setShowTranscript(true);

    try {
      await hydrateModuleAudioMetadata().catch(() => undefined);
      await ensureProtectedPlaybackSource('tts');
      await target.play();
    } catch (error) {
      if (!canUseBrowserTtsFallback) {
        toast.error(
          error instanceof Error ? error.message : 'Unable to start the accessibility audio playback.',
        );
        return;
      }

      toast.info('AI voice is using browser fallback mode.');

      if (!browserTtsService.isSupported()) {
        toast.error(BROWSER_TTS_UNSUPPORTED_MESSAGE);
        return;
      }

      try {
        setIsPrimaryPlaying(false);
        setIsTtsPlaying(true);
        await browserTtsService.speak(transcriptBody, {
          lang: languageLabel || 'en-US',
          rate: 0.96,
          voiceName: 'Google US English',
          onEnd: () => {
            setIsTtsPlaying(false);
          },
          onError: () => {
            setIsTtsPlaying(false);
          },
        });
      } catch (fallbackError) {
        setIsTtsPlaying(false);
        toast.error(
          fallbackError instanceof Error
            ? fallbackError.message
            : BROWSER_TTS_UNSUPPORTED_MESSAGE,
        );
      }
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
            {languageLabel || 'en-US'}
            {durationSeconds ? ` | ${durationSeconds}s` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPlayPrimaryAudio ? (
            <Button type="button" size="sm" disabled={loadingMode === 'primary'} onClick={() => void togglePrimaryPlayback()}>
              {loadingMode === 'primary' ? (
                <CircleDashed className="mr-2 size-4 animate-spin" />
              ) : isPrimaryPlaying ? (
                <Pause className="mr-2 size-4" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              {loadingMode === 'primary'
                ? 'Loading Audio...'
                : isPrimaryPlaying
                  ? 'Pause Audio'
                  : currentTime > 0
                    ? 'Resume Audio'
                    : 'Play Audio'}
            </Button>
          ) : null}
          {canPlayPrimaryAudio ? (
            <Button type="button" size="sm" variant="outline" disabled={loadingMode === 'primary'} onClick={() => void restartPrimaryPlayback()}>
              <RotateCcw className="mr-2 size-4" />
              Replay Audio
            </Button>
          ) : null}
          {ttsUrl || shouldShowBrowserTtsFallback ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loadingMode === 'tts'}
              onClick={() => void toggleTtsPlayback()}
            >
              {loadingMode === 'tts' ? (
                <CircleDashed className="mr-2 size-4 animate-spin" />
              ) : isTtsPlaying ? (
                <Pause className="mr-2 size-4" />
              ) : (
                <Volume2 className="mr-2 size-4" />
              )}
              {loadingMode === 'tts'
                ? 'Loading TTS...'
                : isTtsPlaying
                  ? (ttsUrl ? 'Pause TTS' : 'Stop Reading')
                  : (ttsUrl ? 'Play TTS' : 'Read Text')}
            </Button>
          ) : null}
          {transcriptBody ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowTranscript((current) => !current)}
            >
              <FileText className="mr-2 size-4" />
              {transcriptVisible ? 'Hide Text' : 'Show Text'}
            </Button>
          ) : null}
        </div>
      </div>

      {canPlayPrimaryAudio ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div
              className={`mt-1 flex size-10 items-center justify-center rounded-full ${
                isPrimaryPlaying ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isPrimaryPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <span className="relative flex size-2">
                    <span
                      className={`absolute inline-flex h-full w-full rounded-full ${
                        isPrimaryPlaying ? 'animate-ping bg-emerald-400/70' : 'bg-slate-300'
                      }`}
                    />
                    <span
                      className={`relative inline-flex size-2 rounded-full ${
                        isPrimaryPlaying ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                  </span>
                  <span>{playbackStatusLabel}</span>
                </div>
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {formatTimestamp(currentTime)} / {formatTimestamp(effectiveDuration)}
                </span>
              </div>
              <Progress value={progressValue} className="mt-3 h-2" />
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>Signed Supabase audio stream</span>
                <span>{loadingMode === 'primary' ? 'Requesting secure playback...' : isPrimaryPlaying ? 'Live' : 'Idle'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {shouldShowBrowserTtsFallback ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          AI voice is using browser fallback mode.
        </div>
      ) : null}

      <audio
        ref={primaryAudioRef}
        preload="metadata"
        controls
        className="mt-4 w-full"
        src={primaryPlaybackUrl || undefined}
        onLoadedMetadata={(event) => {
          const nextDuration = Number(event.currentTarget.duration);
          setResolvedDuration(Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : 0);
        }}
        onPlay={() => {
          if (ttsAudioRef.current && !ttsAudioRef.current.paused) {
            ttsAudioRef.current.pause();
          }
          cancelBrowserSpeech();
          setIsPrimaryPlaying(true);
          setIsTtsPlaying(false);
          setShowTranscript(true);
        }}
        onPause={() => setIsPrimaryPlaying(false)}
        onEnded={() => {
          setIsPrimaryPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onError={() => {
          setIsPrimaryPlaying(false);
        }}
      >
        {captionsUrl ? (
          <track kind="captions" src={captionsUrl} srcLang={languageLabel || 'en'} label="Captions" default />
        ) : null}
      </audio>

      <audio
        ref={ttsAudioRef}
        preload="metadata"
        className="hidden"
        src={ttsPlaybackUrl || undefined}
        onPlay={() => {
          if (primaryAudioRef.current && !primaryAudioRef.current.paused) {
            primaryAudioRef.current.pause();
          }
          setIsPrimaryPlaying(false);
          setIsTtsPlaying(true);
          setShowTranscript(true);
        }}
        onPause={() => setIsTtsPlaying(false)}
        onEnded={() => setIsTtsPlaying(false)}
        onError={() => setIsTtsPlaying(false)}
      />

      {transcriptVisible ? (
        <div
          className={`mt-4 rounded-lg border p-3 ${
            isPrimaryPlaying || isTtsPlaying ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{transcriptHeading}</p>
            <Badge variant="outline" className="text-xs">
              {isPrimaryPlaying ? 'Live Caption' : isTtsPlaying ? 'Caption During TTS' : 'Speech-to-Text Reference'}
            </Badge>
          </div>
          {activeCue ? (
            <div className="mt-3 rounded-lg border border-sky-200 bg-white px-3 py-2 text-base font-medium text-slate-900">
              {activeCue.text}
            </div>
          ) : null}
          {!activeCue && resolvedCaptionCues.length ? (
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
              Speech-to-Text Caption timeline loaded
            </p>
          ) : null}
          <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
            {transcriptBody || transcriptPlaceholder}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface VideoPlaybackCardProps {
  src: string;
  title: string;
  description: string;
  onCompleted?: () => void;
}

function VideoPlaybackCard({
  src,
  title,
  description,
  onCompleted,
}: VideoPlaybackCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.load();
    }
  }, [src]);

  async function togglePlayback() {
    const target = videoRef.current;
    if (!target) {
      return;
    }

    if (!target.paused) {
      target.pause();
      return;
    }

    try {
      await target.play();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to start video playback on this device.',
      );
    }
  }

  async function replayVideo() {
    const target = videoRef.current;
    if (!target) {
      return;
    }

    target.currentTime = 0;
    setCurrentTime(0);

    try {
      await target.play();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to replay this video on the current device.',
      );
    }
  }

  function seekTo(nextTime: number) {
    const target = videoRef.current;
    if (!target) {
      return;
    }

    target.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <Badge variant="outline" className="w-fit">
          {isPlaying ? 'Playing' : currentTime > 0 ? 'Paused' : 'Ready'}
        </Badge>
      </div>

      <video
        ref={videoRef}
        className="mt-4 w-full rounded-lg border bg-slate-950"
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDuration = Number(event.currentTarget.duration);
          setDuration(Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : 0);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(safeDuration);
          onCompleted?.();
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void togglePlayback()}>
          {isPlaying ? (
            <Pause className="mr-2 size-4" />
          ) : (
            <Play className="mr-2 size-4" />
          )}
          {isPlaying ? 'Pause Video' : currentTime > 0 ? 'Resume Video' : 'Play Video'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void replayVideo()}>
          <RotateCcw className="mr-2 size-4" />
          Replay Video
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <input
          type="range"
          min={0}
          max={safeDuration || 0}
          step="0.1"
          value={Math.min(currentTime, safeDuration || 0)}
          onChange={(event) => seekTo(Number(event.target.value))}
          disabled={!safeDuration}
          className="w-full accent-sky-600"
        />
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{formatTimestamp(currentTime)}</span>
          <span>{formatTimestamp(safeDuration)}</span>
        </div>
        <p className="text-xs text-slate-500">
          Use the slider to seek to any timestamp before replaying or continuing the lesson.
        </p>
      </div>
    </div>
  );
}

interface TimedFlashcardSessionCardProps {
  assignmentId: string;
  assignment: AssignmentSummary;
  exercise: AssignmentExercise | null;
  response: ExerciseResponseState;
  session: FlashcardSessionState | null;
  isSaving: boolean;
  onDraftChange: (patch: Partial<ExerciseResponseState>) => void;
  onPersistDraft: (responseText: string, revealedSide: FlashcardSide) => Promise<void>;
  onAutoSubmit: (status: 'timed_out' | 'unanswered') => void;
}

function TimedFlashcardSessionCard({
  assignmentId,
  assignment,
  exercise,
  response,
  session,
  isSaving,
  onDraftChange,
  onPersistDraft,
  onAutoSubmit,
}: TimedFlashcardSessionCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autoSubmitRef = useRef('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const tickClock = useEffectEvent(() => {
    setNowMs(Date.now());
  });
  const triggerAutoSubmit = useEffectEvent((nextStatus: 'timed_out' | 'unanswered') => {
    onAutoSubmit(nextStatus);
  });

  useEffect(() => {
    tickClock();
    const intervalId = window.setInterval(() => {
      tickClock();
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [tickClock, session?.answer_deadline_at, session?.current_exercise_id, session?.phase]);

  const totalCards = Math.max(0, session?.total_cards || 0);
  const completedCards = Math.max(0, session?.completed_cards || 0);
  const studySeconds = getPositiveWholeNumber(
    session?.study_time_seconds ?? exercise?.preview_seconds,
    DEFAULT_FLASHCARD_PREVIEW_SECONDS,
  );
  const answerSeconds = getPositiveWholeNumber(
    session?.answer_time_seconds ?? exercise?.answer_time_limit_seconds,
    DEFAULT_FLASHCARD_ANSWER_TIME_LIMIT_SECONDS,
  );
  const studyStartMs = session?.study_started_at ? new Date(session.study_started_at).getTime() : NaN;
  const answerStartMs = session?.answer_started_at ? new Date(session.answer_started_at).getTime() : NaN;
  const answerDeadlineMs = session?.answer_deadline_at ? new Date(session.answer_deadline_at).getTime() : NaN;
  const hasLiveWindow =
    Number.isFinite(studyStartMs) && Number.isFinite(answerStartMs) && Number.isFinite(answerDeadlineMs);

  let derivedPhase = session?.phase || 'not_started';
  if (derivedPhase !== 'completed' && hasLiveWindow) {
    if (nowMs < answerStartMs) {
      derivedPhase = 'study';
    } else if (nowMs < answerDeadlineMs) {
      derivedPhase = 'answer';
    } else {
      derivedPhase = 'expired';
    }
  }

  const answerSide =
    session?.revealed_side === 'front'
      ? 'front'
      : session?.current_prompt_side === 'front'
        ? 'front'
        : 'back';
  const promptSide: FlashcardSide = answerSide === 'front' ? 'back' : 'front';
  const promptText = promptSide === 'front' ? exercise?.front || 'No front text set.' : exercise?.back || 'No back text set.';
  const answerLabel = answerSide === 'front' ? 'Front' : 'Back';
  const activeDeadlineMs = derivedPhase === 'study' ? answerStartMs : answerDeadlineMs;
  const secondsRemaining =
    Number.isFinite(activeDeadlineMs) ? Math.max(0, Math.ceil((activeDeadlineMs - nowMs) / 1000)) : 0;
  const phaseDurationSeconds = derivedPhase === 'study' ? studySeconds : answerSeconds;
  const phaseProgressValue =
    phaseDurationSeconds > 0
      ? Math.max(0, Math.min(100, ((phaseDurationSeconds - secondsRemaining) / phaseDurationSeconds) * 100))
      : 0;
  const autoSubmitKey = `${assignmentId}:${exercise?.id || 'done'}:${session?.answer_deadline_at || 'na'}`;
  useEffect(() => {
    if (!exercise) {
      return;
    }

    if (derivedPhase === 'answer') {
      if (response.revealedSide !== answerSide) {
        onDraftChange({
          revealedSide: answerSide,
          inputMode: 'typed',
        });
      }
      if (!isSaving) {
        textareaRef.current?.focus();
      }
      return;
    }

    if ((derivedPhase === 'study' || derivedPhase === 'not_started') && response.revealedSide) {
      onDraftChange({
        revealedSide: '',
      });
    }
  }, [answerSide, derivedPhase, exercise, isSaving, onDraftChange, response.revealedSide]);

  useEffect(() => {
    if (!exercise || derivedPhase !== 'answer') {
      return;
    }

    const latestDraft = session?.draft_response_text || '';
    if (response.responseText === latestDraft && (response.revealedSide || answerSide) === answerSide) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void onPersistDraft(response.responseText, answerSide);
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [answerSide, derivedPhase, exercise, onPersistDraft, response.responseText, response.revealedSide, session?.draft_response_text]);

  useEffect(() => {
    autoSubmitRef.current = '';
  }, [autoSubmitKey]);

  useEffect(() => {
    if (!exercise || derivedPhase !== 'expired' || isSaving) {
      return;
    }
    if (autoSubmitRef.current === autoSubmitKey) {
      return;
    }

    autoSubmitRef.current = autoSubmitKey;
    triggerAutoSubmit(response.responseText.trim() ? 'timed_out' : 'unanswered');
  }, [autoSubmitKey, derivedPhase, exercise, isSaving, response.responseText, triggerAutoSubmit]);

  if (!session || !session.enabled) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        Flashcard timing will appear here once the module is ready.
      </div>
    );
  }

  if (session.phase === 'completed' || (!exercise && completedCards >= totalCards && totalCards > 0)) {
    return (
      <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">Flashcard Module Complete</p>
            <p className="mt-1 text-sm text-emerald-900">
              All {totalCards} flashcards have finished their 30-second study and 60-second answer windows.
            </p>
          </div>
          <Badge className="border-emerald-200 bg-white text-emerald-700">
            Average Score: {Math.round(assignment.average_score || 0)}%
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-emerald-900">
            <span>Deck progress</span>
            <span>{completedCards} / {totalCards} cards completed</span>
          </div>
          <Progress value={100} />
        </div>
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
        Waiting for the next flashcard to sync.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={derivedPhase === 'study' ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>
                {derivedPhase === 'study' ? 'Study Mode' : 'Answer Mode'}
              </Badge>
              <Badge variant="outline">Card {session.current_card_number} of {totalCards}</Badge>
            </div>
            <p className="mt-3 text-lg font-semibold text-slate-900">{exercise.title}</p>
            <p className="mt-1 text-sm text-slate-600">{exercise.prompt}</p>
          </div>
          <div className="min-w-[220px] rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {derivedPhase === 'study' ? 'Study Time Remaining' : 'Answer Time Remaining'}
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{secondsRemaining}s</p>
              </div>
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock3 className="size-3.5" />
                {derivedPhase === 'study' ? `${studySeconds}s study` : `${answerSeconds}s answer`}
              </Badge>
            </div>
            <div className="mt-4">
              <Progress value={phaseProgressValue} />
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Flashcard progress</span>
            <span>{completedCards} completed, {Math.max(0, totalCards - completedCards)} remaining</span>
          </div>
          <Progress value={session.progress_percentage || 0} />
        </div>

        {derivedPhase === 'study' ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-sky-700">Front</p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{exercise.front || 'No front text set.'}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-sky-700">Back</p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{exercise.back || 'No back text set.'}</p>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Prompt</p>
              <p className="mt-2 text-sm text-slate-700">
                Keep this side visible while you answer. Your response will be saved automatically when the 60-second
                answer timer ends.
              </p>
              <div className="mt-4 rounded-lg border border-white/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{promptSide === 'front' ? 'Front Side' : 'Back Side'}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{promptText}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${exercise.id}-timed-flashcard-answer`}>Answer the {answerLabel} side</Label>
              <Textarea
                ref={textareaRef}
                id={`${exercise.id}-timed-flashcard-answer`}
                value={response.responseText}
                disabled={derivedPhase !== 'answer' || isSaving}
                placeholder={
                  derivedPhase === 'answer'
                    ? 'Type your answer here. The system saves it automatically when the timer reaches zero.'
                    : 'Inputs unlock automatically once Study Mode ends.'
                }
                onChange={(event) =>
                  onDraftChange({
                    responseText: event.target.value,
                    inputMode: 'typed',
                  })
                }
              />
              <p className="text-xs text-slate-500">
                {derivedPhase === 'answer'
                  ? 'Answer inputs stay enabled only during Answer Mode.'
                  : 'Answer inputs are disabled during Study Mode to keep the timing sequence consistent.'}
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

export default function MicrolearningHub() {
  const { token, isLoading: isAuthLoading } = useAuth();

  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState('');
  const [queueFilter, setQueueFilter] = useState<ModuleQueueFilter>('all');
  const [assignmentDetail, setAssignmentDetail] = useState<AssignmentDetailResponse | null>(null);
  const [exerciseResponses, setExerciseResponses] = useState<Record<string, ExerciseResponseState>>({});
  const [activeExerciseIndexes, setActiveExerciseIndexes] = useState<Record<string, number>>({});
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [refreshingAssignments, setRefreshingAssignments] = useState(false);
  const [startingAssignment, setStartingAssignment] = useState(false);
  const [submittingExerciseId, setSubmittingExerciseId] = useState('');
  const [videoCompleted, setVideoCompleted] = useState<Record<string, boolean>>({});
  const [moduleAssetPlaybackUrls, setModuleAssetPlaybackUrls] = useState<Record<string, string>>({});
  const [quizReadingConfirmed, setQuizReadingConfirmed] = useState<Record<string, boolean>>({});
  const [activeSpeechExerciseId, setActiveSpeechExerciseId] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSeedTextRef = useRef('');

  const apiRequest = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
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

    const payload = await readApiPayload<T>(response);

    if (!response.ok) {
      throw new Error(getApiErrorMessage(payload, 'Request failed. Please try again.'));
    }

    if (payload === null || payload === undefined || typeof payload === 'string') {
      if (response.status === 204) {
        return undefined as T;
      }
      throw new Error('The server returned an invalid response. Please try again.');
    }

    return payload as T;
  }, [token]);

  const loadProtectedModuleAsset = useCallback(async (moduleId: string) => {
    const cachedUrl = moduleAssetPlaybackUrls[moduleId];
    if (cachedUrl) {
      return cachedUrl;
    }

    const payload = await apiRequest<AuthorizedModuleAssetPlaybackPayload>(
      `/api/microlearning/modules/${moduleId}/asset/signed-url`,
    );
    const nextUrl =
      (typeof payload.signed_url === 'string' ? payload.signed_url.trim() : '')
      || (typeof payload.asset_url === 'string' ? payload.asset_url.trim() : '');

    if (!nextUrl) {
      throw new Error('The lesson asset is missing a playable Supabase URL.');
    }

    setModuleAssetPlaybackUrls((current) => ({ ...current, [moduleId]: nextUrl }));
    return nextUrl;
  }, [apiRequest, moduleAssetPlaybackUrls]);

  const loadAssignmentDetail = useCallback(async (
    assignmentId: string,
    options: LoadAssignmentDetailOptions = {},
  ) => {
    if (!assignmentId) {
      setAssignmentDetail(null);
      setExerciseResponses({});
      return;
    }

    const includeExercises = options.includeExercises ?? true;
    setIsLoadingDetail(true);

    try {
      const detail = await apiRequest<AssignmentDetailResponse>(
        `/api/trainee/microlearning-assignments/${assignmentId}${includeExercises ? '' : '?include_exercises=false'}`,
      );

      const nextResponses: Record<string, ExerciseResponseState> = {};
      (detail.exercises || []).forEach((exercise) => {
        const storedFlashcardDraft =
          exercise.type === 'flashcard_recall' && !exercise.attempt?.is_completed
            ? readFlashcardDraft(assignmentId, exercise.id)
            : '';
        const flashcardSession = detail.flashcard_session;
        const isActiveFlashcard =
          exercise.type === 'flashcard_recall' &&
          flashcardSession?.current_exercise_id === exercise.id &&
          flashcardSession.phase !== 'study' &&
          flashcardSession.phase !== 'not_started';
        nextResponses[exercise.id] = {
          responseText:
            exercise.type === 'flashcard_recall' && !exercise.attempt?.is_completed
              ? flashcardSession?.current_exercise_id === exercise.id
                ? flashcardSession.draft_response_text || storedFlashcardDraft || exercise.attempt?.response_text || ''
                : storedFlashcardDraft || exercise.attempt?.response_text || ''
              : exercise.attempt?.response_text || '',
          selectedOption: exercise.attempt?.selected_option || '',
          inputMode:
            (exercise.attempt?.input_mode as 'typed' | 'speech' | 'selection' | undefined) ||
            (exercise.type === 'multiple_choice' ? 'selection' : 'typed'),
          revealedSide:
            exercise.type === 'flashcard_recall'
              ? (
                (exercise.attempt?.revealed_side as 'front' | 'back' | undefined)
                || (flashcardSession?.current_exercise_id === exercise.id
                  ? (flashcardSession.revealed_side as 'front' | 'back' | undefined)
                  : undefined)
                || (isActiveFlashcard ? 'back' : '')
              )
              : '',
          };
      });

      const firstIncompleteExerciseIndex = detail.exercises.findIndex(
        (exercise) => exercise.type !== 'flashcard_recall' && !exercise.attempt?.is_completed,
      );
      const nextExerciseIndex =
        firstIncompleteExerciseIndex >= 0
          ? firstIncompleteExerciseIndex
          : Math.max(0, detail.exercises.findIndex((exercise) => exercise.type !== 'flashcard_recall'));

      startTransition(() => {
        setAssignmentDetail(detail);
        setExerciseResponses(nextResponses);
        setActiveExerciseIndexes((current) => ({
          ...current,
          [detail.assignment.id]: nextExerciseIndex >= 0 ? nextExerciseIndex : 0,
        }));
        if (detail.assignment.completed_exercises && detail.assignment.completed_exercises > 0) {
          setVideoCompleted((current) => ({ ...current, [assignmentId]: true }));
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load this module.';
      toast.error(message);
    } finally {
      setIsLoadingDetail(false);
    }
  }, [apiRequest]);

  const loadAssignments = useCallback(async ({ preferredAssignmentId, refreshDetail = true }: LoadAssignmentsOptions = {}) => {
    if (!token) {
      setIsLoadingAssignments(false);
      setRefreshingAssignments(false);
      return;
    }

    if (assignments.length === 0 && !preferredAssignmentId) {
      setIsLoadingAssignments(true);
    } else {
      setRefreshingAssignments(true);
    }

    try {
      const response = await apiRequest<{ assignments: AssignmentSummary[] }>(
        '/api/trainee/microlearning-assignments',
      );
      const nextAssignments = sortAssignmentsForQueue(response.assignments || []);
      const nextActiveId =
        (preferredAssignmentId && nextAssignments.some((assignment) => assignment.id === preferredAssignmentId)
          ? preferredAssignmentId
          : undefined) ||
        (activeAssignmentId && nextAssignments.some((assignment) => assignment.id === activeAssignmentId)
          ? activeAssignmentId
          : undefined) ||
        nextAssignments.find((assignment) => assignment.can_retake)?.id ||
        nextAssignments.find((assignment) => !['completed', 'certified'].includes(assignment.status))?.id ||
        nextAssignments[0]?.id ||
        '';

      startTransition(() => {
        setAssignments(nextAssignments);
        setActiveAssignmentId(nextActiveId);
      });

      if (nextActiveId) {
        const nextActiveAssignment =
          nextAssignments.find((assignment) => assignment.id === nextActiveId) || null;
        const shouldReloadDetail =
          refreshDetail ||
          !assignmentDetail ||
          assignmentDetail.assignment.id !== nextActiveId;
        if (shouldReloadDetail) {
          await loadAssignmentDetail(nextActiveId, {
            includeExercises: hasStartedAssignment(nextActiveAssignment),
          });
        }
      } else {
        setAssignmentDetail(null);
        setExerciseResponses({});
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load your assignments.';
      toast.error(message);
    } finally {
      setIsLoadingAssignments(false);
      setRefreshingAssignments(false);
    }
  }, [token, assignments.length, activeAssignmentId, assignmentDetail, apiRequest, loadAssignmentDetail]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    void loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, token]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  useEffect(() => {
    if (isAuthLoading || !token) {
      return;
    }

    const syncAssignments = () => {
      void loadAssignments({
        preferredAssignmentId: activeAssignmentId || undefined,
        refreshDetail: false,
      });
    };

    const intervalId = window.setInterval(syncAssignments, 30000);
    window.addEventListener('focus', syncAssignments);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncAssignments);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAssignmentId, isAuthLoading, token]);

  useEffect(() => {
    if (isAuthLoading || !token) {
      return;
    }

    let socket: WebSocket | null = null;

    try {
      socket = openTraineeMicrolearningLiveUpdates(token);
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (
            payload.type === 'microlearning_module_deleted' ||
            payload.type === 'microlearning_assignments_changed'
          ) {
            void loadAssignments({
              preferredAssignmentId: activeAssignmentId || undefined,
              refreshDetail: false,
            });
          }
        } catch {
          // Ignore malformed live-update payloads and keep polling available.
        }
      };
    } catch (socketError) {
      console.error(socketError);
    }

    return () => {
      socket?.close();
    };
  }, [activeAssignmentId, isAuthLoading, loadAssignments, token]);

  useEffect(() => {
    const moduleDetail = assignmentDetail?.module;
    if (!moduleDetail?.id) {
      return;
    }

    const content = moduleDetail.content_data || {};
    const rawAssetUrl =
      moduleDetail.content_url ||
      content.asset_url ||
      '';
    const hasStoredSupabasePath =
      typeof content.asset_storage_path === 'string' && content.asset_storage_path.trim().length > 0;
    const shouldProtectVideoAsset =
      moduleDetail.module_type === 'video'
      && getVideoAssetKind(rawAssetUrl) === 'file'
      && (hasStoredSupabasePath || isSupabaseStoragePublicUrl(rawAssetUrl));
    const shouldProtectInfographicAsset =
      moduleDetail.module_type === 'infographic'
      && Boolean(rawAssetUrl)
      && (hasStoredSupabasePath || isSupabaseStoragePublicUrl(rawAssetUrl));

    if (!(shouldProtectVideoAsset || shouldProtectInfographicAsset)) {
      return;
    }

    if (moduleAssetPlaybackUrls[moduleDetail.id]) {
      return;
    }

    void loadProtectedModuleAsset(moduleDetail.id).catch(() => undefined);
  }, [assignmentDetail, loadProtectedModuleAsset, moduleAssetPlaybackUrls]);

  useEffect(() => {
    if (!activeAssignmentId || assignmentDetail?.module.module_type !== 'flashcard') {
      return;
    }

    (assignmentDetail.exercises || []).forEach((exercise) => {
      if (exercise.type !== 'flashcard_recall') {
        return;
      }
      if (exercise.attempt?.is_completed) {
        clearFlashcardDraft(activeAssignmentId, exercise.id);
        return;
      }

      writeFlashcardDraft(
        activeAssignmentId,
        exercise.id,
        exerciseResponses[exercise.id]?.responseText || '',
      );
    });
  }, [activeAssignmentId, assignmentDetail, exerciseResponses]);

  function updateExerciseResponse(exerciseId: string, patch: Partial<ExerciseResponseState>) {
    setExerciseResponses((current) => ({
      ...current,
      [exerciseId]: {
        responseText: current[exerciseId]?.responseText || '',
        selectedOption: current[exerciseId]?.selectedOption || '',
        inputMode: current[exerciseId]?.inputMode || 'typed',
        ...patch,
      },
    }));
  }

  const persistFlashcardSessionDraft = useCallback(async (responseText: string, revealedSide: FlashcardSide) => {
    const currentAssignment =
      assignments.find((assignment) => assignment.id === activeAssignmentId)
      || assignmentDetail?.assignment
      || null;
    const currentExerciseId = assignmentDetail?.flashcard_session?.current_exercise_id || null;

    if (
      !activeAssignmentId
      || assignmentDetail?.module.module_type !== 'flashcard'
      || !currentExerciseId
      || !hasStartedAssignment(currentAssignment)
    ) {
      return;
    }

    try {
      const result = await apiRequest<{
        status: string;
        assignment: AssignmentSummary;
        flashcard_session?: FlashcardSessionState | null;
      }>(
        `/api/trainee/microlearning-assignments/${activeAssignmentId}/flashcard-session`,
        {
          method: 'POST',
          body: JSON.stringify({
            exercise_id: currentExerciseId,
            response_text: responseText || '',
            revealed_side: revealedSide,
          }),
        },
      );

      if (!result.flashcard_session) {
        return;
      }

      startTransition(() => {
        setAssignmentDetail((current) => (
          current && current.assignment.id === activeAssignmentId
            ? {
              ...current,
              assignment: result.assignment || current.assignment,
              flashcard_session: result.flashcard_session,
            }
            : current
        ));
        setAssignments((current) => sortAssignmentsForQueue(
          current.map((assignment) => (
            assignment.id === activeAssignmentId
              ? { ...assignment, ...result.assignment }
              : assignment
          )),
        ));
      });
    } catch {
      // Keep the local draft and retry on the next change or timeout edge.
    }
  }, [
    activeAssignmentId,
    apiRequest,
    assignments,
    assignmentDetail?.module.module_type,
    assignmentDetail?.assignment,
    assignmentDetail?.flashcard_session?.current_exercise_id,
  ]);

  async function handleStartAssignment() {
    if (!activeAssignmentId) {
      toast.error('Select an assigned module before starting.');
      return;
    }

    setStartingAssignment(true);

    try {
      await apiRequest(`/api/trainee/microlearning-assignments/${activeAssignmentId}/start`, {
        method: 'POST',
      });
      toast.success('Module started. Review the lesson, then complete every assigned assessment.');
      await loadAssignments({ preferredAssignmentId: activeAssignmentId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start this module.';
      toast.error(message);
    } finally {
      setStartingAssignment(false);
    }
  }

  const handleSelectAssignment = useCallback(async (assignmentId: string) => {
    recognitionRef.current?.stop();
    setActiveAssignmentId(assignmentId);
    const selectedAssignment = assignments.find((assignment) => assignment.id === assignmentId) || null;
    await loadAssignmentDetail(assignmentId, {
      includeExercises: hasStartedAssignment(selectedAssignment),
    });
  }, [assignments, loadAssignmentDetail]);

  async function handleRetakeAssignment() {
    if (!activeAssignmentId) {
      toast.error('Select a module before requesting a retake.');
      return;
    }

    setStartingAssignment(true);

    try {
      await apiRequest(`/api/trainee/microlearning-assignments/${activeAssignmentId}/retake`, {
        method: 'POST',
      });
      toast.success('Retake unlocked. The lesson has been reset so you can try again.');
      await loadAssignments({ preferredAssignmentId: activeAssignmentId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reset this module for retake.';
      toast.error(message);
    } finally {
      setStartingAssignment(false);
    }
  }

  function handleSpeechCapture(exerciseId: string) {
    const RecognitionCtor =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;

    if (!RecognitionCtor) {
      toast.error('Speech-to-text is not available in this browser. You can still type your response.');
      return;
    }

    if (activeSpeechExerciseId === exerciseId) {
      recognitionRef.current?.stop();
      return;
    }

    recognitionRef.current?.stop();

    const recognition = new RecognitionCtor();
    speechSeedTextRef.current = (exerciseResponses[exerciseId]?.responseText || '').trim();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = collectSpeechTranscript(event);
      const combinedResponse = [speechSeedTextRef.current, transcript]
        .filter(Boolean)
        .join(speechSeedTextRef.current && transcript ? ' ' : '');

      updateExerciseResponse(exerciseId, {
        responseText: combinedResponse,
        inputMode: 'speech',
      });
    };
    recognition.onerror = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setActiveSpeechExerciseId((current) => (current === exerciseId ? '' : current));
      toast.error('Speech capture stopped unexpectedly. You can try again or keep typing.');
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setActiveSpeechExerciseId((current) => (current === exerciseId ? '' : current));
    };

    recognitionRef.current = recognition;
    recognition.start();
    setActiveSpeechExerciseId(exerciseId);
    toast.success('Speech-to-text is listening. Deliver your response naturally.');
  }

  function resetExerciseDraft(exercise: AssignmentExercise) {
    if (activeSpeechExerciseId === exercise.id) {
      recognitionRef.current?.stop();
    }

    updateExerciseResponse(exercise.id, {
      responseText: '',
      selectedOption: '',
      inputMode: exercise.type === 'multiple_choice' ? 'selection' : 'typed',
      revealedSide: '',
    });
  }

  async function handleSubmitExercise(
    exercise: AssignmentExercise,
    options: SubmitExerciseOptions = {},
  ): Promise<SubmitExerciseResponse | null> {
    if (!activeAssignmentId) {
      toast.error('Choose a module before saving an exercise.');
      return null;
    }
    if (!hasStartedAssignment(activeAssignment)) {
      toast.error('Start the module first before submitting the assessment.');
      return null;
    }
    if (activeModuleGateState?.assessmentUnavailable) {
      toast.error(activeModuleGateState.lockMessage);
      return null;
    }
    if (activeModuleGateState?.videoReviewLocked && !exercise.attempt) {
      toast.error(activeModuleGateState.lockMessage);
      return null;
    }

    const response = exerciseResponses[exercise.id] || {
      responseText: '',
      selectedOption: '',
      inputMode: exercise.type === 'multiple_choice' ? 'selection' : 'typed',
    };

    if (exercise.type === 'multiple_choice' && !response.selectedOption) {
      toast.error('Choose an answer before submitting.');
      return null;
    }

    if (
      !options.allowBlank &&
      (exercise.type === 'keyword_response' || exercise.type === 'flashcard_recall') &&
      !response.responseText.trim()
    ) {
      toast.error('Type your answer before submitting.');
      return null;
    }

    if (exercise.type === 'flashcard_recall' && !response.revealedSide) {
      toast.error('Wait for Answer Mode to begin before the flashcard response is saved.');
      return null;
    }

    if (exercise.type === 'flashcard_recall' && !options.timerExpired) {
      toast.error('Flashcard answers are saved automatically when the 60-second answer timer reaches zero.');
      return null;
    }

    setSubmittingExerciseId(exercise.id);

    try {
      const result = await apiRequest<SubmitExerciseResponse>(
        `/api/trainee/microlearning-assignments/${activeAssignmentId}/exercises/${exercise.id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            response_text: response.responseText || null,
            selected_option: response.selectedOption || null,
            input_mode: response.inputMode || (exercise.type === 'multiple_choice' ? 'selection' : 'typed'),
            revealed_side: response.revealedSide || null,
            study_time_seconds:
              exercise.type === 'flashcard_recall'
                ? assignmentDetail?.flashcard_session?.study_time_seconds || DEFAULT_FLASHCARD_PREVIEW_SECONDS
                : null,
            answer_time_seconds:
              exercise.type === 'flashcard_recall'
                ? assignmentDetail?.flashcard_session?.answer_time_seconds || DEFAULT_FLASHCARD_ANSWER_TIME_LIMIT_SECONDS
                : null,
            status: options.status || null,
            answered_at:
              exercise.type === 'flashcard_recall' && assignmentDetail?.flashcard_session?.answer_deadline_at
                ? assignmentDetail.flashcard_session.answer_deadline_at
                : null,
            timer_expired: options.timerExpired || false,
          }),
        },
      );

      if (exercise.type === 'flashcard_recall') {
        clearFlashcardDraft(activeAssignmentId, exercise.id);
        clearPendingFlashcardSubmission(activeAssignmentId);
      }

      if (result.assignment.is_passed && result.assignment.certificate_id) {
        toast.success('Module passed. Your certificate has been unlocked.');
      } else if (result.assignment.completed_exercises === result.assignment.exercise_count && !result.assignment.is_passed) {
        toast.success('Module completed. Review your score and retake it if needed.');
      } else if (!options.suppressSuccessToast) {
        toast.success('Exercise saved successfully.');
      }
      await loadAssignments({ preferredAssignmentId: activeAssignmentId });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save this exercise.';
      if (exercise.type === 'flashcard_recall' && options.timerExpired) {
        writePendingFlashcardSubmission({
          assignmentId: activeAssignmentId,
          exerciseId: exercise.id,
          savedAt: new Date().toISOString(),
        });
        toast.error('Connection issue detected. We will retry this flashcard automatically when you are back online.');
      } else {
        toast.error(message);
      }
      return null;
    } finally {
      setSubmittingExerciseId('');
    }
  }

  const activeAssignment = assignments.find((assignment) => assignment.id === activeAssignmentId) || assignmentDetail?.assignment || null;
  const hasDetailForActiveAssignment = assignmentDetail?.assignment?.id === activeAssignmentId;
  const moduleStarted = hasStartedAssignment(activeAssignment);
  const quizReadingContent = assignmentDetail ? getQuizReadingContent(assignmentDetail.module.content_data || {}) : '';
  const quizReadingGateKey = getQuizReadingGateKey(activeAssignment);
  const isQuizReadingLocked = Boolean(
    assignmentDetail &&
      assignmentDetail.module.module_type === 'quiz' &&
      quizReadingContent &&
      !quizReadingConfirmed[quizReadingGateKey],
  );
  const activeModuleGateState =
    assignmentDetail && activeAssignment
      ? getModuleMediaGateState(
          assignmentDetail.module,
          activeAssignment,
          moduleAssetPlaybackUrls[assignmentDetail.module.id] || '',
          Boolean(videoCompleted[activeAssignment.id] || activeAssignment.completed_exercises),
        )
      : null;
  const retryPendingFlashcardSubmission = useEffectEvent(async () => {
    if (!activeAssignmentId || assignmentDetail?.module.module_type !== 'flashcard') {
      return;
    }

    const pending = readPendingFlashcardSubmission(activeAssignmentId);
    if (!pending) {
      return;
    }

    const currentExerciseId = assignmentDetail.flashcard_session?.current_exercise_id;
    if (!currentExerciseId || pending.exerciseId !== currentExerciseId) {
      clearPendingFlashcardSubmission(activeAssignmentId);
      return;
    }

    const currentExercise = assignmentDetail.exercises.find((exercise) => exercise.id === currentExerciseId);
    if (!currentExercise || submittingExerciseId) {
      return;
    }

    await handleSubmitExercise(currentExercise, {
      timerExpired: true,
      allowBlank: true,
      status: (exerciseResponses[currentExercise.id]?.responseText || '').trim() ? 'timed_out' : 'unanswered',
      suppressSuccessToast: true,
    });
  });
  const notStartedAssignments = assignments.filter((assignment) => assignment.status === 'assigned').length;
  const completedAssignments = assignments.filter((assignment) => ['completed', 'certified'].includes(assignment.status)).length;
  const certifiedAssignments = assignments.filter((assignment) => assignment.status === 'certified' || assignment.certificate_id).length;
  const inProgressAssignments = assignments.filter((assignment) => assignment.status === 'in_progress').length;
  const audioLessonCount = assignments.filter((assignment) => assignment.module_type === 'audio').length;
  const assignedCount = assignments.length;
  const isFlashcardModule = assignmentDetail?.module.module_type === 'flashcard';
  const flashcardSession = assignmentDetail?.flashcard_session || null;
  const flashcardExercises = isFlashcardModule
    ? assignmentDetail?.exercises.filter((exercise) => exercise.type === 'flashcard_recall') || []
    : [];
  const activeFlashcardExercise = isFlashcardModule
    ? (
      flashcardExercises.find((exercise) => exercise.id === flashcardSession?.current_exercise_id)
      || flashcardExercises.find((exercise) => !exercise.attempt?.is_completed)
      || flashcardExercises[0]
      || null
    )
    : null;
  const activeFlashcardResponse = activeFlashcardExercise
    ? (
      exerciseResponses[activeFlashcardExercise.id] || {
        responseText: '',
        selectedOption: '',
        inputMode: 'typed',
        revealedSide: '' as const,
      }
    )
    : {
      responseText: '',
      selectedOption: '',
      inputMode: 'typed' as const,
      revealedSide: '' as const,
    };
  const standardExercises = !isFlashcardModule
    ? assignmentDetail?.exercises.filter((exercise) => exercise.type !== 'flashcard_recall') || []
    : [];
  const activeStandardExerciseIndex = activeAssignmentId
    ? Math.max(
      0,
      Math.min(
        activeExerciseIndexes[activeAssignmentId] ?? 0,
        Math.max(standardExercises.length - 1, 0),
      ),
    )
    : 0;
  const activeStandardExercise = standardExercises[activeStandardExerciseIndex] || null;
  const activeStandardResponse = activeStandardExercise
    ? (
      exerciseResponses[activeStandardExercise.id] || {
        responseText: '',
        selectedOption: '',
        inputMode: activeStandardExercise.type === 'multiple_choice' ? 'selection' : 'typed',
        revealedSide: '' as const,
      }
    )
    : {
      responseText: '',
      selectedOption: '',
      inputMode: 'typed' as const,
      revealedSide: '' as const,
    };
  const assignmentResultSummary = assignmentDetail?.result_summary || null;
  const shouldShowModuleResultSummary = Boolean(
    assignmentResultSummary
      && activeAssignment
      && isCompletedAssignment(activeAssignment.status)
      && activeAssignment.completed_exercises >= activeAssignment.exercise_count,
  );
  const canMoveToPreviousExercise = activeStandardExerciseIndex > 0;
  const isLastStandardExercise = activeStandardExerciseIndex >= Math.max(standardExercises.length - 1, 0);

  function setActiveExerciseIndex(assignmentId: string, nextIndex: number) {
    setActiveExerciseIndexes((current) => ({
      ...current,
      [assignmentId]: Math.max(0, nextIndex),
    }));
  }

  function moveStandardExercise(direction: -1 | 1) {
    if (!activeAssignmentId || !standardExercises.length) {
      return;
    }

    const nextIndex = Math.max(
      0,
      Math.min(standardExercises.length - 1, activeStandardExerciseIndex + direction),
    );
    setActiveExerciseIndex(activeAssignmentId, nextIndex);
  }

  async function handleAdvanceStandardExercise() {
    if (!activeStandardExercise) {
      return;
    }

    if (activeStandardExercise.attempt?.is_completed) {
      moveStandardExercise(1);
      return;
    }

    const result = await handleSubmitExercise(activeStandardExercise, {
      suppressSuccessToast: true,
    });
    if (result && activeAssignmentId && !isLastStandardExercise) {
      setActiveExerciseIndex(activeAssignmentId, activeStandardExerciseIndex + 1);
    }
  }

  async function handleSubmitStandardModule() {
    if (!activeStandardExercise) {
      return;
    }

    if (activeStandardExercise.attempt?.is_completed) {
      return;
    }

    await handleSubmitExercise(activeStandardExercise, {
      suppressSuccessToast: true,
    });
  }

  useEffect(() => {
    if (!activeAssignmentId || assignmentDetail?.module.module_type !== 'flashcard') {
      return;
    }

    const retry = () => {
      void retryPendingFlashcardSubmission();
    };

    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    void retryPendingFlashcardSubmission();

    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
    };
  }, [activeAssignmentId, assignmentDetail, retryPendingFlashcardSubmission]);

  const filteredAssignments = assignments.filter((assignment) => {
    if (queueFilter === 'all') {
      return true;
    }
    if (queueFilter === 'audio') {
      return assignment.module_type === 'audio';
    }
    if (queueFilter === 'pending') {
      return assignment.status === 'assigned';
    }
    if (queueFilter === 'in_progress') {
      return assignment.status === 'in_progress';
    }
    if (queueFilter === 'completed') {
      return ['completed', 'certified'].includes(assignment.status);
    }
    return assignment.status === 'certified' || Boolean(assignment.certificate_id);
  });

  useEffect(() => {
    if (!filteredAssignments.length) {
      return;
    }

    if (filteredAssignments.some((assignment) => assignment.id === activeAssignmentId)) {
      return;
    }

    const nextAssignmentId = filteredAssignments[0]?.id;
    if (!nextAssignmentId) {
      return;
    }

    recognitionRef.current?.stop();
    startTransition(() => {
      setActiveAssignmentId(nextAssignmentId);
    });
    const nextAssignment = filteredAssignments.find((assignment) => assignment.id === nextAssignmentId) || null;
    void loadAssignmentDetail(nextAssignmentId, {
      includeExercises: hasStartedAssignment(nextAssignment),
    });
  }, [activeAssignmentId, filteredAssignments, loadAssignmentDetail]);

  function renderModuleContent() {
    if (!assignmentDetail || !activeAssignment || !activeModuleGateState) {
      return null;
    }

    const moduleDetail = assignmentDetail.module;
    const content = moduleDetail.content_data || {};
    const moduleType = moduleDetail.module_type;
    const assetUrl = activeModuleGateState.assetUrl;
    const transcriptText =
      moduleDetail.audio_transcript ||
      content.transcript_text ||
      content.captions_text ||
      content.transcript ||
      content.content ||
      '';
    const ttsUrl = moduleDetail.audio_tts_url || content.tts_url || '';
    const captionsUrl = moduleDetail.captions_url || content.captions_url || '';
    const captionData = content.caption_data;
    const youtubeEmbedUrl = activeModuleGateState.youtubeEmbedUrl;
    const assetKind = activeModuleGateState.assetKind;

    if (moduleType === 'video') {
      const unlocked = !activeModuleGateState.isAssessmentLocked;

      return (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Video Module</p>
          {activeModuleGateState.assessmentUnavailable ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {activeModuleGateState.lockMessage}
            </div>
          ) : null}
          {assetKind === 'file' && assetUrl ? (
            <VideoPlaybackCard
              src={assetUrl}
              title="Lesson Video"
              description="Use play, pause, resume, replay, and the timeline slider below to review the uploaded lesson before answering the practice prompt."
              onCompleted={() => setVideoCompleted((current) => ({ ...current, [activeAssignment.id]: true }))}
            />
          ) : null}
          {assetKind === 'youtube' && youtubeEmbedUrl ? (
            <div className="mt-3 overflow-hidden rounded-lg border">
              <div className="aspect-video bg-slate-100">
                <iframe
                  className="h-full w-full"
                  src={youtubeEmbedUrl}
                  title={activeAssignment.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          ) : null}
          {assetKind === 'external' && assetUrl && !activeModuleGateState.assessmentUnavailable ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">
                This lesson uses an external media reference. Open it in a new tab, review it, then confirm below to unlock the guided question flow.
              </p>
              <Button asChild className="mt-3" variant="outline">
                <a href={assetUrl} target="_blank" rel="noreferrer">
                  Open Lesson Reference
                </a>
              </Button>
            </div>
          ) : (
            assetKind === 'none' && !activeModuleGateState.assessmentUnavailable ? (
              <p className="mt-3 text-sm text-slate-500">
                No video file is attached yet, so the practice prompt is available immediately.
              </p>
            ) : null
          )}
          {assetKind !== 'none' && assetKind !== 'file' && !activeModuleGateState.assessmentUnavailable && !videoCompleted[activeAssignment.id] ? (
            <div className="mt-3 flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-sky-800">
                Review the lesson reference, then confirm so the assessment unlocks below.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setVideoCompleted((current) => ({ ...current, [activeAssignment.id]: true }))}
              >
                I reviewed this lesson
              </Button>
            </div>
          ) : null}
          <p className="mt-3 text-sm text-slate-600">
            {activeModuleGateState.assessmentUnavailable
              ? activeModuleGateState.lockMessage
              : unlocked
              ? 'The lesson requirement is complete. Answer the assessment one question at a time below.'
              : assetKind === 'file'
                ? 'Finish the video first to unlock the assessment.'
                : 'Review the lesson reference first, then confirm it to unlock the assessment.'}
          </p>
          {unlocked ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              The assessment is ready. Use the activity panel below to answer each question one at a time and submit the final question when you finish.
            </div>
          ) : null}
        </div>
      );
    }

    if (moduleType === 'flashcard') {
      return (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Timed Flashcard Session</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">Fixed pacing for every card</p>
              <p className="mt-2 text-sm text-slate-600">
                Each flashcard now runs on a fixed sequence: 30 seconds of study time, then a 60-second answer
                window. The next card starts automatically when the answer timer ends.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-slate-600">
              <Badge variant="outline">Study Time: 30s</Badge>
              <Badge variant="outline">Answer Time: 60s</Badge>
            </div>
          </div>
        </div>
      );
    }

    if (moduleType === 'quiz') {
      const readingContent = getQuizReadingContent(content);
      const readingGateKey = getQuizReadingGateKey(activeAssignment);
      const readingUnlocked = !readingContent || Boolean(quizReadingConfirmed[readingGateKey]);

      return (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Quiz Module</p>
              <p className="mt-1 text-sm text-slate-500">
                {readingContent
                  ? 'Complete the reading requirement first, then answer the assigned questions one at a time below.'
                  : 'Answer the assigned questions one at a time below.'}
              </p>
            </div>
            <Badge
              variant="outline"
              className={readingUnlocked ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}
            >
              {readingUnlocked ? 'Assessment unlocked' : 'Reading required'}
            </Badge>
          </div>

          {readingContent ? (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-sky-700">Read First</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Review this story, mock call scenario, or reading passage before answering the quiz.
                  </p>
                </div>
                <Badge variant="outline" className={readingUnlocked ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                  {readingUnlocked ? 'Reading confirmed' : 'Required before answering'}
                </Badge>
              </div>
              <div className="mt-4 whitespace-pre-wrap rounded-lg border bg-white p-4 text-sm leading-6 text-slate-700">
                {readingContent}
              </div>
              {!readingUnlocked ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-amber-800">
                    Finish reading this content, then confirm it to unlock the quiz questions below.
                  </p>
                  <Button
                    type="button"
                    onClick={() =>
                      setQuizReadingConfirmed((current) => ({
                        ...current,
                        [readingGateKey]: true,
                      }))
                    }
                  >
                    I&apos;ve Read This
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {readingContent && !readingUnlocked ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Finish the reading requirement above to unlock the quiz questions below.
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              The quiz is ready. The question flow below will present one question at a time until you submit the last one.
            </div>
          )}
        </div>
      );
    }

    if (moduleType === 'infographic') {
      return (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Infographic Module</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {assetUrl ? <img src={assetUrl} alt={activeAssignment.title} className="mt-3 max-h-72 rounded-lg border object-contain" /> : null}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-600">Power Phrases</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(content.power_phrases || []).map((item: string) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-rose-600">Wall Phrases</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(content.wall_phrases || []).map((item: string) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Review the infographic first, then use the activity panel below to answer each assigned question one at a time.
          </div>
        </div>
      );
    }

    if (moduleType === 'audio') {
      return (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Audio Lesson</p>
          {activeModuleGateState.hasPlayableAudio ? (
            <AudioPlaybackCard
              moduleId={moduleDetail.id}
              title="Listening Playback"
              description="Start the lesson only when you are ready. The transcript opens automatically while the audio or TTS narration is playing."
              audioUrl={assetUrl}
              hasPrimaryAudio={activeModuleGateState.hasPlayableAudio}
              captionsUrl={captionsUrl}
              captionData={captionData}
              transcriptText={transcriptText}
              ttsUrl={ttsUrl}
              languageLabel={moduleDetail.audio_language || content.audio_language || 'en-US'}
              durationSeconds={moduleDetail.audio_duration_seconds || content.audio_duration_seconds}
              transcriptPlaceholder="Transcript will appear here after the trainer uploads and processes the audio."
            />
          ) : (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {activeModuleGateState.lockMessage || 'The uploaded lesson audio is not available right now, so the assessment remains locked.'}
            </div>
          )}
        </div>
      );
    }

    if (moduleType === 'case_study') {
      const caseStudyNarrative =
        moduleDetail.audio_transcript || content.transcript_text || content.captions_text || content.content || content.transcript || '';
      const caseStudyAudioUrl =
        moduleDetail.audio_url ||
        content.audio_url ||
        (isDirectAudioFile(assetUrl) ? assetUrl : '');
      return (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Case Study</p>
          {caseStudyAudioUrl || ttsUrl ? (
            <AudioPlaybackCard
              moduleId={moduleDetail.id}
              title="Case Study Audio"
              description="Use the play button when you want to review the case audio. The written text stays visible while playback is active."
              audioUrl={caseStudyAudioUrl}
              captionsUrl={captionsUrl}
              captionData={captionData}
              transcriptText={caseStudyNarrative}
              ttsUrl={ttsUrl}
              languageLabel={moduleDetail.audio_language || content.audio_language || 'en-US'}
              durationSeconds={moduleDetail.audio_duration_seconds || content.audio_duration_seconds}
              transcriptHeading="Case Narrative / TTS Text"
              transcriptPlaceholder="The case-study narrative will appear here after the trainer processes the audio."
            />
          ) : null}
          {!caseStudyAudioUrl && !ttsUrl && caseStudyNarrative ? (
            <div className="mt-3 rounded-lg border bg-slate-50 p-3 text-sm text-slate-600 whitespace-pre-wrap">
              {caseStudyNarrative}
            </div>
          ) : null}
        </div>
      );
    }

    return null;
  }

  function renderAssignmentResultSummary() {
    if (!assignmentResultSummary || !activeAssignment) {
      return null;
    }

    const isPassed =
      String(assignmentResultSummary.status || '').toLowerCase() === 'passed'
      || Boolean(activeAssignment.is_passed);
    const percentageScore = Number(
      assignmentResultSummary.percentage_score ?? activeAssignment.average_score ?? 0,
    );
    const passingScore = Number(
      assignmentResultSummary.passing_score ?? activeAssignment.passing_score ?? assignmentDetail?.module.passing_score ?? 0,
    );
    const scoreLabel =
      formatPoints(
        assignmentResultSummary.points_earned,
        assignmentResultSummary.points_possible,
      )
      || formatPoints(activeAssignment.points_earned, activeAssignment.points_possible)
      || `${Number(assignmentResultSummary.total_score || 0).toFixed(1)} total points`;

    const insightSections = [
      {
        title: 'Strengths',
        items: assignmentResultSummary.strengths || [],
      },
      {
        title: 'Weak Areas',
        items: assignmentResultSummary.weak_areas || [],
      },
      {
        title: 'Improvement Opportunities',
        items: assignmentResultSummary.improvement_opportunities || [],
      },
      {
        title: 'Recommended Next Steps',
        items: assignmentResultSummary.recommended_next_steps || [],
      },
    ];

    return (
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Module Result Summary</CardTitle>
              <CardDescription>
                Review your final score, completion status, feedback, and the recommended next steps.
              </CardDescription>
            </div>
            <Badge
              className={
                isPassed
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }
            >
              {isPassed ? 'Passed' : 'Failed'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Final Score</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{scoreLabel}</p>
            </div>
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Percentage</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{percentageScore.toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Passing Score</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{passingScore.toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Submitted</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {formatDate(assignmentResultSummary.submitted_at || activeAssignment.completed_at)}
              </p>
            </div>
          </div>

          {assignmentResultSummary.overall_summary ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-sky-700">Overall Summary</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{assignmentResultSummary.overall_summary}</p>
            </div>
          ) : null}

          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-700">
                  {getObservationTitle(assignmentResultSummary.provider)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  This summary is available only after the full module has been submitted.
                </p>
              </div>
              {assignmentResultSummary.provider ? (
                <Badge variant="outline">{assignmentResultSummary.provider === 'gemini' ? 'Gemini' : 'Saved breakdown insight'}</Badge>
              ) : null}
            </div>
            {assignmentResultSummary.explanation ? (
              <p className="mt-3 text-sm leading-6 text-slate-700">{assignmentResultSummary.explanation}</p>
            ) : null}
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {insightSections.map((section) => (
                <div key={section.title} className="rounded-lg border bg-white p-4">
                  <p className="text-sm font-semibold text-slate-800">{section.title}</p>
                  {section.items.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      {section.items.map((item) => (
                        <li key={`${section.title}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No additional notes available.</p>
                  )}
                </div>
              ))}
            </div>
          </div>

        </CardContent>
      </Card>
    );
  }

  function renderStandardExerciseFlow() {
    if (shouldShowModuleResultSummary) {
      return renderAssignmentResultSummary();
    }

    if (!activeStandardExercise || !standardExercises.length) {
      return (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
          No assessment questions are available for this module yet.
        </div>
      );
    }

    const exercise = activeStandardExercise;
    const response = activeStandardResponse;
    const isSaving = submittingExerciseId === exercise.id;
    const videoAssetKind = activeModuleGateState?.assetKind || 'none';
    const isVideoLocked = Boolean(activeModuleGateState?.videoReviewLocked && !exercise.attempt);
    const isMediaUnavailable = Boolean(activeModuleGateState?.assessmentUnavailable);
    const isExerciseLocked = isMediaUnavailable || isVideoLocked || isQuizReadingLocked;
    const isReadOnly = Boolean(exercise.attempt?.is_completed);
    const inputDisabled = isExerciseLocked || isReadOnly;
    const keywordCoverage = getKeywordCoverage(response.responseText, exercise.required_keywords);
    const speechEnabled = exercise.enable_stt || false;
    const progressValue = standardExercises.length
      ? ((activeStandardExerciseIndex + 1) / standardExercises.length) * 100
      : 0;

    return (
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-sky-700">
                Question {activeStandardExerciseIndex + 1} of {standardExercises.length}
              </p>
              <CardTitle className="mt-2 text-lg">{exercise.title}</CardTitle>
              <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                {exercise.prompt}
              </CardDescription>
            </div>
            <Badge variant="outline">{formatLabel(exercise.type)}</Badge>
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Question progress</span>
              <span>{activeStandardExerciseIndex + 1}/{standardExercises.length}</span>
            </div>
            <Progress value={progressValue} />
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

          {exercise.type === 'multiple_choice' ? (
            <div className="space-y-3">
              <RadioGroup
                value={response.selectedOption}
                disabled={inputDisabled}
                onValueChange={(value) =>
                  updateExerciseResponse(exercise.id, {
                    selectedOption: value,
                    inputMode: 'selection',
                  })
                }
              >
                {(exercise.options || []).map((option, optionIndex) => {
                  const optionId = `${exercise.id}-option-${optionIndex}`;

                  return (
                    <label
                      key={option}
                      htmlFor={optionId}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        inputDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                      }`}
                    >
                      <RadioGroupItem id={optionId} value={option} disabled={inputDisabled} />
                      <span className="text-sm text-slate-700">{option}</span>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor={exercise.id}>Your response</Label>
              <Textarea
                id={exercise.id}
                value={response.responseText}
                disabled={inputDisabled}
                placeholder={
                  speechEnabled
                    ? 'Type your response here, or use Speech-to-Text to capture your delivery.'
                    : 'Type your response here.'
                }
                onChange={(event) =>
                  updateExerciseResponse(exercise.id, {
                    responseText: event.target.value,
                    inputMode: 'typed',
                  })
                }
              />
              <div className="flex flex-wrap gap-2">
                {speechEnabled ? (
                  <Button
                    type="button"
                    variant={activeSpeechExerciseId === exercise.id ? 'destructive' : 'outline'}
                    onClick={() => handleSpeechCapture(exercise.id)}
                    disabled={inputDisabled}
                  >
                    {activeSpeechExerciseId === exercise.id ? (
                      <>
                        <Square className="mr-2 size-4" />
                        Stop Speech Capture
                      </>
                    ) : (
                      <>
                        <Mic className="mr-2 size-4" />
                        Start Speech-to-Text
                      </>
                    )}
                  </Button>
                ) : null}
                {!isReadOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => resetExerciseDraft(exercise)}
                    disabled={inputDisabled}
                  >
                    <RotateCcw className="mr-2 size-4" />
                    Reset Draft
                  </Button>
                ) : null}
              </div>
              {exercise.required_keywords && exercise.required_keywords.length > 0 ? (
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-700">
                    {speechEnabled ? 'Power phrase tracker' : 'Keyword tracker'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {exercise.required_keywords.map((keyword) => {
                      const isMatched = keywordCoverage.matched.includes(keyword.toLowerCase());

                      return (
                        <Badge
                          key={keyword}
                          className={
                            isMatched
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-600'
                          }
                        >
                          {keyword}
                        </Badge>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Matched {keywordCoverage.matched.length} of {exercise.required_keywords.length} target phrases before submission.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {isReadOnly ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              This answer has already been recorded. Use Previous or Next to review the guided flow.
            </div>
          ) : null}

          {isExerciseLocked ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {isQuizReadingLocked
                ? 'Read the trainer story or mock call scenario above, then confirm it to unlock the quiz questions.'
                : isMediaUnavailable
                ? activeModuleGateState?.lockMessage || 'The required module media is not available yet.'
                : videoAssetKind === 'file'
                  ? 'Complete the video first to unlock this question.'
                  : 'Review the lesson reference and confirm it first to unlock this question.'}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => moveStandardExercise(-1)}
              disabled={!canMoveToPreviousExercise || isSaving}
            >
              <ChevronLeft className="mr-2 size-4" />
              Previous
            </Button>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              {!isLastStandardExercise ? (
                <Button type="button" onClick={() => void handleAdvanceStandardExercise()} disabled={isSaving || isExerciseLocked}>
                  {isSaving ? 'Saving...' : 'Next Question'}
                  <ChevronRight className="ml-2 size-4" />
                </Button>
              ) : (
                <Button type="button" onClick={() => void handleSubmitStandardModule()} disabled={isSaving || isExerciseLocked || isReadOnly}>
                  {isSaving ? 'Submitting...' : 'Submit Module'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

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
          <CardTitle>Microlearning Queue</CardTitle>
          <CardDescription>
            Pick a module from the left, study the lesson on the right, answer the exercises, and earn a certificate once you pass.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border bg-white/80 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <BookOpen className="size-4" />
              Not Started
            </div>
            <p className="mt-3 text-3xl font-semibold">{notStartedAssignments}</p>
            <p className="text-sm text-slate-500">{assignedCount} total modules currently in your queue</p>
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

          <div className="rounded-xl border bg-white/80 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Award className="size-4" />
              Certified
            </div>
            <p className="mt-3 text-3xl font-semibold">{certifiedAssignments}</p>
            <p className="text-sm text-slate-500">Certificates earned from passing scores</p>
          </div>

          <div className="rounded-xl border bg-white/80 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Volume2 className="size-4" />
              Audio Lessons
            </div>
            <p className="mt-3 text-3xl font-semibold">{audioLessonCount}</p>
            <p className="text-sm text-slate-500">Assignments that use audio playback and caption support</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {[
          { value: 'all', label: `All Modules (${assignedCount})` },
          { value: 'audio', label: `Audio Lessons (${audioLessonCount})` },
          { value: 'pending', label: `Not Started (${notStartedAssignments})` },
          { value: 'in_progress', label: `In Progress (${inProgressAssignments})` },
          { value: 'completed', label: `Completed (${completedAssignments})` },
          { value: 'certified', label: `Certified (${certifiedAssignments})` },
        ].map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={queueFilter === option.value ? 'default' : 'outline'}
            onClick={() => setQueueFilter(option.value as ModuleQueueFilter)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Your Assigned Modules</CardTitle>
                <CardDescription>
                  The left panel keeps things simple with just the module title and progress. Use the queue filters
                  above to focus on audio lessons, then select one to open the full lesson on the right.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadAssignments({ preferredAssignmentId: activeAssignmentId || undefined })}
                disabled={isLoadingAssignments || refreshingAssignments}
              >
                <RefreshCw className={`mr-2 size-4 ${refreshingAssignments ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingAssignments ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                Loading your modules...
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAssignments.length ? filteredAssignments.map((assignment) => {
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
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{assignment.title}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge className={STATUS_BADGE_STYLES[assignment.status]}>
                              {formatStatusLabel(assignment.status)}
                            </Badge>
                            {assignment.module_type === 'audio' ? (
                              <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                                Audio Lesson
                              </Badge>
                            ) : null}
                            {assignment.can_retake ? (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                Retake Needed
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-slate-600">
                          {Math.round(assignment.completion_percentage)}%
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Progress</span>
                          <span>{assignment.completed_exercises}/{assignment.exercise_count} exercises done</span>
                        </div>
                        <Progress value={assignment.completion_percentage || 0} />
                      </div>
                    </button>
                  );
                }) : (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-slate-500">
                    No assigned modules match the current queue filter.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{activeAssignment?.title || 'Module Detail'}</CardTitle>
            <CardDescription>
              {activeAssignment?.skill_focus || 'Open a module to review the lesson, complete the exercises, and save your answers.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasDetailForActiveAssignment || !activeAssignment ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">
                {isLoadingDetail ? 'Loading module detail...' : 'Select a module to begin.'}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-4 md:grid-cols-3">
                  <div className="rounded-lg bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-sky-700">Step 1</div>
                    <div className="mt-2 font-semibold text-slate-900">
                      {assignmentDetail.module.module_type === 'video' ? 'Watch or review the lesson' : 'Review the learning material'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-sky-700">Step 2</div>
                    <div className="mt-2 font-semibold text-slate-900">Complete every exercise</div>
                  </div>
                  <div className="rounded-lg bg-white px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-sky-700">Step 3</div>
                    <div className="mt-2 font-semibold text-slate-900">
                      {activeAssignment.certificate_id ? 'Certificate earned' : 'Pass to unlock your certificate'}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {activeAssignment.category ? (
                          <Badge className={FEEDBACK_BADGE_STYLES[activeAssignment.category]}>
                            {formatLabel(activeAssignment.category)}
                          </Badge>
                        ) : null}
                        <Badge className={STATUS_BADGE_STYLES[activeAssignment.status]}>
                          {formatStatusLabel(activeAssignment.status)}
                        </Badge>
                        {activeAssignment.module_type ? (
                          <Badge variant="outline">{formatLabel(activeAssignment.module_type)}</Badge>
                        ) : null}
                        {activeAssignment.can_retake ? (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                            Retake Available
                          </Badge>
                        ) : null}
                        {activeAssignment.topic_category_name ? (
                          <Badge variant="outline">{activeAssignment.topic_category_name}</Badge>
                        ) : null}
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
                      {activeAssignment.started_at ? <p>Started: {formatDate(activeAssignment.started_at)}</p> : null}
                      <p>Due: {formatDate(activeAssignment.due_date)}</p>
                      {activeAssignment.completed_at ? <p>Completed: {formatDate(activeAssignment.completed_at)}</p> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                    <div className="rounded-lg border bg-white p-3">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Award className="size-4" />
                        Score / Pass
                      </div>
                      <p className="mt-2 text-lg font-semibold">
                        {Number(activeAssignment.average_score || 0).toFixed(1)}% / {activeAssignment.passing_score || assignmentDetail.module.passing_score}%
                      </p>
                      {formatPoints(activeAssignment.points_earned, activeAssignment.points_possible) ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {formatPoints(activeAssignment.points_earned, activeAssignment.points_possible)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>Overall progress</span>
                      <span>{Math.round(activeAssignment.completion_percentage)}%</span>
                    </div>
                    <Progress value={activeAssignment.completion_percentage || 0} />
                  </div>

                  <div className="mt-4 rounded-lg border bg-white p-3 text-sm text-slate-600">
                    {!moduleStarted
                      ? 'This module is ready to start. Click Start Module to unlock the lesson and assigned assessment.'
                      : activeAssignment.can_retake
                        ? 'You finished this module but did not reach the passing score. Use Retake Module to reset the lesson and try again.'
                      : activeAssignment.status === 'in_progress'
                        ? 'You already started this module. Continue where you left off and finish the remaining exercises.'
                        : activeAssignment.certificate_id
                          ? 'This module is complete and already recorded in your certificate list.'
                          : 'You completed the exercises. Reach the passing score to unlock the certificate.'}
                  </div>
                  {!moduleStarted ? (
                    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-sky-800">
                        Start this assigned module to begin the lesson, watch or review the content, and submit every required assessment.
                      </div>
                      <Button type="button" onClick={() => void handleStartAssignment()} disabled={startingAssignment}>
                        {startingAssignment ? 'Starting...' : 'Start Module'}
                      </Button>
                    </div>
                  ) : null}
                  {moduleStarted && activeAssignment.can_retake ? (
                    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-amber-800">
                        Your score is below the required passing mark. Retake the full module to reshuffle the questions and try again.
                      </div>
                      <Button type="button" variant="outline" onClick={() => void handleRetakeAssignment()} disabled={startingAssignment}>
                        {startingAssignment ? 'Preparing Retake...' : 'Retake Module'}
                      </Button>
                    </div>
                  ) : null}
                  {activeAssignment.notes ? (
                    <div className="mt-4 rounded-lg border bg-white p-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-700">Trainer Notes</p>
                      <p className="mt-2 whitespace-pre-wrap">{activeAssignment.notes}</p>
                    </div>
                  ) : null}

                  {!activeAssignment.is_passed && activeAssignment.completed_exercises === activeAssignment.exercise_count ? (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      You completed the module with {Number(activeAssignment.average_score || 0).toFixed(1)}%. Reach at least {activeAssignment.passing_score || assignmentDetail.module.passing_score}% to earn a certificate.
                    </div>
                  ) : null}

                  {activeAssignment.certificate_id ? (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="text-sm text-emerald-800">
                          Certificate unlocked. This accomplishment now appears in your certificates and reports.
                        </div>
                        <Button type="button" variant="outline" onClick={() => window.location.assign('/trainee/certificates')}>
                          View Certificate
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {moduleStarted ? renderModuleContent() : null}

                {moduleStarted ? (
                  isFlashcardModule ? (
                    <div className="space-y-4">
                      <TimedFlashcardSessionCard
                        assignmentId={activeAssignmentId}
                        assignment={activeAssignment}
                        exercise={activeFlashcardExercise}
                        response={activeFlashcardResponse}
                        session={flashcardSession}
                        isSaving={Boolean(activeFlashcardExercise && submittingExerciseId === activeFlashcardExercise.id)}
                        onDraftChange={(patch) => {
                          if (!activeFlashcardExercise) {
                            return;
                          }
                          updateExerciseResponse(activeFlashcardExercise.id, patch);
                        }}
                        onPersistDraft={(responseText, revealedSide) => persistFlashcardSessionDraft(responseText, revealedSide)}
                        onAutoSubmit={(status) => {
                          if (!activeFlashcardExercise) {
                            return;
                          }
                          void handleSubmitExercise(activeFlashcardExercise, {
                            timerExpired: true,
                            allowBlank: true,
                            status,
                            suppressSuccessToast: true,
                          });
                        }}
                      />
                      {shouldShowModuleResultSummary ? renderAssignmentResultSummary() : null}
                    </div>
                  ) : renderStandardExerciseFlow()
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
