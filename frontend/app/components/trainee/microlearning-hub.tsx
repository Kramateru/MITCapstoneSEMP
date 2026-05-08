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
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@/app/context/AuthContext';
import { openTraineeMicrolearningLiveUpdates } from '@/app/lib/microlearning/client';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
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
  is_passed?: boolean;
  can_retake?: boolean;
  retake_count?: number;
  attempt_number?: number;
  exercise_count: number;
  completed_exercises: number;
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
  input_mode?: 'typed' | 'speech' | 'selection' | string | null;
  matched_keywords?: string[];
  missing_keywords?: string[];
  score?: number | null;
  feedback?: string | null;
  revealed_side?: 'front' | 'back' | string | null;
  sample_similarity?: number | null;
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
  front?: string;
  back?: string;
  preview_seconds?: number;
  blank_seconds?: number;
  answer_time_limit_seconds?: number;
  attempt?: ExerciseAttempt | null;
  enable_stt?: boolean;
  timestamp?: number;
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
  exercises: AssignmentExercise[];
}

interface SubmitExerciseResponse {
  status: string;
  attempt: ExerciseAttempt;
  assignment: AssignmentSummary;
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

const DEFAULT_FLASHCARD_PREVIEW_SECONDS = 10;
const DEFAULT_FLASHCARD_BLANK_SECONDS = 2;
const DEFAULT_FLASHCARD_ANSWER_TIME_LIMIT_SECONDS = 20;

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

function getOppositeFlashcardSide(side: FlashcardSide): FlashcardSide {
  return side === 'front' ? 'back' : 'front';
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

function getExerciseActionLabel(moduleType: ModuleType, exercise: AssignmentExercise) {
  if (moduleType === 'video') {
    return 'Submit Practice Response';
  }
  if (moduleType === 'quiz') {
    return 'Submit Quiz Answer';
  }
  if (moduleType === 'flashcard') {
    return 'Submit Flashcard Recall';
  }
  if (moduleType === 'infographic') {
    return 'Submit Infographic Answer';
  }
  if (moduleType === 'case_study' && exercise.type === 'multiple_choice') {
    return 'Submit Root Cause Answer';
  }
  if (moduleType === 'case_study') {
    return 'Complete Analysis';
  }
  if (moduleType === 'audio' && exercise.type === 'multiple_choice') {
    return 'Submit Listening Answer';
  }
  if (moduleType === 'audio') {
    return 'Submit Listening Response';
  }
  return 'Save Exercise';
}

function getInputModeLabel(inputMode?: string | null) {
  if (inputMode === 'speech') {
    return 'Speech-to-Text';
  }
  if (inputMode === 'selection') {
    return 'Option Selection';
  }
  return 'Typed Response';
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
  summaryText?: string | null;
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
  summaryText,
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
  const browserSpeechRef = useRef<SpeechSynthesisUtterance | null>(null);
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
  const [resolvedSummaryText, setResolvedSummaryText] = useState(() => summaryText?.trim() || '');
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
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    browserSpeechRef.current = null;
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
      const generatedSummary = typeof transcriptPayload?.summary_text === 'string'
        ? transcriptPayload.summary_text.trim()
        : '';
      const generatedDuration = Number(transcriptPayload?.duration_seconds);

      if (generatedSummary) {
        setResolvedSummaryText(generatedSummary);
      }
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
          const hydratedSummary = typeof payload?.summary_text === 'string' ? payload.summary_text.trim() : '';
          const hydratedCaptionsUrl = typeof payload?.captions_url === 'string' ? payload.captions_url : '';
          const hydratedDuration = Number(payload?.duration_seconds);

          if (!signedUrl) {
            throw new Error('The signed lesson audio URL is missing from the server response.');
          }

          if (hydratedTranscript) {
            setResolvedTranscriptText(hydratedTranscript);
          }
          if (hydratedSummary) {
            setResolvedSummaryText(hydratedSummary);
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
    setResolvedSummaryText(summaryText?.trim() || '');
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
  }, [audioUrl, cancelBrowserSpeech, captionData, captionsUrl, moduleId, revokeTtsPlaybackUrl, summaryText, transcriptText, ttsUrl]);

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
  const lessonSummary = resolvedSummaryText || '';
  const canPlayPrimaryAudio = hasPrimaryAudio ?? Boolean(audioUrl);
  const shouldShowBrowserTtsFallback = false;
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

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        toast.error('Browser text-to-speech is not available on this device.');
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

      const utterance = new SpeechSynthesisUtterance(transcriptBody);
      utterance.lang = languageLabel || 'en-US';
      utterance.rate = 0.96;
      utterance.onend = () => {
        browserSpeechRef.current = null;
        setIsTtsPlaying(false);
      };
      utterance.onerror = () => {
        browserSpeechRef.current = null;
        setIsTtsPlaying(false);
      };

      browserSpeechRef.current = utterance;
      setIsPrimaryPlaying(false);
      setIsTtsPlaying(true);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
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
      toast.error(
        error instanceof Error ? error.message : 'Unable to start the accessibility audio playback.',
      );
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

      {lessonSummary ? (
        <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-700">AI Lesson Summary</p>
          <p className="mt-2 text-sm text-slate-700">{lessonSummary}</p>
        </div>
      ) : null}

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
          Original lesson audio is unavailable. Use the browser read-aloud fallback to hear the saved transcript.
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

interface FlashcardRecallExerciseCardProps {
  exercise: AssignmentExercise;
  response: ExerciseResponseState;
  isSaving: boolean;
  onDraftChange: (patch: Partial<ExerciseResponseState>) => void;
  onRestart: () => void;
  onSubmit: () => void;
}

function FlashcardRecallExerciseCard({
  exercise,
  response,
  isSaving,
  onDraftChange,
  onRestart,
  onSubmit,
}: FlashcardRecallExerciseCardProps) {
  const previewSeconds = getPositiveWholeNumber(exercise.preview_seconds, DEFAULT_FLASHCARD_PREVIEW_SECONDS);
  const blankSeconds = getPositiveWholeNumber(exercise.blank_seconds, DEFAULT_FLASHCARD_BLANK_SECONDS);
  const answerTimeLimitSeconds = getPositiveWholeNumber(
    exercise.answer_time_limit_seconds,
    DEFAULT_FLASHCARD_ANSWER_TIME_LIMIT_SECONDS,
  );
  const [phase, setPhase] = useState<'idle' | 'preview' | 'blank' | 'challenge' | 'expired' | 'completed'>('idle');
  const [countdown, setCountdown] = useState(previewSeconds);
  const [referenceSide, setReferenceSide] = useState<FlashcardSide | ''>('');
  const answerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (exercise.attempt?.is_completed) {
      setPhase('completed');
      setCountdown(0);
      setReferenceSide('');
      onDraftChange({
        revealedSide: (exercise.attempt.revealed_side as 'front' | 'back' | undefined) || response.revealedSide || '',
      });
      return;
    }

    setPhase('idle');
    setCountdown(previewSeconds);
    setReferenceSide('');
    onDraftChange({
      responseText: '',
      revealedSide: '',
      inputMode: 'typed',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id, exercise.attempt?.submitted_at, exercise.attempt?.is_completed, previewSeconds]);

  useEffect(() => {
    if (phase !== 'challenge' || isSaving) {
      return;
    }

    answerInputRef.current?.focus();
  }, [isSaving, phase]);

  useEffect(() => {
    if (
      exercise.attempt?.is_completed ||
      isSaving ||
      phase === 'idle' ||
      phase === 'completed' ||
      phase === 'expired'
    ) {
      return;
    }

    const timerId = window.setTimeout(() => {
      const beginChallenge = () => {
        const nextAnswerSide: FlashcardSide = Math.random() < 0.5 ? 'front' : 'back';
        setReferenceSide(getOppositeFlashcardSide(nextAnswerSide));
        onDraftChange({
          responseText: '',
          revealedSide: nextAnswerSide,
          inputMode: 'typed',
        });
        setPhase('challenge');
        setCountdown(answerTimeLimitSeconds);
      };

      if (phase === 'preview') {
        if (countdown > 1) {
          setCountdown((current) => current - 1);
        } else if (blankSeconds > 0) {
          setPhase('blank');
          setCountdown(blankSeconds);
        } else {
          beginChallenge();
        }
      } else if (phase === 'blank') {
        if (countdown > 1) {
          setCountdown((current) => current - 1);
        } else {
          beginChallenge();
        }
      } else if (phase === 'challenge') {
        if (countdown > 1) {
          setCountdown((current) => current - 1);
        } else {
          setPhase('expired');
          setCountdown(0);
        }
      }
    }, 1000);

    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerTimeLimitSeconds, blankSeconds, countdown, exercise.attempt?.is_completed, isSaving, phase]);

  const promptedSide =
    response.revealedSide === 'back'
      ? 'back'
      : response.revealedSide === 'front'
        ? 'front'
        : '';
  const visibleReferenceText =
    referenceSide === 'back'
      ? exercise.back || 'No back text set.'
      : referenceSide === 'front'
        ? exercise.front || 'No front text set.'
        : '';
  const latestAttempt = exercise.attempt;
  const latestAttemptTone = latestAttempt?.is_completed
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : latestAttempt
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-slate-200 bg-slate-50 text-slate-700';

  function startCycle() {
    setPhase('preview');
    setCountdown(previewSeconds);
    setReferenceSide('');
    onDraftChange({
      responseText: '',
      revealedSide: '',
      inputMode: 'typed',
    });
  }

  function restartCycle() {
    setPhase('idle');
    setCountdown(previewSeconds);
    setReferenceSide('');
    onRestart();
  }

  return (
    <div className="space-y-4">
      {phase === 'idle' ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Flashcard Recall</p>
            <p className="mt-1 text-sm text-slate-700">
              Press Start to begin this card. You will get {previewSeconds} seconds to review both sides, then {answerTimeLimitSeconds}{' '}
              seconds to answer with one side of the flashcard still visible.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Preview {previewSeconds}s</Badge>
            <Badge variant="outline">Answer limit {answerTimeLimitSeconds}s</Badge>
          </div>
          <div className="rounded-lg border border-dashed bg-white p-6 text-sm text-slate-500">
            The timer will stay paused until you start this flashcard.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={startCycle}>
              Start Flashcard
            </Button>
            {latestAttempt && !latestAttempt.is_completed ? (
              <Button type="button" variant="outline" onClick={startCycle}>
                Review Again
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === 'preview' ? (
        <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-sky-700">Preview Both Sides</p>
              <p className="mt-1 text-sm text-slate-700">Memorize the pair before the recall challenge begins.</p>
            </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock3 className="size-3.5" />
              {countdown}s
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Front</p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{exercise.front || 'No front text set.'}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Back</p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{exercise.back || 'No back text set.'}</p>
            </div>
          </div>
        </div>
      ) : null}

      {phase === 'blank' ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Reset Memory</p>
          <p className="mt-3 text-sm text-slate-600">The challenge starts in {countdown} second{countdown === 1 ? '' : 's'}.</p>
          <div className="mt-4 rounded-lg border border-dashed bg-white p-10 text-sm text-slate-400">Blank card</div>
        </div>
      ) : null}

      {(phase === 'challenge' || phase === 'expired') && promptedSide && referenceSide && !exercise.attempt?.is_completed ? (
        <div
          className={`space-y-4 rounded-xl border p-4 ${
            phase === 'expired' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p
                className={`text-xs uppercase tracking-[0.18em] ${
                  phase === 'expired' ? 'text-rose-700' : 'text-amber-700'
                }`}
              >
                {phase === 'expired' ? 'Time Expired' : 'Recall Challenge'}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {phase === 'expired'
                  ? `The answer window closed. Review the ${formatLabel(referenceSide)} side and restart the card to try again.`
                  : `The ${formatLabel(referenceSide)} side stays visible while you answer. Type the ${formatLabel(promptedSide)} side exactly before the timer runs out.`}
              </p>
            </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock3 className="size-3.5" />
              {phase === 'expired' ? 'Expired' : `${countdown}s left`}
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatLabel(referenceSide)} Reference</p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{visibleReferenceText}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${exercise.id}-flashcard-answer`}>Type the {formatLabel(promptedSide)} exactly</Label>
              <Input
                ref={answerInputRef}
                id={`${exercise.id}-flashcard-answer`}
                value={response.responseText}
                onChange={(event) =>
                  onDraftChange({
                    responseText: event.target.value,
                    inputMode: 'typed',
                  })
                }
                placeholder={`Enter the ${formatLabel(promptedSide)} exactly`}
                disabled={phase === 'expired'}
              />
              <p className="text-xs text-slate-500">
                Answer limit: {answerTimeLimitSeconds} second{answerTimeLimitSeconds === 1 ? '' : 's'}.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={restartCycle}>
              <RotateCcw className="mr-2 size-4" />
              Reset Card
            </Button>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isSaving || phase === 'expired' || !response.responseText.trim()}
            >
              {isSaving ? 'Checking Recall...' : 'Submit Flashcard Recall'}
            </Button>
          </div>
        </div>
      ) : null}

      {latestAttempt ? (
        <div className={`rounded-lg border p-3 text-sm ${latestAttemptTone}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{latestAttempt.is_completed ? 'Latest result: Correct' : 'Latest result: Try again'}</p>
            <Badge className="border-white/60 bg-white/80 text-current">Score: {Math.round(latestAttempt.score || 0)}%</Badge>
          </div>
          <p className="mt-2">{latestAttempt.feedback || 'Saved successfully.'}</p>
          {latestAttempt.submitted_at ? (
            <p className="mt-2 text-xs opacity-80">Last submitted: {formatDate(latestAttempt.submitted_at)}</p>
          ) : null}
        </div>
      ) : null}
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
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [refreshingAssignments, setRefreshingAssignments] = useState(false);
  const [startingAssignment, setStartingAssignment] = useState(false);
  const [submittingExerciseId, setSubmittingExerciseId] = useState('');
  const [videoCompleted, setVideoCompleted] = useState<Record<string, boolean>>({});
  const [moduleAssetPlaybackUrls, setModuleAssetPlaybackUrls] = useState<Record<string, string>>({});
  const [flippedFlashcardAssignments, setFlippedFlashcardAssignments] = useState<Record<string, boolean>>({});
  const [flashcardIndexes, setFlashcardIndexes] = useState<Record<string, number>>({});
  const [quizIndexes, setQuizIndexes] = useState<Record<string, number>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, Record<number, number>>>({});
  const [speechResults, setSpeechResults] = useState<Record<string, Record<string | number, string>>>({});
  const [isListening, setIsListening] = useState(false);
  const [activeSpeechExerciseId, setActiveSpeechExerciseId] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSeedTextRef = useRef('');
  const touchStartXRef = useRef<number | null>(null);

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

  const loadAssignmentDetail = useCallback(async (assignmentId: string) => {
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
          responseText:
            exercise.type === 'flashcard_recall' && !exercise.attempt?.is_completed
              ? ''
              : exercise.attempt?.response_text || '',
          selectedOption: exercise.attempt?.selected_option || '',
          inputMode:
            (exercise.attempt?.input_mode as 'typed' | 'speech' | 'selection' | undefined) ||
            (exercise.type === 'multiple_choice' ? 'selection' : 'typed'),
          revealedSide:
            exercise.type === 'flashcard_recall'
              ? ((exercise.attempt?.revealed_side as 'front' | 'back' | undefined) || '')
              : '',
        };
      });

      startTransition(() => {
        setAssignmentDetail(detail);
        setExerciseResponses(nextResponses);
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
        const shouldReloadDetail =
          refreshDetail ||
          !assignmentDetail ||
          assignmentDetail.assignment.id !== nextActiveId;
        if (shouldReloadDetail) {
          await loadAssignmentDetail(nextActiveId);
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
    await loadAssignmentDetail(assignmentId);
  }, [loadAssignmentDetail]);

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

  function toggleFlashcard(assignmentId: string) {
    setFlippedFlashcardAssignments((current) => ({
      ...current,
      [assignmentId]: !current[assignmentId],
    }));
  }

  function changeFlashcard(assignmentId: string, cardCount: number, direction: -1 | 1) {
    setFlashcardIndexes((current) => {
      const currentIndex = current[assignmentId] || 0;
      const nextIndex = Math.max(0, Math.min(cardCount - 1, currentIndex + direction));
      return {
        ...current,
        [assignmentId]: nextIndex,
      };
    });

    setFlippedFlashcardAssignments((current) => ({
      ...current,
      [assignmentId]: false,
    }));
  }

  function changeQuizQuestion(assignmentId: string, questionCount: number, direction: -1 | 1) {
    setQuizIndexes((current) => {
      const currentIndex = current[assignmentId] || 0;
      const nextIndex = Math.max(0, Math.min(questionCount - 1, currentIndex + direction));
      return {
        ...current,
        [assignmentId]: nextIndex,
      };
    });
  }

  function selectQuizAnswer(assignmentId: string, questionIndex: number, answerIndex: number) {
    setQuizAnswers((current) => ({
      ...current,
      [assignmentId]: {
        ...current[assignmentId],
        [questionIndex]: answerIndex,
      },
    }));
  }

  function startSpeechRecognition(assignmentId: string, questionIndex: string | number) {
    const RecognitionCtor =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;

    if (!RecognitionCtor) {
      toast.error('Speech-to-text is not available in this browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    recognitionRef.current?.stop();

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = collectSpeechTranscript(event);
      setSpeechResults((current) => ({
        ...current,
        [assignmentId]: {
          ...current[assignmentId],
          [questionIndex]: transcript,
        },
      }));
    };
    recognition.onerror = () => {
      setIsListening(false);
      toast.error('Speech capture stopped unexpectedly.');
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    toast.success('Speech-to-text is listening.');
  }

  function handleFlashcardTouchStart(clientX: number) {
    touchStartXRef.current = clientX;
  }

  function handleFlashcardTouchEnd(assignmentId: string, clientX: number) {
    if (touchStartXRef.current === null) {
      return;
    }

    const deltaX = Math.abs(clientX - touchStartXRef.current);
    touchStartXRef.current = null;

    if (deltaX > 36) {
      toggleFlashcard(assignmentId);
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

  async function handleSubmitExercise(exercise: AssignmentExercise) {
    if (!activeAssignmentId) {
      toast.error('Choose a module before saving an exercise.');
      return;
    }
    if (!hasStartedAssignment(activeAssignment)) {
      toast.error('Start the module first before submitting the assessment.');
      return;
    }
    if (activeModuleGateState?.assessmentUnavailable) {
      toast.error(activeModuleGateState.lockMessage);
      return;
    }
    if (activeModuleGateState?.videoReviewLocked && !exercise.attempt) {
      toast.error(activeModuleGateState.lockMessage);
      return;
    }

    const response = exerciseResponses[exercise.id] || {
      responseText: '',
      selectedOption: '',
      inputMode: exercise.type === 'multiple_choice' ? 'selection' : 'typed',
    };

    if (exercise.type === 'multiple_choice' && !response.selectedOption) {
      toast.error('Choose an answer before submitting.');
      return;
    }

    if ((exercise.type === 'keyword_response' || exercise.type === 'flashcard_recall') && !response.responseText.trim()) {
      toast.error('Type your answer before submitting.');
      return;
    }

    if (exercise.type === 'flashcard_recall' && !response.revealedSide) {
      toast.error('Start the flashcard and wait for the recall prompt before submitting.');
      return;
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
          }),
        },
      );

      if (exercise.type === 'flashcard_recall' && !result.attempt.is_completed) {
        toast.error('Flashcard answer was incorrect. Review the card again and retry.');
      } else if (result.assignment.is_passed && result.assignment.certificate_id) {
        toast.success('Module passed. Your certificate has been unlocked.');
      } else if (result.assignment.completed_exercises === result.assignment.exercise_count && !result.assignment.is_passed) {
        toast.success('Module completed. Review your score and retake it if needed.');
      } else {
        toast.success('Exercise saved successfully.');
      }
      await loadAssignments({ preferredAssignmentId: activeAssignmentId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save this exercise.';
      toast.error(message);
    } finally {
      setSubmittingExerciseId('');
    }
  }

  const activeAssignment = assignments.find((assignment) => assignment.id === activeAssignmentId) || assignmentDetail?.assignment || null;
  const hasDetailForActiveAssignment = assignmentDetail?.assignment?.id === activeAssignmentId;
  const moduleStarted = hasStartedAssignment(activeAssignment);
  const activeModuleGateState =
    assignmentDetail && activeAssignment
      ? getModuleMediaGateState(
          assignmentDetail.module,
          activeAssignment,
          moduleAssetPlaybackUrls[assignmentDetail.module.id] || '',
          Boolean(videoCompleted[activeAssignment.id] || activeAssignment.completed_exercises),
        )
      : null;
  const notStartedAssignments = assignments.filter((assignment) => assignment.status === 'assigned').length;
  const completedAssignments = assignments.filter((assignment) => ['completed', 'certified'].includes(assignment.status)).length;
  const certifiedAssignments = assignments.filter((assignment) => assignment.status === 'certified' || assignment.certificate_id).length;
  const inProgressAssignments = assignments.filter((assignment) => assignment.status === 'in_progress').length;
  const audioLessonCount = assignments.filter((assignment) => assignment.module_type === 'audio').length;
  const assignedCount = assignments.length;
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
    void loadAssignmentDetail(nextAssignmentId);
  }, [activeAssignmentId, filteredAssignments, loadAssignmentDetail]);

  function renderModuleContent() {
    if (!assignmentDetail || !activeAssignment || !activeModuleGateState) {
      return null;
    }

    const moduleDetail = assignmentDetail.module;
    const content = moduleDetail.content_data || {};
    const moduleType = moduleDetail.module_type;
    const rawAssetUrl = activeModuleGateState.rawAssetUrl;
    const assetUrl = activeModuleGateState.assetUrl;
    const transcriptText =
      moduleDetail.audio_transcript ||
      content.transcript_text ||
      content.captions_text ||
      content.transcript ||
      content.content ||
      '';
    const summaryText = content.summary_text || content.audio_summary || content.summary || '';
    const ttsUrl = moduleDetail.audio_tts_url || content.tts_url || '';
    const captionsUrl = moduleDetail.captions_url || content.captions_url || '';
    const captionData = content.caption_data;
    const youtubeEmbedUrl = activeModuleGateState.youtubeEmbedUrl;
    const assetKind = activeModuleGateState.assetKind;

    if (moduleType === 'video') {
      const lessonQuestions = getFirstContentArray(content, ['video_timestamp_questions', 'questions', 'video_questions']);
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
                This lesson uses an external media reference. Open it in a new tab, review it, then confirm below to unlock the practice prompt.
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
                Review the lesson reference, then confirm so your practice activity unlocks.
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
              ? 'The practice prompt is unlocked. Submit your response below.'
              : assetKind === 'file'
                ? 'Finish the video first to unlock the practice prompt and complete the activity.'
                : 'Review the lesson reference first, then confirm it to unlock the practice prompt and complete the activity.'}
          </p>
          {unlocked ? (
            <div className="mt-4 space-y-4">
              {lessonQuestions.length ? (
                lessonQuestions.map((question: any, index: number) => (
                  <div key={index} className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.18em] text-sky-700">
                        Video Question {index + 1}
                      </p>
                      {question.stt_enabled ? (
                        <Badge variant="outline" className="text-xs">
                          Voice Enabled
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{question.question}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-sky-700">Practice Prompt</p>
                  <p className="mt-2 text-sm text-slate-700">
                    {content.practice_prompt || assignmentDetail.exercises[0]?.prompt || 'Respond using the coaching model from the lesson.'}
                  </p>
                  {(content.required_keywords || []).length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(content.required_keywords || []).map((phrase: string) => (
                        <Badge key={phrase} variant="outline">
                          {phrase}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      );
    }

    if (moduleType === 'flashcard') {
      const cards = getFirstContentArray(content, ['cards']);
      const safeCards = cards.length ? cards : [{}];
      const currentCardIndex = Math.min(flashcardIndexes[activeAssignment.id] || 0, safeCards.length - 1);
      const card = safeCards[currentCardIndex] || {};
      const flipped = flippedFlashcardAssignments[activeAssignment.id];

      return (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Flashcard Deck Preview</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                {flipped ? 'Back' : 'Front'} | Card {currentCardIndex + 1} of {safeCards.length}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Review the deck here, then answer the timed recall checks below with the opposite side still visible as a guide.
              </p>
            </div>
            {safeCards.length > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => changeFlashcard(activeAssignment.id, safeCards.length, -1)}
                  disabled={currentCardIndex === 0}
                >
                  <ChevronLeft className="mr-1 size-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => changeFlashcard(activeAssignment.id, safeCards.length, 1)}
                  disabled={currentCardIndex >= safeCards.length - 1}
                >
                  Next
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="mt-4 w-full rounded-xl border bg-slate-50 p-4 text-left transition hover:border-sky-200"
            onClick={() => toggleFlashcard(activeAssignment.id)}
            onTouchStart={(event) => handleFlashcardTouchStart(event.touches[0]?.clientX || 0)}
            onTouchEnd={(event) => handleFlashcardTouchEnd(activeAssignment.id, event.changedTouches[0]?.clientX || 0)}
          >
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Tap or swipe to flip</p>
            <div className="mt-4 whitespace-pre-wrap text-base text-slate-700">
              {flipped ? card.back || 'No back content yet.' : card.front || 'No front content yet.'}
            </div>
          </button>
        </div>
      );
    }

    if (moduleType === 'quiz') {
      const questions = getFirstContentArray(content, ['questions', 'quiz_questions']);
      const currentQuestionIndex = quizIndexes[activeAssignment.id] || 0;
      const currentQuestion = questions[currentQuestionIndex];
      const selectedAnswer = quizAnswers[activeAssignment.id]?.[currentQuestionIndex];

      return (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Quiz Module</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                Question {currentQuestionIndex + 1} of {questions.length}
              </p>
            </div>
            {questions.length > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => changeQuizQuestion(activeAssignment.id, questions.length, -1)}
                  disabled={currentQuestionIndex === 0}
                >
                  <ChevronLeft className="mr-1 size-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => changeQuizQuestion(activeAssignment.id, questions.length, 1)}
                  disabled={currentQuestionIndex >= questions.length - 1}
                >
                  Next
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            ) : null}
          </div>

          {currentQuestion ? (
            <div className="mt-4">
              <p className="text-base font-medium text-slate-800">{currentQuestion.question}</p>
              <div className="mt-3 space-y-2">
                {currentQuestion.options?.map((option: string, index: number) => (
                  <button
                    key={index}
                    type="button"
                    className={`w-full rounded-lg border p-3 text-left transition hover:border-sky-200 ${
                      selectedAnswer === index ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white'
                    }`}
                    onClick={() => selectQuizAnswer(activeAssignment.id, currentQuestionIndex, index)}
                  >
                    <span className="text-sm font-medium text-slate-700">
                      {String.fromCharCode(65 + index)}. {option}
                    </span>
                  </button>
                ))}
              </div>
              {currentQuestion.stt_enabled ? (
                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-sky-700">Voice Response</p>
                  <p className="mt-1 text-sm text-slate-600">
                    This question supports voice responses. Click the microphone to speak your answer.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => startSpeechRecognition(activeAssignment.id, currentQuestionIndex)}
                    disabled={isListening}
                  >
                    <Mic className="mr-2 size-4" />
                    {isListening ? 'Listening...' : 'Start Voice Response'}
                  </Button>
                  {speechResults[activeAssignment.id]?.[currentQuestionIndex] && (
                    <p className="mt-2 text-sm text-slate-700">
                      <strong>Voice Response:</strong> {speechResults[activeAssignment.id][currentQuestionIndex]}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No questions available for this quiz.</p>
          )}
        </div>
      );
    }

    if (moduleType === 'infographic') {
      const infographicQuestions = getFirstContentArray(content, ['questions', 'infographic_questions']);
      return (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Infographic Module</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {assetUrl ? <img src={assetUrl} alt={activeAssignment.title} className="mt-3 max-h-72 rounded-lg border object-contain" /> : null}
          {infographicQuestions.length ? (
            <div className="mt-4 space-y-4">
              {infographicQuestions.map((question: any, index: number) => (
                <div key={index} className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.18em] text-sky-700">Multiple Choice Check</p>
                    <Badge variant="outline" className="text-xs">
                      Answer Below
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{question.question}</p>
                  {Array.isArray(question.options) && question.options.length ? (
                    <div className="mt-3 space-y-2">
                      {question.options.map((option: string, optionIndex: number) => (
                        <div key={`${question.question}-${optionIndex}`} className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700">
                          <span className="font-medium text-slate-500">{String.fromCharCode(65 + optionIndex)}.</span>{' '}
                          {option}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">This infographic uses the multiple-choice exercise cards below.</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
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
          )}
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
              summaryText={summaryText}
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
      const caseStudySummary = content.summary_text || content.audio_summary || content.summary || '';
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
              summaryText={caseStudySummary}
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
                <div className="space-y-4">
                  {assignmentDetail.exercises.map((exercise, index) => {
                    const response = exerciseResponses[exercise.id] || {
                      responseText: '',
                      selectedOption: '',
                      inputMode: exercise.type === 'multiple_choice' ? 'selection' : 'typed',
                      revealedSide: '',
                    };
                    const isSaving = submittingExerciseId === exercise.id;
                    const videoAssetKind = activeModuleGateState?.assetKind || 'none';
                    const isVideoLocked = Boolean(activeModuleGateState?.videoReviewLocked && !exercise.attempt);
                    const isMediaUnavailable = Boolean(activeModuleGateState?.assessmentUnavailable);
                    const isExerciseLocked = isMediaUnavailable || isVideoLocked;
                    const keywordCoverage = getKeywordCoverage(response.responseText, exercise.required_keywords);
                    const speechEnabled = exercise.enable_stt || false;

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

                          {exercise.type === 'flashcard_recall' ? (
                            <FlashcardRecallExerciseCard
                              exercise={exercise}
                              response={response}
                              isSaving={isSaving}
                              onDraftChange={(patch) => updateExerciseResponse(exercise.id, patch)}
                              onRestart={() => resetExerciseDraft(exercise)}
                              onSubmit={() => void handleSubmitExercise(exercise)}
                            />
                          ) : exercise.type === 'multiple_choice' ? (
                            <div className="space-y-3">
                              <RadioGroup
                                value={response.selectedOption}
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
                                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                                    >
                                      <RadioGroupItem id={optionId} value={option} />
                                      <span className="text-sm text-slate-700">{option}</span>
                                    </label>
                                  );
                                })}
                              </RadioGroup>
                            </div>
                          ) : exercise.type === 'timestamp_question' ? (
                            <div className="space-y-2">
                              <Label htmlFor={exercise.id}>Your response</Label>
                              <Textarea
                                id={exercise.id}
                                value={response.responseText}
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
                                    disabled={isExerciseLocked}
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
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => resetExerciseDraft(exercise)}
                                >
                                  <RotateCcw className="mr-2 size-4" />
                                  Reset Draft
                                </Button>
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
                          ) : (
                            <div className="space-y-2">
                              <Label htmlFor={exercise.id}>Your response</Label>
                              <Textarea
                                id={exercise.id}
                                value={response.responseText}
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
                                    disabled={isExerciseLocked}
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
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => resetExerciseDraft(exercise)}
                                >
                                  <RotateCcw className="mr-2 size-4" />
                                  Reset Draft
                                </Button>
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

                          {exercise.attempt && exercise.type !== 'flashcard_recall' ? (
                            <div className="rounded-lg border bg-emerald-50 p-3 text-sm text-slate-700">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium">Latest result</p>
                                <Badge className="bg-white text-emerald-700 border-emerald-200">
                                  Score: {Math.round(exercise.attempt.score || 0)}%
                                </Badge>
                              </div>
                              <p className="mt-2">{exercise.attempt.feedback || 'Saved successfully.'}</p>
                              <p className="mt-2 text-xs text-slate-500">
                                Input mode: {getInputModeLabel(exercise.attempt.input_mode)}
                              </p>
                              {exercise.attempt.matched_keywords?.length ? (
                                <p className="mt-2 text-xs text-emerald-700">
                                  Matched: {exercise.attempt.matched_keywords.join(', ')}
                                </p>
                              ) : null}
                              {exercise.attempt.missing_keywords?.length ? (
                                <p className="mt-1 text-xs text-amber-700">
                                  Missing: {exercise.attempt.missing_keywords.join(', ')}
                                </p>
                              ) : null}
                              {exercise.attempt.submitted_at ? (
                                <p className="mt-2 text-xs text-slate-500">
                                  Last submitted: {formatDate(exercise.attempt.submitted_at)}
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          {isExerciseLocked ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                              {isMediaUnavailable
                                ? activeModuleGateState?.lockMessage || 'The required module media is not available yet.'
                                : videoAssetKind === 'file'
                                  ? 'Complete the video first to unlock this practice prompt.'
                                  : 'Review the lesson reference and confirm it first to unlock this practice prompt.'}
                            </div>
                          ) : null}

                          {exercise.type !== 'flashcard_recall' ? (
                          <Button type="button" onClick={() => void handleSubmitExercise(exercise)} disabled={isSaving || isExerciseLocked}>
                            {isSaving
                              ? 'Saving Exercise...'
                              : getExerciseActionLabel(assignmentDetail.module.module_type, exercise)}
                          </Button>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
