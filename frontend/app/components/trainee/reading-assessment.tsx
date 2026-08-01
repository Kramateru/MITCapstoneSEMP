'use client';

import { LazyIcon } from '@/app/components/ui/LazyIcon';
import { useAuth } from '@/app/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

const Mic = (props: any) => <LazyIcon name="Mic" {...props} />;
const Pause = (props: any) => <LazyIcon name="Pause" {...props} />;
const Play = (props: any) => <LazyIcon name="Play" {...props} />;
const RotateCcw = (props: any) => <LazyIcon name="RotateCcw" {...props} />;
const Send = (props: any) => <LazyIcon name="Send" {...props} />;
const Square = (props: any) => <LazyIcon name="Square" {...props} />;

interface ReadingAssessmentProps {
  moduleId: string;
  reading: {
    title: string;
    readingTitle?: string;
    category?: string;
    difficulty?: string;
    language?: string;
    description?: string;
    instructions?: string;
    passingScore: number;
    wordCount: number;
    sentenceCount?: number;
    paragraphCount?: number;
    readingLevel?: string;
    estimatedReadingTime?: number;
    readingContent: string;
    readingRichContent?: string;
    maxAttempts?: number;
    timeLimitSeconds?: number | null;
    allowReplay?: boolean;
    allowPause?: boolean;
    autoSubmit?: boolean;
  };
  onComplete?: (attemptId: string) => void;
}

type Stage = 'preparation' | 'recording' | 'paused' | 'review' | 'uploading' | 'processing' | 'complete';

type WordStatus = 'unread' | 'current' | 'correct' | 'mispronounced' | 'omitted' | 'extra' | 'repeated' | 'uncertain';

interface WordAnalysisRow {
  word_index: number;
  expected_word: string;
  spoken_word?: string | null;
  status: WordStatus;
  confidence?: number | null;
  phoneme_data?: Record<string, any>;
  feedback?: string | null;
}

interface ReadingResult {
  attempt_id: string;
  status: string;
  score: number;
  overall_score?: number;
  pronunciation_score?: number;
  accuracy?: number;
  fluency?: number;
  completeness?: number;
  confidence?: number;
  passing_score: number;
  passed: boolean;
  word_count: number;
  correct_words: number;
  mispronounced_words: number;
  omitted_words: number;
  extra_words: number;
  repeated_words?: number;
  words_per_minute?: number;
  duration_seconds?: number;
  strengths?: string;
  improvement_areas?: string;
  recommendations?: string;
  common_issues?: any;
  score_breakdown?: Record<string, any>;
  word_analysis?: WordAnalysisRow[];
  transcript?: string;
  audio_url?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: any) => void) | null;
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

