'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import VoiceActivityBars from '@/app/components/trainee/voice-activity-bars';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { cn } from '@/app/components/ui/utils';
import { useAuth } from '@/app/context/AuthContext';
import { openCallSimulationRealtimeStream } from '@/app/lib/assessment/call-simulation-client';
import { BROWSER_TTS_UNSUPPORTED_MESSAGE, browserTtsService } from '@/app/lib/tts/ttsService';
import { traineeSidebarItems } from '@/app/trainee/nav';
import { useSpeechToText, type SimFloorTurnResult } from '@/hooks/useSpeechToText';
import { useWavCallRecorder } from '@/hooks/useWavCallRecorder';
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    Clock3,
    Headphones,
    Lock,
    Mic,
    MicOff,
    PauseCircle,
    Phone,
    PhoneIncoming,
    PhoneOff,
    PlayCircle,
    RotateCcw,
    ShieldCheck,
    UserRound,
    Volume2,
    Waves,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

type CallState =
  | 'idle'
  | 'ringing'
  | 'accepted'
  | 'connected'
  | 'member-speaking'
  | 'csr-speaking'
  | 'processing'
  | 'completed';

interface ScenarioCard {
  id: string;
  assignment_id?: string;
  assigned_at?: string | null;
  assigned_by_id?: string | null;
  assigned_by_name?: string | null;
  assignment_batch_id?: string | null;
  assignment_batch_name?: string | null;
  assignment_wave_number?: number | null;
  title: string;
  topic?: string | null;
  description?: string | null;
  scenario_groups_count: number;
  steps_count: number;
  passing_score: number;
  assigned_batches?: Array<{
    batch_id: string;
    batch_name: string;
    wave_number?: number | null;
    assigned_at?: string | null;
  }>;
  attempt_count: number;
  retake_required: boolean;
  competent: boolean;
  latest_score: number;
  latest_session_id?: string | null;
  latest_status?: string | null;
  latest_completed_at?: string | null;
  active_session_id?: string | null;
  latest_certificate_id?: string | null;
  max_attempts?: number | null;
  can_retake?: boolean;
  remaining_attempts?: number | null;
  launch_blocked?: boolean;
  launch_block_reason?: string | null;
}

interface ScenarioStep {
  step_number: number;
  actor: string;
  speaker_label?: string | null;
  script: string;
  expected_keywords: string[];
  audio_url?: string | null;
  is_closing?: boolean;
  metadata?: Record<string, unknown>;
}

interface SessionData {
  session_id: string;
  assignment_id?: string | null;
  assigned_by_id?: string | null;
  attempt_number?: number | null;
  max_attempts?: number | null;
  scenario_title: string;
  scenario_description?: string | null;
  current_step: number;
  passing_score: number;
  member_profile: Record<string, unknown>;
  cxone_metadata: Record<string, unknown>;
  call_simulation_config?: Record<string, unknown>;
  ringer_audio_url?: string | null;
  hold_audio_url?: string | null;
  steps: ScenarioStep[];
}

interface DialerScriptFlowStep {
  step_id: string;
  suggested_csr_script: string;
  member_response_text: string;
  point_value: number;
  expected_keywords?: string[];
  member_audio_url?: string | null;
  csr_step_number?: number | null;
  member_step_number?: number | null;
}

interface QueuedMemberPlayback {
  sourceStepIndex: number | null;
  resumeStepIndex: number | null;
  script: string;
  audioUrl?: string | null;
  speakerLabel?: string | null;
}

interface TtsResponsePayload {
  audio_url?: string | null;
  audio_base64?: string | null;
  warning?: string | null;
  fallback_mode?: string | null;
  provider?: string | null;
  detail?: string;
}

interface KeywordComplianceItem {
  id: string;
  label: string;
  required_phrase: string;
  matched: boolean;
}

