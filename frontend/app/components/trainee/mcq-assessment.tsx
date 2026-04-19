'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Progress } from '../ui/progress';
import { ScrollArea } from '../ui/scroll-area';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  PlayCircle,
  Trophy,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type ApiAssessment = {
  id: string;
  title: string;
  description?: string | null;
  category_id: string;
  category_name?: string | null;
  question_ids: string[];
  question_count: number;
  passing_threshold: number;
  time_limit_minutes?: number | null;
  due_date?: string | null;
  is_completed: boolean;
  score_percentage?: number | null;
  is_passed?: boolean | null;
  status?: 'pending' | 'passed' | 'failed';
  can_retake?: boolean;
  can_view?: boolean;
  is_locked?: boolean;
  attempt_count?: number;
  submitted_at?: string | null;
  certificate_id?: string | null;
  certificate_no?: string | null;
  latest_review?: ApiSubmitResponse['review'];
};

type ApiLatestSubmission = {
  score_percentage: number;
  is_passed: boolean;
  attempt_count?: number;
  submitted_at?: string | null;
  review: ApiSubmitResponse['review'];
  certificate_id?: string | null;
  certificate_no?: string | null;
};

type ApiAssessmentResponse = {
  id: string;
  title: string;
  description?: string | null;
  category_id: string;
  time_limit_minutes?: number | null;
  status?: 'pending' | 'passed' | 'failed';
  can_retake?: boolean;
  is_locked?: boolean;
  latest_submission?: ApiLatestSubmission | null;
  questions: {
    id: string;
    question_text: string;
    options: Record<string, string>;
    media_url?: string | null;
  }[];
};

type ApiSubmitResponse = {
  score_percentage: number;
  is_passed: boolean;
  review: {
    question_id: string;
    selected: string;
    correct: string;
    is_correct: boolean;
    explanation?: string | null;
  }[];
  certificate_id?: string | null;
  certificate_no?: string | null;
  certificate_created?: boolean;
  completion_certificate_id?: string | null;
  completion_certificate_no?: string | null;
  completion_certificate_created?: boolean;
  achievement_title?: string | null;
  status?: 'passed' | 'failed';
  can_retake?: boolean;
};

type MCQQuestion = {
  id: string;
  question: string;
  options: string[];
};

type SubmissionSummary = {
  scorePercentage: number;
  isPassed: boolean;
  review: ApiSubmitResponse['review'];
  certificateNo?: string | null;
  completionCertificateNo?: string | null;
  completionCertificateCreated?: boolean;
  achievementTitle?: string | null;
};

interface MCQAssessmentProps {
  category?: string;
  onComplete?: (score: number, total: number) => void;
}

const DEFAULT_TIME_LIMIT = 30 * 60;

function formatDate(value?: string | null) {
  if (!value) {
    return 'No due date';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'No due date';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function getAssessmentTimeLimitSeconds(timeLimitMinutes?: number | null) {
  const normalizedMinutes = Number(timeLimitMinutes || 0);
  if (!Number.isFinite(normalizedMinutes) || normalizedMinutes <= 0) {
    return DEFAULT_TIME_LIMIT;
  }
  return Math.round(normalizedMinutes * 60);
}

async function readApiPayload<T>(response: Response): Promise<T | string | null> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return (await response.json().catch(() => null)) as T | null;
  }

  const text = await response.text().catch(() => '');
  return text.trim() || null;
}

function getPayloadMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const candidate = payload as { detail?: unknown; error?: unknown; message?: unknown };
    for (const value of [candidate.detail, candidate.error, candidate.message]) {
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }

  return fallback;
}

