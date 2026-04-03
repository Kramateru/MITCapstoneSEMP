'use client';

import { useAuth } from '@/app/context/AuthContext';
import { getBackendWebSocketUrl } from '@/app/utils/ws';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Gauge,
    Loader2,
    Mic,
    RefreshCw,
    Target,
    TrendingUp,
    Users,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';

type TrainerSummary = {
  active_batches: number;
  total_trainees: number;
  total_sessions: number;
  average_score: number;
  pass_rate: number;
  avg_response_duration: number;
  asr_confidence: number;
  verified_rate: number;
};

type WeeklyProgressPoint = {
  label: string;
  avg_score: number;
  attempts: number;
};

type CategoryScorePoint = {
  category: string;
  score: number;
  target: number;
};

type BatchComparisonPoint = {
  batch: string;
  score: number;
  sessions: number;
  trainees: number;
  pass_rate: number;
};

type ScenarioBreakdownPoint = {
  scenario: string;
  avg_score: number;
  sessions: number;
  pass_rate: number;
};

type TraineeInsight = {
  trainee_id: string;
  trainee_name: string;
  batch_name: string;
  avg_score: number;
  session_count: number;
  pass_rate: number;
  trend: 'improving' | 'stable' | 'declining';
};

type TrainerPerformanceHubResponse = {
  summary: TrainerSummary;
  weekly_progress: WeeklyProgressPoint[];
  category_scores: CategoryScorePoint[];
  batch_comparison: BatchComparisonPoint[];
  scenario_breakdown: ScenarioBreakdownPoint[];
  top_performers: TraineeInsight[];
  needs_attention: TraineeInsight[];
};

type CoachingHubSummary = {
  completed_categories: number;
  ready_for_coaching: number;
  pending_acknowledgement: number;
  acknowledged: number;
  competent: number;
  not_competent: number;
};

type CoachingHubResponse = {
  summary?: CoachingHubSummary;
};

type CoachingComplianceResponse = {
  total_logs: number;
  acknowledged_logs: number;
  pending_logs: number;
  draft_logs: number;
  competent_logs: number;
  not_competent_logs: number;
  acknowledgment_rate: number;
};

const EMPTY_COACHING_SUMMARY: CoachingHubSummary = {
  completed_categories: 0,
  ready_for_coaching: 0,
  pending_acknowledgement: 0,
  acknowledged: 0,
  competent: 0,
  not_competent: 0,
};

function formatScore(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatCount(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

function formatSeconds(value: number) {
  return `${value.toFixed(1)}s`;
}

async function readResponseDetail(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // Fall back to plain text when the response body is not JSON.
  }

  try {
    const text = (await response.text()).trim();
    if (text) {
      return text;
    }
  } catch {
    // Keep the provided fallback when parsing fails.
  }

  return fallback;
}

async function parseJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new Error(await readResponseDetail(response, fallback));
  }
  return response.json() as Promise<T>;
}

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Unable to load live trainer analytics right now.';
  }

  const message = error.message?.trim();
  if (!message) {
    return 'Unable to load live trainer analytics right now.';
  }

  try {
    const payload = JSON.parse(message);
    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // Keep the original error message when it is not JSON.
  }

  return message;
}

function trendBadgeClass(trend: TraineeInsight['trend']) {
  if (trend === 'improving') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (trend === 'declining') {
    return 'bg-rose-100 text-rose-700';
  }
  return 'bg-slate-100 text-slate-700';
}

function batchPriority(batch: BatchComparisonPoint) {
  const sessionsPerTrainee = batch.trainees ? batch.sessions / batch.trainees : 0;
  if (batch.sessions === 0 || batch.score < 70 || batch.pass_rate < 65) {
    return {
      label: 'High Priority',
      className: 'bg-rose-100 text-rose-700 border-rose-200',
      hint: 'Needs immediate trainer attention',
    };
  }
  if (batch.score < 80 || sessionsPerTrainee < 1 || batch.pass_rate < 80) {
    return {
      label: 'Watch List',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      hint: 'Monitor progress and session volume',
    };
  }
  return {
    label: 'Healthy',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    hint: 'Tracking within trainer targets',
  };
}

