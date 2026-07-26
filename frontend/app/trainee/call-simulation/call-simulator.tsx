'use client';

/**
 * Redesigned Call Simulation Module - Trainee Interface
 * 
 * Features:
 * - Clean, minimal UI with balanced spacing
 * - Professional BPO training appearance
 * - Responsive layout across all breakpoints
 * - Integrated with existing Supabase schema
 * - Production-ready error handling
 * - Complete audit logging
 */

import VoiceActivityBars from '@/app/components/trainee/voice-activity-bars';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
    LazyIcon,
} from '@/app/components/ui/LazyIcon';
import { cn } from '@/app/components/ui/utils';
import { apiFetch } from '@/app/utils/api';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useWavCallRecorder, type WavCallRecordingResult } from '@/hooks/useWavCallRecorder';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

  const AlertTriangle = (props: any) => <LazyIcon name="AlertTriangle" {...props} />;
  const CheckCircle2 = (props: any) => <LazyIcon name="CheckCircle2" {...props} />;
  const Clock3 = (props: any) => <LazyIcon name="Clock3" {...props} />;
  const Download = (props: any) => <LazyIcon name="Download" {...props} />;
  const Eye = (props: any) => <LazyIcon name="Eye" {...props} />;
  const Headphones = (props: any) => <LazyIcon name="Headphones" {...props} />;
  const Loader2 = (props: any) => <LazyIcon name="Loader2" {...props} />;
  const Mic = (props: any) => <LazyIcon name="Mic" {...props} />;
  const PauseCircle = (props: any) => <LazyIcon name="PauseCircle" {...props} />;
  const Phone = (props: any) => <LazyIcon name="Phone" {...props} />;
  const PhoneIncoming = (props: any) => <LazyIcon name="PhoneIncoming" {...props} />;
  const PhoneOff = (props: any) => <LazyIcon name="PhoneOff" {...props} />;
  const PlayCircle = (props: any) => <LazyIcon name="PlayCircle" {...props} />;
  const RotateCcw = (props: any) => <LazyIcon name="RotateCcw" {...props} />;
  const Volume2 = (props: any) => <LazyIcon name="Volume2" {...props} />;

/**
 * Type definitions - reuse existing types from schema
 */

interface ScenarioStep {
  id?: string | null;
  step_number: number;
  actor: string;
  speaker_label?: string | null;
  script: string;
  expected_keywords?: string[];
  audio_url?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface SessionData {
  session_id: string;
  assignment_id?: string | null;
  scenario_title: string;
  scenario_description?: string | null;
  current_step: number;
  passing_score: number;
  attempt_number?: number | null;
  max_attempts?: number | null;
  assigned_by_id?: string | null;
  ringer_audio_url?: string | null;
  hold_audio_url?: string | null;
  steps: ScenarioStep[];
}

interface SessionResult {
  id: string;
  status: string;
  scenario_id: string;
  audio_url?: string | null;
  audio_duration_seconds?: number | null;
  transcript?: string | null;
  transcript_log?: Array<Record<string, unknown>>;
  weighted_score?: number | null;
  pass_fail: boolean;
  ai_feedback?: string | null;
  feedback_report?: DialerFeedbackReport | null;
  completed_at?: string | null;
}

interface DialerFeedbackReport {
  provider: 'gemini' | 'fallback';
  model: string;
  overallSummary: string;
  summary: string;
  totalScore: number;
  passingScore: number;
  passed: boolean;
  strengths: string[];
  areas_for_improvement: string[];
  coaching_recommendation: string;
  kpi_breakdown: Array<{
    category: string;
    score: number;
    feedback: string;
  }>;
}

interface ScenarioCard {
  id: string;
  title: string;
  description?: string | null;
  difficulty?: string | null;
  estimated_duration?: number | null;
  expected_duration_seconds?: number | null;
  passing_score: number;
  attempt_count: number;
  latest_score: number;
  latest_status?: string | null;
  competent: boolean;
  can_retake?: boolean | null;
  assignment_batch_name?: string | null;
  assignment_wave_number?: number | null;
}

/**
 * Screen State Machine
 */
type ScreenState = 'assigned' | 'preaccept' | 'incoming' | 'countdown' | 'active' | 'processing' | 'result';
type MemberTurnState = 'idle' | 'speaking' | 'awaiting-unhold';

/**
 * Helper Functions
 */

function authHeaders() {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' && 'detail' in payload ? String(payload.detail) : '';
    throw new Error(detail || fallbackMessage);
  }
  return payload as T;
}