function tokenize(value: string) {
  return (value || '').toLowerCase().match(/\b[\w']+\b/g) || [];
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function safePercent(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function getPaceLabel(wordsPerMinute?: number | null) {
  const wpm = Number(wordsPerMinute || 0);
  if (!wpm) return 'Pending';
  if (wpm < 100) return 'Too Slow';
  if (wpm > 170) return 'Too Fast';
  return 'Normal';
}

function getMicStatusCopy(status: 'checking' | 'ready' | 'permission_needed' | 'missing' | 'unsupported') {
  switch (status) {
    case 'ready':
      return 'Microphone Ready';
    case 'permission_needed':
      return 'Microphone Permission Needed';
    case 'missing':
      return 'Microphone Not Detected';
    case 'unsupported':
      return 'Recording Not Supported';
    default:
      return 'Checking Microphone';
  }
}

function getSupportedRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return '';
  }
  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
}

function extensionForAudioMimeType(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

function getStatusClass(status: WordStatus) {
  switch (status) {
    case 'current':
      return 'border-sky-300 bg-sky-100 text-sky-900';
    case 'correct':
      return 'border-emerald-300 bg-emerald-100 text-emerald-900';
    case 'mispronounced':
    case 'uncertain':
      return 'border-rose-300 bg-rose-100 text-rose-900';
    case 'omitted':
      return 'border-amber-300 bg-amber-100 text-amber-900';
    case 'extra':
      return 'border-orange-300 bg-orange-100 text-orange-900';
    case 'repeated':
      return 'border-orange-300 bg-orange-100 text-orange-900';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function collectSpeechTranscript(event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) {
  const parts: string[] = [];
  for (let index = 0; index < event.results.length; index += 1) {
    const item = event.results[index]?.[0];
    if (item?.transcript) {
      parts.push(item.transcript);
    }
  }
  return parts.join(' ').trim();
}

function sanitizeReadingMarkup(value: string) {
  const allowedTags = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote']);
  return (value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (tag, rawName) => {
      const name = String(rawName || '').toLowerCase();
      if (!allowedTags.has(name)) {
        return '';
      }
      return tag.startsWith('</') ? `</${name}>` : `<${name}>`;
    });
}

export function TraineeReadingAssessment({ moduleId, reading, onComplete }: ReadingAssessmentProps) {
  const router = useRouter();
  const { token } = useAuth();
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>('preparation');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [attemptId, setAttemptId] = useState('');
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);
  const [results, setResults] = useState<ReadingResult | null>(null);
  const [attemptHistory, setAttemptHistory] = useState<Array<{
    id: string;
    attempt_number: number;
    status: string;
    score?: number | null;
    accuracy?: number | null;
    fluency?: number | null;
    confidence?: number | null;
    words_per_minute?: number | null;
    duration_seconds?: number | null;
    improvement?: number | null;
    passed: boolean;
    completed_at?: string | null;
  }>>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [micStatus, setMicStatus] = useState<'checking' | 'ready' | 'permission_needed' | 'missing' | 'unsupported'>('checking');
  const [submitting, setSubmitting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const passageWords = useMemo(() => tokenize(reading.readingContent), [reading.readingContent]);
  const richPassageHtml = useMemo(
    () => sanitizeReadingMarkup(reading.readingRichContent || ''),
    [reading.readingRichContent],
  );
  const liveWords = useMemo(() => tokenize(liveTranscript), [liveTranscript]);
  const passageSentences = useMemo(
    () => (reading.readingContent || '').split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean),
    [reading.readingContent],
  );
  const spokenProgress = Math.min(passageWords.length, liveWords.length);
  const progressValue = passageWords.length ? (spokenProgress / passageWords.length) * 100 : 0;
  const currentSentence = useMemo(() => {
    if (!passageSentences.length) {
      return reading.readingContent;
    }
    let wordCursor = 0;
    for (const sentence of passageSentences) {
      const sentenceWordCount = tokenize(sentence).length;
      if (spokenProgress <= wordCursor + sentenceWordCount) {
        return sentence;
      }
      wordCursor += sentenceWordCount;
    }
    return passageSentences[passageSentences.length - 1];
  }, [passageSentences, reading.readingContent, spokenProgress]);

  useEffect(() => () => cleanupRecording(), []);
  useEffect(() => {
    void loadAttemptHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, token]);
  useEffect(() => {
    void checkMicrophoneStatus();
  }, []);
  useEffect(() => {
    if (!reading.timeLimitSeconds || stage !== 'recording') {
      return;
    }
    if (recordingTime >= reading.timeLimitSeconds) {
      stopRecording();
      if (reading.autoSubmit) {
        window.setTimeout(() => void handleSubmit(), 250);
      }
    }
  }, [recordingTime, reading.autoSubmit, reading.timeLimitSeconds, stage]);

  function authHeaders(): HeadersInit {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function readError(response: Response) {
    const data = await response.json().catch(() => null);
    return data?.detail || data?.message || response.statusText || 'Request failed';
  }

  async function loadAttemptHistory() {
    try {
      const response = await fetch(`/api/trainee/reading/modules/${moduleId}/history`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setAttemptHistory(Array.isArray(data.attempts) ? data.attempts : []);
    } catch {
      setAttemptHistory([]);
    }
  }

  async function checkMicrophoneStatus() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicStatus('unsupported');
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const hasAudioInput = devices.some((device) => device.kind === 'audioinput');
      if (devices.length && !hasAudioInput) {
        setMicStatus('missing');
        return;
      }

      const permissionsApi = (navigator as any).permissions;
      if (permissionsApi?.query) {
        const permission = await permissionsApi.query({ name: 'microphone' as PermissionName }).catch(() => null);
        if (permission?.state === 'granted') {
          setMicStatus('ready');
          return;
        }
        if (permission?.state === 'denied') {
          setMicStatus('permission_needed');
          return;
        }
      }

      setMicStatus(hasAudioInput || !devices.length ? 'permission_needed' : 'missing');
    } catch {
      setMicStatus('permission_needed');
    }
  }

  function cleanupRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (analyserFrameRef.current) {
      cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
  }

  function startTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(() => setRecordingTime((current) => current + 1), 1000);
  }

  function startLiveRecognition() {
    const RecognitionCtor = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : undefined;
    if (!RecognitionCtor) {
      return;
    }
    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = reading.language || 'en-US';
    recognition.onresult = (event) => setLiveTranscript(collectSpeechTranscript(event));
    recognition.onerror = () => undefined;
    recognition.onend = () => {
      if (recognitionRef.current === recognition && stage === 'recording') {
        try {
          recognition.start();
        } catch {
          recognitionRef.current = null;
        }
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }

  function startMicMeter(stream: MediaStream) {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
      setMicLevel(Math.min(100, Math.round((average / 160) * 100)));
      analyserFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  async function ensureAttempt() {
    if (attemptId) {
      return attemptId;
    }
    const response = await fetch(`/api/trainee/reading/attempts/${moduleId}/start`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const data = await response.json();
    setAttemptId(data.attempt_id);
    setAttemptNumber(data.attempt_number);
    return data.attempt_id as string;
  }

  async function startRecording() {
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setMicStatus('unsupported');
        toast({ title: 'Recording unsupported', description: 'This browser does not support microphone recording for this assessment.', variant: 'destructive' });
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      await ensureAttempt();
      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      streamRef.current = stream;
      setMicStatus('ready');

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType || recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        setAudioUrl(URL.createObjectURL(blob));
        cleanupRecording();
        setStage('review');
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setAudioBlob(null);
      setAudioUrl('');
      setLiveTranscript('');
      setRecordingTime(0);
      setStage('recording');
      startTimer();
      startMicMeter(stream);
      startLiveRecognition();
    } catch (error: any) {
      const name = error?.name || '';
      const isMicrophoneError = ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'SecurityError'].includes(name);
      const message = name === 'NotAllowedError'
        ? 'Microphone access was denied. Enable microphone permission and try again.'
        : name === 'NotFoundError'
          ? 'No microphone was found. Connect a microphone and try again.'
          : error?.message || 'Unable to start the reading assessment.';
      if (isMicrophoneError) {
        setMicStatus(name === 'NotFoundError' ? 'missing' : 'permission_needed');
      } else if (stream) {
        setMicStatus('ready');
      }
      toast({
        title: isMicrophoneError ? 'Microphone unavailable' : 'Unable to start reading',
        description: message,
        variant: 'destructive',
      });
      stream?.getTracks().forEach((track) => track.stop());
      cleanupRecording();
      setStage('preparation');
    }
  }

  function pauseRecording() {
    if (!reading.allowPause || mediaRecorderRef.current?.state !== 'recording') {
      return;
    }
    mediaRecorderRef.current.pause();
    recognitionRef.current?.stop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStage('paused');
  }

  function resumeRecording() {
    if (mediaRecorderRef.current?.state !== 'paused') {
      return;
    }
    mediaRecorderRef.current.resume();
    setStage('recording');
    startTimer();
    startLiveRecognition();
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  function restartRecording() {
    setAudioBlob(null);
    setAudioUrl('');
    setLiveTranscript('');
    setRecordingTime(0);
    setResults(null);
    void startRecording();
  }

  async function handleSubmit() {
    if (!audioBlob) {
      toast({ title: 'No recording', description: 'Record your reading before submitting.', variant: 'destructive' });
      return;
    }
    const activeAttemptId = attemptId || await ensureAttempt();
    setSubmitting(true);
    try {
      setStage('uploading');
      const formData = new FormData();
      formData.append('file', audioBlob, `reading-attempt.${extensionForAudioMimeType(audioBlob.type)}`);
      const uploadResponse = await fetch(`/api/trainee/reading/attempts/${activeAttemptId}/upload-audio`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (!uploadResponse.ok) {
        throw new Error(await readError(uploadResponse));
      }

      setStage('processing');
      const processResponse = await fetch(`/api/trainee/reading/attempts/${activeAttemptId}/process`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!processResponse.ok) {
        throw new Error(await readError(processResponse));
      }
      const processData = await processResponse.json();

      const detailResponse = await fetch(`/api/trainee/reading/attempts/${activeAttemptId}`, {
        headers: authHeaders(),
      });
      const detailData = detailResponse.ok ? await detailResponse.json() : processData;
      setResults({ ...processData, ...detailData });
      setStage('complete');
      void loadAttemptHistory();
      onComplete?.(activeAttemptId);
      toast({ title: 'Reading analyzed', description: 'Your pronunciation report is ready.' });
    } catch (error: any) {
      toast({
        title: 'Submission failed',
        description: error?.message || 'Unable to analyze the recording.',
        variant: 'destructive',
      });
      setStage('review');
    } finally {
      setSubmitting(false);
    }
  }

  function liveWordStatus(index: number, word: string): WordStatus {
    if (!liveWords.length || index >= liveWords.length) {
      return index === liveWords.length ? 'current' : 'unread';
    }
    return liveWords[index] === word ? 'correct' : 'mispronounced';
  }

  const finalWordAnalysis = results?.word_analysis || [];
  const displayWords = finalWordAnalysis.length
    ? finalWordAnalysis.map((item) => ({
      word: item.expected_word || item.spoken_word || '',
      status: item.status,
      feedback: item.feedback || '',
    }))
    : passageWords.map((word, index) => ({
      word,
      status: liveWordStatus(index, word),
      feedback: '',
    }));

  if (stage === 'complete' && results) {
    const score = safePercent(results.overall_score ?? results.score);
    const commonSounds = Array.isArray(results.common_issues?.sound_analysis)
      ? results.common_issues.sound_analysis
      : [];
    const wordRows = results.word_analysis || [];

    return (
      <div className="w-full space-y-4">
        <Card className={results.passed ? 'border-emerald-300' : 'border-amber-300'}>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>{results.passed ? 'Passed' : 'Needs Improvement'}</CardTitle>
                <CardDescription>Pronunciation reading report for {reading.readingTitle || reading.title}</CardDescription>
              </div>
              <Badge className={results.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                Attempt {attemptNumber || results.score_breakdown?.attempt_number || 1}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ['Overall', score],
                ['Pronunciation', results.pronunciation_score],
                ['Accuracy', results.accuracy],
                ['Fluency', results.fluency],
                ['Completeness', results.completeness],
                ['Confidence', results.confidence],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{safePercent(value)}%</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Words Correct" value={results.correct_words} />
              <Metric label="Mispronounced" value={results.mispronounced_words} />
              <Metric label="Skipped" value={results.omitted_words} />
              <Metric label="Repeated" value={results.repeated_words || 0} />
              <Metric label="Inserted" value={results.extra_words} />
              <Metric label="WPM" value={safePercent(results.words_per_minute)} />
              <Metric label="Pace" value={getPaceLabel(results.words_per_minute)} />
              <Metric label="Duration" value={formatTime(Math.round(results.duration_seconds || recordingTime))} />
              <Metric label="Required" value={`${results.passing_score}%`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Passage Highlighting</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-sm leading-7">
              {displayWords.map((item, index) => (
                <span
                  key={`${item.word}-${index}`}
                  title={item.feedback}
                  className={`rounded-md border px-2 py-1 ${getStatusClass(item.status)}`}
                >
                  {item.word}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Sound Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {commonSounds.length ? commonSounds.map((item: any) => (
                <div key={item.sound} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.sound}</span>
                    <span>{safePercent(item.accuracy)}%</span>
                  </div>
                  <Progress value={safePercent(item.accuracy)} className="mt-2" />
                </div>
              )) : (
                <p className="text-sm text-slate-500">No recurring sound issues were detected.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-700">
              <FeedbackBlock title="Strengths" value={results.strengths} />
              <FeedbackBlock title="Opportunities" value={results.improvement_areas} />
              <FeedbackBlock title="Recommendations" value={results.recommendations} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Detailed Word Analysis</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Word</TableHead>
                  <TableHead>Recognized</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Sound Issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wordRows.slice(0, 120).map((word, index) => (
                  <TableRow key={`${word.word_index}-${index}`}>
                    <TableCell>{word.expected_word || '-'}</TableCell>
                    <TableCell>{word.spoken_word || '-'}</TableCell>
                    <TableCell>{word.status}</TableCell>
                    <TableCell>{word.confidence !== null && word.confidence !== undefined ? `${safePercent(word.confidence * 100)}%` : '-'}</TableCell>
                    <TableCell>{word.phoneme_data?.sound || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" onClick={() => router.back()} className="flex-1">
            Back to Module
          </Button>
          <Button onClick={restartRecording} className="flex-1">
            <RotateCcw className="mr-2 size-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>{reading.readingTitle || reading.title}</CardTitle>
              <CardDescription>{reading.description || 'AI-powered pronunciation reading assessment'}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{reading.category || 'Reading'}</Badge>
              <Badge variant="outline">{reading.difficulty || 'Practice'}</Badge>
              <Badge variant="outline">{reading.passingScore}% pass</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Words" value={reading.wordCount || passageWords.length} />
            <Metric label="Sentences" value={reading.sentenceCount || passageSentences.length} />
            <Metric label="Paragraphs" value={reading.paragraphCount || Math.max(1, reading.readingContent.split(/\n{2,}/).filter(Boolean).length)} />
            <Metric label="Reading Level" value={reading.readingLevel || 'Standard'} />
            <Metric label="Estimated" value={`${reading.estimatedReadingTime || Math.max(1, Math.ceil(passageWords.length / 130))} min`} />
            <Metric label="Attempts" value={reading.maxAttempts === 0 ? 'Unlimited' : reading.maxAttempts || 3} />
            <Metric label="Time Limit" value={reading.timeLimitSeconds ? formatTime(reading.timeLimitSeconds) : 'None'} />
            <Metric label="Microphone" value={getMicStatusCopy(micStatus)} />
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-slate-700">
            {reading.instructions || 'Read the passage aloud clearly and naturally.'}
          </div>

          {micStatus === 'missing' || micStatus === 'unsupported' ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
              {micStatus === 'missing'
                ? 'No microphone was detected. Connect or enable a microphone before starting this assessment.'
                : 'This browser does not support microphone recording for this assessment. Use Chrome, Edge, Firefox, or Safari with microphone support.'}
            </div>
          ) : micStatus === 'permission_needed' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              Microphone permission is required. Your browser will ask for access when you start reading.
            </div>
          ) : null}

          <div className="rounded-xl border bg-white p-5 text-lg leading-8 text-slate-800">
            {richPassageHtml ? (
              <div
                className="space-y-3 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600 [&_em]:italic [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_strong]:font-semibold"
                dangerouslySetInnerHTML={{ __html: richPassageHtml }}
              />
            ) : (
              <div className="whitespace-pre-wrap">{reading.readingContent}</div>
            )}
          </div>

          {(stage === 'recording' || stage === 'paused' || stage === 'review') ? (
            <Card className="border-slate-200">
              <CardContent className="space-y-4 pt-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Elapsed" value={formatTime(recordingTime)} />
                  <Metric label="Word Progress" value={`${spokenProgress}/${passageWords.length}`} />
                  <Metric label="Mic Level" value={`${micLevel}%`} />
                </div>
                <Progress value={progressValue} />
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Current Sentence</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{currentSentence || 'Start reading to track sentence progress.'}</p>
                </div>
                <div className="h-12 overflow-hidden rounded-lg border bg-slate-950 p-2">
                  <div className="flex h-full items-end gap-1">
                    {Array.from({ length: 48 }).map((_, index) => {
                      const height = Math.max(8, Math.min(100, micLevel + ((index % 8) - 4) * 4));
                      return (
                        <div
                          key={index}
                          className="w-full rounded-t bg-emerald-400"
                          style={{ height: `${height}%`, opacity: stage === 'recording' ? 0.9 : 0.35 }}
                        />
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-2 text-sm leading-7">
            {displayWords.map((item, index) => (
              <span key={`${item.word}-${index}`} className={`rounded-md border px-2 py-1 ${getStatusClass(item.status)}`}>
                {item.word}
              </span>
            ))}
          </div>

          {audioUrl && stage === 'review' ? (
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="mb-3 text-sm text-slate-600">Duration: {formatTime(recordingTime)}</p>
              <audio controls className="w-full" src={audioUrl} />
            </div>
          ) : null}

          {attemptHistory.length ? (
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">Attempt History</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {attemptHistory.map((attempt) => (
                  <div key={attempt.id} className="rounded-lg border bg-white p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Attempt {attempt.attempt_number}</span>
                      <Badge variant={attempt.passed ? 'default' : 'outline'}>
                        {attempt.passed ? 'Passed' : attempt.status}
                      </Badge>
                    </div>
                    <div className="mt-2 text-slate-600">
                      Score: {attempt.score !== null && attempt.score !== undefined ? `${Math.round(attempt.score)}%` : 'Pending'}
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-slate-500">
                      <span>Accuracy: {safePercent(attempt.accuracy)}%</span>
                      <span>Fluency: {safePercent(attempt.fluency)}%</span>
                      <span>Confidence: {safePercent(attempt.confidence)}%</span>
                      <span>WPM: {safePercent(attempt.words_per_minute)}</span>
                      <span>Time: {formatTime(Math.round(attempt.duration_seconds || 0))}</span>
                      {attempt.improvement !== null && attempt.improvement !== undefined ? (
                        <span>Improvement: {attempt.improvement > 0 ? '+' : ''}{attempt.improvement.toFixed(1)}%</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {stage === 'uploading' || stage === 'processing' ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
              {stage === 'uploading' ? 'Uploading your recording to Supabase Storage...' : 'Analyzing pronunciation, word alignment, fluency, and sound patterns...'}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            {stage === 'preparation' ? (
              <Button
                onClick={() => void startRecording()}
                className="flex-1"
                disabled={micStatus === 'checking' || micStatus === 'missing' || micStatus === 'unsupported'}
              >
                <Mic className="mr-2 size-4" />
                Start Reading
              </Button>
            ) : null}
            {stage === 'recording' ? (
              <>
                {reading.allowPause !== false ? (
                  <Button variant="outline" onClick={pauseRecording} className="flex-1">
                    <Pause className="mr-2 size-4" />
                    Pause
                  </Button>
                ) : null}
                <Button onClick={stopRecording} className="flex-1" variant="destructive">
                  <Square className="mr-2 size-4" />
                  Stop
                </Button>
              </>
            ) : null}
            {stage === 'paused' ? (
              <>
                <Button onClick={resumeRecording} className="flex-1">
                  <Play className="mr-2 size-4" />
                  Resume
                </Button>
                <Button onClick={stopRecording} className="flex-1" variant="destructive">
                  <Square className="mr-2 size-4" />
                  Stop
                </Button>
              </>
            ) : null}
            {stage === 'review' ? (
              <>
                <Button variant="outline" onClick={restartRecording} className="flex-1" disabled={submitting}>
                  <RotateCcw className="mr-2 size-4" />
                  Restart
                </Button>
                <Button onClick={() => void handleSubmit()} className="flex-1" disabled={submitting}>
                  <Send className="mr-2 size-4" />
                  Submit
                </Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function FeedbackBlock({ title, value }: { title: string; value?: string }) {
  if (!value) {
    return null;
  }
  return (
    <div>
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

export default TraineeReadingAssessment;
