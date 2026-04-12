'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SimFloorTurnResult {
  session_id: string;
  step_number: number;
  transcript: string;
  audio_url?: string | null;
  duration_seconds: number;
  asr_provider?: string | null;
  asr_provider_label?: string | null;
  transcript_confidence?: number | null;
  matched_keywords: string[];
  speech_to_text_accuracy: number;
  grammar_score: number;
  pronunciation_score: number;
  pacing_score: number;
  rate_of_speech: number;
  dead_air_seconds: number;
  ai_feedback?: string | null;
  requires_repeat?: boolean;
  repeat_prompt?: string | null;
  repeat_reason?: string | null;
  script_similarity?: number;
  next_step?: number | null;
  is_complete: boolean;
  transcript_log: Array<Record<string, unknown>>;
  turn_logs: Array<Record<string, unknown>>;
}

interface UseSpeechToTextOptions {
  sessionId?: string;
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}) {
  const optionsRef = useRef(options);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SimFloorTurnResult | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const cleanupGraph = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const monitorAudio = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const buffer = new Uint8Array(analyser.fftSize);
    const render = () => {
      const activeAnalyser = analyserRef.current;
      if (!activeAnalyser) return;
      activeAnalyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        const normalized = (buffer[index] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / buffer.length);
      setAudioLevel(Math.min(rms * 8, 1));
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setLastResult(null);
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
      },
    });

    streamRef.current = stream;
    startedAtRef.current = performance.now();

    const AudioContextClass =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      monitorAudio();
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start(250);
    setIsRecording(true);
  }, [monitorAudio]);

  const stopRecording = useCallback(
    async ({ stepNumber, liveTranscript }: { stepNumber: number; liveTranscript?: string }) => {
      const recorder = mediaRecorderRef.current;
      const sessionId = optionsRef.current.sessionId;
      if (!recorder || !sessionId) {
        return null;
      }

      if (recorder.state === 'inactive') {
        return lastResult;
      }

      setIsProcessing(true);

      return new Promise<SimFloorTurnResult | null>((resolve, reject) => {
        recorder.onstop = async () => {
          try {
            const durationSeconds =
              startedAtRef.current > 0 ? (performance.now() - startedAtRef.current) / 1000 : 0;
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            const formData = new FormData();
            formData.append('step_number', String(stepNumber));
            formData.append('audio_duration_seconds', durationSeconds.toFixed(2));
            if (liveTranscript?.trim()) {
              formData.append('live_transcript', liveTranscript.trim());
            }
            formData.append('file', blob, `step-${stepNumber}.webm`);

            const token = localStorage.getItem('token');
            const response = await fetch(`/api/sim-floor/session/${sessionId}/turn`, {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
              body: formData,
            });
            const payload = (await response.json().catch(() => null)) as
              | SimFloorTurnResult
              | { detail?: string }
              | null;
            if (!response.ok) {
              throw new Error((payload && 'detail' in payload && payload.detail) || 'Unable to submit turn.');
            }

            const result = payload as SimFloorTurnResult;
            setLastResult(result);
            resolve(result);
          } catch (recordError) {
            const message = recordError instanceof Error ? recordError.message : 'Unable to process the recording.';
            setError(message);
            reject(recordError);
          } finally {
            mediaRecorderRef.current = null;
            chunksRef.current = [];
            setIsRecording(false);
            setIsProcessing(false);
            cleanupGraph();
            cleanupStream();
          }
        };

        recorder.stop();
      });
    },
    [cleanupGraph, cleanupStream, lastResult],
  );

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      cleanupGraph();
      cleanupStream();
    };
  }, [cleanupGraph, cleanupStream]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isProcessing,
    audioLevel,
    error,
    lastResult,
    analyser: analyserRef.current,
  };
}