function formatDuration(totalSeconds?: number | null) {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function normalizeActor(actor?: string | null) {
  const normalized = String(actor || '').trim().toLowerCase();
  if (normalized.includes('csr') || normalized.includes('trainee')) return 'csr';
  if (normalized.includes('member') || normalized.includes('customer')) return 'member';
  return normalized || 'system';
}

/**
 * Main Call Simulator Component
 */
export function CallSimulator({
  onScenarioSelect,
}: {
  onScenarioSelect?: (scenarioId: string) => void;
}) {
  // State: Screen and navigation
  const [screen, setScreen] = useState<ScreenState>('assigned');
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioCard | null>(null);
  const selectedScenarioId = selectedScenario?.id;
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [feedbackReport, setFeedbackReport] = useState<DialerFeedbackReport | null>(null);

  // State: Call flow
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [memberTurnState, setMemberTurnState] = useState<MemberTurnState>('idle');
  const [isOnHold, setIsOnHold] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [countdownValue, setCountdownValue] = useState(5);

  // State: Recording and audio
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastTranscript, setLastTranscript] = useState('');
  const [activePlaybackLabel, setActivePlaybackLabel] = useState('');

  // State: UI and loading
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [isUploadingCall, setIsUploadingCall] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  // Refs
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const pendingRecordingRef = useRef<WavCallRecordingResult | null>(null);
  const finalRecordingUploadedRef = useRef(false);
  const isSubmittingTurnRef = useRef(false);
  const consumedScenarioParamRef = useRef<string | null>(null);
  const completedCsrStepsRef = useRef(new Set<number>());

  const orderedSteps = useMemo(
    () => [...(sessionData?.steps || [])].sort((left, right) => left.step_number - right.step_number),
    [sessionData?.steps],
  );

  // Audio recording hook
  const {
    startCapture,
    stopCapture,
    discardCapture,
    setMicrophoneMuted,
    isCapturing: hookIsCapturing,
  } = useWavCallRecorder({
    onLevel: setAudioLevel,
  });

  const {
    startRecording,
    stopRecording,
    isRecording: isCsrRecording,
    audioLevel: speechAudioLevel,
  } = useSpeechToText({
    sessionId: sessionData?.session_id,
  });

  const recordingAudioLevel = isCsrRecording ? speechAudioLevel : audioLevel;

  /**
   * Log call event to Supabase audit table
   */
  const logCallEvent = useCallback(
    async (
      eventType: string,
      metadata?: Record<string, unknown>,
      stepNumber?: number,
    ) => {
      if (!sessionData?.session_id) return;

      try {
        await apiFetch<unknown>(`/api/call-simulation/session/${sessionData.session_id}/event`, {
          method: 'POST',
          body: JSON.stringify({
            event_type: eventType,
            event_label: eventType,
            step_number: stepNumber || null,
            metadata_json: metadata || {},
          }),
        });
      } catch (error) {
        // Audit logging failure should not break the main flow
        console.debug('Audit logging failed:', error);
      }
    },
    [sessionData],
  );

  /**
   * Fetch assigned scenarios for trainee
   */
  const fetchScenarios = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const payload = await apiFetch<{ scenarios: ScenarioCard[] }>('/api/call-simulation/available');
      setScenarios(payload.scenarios || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load scenarios';
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Start scenario session
   */
  const startScenarioSession = useCallback(
    async (scenario: ScenarioCard) => {
      if (!scenario.id) return;

      setIsStartingSession(true);
      setOperationError('');
      try {
        const payload = await apiFetch<SessionData>('/api/call-simulation/start', {
          method: 'POST',
          body: JSON.stringify({ scenario_id: scenario.id }),
        });
        setSessionData(payload);
        await logCallEvent('accept_call');
        setScreen('incoming');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start session';
        setOperationError(message);
        toast.error(message);
      } finally {
        setIsStartingSession(false);
      }
    },
    [logCallEvent],
  );

  /**
   * Handle scenario selection
   */
  const handleScenarioSelect = useCallback(
    (scenario: ScenarioCard) => {
      const locked = scenario.competent;
      if (locked) {
        toast.info('This scenario is already completed.');
        return;
      }
      setSelectedScenario(scenario);
      onScenarioSelect?.(scenario.id);
      setScreen('preaccept');
    },
    [onScenarioSelect],
  );

  /**
   * Handle pre-accept confirmation
   */
  const handleAcceptCall = useCallback(async () => {
    if (!selectedScenario) return;
    await startScenarioSession(selectedScenario);
  }, [selectedScenario, startScenarioSession]);

  /**
   * Start CSR recording for current step
   */
  const startCurrentCsrRecording = useCallback(async () => {
    const nextStep = orderedSteps[currentStepIndex];
    if (!nextStep || normalizeActor(nextStep.actor) !== 'csr') return;
    
    setMicrophoneMuted(false);
    await startRecording();
    await logCallEvent('recording_started', { step_number: nextStep.step_number }, nextStep.step_number);
  }, [currentStepIndex, orderedSteps, logCallEvent, setMicrophoneMuted, startRecording]);

  /**
   * Handle incoming call confirmation (after countdown)
   */
  const handleConfirmIncoming = useCallback(async () => {
    if (!sessionData?.session_id) return;

    setCountdownValue(5);
    countdownRef.current = window.setInterval(() => {
      setCountdownValue((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) {
            window.clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          setScreen('active');
          // Start final session capture and begin the first CSR turn if applicable
          void startCapture();
          void startCurrentCsrRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    setScreen('countdown');
    await logCallEvent('start_countdown');
  }, [logCallEvent, sessionData?.session_id, startCapture, startCurrentCsrRecording]);

  /**
   * Handle hold/unhold toggle with enhanced error recovery (Phase 3)
   */
  const handleHoldToggle = useCallback(async () => {
    if (isSubmittingTurnRef.current) return;

    const currentStep = orderedSteps[currentStepIndex];

    // Unhold: Resume CSR recording
    if (isOnHold) {
      setIsOnHold(false);
      setMemberTurnState('idle');
      setMicrophoneMuted(false);
      await logCallEvent('unhold', { step_number: currentStep?.step_number });
      await startCurrentCsrRecording();
      return;
    }

    // Hold: Pause recording and trigger AI speech
    if (!isCsrRecording) {
      toast.info('Recording is not active. Please wait for your turn.');
      return;
    }

    if (!currentStep || normalizeActor(currentStep.actor) !== 'csr') {
      toast.error('The next CSR turn is not ready yet.');
      return;
    }

    isSubmittingTurnRef.current = true;
    setIsOnHold(true);
    setMicrophoneMuted(true);

    try {
      await logCallEvent('hold', { step_number: currentStep.step_number }, currentStep.step_number);

      // Stop CSR recording
      const recordingResult = await stopRecording({
        stepNumber: currentStep.step_number,
        liveTranscript: lastTranscript,
      });

      if (recordingResult?.transcript) {
        setLastTranscript(recordingResult.transcript);
      }

      // Mark step as completed if evaluation passed
      if (!recordingResult?.requires_repeat) {
        completedCsrStepsRef.current.add(currentStep.step_number);

        const nextCsrIndex = orderedSteps.findIndex(
          (step, idx) => idx > currentStepIndex && normalizeActor(step.actor) === 'csr',
        );

        if (nextCsrIndex >= 0) {
          setCurrentStepIndex(nextCsrIndex);
        }
      }

      // If CSR needs to repeat the turn, restart recording
      if (recordingResult?.requires_repeat) {
        toast.warning(recordingResult.repeat_reason || 'Please repeat the CSR statement.');
        await logCallEvent('turn_requires_repeat', {
          step_number: currentStep.step_number,
          reason: recordingResult.repeat_reason,
        }, currentStep.step_number);

        setIsOnHold(false);
        setMicrophoneMuted(false);
        setMemberTurnState('idle');
        await startCurrentCsrRecording();
        return;
      }

      // Play member AI responses for remaining steps
      setIsGeneratingAudio(true);
      setMemberTurnState('speaking');

      // Trigger member speech synthesis and playback
      const nextMemberIndex = orderedSteps.findIndex(
        (step, idx) => idx > currentStepIndex && normalizeActor(step.actor) === 'member',
      );

      if (nextMemberIndex >= 0) {
        const nextMemberStep = orderedSteps[nextMemberIndex];
        try {
          const payload = await apiFetch<{ audio_url: string }>(
            `/api/call-simulation/session/${sessionData?.session_id}/member-speech`,
            {
              method: 'POST',
              body: JSON.stringify({
                step_number: nextMemberStep.step_number,
                script: nextMemberStep.script,
              }),
            },
          );

          await logCallEvent('member_speech_played', {
            step_number: nextMemberStep.step_number,
            audio_url: payload.audio_url,
            script_preview: (nextMemberStep.script || '').slice(0, 240),
          });

          const audio = new Audio(payload.audio_url);
          audio.preload = 'auto';
          const playbackComplete = new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              audio.onended = null;
              audio.onerror = null;
              audio.onabort = null;
            };
            audio.onended = () => {
              cleanup();
              resolve();
            };
            audio.onerror = () => {
              cleanup();
              reject(new Error('Member speech audio could not be loaded from Supabase.'));
            };
            audio.onabort = () => {
              cleanup();
              reject(new Error('Member speech playback was interrupted.'));
            };
          });
          audio.load();
          await audio.play();
          await playbackComplete;
          setIsGeneratingAudio(false);
          setMemberTurnState('awaiting-unhold');
          await logCallEvent('ai_response_complete', { step_number: nextMemberStep.step_number });
        } catch (error) {
          // Graceful degradation: allow continuing even if member speech fails
          const message = error instanceof Error ? error.message : 'Member speech unavailable';
          console.warn('Member speech error:', message);
          toast.warning('Member response unavailable. You may continue.');
          
          setIsGeneratingAudio(false);
          setMemberTurnState('awaiting-unhold');
          await logCallEvent('member_speech_failed', {
            step_number: nextMemberStep.step_number,
            error: message,
          });
        }
      } else {
        // No more member steps, ready to end call
        setIsGeneratingAudio(false);
        setMemberTurnState('idle');
        toast.success('All CSR turns complete. End the call when ready.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process CSR turn';
      setOperationError(message);
      toast.error(message);

      await logCallEvent('hold_failed', {
        step_number: currentStep?.step_number,
        error: message,
      }, currentStep?.step_number);

      // Recovery: Reset to allow retry
      setIsOnHold(false);
      setMicrophoneMuted(false);
      setMemberTurnState('idle');
    } finally {
      isSubmittingTurnRef.current = false;
    }
  }, [
    isOnHold,
    isCsrRecording,
    currentStepIndex,
    lastTranscript,
    logCallEvent,
    orderedSteps,
    sessionData,
    setMicrophoneMuted,
    startCurrentCsrRecording,
    stopRecording,
  ]);

  /**
   * Handle end call
   */
  const handleEndCall = useCallback(async () => {
    if (isEndingCall || !sessionData?.session_id) return;

    const confirmed = window.confirm(
      'End this mock call? The recording, transcript, and KPI evaluation will be saved.',
    );
    if (!confirmed) return;

    setIsEndingCall(true);
    setScreen('processing');
    setOperationError('');

    try {
      // Stop recording and preserve the final session capture
      pendingRecordingRef.current = await stopCapture();

      // Upload final recording
      if (pendingRecordingRef.current) {
        setIsUploadingCall(true);
        const formData = new FormData();
        formData.append(
          'audio_duration_seconds',
          pendingRecordingRef.current.durationSeconds.toFixed(2),
        );
        formData.append('file', pendingRecordingRef.current.blob, 'mockcall.mp3');

        await apiFetch<void>(
          `/api/call-simulation/session/${sessionData.session_id}/recording`,
          {
            method: 'POST',
            body: formData,
          },
        );

        pendingRecordingRef.current = null;
        finalRecordingUploadedRef.current = true;
        setIsUploadingCall(false);
      }

      // Complete session and generate results
      await logCallEvent('end_call');
      const result = await apiFetch<SessionResult>(
        `/api/call-simulation/session/${sessionData.session_id}/finalize`,
        { method: 'POST' },
      );

      setSessionResult(result);
      await logCallEvent('transcript_generated', {
        transcript_entries: result.transcript_log?.length || 0,
      });

      // Generate feedback report
      try {
        const feedbackPayload = await apiFetch<{ report: DialerFeedbackReport }>(
          `/api/call-simulation/session/${sessionData.session_id}/feedback`,
          {
            method: 'POST',
            body: JSON.stringify({
              scenario_id: selectedScenario?.id,
              scenario_title: sessionData.scenario_title,
            }),
          },
        );

        setFeedbackReport(feedbackPayload.report);
        await logCallEvent('evaluation_completed', {
          provider: feedbackPayload.report.provider,
          model: feedbackPayload.report.model,
        });
      } catch (error) {
        toast.warning('AI evaluation timed out, but recording was saved.');
      }

      await fetchScenarios();
      setScreen('result');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to end call safely';
      setOperationError(message);
      toast.error(message);
      setScreen('active');
    } finally {
      setIsEndingCall(false);
    }
  }, [isEndingCall, sessionData, stopCapture, logCallEvent, selectedScenario, fetchScenarios]);

  /**
   * Handle try again (reset)
   */
  const handleTryAgain = useCallback(async () => {
    const confirmed = window.confirm(
      'Reset this attempt and start over? All recordings and temporary data for this attempt will be deleted.',
    );
    if (!confirmed) return;

    await logCallEvent('try_again_initiated', {
      current_screen: screen,
      scenario_id: selectedScenarioId,
      attempt_number: sessionData?.attempt_number,
    });

    try {
      // Cleanup active timers
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      // Stop any active recording
      await discardCapture();

      // Discard current session on backend
      if (sessionData?.session_id) {
        try {
          try {
            await apiFetch<void>(`/api/call-simulation/session/${sessionData.session_id}/discard`, {
              method: 'POST',
            });
          } catch (discardError) {
            console.warn('Session discard response error:', discardError);
          }

          await logCallEvent('session_discarded', {
            session_id: sessionData.session_id,
            reason: 'trainee_retry',
          });
        } catch (discardError) {
          console.warn('Failed to discard session on backend:', discardError);
          // Continue with local reset even if backend discard fails
        }
      }

      // Clear all state references
      pendingRecordingRef.current = null;
      finalRecordingUploadedRef.current = false;
      isSubmittingTurnRef.current = false;
      consumedScenarioParamRef.current = null;

      // Reset all UI state
      setSessionData(null);
      setSessionResult(null);
      setFeedbackReport(null);
      setCurrentStepIndex(0);
      completedCsrStepsRef.current = new Set();
      setMemberTurnState('idle');
      setIsOnHold(false);
      setCallTimer(0);
      setCountdownValue(5);
      setLastTranscript('');
      setOperationError('');

      await logCallEvent('try_again_completed', {
        scenario_id: selectedScenarioId,
        new_screen: selectedScenario ? 'preaccept' : 'assigned',
      });

      // Return to appropriate screen
      if (selectedScenario) {
        setScreen('preaccept');
      } else {
        setScreen('assigned');
        // Refresh scenarios list
        void fetchScenarios();
      }

      toast.success('Attempt reset. Ready for new try.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset attempt';
      setOperationError(message);
      toast.error(message);

      await logCallEvent('try_again_failed', {
        scenario_id: selectedScenarioId,
        error: message,
      });
    }
  }, [
    sessionData,
    logCallEvent,
    selectedScenario,
    selectedScenarioId,
    screen,
    discardCapture,
    fetchScenarios,
  ]);

  /**
   * Render: Assigned Scenarios List
   */
  const renderAssignedScenarios = () => (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold tracking-normal">Assigned Call Scenarios</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only trainer-assigned scenarios appear here.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void fetchScenarios()}
          disabled={isLoading}
          className="shrink-0"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {loadError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {loadError}
        </div>
      )}

      {/* Scenarios Grid */}
      {isLoading && !scenarios.length ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading assigned scenarios
          </CardContent>
        </Card>
      ) : scenarios.length > 0 ? (
        <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-2">
          {scenarios.map((scenario) => {
            const locked = Boolean(scenario.competent);
            const duration = scenario.expected_duration_seconds || scenario.estimated_duration || 0;

            return (
              <Card key={scenario.id} className="flex flex-col">
                <CardHeader className="border-b border-border/70 pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle>{scenario.title}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {scenario.description || scenario.title}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        locked
                          ? 'success'
                          : scenario.can_retake
                            ? 'warning'
                            : 'neutral'
                      }
                      className="shrink-0"
                    >
                      {locked ? 'Completed' : scenario.can_retake ? 'Retake' : 'Assigned'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-4 pt-4">
                  {/* Scenario Details Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-background p-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Module
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {scenario.assignment_batch_name || 'Standard'}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Difficulty
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {scenario.difficulty || 'Standard'}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Duration
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {duration > 0 ? `${Math.ceil(duration / 60)}m` : 'Variable'}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Pass Score
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {scenario.passing_score.toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* Latest Score if Available */}
                  {scenario.attempt_count > 0 && (
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                      <div className="text-xs font-semibold text-sky-900">Latest Attempt</div>
                      <div className="mt-1 text-lg font-bold text-sky-900">
                        {scenario.latest_score.toFixed(1)}%
                      </div>
                    </div>
                  )}

                  {/* Action Button - Phase 6: Enhanced accessibility */}
                  <Button
                    type="button"
                    className="w-full"
                    variant={locked ? 'secondary' : 'default'}
                    onClick={() => handleScenarioSelect(scenario)}
                    disabled={locked}
                    aria-label={
                      locked
                        ? `${scenario.title} is completed`
                        : scenario.can_retake
                          ? `Retake ${scenario.title}`
                          : `Start ${scenario.title}`
                    }
                  >
                    {locked ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Completed
                      </>
                    ) : scenario.can_retake ? (
                      <>
                        <RotateCcw className="h-4 w-4" />
                        Retake
                      </>
                    ) : (
                      <>
                        <PhoneIncoming className="h-4 w-4" />
                        Start
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Phone className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No call scenarios assigned to your workspace yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  /**
   * Render: Pre-Accept Screen
   */
  const renderPreAccept = () => (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setScreen('assigned')}
        className="mb-2"
      >
        ← Back to Scenarios
      </Button>

      <Card>
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle>{selectedScenario?.title}</CardTitle>
          <CardDescription>Ready to begin this scenario</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Scenario Info Grid */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Module
              </div>
              <div className="mt-2 text-sm font-semibold">
                {selectedScenario?.assignment_batch_name || 'Standard'}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Difficulty
              </div>
              <div className="mt-2 text-sm font-semibold">
                {selectedScenario?.difficulty || 'Standard'}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Passing Score
              </div>
              <div className="mt-2 text-sm font-semibold">
                {selectedScenario?.passing_score.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Description */}
          {selectedScenario?.description && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm leading-6 text-foreground">
                {selectedScenario.description}
              </p>
            </div>
          )}

          {/* Error Alert */}
          {operationError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {operationError}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              className="flex-1"
              onClick={() => void handleAcceptCall()}
              disabled={isStartingSession}
            >
              {isStartingSession ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Phone className="h-4 w-4" />
              )}
              {isStartingSession ? 'Starting...' : 'Accept Call'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setScreen('assigned')}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  /**
   * Render: Incoming Call Screen
   */
  const renderIncoming = () => (
    <div className="flex min-h-[600px] flex-col items-center justify-center space-y-6">
      <div className="space-y-4 text-center">
        <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Incoming Call
        </div>
        <h2 className="text-3xl font-bold sm:text-4xl">
          {selectedScenario?.title || 'Call Scenario'}
        </h2>
        <p className="text-base text-muted-foreground sm:text-lg">
          {selectedScenario?.assignment_batch_name || 'Assigned scenario'}
        </p>
      </div>

      {/* Animated Call Indicator */}
      <div className="space-y-6">
        <div className="flex justify-center">
          <div className="relative h-24 w-24 sm:h-32 sm:w-32">
            <div className="absolute inset-0 animate-pulse rounded-full border-4 border-primary/40 bg-primary/10" />
            <div className="absolute inset-2 animate-pulse rounded-full border-4 border-primary/60 bg-primary/20" />
            <div className="absolute inset-4 rounded-full bg-primary" />
            <PhoneIncoming 
              className="absolute inset-0 flex items-center justify-center h-full w-full text-white" 
              aria-label="Incoming call"
            />
          </div>
        </div>

        {/* Action Buttons - Phase 6: Mobile responsive sizing */}
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <Button
            type="button"
            size="lg"
            className="h-12 sm:h-14 px-6 sm:px-12 text-base sm:text-base"
            onClick={() => void handleConfirmIncoming()}
            aria-label="Accept incoming call"
          >
            <Phone className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="ml-2">Accept</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 sm:h-14 px-6 sm:px-12 text-base sm:text-base"
            onClick={() => {
              setScreen('preaccept');
              setSessionData(null);
            }}
            aria-label="Decline incoming call"
          >
            <PhoneOff className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="ml-2">Decline</span>
          </Button>
        </div>
      </div>
    </div>
  );

  /**
   * Render: Countdown Screen
   */
  const renderCountdown = () => (
    <div className="flex min-h-[600px] flex-col items-center justify-center space-y-6">
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-semibold text-muted-foreground">Call Starting In</h2>
        <div className="text-9xl font-bold tabular-nums">{countdownValue}</div>
      </div>
      <p className="text-sm text-muted-foreground">Get ready to speak naturally</p>
    </div>
  );

  /**
   * Render: Active Call Screen - REDESIGNED FOR SIMPLICITY
   */
  const renderActiveCall = () => {
    const currentStep = sessionData?.steps[currentStepIndex];
    const totalSteps = sessionData?.steps.length || 0;
    const progressPercent = totalSteps > 0 ? ((currentStepIndex + 1) / totalSteps) * 100 : 0;

    return (
      <div className="space-y-4 pb-24">
        {/* Top Status Bar */}
        <Card className="sticky top-0 z-10">
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            {/* Progress */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Scenario Progress
              </div>
              <div className="mt-1 text-xl font-bold">
                {Math.min(currentStepIndex + 1, totalSteps)} / {totalSteps}
              </div>
            </div>

            {/* Timer */}
            <div className="flex items-center gap-3 rounded-lg border bg-muted px-4 py-2">
              <Clock3 className="h-4 w-4 text-primary" />
              <span className="text-lg font-semibold tabular-nums">{formatDuration(callTimer)}</span>
            </div>

            {/* Recording Indicator */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'h-3 w-3 rounded-full',
                  hookIsCapturing ? 'animate-pulse bg-rose-500' : 'bg-slate-300',
                )}
              />
              <span className="text-sm font-semibold">
                {hookIsCapturing ? 'Recording' : 'Standby'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Main Call Content */}
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {/* Conversation Card */}
          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <CardTitle>{sessionData?.scenario_title}</CardTitle>
                  <CardDescription className="mt-1 line-clamp-1">
                    {sessionData?.scenario_description || 'Active call simulation'}
                  </CardDescription>
                </div>
                <Badge
                  variant={
                    isOnHold
                      ? 'warning'
                      : isCsrRecording
                        ? 'success'
                        : memberTurnState === 'speaking'
                          ? 'info'
                          : 'neutral'
                  }
                  className="shrink-0"
                >
                  {isOnHold
                    ? 'On Hold'
                    : isCsrRecording
                      ? 'Speaking'
                      : memberTurnState === 'speaking'
                        ? 'Listening'
                        : 'Ready'}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-4">
              {/* Error Alert */}
              {operationError && (
                <div className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{operationError}</span>
                </div>
              )}

              {/* TTS Generating Alert */}
              {isGeneratingAudio && (
                <div className="flex gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  <span>Preparing Member AI response...</span>
                </div>
              )}

              {/* Audio Playback Alert */}
              {activePlaybackLabel && (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <Volume2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{activePlaybackLabel} audio is playing</span>
                </div>
              )}

              {/* Current Turn Display */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Your Turn
                </div>
                <div className="mt-3 text-lg font-semibold">
                  {memberTurnState === 'awaiting-unhold'
                    ? 'Member Response Complete'
                    : normalizeActor(currentStep?.actor) === 'csr'
                      ? 'Time to Speak'
                      : 'Listen to Member'}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {memberTurnState === 'awaiting-unhold'
                    ? 'Press Unhold to continue your response.'
                    : normalizeActor(currentStep?.actor) === 'csr'
                      ? 'Respond naturally, then press Hold when done.'
                      : 'Pay attention to the Member AI response.'}
                </p>
              </div>

              {/* Audio Visualization */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold">
                      <Mic className="h-4 w-4 text-primary" />
                      Your Audio
                    </div>
                    <Badge variant={isCsrRecording ? 'success' : 'neutral'}>
                      {isCsrRecording ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  <div className="mt-4">
                    <VoiceActivityBars level={recordingAudioLevel} isActive={isCsrRecording} accent="csr" />
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold">
                      <Headphones className="h-4 w-4 text-amber-600" />
                      Member AI
                    </div>
                    <Badge variant={memberTurnState === 'speaking' ? 'info' : 'neutral'}>
                      {memberTurnState === 'speaking' ? 'Speaking' : 'Idle'}
                    </Badge>
                  </div>
                  <div className="mt-4">
                    <VoiceActivityBars
                      level={memberTurnState === 'speaking' ? 0.75 : 0.1}
                      isActive={memberTurnState === 'speaking'}
                      accent="member"
                    />
                  </div>
                </div>
              </div>

              {/* Latest Transcript */}
              {lastTranscript && (
                <div className="rounded-lg border bg-background p-4">
                  <div className="text-sm font-semibold text-foreground">Your Last Response</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {lastTranscript}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scenario Queue - Sidebar */}
          <Card className="h-fit">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-base">Progress</CardTitle>
              <CardDescription className="mt-1 text-xs">
                {Math.round(progressPercent)}% complete
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 pt-4">
              {/* Progress Bar */}
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Queue Items */}
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {sessionData?.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'rounded-lg border p-2 text-xs transition-all',
                      idx === currentStepIndex
                        ? 'border-primary bg-primary/5 font-semibold'
                        : idx < currentStepIndex
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-muted bg-muted/50',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {idx < currentStepIndex ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : idx === currentStepIndex ? (
                        <div className="h-3 w-3 animate-pulse rounded-full bg-primary" />
                      ) : (
                        <div className="h-3 w-3 rounded-full border border-current" />
                      )}
                      <span className="min-w-0 flex-1">
                        {normalizeActor(step.actor) === 'csr' ? 'Your Turn' : 'Member AI'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Action Bar - ALWAYS VISIBLE */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background p-4 shadow-lg">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Hold/Unhold Button */}
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => void handleHoldToggle()}
                disabled={isSubmittingTurnRef.current}
                className="h-14"
              >
                {isOnHold ? (
                  <>
                    <PlayCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="hidden sm:inline ml-2">Unhold</span>
                  </>
                ) : (
                  <>
                    <PauseCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="hidden sm:inline ml-2">Hold</span>
                  </>
                )}
              </Button>

              {/* Try Again Button - Phase 6: Mobile responsive */}
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => void handleTryAgain()}
                className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 h-12 sm:h-14 px-3 sm:px-6"
                aria-label="Try this turn again"
              >
                <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline ml-2">Try Again</span>
              </Button>

              {/* End Call Button - Phase 6: Mobile responsive */}
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={() => void handleEndCall()}
                disabled={isEndingCall}
                className="h-12 sm:h-14 px-3 sm:px-6"
                aria-label="End call and finalize results"
              >
                {isEndingCall ? (
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                ) : (
                  <PhoneOff className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
                <span className="hidden sm:inline ml-2">{isEndingCall ? 'Ending' : 'End Call'}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render: Processing Screen
   */
  const renderProcessing = () => (
    <div className="flex min-h-[600px] flex-col items-center justify-center space-y-6">
      <div className="rounded-full bg-primary/10 p-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold">Generating Results</h2>
        <p className="text-sm text-muted-foreground">
          Saving recording, transcript, and KPI evaluation...
        </p>
      </div>
    </div>
  );

  /**
   * Render: Result Screen - REDESIGNED WITH KPI BREAKDOWN
   */
  const renderResult = () => {
    const score = feedbackReport?.totalScore ?? sessionResult?.weighted_score ?? 0;
    const passed = feedbackReport?.passed ?? sessionResult?.pass_fail ?? false;
    const passingScore = feedbackReport?.passingScore ?? sessionData?.passing_score ?? 80;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold">Call Completed</h2>
          <p className="mt-2 text-muted-foreground">{sessionData?.scenario_title}</p>
        </div>

        {/* Score Card */}
        <Card className={cn(
          'border-2',
          passed ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50',
        )}>
          <CardContent className="space-y-6 p-8 pt-6 text-center">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Your Score
              </div>
              <div className={cn(
                'mt-2 text-6xl font-bold tabular-nums',
                passed ? 'text-emerald-700' : 'text-rose-700',
              )}>
                {score.toFixed(1)}%
              </div>
            </div>

            <div className="flex items-center justify-center gap-2">
              {passed ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-emerald-700" />
                  <span className="text-lg font-bold text-emerald-700">
                    PASSED (≥ {passingScore}%)
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-6 w-6 text-rose-700" />
                  <span className="text-lg font-bold text-rose-700">
                    NEEDS IMPROVEMENT (&lt; {passingScore}%)
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* KPI Breakdown - Phase 6: Enhanced for mobile and accessibility */}
        {feedbackReport?.kpi_breakdown && feedbackReport.kpi_breakdown.length > 0 && (
          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-xl sm:text-2xl">Performance Breakdown</CardTitle>
              <CardDescription>Detailed evaluation by category</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {feedbackReport.kpi_breakdown.map((kpi, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm sm:text-base">{kpi.category}</span>
                    <span className="text-lg font-bold shrink-0" role="region" aria-label={`${kpi.category} score`}>{kpi.score.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(kpi.score, 100)}%` }}
                      role="progressbar"
                      aria-valuenow={Math.round(kpi.score)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${kpi.category} progress`}
                    />
                  </div>
                  {kpi.feedback && (
                    <p className="text-sm text-muted-foreground">{kpi.feedback}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Strengths & Areas for Improvement */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Strengths */}
          {feedbackReport?.strengths && feedbackReport.strengths.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-emerald-900">Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-emerald-800">
                  {feedbackReport.strengths.map((strength, idx) => (
                    <li key={idx} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Areas for Improvement */}
          {feedbackReport?.areas_for_improvement && feedbackReport.areas_for_improvement.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-amber-900">Areas to Improve</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-amber-800">
                  {feedbackReport.areas_for_improvement.map((area, idx) => (
                    <li key={idx} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{area}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Coaching Recommendation */}
        {feedbackReport?.coaching_recommendation && (
          <Card className="border-sky-200 bg-sky-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-sky-900">Coaching Recommendation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-sky-800">
                {feedbackReport.coaching_recommendation}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {sessionResult?.audio_url && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (sessionResult.audio_url) {
                  window.open(sessionResult.audio_url, '_blank');
                }
              }}
            >
              <Download className="h-4 w-4" />
              Download Recording
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // TODO: Link to transcript viewer
              toast.info('Transcript viewer coming soon');
            }}
          >
            <Eye className="h-4 w-4" />
            View Transcript
          </Button>

          {!passed && (
            <Button
              type="button"
              variant="default"
              onClick={() => {
                if (selectedScenario) {
                  handleScenarioSelect(selectedScenario);
                }
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Try Again
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setScreen('assigned');
              setSelectedScenario(null);
              setSessionData(null);
              setSessionResult(null);
              setFeedbackReport(null);
            }}
          >
            Back to Scenarios
          </Button>
        </div>
      </div>
    );
  };

  /**
   * Initialize timer on component mount
   */
  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setCallTimer((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  /**
   * Fetch scenarios on mount
   */
  useEffect(() => {
    void fetchScenarios();
  }, [fetchScenarios]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (countdownRef.current) window.clearInterval(countdownRef.current);
      void discardCapture();
    };
  }, [discardCapture]);

  /**
   * Main render
   */
  return (
    <div className={screen === 'active' ? '' : 'space-y-6'}>
      {screen === 'assigned' && renderAssignedScenarios()}
      {screen === 'preaccept' && renderPreAccept()}
      {screen === 'incoming' && renderIncoming()}
      {screen === 'countdown' && renderCountdown()}
      {/* eslint-disable-next-line react-hooks/refs */}
      {screen === 'active' && renderActiveCall()}
      {screen === 'processing' && renderProcessing()}
      {screen === 'result' && renderResult()}
    </div>
  );
}

export default CallSimulator;