function averageSessionsPerUnit(totalSessions: number, totalUnits: number) {
  if (!totalUnits) {
    return 0;
  }
  return totalSessions / totalUnits;
}

export default function TrainerAnalytics() {
  const { token, isLoading: isAuthLoading, isAuthenticated, refreshToken, logout } = useAuth();
  const [data, setData] = useState<TrainerPerformanceHubResponse | null>(null);
  const [coachingSummary, setCoachingSummary] = useState<CoachingHubSummary>(EMPTY_COACHING_SUMMARY);
  const [coachingCompliance, setCoachingCompliance] = useState<CoachingComplianceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState('Live trainer analytics are connecting.');

  const fetchWithAuthRetry = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const sendRequest = async (authToken: string | null) => {
        const nextHeaders = new Headers(init?.headers || undefined);
        if (authToken || token) {
          nextHeaders.set('Authorization', `Bearer ${authToken || token}`);
        }
        return fetch(input, {
          ...init,
          headers: nextHeaders,
          cache: 'no-store',
        });
      };

      let response = await sendRequest(token);
      if (response.status !== 401) {
        return response;
      }

      const nextToken = await refreshToken();
      if (!nextToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      response = await sendRequest(nextToken);
      if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please sign in again.');
      }

      return response;
    },
    [logout, refreshToken, token],
  );

  const loadAnalytics = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (isAuthLoading) {
        return;
      }

      if (!isAuthenticated || !token) {
        setData(null);
        setCoachingSummary(EMPTY_COACHING_SUMMARY);
        setCoachingCompliance(null);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        setLiveStatus('Live trainer analytics are unavailable until you sign in.');
        return;
      }

      if (mode === 'initial') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const [performanceResponse, coachingHubResponse, coachingComplianceResponse] = await Promise.all([
          fetchWithAuthRetry('/api/analytics/trainer/performance-hub'),
          fetchWithAuthRetry('/api/certification/coaching/hub'),
          fetchWithAuthRetry('/api/certification/coaching/compliance'),
        ]);

        const [performancePayload, coachingHubPayload, coachingCompliancePayload] = await Promise.all([
          parseJsonResponse<TrainerPerformanceHubResponse>(
            performanceResponse,
            'Unable to load trainer performance analytics.',
          ),
          parseJsonResponse<CoachingHubResponse>(
            coachingHubResponse,
            'Unable to load coaching workflow analytics.',
          ),
          parseJsonResponse<CoachingComplianceResponse>(
            coachingComplianceResponse,
            'Unable to load coaching compliance analytics.',
          ),
        ]);

        setData(performancePayload);
        setCoachingSummary(coachingHubPayload.summary || EMPTY_COACHING_SUMMARY);
        setCoachingCompliance(coachingCompliancePayload);
        setLiveStatus('Live trainer analytics are synced with Supabase-backed trainee activity.');
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchWithAuthRetry, isAuthLoading, isAuthenticated, token],
  );

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    if (isAuthLoading) {
      return undefined;
    }

    if (!isAuthenticated || !token) {
      setLiveStatus('Live trainer analytics are unavailable until you sign in.');
      return undefined;
    }

    let isActive = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = (socketToken: string, allowRefresh = true) => {
      if (!isActive) {
        return;
      }

      clearReconnectTimer();

      socket = new WebSocket(
        getBackendWebSocketUrl(`/api/trainer/live-updates?token=${encodeURIComponent(socketToken)}`),
      );

      socket.onopen = () => {
        setLiveStatus('Live trainer analytics connected to Supabase activity data.');
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as {
            type?: string;
            session?: { user_name?: string; scenario_title?: string };
          };

          if (message.type === 'practice_session_completed') {
            setLiveStatus(
              `${message.session?.user_name || 'A trainee'} completed ${message.session?.scenario_title || 'a scenario'} just now.`,
            );
            void loadAnalytics('refresh');
            return;
          }

          if (message.type === 'connected') {
            setLiveStatus('Live trainer analytics connected to Supabase activity data.');
            return;
          }

          setLiveStatus('Live trainer analytics received an update.');
        } catch {
          setLiveStatus('Live trainer analytics received an update.');
        }
      };

      socket.onerror = () => {
        if (isActive) {
          setLiveStatus('Live trainer analytics lost connection. Reconnecting...');
        }
      };

      socket.onclose = (event) => {
        if (!isActive) {
          return;
        }

        if (event.code === 4401 && allowRefresh) {
          setLiveStatus('Refreshing trainer session for live analytics...');
          void refreshToken().then((nextToken) => {
            if (!isActive) {
              return;
            }

            if (!nextToken) {
              setLiveStatus('Live trainer analytics are unavailable until you sign in again.');
              return;
            }

            connect(nextToken, false);
          });
          return;
        }

        const reconnectToken = localStorage.getItem('token') || socketToken;
        setLiveStatus('Live trainer analytics disconnected. Reconnecting...');
        reconnectTimer = window.setTimeout(() => connect(reconnectToken, true), 3000);
      };
    };

    connect(token, true);

    return () => {
      isActive = false;
      clearReconnectTimer();
      socket?.close();
    };
  }, [isAuthLoading, isAuthenticated, loadAnalytics, refreshToken, token]);

  const summary = data?.summary;
  const hasActivity = (summary?.total_sessions || 0) > 0;
  const batchRows = data?.batch_comparison || [];
  const categoryRows = data?.category_scores || [];
  const scenarioRows = data?.scenario_breakdown || [];
  const bestBatch = useMemo(
    () => [...batchRows].sort((left, right) => right.score - left.score)[0] || null,
    [batchRows],
  );
  const priorityBatch = useMemo(
    () => [...batchRows].sort((left, right) => left.score - right.score || right.sessions - left.sessions)[0] || null,
    [batchRows],
  );
  const highestVolumeBatch = useMemo(
    () => [...batchRows].sort((left, right) => right.sessions - left.sessions)[0] || null,
    [batchRows],
  );
  const hardestScenario = useMemo(
    () => [...scenarioRows].sort((left, right) => left.avg_score - right.avg_score || right.sessions - left.sessions)[0] || null,
    [scenarioRows],
  );
  const sessionsPerTrainee = averageSessionsPerUnit(summary?.total_sessions || 0, summary?.total_trainees || 0);
  const sessionsPerBatch = averageSessionsPerUnit(summary?.total_sessions || 0, summary?.active_batches || 0);
  const highPriorityBatchCount = batchRows.filter((batch) => batchPriority(batch).label === 'High Priority').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Live Analytics Hub</h2>
          <p className="text-sm text-muted-foreground">
            Monitor Supabase-backed trainee sessions, coaching pipeline movement, and batch performance from one live workspace.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadAnalytics('refresh')}
            disabled={loading || refreshing}
            className="rounded-full"
          >
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh Live Analytics
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        {liveStatus}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Active Batches"
          value={summary?.active_batches ?? 0}
          hint="Managed by you"
          icon={<Users className="size-5 text-sky-600" />}
        />
        <SummaryCard
          label="Trainees"
          value={summary?.total_trainees ?? 0}
          hint="Inside your class roster"
          icon={<Users className="size-5 text-emerald-600" />}
        />
        <SummaryCard
          label="Practice Sessions"
          value={summary?.total_sessions ?? 0}
          hint="Saved in Supabase"
          icon={<Activity className="size-5 text-violet-600" />}
        />
        <SummaryCard
          label="Average Score"
          value={formatScore(summary?.average_score ?? 0)}
          hint="Across scored attempts"
          icon={<TrendingUp className="size-5 text-amber-600" />}
        />
        <SummaryCard
          label="Pass Rate"
          value={formatScore(summary?.pass_rate ?? 0)}
          hint="Sessions at 70% or higher"
          icon={<CheckCircle2 className="size-5 text-emerald-600" />}
        />
        <SummaryCard
          label="Sessions / Trainee"
          value={formatCount(sessionsPerTrainee)}
          hint={`Sessions / batch ${formatCount(sessionsPerBatch)}`}
          icon={<Clock3 className="size-5 text-rose-600" />}
        />
        <SummaryCard
          label="Avg Response Time"
          value={formatSeconds(summary?.avg_response_duration ?? 0)}
          hint="Average trainee response duration"
          icon={<Clock3 className="size-5 text-sky-600" />}
        />
        <SummaryCard
          label="ASR Confidence"
          value={formatScore(summary?.asr_confidence ?? 0)}
          hint="Speech recognition confidence"
          icon={<Mic className="size-5 text-cyan-600" />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Ready for Coaching"
          value={coachingSummary.ready_for_coaching}
          hint="Completed activity waiting for trainer action"
          icon={<Target className="size-5 text-amber-600" />}
        />
        <SummaryCard
          label="Pending Ack"
          value={coachingCompliance?.pending_logs ?? coachingSummary.pending_acknowledgement}
          hint="Sent logs still waiting for trainee acknowledgement"
          icon={<AlertTriangle className="size-5 text-rose-600" />}
        />
        <SummaryCard
          label="Draft Logs"
          value={coachingCompliance?.draft_logs ?? 0}
          hint="Coaching records not sent yet"
          icon={<Clock3 className="size-5 text-slate-600" />}
        />
        <SummaryCard
          label="Ack Rate"
          value={formatScore(coachingCompliance?.acknowledgment_rate ?? 0)}
          hint="Published log acknowledgement rate"
          icon={<CheckCircle2 className="size-5 text-sky-600" />}
        />
        <SummaryCard
          label="Verified Sessions"
          value={formatScore(summary?.verified_rate ?? 0)}
          hint="Trainer-verified practice records"
          icon={<Gauge className="size-5 text-fuchsia-600" />}
        />
      </div>

      {!loading && !hasActivity && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No trainee activity yet</CardTitle>
            <CardDescription>
              Live analytics populate when trainees in your assigned batches save practice sessions, coaching records, or assessment activity in Supabase.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Progress</CardTitle>
            <CardDescription>Average score and attempt volume from your live trainee session stream.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data?.weekly_progress || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis yAxisId="left" domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="avg_score"
                  stroke="#2563eb"
                  strokeWidth={3}
                  name="Average Score"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="attempts"
                  stroke="#0f766e"
                  strokeWidth={2}
                  name="Attempts"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Batch Comparison</CardTitle>
            <CardDescription>Average score and session volume by active trainer batch.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={batchRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="batch" interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis yAxisId="left" domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="score" fill="#2563eb" name="Average Score" radius={[8, 8, 0, 0]} />
                <Bar yAxisId="right" dataKey="sessions" fill="#f59e0b" name="Sessions" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Category Performance</CardTitle>
            <CardDescription>Skill-area averages from the live practice data stored in Supabase.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={categoryRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" interval={0} angle={-12} textAnchor="end" height={70} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="score" fill="#0f766e" name="Current Score" radius={[8, 8, 0, 0]} />
                <Bar dataKey="target" fill="#cbd5e1" name="Target Score" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scenario Activity</CardTitle>
            <CardDescription>Which scenarios are generating the most trainee volume and where scores are slipping.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={scenarioRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="scenario" interval={0} angle={-15} textAnchor="end" height={80} />
                <YAxis yAxisId="left" domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="avg_score" fill="#7c3aed" name="Average Score" radius={[8, 8, 0, 0]} />
                <Bar yAxisId="right" dataKey="sessions" fill="#0ea5e9" name="Sessions" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle>Batch Health Board</CardTitle>
            <CardDescription>Use this board to spot under-served batches before they turn into coaching backlog.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {batchRows.map((batch) => {
              const priority = batchPriority(batch);
              const sessionsPerBatchTrainee = averageSessionsPerUnit(batch.sessions, batch.trainees);

              return (
                <div key={batch.batch} className="rounded-2xl border p-4">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-semibold text-foreground">{batch.batch}</div>
                      <div className="text-xs text-muted-foreground">
                        {batch.trainees} trainees | {batch.sessions} sessions | {formatCount(sessionsPerBatchTrainee)} sessions per trainee
                      </div>
                    </div>
                    <Badge className={priority.className}>{priority.label}</Badge>
                  </div>

                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Average score</span>
                    <span className="font-medium text-foreground">{formatScore(batch.score)}</span>
                  </div>
                  <Progress value={Math.max(0, Math.min(100, batch.score))} />

                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Pass rate {formatScore(batch.pass_rate)}</span>
                    <span>{batch.sessions} sessions saved</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{priority.hint}</div>
                </div>
              );
            })}

            {!loading && !batchRows.length && (
              <div className="text-sm text-muted-foreground">
                Batch health will appear here once your class groups have saved activity.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trainer Action Board</CardTitle>
            <CardDescription>Quick signals for where your attention is needed next.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InsightTile
              label="Best Performing Batch"
              value={bestBatch ? `${bestBatch.batch} | ${formatScore(bestBatch.score)}` : 'No batch data yet'}
            />
            <InsightTile
              label="Highest Session Volume"
              value={highestVolumeBatch ? `${highestVolumeBatch.batch} | ${highestVolumeBatch.sessions} sessions` : 'No session volume yet'}
            />
            <InsightTile
              label="Priority Batch"
              value={priorityBatch ? `${priorityBatch.batch} | ${batchPriority(priorityBatch).label}` : 'No priority batch yet'}
            />
            <InsightTile
              label="Hardest Scenario"
              value={hardestScenario ? `${hardestScenario.scenario} | ${formatScore(hardestScenario.avg_score)}` : 'No scenario pattern yet'}
            />
            <InsightTile
              label="High Priority Batches"
              value={`${highPriorityBatchCount} batch${highPriorityBatchCount === 1 ? '' : 'es'} currently need intervention`}
            />
            <InsightTile
              label="Coaching Completion"
              value={`${coachingSummary.competent} competent | ${coachingSummary.not_competent} retake required`}
            />
            <InsightTile
              label="Published Coaching Logs"
              value={`${coachingCompliance?.total_logs ?? 0} total | ${coachingCompliance?.acknowledged_logs ?? 0} acknowledged`}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Performers</CardTitle>
            <CardDescription>Highest average performers from your current trainee roster.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(data?.top_performers || []).map((trainee) => (
              <div key={trainee.trainee_id} className="rounded-2xl border p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-semibold text-foreground">{trainee.trainee_name}</div>
                    <div className="text-xs text-muted-foreground">{trainee.batch_name}</div>
                  </div>
                  <Badge className={trendBadgeClass(trainee.trend)}>{trainee.trend}</Badge>
                </div>

                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Average score</span>
                  <span className="font-medium text-foreground">{formatScore(trainee.avg_score)}</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, trainee.avg_score))} />

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{trainee.session_count} sessions</span>
                  <span>Pass rate {formatScore(trainee.pass_rate)}</span>
                </div>
              </div>
            ))}

            {!loading && !(data?.top_performers || []).length && (
              <div className="text-sm text-muted-foreground">No top performers yet because no scored sessions were found.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
            <CardDescription>Trainees who currently need the most coaching support.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(data?.needs_attention || []).map((trainee) => (
              <div key={trainee.trainee_id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-semibold text-foreground">{trainee.trainee_name}</div>
                    <div className="text-xs text-muted-foreground">{trainee.batch_name}</div>
                  </div>
                  <Badge className={trendBadgeClass(trainee.trend)}>{trainee.trend}</Badge>
                </div>

                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Average score</span>
                  <span className="font-medium text-foreground">{formatScore(trainee.avg_score)}</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, trainee.avg_score))} className="bg-amber-200/70" />

                <div className="mt-3 text-xs text-muted-foreground">
                  {trainee.session_count} sessions logged | pass rate {formatScore(trainee.pass_rate)}
                </div>
              </div>
            ))}

            {!loading && !(data?.needs_attention || []).length && (
              <div className="text-sm text-muted-foreground">Coaching alerts will appear here once trainee data is available.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-3xl font-semibold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
          <div className="rounded-full bg-muted p-3">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
