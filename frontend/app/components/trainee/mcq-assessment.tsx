'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
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
  due_date?: string | null;
  is_completed: boolean;
  score_percentage?: number | null;
  is_passed?: boolean | null;
  submitted_at?: string | null;
  certificate_id?: string | null;
  certificate_no?: string | null;
};

type ApiAssessmentResponse = {
  id: string;
  title: string;
  description?: string | null;
  category_id: string;
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
  achievement_title?: string | null;
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

export default function MCQAssessment({ category, onComplete }: MCQAssessmentProps) {
  const [assessments, setAssessments] = useState<ApiAssessment[]>([]);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [assessmentTitle, setAssessmentTitle] = useState<string>('');
  const [assessmentDescription, setAssessmentDescription] = useState<string>('');
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [results, setResults] = useState<SubmissionSummary | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(DEFAULT_TIME_LIMIT);
  const [assessmentStarted, setAssessmentStarted] = useState(false);
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);
  const [isLoadingAssessment, setIsLoadingAssessment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');

  const selectedAssessment = useMemo(
    () => assessments.find((assessment) => assessment.id === assessmentId) || null,
    [assessmentId, assessments],
  );
  const questionMap = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const answeredCount = Object.keys(selectedAnswers).length;
  const progress = questions.length ? ((currentQuestion + 1) / questions.length) * 100 : 0;

  const loadAssessmentDetail = async (nextAssessmentId: string, startImmediately = false) => {
    try {
      setIsLoadingAssessment(true);
      setLoadError('');
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const detailRes = await fetch(`/api/certification/mcq/assessment/${nextAssessmentId}`, { headers });
      if (!detailRes.ok) {
        throw new Error('Unable to load assessment questions');
      }
      const detailData: ApiAssessmentResponse = await detailRes.json();
      const mappedQuestions: MCQQuestion[] = (detailData.questions || []).map((question) => ({
        id: question.id,
        question: question.question_text,
        options: ['A', 'B', 'C', 'D'].map((key) => question.options?.[key] || ''),
      }));

      setAssessmentId(nextAssessmentId);
      setAssessmentTitle(detailData.title || 'MCQ Assessment');
      setAssessmentDescription(detailData.description || '');
      setQuestions(mappedQuestions);
      setCurrentQuestion(0);
      setSelectedAnswers({});
      setResults(null);
      setTimeRemaining(DEFAULT_TIME_LIMIT);
      setAssessmentStarted(startImmediately);
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
      if (!assessmentsRes.ok) {
        throw new Error('Unable to load assessments');
      }
      const assessmentsData = await assessmentsRes.json();
      const nextAssessments: ApiAssessment[] = assessmentsData.assessments || [];
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
            nextAssessments.find((assessment) => assessment.category_id === category)
          : null) ||
        nextAssessments.find((assessment) => !assessment.is_completed) ||
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
    if (!assessmentStarted || !questions.length || results || timeRemaining > 0) {
      return;
    }

    toast.error('Time is up. Submit your answers to record the assessment.');
  }, [assessmentStarted, questions.length, results, timeRemaining]);

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

  const submitAssessment = async () => {
    if (!assessmentId) {
      toast.error('Select an assessment first.');
      return;
    }
    if (Object.keys(selectedAnswers).length !== questions.length) {
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
      if (!response.ok) {
        throw new Error('Submission failed');
      }

      const payload: ApiSubmitResponse = await response.json();
      setResults({
        scorePercentage: payload.score_percentage,
        isPassed: payload.is_passed,
        review: payload.review || [],
        certificateNo: payload.certificate_no,
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
                submitted_at: new Date().toISOString(),
                certificate_id: payload.certificate_id || assessment.certificate_id,
                certificate_no: payload.certificate_no || assessment.certificate_no,
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

    await loadAssessmentDetail(selectedAssessment.id, true);
  };

  const startRetake = () => {
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setResults(null);
    setTimeRemaining(DEFAULT_TIME_LIMIT);
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
            Complete each assigned MCQ category to update your trainer dashboard progress and generate the matching
            certificate record in the database.
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

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Assessment Queue</CardTitle>
            <CardDescription>Select one assigned category to open its MCQ questions.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[620px] pr-4">
              <div className="space-y-3">
                {assessments.map((assessment) => {
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
                                : 'Completed'
                              : 'Pending'}
                          </Badge>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{assessment.question_count} questions</span>
                          <span>{assessment.passing_threshold}% pass mark</span>
                          <span>Due {formatDate(assessment.due_date)}</span>
                        </div>

                        {assessment.is_completed ? (
                          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            Score: {assessment.score_percentage?.toFixed(2) || '0.00'}%
                            {assessment.certificate_no ? ` | Certificate: ${assessment.certificate_no}` : ''}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void loadAssessmentDetail(assessment.id, true)}
                          disabled={isLoadingAssessment}
                        >
                          <PlayCircle className="size-4" />
                          {assessment.is_completed ? 'Retake Test' : 'Take the Test'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
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
                        {isPassed ? 'Assessment Passed' : 'Assessment Completed'}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {selectedAssessment.category_name || selectedAssessment.title}
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <ResultTile label="Correct Answers" value={String(score)} />
                      <ResultTile label="Questions" value={String(questions.length)} />
                      <ResultTile label="Score" value={`${percentage.toFixed(0)}%`} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Passing threshold: {selectedAssessment.passing_threshold}%
                      {results.certificateNo
                        ? ` | Certificate recorded: ${results.certificateNo}`
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
                <Button onClick={startRetake}>Retake Assessment</Button>
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
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <ResultTile label="Questions" value={String(selectedAssessment.question_count)} />
                    <ResultTile label="Passing Score" value={`${selectedAssessment.passing_threshold}%`} />
                    <ResultTile label="Due Date" value={formatDate(selectedAssessment.due_date)} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Click <span className="font-semibold text-slate-950">Take the Test</span> to begin answering the
                    MCQ assessment. The countdown timer starts when the test opens.
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
                    <Button type="button" onClick={() => void startAssessment()} disabled={isLoadingAssessment}>
                      <PlayCircle className="size-4" />
                      {selectedAssessment.is_completed ? 'Retake Test' : 'Take the Test'}
                    </Button>
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
