'use client';

import { Award, BookOpen, ClipboardList, Loader2, MessageSquare, Mic, RefreshCw, RotateCcw, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AppUser } from '@/app/types/user';
import { apiFetch } from '@/app/utils/api';
import { dedupeMessages } from '@/app/utils/runtime-errors';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';

interface ProgressTrackingProps {
  user: AppUser;
  title?: string;
  description?: string;
  summaryTitle?: string;
  summaryDescription?: string;
}

type SimFloorReport = {
  summary: {
    total_sessions: number;
    average_score: number;
    pass_rate: number;
    retakes: number;
    latest_score: number;
  };
  scenario_performance: Array<{
    scenario_id: string;
    title: string;
    attempts: number;
    average_score: number;
    pass_rate: number;
  }>;
  recent_sessions: Array<{
    session_id: string;
    scenario_title: string;
    score: number;
    trainer_verdict_status?: string | null;
    created_at?: string | null;
  }>;
  certificates: Array<{
    certificate_id: string;
    certificate_no: string;
  }>;
};

type MicrolearningReport = {
  summary: {
    assignment_count: number;
    in_progress_count: number;
    completed_count: number;
    certified_count: number;
    average_score: number;
    pass_rate: number;
  };
  topic_progress: Array<{
    topic_category_name: string;
    assignment_count: number;
    completed_count: number;
    certified_count: number;
    average_score: number;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    status: string;
    average_score: number;
    completion_percentage: number;
    certificate_id?: string | null;
  }>;
};

type AssessmentRecord = {
  id: string;
  title: string;
  category_name?: string | null;
  is_completed: boolean;
  is_passed?: boolean | null;
  status?: 'pending' | 'passed' | 'failed';
  can_retake?: boolean;
  score_percentage?: number | null;
  submitted_at?: string | null;
  certificate_no?: string | null;
};

type AssessmentResponse = {
  assessments: AssessmentRecord[];
};

type CoachingLog = {
  id: string;
  coaching_id: string;
  scenario_title?: string | null;
  status: 'sent' | 'acknowledged' | 'draft';
  competency_status: 'pending' | 'competent' | 'not_competent';
  created_at?: string | null;
  acknowledged_at?: string | null;
};

type CoachingResponse = {
  logs: CoachingLog[];
};

function formatDate(value?: string | null) {
  if (!value) {
    return 'No date yet';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'No date yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatScore(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0.0%';
  }
  return `${value.toFixed(1)}%`;
}

function getVerdictLabel(value?: string | null) {
  if ((value || '').toLowerCase() === 'competent') {
    return 'Competent';
  }
  if ((value || '').toLowerCase() === 'retake') {
    return 'Retake';
  }
  return 'Pending';
}

function getAssessmentStatus(assessment: AssessmentRecord) {
  if (assessment.status) {
    return assessment.status;
  }
  if (assessment.is_completed && assessment.is_passed) {
    return 'passed';
  }
  if (assessment.is_completed) {
    return 'failed';
  }
  return 'pending';
}

