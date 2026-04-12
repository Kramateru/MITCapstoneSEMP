'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import VoiceActivityBars from '@/app/components/trainee/voice-activity-bars';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Progress } from '@/app/components/ui/progress';
import { cn } from '@/app/components/ui/utils';
import { useAuth } from '@/app/context/AuthContext';
import { openSimFloorRealtimeStream } from '@/app/lib/assessment/sim-floor-client';
import { traineeSidebarItems } from '@/app/trainee/nav';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useWavCallRecorder } from '@/hooks/useWavCallRecorder';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
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

type CallState =
  | 'idle'
  | 'ringing'
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
  title: string;
  description?: string | null;
  steps_count: number;
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
}

interface ScenarioStep {
  step_number: number;
  actor: string;
  speaker_label?: string | null;
  script: string;
  expected_keywords: string[];
  audio_url?: string | null;
  is_closing?: boolean;
}

interface SessionData {
  session_id: string;
  scenario_title: string;
  scenario_description?: string | null;
  passing_score: number;
  member_profile: Record<string, unknown>;
  cxone_metadata: Record<string, unknown>;
  sim_floor_config?: Record<string, unknown>;
  ringer_audio_url?: string | null;
  hold_audio_url?: string | null;
  steps: ScenarioStep[];
}

interface KeywordComplianceItem {
  id: string;
  label: string;
  required_phrase: string;
  matched: boolean;
}

interface SessionResult {
  id: string;
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
  trainer_verdict_status?: string;
  certificate_id?: string | null;
}

