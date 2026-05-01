'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// Types for the call simulation
interface CallScenario {
  id: string;
  topic: string;
  description?: string;
  script_flow: ScriptFlowStep[];
  target_kpis: Record<string, unknown>;
  ringer_audio_url?: string;
  hold_audio_url?: string;
  passing_score: number;
}

interface ScriptFlowStep {
  step_id: string;
  suggested_csr_script: string;
  member_response_text: string;
  point_value: number;
  expected_keywords?: string[];
}

interface CallSession {
  session_id: string;
  scenario: CallScenario;
  status: CallState;
  current_step_index: number;
}

type CallState = 
  | 'idle' 
  | 'ringing' 
  | 'connected' 
  | 'csr-speaking' 
  | 'on-hold' 
  | 'member-speaking' 
  | 'processing' 
  | 'completed';

interface DialerFeedbackReport {
  provider: 'gemini' | 'fallback';
  model: string;
  overallSummary: string;
  totalScore: number;
  passingScore: number;
  passed: boolean;
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

// Icons as components for the dialer
const PhoneRingIcon = () => (
  <svg className="w-16 h-16 animate-pulse text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const PhoneOffIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
  </svg>
);

const PauseIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const MicIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const MicOffIcon = () => (
  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

// API functions
async function fetchAvailableScenarios(): Promise<CallScenario[]> {
  const response = await fetch('/api/call-simulation/scenarios');
  if (!response.ok) throw new Error('Failed to fetch scenarios');
  return response.json();
}

async function startCallSimulation(scenarioId: string): Promise<CallSession> {
  const response = await fetch('/api/call-simulation/sessions/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call_scenario_id: scenarioId }),
  });
  if (!response.ok) throw new Error('Failed to start session');
  return response.json();
}

async function recordTurn(data: {
  session_id: string;
  step_index: number;
  step_id: string;
  speaker: 'csr' | 'member';
  suggested_csr_script?: string;
  trainee_transcript?: string;
  member_response?: string;
  turn_duration_seconds: number;
}): Promise<{ success: boolean; turn_id: string; step_score: number }> {
  const response = await fetch('/api/call-simulation/sessions/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to record turn');
  return response.json();
}

async function holdResumeCall(sessionId: string, action: 'hold' | 'resume'): Promise<{
  action: string;
  member_response_text?: string;
  hold_audio_url?: string;
  next_step_index?: number;
  next_step?: ScriptFlowStep;
  is_complete?: boolean;
}> {
  const response = await fetch('/api/call-simulation/sessions/hold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, action }),
  });
  if (!response.ok) throw new Error('Failed to hold/resume call');
  return response.json();
}