export default function ProgressTracking({
  user,
  title = 'My Progress',
  description = 'Your progress view is organized into the four tracked categories: microlearning, Call Simulation, assessments, and coaching.',
  summaryTitle = 'Progress Summary',
  summaryDescription = 'This page now only shows analytics and completion data that come from the tracked trainee categories.',
}: ProgressTrackingProps) {
  const [simFloorReport, setSimFloorReport] = useState<SimFloorReport | null>(null);
  const [microlearningReport, setMicrolearningReport] = useState<MicrolearningReport | null>(null);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [coachingLogs, setCoachingLogs] = useState<CoachingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const traineeId = user.id || user.user_id;

  const loadProgress = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!traineeId) {
      setMessages(['Missing trainee account ID. Please sign in again.']);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const results = await Promise.allSettled([
      apiFetch<SimFloorReport>(`/api/call-simulation/reports/trainee/${traineeId}`),
      apiFetch<MicrolearningReport>('/api/trainee/microlearning-report'),
      apiFetch<AssessmentResponse>('/api/certification/mcq/my-assessments'),
      apiFetch<CoachingResponse>('/api/certification/coaching/logs'),
    ]);

    const nextMessages: string[] = [];

    if (results[0].status === 'fulfilled') {
      setSimFloorReport(results[0].value);
    } else {
      setSimFloorReport(null);
      nextMessages.push(results[0].reason instanceof Error ? results[0].reason.message : 'Unable to load Call Simulation progress.');
    }

    if (results[1].status === 'fulfilled') {
      setMicrolearningReport(results[1].value);
    } else {
      setMicrolearningReport(null);
      nextMessages.push(results[1].reason instanceof Error ? results[1].reason.message : 'Unable to load microlearning progress.');
    }

    if (results[2].status === 'fulfilled') {
      setAssessments(results[2].value.assessments || []);
    } else {
      setAssessments([]);
      nextMessages.push(results[2].reason instanceof Error ? results[2].reason.message : 'Unable to load assessment progress.');
    }

    if (results[3].status === 'fulfilled') {
      setCoachingLogs(results[3].value.logs || []);
    } else {
      setCoachingLogs([]);
      nextMessages.push(results[3].reason instanceof Error ? results[3].reason.message : 'Unable to load coaching progress.');
    }

    setMessages(dedupeMessages(nextMessages));
    setLoading(false);
    setRefreshing(false);
  }, [traineeId]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const assessmentSummary = useMemo(() => {
    const completed = assessments.filter((assessment) => assessment.is_completed).length;
    const passed = assessments.filter((assessment) => getAssessmentStatus(assessment) === 'passed').length;
    const failed = assessments.filter((assessment) => getAssessmentStatus(assessment) === 'failed').length;
    const scoreValues = assessments
      .map((assessment) => Number(assessment.score_percentage))
      .filter((score) => Number.isFinite(score));

    return {
      assigned: assessments.length,
      completed,
      passed,
      failed,
      averageScore: scoreValues.length
        ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
        : 0,
    };
  }, [assessments]);

  const coachingSummary = useMemo(() => {
    return {
      total: coachingLogs.length,
      pending: coachingLogs.filter((log) => log.status === 'sent').length,
      acknowledged: coachingLogs.filter((log) => log.status === 'acknowledged').length,
      retake: coachingLogs.filter((log) => log.competency_status === 'not_competent').length,
    };
  }, [coachingLogs]);

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading progress analytics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-2xl font-bold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <Button type="button" variant="outline" onClick={() => void loadProgress('refresh')} disabled={refreshing}>
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </Button>
      </div>

      {messages.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {messages.join(' ')}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Microlearning"
          icon={<BookOpen className="size-4 text-sky-700" />}
          primary={`${microlearningReport?.summary.completed_count || 0}/${microlearningReport?.summary.assignment_count || 0}`}
          secondary={`${microlearningReport?.summary.certified_count || 0} certified | Avg ${formatScore(microlearningReport?.summary.average_score)}`}
        />
        <SummaryCard
          title="Call Simulation"
          icon={<Mic className="size-4 text-violet-700" />}
          primary={String(simFloorReport?.summary.total_sessions || 0)}
          secondary={`Avg ${formatScore(simFloorReport?.summary.average_score)} | ${simFloorReport?.summary.retakes || 0} retakes`}
        />
        <SummaryCard
          title="Assessments"
          icon={<ClipboardList className="size-4 text-emerald-700" />}
          primary={`${assessmentSummary.completed}/${assessmentSummary.assigned}`}
          secondary={`${assessmentSummary.passed} passed | ${assessmentSummary.failed} failed`}
        />
        <SummaryCard
          title="My Coaching"
          icon={<MessageSquare className="size-4 text-amber-700" />}
          primary={String(coachingSummary.total)}
          secondary={`${coachingSummary.pending} pending | ${coachingSummary.acknowledged} acknowledged`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5 text-sky-700" />
              Microlearning Completion and Analytics
            </CardTitle>
            <CardDescription>Assignment completion, certification, and topic-level progress.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniMetric label="In Progress" value={String(microlearningReport?.summary.in_progress_count || 0)} />
              <MiniMetric label="Completed" value={String(microlearningReport?.summary.completed_count || 0)} />
              <MiniMetric label="Pass Rate" value={formatScore(microlearningReport?.summary.pass_rate)} />
            </div>

            {(microlearningReport?.topic_progress || []).slice(0, 4).map((topic) => (
              <div key={topic.topic_category_name} className="rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900">{topic.topic_category_name}</div>
                  <Badge variant="outline">{formatScore(topic.average_score)}</Badge>
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {topic.completed_count}/{topic.assignment_count} completed | {topic.certified_count} certified
                </div>
                <div className="mt-3">
                  <Progress value={topic.assignment_count ? (topic.completed_count / topic.assignment_count) * 100 : 0} />
                </div>
              </div>
            ))}

            {!microlearningReport?.topic_progress.length ? (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                No microlearning activity is recorded yet.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="size-5 text-violet-700" />
              Call Simulation Completion and Analytics
            </CardTitle>
            <CardDescription>Attempt history, average scores, pass rate, and retakes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniMetric label="Sessions" value={String(simFloorReport?.summary.total_sessions || 0)} />
              <MiniMetric label="Average" value={formatScore(simFloorReport?.summary.average_score)} />
              <MiniMetric label="Pass Rate" value={formatScore(simFloorReport?.summary.pass_rate)} />
              <MiniMetric label="Certificates" value={String(simFloorReport?.certificates.length || 0)} />
            </div>

            {(simFloorReport?.recent_sessions || []).slice(0, 4).map((session) => (
              <div key={session.session_id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{session.scenario_title}</div>
                    <div className="mt-1 text-sm text-slate-600">{formatDate(session.created_at)}</div>
                  </div>
                  <Badge variant="outline">{formatScore(session.score)}</Badge>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Verdict: {getVerdictLabel(session.trainer_verdict_status)}
                </div>
              </div>
            ))}

            {!simFloorReport?.recent_sessions.length ? (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                No Call Simulation attempts are recorded yet.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-5 text-emerald-700" />
              Assessment Completion and Analytics
            </CardTitle>
            <CardDescription>Assigned categories, pass results, failures, and retake eligibility.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniMetric label="Assigned" value={String(assessmentSummary.assigned)} />
              <MiniMetric label="Passed" value={String(assessmentSummary.passed)} />
              <MiniMetric label="Failed" value={String(assessmentSummary.failed)} />
              <MiniMetric label="Average" value={formatScore(assessmentSummary.averageScore)} />
            </div>

            {assessments.slice(0, 5).map((assessment) => {
              const status = getAssessmentStatus(assessment);
              return (
                <div key={assessment.id} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{assessment.title}</div>
                      <div className="mt-1 text-sm text-slate-600">{assessment.category_name || 'Assessment category'}</div>
                    </div>
                    <Badge
                      className={
                        status === 'passed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : status === 'failed'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-700'
                      }
                    >
                      {status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : 'Pending'}
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Score {formatScore(assessment.score_percentage)} | Submitted {formatDate(assessment.submitted_at)}
                  </div>
                  {assessment.can_retake ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-amber-700">
                      <RotateCcw className="size-3.5" />
                      Retake available
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!assessments.length ? (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                No assessment assignments are recorded yet.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-5 text-amber-700" />
              My Coaching Completion and Analytics
            </CardTitle>
            <CardDescription>Acknowledgement status, retake coaching, and recent trainer logs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniMetric label="Total Logs" value={String(coachingSummary.total)} />
              <MiniMetric label="Pending Ack" value={String(coachingSummary.pending)} />
              <MiniMetric label="Acknowledged" value={String(coachingSummary.acknowledged)} />
              <MiniMetric label="Retake" value={String(coachingSummary.retake)} />
            </div>

            {coachingLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{log.coaching_id}</div>
                    <div className="mt-1 text-sm text-slate-600">{log.scenario_title || 'General coaching'}</div>
                  </div>
                  <Badge variant={log.status === 'acknowledged' ? 'default' : 'secondary'}>
                    {log.status === 'acknowledged' ? 'Acknowledged' : log.status === 'sent' ? 'Pending Ack' : 'Draft'}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {formatDate(log.created_at)} | {log.competency_status.replace(/_/g, ' ')}
                </div>
              </div>
            ))}

            {!coachingLogs.length ? (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                No coaching logs are recorded yet.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-sky-200 bg-[linear-gradient(135deg,rgba(239,246,255,0.95),rgba(255,255,255,0.98))]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-5 text-sky-700" />
            {summaryTitle}
          </CardTitle>
          <CardDescription>{summaryDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InsightTile label="Microlearning Certificates" value={String(microlearningReport?.summary.certified_count || 0)} icon={<Award className="size-4 text-amber-600" />} />
          <InsightTile label="Call Simulation Retakes" value={String(simFloorReport?.summary.retakes || 0)} icon={<RotateCcw className="size-4 text-violet-600" />} />
          <InsightTile label="Assessment Passes" value={String(assessmentSummary.passed)} icon={<ClipboardList className="size-4 text-emerald-600" />} />
          <InsightTile label="Coaching Pending Ack" value={String(coachingSummary.pending)} icon={<MessageSquare className="size-4 text-sky-600" />} />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  icon,
  primary,
  secondary,
}: {
  title: string;
  icon: ReactNode;
  primary: string;
  secondary: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-600">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-950">{primary}</div>
        <div className="mt-1 text-xs text-slate-500">{secondary}</div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-slate-50 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function InsightTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-950">{value}</div>
    </div>
  );
}