interface SessionRealtimePayload extends SessionResult {
  status?: string;
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

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function normalizeWord(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9']/g, '');
}

function buildScriptProgress(script: string, transcript: string) {
  const scriptWords = script.split(/\s+/).filter(Boolean);
  const transcriptWords = transcript.split(/\s+/).map(normalizeWord).filter(Boolean);
  let cursor = 0;
  let matchedCount = 0;

  const items = scriptWords.map((word) => {
    const expected = normalizeWord(word);
    if (!expected) {
      return { word, matched: false };
    }

    let matched = false;
    for (let index = cursor; index < transcriptWords.length; index += 1) {
      const candidate = transcriptWords[index];
      if (candidate === expected || candidate.includes(expected) || expected.includes(candidate)) {
        matched = true;
        cursor = index + 1;
        matchedCount += 1;
        break;
      }
    }

    return { word, matched };
  });

  const comparableWordCount = items.filter((item) => normalizeWord(item.word)).length || 1;
  return { items, percent: Math.round((matchedCount / comparableWordCount) * 100) };
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
  if (callState === 'ringing') return 'Incoming Call';
  if (callState === 'member-speaking') return 'Busy - Member Audio';
  if (callState === 'csr-speaking') return 'Busy - Mock Call';
  if (callState === 'processing') return 'Post-Call Analysis';
  if (callState === 'completed') return 'Wrap Up';
  if (callState === 'idle') return 'Available';
  return 'Connected';
}

export default function TraineeSimFloorPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [callTimer, setCallTimer] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [showIncomingAudio, setShowIncomingAudio] = useState(false);
  const [showSilenceAlert, setShowSilenceAlert] = useState(false);
  const [isUploadingCall, setIsUploadingCall] = useState(false);
  const [activePlaybackScript, setActivePlaybackScript] = useState('');
  const [activePlaybackSpeaker, setActivePlaybackSpeaker] = useState<'member' | 'system' | null>(null);
  const requestedScenarioId = searchParams.get('scenarioId')?.trim() || '';

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);
  const holdAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const silenceStartRef = useRef<number | null>(null);

  const steps = useMemo(
    () => [...(sessionData?.steps || [])].sort((left, right) => left.step_number - right.step_number),
    [sessionData?.steps],
  );
  const currentStep = steps[currentStepIndex] || null;
  const memberName = String(sessionData?.member_profile?.name || sessionData?.cxone_metadata?.member_name || 'Scenario Member');
  const memberId = String(sessionData?.member_profile?.member_id || sessionData?.cxone_metadata?.member_id || 'SIM-001');
  const planType = String(sessionData?.member_profile?.plan_type || sessionData?.cxone_metadata?.plan_type || 'Healthy Benefits Plus');
  const verificationStatus = String(
    sessionData?.member_profile?.verification_status || sessionData?.cxone_metadata?.verification_status || 'Pending verification',
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

  const scriptProgress = useMemo(
    () => buildScriptProgress(currentStep?.script || '', liveTranscript),
    [currentStep?.script, liveTranscript],
  );
  const lastAsrProviderLabel = getAsrProviderLabel(lastTurnResult?.asr_provider, lastTurnResult?.asr_provider_label);
  const lastTranscriptConfidence =
    typeof lastTurnResult?.transcript_confidence === 'number' ? Math.round(lastTurnResult.transcript_confidence * 100) : null;

  const isMicLocked =
    callState === 'ringing' ||
    callState === 'member-speaking' ||
    callState === 'processing' ||
    isOnHold;

  const fetchScenarios = useCallback(async () => {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/sim-floor/available', {
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
  }, [requestedScenarioId]);

  const refreshCurrentSession = useCallback(async () => {
    if (!sessionData?.session_id) {
      return;
    }

    const token = localStorage.getItem('token');
    const response = await fetch(`/api/sim-floor/session/${sessionData.session_id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as SessionRealtimePayload | null;
    if (!response.ok || !payload) {
      return;
    }

    setSessionResult({
      id: payload.id,
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
      trainer_verdict_status: payload.trainer_verdict_status,
      certificate_id: payload.certificate_id,
    });

    if (payload.status === 'completed' || payload.status === 'failed') {
      setCallState('completed');
    }
  }, [sessionData?.session_id]);

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

  const startRingtone = useCallback(
    (audioUrl?: string | null) => {
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.loop = true;
        ringtoneAudioRef.current = audio;
        void audio.play().catch(() => {
          ringtoneAudioRef.current = null;
          playRingBurst();
          ringtoneIntervalRef.current = setInterval(playRingBurst, 1900);
        });
        return;
      }

      playRingBurst();
      ringtoneIntervalRef.current = setInterval(playRingBurst, 1900);
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

  const playPlaybackPrompt = useCallback(
    async ({
      script,
      audioUrl,
      speaker,
    }: {
      script: string;
      audioUrl?: string | null;
      speaker: 'member' | 'system';
    }) => {
      setActivePlaybackScript(script);
      setActivePlaybackSpeaker(speaker);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      if (audioUrl) {
        await new Promise<void>((resolve) => {
          const audio = new Audio();
          audio.crossOrigin = 'anonymous';
          audio.src = audioUrl;
          registerPlaybackElement(audio);
          audioRef.current = audio;
          audio.onended = () => {
            if (audioRef.current === audio) {
              audioRef.current = null;
            }
            resolve();
          };
          audio.onerror = () => {
            if (audioRef.current === audio) {
              audioRef.current = null;
            }
            resolve();
          };
          void audio.play().catch(() => {
            if (audioRef.current === audio) {
              audioRef.current = null;
            }
            resolve();
          });
        });
        return;
      }

      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(script);
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
    },
    [registerPlaybackElement],
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
    formData.append('file', recording.blob, `session-${sessionData.session_id}.wav`);

    setIsUploadingCall(true);
    try {
      const response = await fetch(`/api/sim-floor/session/${sessionData.session_id}/recording`, {
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

  const finalizeSession = useCallback(async () => {
    if (!sessionData?.session_id) {
      return;
    }

    const token = localStorage.getItem('token');
    setCallState('processing');
    stopBrowserTranscript();

    try {
      await uploadFinalCallRecording();
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : 'Unable to upload the final call recording.');
    }

    const response = await fetch(`/api/sim-floor/session/${sessionData.session_id}/finalize`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const payload = (await response.json().catch(() => null)) as SessionRealtimePayload | { detail?: string } | null;
    if (!response.ok || !payload || !('id' in payload)) {
      throw new Error((payload && 'detail' in payload && payload.detail) || 'Unable to finalize the mock call.');
    }

    setSessionResult({
      id: payload.id,
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
      trainer_verdict_status: payload.trainer_verdict_status,
      certificate_id: payload.certificate_id,
    });
    setActivePlaybackScript('');
    setActivePlaybackSpeaker(null);
    setCallState('completed');
    await fetchScenarios().catch(() => undefined);

    if (payload.certificate_id) {
      toast.success('Competency certificate is now being tracked in your certificates tab.');
    }
  }, [fetchScenarios, sessionData?.session_id, stopBrowserTranscript, uploadFinalCallRecording]);

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
        });

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
    [finalizeSession, playPlaybackPrompt, steps],
  );

  const startSimulation = useCallback(async () => {
    if (!selectedScenarioId || !isAvailable) {
      toast.error('Select a scenario and set your status to Available first.');
      return;
    }

    const token = localStorage.getItem('token');
    const response = await fetch('/api/sim-floor/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ scenario_id: selectedScenarioId }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to start the scenario.');
    }

    setSessionData(payload as SessionData);
    setSessionResult(null);
    setLiveTranscript('');
    setCurrentStepIndex(0);
    setCallTimer(0);
    setIsMuted(false);
    setIsOnHold(false);
    setShowIncomingAudio(false);
    setShowSilenceAlert(false);
    setActivePlaybackScript('');
    setActivePlaybackSpeaker(null);
    silenceStartRef.current = null;
    setCallState('ringing');
    startRingtone((payload as SessionData).ringer_audio_url);
  }, [isAvailable, selectedScenarioId, startRingtone]);

  const acceptCall = useCallback(async () => {
    await Promise.all([fadeOutRingtone(), startCapture()]);
    await moveToStep(0);
  }, [fadeOutRingtone, moveToStep, startCapture]);

  const handleMicClick = useCallback(async () => {
    if (!currentStep || currentStep.actor !== 'csr') {
      return;
    }
    if (isMuted) {
      toast.error('Unmute your line before speaking.');
      return;
    }
    if (isOnHold) {
      toast.error('Resume the call before recording.');
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
      await startRecording();
      startBrowserTranscript();
      setCallState('csr-speaking');
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

      setLiveTranscript(result.transcript || '');
      toast.success(
        result.requires_repeat
          ? `Turn ${result.step_number} saved. Repeat the spiel before the call can continue.`
          : `Turn ${result.step_number} saved to Sim Floor.`,
      );

      if (result.requires_repeat) {
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
      await moveToStep(nextIndex >= 0 ? nextIndex : currentStepIndex + 1);
    } catch (recordError) {
      toast.error(recordError instanceof Error ? recordError.message : 'Unable to process the recording.');
      setCallState('connected');
    }
  }, [
    callState,
    currentStep,
    currentStepIndex,
    finalizeSession,
    isMuted,
    isOnHold,
    isRecording,
    liveTranscript,
    moveToStep,
    playPlaybackPrompt,
    startBrowserTranscript,
    startRecording,
    steps,
    stopBrowserTranscript,
    stopRecording,
  ]);

  const handleRetake = useCallback(async () => {
    if (!sessionResult?.id || !sessionData) {
      return;
    }

    const token = localStorage.getItem('token');
    const response = await fetch(`/api/sim-floor/session/${sessionResult.id}/retake`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to retake the scenario.');
    }

    await discardCapture();
    setSessionData({ ...sessionData, session_id: payload.id || sessionData.session_id });
    setSessionResult(null);
    setCurrentStepIndex(0);
    setCallTimer(0);
    setLiveTranscript('');
    setIsMuted(false);
    setIsOnHold(false);
    setShowIncomingAudio(false);
    setShowSilenceAlert(false);
    setActivePlaybackScript('');
    setActivePlaybackSpeaker(null);
    silenceStartRef.current = null;
    setCallState('ringing');
    startRingtone(sessionData.ringer_audio_url);
  }, [discardCapture, sessionData, sessionResult?.id, startRingtone]);

  const resetPage = useCallback(async () => {
    stopBrowserTranscript();
    stopRingtone();
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
    silenceStartRef.current = null;
    await fetchScenarios();
  }, [discardCapture, fetchScenarios, stopBrowserTranscript, stopRingtone]);

  useEffect(() => {
    void fetchScenarios().catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Unable to load scenarios.');
    });

    return () => {
      stopBrowserTranscript();
      stopRingtone();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (holdAudioRef.current) {
        holdAudioRef.current.pause();
      }
      window.speechSynthesis.cancel();
      void discardCapture();
    };
  }, [discardCapture, fetchScenarios, stopBrowserTranscript, stopRingtone]);

  useEffect(() => {
    if (!requestedScenarioId || !scenarios.some((scenario) => scenario.id === requestedScenarioId)) {
      return;
    }

    setSelectedScenarioId((current) => (current === requestedScenarioId ? current : requestedScenarioId));
  }, [requestedScenarioId, scenarios]);

  useEffect(() => {
    let stream: EventSource | null = null;
    try {
      stream = openSimFloorRealtimeStream();
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (
            payload.type === 'assignment_changed'
            || payload.type === 'session_changed'
            || payload.type === 'certificate_changed'
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
    if (['connected', 'member-speaking', 'csr-speaking', 'processing'].includes(callState)) {
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
    const timeoutId = window.setTimeout(() => setShowIncomingAudio(false), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [showIncomingAudio]);

  useEffect(() => {
    if (!showIncomingAudio && callState !== 'member-speaking') {
      setActivePlaybackScript('');
      setActivePlaybackSpeaker(null);
    }
  }, [callState, showIncomingAudio]);

  useEffect(() => {
    setCapturePaused(isOnHold);

    if (!sessionData?.hold_audio_url) {
      if (holdAudioRef.current) {
        holdAudioRef.current.pause();
        holdAudioRef.current = null;
      }
      return;
    }

    if (isOnHold && callState !== 'idle' && callState !== 'completed') {
      let activeHoldAudio = holdAudioRef.current;
      if (!activeHoldAudio) {
        const nextHoldAudio = new Audio();
        nextHoldAudio.crossOrigin = 'anonymous';
        nextHoldAudio.src = sessionData.hold_audio_url;
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
  }, [callState, isOnHold, registerPlaybackElement, sessionData?.hold_audio_url, setCapturePaused]);

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
    if (!currentStep || currentStep.actor !== 'csr' || isRecording || isOnHold || callState === 'processing') {
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
  }, [callState, currentStep, isOnHold, isRecording]);

  const busyStatus = callState !== 'idle' && callState !== 'completed';
  const currentStatus = isAvailable && callState === 'idle' ? 'Available' : statusLabel(callState, isOnHold);

  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Sim Floor MAX</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Practice in a softphone-style mock-call floor with live voice activity, script confirmation, Supabase-backed recordings,
              and trainer coaching visibility.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setIsAvailable((previous) => !previous)}>
            {isAvailable ? 'Set Busy' : 'Set Available'}
          </Button>
        </div>

        {callState === 'idle' ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <Card className="border-slate-200 bg-[linear-gradient(135deg,#f8fafc,white)]">
              <CardHeader>
                <CardTitle>Assigned Mock Calls</CardTitle>
                <CardDescription>Choose the trainer-assigned mock call that should ring into your MAX workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => setSelectedScenarioId(scenario.id)}
                    className={cn(
                      'w-full rounded-3xl border p-4 text-left transition',
                      selectedScenarioId === scenario.id
                        ? 'border-cyan-300 bg-cyan-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{scenario.title}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {scenario.description || 'Assigned Sim Floor scenario.'}
                        </div>
                      </div>
                      <Badge variant="outline">{scenario.steps_count} turns</Badge>
                    </div>
                    {scenario.assigned_batches?.length ? (
                      <div className="mt-2 text-xs text-sky-700">
                        Assigned to {scenario.assigned_batches.map((batch) => batch.batch_name).join(', ')}
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>
                        Assigned by {scenario.assigned_by_name || 'your trainer'}
                      </span>
                      {scenario.assignment_batch_name ? (
                        <span>Batch: {scenario.assignment_batch_name}</span>
                      ) : null}
                      {scenario.assigned_at ? (
                        <span>Assigned {new Date(scenario.assigned_at).toLocaleString()}</span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{scenario.assignment_id ? 'Assignment synced to Supabase' : 'Trainer assigned'}</span>
                      <span>Attempts: {scenario.attempt_count}</span>
                      {scenario.retake_required ? <span className="text-rose-600">Retake required</span> : null}
                      {scenario.competent ? <span className="text-emerald-700">Competent</span> : null}
                      {scenario.latest_score ? <span>Latest {scenario.latest_score.toFixed(1)}%</span> : null}
                    </div>
                  </button>
                ))}
                {!scenarios.length ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No Sim Floor mock call has been assigned to your trainee workspace yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-slate-950 text-white">
              <CardHeader>
                <CardTitle>Ready Check</CardTitle>
                <CardDescription className="text-slate-300">
                  Stay Available, start the simulation, answer the ring, then respond when the member finishes speaking.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Agent</div>
                  <div className="mt-2 text-xl font-semibold">{agentName}</div>
                  <div className="mt-3 flex items-center gap-3 text-sm text-slate-300">
                    <span className={cn('inline-flex h-3 w-3 rounded-full', isAvailable ? 'bg-emerald-400' : 'bg-rose-400')} />
                    {isAvailable ? 'Available' : 'Busy'}
                  </div>
                </div>
                <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
                  Google-first ASR scoring, Supabase recording storage, scripted turn guidance, and trainer playback are all wired into this flow.
                </div>
                {selectedScenario ? (
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.26em] text-slate-400">Loaded Mock Call</div>
                    <div className="mt-2 text-lg font-semibold text-white">{selectedScenario.title}</div>
                    <div className="mt-2 text-sm text-slate-300">
                      {selectedScenario.description || 'Trainer-assigned Sim Floor mock call.'}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                      {selectedScenario.assignment_batch_name ? <span>Batch: {selectedScenario.assignment_batch_name}</span> : null}
                      {selectedScenario.assigned_by_name ? <span>Assigned by {selectedScenario.assigned_by_name}</span> : null}
                      <span>{selectedScenario.steps_count} turns</span>
                      {selectedScenario.retake_required ? <span className="text-amber-300">Retake required</span> : null}
                    </div>
                  </div>
                ) : null}
                <Button
                  className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                  size="lg"
                  onClick={() => void startSimulation()}
                  disabled={!selectedScenarioId || !isAvailable}
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Launch MAX Workspace
                </Button>
              </CardContent>
            </Card>
          </div>
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
                <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
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
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">ASR State</div>
                    <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-950">
                      <Waves className={cn('h-4 w-4', isRecording ? 'animate-pulse text-emerald-600' : 'text-slate-400')} />
                      {isRecording ? 'Google ASR Listening' : isProcessing || isUploadingCall ? 'Processing' : 'Standing By'}
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

            <div className="grid gap-6 xl:grid-cols-[112px,1fr,360px]">
              <Card className="overflow-hidden border-slate-900 bg-slate-950 text-white">
                <CardContent className="flex h-full flex-col gap-3 p-3">
                  <Button
                    type="button"
                    className={cn(
                      'h-20 rounded-3xl border border-white/10 text-white shadow-none',
                      isRecording ? 'bg-emerald-600 hover:bg-emerald-600' : isMicLocked ? 'bg-slate-800 hover:bg-slate-800' : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400',
                    )}
                    onClick={() => void handleMicClick()}
                    disabled={isMicLocked}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {isMicLocked ? <Lock className="h-6 w-6" /> : <Mic className={cn('h-6 w-6', isRecording && 'animate-pulse')} />}
                      <span className="text-xs font-medium">{isRecording ? 'Listening' : 'Mic'}</span>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-20 rounded-3xl border border-white/10 bg-white/10 text-white hover:bg-white/15"
                    onClick={() => setIsOnHold((previous) => !previous)}
                    disabled={isRecording || callState === 'member-speaking' || callState === 'ringing'}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {isOnHold ? <PlayCircle className="h-6 w-6" /> : <PauseCircle className="h-6 w-6" />}
                      <span className="text-xs font-medium">{isOnHold ? 'Resume' : 'Hold'}</span>
                    </div>
                  </Button>
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
                    variant="destructive"
                    className="mt-auto h-20 rounded-3xl"
                    onClick={() => void finalizeSession()}
                    disabled={isRecording || isUploadingCall}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <PhoneOff className="h-6 w-6" />
                      <span className="text-xs font-medium">Hang Up</span>
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
                        <div className="mt-3 text-3xl font-bold text-emerald-950">{memberName}</div>
                        <div className="mt-2 text-sm text-emerald-900">{memberIssue}</div>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 text-emerald-800">
                          <PhoneIncoming className="h-10 w-10 animate-pulse" />
                          <div>
                            <div className="text-sm font-semibold">MAX call waiting</div>
                            <div className="text-xs">Answer to launch the active interaction panel.</div>
                          </div>
                        </div>
                        <Button className="bg-emerald-600 hover:bg-emerald-600" onClick={() => void acceptCall()}>
                          <Phone className="mr-2 h-4 w-4" />
                          Accept
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {showIncomingAudio ? (
                      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
                        <div className="flex items-center gap-3">
                          <Headphones className="h-5 w-5 text-amber-600" />
                          <div>
                            <div className="font-semibold">
                              {activePlaybackSpeaker === 'system' ? 'Sim Floor Prompt' : 'Incoming Audio'}
                            </div>
                            <div>
                              {activePlaybackSpeaker === 'system'
                                ? 'The platform is asking you to repeat the scripted CSR line before the call can continue.'
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
                      <CardHeader>
                        <CardTitle>Member Card</CardTitle>
                        <CardDescription>Live customer context and actor cues from the assigned scenario.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                              <UserRound className="h-7 w-7" />
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Member</div>
                              <div className="mt-1 text-xl font-semibold text-slate-950">{memberName}</div>
                              <div className="text-sm text-slate-500">{memberIssue}</div>
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
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Sim Floor Icons</div>
                              <div className="mt-2 text-lg font-semibold">
                                {callState === 'member-speaking'
                                  ? activePlaybackSpeaker === 'system'
                                    ? 'Sim Floor prompt active'
                                    : 'Member Actor talking'
                                  : isRecording
                                    ? 'CSR talking'
                                    : 'CSR ready to speak'}
                              </div>
                            </div>
                            <Badge variant="outline" className="border-white/15 bg-white/10 text-white">
                              Turn {Math.min(currentStepIndex + 1, steps.length)} / {steps.length || 1}
                            </Badge>
                          </div>
                          <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <Mic className={cn('h-5 w-5', isRecording ? 'animate-pulse text-emerald-400' : 'text-cyan-300')} />
                                  <div>
                                    <div className="text-sm font-semibold">CSR Icon</div>
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
                                    <div className="text-sm font-semibold">Member Actor Icon</div>
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
                    <div className="grid gap-5 lg:grid-cols-[1.05fr,0.95fr]">
                      <Card className="border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                          <CardTitle>Scripting Assistant</CardTitle>
                          <CardDescription>Required spiel text turns green as speech is confirmed.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <Progress value={scriptProgress.percent} className="h-2.5" />
                          <div className="rounded-2xl bg-slate-50 p-4 text-base leading-8 text-slate-700">
                            {currentStep?.script ? (
                              scriptProgress.items.map((item, index) => (
                                <span key={`${item.word}-${index}`} className={cn('mr-1 inline', item.matched ? 'font-semibold text-emerald-600' : 'text-slate-500')}>
                                  {item.word}
                                </span>
                              ))
                            ) : (
                              <span>No active spiel loaded.</span>
                            )}
                          </div>
                          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
                            Live transcript
                            <div className="mt-2 rounded-2xl bg-slate-100 p-3 text-slate-800">
                              {liveTranscript || 'Your recognized speech will appear here while Google ASR confirms the turn.'}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              {lastAsrProviderLabel
                                ? `Saved using ${lastAsrProviderLabel}${lastTranscriptConfidence !== null ? ` at ${lastTranscriptConfidence}% confidence` : ''}.`
                                : 'Browser transcript guidance appears live, then the saved turn is confirmed by the backend ASR pipeline.'}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                          <CardTitle>Member Response Overlay</CardTitle>
                          <CardDescription>The actor script shows on screen while audio is playing.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">On-screen actor script</div>
                            <div className="mt-3 min-h-[168px] rounded-2xl bg-slate-950 p-4 text-sm leading-7 text-slate-100">
                              {callState === 'member-speaking' || showIncomingAudio
                                ? activePlaybackScript || 'Incoming audio is loading.'
                                : 'No active member audio yet.'}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                            {isOnHold
                              ? 'Hold music is active and full-call recording is paused.'
                              : activePlaybackSpeaker === 'system'
                                ? 'If the saved turn does not match the scripted spiel closely enough, Sim Floor asks for a repeat and keeps the same CSR step active.'
                                : 'Hanging up uploads the full call, finalizes the transcript, and calculates sentiment, keyword compliance, and AHT.'}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-5">
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Floor Presence</CardTitle>
                    <CardDescription>Visual cue cards for the CSR and Member Actor.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      {isRecording
                        ? 'CSR talk icon is live and Google ASR is actively listening.'
                        : currentStep?.actor === 'csr'
                          ? 'CSR icon shows it is your turn to speak.'
                          : 'CSR icon is waiting for the next member cue.'}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      {callState === 'member-speaking'
                        ? activePlaybackSpeaker === 'system'
                          ? 'Sim Floor is playing a repeat prompt because the last saved CSR turn did not match the expected spiel.'
                          : 'Member Actor icon is active while scripted audio is playing.'
                        : 'Member Actor icon lights up whenever incoming audio or script overlay is active.'}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Session Signals</CardTitle>
                    <CardDescription>Realism controls that directly affect the mock call.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-600">Mute</span>
                      <span className={cn('font-semibold', isMuted ? 'text-rose-600' : 'text-slate-900')}>{isMuted ? 'Enabled' : 'Off'}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-600">Hold</span>
                      <span className={cn('font-semibold', isOnHold ? 'text-amber-600' : 'text-slate-900')}>{isOnHold ? 'Hold music active' : 'Live line'}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-600">Recording</span>
                      <span className={cn('font-semibold', isCapturing ? 'text-emerald-600' : 'text-slate-900')}>{isCapturing ? 'Full call captured' : 'Not started'}</span>
                    </div>
                  </CardContent>
                </Card>
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
                      MAX session closed. Review the immediate KPI insight, compliance, and trainer outcome tracking.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={sessionResult?.pass_fail ? 'default' : 'destructive'}>
                      {sessionResult?.pass_fail ? 'Pass' : 'Needs work'}
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
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Overall score</div>
                    <div className="mt-2 text-3xl font-bold text-slate-950">
                      {sessionResult?.weighted_score?.toFixed(1) ?? '0.0'}%
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
                        <CardTitle>Trainer Decision Block</CardTitle>
                        <CardDescription className="text-slate-300">
                          Realtime trainer decisions will update your certificate and retake state here.
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
                                  ? 'Needs Retake'
                                  : 'Pending Review'
                              : 'Pending Review'}
                          </div>
                        </div>
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                          {sessionResult?.certificate_id
                            ? 'Your certificate notification is already connected to the trainee certificates tab.'
                            : sessionResult?.trainer_verdict_status === 'retake'
                              ? 'Trainer retake requests will reset the scenario workflow and prompt you to try again.'
                              : 'Once a trainer marks this attempt competent, your certificate badge updates through realtime sync.'}
                        </div>
                        <div className="grid gap-3">
                          <Button type="button" className="bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={() => void resetPage()}>
                            <Phone className="mr-2 h-4 w-4" />
                            Start Another Call
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="border-white/15 bg-transparent text-white hover:bg-white/10"
                            onClick={() => window.location.assign('/trainee/reports?tab=certificates')}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Open Certificates
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="border-white/15 bg-transparent text-white hover:bg-white/10"
                            onClick={() => void handleRetake()}
                            disabled={sessionResult?.trainer_verdict_status !== 'retake'}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Retake Scenario
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {sessionResult?.ai_feedback ? (
                      <Card className="border-slate-200">
                        <CardHeader>
                          <CardTitle>AI Feedback</CardTitle>
                          <CardDescription>Immediate coaching summary generated after analysis.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                            {sessionResult.ai_feedback}
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}
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

/*
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
                <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
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
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">ASR State</div>
                    <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-950">
                      <Waves className={cn('h-4 w-4', isRecording ? 'animate-pulse text-emerald-600' : 'text-slate-400')} />
                      {isRecording ? 'Google ASR Listening' : isProcessing || isUploadingCall ? 'Processing' : 'Standing By'}
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

            <div className="grid gap-6 xl:grid-cols-[112px,1fr,360px]">
              <Card className="overflow-hidden border-slate-900 bg-slate-950 text-white">
                <CardContent className="flex h-full flex-col gap-3 p-3">
                  <Button
                    type="button"
                    className={cn(
                      'h-20 rounded-3xl border border-white/10 text-white shadow-none',
                      isRecording ? 'bg-emerald-600 hover:bg-emerald-600' : isMicLocked ? 'bg-slate-800 hover:bg-slate-800' : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400',
                    )}
                    onClick={() => void handleMicClick()}
                    disabled={isMicLocked}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {isMicLocked ? <Lock className="h-6 w-6" /> : <Mic className={cn('h-6 w-6', isRecording && 'animate-pulse')} />}
                      <span className="text-xs font-medium">{isRecording ? 'Listening' : 'Mic'}</span>
                    </div>
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    className="h-20 rounded-3xl border border-white/10 bg-white/10 text-white hover:bg-white/15"
                    onClick={() => setIsOnHold((previous) => !previous)}
                    disabled={isRecording || callState === 'member-speaking' || callState === 'ringing'}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {isOnHold ? <PlayCircle className="h-6 w-6" /> : <PauseCircle className="h-6 w-6" />}
                      <span className="text-xs font-medium">{isOnHold ? 'Resume' : 'Hold'}</span>
                    </div>
                  </Button>

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
                    variant="destructive"
                    className="mt-auto h-20 rounded-3xl"
                    onClick={() => void finalizeSession()}
                    disabled={isRecording || isUploadingCall}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <PhoneOff className="h-6 w-6" />
                      <span className="text-xs font-medium">Hang Up</span>
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
                        <div className="mt-3 text-3xl font-bold text-emerald-950">{memberName}</div>
                        <div className="mt-2 text-sm text-emerald-900">{memberIssue}</div>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 text-emerald-800">
                          <PhoneIncoming className="h-10 w-10 animate-pulse" />
                          <div>
                            <div className="text-sm font-semibold">MAX call waiting</div>
                            <div className="text-xs">Answer to launch the active interaction panel.</div>
                          </div>
                        </div>
                        <Button className="bg-emerald-600 hover:bg-emerald-600" onClick={() => void acceptCall()}>
                          <Phone className="mr-2 h-4 w-4" />
                          Accept
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {showIncomingAudio ? (
                      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
                        <div className="flex items-center gap-3">
                          <Headphones className="h-5 w-5 text-amber-600" />
                          <div>
                            <div className="font-semibold">Incoming Audio</div>
                            <div>The Member Actor is speaking. Your mic is temporarily locked.</div>
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

                    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
                      <CardHeader className="border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc,#eef2ff)]">
                        <CardTitle>Member Card</CardTitle>
                        <CardDescription>Live customer context from the assigned Sim Floor scenario.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 p-6 lg:grid-cols-[1.15fr,0.85fr]">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                              <UserRound className="h-7 w-7" />
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Member</div>
                              <div className="mt-1 text-xl font-semibold text-slate-950">{memberName}</div>
                              <div className="text-sm text-slate-500">{memberIssue}</div>
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

                        <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Talk State</div>
                              <div className="mt-2 text-lg font-semibold">
                                {callState === 'member-speaking'
                                  ? 'Member Actor talking'
                                  : isRecording
                                    ? 'CSR live on mic'
                                    : currentStep?.actor === 'csr'
                                      ? 'CSR queued to speak'
                                      : 'Waiting for next cue'}
                              </div>
                            </div>
                            <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                              Turn {Math.min(currentStepIndex + 1, steps.length)} / {steps.length || 1}
                            </Badge>
                          </div>
                          <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <div
                              className={cn(
                                'rounded-3xl border p-4 transition',
                                currentStep?.actor === 'csr' || isRecording
                                  ? 'border-cyan-400/40 bg-cyan-400/10'
                                  : 'border-white/10 bg-white/5',
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cn(
                                      'flex h-11 w-11 items-center justify-center rounded-2xl',
                                      isRecording
                                        ? 'bg-emerald-500 text-white'
                                        : currentStep?.actor === 'csr'
                                          ? 'bg-cyan-500 text-slate-950'
                                          : 'bg-white/10 text-white',
                                    )}
                                  >
                                    <Mic className={cn('h-5 w-5', isRecording && 'animate-pulse')} />
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold">CSR</div>
                                    <div className="text-xs text-slate-300">
                                      {isRecording ? 'Talking now' : currentStep?.actor === 'csr' ? 'Ready to respond' : 'Waiting'}
                                    </div>
                                  </div>
                                </div>
                                <span
                                  className={cn(
                                    'inline-flex h-3 w-3 rounded-full',
                                    (currentStep?.actor === 'csr' || isRecording) && !isMicLocked ? 'bg-emerald-400' : 'bg-slate-500',
                                  )}
                                />
                              </div>
                              <div className="mt-4">
                                <VoiceActivityBars level={isMuted ? 0 : audioLevel} isActive={isRecording} accent="csr" />
                              </div>
                            </div>
                            <div
                              className={cn(
                                'rounded-3xl border p-4 transition',
                                callState === 'member-speaking' || showIncomingAudio
                                  ? 'border-amber-300/40 bg-amber-400/10'
                                  : 'border-white/10 bg-white/5',
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cn(
                                      'flex h-11 w-11 items-center justify-center rounded-2xl',
                                      callState === 'member-speaking' || showIncomingAudio
                                        ? 'bg-amber-400 text-slate-950'
                                        : 'bg-white/10 text-white',
                                    )}
                                  >
                                    <Headphones className={cn('h-5 w-5', callState === 'member-speaking' && 'animate-pulse')} />
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold">Member Actor</div>
                                    <div className="text-xs text-slate-300">
                                      {callState === 'member-speaking'
                                        ? 'Audio playing'
                                        : showIncomingAudio
                                          ? 'Recently spoke'
                                          : currentStep?.actor === 'member'
                                            ? 'Queued'
                                            : 'Waiting'}
                                    </div>
                                  </div>
                                </div>
                                <span
                                  className={cn(
                                    'inline-flex h-3 w-3 rounded-full',
                                    callState === 'member-speaking' || showIncomingAudio ? 'bg-amber-300' : 'bg-slate-500',
                                  )}
                                />
                              </div>
                              <div className="mt-4">
                                <VoiceActivityBars
                                  level={callState === 'member-speaking' || showIncomingAudio ? 0.8 : 0.12}
                                  isActive={callState === 'member-speaking' || showIncomingAudio}
                                  accent="member"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid gap-5 lg:grid-cols-[0.95fr,1.05fr]">
                      <Card className="border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                          <CardTitle>Real-time Waveform</CardTitle>
                          <CardDescription>Voice activity visualization for the current floor state.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">CSR channel</div>
                                <div className="mt-1 text-sm font-semibold text-slate-950">
                                  {isRecording ? 'Open mic with Google ASR' : isMuted ? 'Muted' : 'Ready'}
                                </div>
                              </div>
                              <Badge variant="outline" className={cn(isRecording ? 'border-emerald-200 text-emerald-700' : 'text-slate-500')}>
                                {isRecording ? 'Listening' : 'Idle'}
                              </Badge>
                            </div>
                            <div className="mt-4">
                              <VoiceActivityBars level={isMuted ? 0 : audioLevel} isActive={isRecording} accent="csr" />
                            </div>
                          </div>

                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Member channel</div>
                                <div className="mt-1 text-sm font-semibold text-slate-950">
                                  {callState === 'member-speaking' ? 'Incoming scripted audio' : 'Standing by'}
                                </div>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(callState === 'member-speaking' ? 'border-amber-200 text-amber-700' : 'text-slate-500')}
                              >
                                {callState === 'member-speaking' ? 'Talking' : 'Idle'}
                              </Badge>
                            </div>
                            <div className="mt-4">
                              <VoiceActivityBars
                                level={callState === 'member-speaking' || showIncomingAudio ? 0.8 : 0.1}
                                isActive={callState === 'member-speaking' || showIncomingAudio}
                                accent="member"
                              />
                            </div>
                          </div>

                          <div className="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
                            Live transcript
                            <div className="mt-2 min-h-[78px] rounded-2xl bg-slate-100 p-3 text-slate-800">
                              {liveTranscript || 'Your recognized speech will appear here while Google ASR confirms the turn.'}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              {lastAsrProviderLabel
                                ? `Saved using ${lastAsrProviderLabel}${lastTranscriptConfidence !== null ? ` at ${lastTranscriptConfidence}% confidence` : ''}.`
                                : 'Browser transcript guidance appears live, then the saved turn is confirmed by the backend ASR pipeline.'}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                          <CardTitle>Scripting Assistant</CardTitle>
                          <CardDescription>
                            Required spiel words turn green as your live transcript confirms them.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                          <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.22em] text-cyan-700">Required spiel</div>
                                <div className="mt-1 text-sm font-semibold text-slate-900">
                                  {currentStep?.speaker_label || (currentStep?.actor === 'member' ? 'Member Actor' : 'CSR Script')}
                                </div>
                              </div>
                              <div className="text-sm font-semibold text-cyan-800">{scriptProgress.percent}% matched</div>
                            </div>
                            <Progress value={scriptProgress.percent} className="mt-4 h-2.5 bg-white" />
                            <div className="mt-4 rounded-2xl bg-white/90 p-4 text-base leading-8 text-slate-700">
                              {currentStep?.script ? (
                                scriptProgress.items.map((item, index) => (
                                  <span
                                    key={`${item.word}-${index}`}
                                    className={cn(
                                      'mr-1 inline transition-colors',
                                      item.matched ? 'font-semibold text-emerald-600' : 'text-slate-500',
                                    )}
                                  >
                                    {item.word}
                                  </span>
                                ))
                              ) : (
                                <span>No active spiel loaded.</span>
                              )}
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Expected keywords</div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(currentStep?.expected_keywords || []).length ? (
                                  (currentStep?.expected_keywords || []).map((keyword) => {
                                    const isMatched = liveTranscript.toLowerCase().includes(keyword.toLowerCase());
                                    return (
                                      <Badge
                                        key={keyword}
                                        variant="outline"
                                        className={cn(
                                          isMatched
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-200 bg-white text-slate-600',
                                        )}
                                      >
                                        {keyword}
                                      </Badge>
                                    );
                                  })
                                ) : (
                                  <span className="text-sm text-slate-500">No extra keywords for this turn.</span>
                                )}
                              </div>
                            </div>

                            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Turn pacing</div>
                              <div className="mt-3 text-sm text-slate-700">
                                {showSilenceAlert
                                  ? 'Silence threshold hit. Tap Mic and continue the call.'
                                  : isOnHold
                                    ? 'Recording is paused while hold music is active.'
                                    : isRecording
                                      ? 'Speak naturally and follow the closing script before hang up.'
                                      : 'Wait for the member audio, then answer with the required spiel.'}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-5">
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Floor Presence</CardTitle>
                    <CardDescription>Visual cues for who should speak next on the Sim Floor.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div
                      className={cn(
                        'rounded-3xl border p-4 transition',
                        currentStep?.actor === 'csr' && !isRecording
                          ? 'border-cyan-200 bg-cyan-50'
                          : isRecording
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-slate-200 bg-slate-50',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Mic className={cn('h-5 w-5', isRecording ? 'animate-pulse text-emerald-600' : 'text-cyan-600')} />
                        <div>
                          <div className="font-semibold text-slate-950">CSR Talk Icon</div>
                          <div className="text-sm text-slate-600">
                            {isRecording
                              ? 'CSR is talking now.'
                              : currentStep?.actor === 'csr'
                                ? 'CSR should talk next.'
                                : 'CSR is waiting.'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'rounded-3xl border p-4 transition',
                        callState === 'member-speaking' || showIncomingAudio
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-slate-200 bg-slate-50',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Headphones
                          className={cn('h-5 w-5', callState === 'member-speaking' ? 'animate-pulse text-amber-600' : 'text-slate-500')}
                        />
                        <div>
                          <div className="font-semibold text-slate-950">Member Audio Icon</div>
                          <div className="text-sm text-slate-600">
                            {callState === 'member-speaking'
                              ? 'Member Actor is talking now.'
                              : showIncomingAudio
                                ? 'Member Actor just finished speaking.'
                                : 'Member audio is waiting.'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Member Response Overlay</CardTitle>
                    <CardDescription>Show the actor script on screen while the audio is playing.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div
                      className={cn(
                        'rounded-3xl border p-4',
                        callState === 'member-speaking'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-slate-200 bg-slate-50',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Headphones className={cn('h-5 w-5', callState === 'member-speaking' ? 'animate-pulse text-amber-600' : 'text-slate-400')} />
                        <div>
                          <div className="font-semibold text-slate-950">
                            {callState === 'member-speaking' ? 'Incoming Audio' : 'Awaiting next member line'}
                          </div>
                          <div className="text-sm text-slate-600">
                            {callState === 'member-speaking'
                              ? 'The CSR mic is locked while the member response is being delivered.'
                              : 'The member script will appear here when the actor begins speaking.'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-3xl border border-dashed border-slate-200 p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">On-screen actor script</div>
                      <div className="mt-3 min-h-[144px] rounded-2xl bg-slate-950 p-4 text-sm leading-7 text-slate-100">
                        {callState === 'member-speaking' && currentStep?.actor === 'member'
                          ? currentStep.script
                          : showIncomingAudio
                            ? 'Member audio just completed. Prepare your response and speak when ready.'
                            : 'No active member audio yet.'}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Session Signals</CardTitle>
                    <CardDescription>Call controls that affect realism, timing, and scoring.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-600">Mute</span>
                      <span className={cn('font-semibold', isMuted ? 'text-rose-600' : 'text-slate-900')}>
                        {isMuted ? 'Enabled' : 'Off'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-600">Hold</span>
                      <span className={cn('font-semibold', isOnHold ? 'text-amber-600' : 'text-slate-900')}>
                        {isOnHold ? 'Hold music active' : 'Live line'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-slate-600">Recording</span>
                      <span className={cn('font-semibold', isCapturing ? 'text-emerald-600' : 'text-slate-900')}>
                        {isCapturing ? 'Full call captured' : 'Not started'}
                      </span>
                    </div>
                    <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-slate-600">
                      Hanging up triggers Supabase upload, transcript finalization, sentiment scoring, keyword
                      compliance checks, and updated trainer coaching data.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : null}
*/
