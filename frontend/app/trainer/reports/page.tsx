'use client';

import { BookOpen, ClipboardList, Download, Loader2, MessageSquare, Mic, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import type { TrainerReportOverview } from '@/app/components/trainer/microlearning-studio-utils';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Progress } from '@/app/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { trainerSidebarItems } from '@/app/trainer/nav';
import { apiFetch } from '@/app/utils/api';
import { dedupeMessages } from '@/app/utils/runtime-errors';

type ReportScope = 'batch' | 'trainee';

type Batch = {
  id: string;
  name: string;
  wave_number?: number | null;
  users_count?: number;
};

type Trainee = {
  id: string;
  full_name: string;
  email: string;
  batch_names?: string[];
};

type TrainerBatchListResponse = {
  batches: Batch[];
};

type TrainerTraineeListResponse = {
  trainees: Trainee[];
};

type AssessmentTrainee = {
  id: string;
  full_name: string;
  email: string;
  batch_id?: string | null;
  batch_name?: string | null;
  status: 'pending' | 'completed';
  score_percentage?: number | null;
  is_passed?: boolean | null;
  submitted_at?: string | null;
  certificate_id?: string | null;
};

type AssessmentAssignment = {
  id: string;
  title: string;
  category_name?: string | null;
  assigned_batch_id?: string | null;
  assigned_batch_name?: string | null;
  completion_rate: number;
  total_trainees: number;
  completed_trainees: number;
  passed_trainees: number;
  certificate_count: number;
  due_date?: string | null;
  trainees: AssessmentTrainee[];
};

type AssessmentAssignmentsResponse = {
  assignments: AssessmentAssignment[];
};

type CoachingHubResponse = {
  summary?: {
    completed_categories: number;
    ready_for_coaching: number;
    pending_acknowledgement: number;
    acknowledged: number;
    competent: number;
    not_competent: number;
  };
  completed_categories: Array<{
    trainee_id: string;
    trainee_name?: string | null;
    scenario_title?: string | null;
    training_state?: {
      label?: string | null;
      summary?: string | null;
    };
    overall_score?: number | null;
    created_at?: string | null;
  }>;
  recent_logs?: Array<{
    id: string;
    coaching_id: string;
    trainee_name?: string | null;
    scenario_title?: string | null;
    status: string;
    competency_status: string;
    created_at?: string | null;
  }>;
};

type SimFloorBatchReport = {
  period: string;
  summary: {
    total_trainees: number;
    total_sessions: number;
    average_score: number;
    pass_rate: number;
    retakes: number;
  };
  scenario_performance: Array<{
    scenario_id: string;
    title: string;
    completed_sessions: number;
    average_score: number;
    pass_rate: number;
  }>;
  trainee_performance: Array<{
    trainee_id: string;
    trainee_name: string;
    total_sessions: number;
    average_score: number;
    pass_rate: number;
  }>;
};

type SimFloorTraineeReport = {
  period: string;
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
    best_score: number;
    pass_rate: number;
  }>;
  recent_sessions: Array<{
    session_id: string;
    scenario_title: string;
    score: number;
    trainer_verdict_status?: string | null;
    created_at?: string | null;
  }>;
};

type ScopeAssessmentRow = {
  assessmentId: string;
  title: string;
  categoryName: string | null | undefined;
  status: 'pending' | 'completed';
  isPassed?: boolean | null;
  scorePercentage?: number | null;
  submittedAt?: string | null;
  certificateId?: string | null;
};

function formatPercent(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0.0%';
  }
  return `${value.toFixed(1)}%`;
}

