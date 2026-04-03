import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAudioCaptureOptions {
  scenarioId?: string;
  referenceText?: string;
  onResult?: (result: AssessmentResult) => void;
}

export interface AssessmentWordFeedback {
  word: string;
  expected_word?: string | null;
  accuracy: number;
  error_type: string;
  category?: string;
  color?: string;
  start?: number | null;
  end?: number | null;
}

export interface AssessmentResult {
  status: string;
  provider?: string;
  provider_metadata?: Record<string, unknown>;
  reference_text?: string;
  transcription?: string;
  text?: string;
  transcription_confidence?: number;
  accuracy_percentage?: number;
  overall_score?: number;
  overall_scores?: {
    accuracy: number;
    fluency: number;
    completeness: number;
    prosody: number;
  };
  scores?: {
    phonetic_accuracy: number;
    fluency: number;
    grammar_precision: number;
    keyword_adherence: number;
    transcription_confidence?: number;
    speech_rate_wpm?: number | null;
  };
  word_feedback?: AssessmentWordFeedback[];
  words?: Array<{
    word: string;
    accuracy: number;
    error_type: string;
  }>;
  detected_errors?: Array<{
    category: string;
    severity: string;
    expected?: string | string[] | null;
    actual?: string | string[] | null;
    message: string;
  }>;
  detected_disfluencies?: {
    filler_words: string[];
    filler_count: number;
    repeated_words: string[];
    repeat_count: number;
    stutters: string[];
    stutter_count: number;
    hesitation_count: number;
  };
  coaching_tips?: string[];
  matched_keywords?: string[];
  session_id?: string;
  scenario_id?: string;
  scenario_title?: string;
  attempt_number?: number;
  error?: string;
}

type RecorderMime =
  | 'audio/webm;codecs=opus'
  | 'audio/webm'
  | 'audio/mp4'
  | '';

export const useAudioCapture = (options: UseAudioCaptureOptions = {}) => {
  const optionsRef = useRef(options);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitorFrameRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const peakAudioLevelRef = useRef<number>(0);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bytesRecorded, setBytesRecorded] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastResult, setLastResult] = useState<AssessmentResult | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const getSupportedMimeType = (): RecorderMime => {
    if (typeof MediaRecorder === 'undefined') {
      return '';
    }

    const candidates: RecorderMime[] = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ];

    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  };

  const stopMonitoring = useCallback(() => {
    if (monitorFrameRef.current) {
      cancelAnimationFrame(monitorFrameRef.current);
      monitorFrameRef.current = null;
    }
  }, []);

  const cleanupAudioGraph = useCallback(() => {
    stopMonitoring();

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
  }, [stopMonitoring]);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const monitorAudioLevel = () => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }

    const buffer = new Uint8Array(analyser.fftSize);
    const sample = () => {
      if (!analyserRef.current) {
        return;
      }

      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        const normalized = (buffer[index] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / buffer.length);
      peakAudioLevelRef.current = Math.max(peakAudioLevelRef.current, rms);
      setAudioLevel(Math.min(rms * 8, 1));
      monitorFrameRef.current = requestAnimationFrame(sample);
    };

    sample();
  };

  const uploadRecording = async (blob: Blob): Promise<AssessmentResult> => {
    const { scenarioId, referenceText, onResult } = optionsRef.current;
    const token = localStorage.getItem('token');

    if (!scenarioId && !referenceText) {
      throw new Error('A scenario or reference script is required before recording.');
    }

    const durationSeconds =
      recordingStartedAtRef.current > 0
        ? (performance.now() - recordingStartedAtRef.current) / 1000
        : undefined;

    const extension = blob.type.includes('mp4')
      ? 'm4a'
      : blob.type.includes('webm')
        ? 'webm'
        : 'audio';

    const formData = new FormData();
    if (scenarioId) {
      formData.append('scenario_id', scenarioId);
    }
    if (referenceText) {
      formData.append('reference_text', referenceText);
    }
    if (durationSeconds) {
      formData.append('response_duration', durationSeconds.toFixed(2));
    }
    if (peakAudioLevelRef.current > 0) {
      formData.append('volume_level', peakAudioLevelRef.current.toFixed(4));
    }
    formData.append('file', blob, `practice-attempt.${extension}`);

    const response = await fetch('/api/trainee/asr/assess', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as
      | AssessmentResult
      | { detail?: string }
      | null;

    if (!response.ok) {
      throw new Error(
        (payload && 'detail' in payload && payload.detail) ||
          (payload && 'error' in payload && payload.error) ||
          'Speech assessment failed.',
      );
    }

    const result = payload as AssessmentResult;
    setLastResult(result);
    onResult?.(result);
    return result;
  };

  const startRecording = async () => {
    try {
      setError(null);
      setLastResult(null);
      setBytesRecorded(0);
      setAudioLevel(0);
      peakAudioLevelRef.current = 0;
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
      recordingStartedAtRef.current = performance.now();

      const AudioContextClass =
        window.AudioContext ||
        (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (AudioContextClass) {
        const audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        sourceRef.current = source;
        monitorAudioLevel();
      }

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, {
            mimeType,
            audioBitsPerSecond: 128000,
          })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          setBytesRecorded((previous) => previous + event.data.size);
        }
      };

      recorder.onerror = () => {
        setError('Recording failed. Please retry.');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to access the microphone.';
      setError(message);
      cleanupAudioGraph();
      cleanupStream();
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return null;
    }

    if (recorder.state === 'inactive') {
      return lastResult;
    }

    setIsProcessing(true);

    return new Promise<AssessmentResult | null>((resolve, reject) => {
      recorder.onstop = async () => {
        try {
          const mimeType = recorder.mimeType || getSupportedMimeType() || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const result = await uploadRecording(blob);
          resolve(result);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Unable to process the recording.';
          setError(message);
          reject(err);
        } finally {
          mediaRecorderRef.current = null;
          chunksRef.current = [];
          setIsRecording(false);
          setIsProcessing(false);
          setAudioLevel(0);
          cleanupAudioGraph();
          cleanupStream();
        }
      };

      recorder.stop();
    });
  };

  const resetAssessment = () => {
    setLastResult(null);
    setError(null);
  };

  const getAnalyser = () => analyserRef.current;

  useEffect(() => {
    return () => {
      stopMonitoring();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      cleanupAudioGraph();
      cleanupStream();
    };
  }, [cleanupAudioGraph, cleanupStream, stopMonitoring]);

  return {
    startRecording,
    stopRecording,
    resetAssessment,
    getAnalyser,
    isRecording,
    isProcessing,
    error,
    bytesRecorded,
    audioLevel,
    lastResult,
  };
};
