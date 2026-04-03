'use client';

import { useState } from 'react';
import { AudioVisualizer } from './AudioVisualizer';
import { useAudioCapture, type AssessmentResult } from '@/hooks/useAudioCapture';

export default function SpeechRecorder() {
  const [referenceText, setReferenceText] = useState(
    'Thank you for calling. I understand your concern and I will help you right away.',
  );
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const {
    startRecording,
    stopRecording,
    resetAssessment,
    getAnalyser,
    isRecording,
    isProcessing,
    error,
  } = useAudioCapture({
    referenceText,
    onResult: (assessment) => {
      setResult(assessment);
    },
  });

  const begin = async () => {
    setResult(null);
    resetAssessment();
    await startRecording();
    setAnalyser(getAnalyser());
  };

  const finish = async () => {
    await stopRecording();
  };

  const scoreTone = (score: number) => {
    if (score >= 85) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (score >= 70) return 'border-amber-200 bg-amber-50 text-amber-800';
    return 'border-red-200 bg-red-50 text-red-800';
  };

  return (
    <div className="mx-auto max-w-4xl rounded-3xl border border-border bg-card p-8 shadow-xl">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-foreground">Speech Assessment</h2>
        <p className="mt-2 text-muted-foreground">
          Authenticated upload workflow with instant feedback against a gold-standard script.
        </p>
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-semibold text-foreground">
          Reference Script
        </label>
        <textarea
          value={referenceText}
          onChange={(event) => setReferenceText(event.target.value)}
          disabled={isRecording || isProcessing}
          rows={4}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
        />
      </div>

      <div className="rounded-2xl border border-border/70 bg-muted/35 p-5">
        <AudioVisualizer analyser={analyser} isActive={isRecording} />

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void begin()}
            disabled={isRecording || isProcessing}
            className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            Start Recording
          </button>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={!isRecording || isProcessing}
            className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {isProcessing ? 'Assessing...' : 'Stop and Assess'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <ScoreCard
              label="Overall"
              value={result.overall_score || 0}
              tone={scoreTone(result.overall_score || 0)}
            />
            <ScoreCard
              label="Accuracy"
              value={result.scores?.phonetic_accuracy || result.accuracy_percentage || 0}
              tone={scoreTone(result.scores?.phonetic_accuracy || result.accuracy_percentage || 0)}
            />
            <ScoreCard
              label="Fluency"
              value={result.scores?.fluency || 0}
              tone={scoreTone(result.scores?.fluency || 0)}
            />
            <ScoreCard
              label="Grammar"
              value={result.scores?.grammar_precision || 0}
              tone={scoreTone(result.scores?.grammar_precision || 0)}
            />
          </div>

          <div className="rounded-2xl border border-border p-5">
            <div className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Transcript
            </div>
            <p className="text-foreground">
              {result.transcription || result.text || 'No transcript available.'}
            </p>
          </div>

          <div className="rounded-2xl border border-border p-5">
            <div className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Detected Errors
            </div>
            <div className="space-y-2">
              {(result.detected_errors || []).length ? (
                result.detected_errors?.map((issue, index) => (
                  <div key={`${issue.category}-${index}`} className="rounded-xl border border-border bg-muted/35 px-4 py-3 text-sm text-foreground">
                    {issue.message}
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No major issues detected.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${tone}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.16em]">{label}</div>
      <div className="mt-2 text-4xl font-bold">{Math.round(value)}</div>
    </div>
  );
}
