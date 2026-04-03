'use client';

import { type ReactNode, useEffect, useState } from 'react';
import {
  Activity,
  Award,
  Gauge,
  GraduationCap,
  Loader2,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { apiFetch } from '@/app/utils/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

type AdminSummary = {
  total_trainees: number;
  total_trainers: number;
  average_performance: number;
  certifications_issued: number;
  total_sessions: number;
  total_scenarios: number;
  avg_session_duration: number;
  asr_confidence: number;
  completion_rate: number;
  pass_rate: number;
  avg_retries: number;
  target_score: number;
};

type PerformanceTrendPoint = {
  label: string;
  avg_score: number;
  attempts: number;
};

type CategoryScorePoint = {
  name: string;
  value: number;
};

type LobBreakdownPoint = {
  name: string;
  agents: number;
  avgScore: number;
  sessions: number;
};

type LeaderboardRow = {
  trainee_id: string;
  trainee_name: string;
  lob: string;
  average_score: number;
  session_count: number;
  latest_session_at: string | null;
};

type AdminPerformanceHubResponse = {
  summary: AdminSummary;
  performance_trend: PerformanceTrendPoint[];
  category_scores: CategoryScorePoint[];
  lob_breakdown: LobBreakdownPoint[];
  leaderboard: LeaderboardRow[];
};

function formatScore(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDuration(seconds: number) {
  if (!seconds) {
    return '0.0 min';
  }
  return `${(seconds / 60).toFixed(1)} min`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'No activity yet';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'No activity yet'
    : new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to load performance hub analytics right now.';
}

function getPerformanceClass(score: number, target: number) {
  if (score >= target) {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (score >= Math.max(0, target - 5)) {
    return 'bg-amber-100 text-amber-700';
  }
  return 'bg-rose-100 text-rose-700';
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AdminPerformanceHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const payload = await apiFetch<AdminPerformanceHubResponse>('/api/analytics/admin/performance-hub');
      setData(payload);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAnalytics();
  }, []);

  const summary = data?.summary;
  const targetScore = summary?.target_score ?? 75;
  const hasActivity = (summary?.total_sessions || 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Performance Hub</h2>
          <p className="text-sm text-muted-foreground">
            Platform analytics below come only from trainees, trainers, sessions, and certificates saved in the
            database.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void loadAnalytics('refresh')}
          disabled={loading || refreshing}
          className="rounded-full"
        >
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh Analytics
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          label="Trainees"
          value={summary?.total_trainees ?? 0}
          hint="Active learner accounts"
          icon={<Users className="size-5 text-sky-600" />}
        />
        <SummaryCard
          label="Trainers"
          value={summary?.total_trainers ?? 0}
          hint="Coaching accounts"
          icon={<Users className="size-5 text-emerald-600" />}
        />
        <SummaryCard
          label="Average Performance"
          value={formatScore(summary?.average_performance ?? 0)}
          hint={`Target ${formatScore(targetScore)}`}
          icon={<Target className="size-5 text-violet-600" />}
        />
        <SummaryCard
          label="Pass Rate"
          value={formatScore(summary?.pass_rate ?? 0)}
          hint="Sessions scoring 70%+"
          icon={<Gauge className="size-5 text-amber-600" />}
        />
        <SummaryCard
          label="Certificates"
          value={summary?.certifications_issued ?? 0}
          hint="Issued from stored verdicts"
          icon={<Award className="size-5 text-orange-600" />}
        />
        <SummaryCard
          label="Practice Sessions"
          value={summary?.total_sessions ?? 0}
          hint="Used in all charts below"
          icon={<Activity className="size-5 text-rose-600" />}
        />
      </div>

      {!loading && !hasActivity && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No performance data yet</CardTitle>
            <CardDescription>
              Analytics will populate once trainee activity is saved in the database.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance Trend</CardTitle>
            <CardDescription>Weekly score movement and attempt volume from actual trainee sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={data?.performance_trend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis yAxisId="left" domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="right" dataKey="attempts" fill="#0f766e" name="Attempts" radius={[8, 8, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="avg_score" stroke="#2563eb" strokeWidth={3} name="Average Score" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assessment Categories</CardTitle>
            <CardDescription>Average skill scores based on stored trainee evaluation metrics.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data?.category_scores || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-12} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#2563eb" name="Average Score" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LOB Breakdown</CardTitle>
          <CardDescription>Active trainees, score averages, and session counts by line of business.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={data?.lob_breakdown || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" interval={0} angle={-10} textAnchor="end" height={60} />
              <YAxis yAxisId="left" allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="agents" fill="#0f766e" name="Trainees" radius={[8, 8, 0, 0]} />
              <Bar yAxisId="left" dataKey="sessions" fill="#f59e0b" name="Sessions" radius={[8, 8, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="avgScore" stroke="#7c3aed" strokeWidth={3} name="Avg Score" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.35fr,0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>Top trainees ranked by average score from their saved sessions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(data?.leaderboard || []).map((trainee, index) => (
              <div key={trainee.trainee_id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">#{index + 1}</Badge>
                      <span className="font-semibold text-foreground">{trainee.trainee_name}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{trainee.lob}</div>
                  </div>

                  <Badge className={getPerformanceClass(trainee.average_score, targetScore)}>
                    {formatScore(trainee.average_score)}
                  </Badge>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                  <div>{trainee.session_count} sessions recorded</div>
                  <div>Last activity {formatDateTime(trainee.latest_session_at)}</div>
                </div>
              </div>
            ))}

            {!loading && !(data?.leaderboard || []).length && (
              <div className="text-sm text-muted-foreground">Top trainee rankings will appear once sessions are available.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Statistics</CardTitle>
            <CardDescription>Platform-wide operational metrics taken from the active database.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <MetricCard
              label="Total Scenarios"
              value={summary?.total_scenarios ?? 0}
              hint="Published and draft records"
              icon={<GraduationCap className="size-5 text-sky-600" />}
            />
            <MetricCard
              label="Average Session Duration"
              value={formatDuration(summary?.avg_session_duration ?? 0)}
              hint="Average recorded response time"
              icon={<Activity className="size-5 text-emerald-600" />}
            />
            <MetricCard
              label="ASR Confidence"
              value={formatScore(summary?.asr_confidence ?? 0)}
              hint="Speech-to-text confidence average"
              icon={<Gauge className="size-5 text-violet-600" />}
            />
            <MetricCard
              label="Completion Rate"
              value={formatScore(summary?.completion_rate ?? 0)}
              hint="Trainees with at least one session"
              icon={<Users className="size-5 text-amber-600" />}
            />
            <MetricCard
              label="Average Retries"
              value={(summary?.avg_retries ?? 0).toFixed(2)}
              hint="Average attempt number recorded"
              icon={<RefreshCw className="size-5 text-rose-600" />}
            />
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
            <div className="text-2xl font-semibold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
          <div className="rounded-full bg-muted p-3">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({
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
    <div className="rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div className="rounded-full bg-muted p-2">{icon}</div>
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
