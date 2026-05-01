'use client';

import { BookOpen, ClipboardList, Download, Loader2, MessageSquare, Mic, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Progress } from '@/app/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { apiFetch } from '@/app/utils/api';
import { dedupeMessages } from '@/app/utils/runtime-errors';

type ReportScope = 'trainer' | 'batch';

type Trainer = {
  id: string;
  full_name: string;
  email: string;
  batches_count?: number;
  trainees_count?: number;
};

type Batch = {
  id: string;
  name: string;
  wave_number?: number | null;
  users_count?: number;
  trainer_id?: string | null;
  trainer_name?: string | null;
};

type TrainersResponse = {
  trainers: Trainer[];
};

type BatchesResponse = {
  batches: Batch[];
};

type MicrolearningAssignment = {
  id: string;
  title?: string | null;
  trainee_name?: string | null;
  batch_id?: string | null;
  batch_name?: string | null;
  status: string;
  completion_percentage: number;
  average_score: number;
  certificate_id?: string | null;
  assigned_by?: string | null;
  assigned_by_name?: string | null;
};

type AdminMicrolearningOverview = {
  summary: {
    assignment_count: number;
    in_progress_count: number;
    completed_count: number;
    certified_count: number;
    average_score: number;
    pass_rate: number;
  };
  assignments: MicrolearningAssignment[];
  recent_certificates: Array<{
    certificate_id?: string | null;
    certificate_no?: string | null;
    module_title?: string | null;
    trainee_name?: string | null;
    assigned_by?: string | null;
    batch_id?: string | null;
    issued_at?: string | null;
  }>;
};

type AssessmentTrainee = {
  id: string;
  full_name: string;
  batch_id?: string | null;
  score_percentage?: number | null;
  is_passed?: boolean | null;
  certificate_id?: string | null;
};