interface SessionResult {
  id: string;
  assignment_id?: string | null;
  assigned_by_id?: string | null;
  status?: string;
  audio_url?: string | null;
  transcript?: string | null;
  transcript_log?: Array<Record<string, unknown>>;
  weighted_score?: number | null;
  pass_fail: boolean;
  ai_feedback?: string | null;
  speech_to_text_accuracy?: number | null;
  grammar_score?: number | null;
  pronunciation_score?: number | null;
  pacing_score?: number | null;
  rate_of_speech?: number | null;
  dead_air_seconds?: number | null;
  aht_actual?: number | null;
  empathy_statements_count?: number | null;
  probing_questions_count?: number | null;
  forbidden_words_count?: number | null;
  sentiment_score?: number | null;
  keyword_compliance?: {
    score?: number;
    missing?: string[];
    items?: KeywordComplianceItem[];
  } | null;
  turn_logs: Array<Record<string, unknown>>;
  attempt_number?: number | null;
  max_attempts?: number | null;
  trainer_verdict_status?: string;
  trainer_verdict_notes?: string | null;
  coaching_notes?: string | null;
  feedback_report?: DialerFeedbackReport | null;
  certificate_id?: string | null;
  coaching_id?: string | null;
  coaching_status?: string | null;
  coaching_acknowledged_at?: string | null;
  completed_at?: string | null;
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

interface SessionRealtimePayload extends SessionResult {
  status?: string;
}

interface TranscriptPreviewEntry {
  stepNumber: number;
  actor: string;
  speakerLabel?: string | null;
  transcript: string;
  audioUrl?: string | null;
  timelineStartSeconds?: number | null;
  timelineEndSeconds?: number | null;
  coachNote?: string | null;
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

const DEFAULT_PHONE_RING_URL = '/audio/phone-ring.wav';

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function sentimentDescriptor(score?: number | null) {
  if (typeof score !== 'number') {
    return 'Pending';
  }
  if (score >= 0.3) {
    return 'Positive';
  }
  if (score <= -0.3) {
    return 'At Risk';
  }
  return 'Neutral';
}

function getAsrProviderLabel(provider?: string | null, explicitLabel?: string | null) {
  if (explicitLabel?.trim()) {
    return explicitLabel.trim();
  }
  const normalized = (provider || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'google_speech_to_text') {
    return 'Google Speech-to-Text';
  }
  if (normalized === 'openai_whisper') {
    return 'OpenAI Whisper';
  }
  if (normalized === 'heuristic_fallback') {
    return 'Transcript Assist Fallback';
  }
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function getRepeatPromptMessage(prompt?: string | null) {
  return prompt?.trim() || "Repeat, I can't understand what you're saying."
}

function getScenarioPriorityScore(scenario: ScenarioCard) {
  if (scenario.active_session_id) {
    return -1;
  }
  if (scenario.retake_required) {
    return 0;
  }
  if (scenario.attempt_count === 0) {
    return 1;
  }
  if (!scenario.competent) {
    return 2;
  }
  return 3;
}

function getScenarioLaunchLabel(scenario: ScenarioCard | null) {
  if (!scenario) {
    return 'Start the Call';
  }
  if (scenario.active_session_id) {
    return 'Resume the Call';
  }
  if (scenario.launch_blocked && scenario.competent) {
    return 'Passed';
  }
  if (scenario.can_retake || (scenario.attempt_count > 0 && !scenario.competent && !scenario.launch_blocked)) {
    return 'Retake the Call';
  }
  return 'Start the Call';
}

function getScenarioLaunchNote(scenario: ScenarioCard | null) {
  if (!scenario) {
    return 'Select an assigned call scenario to review it and start the mock call.';
  }
  if (scenario.launch_block_reason?.trim()) {
    return scenario.launch_block_reason.trim();
  }
  if (scenario.active_session_id) {
    return 'An in-progress mock call was found. Start the call, then accept the line to continue from the next pending turn.';
  }
  if (scenario.attempt_count > 0 && !scenario.competent) {
    const attemptsLeft = typeof scenario.remaining_attempts === 'number' ? ` ${scenario.remaining_attempts} attempt${scenario.remaining_attempts === 1 ? '' : 's'} remaining.` : '';
    return `Your latest attempt did not meet the passing KPI yet.${attemptsLeft}`;
  }
  if (scenario.competent) {
    return 'This assigned call scenario has already been passed and is now locked.';
  }
  const attemptWindow = typeof scenario.max_attempts === 'number'
    ? ` This assignment allows up to ${scenario.max_attempts} total attempt${scenario.max_attempts === 1 ? '' : 's'}.`
    : '';
  return `Starting the call plays the trainer ringer. After you accept the line, the conversation recording begins and the first CSR turn is prepared.${attemptWindow}`;
}

function getScenarioStatusText(scenario: ScenarioCard) {
  if (scenario.competent) {
    return 'Passed';
  }
  if (scenario.active_session_id) {
    return 'In Progress';
  }
  if (scenario.attempt_count > 0) {
    return 'Failed';
  }
  return 'Assigned';
}

function getScenarioStatusClasses(scenario: ScenarioCard) {
  if (scenario.competent) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (scenario.active_session_id) {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  if (scenario.attempt_count > 0) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function formatBatchWave(batchName?: string | null, waveNumber?: number | null) {
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

function getPreferredScenarioId(
  scenarios: ScenarioCard[],
  currentScenarioId: string,
  requestedScenarioId: string,
) {
  if (currentScenarioId && scenarios.some((scenario) => scenario.id === currentScenarioId)) {
    return currentScenarioId;
  }

  if (requestedScenarioId && scenarios.some((scenario) => scenario.id === requestedScenarioId)) {
    return requestedScenarioId;
  }

  const prioritizedScenario = [...scenarios].sort((left, right) => {
    const priorityDelta = getScenarioPriorityScore(left) - getScenarioPriorityScore(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const leftAssignedAt = left.assigned_at ? new Date(left.assigned_at).getTime() : 0;
    const rightAssignedAt = right.assigned_at ? new Date(right.assigned_at).getTime() : 0;
    if (leftAssignedAt !== rightAssignedAt) {
      return rightAssignedAt - leftAssignedAt;
    }

    return left.title.localeCompare(right.title);
  })[0];

  return prioritizedScenario?.id || '';
}

function statusLabel(callState: CallState, isOnHold: boolean) {
  if (isOnHold) return 'On Hold';
  if (callState === 'ringing') return 'Ringing';
  if (callState === 'accepted') return 'Call Accepted';
  if (callState === 'member-speaking') return 'Member AI Speaking';
  if (callState === 'csr-speaking') return 'Trainee Speaking';
  if (callState === 'processing') return 'Saving Progress';
  if (callState === 'completed') return 'Evaluation Complete';
  if (callState === 'idle') return 'Waiting To Start';
  return 'Ready For CSR Turn';
}

function readNumericValue(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function readCueAudioUrl(config: Record<string, unknown> | undefined | null) {
  if (!config || typeof config !== 'object') {
    return null;
  }

  const cueKeys = ['cue_audio_url', 'cueAudioUrl', 'resume_cue_audio_url', 'resumeCueAudioUrl'];
  for (const key of cueKeys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function buildDialerScriptFlow(sessionData: SessionData | null) {
  const configuredFlow = Array.isArray(sessionData?.call_simulation_config?.script_flow)
    ? (sessionData?.call_simulation_config?.script_flow as Array<Record<string, unknown>>)
    : [];

  if (configuredFlow.length) {
    return configuredFlow.map((step, index) => ({
      step_id: String(step.step_id || `step-${index + 1}`),
      suggested_csr_script: String(step.suggested_csr_script || ''),
      member_response_text: String(step.member_response_text || ''),
      point_value: readNumericValue(step.point_value, 0),
      expected_keywords: Array.isArray(step.expected_keywords)
        ? step.expected_keywords.map((keyword) => String(keyword))
        : [],
      member_audio_url: typeof step.member_audio_url === 'string' ? step.member_audio_url : null,
      csr_step_number: readNumericValue(step.csr_step_number, index * 2 + 1),
      member_step_number: readNumericValue(step.member_step_number, index * 2 + 2),
    }));
  }

  const steps = [...(sessionData?.steps || [])].sort((left, right) => left.step_number - right.step_number);
  const derivedFlow: DialerScriptFlowStep[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.actor !== 'csr') {
      continue;
    }

    const nextMemberStep = steps.slice(index + 1).find((candidate) => candidate.actor === 'member');
    derivedFlow.push({
      step_id: String(step.metadata?.script_flow_step_id || `step-${derivedFlow.length + 1}`),
      suggested_csr_script: step.script,
      member_response_text: nextMemberStep?.script || '',
      point_value: readNumericValue(step.metadata?.point_value, Math.max(step.expected_keywords.length, 1)),
      expected_keywords: step.expected_keywords,
      member_audio_url: nextMemberStep?.audio_url || null,
      csr_step_number: step.step_number,
      member_step_number: nextMemberStep?.step_number ?? null,
    });
  }

  return derivedFlow;
}

function TraineeSimFloorPageFallback() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <div className="space-y-6">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Loading Call Simulations</CardTitle>
            <CardDescription>Preparing your assigned call scenarios and live floor workspace.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Please wait while the session context is loaded.
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function TraineeSimFloorPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [callTimer, setCallTimer] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [showIncomingAudio, setShowIncomingAudio] = useState(false);
  const [showSilenceAlert, setShowSilenceAlert] = useState(false);
  const [isUploadingCall, setIsUploadingCall] = useState(false);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [activePlaybackScript, setActivePlaybackScript] = useState('');
  const [activePlaybackSpeaker, setActivePlaybackSpeaker] = useState<'member' | 'system' | null>(null);
  const [queuedMemberStepIndex, setQueuedMemberStepIndex] = useState<number | null>(null);
  const [queuedMemberPlayback, setQueuedMemberPlayback] = useState<QueuedMemberPlayback | null>(null);
  const [memberTurnState, setMemberTurnState] = useState<'idle' | 'awaiting-hold' | 'playing' | 'awaiting-resume'>('idle');
  const [feedbackReport, setFeedbackReport] = useState<DialerFeedbackReport | null>(null);
  const [isLoadingFeedbackReport, setIsLoadingFeedbackReport] = useState(false);
  const [isGeneratingMemberAudio, setIsGeneratingMemberAudio] = useState(false);
  const [memberAudioWarning, setMemberAudioWarning] = useState<string | null>(null);
  const [sessionPlaybackUrl, setSessionPlaybackUrl] = useState<string | null>(null);
  const requestedScenarioId = searchParams.get('scenarioId')?.trim() || '';

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);
  const holdAudioRef = useRef<HTMLAudioElement | null>(null);
  const cueAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const autoConnectTimeoutRef = useRef<number | null>(null);
  const isConnectingCallRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const synthesizedPlaybackCacheRef = useRef<Map<string, string>>(new Map());
  const invalidRequestedScenarioRef = useRef<string | null>(null);
  const browserTtsFallbackNoticeRef = useRef(false);
  const recordingFallbackNoticeRef = useRef(false);
  const holdAudioErrorNoticeRef = useRef(false);
  const cueAudioErrorNoticeRef = useRef(false);
  const autoStartTurnAttemptKeyRef = useRef<string | null>(null);

  const steps = useMemo(
    () => [...(sessionData?.steps || [])].sort((left, right) => left.step_number - right.step_number),
    [sessionData?.steps],
  );
  const dialerScriptFlow = useMemo(() => buildDialerScriptFlow(sessionData), [sessionData]);
  const currentStep = steps[currentStepIndex] || null;
  const memberName = String(sessionData?.member_profile?.name || sessionData?.cxone_metadata?.member_name || 'Scenario Member');
  const memberId = String(sessionData?.member_profile?.member_id || sessionData?.cxone_metadata?.member_id || 'Not provided');
  const planType = String(sessionData?.member_profile?.plan_type || sessionData?.cxone_metadata?.plan_type || 'Plan not provided');
  const verificationStatus = String(
    sessionData?.member_profile?.verification_status || sessionData?.cxone_metadata?.verification_status || 'Verification required',
  );
  const memberIssue = String(
    sessionData?.member_profile?.problem_statement ||
      sessionData?.cxone_metadata?.problem_statement ||
      sessionData?.scenario_description ||
      'Follow the uploaded script.',
  );
  const agentName = user?.user_name || 'CSR Trainee';
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) || null,
    [scenarios, selectedScenarioId],
  );
  const selectedScenarioLaunchLabel = useMemo(
    () => getScenarioLaunchLabel(selectedScenario),
    [selectedScenario],
  );
  const selectedScenarioLaunchNote = useMemo(
    () => getScenarioLaunchNote(selectedScenario),
    [selectedScenario],
  );

  const {
    startRecording,
    stopRecording,
    isRecording,
    isProcessing,
    audioLevel,
    error: speechToTextError,
    lastResult: lastTurnResult,
  } = useSpeechToText({
    sessionId: sessionData?.session_id,
  });

  const {
    startCapture,
    stopCapture,
    discardCapture,
    registerPlaybackElement,
    setCapturePaused,
    isCapturing,
    error: callRecorderError,
  } = useWavCallRecorder();

  const lastAsrProviderLabel = getAsrProviderLabel(lastTurnResult?.asr_provider, lastTurnResult?.asr_provider_label);
  const lastTranscriptConfidence =
    typeof lastTurnResult?.transcript_confidence === 'number' ? Math.round(lastTurnResult.transcript_confidence * 100) : null;
  const currentDialerTurn = useMemo(() => {
    if (!currentStep || currentStep.actor !== 'csr') {
      return null;
    }
    return (
      dialerScriptFlow.find((step) => step.csr_step_number === currentStep.step_number)
      || dialerScriptFlow[Math.max(0, currentStepIndex)]
      || null
    );
  }, [currentStep, currentStepIndex, dialerScriptFlow]);
  const scenarioPointSummary = useMemo(() => {
    const groupedTurns = new Map<number, Record<string, unknown>>();
    for (const turn of sessionResult?.turn_logs || []) {
      if (String(turn.actor || '').toLowerCase() !== 'csr') {
        continue;
      }
      const stepNumber = Number(turn.step_number || 0);
      if (!stepNumber) {
        continue;
      }
      const existingTurn = groupedTurns.get(stepNumber);
      const currentAccepted = Boolean(turn.accepted_for_progress);
      const existingAccepted = Boolean(existingTurn?.accepted_for_progress);
      if (!existingTurn || currentAccepted || !existingAccepted) {
        groupedTurns.set(stepNumber, turn);
      }
    }

    let pointsEarned = 0;
    let pointsTotal = 0;
    for (const turn of groupedTurns.values()) {
      pointsEarned += Number(turn.earned_points || 0);
      pointsTotal += Number(turn.point_value || 0);
    }

    return {
      earned: pointsEarned,
      total: pointsTotal,
      percent: pointsTotal > 0 ? (pointsEarned / pointsTotal) * 100 : 0,
    };
  }, [sessionResult?.turn_logs]);
  const summaryTranscriptEntries = useMemo<TranscriptPreviewEntry[]>(() => {
    if (!sessionResult?.transcript_log?.length) {
      return [];
    }

    return sessionResult.transcript_log
      .map((entry) => ({
        stepNumber: readNumericValue((entry as Record<string, unknown>).step_number, 0),
        actor: String((entry as Record<string, unknown>).actor || 'unknown').toLowerCase(),
        speakerLabel: typeof (entry as Record<string, unknown>).speaker_label === 'string'
          ? String((entry as Record<string, unknown>).speaker_label)
          : null,
        transcript: String(
          (entry as Record<string, unknown>).transcript
          || (entry as Record<string, unknown>).text
          || '',
        ),
        audioUrl: typeof (entry as Record<string, unknown>).audio_url === 'string'
          ? String((entry as Record<string, unknown>).audio_url)
          : null,
        timelineStartSeconds: typeof (entry as Record<string, unknown>).timeline_start_seconds === 'number'
          ? Number((entry as Record<string, unknown>).timeline_start_seconds)
          : null,
        timelineEndSeconds: typeof (entry as Record<string, unknown>).timeline_end_seconds === 'number'
          ? Number((entry as Record<string, unknown>).timeline_end_seconds)
          : null,
        coachNote: typeof (entry as Record<string, unknown>).coach_note === 'string'
          ? String((entry as Record<string, unknown>).coach_note)
          : null,
      }))
      .sort((left, right) => left.stepNumber - right.stepNumber);
  }, [sessionResult?.transcript_log]);
  const selectedScenarioStartDisabled = Boolean(selectedScenario?.launch_blocked);
  const currentScenarioCue = useMemo(() => {
    const metadataScenario = String(currentStep?.metadata?.scenario || '').trim();
    const normalizedMetadataScenario = /^\d+$/.test(metadataScenario) ? '' : metadataScenario;
    return String(
      normalizedMetadataScenario
        || currentDialerTurn?.member_response_text
        || '',
    ).trim();
  }, [currentDialerTurn?.member_response_text, currentStep?.metadata?.scenario]);
  const currentMemberActorLabel = String(
    currentStep?.metadata?.actor_name
      || currentStep?.speaker_label
      || memberName,
  ).trim();
  const needsHoldForMemberResponse = memberTurnState === 'awaiting-hold' && queuedMemberPlayback !== null;
  const canResumeMemberTurn = memberTurnState === 'awaiting-resume';
  const canUseHoldControl =
    isRecording
    || needsHoldForMemberResponse
    || canResumeMemberTurn
    || isOnHold;
  const holdControlLabel = canResumeMemberTurn || isOnHold ? 'Unhold' : 'Hold';
  const holdControlNote = isRecording
    ? 'Click Hold to save your CSR turn and play the Member response.'
    : canResumeMemberTurn
      ? 'Click Unhold to unlock the next CSR turn.'
      : needsHoldForMemberResponse
        ? 'Click Hold to hear the next Member response.'
        : 'Hold becomes available after you record a CSR turn.';
  const queueFocusIndex = useMemo(() => {
    if (canResumeMemberTurn && typeof queuedMemberPlayback?.resumeStepIndex === 'number') {
      return queuedMemberPlayback.resumeStepIndex;
    }
    if (
      (needsHoldForMemberResponse || memberTurnState === 'playing')
      && typeof queuedMemberPlayback?.sourceStepIndex === 'number'
    ) {
      return queuedMemberPlayback.sourceStepIndex;
    }
    if (typeof queuedMemberStepIndex === 'number' && memberTurnState === 'playing') {
      return queuedMemberStepIndex;
    }
    return Math.max(0, Math.min(currentStepIndex, Math.max(steps.length - 1, 0)));
  }, [
    canResumeMemberTurn,
    currentStepIndex,
    memberTurnState,
    needsHoldForMemberResponse,
    queuedMemberPlayback?.resumeStepIndex,
    queuedMemberPlayback?.sourceStepIndex,
    queuedMemberStepIndex,
    steps.length,
  ]);
  const queuePosition = steps.length ? Math.min(queueFocusIndex + 1, steps.length) : 1;
  const queueProgressPercent = steps.length ? Math.round((queuePosition / steps.length) * 100) : 0;
  const currentQueueStep = steps[queueFocusIndex] || null;
  const currentQueueActorLabel = currentQueueStep
    ? currentQueueStep.actor === 'member'
      ? String(currentQueueStep.metadata?.actor_name || currentQueueStep.speaker_label || memberName).trim()
      : String(currentQueueStep.speaker_label || 'CSR / Trainee').trim()
    : 'No active step';
  const queueStatusNote = canResumeMemberTurn
    ? 'Member AI finished speaking. Click Unhold to continue with the next CSR response.'
    : needsHoldForMemberResponse
      ? 'Your CSR turn is saved. Click Hold to play the queued Member AI response.'
      : callState === 'member-speaking'
        ? 'Member AI is handling this step now. Wait for the cue before you continue.'
        : callState === 'accepted'
          ? 'The call is accepted. The first CSR step unlocks after the short preparation window.'
          : currentQueueStep?.actor === 'csr'
            ? 'This is your live CSR step. Speak naturally, then use Hold to continue the script.'
            : 'This step is delivered automatically by the Member AI voice.';
  const queuePreviewSteps = useMemo(() => {
    if (!steps.length) {
      return [];
    }

    const windowStart = Math.max(0, queueFocusIndex - 1);
    const windowEnd = Math.min(steps.length, queueFocusIndex + 3);

    return steps.slice(windowStart, windowEnd).map((step, offset) => {
      const index = windowStart + offset;
      return {
        index,
        step,
        state: index < queueFocusIndex ? 'completed' : index === queueFocusIndex ? 'current' : 'upcoming',
      };
    });
  }, [queueFocusIndex, steps]);

  const isMicLocked =
    callState === 'ringing' ||
    callState === 'accepted' ||
    callState === 'member-speaking' ||
    callState === 'processing' ||
    isOnHold ||
    memberTurnState === 'awaiting-hold' ||
    memberTurnState === 'awaiting-resume';

  const showBrowserFallbackNotice = useCallback(() => {
    if (browserTtsFallbackNoticeRef.current) {
      return;
    }
    browserTtsFallbackNoticeRef.current = true;
    toast.info('AI voice is using browser fallback mode.');
  }, []);

  const showRecordingFallbackNotice = useCallback(() => {
    if (recordingFallbackNoticeRef.current) {
      return;
    }
    recordingFallbackNoticeRef.current = true;
    const warningMessage = 'Member AI audio could not be saved to Supabase for this turn. Browser fallback will play, but the final recording may miss the member side.';
    setMemberAudioWarning(warningMessage);
    toast.warning(warningMessage);
  }, []);

  const speakWithBrowserFallback = useCallback(
    async (script: string) => {
      const normalizedScript = script.trim();
      if (!normalizedScript) {
        return;
      }

      showBrowserFallbackNotice();
      await browserTtsService.speak(normalizedScript, {
        lang: 'en-US',
        voiceName: 'Google US English',
        onError: (error) => {
          console.warn('Browser TTS fallback failed:', error);
        },
      });
    },
    [showBrowserFallbackNotice],
  );

  const fetchScenarios = useCallback(async () => {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/call-simulation/available', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({ scenarios: [] }));
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to load scenarios.');
    }
    const nextScenarios = (payload.scenarios || []) as ScenarioCard[];
    setScenarios(nextScenarios);
    setSelectedScenarioId((current) =>
      getPreferredScenarioId(nextScenarios, current, requestedScenarioId),
    );
    return nextScenarios;
  }, [requestedScenarioId]);

  const loadSessionPlaybackUrl = useCallback(async (sessionId: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/call-simulation/session/${sessionId}/audio`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to load the saved call recording.');
    }
    if (!payload?.audio_url) {
      throw new Error('No playable call recording is available yet.');
    }
    setSessionPlaybackUrl(String(payload.audio_url));
  }, []);

  const refreshCurrentSession = useCallback(async () => {
    if (!sessionData?.session_id) {
      return;
    }

    const token = localStorage.getItem('token');
    const response = await fetch(`/api/call-simulation/session/${sessionData.session_id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as SessionRealtimePayload | null;
    if (!response.ok || !payload) {
      return;
    }

    setSessionResult({
      id: payload.id,
      assignment_id: payload.assignment_id,
      assigned_by_id: payload.assigned_by_id,
      status: payload.status,
      audio_url: payload.audio_url,
      transcript: payload.transcript,
      transcript_log: payload.transcript_log || [],
      weighted_score: payload.weighted_score,
      pass_fail: payload.pass_fail,
      ai_feedback: payload.ai_feedback,
      speech_to_text_accuracy: payload.speech_to_text_accuracy,
      grammar_score: payload.grammar_score,
      pronunciation_score: payload.pronunciation_score,
      pacing_score: payload.pacing_score,
      rate_of_speech: payload.rate_of_speech,
      dead_air_seconds: payload.dead_air_seconds,
      aht_actual: payload.aht_actual,
      empathy_statements_count: payload.empathy_statements_count,
      probing_questions_count: payload.probing_questions_count,
      forbidden_words_count: payload.forbidden_words_count,
      sentiment_score: payload.sentiment_score,
      keyword_compliance: payload.keyword_compliance,
      turn_logs: payload.turn_logs || [],
      attempt_number: payload.attempt_number,
      max_attempts: payload.max_attempts,
      trainer_verdict_status: payload.trainer_verdict_status,
      trainer_verdict_notes: payload.trainer_verdict_notes,
      coaching_notes: payload.coaching_notes,
      feedback_report: payload.feedback_report || null,
      certificate_id: payload.certificate_id,
      coaching_id: payload.coaching_id,
      coaching_status: payload.coaching_status,
      coaching_acknowledged_at: payload.coaching_acknowledged_at,
      completed_at: payload.completed_at,
    });
    setFeedbackReport(payload.feedback_report || null);

    if (payload.status === 'completed' || payload.status === 'failed') {
      setCallState('completed');
      void loadSessionPlaybackUrl(payload.id).catch(() => undefined);
    }
  }, [loadSessionPlaybackUrl, sessionData?.session_id]);

  const stopBrowserTranscript = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const startBrowserTranscript = useCallback(() => {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      return;
    }

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      setLiveTranscript(transcript);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const playRingBurst = useCallback(() => {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    const context = new AudioContextClass();
    ringtoneContextRef.current = context;
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.value = 0.0001;
    const osc = context.createOscillator();
    osc.frequency.value = 440;
    osc.connect(gain);
    const now = context.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.start(now);
    osc.stop(now + 0.6);
  }, []);

  const playResumeCue = useCallback(async () => {
    const configuredCueAudioUrl = readCueAudioUrl(
      (sessionData?.call_simulation_config as Record<string, unknown> | undefined) || undefined,
    );

    if (configuredCueAudioUrl) {
      const playedConfiguredCue = await new Promise<boolean>((resolve) => {
        if (cueAudioRef.current) {
          cueAudioRef.current.pause();
          cueAudioRef.current = null;
        }

        const cueAudio = new Audio();
        cueAudio.crossOrigin = 'anonymous';
        cueAudio.src = configuredCueAudioUrl;
        registerPlaybackElement(cueAudio);
        cueAudioRef.current = cueAudio;

        const finish = (didPlay: boolean) => {
          if (cueAudioRef.current === cueAudio) {
            cueAudioRef.current.pause();
            cueAudioRef.current = null;
          }
          cueAudio.onended = null;
          cueAudio.onerror = null;
          resolve(didPlay);
        };

        cueAudio.onended = () => finish(true);
        cueAudio.onerror = () => {
          if (!cueAudioErrorNoticeRef.current) {
            cueAudioErrorNoticeRef.current = true;
            toast.error('The trainer cue sound could not be loaded. The default continue cue will play instead.');
          }
          finish(false);
        };

        void cueAudio.play().catch(() => {
          if (!cueAudioErrorNoticeRef.current) {
            cueAudioErrorNoticeRef.current = true;
            toast.error('The trainer cue sound could not be played. The default continue cue will play instead.');
          }
          finish(false);
        });
      });

      if (playedConfiguredCue) {
        return;
      }
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.value = 0.0001;

    const firstTone = context.createOscillator();
    firstTone.type = 'sine';
    firstTone.frequency.value = 880;
    firstTone.connect(gain);

    const secondTone = context.createOscillator();
    secondTone.type = 'sine';
    secondTone.frequency.value = 1175;
    secondTone.connect(gain);

    const now = context.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    firstTone.start(now);
    firstTone.stop(now + 0.14);
    secondTone.start(now + 0.14);
    secondTone.stop(now + 0.34);

    window.setTimeout(() => {
      void context.close().catch(() => undefined);
    }, 420);
  }, [registerPlaybackElement, sessionData?.call_simulation_config]);

  const startRingtone = useCallback(
    (audioUrl?: string | null) => {
      const resolvedAudioUrl = audioUrl || DEFAULT_PHONE_RING_URL;
      const audio = new Audio(resolvedAudioUrl);
      audio.loop = true;
      audio.onerror = () => {
        ringtoneAudioRef.current = null;
        playRingBurst();
        if (!ringtoneIntervalRef.current) {
          ringtoneIntervalRef.current = setInterval(playRingBurst, 1900);
        }
      };
      ringtoneAudioRef.current = audio;
      void audio.play().catch(() => {
        ringtoneAudioRef.current = null;
        playRingBurst();
        ringtoneIntervalRef.current = setInterval(playRingBurst, 1900);
      });
    },
    [playRingBurst],
  );

  const stopRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.pause();
      ringtoneAudioRef.current.currentTime = 0;
      ringtoneAudioRef.current = null;
    }
    if (ringtoneContextRef.current) {
      void ringtoneContextRef.current.close();
      ringtoneContextRef.current = null;
    }
  }, []);

  const clearAutoConnectTimeout = useCallback(() => {
    if (autoConnectTimeoutRef.current !== null) {
      window.clearTimeout(autoConnectTimeoutRef.current);
      autoConnectTimeoutRef.current = null;
    }
  }, []);

  const fadeOutRingtone = useCallback(async () => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }

    const activeRingtone = ringtoneAudioRef.current;
    if (!activeRingtone) {
      stopRingtone();
      return;
    }

    const startingVolume = activeRingtone.volume || 1;
    const steps = 6;

    await new Promise<void>((resolve) => {
      let currentStep = 0;
      const intervalId = window.setInterval(() => {
        currentStep += 1;
        const nextVolume = Math.max(0, startingVolume * (1 - currentStep / steps));
        activeRingtone.volume = nextVolume;

        if (currentStep >= steps) {
          window.clearInterval(intervalId);
          resolve();
        }
      }, 50);
    });

    stopRingtone();
    activeRingtone.volume = startingVolume;
  }, [stopRingtone]);

  const synthesizePlaybackAudio = useCallback(
    async (
      script: string,
      options?: {
        scenarioId?: string | null;
        stepNumber?: number | null;
      },
    ) => {
      const normalizedScript = script.trim();
      if (!normalizedScript) {
        return null;
      }

      const cacheKey = [
        options?.scenarioId ? `scenario:${options.scenarioId}` : 'scenario:none',
        typeof options?.stepNumber === 'number' ? `step:${options.stepNumber}` : 'step:none',
        normalizedScript,
      ].join('::');
      const cachedAudioUrl = synthesizedPlaybackCacheRef.current.get(cacheKey);
      if (cachedAudioUrl) {
        return cachedAudioUrl;
      }

      try {
        const token = localStorage.getItem('token');
        setIsGeneratingMemberAudio(true);
        let payload: TtsResponsePayload | null = null;

        const canPersistForRecording = Boolean(
          options?.scenarioId
          && typeof options?.stepNumber === 'number'
          && options.stepNumber > 0,
        );

        if (canPersistForRecording) {
          const persistentParams = new URLSearchParams({
            text: normalizedScript,
            persist: 'true',
            require_supabase: 'true',
            scenario_id: String(options?.scenarioId),
            step_number: String(options?.stepNumber),
            asset_kind: 'member-step',
          });

          const persistentResponse = await fetch(`/api/call-simulation/tts?${persistentParams.toString()}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          const persistentPayload = (await persistentResponse.json().catch(() => null)) as TtsResponsePayload | null;
          if (persistentResponse.ok && persistentPayload && !persistentPayload.detail) {
            payload = persistentPayload;
          } else {
            console.warn(
              'Call Simulation member audio could not be persisted for this step. Falling back to non-persistent playback.',
              persistentPayload?.detail || persistentResponse.statusText,
            );
          }
        }

        if (!payload) {
          const response = await fetch(`/api/call-simulation/tts?text=${encodeURIComponent(normalizedScript)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          payload = (await response.json().catch(() => null)) as TtsResponsePayload | null;
          if (!response.ok || !payload || payload.detail) {
            console.warn('Call Simulation backend TTS was unavailable. Browser fallback will be used.');
            showBrowserFallbackNotice();
            if (canPersistForRecording) {
              showRecordingFallbackNotice();
            }
            return null;
          }
        }

        if (payload.warning || payload.fallback_mode === 'browser') {
          console.warn(payload.warning || 'Call Simulation backend TTS returned no playable audio. Browser fallback will be used.');
          showBrowserFallbackNotice();
          if (canPersistForRecording) {
            showRecordingFallbackNotice();
          }
        }

        if (payload.audio_url) {
          synthesizedPlaybackCacheRef.current.set(cacheKey, payload.audio_url);
          return payload.audio_url;
        }

        if (payload.audio_base64) {
          const binaryString = window.atob(payload.audio_base64);
          const bytes = Uint8Array.from(binaryString, (character) => character.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'audio/wav' });
          const objectUrl = window.URL.createObjectURL(blob);
          synthesizedPlaybackCacheRef.current.set(cacheKey, objectUrl);
          return objectUrl;
        }

        console.warn('Call Simulation backend TTS returned no playable audio. Browser fallback will be used.');
        showBrowserFallbackNotice();
        if (canPersistForRecording) {
          showRecordingFallbackNotice();
        }
      } catch (error) {
        console.warn('Call Simulation backend TTS request failed. Browser fallback will be used:', error);
        showBrowserFallbackNotice();
        if (options?.scenarioId && typeof options?.stepNumber === 'number' && options.stepNumber > 0) {
          showRecordingFallbackNotice();
        }
        return null;
      } finally {
        setIsGeneratingMemberAudio(false);
      }

      return null;
    },
    [showBrowserFallbackNotice, showRecordingFallbackNotice],
  );

  const playPlaybackPrompt = useCallback(
    async ({
      script,
      audioUrl,
      speaker,
      stepNumber,
    }: {
      script: string;
      audioUrl?: string | null;
      speaker: 'member' | 'system';
      stepNumber?: number | null;
    }) => {
      const resolvedScript = script.trim();
      setActivePlaybackScript(resolvedScript);
      setActivePlaybackSpeaker(speaker);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      let resolvedAudioUrl = audioUrl || null;
      if (!resolvedAudioUrl && speaker === 'member' && resolvedScript) {
        resolvedAudioUrl = await synthesizePlaybackAudio(resolvedScript, {
          scenarioId: selectedScenarioId || null,
          stepNumber,
        });
      }

      if (resolvedAudioUrl) {
        const playedAudio = await new Promise<boolean>((resolve) => {
          const audio = new Audio();
          audio.crossOrigin = 'anonymous';
          audio.src = resolvedAudioUrl;
          registerPlaybackElement(audio);
          audioRef.current = audio;
          audio.onended = () => {
            if (audioRef.current === audio) {
              audioRef.current = null;
            }
            resolve(true);
          };
          audio.onerror = () => {
            if (audioRef.current === audio) {
              audioRef.current = null;
            }
            resolve(false);
          };
          void audio.play().catch(() => {
            if (audioRef.current === audio) {
              audioRef.current = null;
            }
            resolve(false);
          });
        });
        if (playedAudio) {
          return;
        }
      }

      if (!resolvedScript) {
        return;
      }

      if (!browserTtsService.isSupported()) {
        toast.error(BROWSER_TTS_UNSUPPORTED_MESSAGE);
        return;
      }

      try {
        await speakWithBrowserFallback(resolvedScript);
      } catch (error) {
        console.warn('Browser TTS fallback failed during call simulation playback:', error);
        toast.error(BROWSER_TTS_UNSUPPORTED_MESSAGE);
      }
    },
    [registerPlaybackElement, selectedScenarioId, speakWithBrowserFallback, synthesizePlaybackAudio],
  );

  const uploadFinalCallRecording = useCallback(async () => {
    if (!sessionData?.session_id || !isCapturing) {
      return;
    }

    const recording = await stopCapture();
    if (!recording) {
      return;
    }

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('audio_duration_seconds', recording.durationSeconds.toFixed(2));
    formData.append('file', recording.blob, `session-${sessionData.session_id}.${recording.fileExtension || 'wav'}`);

    setIsUploadingCall(true);
    try {
      const response = await fetch(`/api/call-simulation/session/${sessionData.session_id}/recording`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Unable to upload the final call recording.');
      }
    } finally {
      setIsUploadingCall(false);
    }
  }, [isCapturing, sessionData?.session_id, stopCapture]);

  const fetchFeedbackReport = useCallback(
    async ({
      result,
      transcriptLog,
      turnLogs,
    }: {
      result: SessionResult;
      transcriptLog: Array<Record<string, unknown>>;
      turnLogs: Array<Record<string, unknown>>;
    }) => {
      if (!sessionData?.session_id) {
        return;
      }

      const token = localStorage.getItem('token');
      setIsLoadingFeedbackReport(true);
      try {
        const response = await fetch(`/api/call-simulation/session/${sessionData.session_id}/feedback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            scenarioId: selectedScenarioId,
            scenarioTitle: sessionData.scenario_title,
            topic: String(sessionData.call_simulation_config?.topic || sessionData.scenario_title || 'Call scenario'),
            trainerId: result.assigned_by_id || sessionData.assigned_by_id || null,
            attemptNumber: result.attempt_number || sessionData.attempt_number || null,
            recordingUrl: result.audio_url || null,
            startedAt: null,
            endedAt: result.completed_at || null,
            durationSeconds: Math.round(result.aht_actual || callTimer),
            targetKpis:
              (sessionData.call_simulation_config?.target_kpis as Record<string, unknown> | undefined)
              || { passing_score: sessionData.passing_score },
            scriptFlow: dialerScriptFlow,
            turnLogs,
            transcriptLog,
            totalScore: Number(result.weighted_score || 0),
            passingScore: sessionData.passing_score,
            ahtSeconds: Math.round(result.aht_actual || callTimer),
            speechAccuracy: Number(result.speech_to_text_accuracy || 0),
            grammarScore: Number(result.grammar_score || 0),
            pronunciationScore: Number(result.pronunciation_score || 0),
            pacingScore: Number(result.pacing_score || 0),
            softSkillSignals: {
              empathyCount: result.empathy_statements_count,
              probingCount: result.probing_questions_count,
              sentimentScore: result.sentiment_score,
              deadAirSeconds: result.dead_air_seconds,
              rateOfSpeech: result.rate_of_speech,
            },
            certificateId: result.certificate_id || null,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { report?: DialerFeedbackReport; error?: string }
          | null;
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to generate the final feedback report.');
        }
        setFeedbackReport(payload?.report || null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to generate the final feedback report.');
      } finally {
        setIsLoadingFeedbackReport(false);
      }
    },
    [callTimer, dialerScriptFlow, selectedScenarioId, sessionData],
  );

  const downloadCertificate = useCallback(async (certificateId: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/certification/certificate/${certificateId}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.detail || payload?.error || 'Unable to download the certificate PDF.');
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `call-simulation-certificate-${certificateId}.pdf`;
    anchor.click();
    window.URL.revokeObjectURL(objectUrl);
  }, []);

  const finalizeSession = useCallback(async () => {
    if (!sessionData?.session_id || isEndingCall) {
      return;
    }

    const token = localStorage.getItem('token');
    setIsEndingCall(true);
    setCallState('processing');
    stopBrowserTranscript();
    browserTtsService.stop();

    try {
      await uploadFinalCallRecording();
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : 'Unable to upload the final call recording.');
    }

    try {
      const response = await fetch(`/api/call-simulation/session/${sessionData.session_id}/finalize`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = (await response.json().catch(() => null)) as SessionRealtimePayload | { detail?: string } | null;
      if (!response.ok || !payload || !('id' in payload)) {
        throw new Error((payload && 'detail' in payload && payload.detail) || 'Unable to finalize the mock call.');
      }

      const nextResult: SessionResult = {
        id: payload.id,
        assignment_id: payload.assignment_id,
        assigned_by_id: payload.assigned_by_id,
        status: payload.status,
        audio_url: payload.audio_url,
        transcript: payload.transcript,
        transcript_log: payload.transcript_log || [],
        weighted_score: payload.weighted_score,
        pass_fail: payload.pass_fail,
        ai_feedback: payload.ai_feedback,
        speech_to_text_accuracy: payload.speech_to_text_accuracy,
        grammar_score: payload.grammar_score,
        pronunciation_score: payload.pronunciation_score,
        pacing_score: payload.pacing_score,
        rate_of_speech: payload.rate_of_speech,
        dead_air_seconds: payload.dead_air_seconds,
        aht_actual: payload.aht_actual,
        empathy_statements_count: payload.empathy_statements_count,
        probing_questions_count: payload.probing_questions_count,
        forbidden_words_count: payload.forbidden_words_count,
        sentiment_score: payload.sentiment_score,
        keyword_compliance: payload.keyword_compliance,
        turn_logs: payload.turn_logs || [],
        attempt_number: payload.attempt_number,
        max_attempts: payload.max_attempts,
        trainer_verdict_status: payload.trainer_verdict_status,
        trainer_verdict_notes: payload.trainer_verdict_notes,
        coaching_notes: payload.coaching_notes,
        feedback_report: payload.feedback_report || null,
        certificate_id: payload.certificate_id,
        coaching_id: payload.coaching_id,
        coaching_status: payload.coaching_status,
        coaching_acknowledged_at: payload.coaching_acknowledged_at,
        completed_at: payload.completed_at,
      };
      setSessionResult(nextResult);
      setFeedbackReport(payload.feedback_report || null);
      setActivePlaybackScript('');
      setActivePlaybackSpeaker(null);
      setQueuedMemberStepIndex(null);
      setQueuedMemberPlayback(null);
      setMemberTurnState('idle');
      setCallState('completed');
      setSessionPlaybackUrl(null);
      await fetchScenarios().catch(() => undefined);
      const transcriptLog = Array.isArray((payload as { transcript_log?: Array<Record<string, unknown>> }).transcript_log)
        ? ((payload as { transcript_log?: Array<Record<string, unknown>> }).transcript_log || [])
        : [];
      await loadSessionPlaybackUrl(payload.id).catch(() => undefined);
      await fetchFeedbackReport({
        result: nextResult,
        transcriptLog,
        turnLogs: nextResult.turn_logs,
      });

      if (payload.certificate_id) {
        toast.success('Competency certificate is now being tracked in your certificates tab.');
      }
    } finally {
      setIsEndingCall(false);
    }
  }, [fetchFeedbackReport, fetchScenarios, isEndingCall, loadSessionPlaybackUrl, sessionData?.session_id, stopBrowserTranscript, uploadFinalCallRecording]);

  const moveToStep = useCallback(
    async (stepIndex: number) => {
      const step = steps[stepIndex];
      if (!step) {
        await finalizeSession();
        return;
      }

      setCurrentStepIndex(stepIndex);
      if (step.actor !== 'csr') {
        setShowSilenceAlert(false);
        setShowIncomingAudio(true);
        toast.info('Incoming audio from the Member Actor. Your mic is temporarily locked.');
        setCallState('member-speaking');
        await playPlaybackPrompt({
          script: step.script,
          audioUrl: step.audio_url,
          speaker: 'member',
          stepNumber: step.step_number,
        });
        await playResumeCue();

        const nextIndex = stepIndex + 1;
        if (!steps[nextIndex]) {
          await finalizeSession();
          return;
        }

        silenceStartRef.current = performance.now();
        setCurrentStepIndex(nextIndex);
      }

      if (step.actor === 'csr') {
        setActivePlaybackSpeaker(null);
        setActivePlaybackScript('');
      }
      setCallState('connected');
    },
    [finalizeSession, playPlaybackPrompt, playResumeCue, steps],
  );

  const startSimulation = useCallback(async (scenarioOverride?: ScenarioCard | null) => {
    const targetScenario = scenarioOverride || selectedScenario;
    const targetScenarioId = targetScenario?.id || selectedScenarioId;
    if (isStartingCall) {
      return;
    }
    if (!targetScenarioId) {
      toast.error('Select an assigned scenario before starting the mock call.');
      return;
    }
    if (targetScenario?.launch_blocked) {
      toast.error(targetScenario.launch_block_reason || 'This assigned call scenario cannot be launched right now.');
      return;
    }

    setSelectedScenarioId(targetScenarioId);
    browserTtsFallbackNoticeRef.current = false;
    recordingFallbackNoticeRef.current = false;
    cueAudioErrorNoticeRef.current = false;
    const token = localStorage.getItem('token');
    setIsStartingCall(true);
    try {
      const response = await fetch('/api/call-simulation/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ scenario_id: targetScenarioId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Unable to start the scenario.');
      }

      const sessionPayload = payload as SessionData;
      const startStepIndex = Array.isArray(sessionPayload.steps)
        ? sessionPayload.steps.findIndex((step) => step.step_number === Number(sessionPayload.current_step || 1))
        : -1;

      setSessionData(sessionPayload);
      setSessionResult(null);
      setMemberAudioWarning(null);
      setLiveTranscript('');
      setCurrentStepIndex(startStepIndex >= 0 ? startStepIndex : 0);
      setCallTimer(0);
      setIsMuted(false);
      setIsOnHold(false);
      setShowIncomingAudio(false);
      setShowSilenceAlert(false);
      setActivePlaybackScript('');
      setActivePlaybackSpeaker(null);
      setQueuedMemberStepIndex(null);
      setQueuedMemberPlayback(null);
      setMemberTurnState('idle');
      setFeedbackReport(null);
      setSessionPlaybackUrl(null);
      silenceStartRef.current = null;
      setCallState('ringing');
      startRingtone(sessionPayload.ringer_audio_url);

      if (targetScenario?.active_session_id) {
        toast.info('Resuming the in-progress call. Accept the line to continue from your next pending step.');
      } else if (targetScenario?.can_retake) {
        toast.info('Retake attempt loaded. Accept the line to restart the mock call flow.');
      }
    } finally {
      setIsStartingCall(false);
    }
  }, [isStartingCall, selectedScenario, selectedScenarioId, startRingtone]);

  const connectCall = useCallback(async () => {
    if (isConnectingCallRef.current) {
      return;
    }

    isConnectingCallRef.current = true;
    clearAutoConnectTimeout();
    try {
      await startCapture();
      await fadeOutRingtone();
      setShowIncomingAudio(true);
      setActivePlaybackSpeaker('system');
      setActivePlaybackScript('Call accepted. Prepare your opening spiel. Your microphone will open in a few seconds.');
      setCallState('accepted');
      autoConnectTimeoutRef.current = window.setTimeout(() => {
        autoConnectTimeoutRef.current = null;
        setShowIncomingAudio(false);
        setActivePlaybackScript('');
        setActivePlaybackSpeaker(null);
        void moveToStep(currentStepIndex);
      }, 5000);
    } catch {
      setCallState('ringing');
    } finally {
      isConnectingCallRef.current = false;
    }
  }, [clearAutoConnectTimeout, currentStepIndex, fadeOutRingtone, moveToStep, startCapture]);

  const handleReplayInstruction = useCallback(async () => {
    if (callState === 'ringing' || callState === 'accepted' || callState === 'processing' || isProcessing || memberTurnState === 'playing' || isEndingCall) {
      return;
    }
    if (isRecording) {
      toast.info('Save or hold the current CSR turn before replaying the instruction cue.');
      return;
    }

    const queuedScript = queuedMemberPlayback?.script?.trim()
      || (typeof queuedMemberStepIndex === 'number' ? steps[queuedMemberStepIndex]?.script?.trim() : '')
      || '';
    const queuedAudioUrl = queuedMemberPlayback?.audioUrl
      || (typeof queuedMemberStepIndex === 'number' ? steps[queuedMemberStepIndex]?.audio_url || null : null);
    const shouldReplayQueuedMember = needsHoldForMemberResponse || canResumeMemberTurn;
    const hasCurrentMemberCue = Boolean(currentStep?.actor === 'member' && (currentStep.script.trim() || currentStep.audio_url));
    const hasCurrentCsrInstruction = Boolean(currentStep?.script?.trim());

    if (
      !(shouldReplayQueuedMember && (queuedScript || queuedAudioUrl))
      && !hasCurrentMemberCue
      && !hasCurrentCsrInstruction
    ) {
      toast.info('No instruction is available to replay for this turn yet.');
      return;
    }

    try {
      setShowSilenceAlert(false);
      setShowIncomingAudio(true);
      setCallState('member-speaking');

      if (shouldReplayQueuedMember && (queuedScript || queuedAudioUrl)) {
        await playPlaybackPrompt({
          script: queuedScript,
          audioUrl: queuedAudioUrl,
          speaker: 'member',
          stepNumber: typeof queuedMemberStepIndex === 'number' ? steps[queuedMemberStepIndex]?.step_number ?? null : null,
        });
        toast.success('Queued member response replayed.');
        return;
      }

      if (currentStep?.actor === 'member') {
        await playPlaybackPrompt({
          script: currentStep.script,
          audioUrl: currentStep.audio_url,
          speaker: 'member',
          stepNumber: currentStep.step_number,
        });
        toast.success('Member cue replayed.');
        return;
      }

      if (currentStep?.script?.trim()) {
        await playPlaybackPrompt({
          script: currentStep.script,
          speaker: 'system',
        });
        silenceStartRef.current = performance.now();
        toast.success('CSR instruction replayed.');
        return;
      }

    } finally {
      setCallState('connected');
    }
  }, [
    callState,
    canResumeMemberTurn,
    currentStep,
    isEndingCall,
    isProcessing,
    isRecording,
    memberTurnState,
    needsHoldForMemberResponse,
    playPlaybackPrompt,
    queuedMemberPlayback,
    queuedMemberStepIndex,
    steps,
  ]);

  const returnToModuleList = useCallback(() => {
    router.push('/trainee/call-simulation');
  }, [router]);

  const playQueuedMemberResponse = useCallback(async (playback: QueuedMemberPlayback) => {
    if (!playback.script.trim() && !playback.audioUrl) {
      setQueuedMemberStepIndex(null);
      setQueuedMemberPlayback(null);
      setMemberTurnState('idle');
      setShowIncomingAudio(false);
      setActivePlaybackScript('');
      setActivePlaybackSpeaker(null);
      return;
    }

    setIsOnHold(true);
    setMemberTurnState('playing');
    if (typeof playback.sourceStepIndex === 'number') {
      setCurrentStepIndex(playback.sourceStepIndex);
    }
    setShowIncomingAudio(true);
    setCallState('member-speaking');

    await playPlaybackPrompt({
      script: playback.script,
      audioUrl: playback.audioUrl,
      speaker: 'member',
      stepNumber: typeof playback.sourceStepIndex === 'number' ? steps[playback.sourceStepIndex]?.step_number ?? null : null,
    });

    await playResumeCue();
    setMemberTurnState('awaiting-resume');
    setCallState('connected');
  }, [playPlaybackPrompt, playResumeCue]);

  const handleTurnSubmissionResult = useCallback(async (
    result: SimFloorTurnResult,
    options?: { autoPlayMemberResponse?: boolean },
  ) => {
    setLiveTranscript(result.transcript || '');
    toast.success(
      result.requires_repeat
        ? `Turn ${result.step_number} saved. Repeat the spiel before the call can continue.`
        : `Turn ${result.step_number} saved to Call Simulation.`,
    );

    if (result.requires_repeat) {
      autoStartTurnAttemptKeyRef.current = null;
      const repeatPrompt = getRepeatPromptMessage(result.repeat_prompt);
      setShowSilenceAlert(false);
      setShowIncomingAudio(true);
      setCallState('member-speaking');
      toast.error(result.repeat_reason ? `${repeatPrompt} ${result.repeat_reason}` : repeatPrompt);
      await playPlaybackPrompt({
        script: repeatPrompt,
        speaker: 'system',
      });
      silenceStartRef.current = performance.now();
      setCallState('connected');
      return;
    }

    if (result.is_complete || result.next_step == null) {
      await finalizeSession();
      return;
    }

    const nextIndex = steps.findIndex((step) => step.step_number === result.next_step);
    const resolvedNextIndex = nextIndex >= 0 ? nextIndex : currentStepIndex + 1;
    const nextStep = steps[resolvedNextIndex];
    const fallbackMemberResponse = currentDialerTurn?.member_response_text?.trim() || '';
    const queuedScript = (nextStep?.actor === 'member' ? nextStep.script : '') || fallbackMemberResponse;
    const queuedAudioUrl = (nextStep?.actor === 'member' ? nextStep.audio_url : null) || currentDialerTurn?.member_audio_url || null;

    if (nextStep?.actor === 'member' || queuedScript) {
      const resumeIndex = nextStep?.actor === 'member'
        ? steps.findIndex((step, index) => index > resolvedNextIndex && step.actor === 'csr')
        : resolvedNextIndex;
      const nextPlayback: QueuedMemberPlayback = {
        sourceStepIndex: nextStep?.actor === 'member' ? resolvedNextIndex : null,
        resumeStepIndex: resumeIndex >= 0 ? resumeIndex : null,
        script: queuedScript,
        audioUrl: queuedAudioUrl,
        speakerLabel: nextStep?.speaker_label || memberName,
      };

      setQueuedMemberStepIndex(nextStep?.actor === 'member' ? resolvedNextIndex : null);
      setQueuedMemberPlayback(nextPlayback);

      if (options?.autoPlayMemberResponse) {
        await playQueuedMemberResponse(nextPlayback);
        toast.success('Member response delivered. Click Unhold to continue to the next CSR step.');
        return;
      }

      setMemberTurnState('awaiting-hold');
      setShowIncomingAudio(false);
      setCallState('connected');
      toast.info('Turn saved. Click Hold to hear the member response, then click Unhold to continue.');
      return;
    }

    await moveToStep(resolvedNextIndex);
  }, [
    currentDialerTurn,
    currentStepIndex,
    finalizeSession,
    memberName,
    moveToStep,
    playPlaybackPrompt,
    playQueuedMemberResponse,
    steps,
  ]);

  const handleHoldToggle = useCallback(async () => {
    if (callState === 'ringing' || memberTurnState === 'playing') {
      return;
    }

    if (isRecording) {
      if (!currentStep || currentStep.actor !== 'csr') {
        return;
      }

      stopBrowserTranscript();
      setCallState('processing');

      try {
        const result = await stopRecording({ stepNumber: currentStep.step_number, liveTranscript });
        if (!result) {
          setCallState('connected');
          return;
        }

        await handleTurnSubmissionResult(result, { autoPlayMemberResponse: true });
      } catch (recordError) {
        toast.error(recordError instanceof Error ? recordError.message : 'Unable to process the recording.');
        setCallState('connected');
      }
      return;
    }

    if (isOnHold) {
      setIsOnHold(false);

      if (memberTurnState === 'awaiting-resume') {
        const nextIndex = queuedMemberPlayback?.resumeStepIndex ?? null;
        setQueuedMemberStepIndex(null);
        setQueuedMemberPlayback(null);
        setMemberTurnState('idle');
        setShowIncomingAudio(false);
        setActivePlaybackScript('');
        setActivePlaybackSpeaker(null);

        if (typeof nextIndex === 'number' && nextIndex >= 0) {
          silenceStartRef.current = performance.now();
          setCurrentStepIndex(nextIndex);
          setCallState('connected');
        } else {
          await finalizeSession();
        }
      }
      return;
    }

    if (!queuedMemberPlayback || memberTurnState !== 'awaiting-hold') {
      toast.info('Record your CSR turn first, then use Hold to play the Member response.');
      return;
    }

    await playQueuedMemberResponse(queuedMemberPlayback);
    toast.success('Member response delivered. Click Unhold to continue to the next CSR step.');
  }, [
    callState,
    currentStep,
    finalizeSession,
    isOnHold,
    isRecording,
    liveTranscript,
    memberTurnState,
    playQueuedMemberResponse,
    queuedMemberPlayback,
    handleTurnSubmissionResult,
    stopBrowserTranscript,
    stopRecording,
  ]);

  const handleEndCallRequest = useCallback(async () => {
    if (isRecording || isUploadingCall || isEndingCall || callState === 'processing') {
      return;
    }

    clearAutoConnectTimeout();

    const lastStepNumber = steps[steps.length - 1]?.step_number ?? null;
    const isEndingEarly = Boolean(
      currentStep
      && lastStepNumber
      && currentStep.step_number < lastStepNumber
      && memberTurnState !== 'awaiting-resume',
    );

    const confirmed = window.confirm(
      isEndingEarly
        ? 'End this mock call now? The conversation recording will be uploaded and any remaining scenario turns will be scored as incomplete.'
        : 'End this mock call now? The recording will be uploaded and the final KPI and AI evaluation will be generated.',
    );
    if (!confirmed) {
      return;
    }

    await finalizeSession();
  }, [callState, clearAutoConnectTimeout, currentStep, finalizeSession, isEndingCall, isRecording, isUploadingCall, memberTurnState, steps]);

  const handleMicClick = useCallback(async () => {
    if (!currentStep || currentStep.actor !== 'csr') {
      return;
    }
    if (isMuted) {
      toast.error('Unmute your line before speaking.');
      return;
    }
    if (isOnHold) {
      toast.error('Click Unhold before continuing your CSR response.');
      return;
    }
    if (callState === 'member-speaking') {
      toast.error('Wait for the member audio to finish before responding.');
      return;
    }

    if (!isRecording) {
      setLiveTranscript('');
      setShowSilenceAlert(false);
      silenceStartRef.current = null;
      try {
        await startRecording();
        startBrowserTranscript();
        setCallState('csr-speaking');
      } catch {
        setCallState('connected');
      }
      return;
    }

    stopBrowserTranscript();
    setCallState('processing');

    try {
      const result = await stopRecording({ stepNumber: currentStep.step_number, liveTranscript });
      if (!result) {
        setCallState('connected');
        return;
      }

      await handleTurnSubmissionResult(result);
    } catch (recordError) {
      toast.error(recordError instanceof Error ? recordError.message : 'Unable to process the recording.');
      setCallState('connected');
    }
  }, [
    callState,
    currentStep,
    handleTurnSubmissionResult,
    isMuted,
    isOnHold,
    isRecording,
    liveTranscript,
    startBrowserTranscript,
    stopBrowserTranscript,
    stopRecording,
    startRecording,
  ]);

  const handleRetake = useCallback(async () => {
    if (!sessionResult?.id || !sessionData) {
      return;
    }

    const token = localStorage.getItem('token');
    const response = await fetch(`/api/call-simulation/session/${sessionResult.id}/retake`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to retake the scenario.');
    }

    browserTtsService.stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (cueAudioRef.current) {
      cueAudioRef.current.pause();
      cueAudioRef.current = null;
    }
    if (holdAudioRef.current) {
      holdAudioRef.current.pause();
      holdAudioRef.current.currentTime = 0;
    }
    await discardCapture();
    setSessionData({
      ...sessionData,
      session_id: payload.id || sessionData.session_id,
      assignment_id: payload.assignment_id ?? sessionData.assignment_id,
      assigned_by_id: payload.assigned_by_id ?? sessionData.assigned_by_id,
      attempt_number: payload.attempt_number ?? sessionData.attempt_number,
      max_attempts: payload.max_attempts ?? sessionData.max_attempts,
    });
    setSessionResult(null);
    setMemberAudioWarning(null);
    setCurrentStepIndex(0);
    setCallTimer(0);
    setLiveTranscript('');
    browserTtsFallbackNoticeRef.current = false;
    recordingFallbackNoticeRef.current = false;
    setIsMuted(false);
    setIsOnHold(false);
    setShowIncomingAudio(false);
    setShowSilenceAlert(false);
    setActivePlaybackScript('');
    setActivePlaybackSpeaker(null);
    setQueuedMemberStepIndex(null);
    setQueuedMemberPlayback(null);
    setMemberTurnState('idle');
    setFeedbackReport(null);
    setSessionPlaybackUrl(null);
    autoStartTurnAttemptKeyRef.current = null;
    silenceStartRef.current = null;
    setCallState('ringing');
    startRingtone(sessionData.ringer_audio_url);
  }, [discardCapture, sessionData, sessionResult?.id, startRingtone]);

  const handleTryAgain = useCallback(async () => {
    if (!sessionData?.session_id || !selectedScenarioId) {
      return;
    }

    const confirmed = window.confirm(
      'Restart this mock call from Step 1? The current in-progress attempt, temporary transcript, and unsaved recording will be cleared.',
    );
    if (!confirmed) {
      return;
    }

    const token = localStorage.getItem('token');
    const scenarioIdToRestart = selectedScenarioId;

    clearAutoConnectTimeout();
    stopBrowserTranscript();
    stopRingtone();
    browserTtsService.stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (cueAudioRef.current) {
      cueAudioRef.current.pause();
      cueAudioRef.current = null;
    }
    if (holdAudioRef.current) {
      holdAudioRef.current.pause();
      holdAudioRef.current.currentTime = 0;
    }
    await discardCapture();

    const response = await fetch(`/api/call-simulation/session/${sessionData.session_id}/discard`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || payload?.message || 'Unable to reset the current call attempt.');
    }

    setSessionData(null);
    setSessionResult(null);
    setMemberAudioWarning(null);
    setCallState('idle');
    setCurrentStepIndex(0);
    setCallTimer(0);
    setLiveTranscript('');
    browserTtsFallbackNoticeRef.current = false;
    recordingFallbackNoticeRef.current = false;
    setIsMuted(false);
    setIsOnHold(false);
    setShowIncomingAudio(false);
    setShowSilenceAlert(false);
    setActivePlaybackScript('');
    setActivePlaybackSpeaker(null);
    setQueuedMemberStepIndex(null);
    setQueuedMemberPlayback(null);
    setMemberTurnState('idle');
    setFeedbackReport(null);
    setSessionPlaybackUrl(null);
    autoStartTurnAttemptKeyRef.current = null;
    silenceStartRef.current = null;

    const nextScenarios = await fetchScenarios();
    const nextScenario = nextScenarios.find((scenario) => scenario.id === scenarioIdToRestart) || null;
    setSelectedScenarioId(scenarioIdToRestart);

    toast.success(payload?.message || 'The current attempt was cleared. Start the call again from Step 1.');
    if (nextScenario) {
      await startSimulation(nextScenario);
    }
  }, [
    clearAutoConnectTimeout,
    discardCapture,
    fetchScenarios,
    selectedScenarioId,
    sessionData?.session_id,
    startSimulation,
    stopBrowserTranscript,
    stopRingtone,
  ]);

  const handleAcknowledgeCoaching = useCallback(async () => {
    if (!sessionResult?.coaching_id) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/certification/coaching/logs/${sessionResult.coaching_id}/acknowledge`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Unable to acknowledge the coaching notes.');
      }

      toast.success('Coaching notes acknowledged.');
      await refreshCurrentSession();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to acknowledge the coaching notes.');
    }
  }, [refreshCurrentSession, sessionResult?.coaching_id]);

  const resetPage = useCallback(async () => {
    stopBrowserTranscript();
    stopRingtone();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (cueAudioRef.current) {
      cueAudioRef.current.pause();
      cueAudioRef.current = null;
    }
    if (holdAudioRef.current) {
      holdAudioRef.current.pause();
      holdAudioRef.current.currentTime = 0;
    }
    browserTtsService.stop();
    await discardCapture();
    setSessionData(null);
    setSessionResult(null);
    setCallState('idle');
    setCurrentStepIndex(0);
    setCallTimer(0);
    setLiveTranscript('');
    setIsMuted(false);
    setIsOnHold(false);
    setShowIncomingAudio(false);
    setShowSilenceAlert(false);
    setActivePlaybackScript('');
    setActivePlaybackSpeaker(null);
    setQueuedMemberStepIndex(null);
    setQueuedMemberPlayback(null);
    setMemberTurnState('idle');
    setFeedbackReport(null);
    setSessionPlaybackUrl(null);
    autoStartTurnAttemptKeyRef.current = null;
    silenceStartRef.current = null;
    await fetchScenarios();
  }, [discardCapture, fetchScenarios, stopBrowserTranscript, stopRingtone]);

  useEffect(() => {
    void fetchScenarios().catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Unable to load scenarios.');
    });

    const synthesizedPlaybackCache = synthesizedPlaybackCacheRef.current;

    return () => {
      clearAutoConnectTimeout();
      stopBrowserTranscript();
      stopRingtone();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (cueAudioRef.current) {
        cueAudioRef.current.pause();
      }
      if (holdAudioRef.current) {
        holdAudioRef.current.pause();
      }
      browserTtsService.stop();
      for (const audioUrl of synthesizedPlaybackCache.values()) {
        if (audioUrl.startsWith('blob:')) {
          window.URL.revokeObjectURL(audioUrl);
        }
      }
      synthesizedPlaybackCache.clear();
      void discardCapture();
    };
  }, [clearAutoConnectTimeout, discardCapture, fetchScenarios, stopBrowserTranscript, stopRingtone]);