function formatDateLabel(value?: string | null) {
  if (!value) {
    return 'No date yet';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'No date yet';
  }
  return parsed.toLocaleDateString();
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scopeLabel(scope: ReportScope, batch?: Batch | null, trainee?: Trainee | null) {
  if (scope === 'batch') {
    if (!batch) {
      return 'Select a batch';
    }
    return batch.wave_number !== null && batch.wave_number !== undefined
      ? `${batch.name} | Wave ${batch.wave_number}`
      : batch.name;
  }

  return trainee?.full_name || 'Select a trainee';
}

function SummaryCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{value}</div>
          <div className="mt-2 text-xs text-muted-foreground">{helper}</div>
        </div>
        <div className="rounded-full bg-muted p-3 text-primary">{icon}</div>
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

export default function ReportsPage() {
  const [scope, setScope] = useState<ReportScope>('batch');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedTraineeId, setSelectedTraineeId] = useState('');
  const [microlearningReport, setMicrolearningReport] = useState<TrainerReportOverview | null>(null);
  const [assessmentAssignments, setAssessmentAssignments] = useState<AssessmentAssignment[]>([]);
  const [coachingHub, setCoachingHub] = useState<CoachingHubResponse | null>(null);
  const [simFloorBatch, setSimFloorBatch] = useState<SimFloorBatchReport | null>(null);
  const [simFloorTrainee, setSimFloorTrainee] = useState<SimFloorTraineeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) || null,
    [batches, selectedBatchId],
  );
  const selectedTrainee = useMemo(
    () => trainees.find((trainee) => trainee.id === selectedTraineeId) || null,
    [selectedTraineeId, trainees],
  );

  const loadBaseData = useCallback(async () => {
    const results = await Promise.allSettled([
      apiFetch<TrainerBatchListResponse>('/api/trainer/batches'),
      apiFetch<TrainerTraineeListResponse>('/api/trainer/trainees'),
      apiFetch<TrainerReportOverview>('/api/trainer/microlearning-reports/overview'),
      apiFetch<AssessmentAssignmentsResponse>('/api/certification/mcq/assignments'),
    ]);

    const nextMessages: string[] = [];

    if (results[0].status === 'fulfilled') {
      const nextBatches = results[0].value.batches || [];
      setBatches(nextBatches);
      setSelectedBatchId((current) =>
        nextBatches.some((batch) => batch.id === current) ? current : nextBatches[0]?.id || '',
      );
    } else {
      setBatches([]);
      nextMessages.push(results[0].reason instanceof Error ? results[0].reason.message : 'Unable to load batches.');
    }

    if (results[1].status === 'fulfilled') {
      const nextTrainees = results[1].value.trainees || [];
      setTrainees(nextTrainees);
      setSelectedTraineeId((current) =>
        nextTrainees.some((trainee) => trainee.id === current) ? current : nextTrainees[0]?.id || '',
      );
    } else {
      setTrainees([]);
      nextMessages.push(results[1].reason instanceof Error ? results[1].reason.message : 'Unable to load trainees.');
    }

    if (results[2].status === 'fulfilled') {
      setMicrolearningReport(results[2].value);
    } else {
      setMicrolearningReport(null);
      nextMessages.push(results[2].reason instanceof Error ? results[2].reason.message : 'Unable to load microlearning reports.');
    }

    if (results[3].status === 'fulfilled') {
      setAssessmentAssignments(results[3].value.assignments || []);
    } else {
      setAssessmentAssignments([]);
      nextMessages.push(results[3].reason instanceof Error ? results[3].reason.message : 'Unable to load assessment reports.');
    }

    setMessages(dedupeMessages(nextMessages));
  }, []);

  const loadScopeData = useCallback(async () => {
    if (scope === 'batch' && !selectedBatchId) {
      setSimFloorBatch(null);
      setSimFloorTrainee(null);
      setCoachingHub(null);
      return;
    }

    if (scope === 'trainee' && !selectedTraineeId) {
      setSimFloorBatch(null);
      setSimFloorTrainee(null);
      setCoachingHub(null);
      return;
    }

    const simFloorRequest =
      scope === 'batch'
        ? apiFetch<SimFloorBatchReport>(`/api/call-simulation/reports/batch/${selectedBatchId}`)
        : apiFetch<SimFloorTraineeReport>(`/api/call-simulation/reports/trainee/${selectedTraineeId}`);
    const coachingRequest = apiFetch<CoachingHubResponse>(
      scope === 'batch'
        ? `/api/certification/coaching/hub?batch_id=${selectedBatchId}`
        : `/api/certification/coaching/hub?trainee_id=${selectedTraineeId}`,
    );

    const results = await Promise.allSettled([simFloorRequest, coachingRequest]);
    const nextMessages: string[] = [];

    if (results[0].status === 'fulfilled') {
      if (scope === 'batch') {
        setSimFloorBatch(results[0].value as SimFloorBatchReport);
        setSimFloorTrainee(null);
      } else {
        setSimFloorBatch(null);
        setSimFloorTrainee(results[0].value as SimFloorTraineeReport);
      }
    } else {
      setSimFloorBatch(null);
      setSimFloorTrainee(null);
      nextMessages.push(results[0].reason instanceof Error ? results[0].reason.message : 'Unable to load Call Simulation reports.');
    }

    if (results[1].status === 'fulfilled') {
      setCoachingHub(results[1].value);
    } else {
      setCoachingHub(null);
      nextMessages.push(results[1].reason instanceof Error ? results[1].reason.message : 'Unable to load coaching reports.');
    }

    setMessages((current) =>
      dedupeMessages([
        ...current.filter((message) => !message.includes('Call Simulation') && !message.includes('coaching')),
        ...nextMessages,
      ]),
    );
  }, [scope, selectedBatchId, selectedTraineeId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadBaseData();
      setLoading(false);
    })();
  }, [loadBaseData]);

  useEffect(() => {
    void loadScopeData();
  }, [loadScopeData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBaseData();
    await loadScopeData();
    setRefreshing(false);
  };

  const handleDownloadPDF = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const params = new URLSearchParams();
      params.append('scope', scope);
      if (scope === 'batch' && selectedBatchId) {
        params.append('batch_id', selectedBatchId);
      } else if (scope === 'trainee' && selectedTraineeId) {
        params.append('trainee_id', selectedTraineeId);
      }

      const response = await fetch(`/api/export/trainer-report-pdf?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to download PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = scope === 'batch'
        ? `Progress_Report_Batch_${selectedBatch?.name || selectedBatchId}_${new Date().toISOString().split('T')[0]}.pdf`
        : `Progress_Report_Trainee_${selectedTrainee?.full_name || selectedTraineeId}_${new Date().toISOString().split('T')[0]}.pdf`;
      link.download = filename.replace(/\s+/g, '_');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download PDF error:', error);
      alert(error instanceof Error ? error.message : 'Failed to download PDF report');
    }
  };

  const microlearningAssignments = useMemo(() => {
    const rows = microlearningReport?.assignments || [];
    if (scope === 'batch') {
      return rows.filter((assignment) => assignment.batch_id === selectedBatchId);
    }
    return rows.filter((assignment) => assignment.user_id === selectedTraineeId);
  }, [microlearningReport, scope, selectedBatchId, selectedTraineeId]);

  const microlearningSummary = useMemo(() => {
    const completed = microlearningAssignments.filter((assignment) => ['completed', 'certified'].includes(assignment.status)).length;
    const certified = microlearningAssignments.filter((assignment) => Boolean(assignment.certificate_id)).length;
    const scores = microlearningAssignments
      .filter((assignment) => assignment.completed_exercises > 0)
      .map((assignment) => Number(assignment.average_score || 0));

    return {
      assignmentCount: microlearningAssignments.length,
      completed,
      certified,
      averageScore: average(scores),
      passRate: microlearningAssignments.length ? (certified / microlearningAssignments.length) * 100 : 0,
    };
  }, [microlearningAssignments]);

  const assessmentRows = useMemo(() => {
    if (scope === 'batch') {
      return assessmentAssignments.filter(
        (assignment) =>
          assignment.assigned_batch_id === selectedBatchId ||
          assignment.trainees.some((trainee) => trainee.batch_id === selectedBatchId),
      );
    }

    return assessmentAssignments
      .map((assignment) => {
        const trainee = assignment.trainees.find((entry) => entry.id === selectedTraineeId);
        if (!trainee) {
          return null;
        }
        return {
          assessmentId: assignment.id,
          title: assignment.title,
          categoryName: assignment.category_name,
          status: trainee.status,
          isPassed: trainee.is_passed,
          scorePercentage: trainee.score_percentage,
          submittedAt: trainee.submitted_at,
          certificateId: trainee.certificate_id,
        } satisfies ScopeAssessmentRow;
      })
      .filter(Boolean) as ScopeAssessmentRow[];
  }, [assessmentAssignments, scope, selectedBatchId, selectedTraineeId]);

  const assessmentSummary = useMemo(() => {
    if (scope === 'batch') {
      const batchRows = assessmentRows as AssessmentAssignment[];
      const totalAssigned = batchRows.reduce((sum, assignment) => sum + assignment.total_trainees, 0);
      const completed = batchRows.reduce((sum, assignment) => sum + assignment.completed_trainees, 0);
      const passed = batchRows.reduce((sum, assignment) => sum + assignment.passed_trainees, 0);
      return {
        totalAssigned,
        completed,
        passed,
        certificates: batchRows.reduce((sum, assignment) => sum + assignment.certificate_count, 0),
      };
    }

    const typedRows = assessmentRows as ScopeAssessmentRow[];
    return {
      totalAssigned: typedRows.length,
      completed: typedRows.filter((row) => row.status === 'completed').length,
      passed: typedRows.filter((row) => row.isPassed === true).length,
      certificates: typedRows.filter((row) => Boolean(row.certificateId)).length,
    };
  }, [assessmentRows, scope]);

  const simFloorSummary = scope === 'batch' ? simFloorBatch?.summary : simFloorTrainee?.summary;
  const coachingSummary = coachingHub?.summary;
  const simFloorRows =
    scope === 'batch' ? simFloorBatch?.trainee_performance || [] : simFloorTrainee?.recent_sessions || [];

  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="text-muted-foreground">
              Database-backed reports for microlearning, Call Simulation, assessments, and coaching only.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void handleDownloadPDF()} disabled={loading || refreshing}>
              <Download className="mr-2 size-4" />
              Download PDF
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleRefresh()} disabled={loading || refreshing}>
              {refreshing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
              Refresh
            </Button>
          </div>
        </div>

        {messages.length ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 text-sm text-amber-800">{messages.join(' ')}</CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Report Scope</CardTitle>
            <CardDescription>Choose whether you want to review a batch or a single trainee.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">View By</div>
              <Select value={scope} onValueChange={(value: ReportScope) => setScope(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="batch">Batch</SelectItem>
                  <SelectItem value="trainee">Trainee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === 'batch' ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Batch</div>
                <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.wave_number !== null && batch.wave_number !== undefined
                          ? `${batch.name} | Wave ${batch.wave_number}`
                          : batch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-medium">Trainee</div>
                <Select value={selectedTraineeId} onValueChange={setSelectedTraineeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a trainee" />
                  </SelectTrigger>
                  <SelectContent>
                    {trainees.map((trainee) => (
                      <SelectItem key={trainee.id} value={trainee.id}>
                        {trainee.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rounded-2xl border bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Current Scope</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{scopeLabel(scope, selectedBatch, selectedTrainee)}</div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading trainer reports...
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={<BookOpen className="size-5" />} label="Microlearning" value={`${microlearningSummary.completed}/${microlearningSummary.assignmentCount}`} helper={`${microlearningSummary.certified} certified | Avg ${formatPercent(microlearningSummary.averageScore)}`} />
              <SummaryCard icon={<Mic className="size-5" />} label="Call Simulation" value={String(simFloorSummary?.total_sessions || 0)} helper={`Avg ${formatPercent(simFloorSummary?.average_score)} | Pass ${formatPercent(simFloorSummary?.pass_rate)}`} />
              <SummaryCard icon={<ClipboardList className="size-5" />} label="Assessments" value={`${assessmentSummary.completed}/${assessmentSummary.totalAssigned}`} helper={`${assessmentSummary.passed} passed | ${assessmentSummary.certificates} certificates`} />
              <SummaryCard icon={<MessageSquare className="size-5" />} label="Coaching" value={String(coachingSummary?.completed_categories || 0)} helper={`${coachingSummary?.pending_acknowledgement || 0} pending ack | ${coachingSummary?.acknowledged || 0} acknowledged`} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Microlearning Completion and Analytics</CardTitle>
                  <CardDescription>Assignments, completion, certificates, and scores from the database.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MiniMetric label="Assigned" value={String(microlearningSummary.assignmentCount)} />
                    <MiniMetric label="Completed" value={String(microlearningSummary.completed)} />
                    <MiniMetric label="Certified" value={String(microlearningSummary.certified)} />
                    <MiniMetric label="Pass Rate" value={formatPercent(microlearningSummary.passRate)} />
                  </div>

                  {(microlearningAssignments || []).slice(0, 5).map((assignment) => (
                    <div key={assignment.id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{assignment.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{assignment.trainee_name || assignment.batch_label || 'Direct assignment'}</div>
                        </div>
                        <Badge variant={assignment.certificate_id ? 'default' : 'secondary'}>{assignment.status.replace(/_/g, ' ')}</Badge>
                      </div>
                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                          <span>Progress</span>
                          <span>{Math.round(assignment.completion_percentage || 0)}%</span>
                        </div>
                        <Progress value={assignment.completion_percentage || 0} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Call Simulation Completion and Analytics</CardTitle>
                  <CardDescription>Attempts, scores, pass rates, and retakes for the selected scope.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MiniMetric label="Sessions" value={String(simFloorSummary?.total_sessions || 0)} />
                    <MiniMetric label="Average" value={formatPercent(simFloorSummary?.average_score)} />
                    <MiniMetric label="Pass Rate" value={formatPercent(simFloorSummary?.pass_rate)} />
                    <MiniMetric label="Retakes" value={String(simFloorSummary?.retakes || 0)} />
                  </div>

                  {simFloorRows.slice(0, 5).map((row) => (
                    <div
                      key={scope === 'batch' ? (row as SimFloorBatchReport['trainee_performance'][number]).trainee_id : (row as SimFloorTraineeReport['recent_sessions'][number]).session_id}
                      className="rounded-2xl border p-4"
                    >
                      {scope === 'batch' ? (
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{(row as SimFloorBatchReport['trainee_performance'][number]).trainee_name}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {(row as SimFloorBatchReport['trainee_performance'][number]).total_sessions} sessions
                            </div>
                          </div>
                          <Badge variant="outline">{formatPercent((row as SimFloorBatchReport['trainee_performance'][number]).average_score)}</Badge>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{(row as SimFloorTraineeReport['recent_sessions'][number]).scenario_title}</div>
                            <div className="mt-1 text-xs text-slate-500">{formatDateLabel((row as SimFloorTraineeReport['recent_sessions'][number]).created_at)}</div>
                          </div>
                          <Badge variant="outline">{formatPercent((row as SimFloorTraineeReport['recent_sessions'][number]).score)}</Badge>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Assessment Completion and Analytics</CardTitle>
                  <CardDescription>Assignment completion, pass results, and certificate issuance.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MiniMetric label="Assigned" value={String(assessmentSummary.totalAssigned)} />
                    <MiniMetric label="Completed" value={String(assessmentSummary.completed)} />
                    <MiniMetric label="Passed" value={String(assessmentSummary.passed)} />
                    <MiniMetric label="Certificates" value={String(assessmentSummary.certificates)} />
                  </div>

                  {(assessmentRows as Array<AssessmentAssignment | ScopeAssessmentRow>).slice(0, 5).map((row) => (
                    <div key={'assessmentId' in row ? row.assessmentId : row.id} className="rounded-2xl border p-4">
                      {'assessmentId' in row ? (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">{row.title}</div>
                              <div className="mt-1 text-xs text-slate-500">{row.categoryName || 'Assessment category'}</div>
                            </div>
                            <Badge variant={row.isPassed ? 'default' : row.status === 'completed' ? 'destructive' : 'secondary'}>
                              {row.isPassed ? 'Passed' : row.status === 'completed' ? 'Failed' : 'Pending'}
                            </Badge>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            Score {formatPercent(row.scorePercentage)} | Submitted {formatDateLabel(row.submittedAt)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">{row.title}</div>
                              <div className="mt-1 text-xs text-slate-500">{row.category_name || 'Assessment category'}</div>
                            </div>
                            <Badge variant="outline">{formatPercent(row.completion_rate)}</Badge>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            {row.completed_trainees}/{row.total_trainees} completed | {row.passed_trainees} passed
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>My Coaching Completion and Analytics</CardTitle>
                  <CardDescription>Coaching readiness, acknowledgement, and competency outcomes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MiniMetric label="Ready" value={String(coachingSummary?.ready_for_coaching || 0)} />
                    <MiniMetric label="Pending Ack" value={String(coachingSummary?.pending_acknowledgement || 0)} />
                    <MiniMetric label="Acknowledged" value={String(coachingSummary?.acknowledged || 0)} />
                    <MiniMetric label="Retake" value={String(coachingSummary?.not_competent || 0)} />
                  </div>

                  {(coachingHub?.recent_logs || []).slice(0, 5).map((log) => (
                    <div key={log.id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{log.trainee_name || 'Trainee'}</div>
                          <div className="mt-1 text-xs text-slate-500">{log.scenario_title || log.coaching_id}</div>
                        </div>
                        <Badge variant={log.status === 'acknowledged' ? 'default' : 'secondary'}>
                          {log.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {log.competency_status.replace(/_/g, ' ')} | {formatDateLabel(log.created_at)}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