async function completeCallSimulation(sessionId: string): Promise<{
  session_id: string;
  total_score: number;
  passing_score: number;
  passed: boolean;
  ai_evaluation: DialerFeedbackReport;
  certificate_id?: string;
  full_transcript: string;
}> {
  const response = await fetch('/api/call-simulation/sessions/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!response.ok) throw new Error('Failed to complete session');
  return response.json();
}

async function synthesizeSpeech(text: string): Promise<{ audio_base64?: string }> {
  const response = await fetch(`/api/call-simulation/tts?text=${encodeURIComponent(text)}`);
  if (!response.ok) throw new Error('Failed to synthesize speech');
  return response.json();
}

// Main Dialer Component
export default function TraineeCallSimulationDialer() {
  const [scenarios, setScenarios] = useState<CallScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<CallScenario | null>(null);
  const [session, setSession] = useState<CallSession | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [transcript, setTranscript] = useState<Array<{ speaker: string; text: string }>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [feedbackReport, setFeedbackReport] = useState<DialerFeedbackReport | null>(null);
  const [certificateId, setCertificateId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const finalTranscript = Array.from(event.results)
          .map((result) => result[0]?.transcript || '')
          .join(' ')
          .trim();
        if (finalTranscript) {
          setCurrentTranscript((prev) => prev + ' ' + finalTranscript);
        }
      };

      recognition.onerror = () => {
        setIsRecording(false);
        toast.error('Speech recognition error');
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Load available scenarios
  useEffect(() => {
    async function loadScenarios() {
      try {
        const data = await fetchAvailableScenarios();
        setScenarios(data);
      } catch (error) {
        console.error('Failed to load scenarios:', error);
      }
    }
    loadScenarios();
  }, []);

  // Timer for elapsed time
  useEffect(() => {
    if (callState === 'connected' || callState === 'csr-speaking' || callState === 'on-hold') {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Play ringtone
  const playRingtone = useCallback(async () => {
    if (session?.scenario.ringer_audio_url && audioRef.current) {
      audioRef.current.src = session.scenario.ringer_audio_url;
      audioRef.current.loop = true;
      await audioRef.current.play();
    }
  }, [session]);

  // Stop ringtone
  const stopRingtone = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  // Start a call simulation
  const handleStartCall = async (scenario: CallScenario) => {
    setIsLoading(true);
    try {
      setSelectedScenario(scenario);
      const newSession = await startCallSimulation(scenario.id);
      setSession(newSession);
      setCallState('ringing');
      setCurrentStepIndex(0);
      setTranscript([]);
      setElapsedTime(0);
      setFeedbackReport(null);
      setCertificateId(null);
      
      await playRingtone();
      toast.info('Call incoming...');
    } catch (error) {
      console.error('Failed to start call:', error);
      toast.error('Failed to start call simulation');
    } finally {
      setIsLoading(false);
    }
  };

  // Accept the call
  const handleAcceptCall = async () => {
    if (!session) return;
    
    stopRingtone();
    setCallState('connected');
    
    // Get first step's CSR script
    const firstStep = session.scenario.script_flow[0];
    if (firstStep) {
      toast.info('Call connected. Follow the script and speak when ready.');
    }
  };

  // Start recording (CSR speaks)
  const handleStartRecording = async () => {
    if (!session) return;
    
    setIsRecording(true);
    setCurrentTranscript('');
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
      }
    }
  };

  // Stop recording and process turn
  const handleStopRecording = async () => {
    if (!session || !recognitionRef.current) return;
    
    setIsRecording(false);
    recognitionRef.current.stop();
    
    const currentStep = session.scenario.script_flow[currentStepIndex];
    if (!currentStep) return;
    
    setCallState('processing');
    
    try {
      // Record CSR turn
      await recordTurn({
        session_id: session.session_id,
        step_index: currentStepIndex,
        step_id: currentStep.step_id,
        speaker: 'csr',
        suggested_csr_script: currentStep.suggested_csr_script,
        trainee_transcript: currentTranscript,
        turn_duration_seconds: 0,
      });
      
      // Add to transcript display
      setTranscript((prev) => [...prev, { speaker: 'CSR (You)', text: currentTranscript }]);
      
      // Auto-hold to trigger member response
      await handleHold();
    } catch (error) {
      console.error('Failed to record turn:', error);
      toast.error('Failed to record your response');
      setCallState('connected');
    }
  };

  // Hold the call (triggers AI member response)
  const handleHold = async () => {
    if (!session) return;
    
    setCallState('on-hold');
    
    try {
      const result = await holdResumeCall(session.session_id, 'hold');
      
      if (result.member_response_text) {
        setCallState('member-speaking');
        
        // Play TTS for member response
        try {
          const ttsResult = await synthesizeSpeech(result.member_response_text);
          if (ttsResult.audio_base64) {
            const audio = new Audio(`data:audio/wav;base64,${ttsResult.audio_base64}`);
            await audio.play();
          }
        } catch (error) {
          console.error('TTS failed:', error);
        }
        
        // Record member turn
        await recordTurn({
          session_id: session.session_id,
          step_index: currentStepIndex,
          step_id: session.scenario.script_flow[currentStepIndex]?.step_id || '',
          speaker: 'member',
          member_response: result.member_response_text,
          turn_duration_seconds: 0,
        });
        
        // Add to transcript
        setTranscript((prev) => [...prev, { speaker: 'Member (AI)', text: result.member_response_text || '' }]);
      }
      
      // Move to next step or complete
      if (result.is_complete) {
        await handleEndCall();
      } else {
        setCurrentStepIndex((prev) => prev + 1);
      }
    } catch (error) {
      console.error('Hold failed:', error);
      toast.error('Failed to process hold');
    }
  };

  // Resume the call (move to next CSR step)
  const handleResume = async () => {
    if (!session) return;
    
    try {
      const result = await holdResumeCall(session.session_id, 'resume');
      
      if (result.is_complete) {
        await handleEndCall();
      } else {
        setCallState('connected');
        toast.info('Continue with the next step of the script');
      }
    } catch (error) {
      console.error('Resume failed:', error);
      toast.error('Failed to resume call');
    }
  };

  // End the call
  const handleEndCall = async () => {
    if (!session) return;
    
    setCallState('processing');
    stopRingtone();
    
    try {
      const result = await completeCallSimulation(session.session_id);
      
      setFeedbackReport(result.ai_evaluation);
      setCertificateId(result.certificate_id || null);
      setCallState('completed');
      
      if (result.passed) {
        toast.success(`Congratulations! You passed with ${result.total_score.toFixed(1)}%`);
      } else {
        toast.info(`Session complete. Score: ${result.total_score.toFixed(1)}%`);
      }
    } catch (error) {
      console.error('Failed to complete call:', error);
      toast.error('Failed to complete call simulation');
      setCallState('idle');
    }
  };

  // Reset to idle
  const handleReset = () => {
    setSession(null);
    setSelectedScenario(null);
    setCallState('idle');
    setCurrentStepIndex(0);
    setTranscript([]);
    setCurrentTranscript('');
    setFeedbackReport(null);
    setCertificateId(null);
    setElapsedTime(0);
    stopRingtone();
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get current step's suggested script
  const currentStep = session?.scenario.script_flow[currentStepIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <audio ref={audioRef} />
      
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Call Simulation</h1>
          <p className="text-slate-400">Practice your BPO calls with AI-powered scenarios</p>
        </div>

        {/* Scenario Selection (when idle) */}
        {callState === 'idle' && (
          <div className="bg-slate-800 rounded-xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-white mb-4">Available Scenarios</h2>
            {scenarios.length === 0 ? (
              <p className="text-slate-400">No scenarios available. Check back later.</p>
            ) : (
              <div className="grid gap-4">
                {scenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="bg-slate-700 rounded-lg p-4 hover:bg-slate-600 transition-colors cursor-pointer"
                    onClick={() => handleStartCall(scenario)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-medium text-white">{scenario.topic}</h3>
                        <p className="text-slate-400 text-sm mt-1">{scenario.description}</p>
                        <p className="text-slate-500 text-xs mt-2">
                          {scenario.script_flow.length} steps • Passing score: {scenario.passing_score}%
                        </p>
                      </div>
                      <button
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartCall(scenario);
                        }}
                        disabled={isLoading}
                      >
                        Start Call
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dialer UI */}
        {callState !== 'idle' && (
          <div className="bg-slate-800 rounded-xl p-6 shadow-xl">
            {/* Call Status Header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {session?.scenario.topic || 'Call Simulation'}
                </h2>
                <p className="text-slate-400 text-sm">
                  Step {currentStepIndex + 1} of {session?.scenario.script_flow.length || 0}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono text-green-400">{formatTime(elapsedTime)}</div>
                <div className={`text-sm font-medium ${
                  callState === 'ringing' ? 'text-yellow-400' :
                  callState === 'connected' ? 'text-green-400' :
                  callState === 'on-hold' ? 'text-orange-400' :
                  callState === 'member-speaking' ? 'text-blue-400' :
                  callState === 'processing' ? 'text-purple-400' :
                  'text-slate-400'
                }`}>
                  {callState === 'ringing' && '🔔 Ringing'}
                  {callState === 'connected' && '✓ Connected'}
                  {callState === 'csr-speaking' && '🎤 Your Turn'}
                  {callState === 'on-hold' && '⏸ On Hold'}
                  {callState === 'member-speaking' && '🔊 Member Speaking'}
                  {callState === 'processing' && '⏳ Processing...'}
                  {callState === 'completed' && '✓ Completed'}
                </div>
              </div>
            </div>

            {/* Current Script Step */}
            {currentStep && callState !== 'completed' && (
              <div className="bg-slate-700 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-slate-400 mb-2">Your Script:</h3>
                <p className="text-white text-lg">{currentStep.suggested_csr_script}</p>
                <p className="text-slate-500 text-sm mt-2">Points: {currentStep.point_value}</p>
              </div>
            )}

            {/* Transcript Display */}
            <div className="bg-slate-900 rounded-lg p-4 mb-6 max-h-48 overflow-y-auto">
              <h3 className="text-sm font-medium text-slate-400 mb-2">Transcript</h3>
              {transcript.length === 0 ? (
                <p className="text-slate-500 text-sm">No transcript yet...</p>
              ) : (
                transcript.map((entry, index) => (
                  <div key={index} className="mb-2">
                    <span className={`font-medium ${entry.speaker.includes('You') ? 'text-green-400' : 'text-blue-400'}`}>
                      {entry.speaker}:
                    </span>
                    <span className="text-slate-300 ml-2">{entry.text}</span>
                  </div>
                ))
              )}
              {isRecording && (
                <div className="text-green-400 animate-pulse">🎤 Recording...</div>
              )}
            </div>

            {/* Call Controls */}
            {callState !== 'completed' && (
              <div className="flex justify-center gap-4">
                {/* Ringing State - Accept Button */}
                {callState === 'ringing' && (
                  <button
                    onClick={handleAcceptCall}
                    className="bg-green-600 hover:bg-green-700 text-white p-6 rounded-full shadow-lg transition-all hover:scale-105"
                  >
                    <PhoneRingIcon />
                  </button>
                )}

                {/* Connected State - Record Button */}
                {callState === 'connected' && (
                  <button
                    onClick={isRecording ? handleStopRecording : handleStartRecording}
                    className={`${
                      isRecording 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-green-600 hover:bg-green-700'
                    } text-white p-6 rounded-full shadow-lg transition-all hover:scale-105 flex items-center gap-2`}
                  >
                    {isRecording ? <MicOffIcon /> : <MicIcon />}
                    <span className="font-medium">{isRecording ? 'Stop' : 'Speak'}</span>
                  </button>
                )}

                {/* CSR Speaking State - Hold Button */}
                {callState === 'csr-speaking' && (
                  <button
                    onClick={handleHold}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg shadow-lg transition-all hover:scale-105 flex items-center gap-2"
                  >
                    <PauseIcon />
                    <span className="font-medium">Hold (Next Step)</span>
                  </button>
                )}

                {/* On Hold State - Resume Button */}
                {callState === 'on-hold' && (
                  <button
                    onClick={handleResume}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-lg transition-all hover:scale-105 flex items-center gap-2"
                  >
                    <PlayIcon />
                    <span className="font-medium">Resume</span>
                  </button>
                )}

                {/* Member Speaking - Wait indicator */}
                {callState === 'member-speaking' && (
                  <div className="text-blue-400 flex items-center gap-2">
                    <span className="animate-pulse">🔊 Playing member response...</span>
                  </div>
                )}

                {/* Processing State */}
                {callState === 'processing' && (
                  <div className="text-purple-400 flex items-center gap-2">
                    <span className="animate-pulse">⏳ Processing...</span>
                  </div>
                )}

                {/* End Call Button (always visible except ringing) */}
                {callState !== 'ringing' && callState !== 'processing' && (
                  <button
                    onClick={handleEndCall}
                    className="bg-red-600 hover:bg-red-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-105"
                    title="End Call"
                  >
                    <PhoneOffIcon />
                  </button>
                )}
              </div>
            )}

            {/* Results / Feedback Report */}
            {callState === 'completed' && feedbackReport && (
              <div className="mt-6">
                <div className={`text-center mb-6 ${feedbackReport.passed ? 'text-green-400' : 'text-red-400'}`}>
                  <h3 className="text-2xl font-bold">
                    {feedbackReport.passed ? '🎉 Passed!' : '📚 Needs Improvement'}
                  </h3>
                  <p className="text-lg">
                    Score: {feedbackReport.totalScore.toFixed(1)}% 
                    (Passing: {feedbackReport.passingScore}%)
                  </p>
                </div>

                {/* Score Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-700 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-white">{feedbackReport.scriptAccuracy.score}%</div>
                    <div className="text-slate-400 text-sm">Script Accuracy</div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-white">{feedbackReport.grammarAndPronunciation.score}%</div>
                    <div className="text-slate-400 text-sm">Grammar & Pronunciation</div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-white">{feedbackReport.softSkills.score}%</div>
                    <div className="text-slate-400 text-sm">Soft Skills</div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-white">{feedbackReport.pacingAndAht.ahtSeconds}s</div>
                    <div className="text-slate-400 text-sm">AHT</div>
                  </div>
                </div>

                {/* Overall Summary */}
                <div className="bg-slate-700 rounded-lg p-4 mb-6">
                  <h4 className="text-lg font-semibold text-white mb-2">Overall Summary</h4>
                  <p className="text-slate-300">{feedbackReport.overallSummary}</p>
                </div>

                {/* Coaching Tips */}
                {feedbackReport.coachingTips.length > 0 && (
                  <div className="bg-slate-700 rounded-lg p-4 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-2">Coaching Tips</h4>
                    <ul className="list-disc list-inside text-slate-300">
                      {feedbackReport.coachingTips.map((tip, index) => (
                        <li key={index} className="mb-1">{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Certificate Download */}
                {certificateId && feedbackReport.passed && (
                  <div className="bg-green-900/30 border border-green-600 rounded-lg p-4 text-center">
                    <h4 className="text-lg font-semibold text-green-400 mb-2">🎉 Congratulations!</h4>
                    <p className="text-slate-300 mb-4">You have earned a certificate for completing this scenario.</p>
                    <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 mx-auto">
                      <DownloadIcon />
                      Download Certificate
                    </button>
                  </div>
                )}

                {/* Start New Call */}
                <div className="text-center mt-6">
                  <button
                    onClick={handleReset}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
                  >
                    Start New Call
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