export default function MCQAssessment({ category, onComplete }: MCQAssessmentProps) {
  const [assessments, setAssessments] = useState<ApiAssessment[]>([]);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [assessmentTitle, setAssessmentTitle] = useState<string>('');
  const [assessmentDescription, setAssessmentDescription] = useState<string>('');
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [results, setResults] = useState<SubmissionSummary | null>(null);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(DEFAULT_TIME_LIMIT);
  const [timeRemaining, setTimeRemaining] = useState(DEFAULT_TIME_LIMIT);
  const [assessmentStarted, setAssessmentStarted] = useState(false);
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);
  const [isLoadingAssessment, setIsLoadingAssessment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [queueSearch, setQueueSearch] = useState('');
  const [queueFilter, setQueueFilter] = useState<'all' | 'ready' | 'retake' | 'completed'>('all');

  const selectedAssessment = useMemo(
    () => assessments.find((assessment) => assessment.id === assessmentId) || null,
    [assessmentId, assessments],
  );
  const questionMap = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const answeredCount = Object.keys(selectedAnswers).length;
  const progress = questions.length ? ((currentQuestion + 1) / questions.length) * 100 : 0;
  const selectedAssessmentCanRetake = selectedAssessment?.can_retake === true;
  const selectedAssessmentPassed = selectedAssessment?.is_passed === true;
  const selectedAssessmentCanView = selectedAssessment?.can_view === true;
  const selectedAssessmentLocked = selectedAssessment?.is_locked === true;
  const queueSummary = useMemo(() => {
    return assessments.reduce(
      (summary, assessment) => {
        if (assessment.is_passed) {
          summary.completed += 1;
        } else if (assessment.can_retake) {
          summary.retake += 1;
        } else {
          summary.ready += 1;
        }

        if (assessment.certificate_id) {
          summary.certificates += 1;
        }

        return summary;
      },
      { ready: 0, retake: 0, completed: 0, certificates: 0 },
    );
  }, [assessments]);

  const filteredAssessments = useMemo(() => {
    const normalizedSearch = queueSearch.trim().toLowerCase();

    return assessments.filter((assessment) => {
      const assessmentState: 'ready' | 'retake' | 'completed' =
        assessment.is_passed
          ? 'completed'
          : assessment.can_retake
            ? 'retake'
            : 'ready';

      if (queueFilter !== 'all' && assessmentState !== queueFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        assessment.title,
        assessment.description || '',
        assessment.category_name || '',
        assessment.certificate_no || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [assessments, queueFilter, queueSearch]);

  const assessmentSections = useMemo(
    () => [
      {
        id: 'retake',
        title: 'Needs Retake',
        description: 'These assessments are below the 90% passing score and should be taken again first.',
        items: filteredAssessments.filter((assessment) => !assessment.is_passed && assessment.can_retake),
      },
      {
        id: 'ready',
        title: 'Ready To Take',
        description: 'These assigned categories are available and waiting for the first attempt.',
        items: filteredAssessments.filter((assessment) => !assessment.is_passed && !assessment.can_retake),
      },
      {
        id: 'completed',
        title: 'Completed',
        description: 'These assessments are passed and locked for review only.',
        items: filteredAssessments.filter((assessment) => assessment.is_passed),
      },
    ],
    [filteredAssessments],
  );

  const loadAssessmentDetail = async (
    nextAssessmentId: string,
    options: { startImmediately?: boolean; viewOnly?: boolean } = {},
  ) => {
    const { startImmediately = false, viewOnly = false } = options;
    try {
      setIsLoadingAssessment(true);
      setLoadError('');
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const detailRes = await fetch(`/api/certification/mcq/assessment/${nextAssessmentId}`, { headers });
      const detailPayload = await readApiPayload<ApiAssessmentResponse>(detailRes);
      if (!detailRes.ok) {
        throw new Error(getPayloadMessage(detailPayload, 'Unable to load assessment questions.'));
      }
      if (!detailPayload || typeof detailPayload === 'string') {
        throw new Error('Unable to load assessment questions.');
      }
      const detailData = detailPayload;
      const mappedQuestions: MCQQuestion[] = (detailData.questions || []).map((question) => ({
        id: question.id,
        question: question.question_text,
        options: ['A', 'B', 'C', 'D'].map((key) => question.options?.[key] || ''),
      }));
      const nextTimeLimitSeconds = getAssessmentTimeLimitSeconds(detailData.time_limit_minutes);

      setAssessmentId(nextAssessmentId);
      setAssessmentTitle(detailData.title || 'MCQ Assessment');
      setAssessmentDescription(detailData.description || '');
      setQuestions(mappedQuestions);
      setCurrentQuestion(0);
      setSelectedAnswers({});
      setTimeLimitSeconds(nextTimeLimitSeconds);
      setTimeRemaining(nextTimeLimitSeconds);
      if (detailData.latest_submission && (viewOnly || detailData.is_locked)) {
        setResults({
          scorePercentage: detailData.latest_submission.score_percentage,
          isPassed: detailData.latest_submission.is_passed,
          review: detailData.latest_submission.review || [],
          certificateNo: detailData.latest_submission.certificate_no,
        });
        setAssessmentStarted(false);
      } else {
        setResults(null);
        setAssessmentStarted(startImmediately);
      }
    } catch (error) {
      console.error(error);
      setAssessmentStarted(false);
      setLoadError('Unable to load MCQ assessment. Please try again.');
    } finally {
      setIsLoadingAssessment(false);
    }
  };

  const loadAssessments = async () => {
    try {
      setIsLoadingAssessments(true);
      setLoadError('');
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      const assessmentsRes = await fetch('/api/certification/mcq/my-assessments', { headers });
      const assessmentsPayload = await readApiPayload<{ assessments?: ApiAssessment[] }>(assessmentsRes);
      if (!assessmentsRes.ok) {
        throw new Error(getPayloadMessage(assessmentsPayload, 'Unable to load assessments.'));
      }
      if (!assessmentsPayload || typeof assessmentsPayload === 'string') {
        throw new Error('Unable to load assessments.');
      }
      const nextAssessments: ApiAssessment[] = assessmentsPayload.assessments || [];
      setAssessments(nextAssessments);

      if (!nextAssessments.length) {
        setAssessmentId(null);
        setQuestions([]);
        setResults(null);
        return;
      }

      const currentSelected = assessmentId
        ? nextAssessments.find((assessment) => assessment.id === assessmentId)
        : null;
      const preferredAssessment =
        currentSelected ||
        (category
          ? nextAssessments.find((assessment) => assessment.category_id === category && !assessment.is_completed) ||
            nextAssessments.find((assessment) => assessment.category_id === category && assessment.can_retake) ||
            nextAssessments.find((assessment) => assessment.category_id === category)
          : null) ||
        nextAssessments.find((assessment) => !assessment.is_completed) ||
        nextAssessments.find((assessment) => assessment.can_retake) ||
        nextAssessments[0];

      if (!preferredAssessment) {
        return;
      }

      await loadAssessmentDetail(preferredAssessment.id);
    } catch (error) {
      console.error(error);
      setLoadError('Unable to load MCQ assessment. Please try again.');
    } finally {
      setIsLoadingAssessments(false);
    }
  };

  useEffect(() => {
    void loadAssessments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    if (!assessmentStarted || !questions.length || results) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTimeRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [assessmentStarted, questions, results]);

  useEffect(() => {
    if (!assessmentStarted || !questions.length || results || timeRemaining > 0 || isSubmitting) {
      return;
    }

    toast.error('Time is up. Your current answers are being submitted.');
    void submitAssessment(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentStarted, isSubmitting, questions.length, results, timeRemaining]);

  const handleSelectAnswer = (answerIndex: number) => {
    const current = questions[currentQuestion];
    if (!current) {
      return;
    }

    setSelectedAnswers((prev) => ({
      ...prev,
      [current.id]: answerIndex,
    }));
  };

  const handleNext = () => {
    const current = questions[currentQuestion];
    if (!current || selectedAnswers[current.id] === undefined) {
      toast.error('Please select an answer before proceeding.');
      return;
    }

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((value) => value + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((value) => value - 1);
    }
  };

  const submitAssessment = async (allowIncomplete = false) => {
    if (!assessmentId) {
      toast.error('Select an assessment first.');
      return;
    }
    if (!allowIncomplete && Object.keys(selectedAnswers).length !== questions.length) {
      toast.error('Please answer all questions before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/certification/mcq/assessment/${assessmentId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          answers: Object.entries(selectedAnswers).reduce<Record<string, string>>((acc, [questionId, answerIndex]) => {
            acc[questionId] = 'ABCD'[answerIndex] || 'A';
            return acc;
          }, {}),
        }),
      });
      const payload = await readApiPayload<ApiSubmitResponse>(response);
      if (!response.ok) {
        throw new Error(getPayloadMessage(payload, 'Submission failed.'));
      }
      if (!payload || typeof payload === 'string') {
        throw new Error('Submission failed.');
      }

      setResults({
        scorePercentage: payload.score_percentage,
        isPassed: payload.is_passed,
        review: payload.review || [],
        certificateNo: payload.certificate_no,
        completionCertificateNo: payload.completion_certificate_no,
        completionCertificateCreated: payload.completion_certificate_created,
        achievementTitle: payload.achievement_title,
      });

      const correctAnswers = payload.review.filter((entry) => entry.is_correct).length;
      setAssessments((current) =>
        current.map((assessment) =>
          assessment.id === assessmentId
            ? {
                ...assessment,
                is_completed: true,
                score_percentage: payload.score_percentage,
                is_passed: payload.is_passed,
                status: payload.status,
                can_retake: payload.can_retake,
                can_view: true,
                is_locked: payload.is_passed,
                attempt_count: Number(assessment.attempt_count || 0) + 1,
                submitted_at: new Date().toISOString(),
                certificate_id: payload.certificate_id || assessment.certificate_id,
                certificate_no: payload.certificate_no || assessment.certificate_no,
                latest_review: payload.review || [],
              }
            : assessment,
        ),
      );

      if (onComplete) {
        onComplete(correctAnswers, questions.length);
      }

      if (payload.certificate_no) {
        toast.success(
          `Assessment completed. Certificate ${payload.certificate_no} was recorded for ${payload.achievement_title || 'this category'}.`,
          { duration: 6000 },
        );
      } else if (payload.completion_certificate_created && payload.completion_certificate_no) {
        toast.success(
          `All assigned assessments are now complete. Certificate ${payload.completion_certificate_no} was recorded.`,
          { duration: 6000 },
        );
      } else {
        toast.success(
          `Assessment completed. You scored ${payload.score_percentage.toFixed(0)}%.`,
          { duration: 5000 },
        );
      }
    } catch (error) {
      console.error(error);
      toast.error('Unable to submit assessment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startAssessment = async () => {
    if (!selectedAssessment) {
      toast.error('Select an assessment first.');
      return;
    }

    await loadAssessmentDetail(selectedAssessment.id, { startImmediately: true });
  };

  const startRetake = () => {
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setResults(null);
    setTimeRemaining(timeLimitSeconds);
    setAssessmentStarted(true);
  };

  const score = results?.review.filter((entry) => entry.is_correct).length || 0;
  const percentage = results?.scorePercentage || 0;
  const isPassed = results?.isPassed || false;

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (isLoadingAssessments) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading assigned MCQ categories...
      </div>
    );
  }

  if (!assessments.length) {
    return (
      <div className="rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
        {loadError || 'No MCQ categories are assigned to your trainee account yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Assigned MCQ Categories</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Start new assessments, retake anything below 90%, and use view-only mode for categories you already passed.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadAssessments()} disabled={isLoadingAssessment}>
          {isLoadingAssessment ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
          Refresh Assessments
        </Button>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <QueueSummaryCard label="Ready To Take" value={String(queueSummary.ready)} hint="First attempts available" />
        <QueueSummaryCard label="Needs Retake" value={String(queueSummary.retake)} hint="Below the 90% pass mark" tone="amber" />
        <QueueSummaryCard label="Completed" value={String(queueSummary.completed)} hint="Passed and now view only" tone="emerald" />
        <QueueSummaryCard label="Certificates" value={String(queueSummary.certificates)} hint="Unlocked from passed assessments" tone="sky" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Assessment Queue</CardTitle>
            <CardDescription>Use the sections below to see what to start, retake, or only review.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3">
              <Input
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
                placeholder="Search category, assessment, or certificate"
              />
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'ready', label: 'Ready' },
                  { value: 'retake', label: 'Retake' },
                  { value: 'completed', label: 'Completed' },
                ].map((filterItem) => (
                  <button
                    key={filterItem.value}
                    type="button"
                    onClick={() => setQueueFilter(filterItem.value as 'all' | 'ready' | 'retake' | 'completed')}
                    className={`rounded-full border px-3 py-2 text-sm transition ${
                      queueFilter === filterItem.value
                        ? 'border-sky-500 bg-sky-50 text-sky-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {filterItem.label}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="h-[620px] pr-4">
              <div className="space-y-5">
                {assessmentSections.map((section) => (
                  <div key={section.id} className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">{section.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{section.description}</div>
                        </div>
                        <Badge variant="outline">{section.items.length}</Badge>
                      </div>
                    </div>

                    {section.items.map((assessment) => {
                      const isSelected = assessment.id === assessmentId;
                      return (
                        <div
                          key={assessment.id}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            isSelected
                              ? 'border-sky-400 bg-sky-50 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => void loadAssessmentDetail(assessment.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                void loadAssessmentDetail(assessment.id);
                              }
                            }}
                            className="cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground">{assessment.title}</div>
                                <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                  {assessment.category_name || 'MCQ Category'}
                                </div>
                              </div>
                              <Badge
                                className={
                                  assessment.is_completed
                                    ? assessment.is_passed
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-700'
                                }
                              >
                                {assessment.is_completed
                                  ? assessment.is_passed
                                    ? 'Completed / Passed'
                                    : 'Failed / Retake'
                                  : 'Pending'}
                              </Badge>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>{assessment.question_count} questions</span>
                              <span>{assessment.passing_threshold}% pass mark</span>
                              <span>{assessment.time_limit_minutes || 30} min timer</span>
                              <span>Due {formatDate(assessment.due_date)}</span>
                            </div>

                            <div className="mt-3 text-xs text-muted-foreground">
                              {assessment.is_passed
                                ? 'Passed assessments are locked and available through View Result only.'
                                : assessment.can_retake
                                  ? 'This category needs a retake. Click Retake Assessment to try again.'
                                  : 'This category is ready for the first attempt.'}
                            </div>

                            {assessment.is_completed ? (
                              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                                Score: {assessment.score_percentage?.toFixed(2) || '0.00'}%
                                {assessment.certificate_no ? ` | Certificate: ${assessment.certificate_no}` : ''}
                              </div>
                            ) : null}
                          </div>

                          {!assessment.is_completed || assessment.can_retake || assessment.can_view ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {!assessment.is_locked ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    void loadAssessmentDetail(assessment.id, {
                                      startImmediately: true,
                                    })
                                  }
                                  disabled={isLoadingAssessment}
                                >
                                  <PlayCircle className="size-4" />
                                  {assessment.can_retake ? 'Retake Assessment' : 'Start Assessment'}
                                </Button>
                              ) : null}
                              {assessment.can_view ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void loadAssessmentDetail(assessment.id, {
                                      viewOnly: true,
                                    })
                                  }
                                  disabled={isLoadingAssessment}
                                >
                                  View Result
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    {!section.items.length ? (
                      <div className="rounded-2xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
                        {queueSearch.trim() || queueFilter !== 'all'
                          ? `No assessments match the current filters in ${section.title.toLowerCase()}.`
                          : `No assessments are currently in ${section.title.toLowerCase()}.`}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {isLoadingAssessment ? (
            <Card>
              <CardContent className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading assessment details...
              </CardContent>
            </Card>
          ) : null}

          {!isLoadingAssessment && selectedAssessment && results ? (
            <div className="space-y-6">
              <Card className={isPassed ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80'}>
                <CardContent className="pt-6">
                  <div className="space-y-4 text-center">
                    {isPassed ? (
                      <Trophy className="mx-auto size-16 text-emerald-600" />
                    ) : (
                      <AlertCircle className="mx-auto size-16 text-amber-600" />
                    )}
                    <div>
                      <div className="text-2xl font-bold text-foreground">
                        {isPassed ? 'Assessment Passed' : 'Assessment Failed'}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {selectedAssessment.category_name || selectedAssessment.title}
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <ResultTile label="Correct Answers" value={String(score)} />
                      <ResultTile label="Questions" value={String(questions.length)} />
                      <ResultTile label="Score" value={`${percentage.toFixed(0)}%`} />
                      <ResultTile label="Timer" value={`${selectedAssessment.time_limit_minutes || 30} min`} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Passing threshold: {selectedAssessment.passing_threshold}%
                      {results.certificateNo
                        ? ` | Certificate recorded: ${results.certificateNo}`
                        : ''}
                      {!results.certificateNo && results.completionCertificateNo
                        ? ` | Completion certificate: ${results.completionCertificateNo}`
                        : ''}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Detailed Review</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[460px] pr-4">
                    <div className="space-y-4">
                      {results.review.map((entry, index) => {
                        const question = questionMap.get(entry.question_id);
                        if (!question) {
                          return null;
                        }

                        const selectedIndex = 'ABCD'.indexOf(entry.selected || 'A');
                        const correctIndex = 'ABCD'.indexOf(entry.correct || 'A');

                        return (
                          <div
                            key={entry.question_id}
                            className={`rounded-2xl border p-4 ${
                              entry.is_correct ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'
                            }`}
                          >
                            <div className="mb-3 flex items-start gap-2">
                              {entry.is_correct ? (
                                <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
                              ) : (
                                <XCircle className="mt-0.5 size-5 text-amber-600" />
                              )}
                              <div>
                                <div className="font-medium text-foreground">
                                  Q{index + 1}. {question.question}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {question.options.map((option, optionIndex) => {
                                const isCorrectAnswer = optionIndex === correctIndex;
                                const isSelectedAnswer = optionIndex === selectedIndex;
                                return (
                                  <div
                                    key={`${entry.question_id}-${optionIndex}`}
                                    className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                                      isCorrectAnswer
                                        ? 'border-emerald-200 bg-emerald-50'
                                        : isSelectedAnswer && !entry.is_correct
                                          ? 'border-amber-200 bg-amber-50'
                                          : 'border-slate-200 bg-white'
                                    }`}
                                  >
                                    <Badge variant="outline">{String.fromCharCode(65 + optionIndex)}</Badge>
                                    <span className="flex-1 text-foreground">{option}</span>
                                  </div>
                                );
                              })}
                            </div>

                            {entry.explanation ? (
                              <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                                <strong>Explanation:</strong> {entry.explanation}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-3">
                {!isPassed ? <Button onClick={startRetake}>Retake Assessment</Button> : null}
                <Button variant="outline" onClick={() => window.location.assign('/trainee/certificates')}>
                  View Certificates
                </Button>
              </div>
            </div>
          ) : null}

          {!isLoadingAssessment && selectedAssessment && !results && !assessmentStarted ? (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-2xl font-bold text-foreground">
                        {assessmentTitle || selectedAssessment.title}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {assessmentDescription ||
                          selectedAssessment.description ||
                          'Review the assigned MCQ details, then start the assessment when you are ready.'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{selectedAssessment.category_name || 'Category'}</Badge>
                      <Badge variant="outline">{selectedAssessment.question_count} questions</Badge>
                      <Badge variant="outline">{selectedAssessment.passing_threshold}% pass mark</Badge>
                      <Badge variant="outline">{selectedAssessment.time_limit_minutes || 30} min timer</Badge>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <ResultTile label="Questions" value={String(selectedAssessment.question_count)} />
                    <ResultTile label="Passing Score" value={`${selectedAssessment.passing_threshold}%`} />
                    <ResultTile label="Timer" value={`${selectedAssessment.time_limit_minutes || 30} min`} />
                    <ResultTile label="Due Date" value={formatDate(selectedAssessment.due_date)} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {selectedAssessmentPassed
                      ? 'This assessment is already passed. The test is now locked and only the saved review can be opened.'
                      : selectedAssessmentCanRetake
                        ? 'This assessment needs a retake because the last score was below the 90% pass mark.'
                        : 'Click Start Assessment to begin answering. The countdown timer starts when the test opens.'}
                  </div>

                  {selectedAssessment.is_completed ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      Latest score: {selectedAssessment.score_percentage?.toFixed(2) || '0.00'}%
                      {selectedAssessment.certificate_no
                        ? ` | Certificate: ${selectedAssessment.certificate_no}`
                        : ''}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    {!selectedAssessmentPassed ? (
                      <Button type="button" onClick={() => void startAssessment()} disabled={isLoadingAssessment}>
                        <PlayCircle className="size-4" />
                        {selectedAssessmentCanRetake ? 'Retake Assessment' : 'Start Assessment'}
                      </Button>
                    ) : null}
                    {selectedAssessmentCanView ? (
                      <Button
                        type="button"
                        variant={selectedAssessmentLocked ? 'default' : 'outline'}
                        onClick={() =>
                          void loadAssessmentDetail(selectedAssessment.id, {
                            viewOnly: true,
                          })
                        }
                        disabled={isLoadingAssessment}
                      >
                        View Result
                      </Button>
                    ) : null}
                    {selectedAssessment.certificate_no ? (
                      <Button type="button" variant="outline" onClick={() => window.location.assign('/trainee/certificates')}>
                        View Certificates
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {!isLoadingAssessment && selectedAssessment && !results && assessmentStarted ? (
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-2xl font-bold text-foreground">{assessmentTitle || selectedAssessment.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {assessmentDescription || selectedAssessment.description || 'Complete the assigned questions to finish this category.'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{selectedAssessment.category_name || 'Category'}</Badge>
                      <Badge variant="outline">{selectedAssessment.question_count} questions</Badge>
                      <Badge variant="outline">{selectedAssessment.passing_threshold}% pass mark</Badge>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="size-4 text-amber-600" />
                        <span className="font-mono text-foreground">{formatTime(timeRemaining)}</span>
                      </div>
                      <span>{answeredCount}/{questions.length} answered</span>
                      <span>Due {formatDate(selectedAssessment.due_date)}</span>
                    </div>
                    {selectedAssessment.is_completed ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                        Completed already. Latest score: {selectedAssessment.score_percentage?.toFixed(2) || '0.00'}%
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <Progress value={progress} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Question Navigator</CardTitle>
                  <CardDescription>Jump between items and complete the full category to mark this assessment done.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {questions.map((question, index) => (
                      <Button
                        key={question.id}
                        size="sm"
                        variant={currentQuestion === index ? 'default' : 'outline'}
                        className={
                          selectedAnswers[question.id] !== undefined && currentQuestion !== index
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : ''
                        }
                        onClick={() => setCurrentQuestion(index)}
                      >
                        {index + 1}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {questions[currentQuestion] ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Question {currentQuestion + 1} of {questions.length}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-lg font-medium text-foreground">{questions[currentQuestion].question}</div>

                    <div className="space-y-2">
                      {questions[currentQuestion].options.map((option, index) => (
                        <button
                          key={`${questions[currentQuestion].id}-${index}`}
                          type="button"
                          onClick={() => handleSelectAnswer(index)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            selectedAnswers[questions[currentQuestion].id] === index
                              ? 'border-sky-400 bg-sky-50'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Badge variant={selectedAnswers[questions[currentQuestion].id] === index ? 'default' : 'outline'}>
                              {String.fromCharCode(65 + index)}
                            </Badge>
                            <span className="flex-1 text-foreground">{option}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <div className="flex flex-wrap justify-between gap-3">
                <Button variant="outline" onClick={handlePrevious} disabled={currentQuestion === 0}>
                  Previous
                </Button>
                {currentQuestion === questions.length - 1 ? (
                  <Button
                    onClick={() => void submitAssessment()}
                    disabled={isSubmitting || answeredCount !== questions.length}
                  >
                    {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    Submit Assessment
                  </Button>
                ) : (
                  <Button onClick={handleNext}>Next Question</Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ResultTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function QueueSummaryCard({
  label,
  value,
  hint,
  tone = 'slate',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'slate' | 'amber' | 'emerald' | 'sky';
}) {
  const toneClassName =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50'
        : tone === 'sky'
          ? 'border-sky-200 bg-sky-50'
          : 'border-slate-200 bg-slate-50';

  return (
    <div className={`rounded-2xl border p-4 ${toneClassName}`}>
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-600">{hint}</div>
    </div>
  );
}
