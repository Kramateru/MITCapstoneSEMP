'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileText,
  Mic,
  RotateCcw,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/app/context/AuthContext';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Textarea } from '../ui/textarea';

type ModuleCategory = 'pronunciation' | 'fluency' | 'grammar' | 'empathy' | 'clarity';
type ModuleDifficulty = 'basic' | 'intermediate' | 'advanced';
type ModuleType = 'video' | 'quiz' | 'flashcard' | 'infographic' | 'case_study';
type AssignmentStatus = 'assigned' | 'in_progress' | 'completed' | 'certified';

interface AssignmentSummary {
  id: string;
  module_id: string;
  title: string;
  description?: string | null;
  category?: ModuleCategory | null;
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
  exercise_count: number;
  completed_exercises: number;
  certificate_id?: string | null;
  topic_category_name?: string | null;
  assigned_at?: string;
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
  is_completed: boolean;
  submitted_at?: string | null;
}

interface AssignmentExercise {
  id: string;
  title: string;
  type: 'multiple_choice' | 'keyword_response';
  prompt: string;
  options?: string[];
  required_keywords?: string[];
  tips?: string[];
  explanation?: string;
  option_feedback?: Record<string, string>;
  sample_answer?: string;
  attempt?: ExerciseAttempt | null;
}

interface AssignmentDetailResponse {
  assignment: AssignmentSummary;
  module: {
    id: string;
    module_type: ModuleType;
    content_data: Record<string, any>;
    passing_score: number;
    content_url?: string | null;
  };
  exercises: AssignmentExercise[];
}