  useEffect(() => {
    if (!requestedScenarioId) {
      invalidRequestedScenarioRef.current = null;
      return;
    }

    if (!scenarios.some((scenario) => scenario.id === requestedScenarioId)) {
      if (scenarios.length > 0 && invalidRequestedScenarioRef.current !== requestedScenarioId) {
        invalidRequestedScenarioRef.current = requestedScenarioId;
        toast.error('That call scenario is not assigned to your trainee workspace.');
        router.replace('/trainee/call-simulation');
      }
      return;
    }

    invalidRequestedScenarioRef.current = null;
    setSelectedScenarioId((current) => (current === requestedScenarioId ? current : requestedScenarioId));
  }, [requestedScenarioId, router, scenarios]);

  useEffect(() => {
    let stream: EventSource | null = null;
    try {
      stream = openCallSimulationRealtimeStream();
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (
            payload.type === 'assignment_changed'
            || payload.type === 'session_changed'
            || payload.type === 'certificate_changed'
            || payload.type === 'coaching_changed'
          ) {
            void fetchScenarios().catch(() => undefined);
            if (sessionData?.session_id && callState === 'completed') {
              void refreshCurrentSession().catch(() => undefined);
            }
          }
        } catch {
          // Keep the page usable even if a realtime payload is malformed.
        }
      };
    } catch {
      // Realtime is optional for this page.
    }

