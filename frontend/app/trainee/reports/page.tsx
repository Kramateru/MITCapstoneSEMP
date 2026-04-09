'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import CertificatePreview, {
  type CertificatePreviewData,
  type CertificateSettingsView,
} from '@/app/components/shared/certificate-preview';
import { useAuth } from '@/app/context/AuthContext';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Progress } from '@/app/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { traineeSidebarItems } from '@/app/trainee/nav';
import { openSimFloorRealtimeStream } from '@/app/lib/assessment/sim-floor-client';
import { Award, BarChart3, Loader2, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type CertificatesResponse = {
  count: number;
  settings: CertificateSettingsView;
  certificates: CertificatePreviewData[];
};

type SimFloorTraineeReportResponse = {
  trainee_id: string;
  trainee_name: string;
  period: string;
  summary: {
    total_sessions: number;
    average_score: number;
    pass_rate: number;
    retakes: number;
    latest_score: number;
    passing_score: number;
    assigned_batches: Array<{
      batch_id: string;
      batch_name: string;
      wave_number?: number;
    }>;
  };
  coaching_summary: {
    total_logs: number;
    pending_acknowledgement: number;
    acknowledged: number;
    draft_logs: number;
    competent: number;
    not_competent: number;
  };
  kpi_scores: Record<string, number>;
  top_failed_kpis: Record<string, number>;
  scenario_performance: Array<{
    scenario_id: string;
    title: string;
    attempts: number;
    average_score: number;
    best_score: number;
    pass_rate: number;
    latest_attempt_at?: string | null;
  }>;
  recent_sessions: Array<{
    session_id: string;
    scenario_title: string;
    score: number;
    status: string;
    attempt_number: number;
    created_at?: string | null;
    audio_url?: string | null;
    trainer_verdict_status?: string;
    certificate_id?: string | null;
    coaching_id?: string | null;
    coaching_status?: string | null;
    coaching_acknowledged_at?: string | null;
  }>;
  coaching_logs: Array<{
    id: string;
    coaching_id: string;
    sim_session_id?: string | null;
    status: string;
    competency_status: string;
    trainer_remarks?: string | null;
    acknowledged_at?: string | null;
    created_at?: string | null;
  }>;
  certificates: Array<{
    certificate_id: string;
    certificate_no: string;
    scenario_session_id: string;
    issued_at?: string | null;
  }>;
};

type MicrolearningReportResponse = {
  summary: {
    assignment_count: number;
    in_progress_count: number;
    completed_count: number;
    certified_count: number;
    average_score: number;
    pass_rate: number;
    total_duration_minutes: number;
  };
  topic_progress: Array<{
    topic_category_id: string | null;
    topic_category_name: string;
    assignment_count: number;
    completed_count: number;
    certified_count: number;
    average_score: number;
  }>;
  recent_certificates: Array<{
    certificate_id: string;
    certificate_no: string;
    achievement_title: string;
    issued_at?: string | null;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    module_type?: string | null;
    topic_category_name?: string | null;
    status: string;
    average_score: number;
    passing_score: number;
    completion_percentage: number;
    certificate_id?: string | null;
    due_date?: string | null;
  }>;
};

function formatScore(value?: number | null, suffix = '%') {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return `0${suffix}`;
  }
  return `${value.toFixed(1)}${suffix}`;
}

function verdictBadgeVariant(status?: string) {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'competent') return 'default' as const;
  if (normalized === 'retake') return 'destructive' as const;
  return 'secondary' as const;
}

function verdictLabel(status?: string) {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'competent') return 'Competent';
  if (normalized === 'retake') return 'Retake';
  return 'Pending';
}

function TraineeReportsContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<CertificateSettingsView | null>(null);
  const [certificates, setCertificates] = useState<CertificatePreviewData[]>([]);
  const [simFloorReport, setSimFloorReport] = useState<SimFloorTraineeReportResponse | null>(null);
  const [microlearningReport, setMicrolearningReport] = useState<MicrolearningReportResponse | null>(null);
  const [selectedCertificateId, setSelectedCertificateId] = useState<string>('');
  const [error, setError] = useState('');
  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'results' | 'microlearning' | 'certificates'>(
    requestedTab === 'certificates' || requestedTab === 'microlearning' ? requestedTab : 'results',
  );

  const loadData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError('');

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const requests: Array<Promise<Response>> = [
        fetch('/api/certification/certificates', { headers }),
        fetch('/api/trainee/microlearning-report', { headers }),
      ];
      if (user?.user_id) {
        requests.push(fetch(`/api/sim-floor/reports/trainee/${user.user_id}`, { headers }));
      }
      const [certificateResponse, microlearningResponse, simFloorResponse] = await Promise.all(requests);

      const payload: CertificatesResponse = await certificateResponse.json();
      if (!certificateResponse.ok) {
        throw new Error((payload as unknown as { detail?: string }).detail || 'Unable to load certificates.');
      }

      if (simFloorResponse) {
        const simFloorPayload = (await simFloorResponse.json().catch(() => null)) as
          | SimFloorTraineeReportResponse
          | { detail?: string }
          | null;
        if (!simFloorResponse.ok) {
          throw new Error(simFloorPayload && 'detail' in simFloorPayload ? simFloorPayload.detail || 'Unable to load Sim Floor results.' : 'Unable to load Sim Floor results.');
        }
        setSimFloorReport(simFloorPayload as SimFloorTraineeReportResponse);
      } else {
        setSimFloorReport(null);
      }

      const microlearningPayload = (await microlearningResponse.json().catch(() => null)) as
        | MicrolearningReportResponse
        | { detail?: string }
        | null;
      if (!microlearningResponse.ok) {
        throw new Error(
          microlearningPayload && 'detail' in microlearningPayload
            ? microlearningPayload.detail || 'Unable to load microlearning report.'
            : 'Unable to load microlearning report.',
        );
      }

      setSettings(payload.settings);
      setCertificates(payload.certificates || []);
      setMicrolearningReport(microlearningPayload as MicrolearningReportResponse);
      setSelectedCertificateId((current) =>
        current && payload.certificates.some((certificate) => certificate.id === current)
          ? current
          : payload.certificates[0]?.id || '',
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load certificates.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.user_id]);

  useEffect(() => {
    if (authLoading) return;
    void loadData();
  }, [authLoading, loadData]);

  useEffect(() => {
    if (authLoading || !user?.user_id) {
      return;
    }

    let stream: EventSource | null = null;
    try {
      stream = openSimFloorRealtimeStream();
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (
            payload.type === 'session_changed' ||
            payload.type === 'certificate_changed' ||
            payload.type === 'coaching_changed'
          ) {
            void loadData('refresh');
          }
        } catch {
          // Ignore malformed stream payloads and keep the page usable.
        }
      };
    } catch {
      // Realtime is optional. The manual refresh button still works.
    }

    return () => {
      stream?.close();
    };
  }, [authLoading, loadData, user?.user_id]);

  useEffect(() => {
    if (requestedTab === 'certificates' || requestedTab === 'microlearning') {
      setActiveTab(requestedTab);
      return;
    }
    setActiveTab('results');
  }, [requestedTab]);

  const selectedCertificate = useMemo(
    () => certificates.find((certificate) => certificate.id === selectedCertificateId) || certificates[0] || null,
    [certificates, selectedCertificateId],
  );

  const kpiRows = useMemo(
    () =>
      simFloorReport
        ? [
            ['Speech Accuracy', simFloorReport.kpi_scores.speech_to_text_accuracy || 0],
            ['Grammar', simFloorReport.kpi_scores.grammar || 0],
            ['Pronunciation', simFloorReport.kpi_scores.pronunciation || 0],
            ['Pacing', simFloorReport.kpi_scores.pacing || 0],
            ['Rate of Speech', simFloorReport.kpi_scores.rate_of_speech || 0],
            ['Dead Air', simFloorReport.kpi_scores.dead_air || 0],
          ]
        : [],
    [simFloorReport],
  );

  const handleTabChange = (value: string) => {
    const nextTab = value as 'results' | 'microlearning' | 'certificates';
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === 'results') {
      params.delete('tab');
    } else {
      params.set('tab', nextTab);
    }
    const query = params.toString();
    router.replace(query ? `/trainee/reports?${query}` : '/trainee/reports');
  };

  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Certificates and Results</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Review your Sim Floor performance results, competency decisions, recording history, and issued
              certificates in one place.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadData('refresh')} disabled={loading || refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {loading ? (
          <Card>
            <CardContent className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading certificates and Sim Floor results...
            </CardContent>
          </Card>
        ) : null}

        {!loading ? (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <TabsList>
              <TabsTrigger value="results">
                <BarChart3 className="size-4" />
                Sim Floor Results
              </TabsTrigger>
              <TabsTrigger value="microlearning">
                <BarChart3 className="size-4" />
                Microlearning
              </TabsTrigger>
              <TabsTrigger value="certificates">
                <Award className="size-4" />
                Certificates
              </TabsTrigger>
            </TabsList>

            <TabsContent value="results" className="space-y-6">
              {simFloorReport ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{simFloorReport.summary.total_sessions}</div>
                        <p className="text-xs text-muted-foreground">{simFloorReport.period}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Average Score</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{formatScore(simFloorReport.summary.average_score)}</div>
                        <p className="text-xs text-muted-foreground">Passing score {formatScore(simFloorReport.summary.passing_score)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pass Rate</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{formatScore(simFloorReport.summary.pass_rate)}</div>
                        <p className="text-xs text-muted-foreground">Trainer-validated progress</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Retakes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 text-3xl font-bold">
                          <RotateCcw className="size-5 text-amber-600" />
                          {simFloorReport.summary.retakes}
                        </div>
                        <p className="text-xs text-muted-foreground">Attempts beyond the first take</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Competency Certificates</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 text-3xl font-bold">
                          <ShieldCheck className="size-5 text-emerald-600" />
                          {simFloorReport.certificates.length}
                        </div>
                        <p className="text-xs text-muted-foreground">Issued from Sim Floor competency</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Coaching Ack</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 text-3xl font-bold">
                          <RefreshCw className="size-5 text-amber-600" />
                          {simFloorReport.coaching_summary.pending_acknowledgement}
                        </div>
                        <p className="text-xs text-muted-foreground">Trainer coaching waiting for acknowledgement</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
                    <Card>
                      <CardHeader>
                        <CardTitle>KPI Performance</CardTitle>
                        <CardDescription>Your latest average KPI trend across recorded Sim Floor attempts.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {kpiRows.map(([label, value]) => (
                          <div key={label} className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span>{label}</span>
                              <span>{Number(value).toFixed(1)}</span>
                            </div>
                            <Progress value={Math.max(0, Math.min(Number(value), 100))} />
                          </div>
                        ))}
                        <div className="rounded-xl border bg-slate-50 p-4">
                          <div className="text-sm font-medium text-slate-900">Top Failed KPIs</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(simFloorReport.top_failed_kpis).length ? (
                              Object.entries(simFloorReport.top_failed_kpis).map(([metric, count]) => (
                                <Badge key={metric} variant="outline">
                                  {metric.replace(/_/g, ' ')}: {count}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">No repeated KPI misses recorded.</span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Scenario Performance</CardTitle>
                        <CardDescription>Attempts, best score, and pass rate for each Sim Floor scenario you took.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {simFloorReport.scenario_performance.length ? (
                          simFloorReport.scenario_performance.map((scenario) => (
                            <div key={scenario.scenario_id} className="rounded-2xl border p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-slate-900">{scenario.title}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    Attempts {scenario.attempts} | Best {formatScore(scenario.best_score)} | Pass rate {formatScore(scenario.pass_rate)}
                                  </div>
                                </div>
                                <Badge variant="secondary">{formatScore(scenario.average_score)}</Badge>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                            No completed Sim Floor scenarios yet.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Coaching Status</CardTitle>
                      <CardDescription>Acknowledgement and competency outcomes tied to your mock calls.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border p-4">
                        <div className="text-sm font-medium text-slate-700">Coaching Logs</div>
                        <div className="mt-2 text-2xl font-bold text-slate-900">{simFloorReport.coaching_summary.total_logs}</div>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="text-sm font-medium text-slate-700">Pending Ack</div>
                        <div className="mt-2 text-2xl font-bold text-amber-700">{simFloorReport.coaching_summary.pending_acknowledgement}</div>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="text-sm font-medium text-slate-700">Acknowledged</div>
                        <div className="mt-2 text-2xl font-bold text-emerald-700">{simFloorReport.coaching_summary.acknowledged}</div>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="text-sm font-medium text-slate-700">Retake Coaching</div>
                        <div className="mt-2 text-2xl font-bold text-rose-700">{simFloorReport.coaching_summary.not_competent}</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Mock Calls</CardTitle>
                      <CardDescription>Latest attempts with verdict status, score, and recording playback.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {simFloorReport.recent_sessions.length ? (
                        simFloorReport.recent_sessions.map((session) => (
                          <div key={session.session_id} className="rounded-2xl border p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <div className="font-semibold text-slate-900">{session.scenario_title}</div>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  <Badge variant="outline">Attempt {session.attempt_number}</Badge>
                                  <Badge variant={verdictBadgeVariant(session.trainer_verdict_status)}>
                                    {verdictLabel(session.trainer_verdict_status)}
                                  </Badge>
                                  {session.coaching_status ? (
                                    <Badge variant={session.coaching_status === 'acknowledged' ? 'default' : session.coaching_status === 'sent' ? 'secondary' : 'outline'}>
                                      {session.coaching_status === 'sent'
                                        ? 'Coaching Sent'
                                        : session.coaching_status === 'acknowledged'
                                          ? 'Coaching Acknowledged'
                                          : 'Coaching Draft'}
                                    </Badge>
                                  ) : null}
                                  {session.certificate_id ? <Badge>Certificate Issued</Badge> : null}
                                </div>
                                <div className="mt-2 text-xs text-slate-500">
                                  {session.created_at ? new Date(session.created_at).toLocaleString() : 'No timestamp'} | Score {formatScore(session.score)}
                                </div>
                                {session.coaching_acknowledged_at ? (
                                  <div className="mt-1 text-xs text-emerald-700">
                                    Coaching acknowledged {new Date(session.coaching_acknowledged_at).toLocaleString()}
                                  </div>
                                ) : null}
                              </div>
                              <div className="text-lg font-bold text-slate-900">{formatScore(session.score)}</div>
                            </div>
                            {session.audio_url ? (
                              <audio controls className="mt-4 w-full" src={session.audio_url}>
                                Your browser does not support audio playback.
                              </audio>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                          No recent mock calls saved yet.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle>No Sim Floor results yet</CardTitle>
                    <CardDescription>
                      Start a mock call from Sim Floor and your scored attempts, retakes, and competency status will appear here.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="microlearning" className="space-y-6">
              {microlearningReport ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Assigned</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{microlearningReport.summary.assignment_count}</div>
                        <p className="text-xs text-muted-foreground">Total microlearning tasks</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{microlearningReport.summary.in_progress_count}</div>
                        <p className="text-xs text-muted-foreground">Modules currently underway</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{microlearningReport.summary.completed_count}</div>
                        <p className="text-xs text-muted-foreground">Finished modules</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Certified</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{microlearningReport.summary.certified_count}</div>
                        <p className="text-xs text-muted-foreground">Certificates earned</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Average Score</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{formatScore(microlearningReport.summary.average_score)}</div>
                        <p className="text-xs text-muted-foreground">Pass rate {formatScore(microlearningReport.summary.pass_rate)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
                    <Card>
                      <CardHeader>
                        <CardTitle>Topic Progress</CardTitle>
                        <CardDescription>Completion and scores by microlearning topic category.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {microlearningReport.topic_progress.length ? (
                          microlearningReport.topic_progress.map((topic) => (
                            <div key={topic.topic_category_id || topic.topic_category_name} className="rounded-2xl border p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-slate-900">{topic.topic_category_name}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {topic.completed_count}/{topic.assignment_count} completed | {topic.certified_count} certified
                                  </div>
                                </div>
                                <div className="text-sm font-semibold text-slate-900">{formatScore(topic.average_score)}</div>
                              </div>
                              <div className="mt-3">
                                <Progress value={topic.assignment_count ? (topic.certified_count / topic.assignment_count) * 100 : 0} />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                            No microlearning activity yet.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Module Accomplishment</CardTitle>
                        <CardDescription>Every assigned module, its status, current score, and certificate result.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {microlearningReport.assignments.length ? (
                          microlearningReport.assignments.map((assignment) => (
                            <div key={assignment.id} className="rounded-2xl border p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-slate-900">{assignment.title}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {(assignment.topic_category_name || 'Uncategorized')} | {(assignment.module_type || 'module').replace(/_/g, ' ')}
                                  </div>
                                </div>
                                <Badge variant={assignment.certificate_id ? 'default' : 'secondary'}>
                                  {assignment.status.replace(/_/g, ' ')}
                                </Badge>
                              </div>
                              <div className="mt-3 text-sm text-slate-600">
                                Score {formatScore(assignment.average_score)} / Pass {formatScore(assignment.passing_score)}
                              </div>
                              <div className="mt-2">
                                <Progress value={assignment.completion_percentage || 0} />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                            No assigned microlearning modules yet.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : (
                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle>No microlearning report yet</CardTitle>
                    <CardDescription>
                      Once your trainer assigns microlearning modules, your completion and analytics will appear here.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="certificates">
              {!certificates.length ? (
                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle>No certificates yet</CardTitle>
                    <CardDescription>
                      Complete an assigned scenario, pass a microlearning module, or receive a competent verdict in Sim Floor and your certificate will appear here automatically.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : settings ? (
                <div className="grid gap-6 xl:grid-cols-[0.86fr,1.14fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle>Issued Certificates</CardTitle>
                      <CardDescription>Select a certificate to preview and download.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {certificates.map((certificate) => {
                        const isSelected = certificate.id === selectedCertificate?.id;
                        return (
                          <button
                            key={certificate.id}
                            type="button"
                            onClick={() => setSelectedCertificateId(certificate.id || '')}
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                              isSelected
                                ? 'border-sky-400 bg-sky-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="mb-2 flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-900">{certificate.achievement_title}</div>
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                  {certificate.achievement_type.replace(/_/g, ' ')}
                                </div>
                              </div>
                              <Award className={`size-5 ${isSelected ? 'text-sky-700' : 'text-amber-600'}`} />
                            </div>
                            <div className="text-sm text-slate-600">{certificate.certificate_no}</div>
                            <div className="text-xs text-slate-500">
                              {new Intl.DateTimeFormat('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              }).format(new Date(certificate.issued_at))}
                            </div>
                          </button>
                        );
                      })}
                    </CardContent>
                  </Card>

                  {selectedCertificate ? <CertificatePreview certificate={selectedCertificate} settings={settings} /> : null}
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

export default function TraineeReportsPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
          <Card>
            <CardContent className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading certificates and reports...
            </CardContent>
          </Card>
        </DashboardLayout>
      }
    >
      <TraineeReportsContent />
    </Suspense>
  );
}