type AssessmentAssignment = {
  id: string;
  title: string;
  category_name?: string | null;
  assigned_batch_id?: string | null;
  assigned_by?: string | null;
  completion_rate: number;
  total_trainees: number;
  completed_trainees: number;
  passed_trainees: number;
  certificate_count: number;
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
  batch_id: string;
  batch_name: string;
  wave_number?: number | null;
  summary: {
    total_trainees: number;
    total_sessions: number;
    average_score: number;
    pass_rate: number;
    retakes: number;
  };
  trainee_performance: Array<{
    trainee_id: string;
    trainee_name: string;
    total_sessions: number;
    average_score: number;
    pass_rate: number;
  }>;
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

export default function AdminReportsPage() {
  const [scope, setScope] = useState<ReportScope>('trainer');
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [microlearningReport, setMicrolearningReport] = useState<AdminMicrolearningOverview | null>(null);
  const [assessmentAssignments, setAssessmentAssignments] = useState<AssessmentAssignment[]>([]);
  const [coachingHub, setCoachingHub] = useState<CoachingHubResponse | null>(null);
  const [simFloorReports, setSimFloorReports] = useState<SimFloorBatchReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const selectedTrainer = useMemo(
    () => trainers.find((trainer) => trainer.id === selectedTrainerId) || null,
    [selectedTrainerId, trainers],
  );
  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) || null,
    [batches, selectedBatchId],
  );
  const trainerBatchIds = useMemo(
    () => batches.filter((batch) => batch.trainer_id === selectedTrainerId).map((batch) => batch.id),
    [batches, selectedTrainerId],
  );

  const loadBaseData = useCallback(async () => {
    const results = await Promise.allSettled([
      apiFetch<TrainersResponse>('/api/admin/trainers'),
      apiFetch<BatchesResponse>('/api/admin/batches'),
      apiFetch<AdminMicrolearningOverview>('/api/admin/microlearning-reports/overview'),
      apiFetch<AssessmentAssignmentsResponse>('/api/certification/mcq/assignments'),
    ]);

    const nextMessages: string[] = [];

    if (results[0].status === 'fulfilled') {
      const nextTrainers = results[0].value.trainers || [];
      setTrainers(nextTrainers);
      setSelectedTrainerId((current) =>
        nextTrainers.some((trainer) => trainer.id === current) ? current : nextTrainers[0]?.id || '',
      );
    } else {
      setTrainers([]);
      nextMessages.push(results[0].reason instanceof Error ? results[0].reason.message : 'Unable to load trainers.');
    }

    if (results[1].status === 'fulfilled') {
      const nextBatches = results[1].value.batches || [];
      setBatches(nextBatches);
      setSelectedBatchId((current) =>
        nextBatches.some((batch) => batch.id === current) ? current : nextBatches[0]?.id || '',
      );
    } else {
      setBatches([]);
      nextMessages.push(results[1].reason instanceof Error ? results[1].reason.message : 'Unable to load batches.');
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
    if (scope === 'trainer' && !selectedTrainerId) {
      setSimFloorReports([]);
      setCoachingHub(null);
      return;
    }

    if (scope === 'batch' && !selectedBatchId) {
      setSimFloorReports([]);
      setCoachingHub(null);
      return;
    }

    const coachingPromise = apiFetch<CoachingHubResponse>(
      scope === 'trainer'
        ? `/api/certification/coaching/hub?trainer_id=${selectedTrainerId}`
        : `/api/certification/coaching/hub?batch_id=${selectedBatchId}`,
    );

    const simFloorRequests =
      scope === 'trainer'
        ? trainerBatchIds.map((batchId) => apiFetch<SimFloorBatchReport>(`/api/call-simulation/reports/batch/${batchId}`))
        : [apiFetch<SimFloorBatchReport>(`/api/call-simulation/reports/batch/${selectedBatchId}`)];

    const [coachingResult, simFloorResults] = await Promise.all([
      coachingPromise.then((value) => ({ status: 'fulfilled' as const, value })).catch((reason) => ({ status: 'rejected' as const, reason })),
      Promise.allSettled(simFloorRequests),
    ]);

    const nextMessages: string[] = [];

    if (coachingResult.status === 'fulfilled') {
      setCoachingHub(coachingResult.value);
    } else {
      setCoachingHub(null);
      nextMessages.push(coachingResult.reason instanceof Error ? coachingResult.reason.message : 'Unable to load coaching reports.');
    }

    const fulfilledReports = simFloorResults
      .filter((result): result is PromiseFulfilledResult<SimFloorBatchReport> => result.status === 'fulfilled')
      .map((result) => result.value);
    setSimFloorReports(fulfilledReports);

    if (simFloorResults.some((result) => result.status === 'rejected')) {
      nextMessages.push('Some Call Simulation reports could not be loaded for the selected scope.');
    }

    setMessages((current) =>
      dedupeMessages([
        ...current.filter((message) => !message.includes('Call Simulation') && !message.includes('coaching')),
        ...nextMessages,
      ]),
    );
  }, [scope, selectedBatchId, selectedTrainerId, trainerBatchIds]);

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
      // Admin uses 'trainer' or 'batch' scope, which now maps directly to backend
      params.append('scope', scope);
      
      if (scope === 'trainer' && selectedTrainerId) {
        // For trainer scope, pass the trainer_id to the backend
        params.append('trainer_id', selectedTrainerId);
      } else if (scope === 'batch' && selectedBatchId) {
        params.append('batch_id', selectedBatchId);
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
      const filename = scope === 'trainer'
        ? `Progress_Report_Trainer_${selectedTrainer?.full_name || selectedTrainerId}_${new Date().toISOString().split('T')[0]}.pdf`
        : `Progress_Report_Batch_${selectedBatch?.name || selectedBatchId}_${new Date().toISOString().split('T')[0]}.pdf`;
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

  const filteredMicrolearningAssignments = useMemo(() => {
    const rows = microlearningReport?.assignments || [];
    if (scope === 'trainer') {
      return rows.filter(
        (assignment) =>
          assignment.assigned_by === selectedTrainerId ||
          (assignment.batch_id ? trainerBatchIds.includes(assignment.batch_id) : false),
      );
    }
    return rows.filter((assignment) => assignment.batch_id === selectedBatchId);
  }, [microlearningReport, scope, selectedTrainerId, selectedBatchId, trainerBatchIds]);

  const microlearningSummary = useMemo(() => {
    const completed = filteredMicrolearningAssignments.filter((assignment) => ['completed', 'certified'].includes(assignment.status)).length;
    const certified = filteredMicrolearningAssignments.filter((assignment) => Boolean(assignment.certificate_id)).length;
    return {
      assignmentCount: filteredMicrolearningAssignments.length,
      completed,
      certified,
      averageScore: average(filteredMicrolearningAssignments.map((assignment) => Number(assignment.average_score || 0))),
      passRate: filteredMicrolearningAssignments.length ? (certified / filteredMicrolearningAssignments.length) * 100 : 0,
    };
  }, [filteredMicrolearningAssignments]);

  const filteredAssessmentAssignments = useMemo(() => {
    if (scope === 'trainer') {
      return assessmentAssignments.filter(
        (assignment) =>
          assignment.assigned_by === selectedTrainerId ||
          (assignment.assigned_batch_id ? trainerBatchIds.includes(assignment.assigned_batch_id) : false) ||
          assignment.trainees.some((trainee) => (trainee.batch_id ? trainerBatchIds.includes(trainee.batch_id) : false)),
      );
    }

    return assessmentAssignments.filter(
      (assignment) =>
        assignment.assigned_batch_id === selectedBatchId ||
        assignment.trainees.some((trainee) => trainee.batch_id === selectedBatchId),
    );
  }, [assessmentAssignments, scope, selectedTrainerId, selectedBatchId, trainerBatchIds]);

  const assessmentSummary = useMemo(() => {
    return {
      totalAssigned: filteredAssessmentAssignments.reduce((sum, assignment) => sum + assignment.total_trainees, 0),
      completed: filteredAssessmentAssignments.reduce((sum, assignment) => sum + assignment.completed_trainees, 0),
      passed: filteredAssessmentAssignments.reduce((sum, assignment) => sum + assignment.passed_trainees, 0),
      certificates: filteredAssessmentAssignments.reduce((sum, assignment) => sum + assignment.certificate_count, 0),
    };
  }, [filteredAssessmentAssignments]);

  const simFloorSummary = useMemo(() => {
    const totalSessions = simFloorReports.reduce((sum, report) => sum + report.summary.total_sessions, 0);
    const totalTrainees = simFloorReports.reduce((sum, report) => sum + report.summary.total_trainees, 0);
    const totalRetakes = simFloorReports.reduce((sum, report) => sum + report.summary.retakes, 0);
    const weightedAverageScore = totalSessions
      ? simFloorReports.reduce((sum, report) => sum + report.summary.average_score * report.summary.total_sessions, 0) / totalSessions
      : 0;
    const weightedPassRate = totalSessions
      ? simFloorReports.reduce((sum, report) => sum + report.summary.pass_rate * report.summary.total_sessions, 0) / totalSessions
      : 0;

    return {
      totalSessions,
      totalTrainees,
      retakes: totalRetakes,
      averageScore: weightedAverageScore,
      passRate: weightedPassRate,
    };
  }, [simFloorReports]);

  const coachingSummary = coachingHub?.summary;

  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="text-muted-foreground">
              Admin reports now stay focused on microlearning, Call Simulation, assessments, and coaching.
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
            <CardDescription>Review the same four report categories by trainer or by batch.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">View By</div>
              <Select value={scope} onValueChange={(value: ReportScope) => setScope(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trainer">Trainer</SelectItem>
                  <SelectItem value="batch">Batch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === 'trainer' ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Trainer</div>
                <Select value={selectedTrainerId} onValueChange={setSelectedTrainerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a trainer" />
                  </SelectTrigger>
                  <SelectContent>
                    {trainers.map((trainer) => (
                      <SelectItem key={trainer.id} value={trainer.id}>
                        {trainer.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
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
            )}

            <div className="rounded-2xl border bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Current Scope</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {scope === 'trainer' ? selectedTrainer?.full_name || 'Select a trainer' : selectedBatch?.name || 'Select a batch'}
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading admin reports...
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={<BookOpen className="size-5" />} label="Microlearning" value={`${microlearningSummary.completed}/${microlearningSummary.assignmentCount}`} helper={`${microlearningSummary.certified} certified | Avg ${formatPercent(microlearningSummary.averageScore)}`} />
              <SummaryCard icon={<Mic className="size-5" />} label="Call Simulation" value={String(simFloorSummary.totalSessions)} helper={`Avg ${formatPercent(simFloorSummary.averageScore)} | Pass ${formatPercent(simFloorSummary.passRate)}`} />
              <SummaryCard icon={<ClipboardList className="size-5" />} label="Assessments" value={`${assessmentSummary.completed}/${assessmentSummary.totalAssigned}`} helper={`${assessmentSummary.passed} passed | ${assessmentSummary.certificates} certificates`} />
              <SummaryCard icon={<MessageSquare className="size-5" />} label="Coaching" value={String(coachingSummary?.completed_categories || 0)} helper={`${coachingSummary?.pending_acknowledgement || 0} pending ack | ${coachingSummary?.acknowledged || 0} acknowledged`} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Microlearning Completion and Analytics</CardTitle>
                  <CardDescription>Assignments, completion, and certification by the selected admin scope.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MiniMetric label="Assigned" value={String(microlearningSummary.assignmentCount)} />
                    <MiniMetric label="Completed" value={String(microlearningSummary.completed)} />
                    <MiniMetric label="Certified" value={String(microlearningSummary.certified)} />
                    <MiniMetric label="Pass Rate" value={formatPercent(microlearningSummary.passRate)} />
                  </div>

                  {filteredMicrolearningAssignments.slice(0, 5).map((assignment) => (
                    <div key={assignment.id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{assignment.title || 'Module'}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {assignment.trainee_name || assignment.batch_name || assignment.assigned_by_name || 'Database assignment'}
                          </div>
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
                  <CardDescription>Batch-level Call Simulation reporting from the selected admin scope.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MiniMetric label="Batches" value={String(simFloorReports.length)} />
                    <MiniMetric label="Trainees" value={String(simFloorSummary.totalTrainees)} />
                    <MiniMetric label="Sessions" value={String(simFloorSummary.totalSessions)} />
                    <MiniMetric label="Retakes" value={String(simFloorSummary.retakes)} />
                  </div>

                  {simFloorReports.slice(0, 5).map((report) => (
                    <div key={report.batch_id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{report.batch_name}</div>
                          <div className="mt-1 text-xs text-slate-500">{report.summary.total_trainees} trainees</div>
                        </div>
                        <Badge variant="outline">{formatPercent(report.summary.average_score)}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {report.summary.total_sessions} sessions | Pass rate {formatPercent(report.summary.pass_rate)}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Assessment Completion and Analytics</CardTitle>
                  <CardDescription>Completion, pass, and certificate performance for assigned assessments.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MiniMetric label="Assigned" value={String(assessmentSummary.totalAssigned)} />
                    <MiniMetric label="Completed" value={String(assessmentSummary.completed)} />
                    <MiniMetric label="Passed" value={String(assessmentSummary.passed)} />
                    <MiniMetric label="Certificates" value={String(assessmentSummary.certificates)} />
                  </div>

                  {filteredAssessmentAssignments.slice(0, 5).map((assignment) => (
                    <div key={assignment.id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{assignment.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{assignment.category_name || 'Assessment category'}</div>
                        </div>
                        <Badge variant="outline">{formatPercent(assignment.completion_rate)}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {assignment.completed_trainees}/{assignment.total_trainees} completed | {assignment.passed_trainees} passed
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>My Coaching Completion and Analytics</CardTitle>
                  <CardDescription>Coaching readiness, acknowledgement, and competency outcomes for the selected scope.</CardDescription>
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
