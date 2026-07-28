"use client";

import { useAudioCapture, type AssessmentResult } from '@/hooks/useAudioCapture';
import { useState } from 'react';
import { AudioVisualizer } from './AudioVisualizer';

export default function InlinePronunciationRecorder({
  referenceText,
  onResult,
  disabled,
  moduleId,
  trainerId,
}: {
  referenceText: string;
  onResult: (result: AssessmentResult) => void;
  disabled?: boolean;
  moduleId?: string;
  trainerId?: string;
}) {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const {
    startRecording,
    stopRecording,
    resetAssessment,
    getAnalyser,
    isRecording,
    isProcessing,
    error,
    lastResult,
  } = useAudioCapture({
    referenceText,
    onResult: (r) => onResult(r),
    moduleId,
    trainerId,
  });

  const begin = async () => {
    resetAssessment();
    await startRecording();
    setAnalyser(getAnalyser());
  };

  const finish = async () => {
    await stopRecording();
  };

  return (
    <div className="space-y-3">
      <AudioVisualizer analyser={analyser} isActive={isRecording} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void begin()}
          disabled={isRecording || isProcessing || disabled}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
        >
          Start Recording
        </button>
        <button
          type="button"
          onClick={() => void finish()}
          disabled={!isRecording || isProcessing || disabled}
          className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {isProcessing ? 'Assessing...' : 'Stop and Assess'}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {lastResult ? (
        <div className="space-y-2">
          <div className="rounded-lg border p-3">
            <div className="text-xs font-semibold text-muted-foreground">Transcript</div>
            <div className="mt-2 text-sm text-foreground">{lastResult.transcription || lastResult.text || 'No transcript'}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