    return () => {
      stream?.close();
    };
  }, [callState, fetchScenarios, refreshCurrentSession, sessionData?.session_id]);

  useEffect(() => {
    if (['accepted', 'connected', 'member-speaking', 'csr-speaking', 'processing'].includes(callState)) {
      timerRef.current = setInterval(() => setCallTimer((previous) => previous + 1), 1000);
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return undefined;
  }, [callState]);

  useEffect(() => {
    if (!showIncomingAudio) {
      return;
    }
    const timeoutId = window.setTimeout(
      () => setShowIncomingAudio(false),
      callState === 'accepted' ? 5000 : 2600,
    );
    return () => window.clearTimeout(timeoutId);
  }, [callState, showIncomingAudio]);

  useEffect(() => {
    if (!showIncomingAudio && callState !== 'member-speaking') {
      setActivePlaybackScript('');
      setActivePlaybackSpeaker(null);
    }
  }, [callState, showIncomingAudio]);

  useEffect(() => {
    setCapturePaused(false);
    holdAudioErrorNoticeRef.current = false;

    if (!sessionData?.hold_audio_url) {
      if (holdAudioRef.current) {
        holdAudioRef.current.pause();
        holdAudioRef.current = null;
      }
      return;
    }

    const shouldPlayHoldMusic =
      isOnHold
      && callState !== 'idle'
      && callState !== 'completed'
      && memberTurnState === 'idle';

    if (shouldPlayHoldMusic) {
      let activeHoldAudio = holdAudioRef.current;
      if (!activeHoldAudio) {
        const nextHoldAudio = new Audio();
        nextHoldAudio.crossOrigin = 'anonymous';
        nextHoldAudio.src = sessionData.hold_audio_url;
        nextHoldAudio.onerror = () => {
          if (holdAudioRef.current === nextHoldAudio) {
            holdAudioRef.current.pause();
            holdAudioRef.current = null;
          }
          if (!holdAudioErrorNoticeRef.current) {
            holdAudioErrorNoticeRef.current = true;
            toast.error('Hold audio could not be loaded. The call will continue without custom hold audio.');
          }
        };
        registerPlaybackElement(nextHoldAudio);
        nextHoldAudio.loop = true;
        holdAudioRef.current = nextHoldAudio;
        activeHoldAudio = nextHoldAudio;
      }
      void activeHoldAudio.play().catch(() => undefined);
      return;
    }

    if (holdAudioRef.current) {
      holdAudioRef.current.pause();
      holdAudioRef.current.currentTime = 0;
    }
  }, [callState, isOnHold, memberTurnState, registerPlaybackElement, sessionData?.hold_audio_url, setCapturePaused]);

  useEffect(() => {
    if (callRecorderError) {
      toast.error(callRecorderError);
    }
  }, [callRecorderError]);

  useEffect(() => {
    if (speechToTextError) {
      toast.error(speechToTextError);
    }
  }, [speechToTextError]);

  useEffect(() => {
    const turnKey = sessionData?.session_id && currentStep
      ? `${sessionData.session_id}:${currentStep.step_number}`
      : null;

    if (
      !turnKey
      || !currentStep
      || currentStep.actor !== 'csr'
      || callState !== 'connected'
      || isRecording
      || isProcessing
      || isOnHold
      || isMuted
      || memberTurnState !== 'idle'
      || isEndingCall
      || isUploadingCall
    ) {
      return;
    }

    if (autoStartTurnAttemptKeyRef.current === turnKey) {
      return;
    }
    autoStartTurnAttemptKeyRef.current = turnKey;

    setLiveTranscript('');
    setShowSilenceAlert(false);
    silenceStartRef.current = null;

    void (async () => {
      try {
        await startRecording();
        startBrowserTranscript();
        setCallState('csr-speaking');
      } catch {
        setCallState('connected');
      }
    })();
  }, [
    callState,
    currentStep,
    isEndingCall,
    isMuted,
    isOnHold,
    isProcessing,
    isRecording,
    isUploadingCall,
    memberTurnState,
    sessionData?.session_id,
    startBrowserTranscript,
    startRecording,
  ]);

  useEffect(() => {
    if (
      !currentStep
      || currentStep.actor !== 'csr'
      || isRecording
      || isOnHold
      || callState === 'processing'
      || memberTurnState !== 'idle'
    ) {
      setShowSilenceAlert(false);
      return;
    }
    if (!silenceStartRef.current) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!silenceStartRef.current) {
        setShowSilenceAlert(false);
        return;
      }
      const elapsed = performance.now() - silenceStartRef.current;
      setShowSilenceAlert(elapsed >= 6000);
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [callState, currentStep, isOnHold, isRecording, memberTurnState]);

  const busyStatus = callState !== 'idle' && callState !== 'completed';
  const currentStatus = canResumeMemberTurn
    ? 'Click Unhold To Continue'
    : memberTurnState === 'awaiting-hold'
      ? 'Hold To Play Member Reply'
      : statusLabel(callState, isOnHold);
  const currentStatusNote = callState === 'ringing'
    ? 'The trainer ringer is active. Click Accept Call to begin the mock call.'
    : callState === 'accepted'
      ? 'The line is connected. Your first CSR turn will unlock after the short preparation cue.'
      : canResumeMemberTurn
        ? 'The member reply already played. Click Unhold to reactivate your microphone.'
        : memberTurnState === 'awaiting-hold'
          ? 'Your CSR turn was saved. Click Hold to hear the next member reply.'
          : callState === 'member-speaking'
            ? 'Listen to the Member AI voice. Your microphone is locked until the reply ends.'
            : isRecording
              ? 'You are live on the CSR turn. Click Hold to save the turn and play the member reply.'
              : callState === 'processing'
                ? 'The current turn or final call result is being saved to Supabase.'
                : 'Use the controls below to move through the assigned scenario.';

  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Call Simulations</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Select an assigned scenario, start the mock call, speak as the CSR, then use Hold and Unhold to move through the trainer script.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
            Assigned scenarios only
          </div>
        </div>

        {callState === 'idle' ? (
          requestedScenarioId && selectedScenario ? (
            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
              <Card className="border-slate-200 bg-[linear-gradient(135deg,#f8fafc,white)] shadow-sm">
                <CardHeader className="space-y-4">
                  <Button type="button" variant="ghost" className="w-fit px-0 text-slate-600 hover:text-slate-950" onClick={returnToModuleList}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Assigned Scenarios
                  </Button>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn('border', getScenarioStatusClasses(selectedScenario))}>
                        {getScenarioStatusText(selectedScenario)}
                      </Badge>
                      <Badge variant="outline">Pass at {selectedScenario.passing_score.toFixed(0)}%</Badge>
                    </div>
                    <CardTitle className="text-2xl">{selectedScenario.topic || selectedScenario.title}</CardTitle>
                    {selectedScenario.topic && selectedScenario.topic !== selectedScenario.title ? (
                      <CardDescription className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        {selectedScenario.title}
                      </CardDescription>
                    ) : null}
                    <CardDescription className="max-w-3xl text-sm text-slate-600">
                      {selectedScenario.description || 'Trainer-assigned call scenario.'}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Batch / Wave</div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">
                        {formatBatchWave(selectedScenario.assignment_batch_name, selectedScenario.assignment_wave_number)}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Scenarios</div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">{selectedScenario.scenario_groups_count}</div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Turns</div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">{selectedScenario.steps_count}</div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Attempts</div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">{selectedScenario.attempt_count}</div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Assignment Summary</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white p-4 text-sm text-slate-600">
                        <div className="font-semibold text-slate-950">Trainer</div>
                        <div className="mt-1">{selectedScenario.assigned_by_name || 'Your trainer'}</div>
                      </div>
                      <div className="rounded-2xl bg-white p-4 text-sm text-slate-600">
                        <div className="font-semibold text-slate-950">Latest Score</div>
                        <div className="mt-1">
                          {selectedScenario.latest_score > 0 ? `${selectedScenario.latest_score.toFixed(1)}%` : 'No completed attempt yet'}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white p-4 text-sm text-slate-600">
                        <div className="font-semibold text-slate-950">Assigned</div>
                        <div className="mt-1">
                          {selectedScenario.assigned_at ? new Date(selectedScenario.assigned_at).toLocaleString() : 'Recently assigned'}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white p-4 text-sm text-slate-600">
                        <div className="font-semibold text-slate-950">Latest Completion</div>
                        <div className="mt-1">
                          {selectedScenario.latest_completed_at ? new Date(selectedScenario.latest_completed_at).toLocaleString() : 'Not completed yet'}
                        </div>
                      </div>
                    </div>
                    {selectedScenario.launch_block_reason ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {selectedScenario.launch_block_reason}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-5">
                    <div className="text-xs uppercase tracking-[0.22em] text-cyan-700">How The Call Works</div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      <div className="rounded-2xl bg-white/90 p-4 text-sm text-slate-700">
                        <div className="font-semibold text-slate-950">1. Incoming call</div>
                        <div className="mt-1">The softphone rings first. You accept the line before the opening CSR turn begins.</div>
                      </div>
                      <div className="rounded-2xl bg-white/90 p-4 text-sm text-slate-700">
                        <div className="font-semibold text-slate-950">2. Turn-taking</div>
                        <div className="mt-1">You speak as the CSR, then Hold saves your turn and plays the Member AI response.</div>
                      </div>
                      <div className="rounded-2xl bg-white/90 p-4 text-sm text-slate-700">
                        <div className="font-semibold text-slate-950">3. KPI assessment</div>
                        <div className="mt-1">End Call finalizes the transcript, uploads the recording, scores the scenario, and updates certificates or retakes.</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-slate-950 text-white">
                <CardHeader>
                  <CardTitle>Start The Call</CardTitle>
                  <CardDescription className="text-slate-300">
                    The ringer will play first. Accept the call to start the full recording, then wait for the opening CSR cue.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Agent</div>
                    <div className="mt-2 text-xl font-semibold">{agentName}</div>
                    <div className="mt-3 flex items-center gap-3 text-sm text-slate-300">
                      <span className="inline-flex h-3 w-3 rounded-full bg-emerald-400" />
                      Ready for assigned mock calls
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Ready State</div>
                    <div className="mt-2 text-lg font-semibold text-white">{getScenarioStatusText(selectedScenario)}</div>
                    <div className="mt-2 text-sm text-slate-300">{selectedScenarioLaunchNote}</div>
                  </div>
                  <Button
                    className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    size="lg"
                    onClick={() => void startSimulation(selectedScenario)}
                    disabled={selectedScenarioStartDisabled}
                  >
                    <Phone className="mr-2 h-4 w-4" />
                    {selectedScenarioLaunchLabel}
                  </Button>
                  <Button type="button" variant="outline" className="w-full border-white/15 bg-transparent text-white hover:bg-white/10" onClick={returnToModuleList}>
                    View All Assigned Scenarios
                  </Button>
                  {selectedScenario.competent || selectedScenario.latest_certificate_id ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                      onClick={() => window.location.assign('/trainee/certificates')}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Open Certificates
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
              <Card className="border-slate-200 bg-[linear-gradient(135deg,#f8fafc,white)]">
                <CardHeader>
                  <CardTitle>Assigned Call Scenarios</CardTitle>
                  <CardDescription>Select one trainer-assigned scenario to load it into your mock call workspace.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {scenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className={cn(
                        'rounded-3xl border p-4 transition',
                        selectedScenarioId === scenario.id
                          ? 'border-cyan-300 bg-cyan-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedScenarioId(scenario.id)}
                        className="w-full text-left"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-semibold text-slate-950">{scenario.topic || scenario.title}</div>
                              <Badge variant="outline" className={cn('border', getScenarioStatusClasses(scenario))}>
                                {getScenarioStatusText(scenario)}
                              </Badge>
                            </div>
                            {scenario.topic && scenario.topic !== scenario.title ? (
                              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{scenario.title}</div>
                            ) : null}
                            <div className="text-sm text-slate-600">
                              {scenario.description || 'Assigned call scenario.'}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{scenario.scenario_groups_count} scenarios</Badge>
                            <Badge variant="outline">{scenario.steps_count} turns</Badge>
                          </div>
                        </div>
                      </button>
                      <div className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Batch / Wave</div>
                          <div className="mt-1 font-medium text-slate-900">
                            {formatBatchWave(scenario.assignment_batch_name, scenario.assignment_wave_number)}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Passing Score</div>
                          <div className="mt-1 font-medium text-slate-900">{scenario.passing_score.toFixed(0)}%</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Attempts Used</div>
                          <div className="mt-1 font-medium text-slate-900">{scenario.attempt_count}</div>
                          {typeof scenario.max_attempts === 'number' ? (
                            <div className="mt-1 text-xs text-slate-500">of {scenario.max_attempts} allowed</div>
                          ) : null}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Latest Score</div>
                          <div className="mt-1 font-medium text-slate-900">
                            {scenario.latest_score > 0 ? `${scenario.latest_score.toFixed(1)}%` : 'No score yet'}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>Assigned by {scenario.assigned_by_name || 'your trainer'}</span>
                        {scenario.assigned_at ? <span>Assigned {new Date(scenario.assigned_at).toLocaleString()}</span> : null}
                        {scenario.latest_completed_at ? <span>Completed {new Date(scenario.latest_completed_at).toLocaleString()}</span> : null}
                        {typeof scenario.max_attempts === 'number' ? (
                          <span>{scenario.max_attempts} total attempt{scenario.max_attempts === 1 ? '' : 's'} allowed</span>
                        ) : null}
                        {scenario.can_retake ? (
                          <span className="text-amber-700">
                            {typeof scenario.remaining_attempts === 'number'
                              ? `${scenario.remaining_attempts} retake${scenario.remaining_attempts === 1 ? '' : 's'} left`
                              : 'Retake available'}
                          </span>
                        ) : null}
                      </div>
                      {scenario.launch_block_reason ? (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                          {scenario.launch_block_reason}
                        </div>
                      ) : null}
                      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                        <span>
                          {selectedScenarioId === scenario.id
                            ? 'Selected for the next mock call.'
                            : 'Select this scenario to preview it and start the call.'}
                        </span>
                        {selectedScenarioId === scenario.id ? (
                          <Badge variant="outline" className="border-cyan-300 bg-cyan-50 text-cyan-700">
                            Selected
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {!scenarios.length ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      No call scenario has been assigned to your trainee workspace yet.
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-slate-950 text-white">
                <CardHeader>
                  <CardTitle>Selected Scenario</CardTitle>
                  <CardDescription className="text-slate-300">
                    Review the loaded scenario, then start the call. The trainer ringer will play first, and you will accept the line before the CSR turn begins.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Agent</div>
                    <div className="mt-2 text-xl font-semibold">{agentName}</div>
                    <div className="mt-3 flex items-center gap-3 text-sm text-slate-300">
                      <span className="inline-flex h-3 w-3 rounded-full bg-emerald-400" />
                      Ready to answer assigned calls
                    </div>
                  </div>
                  <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
                    The full mock call is recorded, saved for coaching, scored with KPI rules, and summarized after you end the call.
                  </div>
                  {selectedScenario ? (
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Loaded Module</div>
                      <div className="mt-2 text-lg font-semibold text-white">{selectedScenario.topic || selectedScenario.title}</div>
                      {selectedScenario.topic && selectedScenario.topic !== selectedScenario.title ? (
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{selectedScenario.title}</div>
                      ) : null}
                      <div className="mt-2 text-sm text-slate-300">
                        {selectedScenario.description || 'Trainer-assigned call scenario.'}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                        <span>{formatBatchWave(selectedScenario.assignment_batch_name, selectedScenario.assignment_wave_number)}</span>
                        <span>{selectedScenario.scenario_groups_count} scenarios</span>
                        <span>{selectedScenario.steps_count} turns</span>
                        <span>Pass at {selectedScenario.passing_score.toFixed(0)}%</span>
                        {typeof selectedScenario.max_attempts === 'number' ? (
                          <span>{selectedScenario.max_attempts} total attempt{selectedScenario.max_attempts === 1 ? '' : 's'}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <Button
                    className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    size="lg"
                    onClick={() => void startSimulation()}
                    disabled={!selectedScenarioId || selectedScenarioStartDisabled || isStartingCall}
                  >
                    <Phone className="mr-2 h-4 w-4" />
                    {isStartingCall ? 'Starting Call...' : selectedScenarioLaunchLabel}
                  </Button>
                  <div className="text-xs text-slate-400">
                    {selectedScenarioLaunchNote}
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        ) : null}
        {sessionData && callState !== 'idle' && callState !== 'completed' ? (
          <div className="space-y-5">
            <div className="rounded-[32px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff,#f1f5f9)] p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-4">
                  <span className={cn('inline-flex h-4 w-4 rounded-full ring-4 ring-white', busyStatus ? 'bg-rose-500' : 'bg-emerald-500')} />
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Agent Status</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-950">{agentName}</div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:min-w-0">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Status Timer</div>
                    <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-950">
                      <Clock3 className="h-4 w-4 text-sky-600" />
                      {formatTime(callTimer)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Current Status</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">{currentStatus}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-500">{currentStatusNote}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Call Capture</div>
                    <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-950">
                      <Waves className={cn('h-4 w-4', isRecording ? 'animate-pulse text-emerald-600' : 'text-slate-400')} />
                      {isRecording ? 'CSR Recording Live' : isCapturing ? 'Full Call Recording Live' : isProcessing || isUploadingCall ? 'Processing' : 'Standing By'}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {lastAsrProviderLabel
                        ? `Last confirmed turn: ${lastAsrProviderLabel}${lastTranscriptConfidence !== null ? ` (${lastTranscriptConfidence}% confidence)` : ''}`
                        : 'Confirmed turn metadata appears here after each saved CSR response.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[96px,minmax(0,1fr)] 2xl:grid-cols-[112px,minmax(0,1fr)]">
              <Card className="overflow-hidden border-slate-900 bg-slate-950 text-white">
                <CardContent className="grid gap-3 p-3 sm:grid-cols-3 xl:flex xl:h-full xl:flex-col">
                  <Button
                    type="button"
                    className={cn(
                      'h-20 rounded-3xl border border-white/10 text-white shadow-none',
                      isRecording ? 'bg-emerald-600 hover:bg-emerald-600' : isMicLocked ? 'bg-slate-800 hover:bg-slate-800' : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400',
                    )}
                    onClick={() => void handleMicClick()}
                    disabled={isMicLocked || isRecording}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {isMicLocked ? <Lock className="h-6 w-6" /> : <Mic className={cn('h-6 w-6', isRecording && 'animate-pulse')} />}
                      <span className="text-xs font-medium">
                        {isRecording ? 'Mic Live' : isMicLocked ? 'Mic Locked' : 'Enable Mic'}
                      </span>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-20 rounded-3xl border border-white/10 bg-white/10 text-white hover:bg-white/15"
                    onClick={() => void handleHoldToggle()}
                    disabled={!canUseHoldControl || callState === 'ringing' || callState === 'processing' || isProcessing || memberTurnState === 'playing' || isEndingCall}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {isOnHold ? <PlayCircle className="h-6 w-6" /> : <PauseCircle className="h-6 w-6" />}
                      <span className="text-xs font-medium">{holdControlLabel}</span>
                    </div>
                  </Button>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center text-[11px] leading-5 text-slate-300">
                    {holdControlNote}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className={cn(
                      'h-20 rounded-3xl border border-white/10 text-white hover:bg-white/15',
                      isMuted ? 'bg-rose-500/80 hover:bg-rose-500/80' : 'bg-white/10',
                    )}
                    onClick={() => setIsMuted((previous) => !previous)}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {isMuted ? <MicOff className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
                      <span className="text-xs font-medium">{isMuted ? 'Muted' : 'Mute'}</span>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-20 rounded-3xl border border-white/10 bg-white/10 text-white hover:bg-white/15"
                    onClick={() => void handleReplayInstruction()}
                    disabled={callState === 'ringing' || callState === 'accepted' || callState === 'processing' || isProcessing || memberTurnState === 'playing' || isRecording || isEndingCall}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <RotateCcw className="h-6 w-6" />
                      <span className="text-xs font-medium">Replay</span>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-20 rounded-3xl border border-amber-300/20 bg-amber-400/10 text-white hover:bg-amber-400/20"
                    onClick={() => void handleTryAgain().catch((error) => {
                      toast.error(error instanceof Error ? error.message : 'Unable to restart the current call attempt.');
                    })}
                    disabled={isEndingCall || isUploadingCall || callState === 'processing'}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <RotateCcw className="h-6 w-6" />
                      <span className="text-xs font-medium">Try Again</span>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-20 rounded-3xl sm:col-span-3 xl:mt-auto"
                    onClick={() => void handleEndCallRequest()}
                    disabled={isRecording || isUploadingCall || isEndingCall || callState === 'processing'}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <PhoneOff className="h-6 w-6" />
                      <span className="text-xs font-medium">{isEndingCall || isUploadingCall ? 'Ending...' : 'End Call'}</span>
                    </div>
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-5">
                {callState === 'ringing' ? (
                  <Card className="overflow-hidden border-emerald-200 bg-[linear-gradient(145deg,#f0fdf4,#dcfce7)]">
                    <CardContent className="flex min-h-[260px] flex-col justify-between p-6">
                      <div>
                        <div className="text-xs uppercase tracking-[0.28em] text-emerald-700">Incoming Call</div>
                        <div className="mt-3 text-3xl font-bold text-emerald-950">{currentMemberActorLabel || memberName}</div>
                        <div className="mt-2 text-sm text-emerald-900">{currentScenarioCue || memberIssue}</div>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 text-emerald-800">
                          <PhoneIncoming className="h-10 w-10 animate-pulse" />
                          <div>
                            <div className="text-sm font-semibold">Member AI is calling...</div>
                            <div className="text-xs">Accept the line to stop the ringer, begin the full recording, and unlock the opening CSR step after the short cue.</div>
                          </div>
                        </div>
                        <Button className="bg-emerald-600 hover:bg-emerald-600" onClick={() => void connectCall()}>
                          <Phone className="mr-2 h-4 w-4" />
                          Accept Call
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {isGeneratingMemberAudio ? (
                      <div className="rounded-3xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 shadow-sm">
                        <div className="flex items-center gap-3">
                          <Headphones className="h-5 w-5 animate-pulse text-violet-600" />
                          <div>
                            <div className="font-semibold">Generating Member Audio</div>
                            <div>Gemini is preparing the next Member response.</div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {memberAudioWarning ? (
                      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                          <div>
                            <div className="font-semibold">Member Audio Fallback</div>
                            <div>{memberAudioWarning}</div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {needsHoldForMemberResponse ? (
                      <div className="rounded-3xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 shadow-sm">
                        <div className="flex items-center gap-3">
                          <PauseCircle className="h-5 w-5 text-sky-600" />
                          <div>
                            <div className="font-semibold">Hold Required</div>
                            <div>Click Hold to save your CSR turn, play the Member response, then click Unhold for the next CSR turn.</div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {showIncomingAudio ? (
                      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
                        <div className="flex items-center gap-3">
                          <Headphones className="h-5 w-5 text-amber-600" />
                          <div>
                            <div className="font-semibold">
                              {activePlaybackSpeaker === 'system' ? 'Call Simulation Prompt' : 'Incoming Audio'}
                            </div>
                            <div>
                              {activePlaybackSpeaker === 'system'
                                ? callState === 'accepted'
                                  ? 'The line is accepted. Get ready for the opening CSR cue.'
                                  : 'The platform is asking you to repeat the scripted CSR line before the call can continue.'
                                : 'The Member Actor is speaking. Your mic is temporarily locked.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {showSilenceAlert ? (
                      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 shadow-sm">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-rose-600" />
                          <div>
                            <div className="font-semibold">Silence Alert</div>
                            <div>Seconds matter. Start responding before AHT and dead-air penalties grow.</div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <Card className="border-slate-200 bg-white shadow-sm">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                          <div>
                            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Scenario Queue</div>
                            <div className="mt-2 text-2xl font-semibold text-slate-950">
                              Step {queuePosition} of {steps.length || 1}
                            </div>
                            <div className="mt-2 text-sm text-slate-600">
                              {currentQueueActorLabel} is the active queue focus for this turn.
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <div className="font-semibold text-slate-950">{queueProgressPercent}% through the assigned call</div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">{queueStatusNote}</div>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-cyan-500 transition-all"
                            style={{ width: `${queueProgressPercent}%` }}
                          />
                        </div>
                        <div className="grid gap-3 lg:grid-cols-3">
                          {queuePreviewSteps.map(({ index, step, state }) => (
                            <div
                              key={`${step.step_number}-${state}`}
                              className={cn(
                                'rounded-3xl border p-4 transition',
                                state === 'current'
                                  ? 'border-cyan-200 bg-cyan-50'
                                  : state === 'completed'
                                    ? 'border-emerald-200 bg-emerald-50'
                                    : 'border-slate-200 bg-slate-50',
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Step {index + 1}</div>
                                  <div className="mt-1 text-sm font-semibold text-slate-950">
                                    {step.actor === 'member'
                                      ? String(step.metadata?.actor_name || step.speaker_label || memberName).trim()
                                      : String(step.speaker_label || 'CSR / Trainee').trim()}
                                  </div>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    state === 'current'
                                      ? 'border-cyan-200 bg-cyan-100 text-cyan-800'
                                      : state === 'completed'
                                        ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                                        : 'border-slate-200 bg-white text-slate-600',
                                  )}
                                >
                                  {state === 'current' ? 'Live' : state === 'completed' ? 'Completed' : 'Up Next'}
                                </Badge>
                              </div>
                              <div className="mt-3 max-h-[72px] overflow-hidden text-sm leading-6 text-slate-600">
                                {step.script.trim() || 'No trainer script was saved for this step yet.'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 bg-white shadow-sm">
                      <CardHeader>
                        <CardTitle>Live Call Workspace</CardTitle>
                        <CardDescription>Member profile, queue position, and turn-taking cues from the assigned Supabase scenario.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                              <UserRound className="h-7 w-7" />
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Member</div>
                              <div className="mt-1 text-xl font-semibold text-slate-950">{currentMemberActorLabel || memberName}</div>
                              <div className="text-sm text-slate-500">{currentScenarioCue || memberIssue}</div>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Member ID</div>
                              <div className="mt-2 text-sm font-semibold text-slate-950">{memberId}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Plan Type</div>
                              <div className="mt-2 text-sm font-semibold text-slate-950">{planType}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Verification</div>
                              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-950">
                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                {verificationStatus}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Live Talk Status</div>
                              <div className="mt-2 text-lg font-semibold">
                                {callState === 'accepted'
                                  ? 'Call accepted'
                                  : callState === 'member-speaking'
                                  ? activePlaybackSpeaker === 'system'
                                    ? 'Repeat prompt playing'
                                    : 'Member speaking'
                                  : isRecording
                                    ? 'CSR talking'
                                    : 'CSR ready to speak'}
                              </div>
                            </div>
                            <Badge variant="outline" className="border-white/15 bg-white/10 text-white">
                              Step {queuePosition} of {steps.length || 1}
                            </Badge>
                          </div>
                          <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <Mic className={cn('h-5 w-5', isRecording ? 'animate-pulse text-emerald-400' : 'text-cyan-300')} />
                                  <div>
                                    <div className="text-sm font-semibold">CSR</div>
                                    <div className="text-xs text-slate-300">
                                      {isRecording ? 'Talking now' : currentStep?.actor === 'csr' ? 'Should talk next' : 'Waiting'}
                                    </div>
                                  </div>
                                </div>
                                <span className={cn('inline-flex h-3 w-3 rounded-full', currentStep?.actor === 'csr' || isRecording ? 'bg-emerald-400' : 'bg-slate-500')} />
                              </div>
                              <div className="mt-4">
                                <VoiceActivityBars level={isMuted ? 0 : audioLevel} isActive={isRecording} accent="csr" />
                              </div>
                            </div>
                            <div className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <Headphones className={cn('h-5 w-5', callState === 'member-speaking' ? 'animate-pulse text-amber-300' : 'text-slate-300')} />
                                  <div>
                                    <div className="text-sm font-semibold">Member / AI</div>
                                    <div className="text-xs text-slate-300">
                                      {callState === 'member-speaking'
                                        ? activePlaybackSpeaker === 'system'
                                          ? 'Repeat prompt'
                                          : 'Talking now'
                                        : showIncomingAudio
                                          ? 'Just finished'
                                          : 'Waiting'}
                                    </div>
                                  </div>
                                </div>
                                <span className={cn('inline-flex h-3 w-3 rounded-full', callState === 'member-speaking' || showIncomingAudio ? 'bg-amber-300' : 'bg-slate-500')} />
                              </div>
                              <div className="mt-4">
                                <VoiceActivityBars level={callState === 'member-speaking' || showIncomingAudio ? 0.8 : 0.1} isActive={callState === 'member-speaking' || showIncomingAudio} accent="member" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
        {sessionData && callState === 'completed' ? (
          <div className="space-y-6">
            <Card className="overflow-hidden border-slate-200 bg-[linear-gradient(135deg,#f8fafc,#ffffff)] shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle>Post-Call Wrap Up</CardTitle>
                    <CardDescription>
                      Your mock call is complete. Review the KPI score, Gemini analysis, transcript, and trainer follow-up.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={sessionResult?.pass_fail ? 'default' : 'destructive'}>
                      {sessionResult?.pass_fail ? 'Passed - Ready for coaching' : 'Failed - Retake required'}
                    </Badge>
                    <Badge variant="outline">
                      {sessionResult?.trainer_verdict_status
                        ? sessionResult.trainer_verdict_status === 'competent'
                          ? 'Trainer marked competent'
                          : sessionResult.trainer_verdict_status === 'retake'
                            ? 'Trainer requested retake'
                            : 'Awaiting trainer review'
                        : 'Awaiting trainer review'}
                    </Badge>
                    {sessionResult?.certificate_id ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        Certificate tracked
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Overall score</div>
                    <div className="mt-2 text-3xl font-bold text-slate-950">
                      {sessionResult?.weighted_score?.toFixed(1) ?? '0.0'}%
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Scenario Script Score</div>
                    <div className="mt-2 text-3xl font-bold text-slate-950">
                      {scenarioPointSummary.percent.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {scenarioPointSummary.earned.toFixed(1)} / {scenarioPointSummary.total.toFixed(1)} points
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">AHT</div>
                    <div className="mt-2 text-3xl font-bold text-slate-950">
                      {formatTime(Math.round(sessionResult?.aht_actual || callTimer))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Sentiment</div>
                    <div className="mt-2 text-3xl font-bold text-slate-950">
                      {sentimentDescriptor(sessionResult?.sentiment_score)}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      Score {typeof sessionResult?.sentiment_score === 'number' ? sessionResult.sentiment_score.toFixed(2) : 'pending'}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Dead Air</div>
                    <div className="mt-2 text-3xl font-bold text-slate-950">
                      {sessionResult?.dead_air_seconds?.toFixed(1) ?? '0.0'}s
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Keyword compliance</div>
                    <div className="mt-2 text-3xl font-bold text-slate-950">
                      {Number(sessionResult?.keyword_compliance?.score || 0).toFixed(0)}%
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                  <div className="space-y-5">
                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle>Automatic KPI Insight</CardTitle>
                        <CardDescription>Scoring generated immediately after hang up.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm text-slate-500">Speech Accuracy</div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {sessionResult?.speech_to_text_accuracy?.toFixed(1) ?? '0.0'}%
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm text-slate-500">Grammar</div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {sessionResult?.grammar_score?.toFixed(1) ?? '0.0'}%
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm text-slate-500">Pronunciation</div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {sessionResult?.pronunciation_score?.toFixed(1) ?? '0.0'}%
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm text-slate-500">Pacing</div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {sessionResult?.pacing_score?.toFixed(1) ?? '0.0'}%
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm text-slate-500">Rate of Speech</div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {sessionResult?.rate_of_speech?.toFixed(0) ?? '0'} WPM
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm text-slate-500">Empathy / Probing</div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            {sessionResult?.empathy_statements_count ?? 0} / {sessionResult?.probing_questions_count ?? 0}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle>Keyword Compliance</CardTitle>
                        <CardDescription>Required openings, help phrase, and closing spiel checks.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(sessionResult?.keyword_compliance?.items || []).length ? (
                          (sessionResult?.keyword_compliance?.items || []).map((item) => (
                            <div
                              key={item.id}
                              className={cn(
                                'flex items-center justify-between rounded-2xl border px-4 py-3',
                                item.matched
                                  ? 'border-emerald-200 bg-emerald-50'
                                  : 'border-rose-200 bg-rose-50',
                              )}
                            >
                              <div>
                                <div className="font-medium text-slate-950">{item.label}</div>
                                <div className="text-sm text-slate-600">{item.required_phrase}</div>
                              </div>
                              <div className={cn('flex items-center gap-2 text-sm font-semibold', item.matched ? 'text-emerald-700' : 'text-rose-700')}>
                                {item.matched ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                {item.matched ? 'Matched' : 'Missing'}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                            Keyword compliance details are still being prepared.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-5">
                    <Card className="border-slate-200 bg-slate-950 text-white">
                      <CardHeader>
                        <CardTitle>Trainer Review Status</CardTitle>
                        <CardDescription className="text-slate-300">
                          Trainer decisions, coaching, retake requests, and certificate updates appear here.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                          <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Current decision</div>
                          <div className="mt-2 text-xl font-semibold">
                            {sessionResult?.trainer_verdict_status
                              ? sessionResult.trainer_verdict_status === 'competent'
                                ? 'Mark Competent'
                                : sessionResult.trainer_verdict_status === 'retake'
                                  ? 'Failed'
                                  : 'Pending Review'
                              : 'Pending Review'}
                          </div>
                        </div>
                        {(sessionResult?.trainer_verdict_notes || sessionResult?.coaching_notes) ? (
                          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Trainer coaching notes</div>
                            <div className="mt-3 leading-7">
                              {sessionResult?.trainer_verdict_notes || sessionResult?.coaching_notes}
                            </div>
                          </div>
                        ) : null}
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                          {sessionResult?.coaching_status === 'acknowledged'
                            ? `Coaching acknowledged${sessionResult.coaching_acknowledged_at ? ` on ${new Date(sessionResult.coaching_acknowledged_at).toLocaleString()}` : ''}.`
                            : sessionResult?.coaching_status === 'sent'
                              ? 'Trainer coaching is ready. Review the notes and acknowledge them to close the workflow.'
                              : sessionResult?.certificate_id
                                ? 'Your certificate notification is already connected to the trainee certificates tab.'
                                : sessionResult?.trainer_verdict_status === 'retake'
                                  ? 'Trainer retake requests will reset the scenario workflow and prompt you to try again.'
                                  : 'Once a trainer marks this attempt competent, your certificate badge updates through realtime sync.'}
                        </div>
                        <div className="grid gap-3">
                          {sessionResult?.coaching_id && sessionResult?.coaching_status === 'sent' ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                              onClick={() => void handleAcknowledgeCoaching()}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Acknowledge Coaching
                            </Button>
                          ) : null}
                          <Button type="button" className="bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={() => void resetPage()}>
                            <Phone className="mr-2 h-4 w-4" />
                            Start Another Call
                          </Button>
                          {sessionResult?.certificate_id ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                              onClick={() => void downloadCertificate(sessionResult.certificate_id as string)}
                            >
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Download Certificate
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            className="border-white/15 bg-transparent text-white hover:bg-white/10"
                            onClick={() => window.location.assign('/trainee/certificates')}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Open Certificates
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="border-white/15 bg-transparent text-white hover:bg-white/10"
                            onClick={() => void handleRetake()}
                            disabled={Boolean(sessionResult?.pass_fail) || sessionResult?.coaching_status === 'sent'}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Retake the Call
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {sessionResult?.ai_feedback ? (
                      <Card className="border-slate-200">
                        <CardHeader>
                          <CardTitle>Final AI Feedback</CardTitle>
                          <CardDescription>Immediate coaching summary generated after analysis.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                            {sessionResult.ai_feedback}
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}
                    {isLoadingFeedbackReport ? (
                      <Card className="border-slate-200">
                        <CardHeader>
                          <CardTitle>Gemini AI Evaluation</CardTitle>
                          <CardDescription>Gemini is preparing the structured wrap-up report.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm text-slate-600">
                          Scoring, script matching, grammar notes, pacing analysis, and soft-skill coaching are still processing.
                        </CardContent>
                      </Card>
                    ) : null}
                    {feedbackReport ? (
                      <Card className="border-slate-200">
                        <CardHeader>
                          <CardTitle>Gemini AI Evaluation</CardTitle>
                          <CardDescription>
                            {feedbackReport.provider === 'gemini'
                              ? `Generated with ${feedbackReport.model}.`
                              : 'Generated with the fallback evaluation summary.'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                            <div className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-500">Overall Mock Call Summary</div>
                            {feedbackReport.summary || feedbackReport.overallSummary}
                          </div>
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Overall Score</div>
                                <div className="mt-2 text-2xl font-semibold text-slate-950">
                                  {Number(feedbackReport.overall_score || feedbackReport.totalScore || sessionResult?.weighted_score || 0).toFixed(1)}%
                                </div>
                                <div className="mt-2 text-sm text-slate-600">
                                  {feedbackReport.passed ? 'Passed the KPI threshold.' : 'Did not reach the KPI threshold yet.'}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Conversation Transcript Summary</div>
                                <div className="mt-2 text-sm leading-6 text-slate-700">
                                  {feedbackReport.transcript_summary || 'Transcript summary is still syncing.'}
                                </div>
                              </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Strengths</div>
                                <div className="mt-3 space-y-2 text-sm text-slate-700">
                                  {(feedbackReport.strengths || []).length ? (
                                    feedbackReport.strengths.map((item, index) => (
                                      <div key={`${item}-${index}`}>{item}</div>
                                    ))
                                  ) : (
                                    <div>No strengths were returned yet.</div>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Opportunities for Improvement</div>
                                <div className="mt-3 space-y-2 text-sm text-slate-700">
                                  {(feedbackReport.areas_for_improvement || []).length ? (
                                    feedbackReport.areas_for_improvement.map((item, index) => (
                                      <div key={`${item}-${index}`}>{item}</div>
                                    ))
                                  ) : (
                                    <div>No improvement areas were returned yet.</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Script Accuracy</div>
                              <div className="mt-2 text-xl font-semibold text-slate-950">{feedbackReport.scriptAccuracy.score.toFixed(1)}%</div>
                              <div className="mt-3 text-sm text-slate-600">
                                {(feedbackReport.scriptAccuracy.strengths || []).join(' ') || 'No strengths were flagged yet.'}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Grammar & Pronunciation</div>
                              <div className="mt-2 text-xl font-semibold text-slate-950">{feedbackReport.grammarAndPronunciation.score.toFixed(1)}%</div>
                              <div className="mt-3 text-sm text-slate-600">
                                {(feedbackReport.grammarAndPronunciation.notes || []).join(' ') || 'No extra grammar notes were returned.'}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Soft Skills</div>
                              <div className="mt-2 text-xl font-semibold text-slate-950">{feedbackReport.softSkills.score.toFixed(1)}%</div>
                              <div className="mt-3 text-sm text-slate-600">
                                {(feedbackReport.softSkills.notes || []).join(' ') || 'No extra soft-skill notes were returned.'}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Pacing & AHT</div>
                              <div className="mt-2 text-xl font-semibold text-slate-950">{formatTime(Math.round(feedbackReport.pacingAndAht.ahtSeconds || 0))}</div>
                              <div className="mt-3 text-sm text-slate-600">
                                {(feedbackReport.pacingAndAht.notes || []).join(' ') || 'No extra pacing notes were returned.'}
                              </div>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">KPI-Based Evaluation</div>
                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                              {(feedbackReport.kpi_breakdown || []).length ? (
                                feedbackReport.kpi_breakdown.map((item, index) => (
                                  <div key={`${item.category}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-sm font-semibold text-slate-950">{item.category}</div>
                                      <div className="text-sm font-semibold text-slate-700">{item.score.toFixed(1)}%</div>
                                    </div>
                                    <div className="mt-2 text-sm leading-6 text-slate-600">{item.feedback}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-slate-600">The KPI breakdown is still being prepared.</div>
                              )}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Recommended Coaching Plan</div>
                            <div className="mt-3 text-sm leading-7 text-slate-700">
                              {feedbackReport.coaching_recommendation || 'No coaching recommendation was returned yet.'}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-dashed border-slate-200 p-4">
                            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Additional Coaching Tips</div>
                            <div className="mt-3 space-y-2 text-sm text-slate-700">
                              {(feedbackReport.coachingTips || []).length ? (
                                feedbackReport.coachingTips.map((tip, index) => (
                                  <div key={`${tip}-${index}`}>{tip}</div>
                                ))
                              ) : (
                                <div>No additional coaching tips were returned.</div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}
                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle>Session Recording</CardTitle>
                        <CardDescription>Playback for the full recorded call saved after hang up.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {sessionPlaybackUrl || sessionResult?.audio_url ? (
                          <>
                            <audio controls className="w-full" src={sessionPlaybackUrl || sessionResult?.audio_url || undefined}>
                              Your browser does not support the audio player.
                            </audio>
                            <div className="text-xs text-slate-500">
                              Attempt {sessionResult?.attempt_number || 1}
                              {sessionResult?.max_attempts ? ` of ${sessionResult.max_attempts}` : ''}
                              {sessionResult?.completed_at ? ` - Completed ${new Date(sessionResult.completed_at).toLocaleString()}` : ''}
                            </div>
                          </>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                            The session recording is still syncing to storage.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle>Transcript Preview</CardTitle>
                        <CardDescription>Timeline view of the saved call transcript and per-turn coaching notes.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {summaryTranscriptEntries.length ? (
                          summaryTranscriptEntries.map((entry, index) => (
                            <div key={`${entry.stepNumber}-${entry.actor}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-semibold text-slate-950">
                                  {entry.speakerLabel || entry.actor.toUpperCase()}
                                  {entry.stepNumber ? ` • Step ${entry.stepNumber}` : ''}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {entry.timelineStartSeconds !== null && entry.timelineStartSeconds !== undefined
                                    ? formatTime(Math.round(entry.timelineStartSeconds))
                                    : 'Saved transcript'}
                                </div>
                              </div>
                              <div className="mt-2 text-sm leading-7 text-slate-700">
                                {entry.transcript || 'No transcript captured for this turn.'}
                              </div>
                              {entry.coachNote ? (
                                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                  Coach note: {entry.coachNote}
                                </div>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                            {sessionResult?.transcript || 'The saved transcript preview will appear here once analysis completes.'}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle>Scenario-by-Scenario Feedback</CardTitle>
                        <CardDescription>Each saved CSR turn, its transcript, and the immediate scoring note.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(sessionResult?.turn_logs || []).length ? (
                          (sessionResult?.turn_logs || [])
                            .filter((turn) => String(turn.actor || '').toLowerCase() === 'csr')
                            .map((turn, index) => (
                              <div key={`${turn.turn_attempt_id || turn.step_number || index}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-slate-950">
                                    Step {String(turn.step_number || index + 1)}
                                    {turn.turn_attempt_number ? ` • Attempt ${String(turn.turn_attempt_number)}` : ''}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    Accuracy {Number(turn.speech_to_text_accuracy || 0).toFixed(0)}% • Grammar {Number(turn.grammar_score || 0).toFixed(0)}%
                                  </div>
                                </div>
                                <div className="mt-2 text-sm leading-7 text-slate-700">
                                  {String(turn.transcript || 'No transcript captured.')}
                                </div>
                                {typeof turn.ai_feedback === 'string' && turn.ai_feedback ? (
                                  <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
                                    {String(turn.ai_feedback)}
                                  </div>
                                ) : null}
                                {turn.requires_repeat ? (
                                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    Repeat required: {String(turn.repeat_reason || "The saved turn did not match the scripted spiel closely enough.")}
                                  </div>
                                ) : null}
                              </div>
                            ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                            Per-turn scenario feedback is still being prepared.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

export default function TraineeSimFloorPage() {
  return (
    <Suspense fallback={<TraineeSimFloorPageFallback />}>
      <TraineeSimFloorPageContent />
    </Suspense>
  );
}