interface ExerciseResponseState {
  responseText: string;
  selectedOption: string;
  inputMode: 'typed' | 'speech' | 'selection';
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

const CATEGORY_BADGE_STYLES: Record<ModuleCategory, string> = {
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

function formatShortDate(value?: string | null) {
  if (!value) {
    return 'No due date';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
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

function isAssignmentOverdue(assignment?: AssignmentSummary | null) {
  if (!assignment?.due_date || !assignment?.status) {
    return false;
  }

  if (assignment.status === 'completed' || assignment.status === 'certified') {
    return false;
  }

  const dueDate = new Date(assignment.due_date);
  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  return dueDate.getTime() < Date.now();
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
    return 'Complete Flashcard Check';
  }
  if (moduleType === 'infographic') {
    return 'Complete Reflection';
  }
  if (moduleType === 'case_study' && exercise.type === 'multiple_choice') {
    return 'Submit Root Cause Answer';
  }
  if (moduleType === 'case_study') {
    return 'Complete Analysis';
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

export default function MicrolearningHub() {
  const { token, isLoading: isAuthLoading } = useAuth();

  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState('');
  const [assignmentDetail, setAssignmentDetail] = useState<AssignmentDetailResponse | null>(null);
  const [exerciseResponses, setExerciseResponses] = useState<Record<string, ExerciseResponseState>>({});
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [submittingExerciseId, setSubmittingExerciseId] = useState('');
  const [videoCompleted, setVideoCompleted] = useState<Record<string, boolean>>({});
  const [flippedFlashcardAssignments, setFlippedFlashcardAssignments] = useState<Record<string, boolean>>({});
  const [flashcardIndexes, setFlashcardIndexes] = useState<Record<string, number>>({});
  const [activeSpeechExerciseId, setActiveSpeechExerciseId] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSeedTextRef = useRef('');
  const touchStartXRef = useRef<number | null>(null);

  async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok) {
      const message =
        (payload as { detail?: string } | null)?.detail || 'Request failed. Please try again.';
      throw new Error(message);
    }

    return payload as T;
  }

  async function loadAssignmentDetail(assignmentId: string) {
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
          responseText: exercise.attempt?.response_text || '',
          selectedOption: exercise.attempt?.selected_option || '',
          inputMode:
            (exercise.attempt?.input_mode as 'typed' | 'speech' | 'selection' | undefined) ||
            (exercise.type === 'multiple_choice' ? 'selection' : 'typed'),
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
  }

  async function loadAssignments(preferredAssignmentId?: string) {
    if (!token) {
      setIsLoadingAssignments(false);
      return;
    }

    setIsLoadingAssignments(true);

    try {
      const response = await apiRequest<{ assignments: AssignmentSummary[] }>(
        '/api/trainee/microlearning-assignments',
      );
      const nextAssignments = response.assignments || [];
      const nextActiveId =
        (preferredAssignmentId && nextAssignments.some((assignment) => assignment.id === preferredAssignmentId)
          ? preferredAssignmentId
          : undefined) ||
        (activeAssignmentId && nextAssignments.some((assignment) => assignment.id === activeAssignmentId)
          ? activeAssignmentId
          : undefined) ||
        nextAssignments.find((assignment) => !['completed', 'certified'].includes(assignment.status))?.id ||
        nextAssignments[0]?.id ||
        '';

      startTransition(() => {
        setAssignments(nextAssignments);
        setActiveAssignmentId(nextActiveId);
      });

      if (nextActiveId) {
        await loadAssignmentDetail(nextActiveId);
      } else {
        setAssignmentDetail(null);
        setExerciseResponses({});
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load your assignments.';
      toast.error(message);
    } finally {
      setIsLoadingAssignments(false);
    }
  }

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

  async function handleSelectAssignment(assignmentId: string) {
    recognitionRef.current?.stop();
    setActiveAssignmentId(assignmentId);
    await loadAssignmentDetail(assignmentId);
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
    });
  }

  async function handleSubmitExercise(exercise: AssignmentExercise) {
    if (!activeAssignmentId) {
      toast.error('Choose a module before saving an exercise.');
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

    if (exercise.type === 'keyword_response' && !response.responseText.trim()) {
      toast.error('Type your answer before submitting.');
      return;
    }

    setSubmittingExerciseId(exercise.id);

    try {
      await apiRequest(
        `/api/trainee/microlearning-assignments/${activeAssignmentId}/exercises/${exercise.id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            response_text: response.responseText || null,
            selected_option: response.selectedOption || null,
            input_mode: response.inputMode || (exercise.type === 'multiple_choice' ? 'selection' : 'typed'),
          }),
        },
      );

      toast.success('Exercise saved successfully.');
      await loadAssignments(activeAssignmentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save this exercise.';
      toast.error(message);
    } finally {
      setSubmittingExerciseId('');
    }
  }

  const activeAssignment = assignmentDetail?.assignment || null;
  const notStartedAssignments = assignments.filter((assignment) => assignment.status === 'assigned').length;
  const completedAssignments = assignments.filter((assignment) => ['completed', 'certified'].includes(assignment.status)).length;
  const certifiedAssignments = assignments.filter((assignment) => assignment.status === 'certified' || assignment.certificate_id).length;
  const inProgressAssignments = assignments.filter((assignment) => assignment.status === 'in_progress').length;
  const assignedCount = assignments.length;

  function renderModuleContent() {
    if (!assignmentDetail || !activeAssignment) {
      return null;
    }

    const moduleDetail = assignmentDetail.module;
    const content = moduleDetail.content_data || {};
    const assetUrl = moduleDetail.content_url || content.asset_url || activeAssignment.content_url;

    if (moduleDetail.module_type === 'video') {
      const unlocked = !assetUrl || videoCompleted[activeAssignment.id] || Boolean(activeAssignment.completed_exercises);

      return (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Video Module</p>
          {assetUrl ? (
            <video
              controls
              className="mt-3 w-full rounded-lg border"
              src={assetUrl}
              onEnded={() => setVideoCompleted((current) => ({ ...current, [activeAssignment.id]: true }))}
            />
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No video file is attached yet, so the practice prompt is available immediately.
            </p>
          )}
          <p className="mt-3 text-sm text-slate-600">
            {unlocked
              ? 'The practice prompt is unlocked. Submit your response below.'
              : 'Finish the video first to unlock the practice prompt and complete the activity.'}
          </p>
          {unlocked ? (
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
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
          ) : null}
        </div>
      );
    }

    if (moduleDetail.module_type === 'flashcard') {
      const cards = Array.isArray(content.cards) && content.cards.length ? content.cards : [{}];
      const currentCardIndex = Math.min(flashcardIndexes[activeAssignment.id] || 0, cards.length - 1);
      const card = cards[currentCardIndex] || {};
      const flipped = flippedFlashcardAssignments[activeAssignment.id];

      return (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Flashcard Deck</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                {flipped ? 'Back' : 'Front'} | Card {currentCardIndex + 1} of {cards.length}
              </p>
            </div>
            {cards.length > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => changeFlashcard(activeAssignment.id, cards.length, -1)}
                  disabled={currentCardIndex === 0}
                >
                  <ChevronLeft className="mr-1 size-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => changeFlashcard(activeAssignment.id, cards.length, 1)}
                  disabled={currentCardIndex >= cards.length - 1}
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

    if (moduleDetail.module_type === 'infographic') {
      return (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Infographic Module</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {assetUrl ? <img src={assetUrl} alt={activeAssignment.title} className="mt-3 max-h-72 rounded-lg border object-contain" /> : null}
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
        </div>
      );
    }

    if (moduleDetail.module_type === 'case_study') {
      return (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Case Study</p>
          {assetUrl ? <audio controls className="mt-3 w-full" src={assetUrl} /> : null}
          {content.transcript ? (
            <div className="mt-3 rounded-lg border bg-slate-50 p-3 text-sm text-slate-600 whitespace-pre-wrap">
              {content.transcript}
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
          <CardTitle>Microlearning Assignment Center</CardTitle>
          <CardDescription>
            Work through your assigned tasks, complete the activity type shown, and unlock certification automatically once you pass.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Your Assigned Modules</CardTitle>
            <CardDescription>Select a module to open its exercises and continue your work.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAssignments ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                Loading your modules...
              </div>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment) => {
                  const isActive = assignment.id === activeAssignmentId;
                  const overdue = isAssignmentOverdue(assignment);

                  return (
                    <button
                      key={assignment.id}
                      type="button"
                      onClick={() => void handleSelectAssignment(assignment.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        isActive ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-sky-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{assignment.title}</p>
                        {assignment.category ? (
                          <Badge className={CATEGORY_BADGE_STYLES[assignment.category]}>
                            {formatLabel(assignment.category)}
                          </Badge>
                        ) : null}
                        {assignment.topic_category_name ? <Badge variant="outline">{assignment.topic_category_name}</Badge> : null}
                      </div>

                      <p className="mt-2 text-sm text-slate-600">
                        {assignment.description || 'No description provided yet.'}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <Badge className={STATUS_BADGE_STYLES[assignment.status]}>
                          {formatStatusLabel(assignment.status)}
                        </Badge>
                        {assignment.is_mandatory ? <Badge variant="outline">Mandatory</Badge> : null}
                        {assignment.module_type ? <Badge variant="outline">{formatLabel(assignment.module_type)}</Badge> : null}
                        {assignment.due_date ? (
                          <Badge
                            variant="outline"
                            className={overdue ? 'border-rose-300 text-rose-700' : ''}
                          >
                            {overdue ? 'Overdue' : `Due ${formatShortDate(assignment.due_date)}`}
                          </Badge>
                        ) : null}
                        <span>{assignment.completed_exercises}/{assignment.exercise_count} exercises</span>
                        <span>{assignment.duration_minutes || 0} minutes</span>
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        Batch / Wave: {formatBatchLabel(assignment)}
                        {assignment.assigned_by_name ? ` | Assigned by: ${assignment.assigned_by_name}` : ''}
                      </div>

                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Progress</span>
                          <span>{Math.round(assignment.completion_percentage)}%</span>
                        </div>
                        <Progress value={assignment.completion_percentage || 0} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{activeAssignment?.title || 'Module Detail'}</CardTitle>
            <CardDescription>
              {activeAssignment?.skill_focus || 'Open a module to view the exercise instructions and save your answers.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDetail || !assignmentDetail || !activeAssignment ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">
                {isLoadingDetail ? 'Loading module detail...' : 'Select a module to begin.'}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {activeAssignment.category ? (
                          <Badge className={CATEGORY_BADGE_STYLES[activeAssignment.category]}>
                            {formatLabel(activeAssignment.category)}
                          </Badge>
                        ) : null}
                        <Badge className={STATUS_BADGE_STYLES[activeAssignment.status]}>
                          {formatStatusLabel(activeAssignment.status)}
                        </Badge>
                        {activeAssignment.module_type ? (
                          <Badge variant="outline">{formatLabel(activeAssignment.module_type)}</Badge>
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
                  {activeAssignment.notes ? (
                    <div className="mt-4 rounded-lg border bg-white p-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-700">Trainer Notes</p>
                      <p className="mt-2 whitespace-pre-wrap">{activeAssignment.notes}</p>
                    </div>
                  ) : null}

                  {!activeAssignment.is_passed && activeAssignment.completed_exercises === activeAssignment.exercise_count ? (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Finish with at least {activeAssignment.passing_score || assignmentDetail.module.passing_score}% to earn a certificate.
                    </div>
                  ) : null}

                  {activeAssignment.certificate_id ? (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="text-sm text-emerald-800">
                          Certificate unlocked. This accomplishment now appears in your certificates and reports.
                        </div>
                        <Button type="button" variant="outline" onClick={() => window.location.assign('/trainee/reports?tab=certificates')}>
                          View Certificate
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {renderModuleContent()}

                <div className="space-y-4">
                  {assignmentDetail.exercises.map((exercise, index) => {
                    const response = exerciseResponses[exercise.id] || {
                      responseText: '',
                      selectedOption: '',
                      inputMode: exercise.type === 'multiple_choice' ? 'selection' : 'typed',
                    };
                    const isSaving = submittingExerciseId === exercise.id;
                    const hasVideoAsset = Boolean(
                      assignmentDetail.module.content_url ||
                      assignmentDetail.module.content_data?.asset_url ||
                      activeAssignment.content_url,
                    );
                    const videoUnlocked =
                      assignmentDetail.module.module_type !== 'video' ||
                      !hasVideoAsset ||
                      videoCompleted[activeAssignment.id] ||
                      Boolean(exercise.attempt);
                    const isVideoLocked =
                      assignmentDetail.module.module_type === 'video' &&
                      !videoUnlocked &&
                      !exercise.attempt;
                    const keywordCoverage = getKeywordCoverage(response.responseText, exercise.required_keywords);
                    const speechEnabled =
                      assignmentDetail.module.module_type === 'video' && exercise.type === 'keyword_response';

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

                          {exercise.type === 'multiple_choice' ? (
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
                                    disabled={isVideoLocked}
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

                          {exercise.sample_answer ? (
                            <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-600">
                              <p className="font-medium text-slate-700">Sample answer</p>
                              <p className="mt-2">{exercise.sample_answer}</p>
                            </div>
                          ) : null}

                          {exercise.attempt ? (
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

                          {isVideoLocked ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                              Complete the video first to unlock this practice prompt.
                            </div>
                          ) : null}

                          <Button type="button" onClick={() => void handleSubmitExercise(exercise)} disabled={isSaving || isVideoLocked}>
                            {isSaving
                              ? 'Saving Exercise...'
                              : getExerciseActionLabel(assignmentDetail.module.module_type, exercise)}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
