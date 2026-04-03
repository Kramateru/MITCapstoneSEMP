'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { apiFetch } from '@/app/utils/api';
import type { AppUser } from '@/app/types/user';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Award, Download, Loader2, Target, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface ProgressTrackingProps {
  user: AppUser;
}

type TraineeSummary = {
  current_avg_score: number;
  best_category: string;
  best_category_score: number;
  certifications: number;
  improvement_from_start: number;
};

type WeeklyScorePoint = {
  week: string;
  score: number;
};

type CategoryScorePoint = {
  category: string;
  score: number;
  target: number;
};

type RadarPoint = {
  subject: string;
  score: number;
  fullMark: number;
};

type RecentActivityItem = {
  scenario: string;
  score: number;
  date: string | null;
};

type ImprovementArea = {
  category: string;
  current: number;
  target: number;
  recommendation: string;
};

type TraineePerformanceHubResponse = {
  summary: TraineeSummary;
  weekly_scores: WeeklyScorePoint[];
  category_scores: CategoryScorePoint[];
  radar_data: RadarPoint[];
  recent_activity: RecentActivityItem[];
  improvement_areas: ImprovementArea[];
};

function formatScore(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatSignedDelta(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}% from start`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to load your performance data right now.';
}

function getStatusClass(score: number) {
  if (score >= 85) {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (score >= 70) {
    return 'bg-amber-100 text-amber-700';
  }
  return 'bg-rose-100 text-rose-700';
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Date unavailable';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export default function ProgressTracking({ user }: ProgressTrackingProps) {
  const [data, setData] = useState<TraineePerformanceHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const traineeId = user.id || user.user_id;

  const loadAnalytics = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const payload = await apiFetch<TraineePerformanceHubResponse>('/api/analytics/trainee/performance-hub');
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

  const handleExportPDF = async () => {
    if (!traineeId) {
      toast.error('Missing trainee account ID. Please sign in again.');
      return;
    }

    setExporting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/export/progress-pdf?trainee_id=${encodeURIComponent(traineeId)}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to export progress report.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 10);
      link.href = downloadUrl;
      link.download = `progress-report-${timestamp}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('Progress report downloaded successfully.');
    } catch (exportError) {
      toast.error(getErrorMessage(exportError));
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;
  const hasActivity = (data?.recent_activity.length || 0) > 0 || (summary?.current_avg_score || 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-2xl font-bold text-foreground">Personal Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Your performance hub is now driven by your saved activity records, assessments, and certificates.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadAnalytics('refresh')}
            disabled={loading || refreshing}
            className="rounded-full"
          >
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
            Refresh
          </Button>
          <Button onClick={() => void handleExportPDF()} disabled={!traineeId || exporting} className="rounded-full">
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {exporting ? 'Exporting...' : 'Export to PDF'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Current Avg Score"
          value={formatScore(summary?.current_avg_score ?? 0)}
          hint={formatSignedDelta(summary?.improvement_from_start ?? 0)}
          icon={<TrendingUp className="size-5 text-emerald-600" />}
        />
        <SummaryCard
          label="Best Category"
          value={summary?.best_category || 'No data yet'}
          hint={formatScore(summary?.best_category_score ?? 0)}
          icon={<Target className="size-5 text-sky-600" />}
        />
        <SummaryCard
          label="Certifications"
          value={summary?.certifications ?? 0}
          hint="Issued from your stored verdicts"
          icon={<Award className="size-5 text-amber-600" />}
        />
        <SummaryCard
          label="Improvement"
          value={formatSignedDelta(summary?.improvement_from_start ?? 0)}
          hint="Compared with your earliest sessions"
          icon={<TrendingUp className="size-5 text-violet-600" />}
        />
      </div>

      {!loading && !hasActivity && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No activity data yet</CardTitle>
            <CardDescription>
              Start a scenario, submit an assessment, or ask your trainer to assign content so your performance charts
              can populate from the database.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Progress</CardTitle>
            <CardDescription>Your average scores over the most recent saved weeks.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data?.weekly_scores || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#2563eb"
                  name="Average Score"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Skills Radar</CardTitle>
            <CardDescription>Your current category averages from recorded evaluations.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={data?.radar_data || []}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" />
                <PolarRadiusAxis domain={[0, 100]} />
                <Radar name="Your Score" dataKey="score" stroke="#0f766e" fill="#0f766e" fillOpacity={0.45} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Category Performance</CardTitle>
            <CardDescription>Each score below is sourced from your recorded activity results.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data?.category_scores || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" interval={0} angle={-10} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="score" fill="#2563eb" name="Your Score" radius={[8, 8, 0, 0]} />
                <Bar dataKey="target" fill="#16a34a" name="Target" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest activity records saved in the database.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(data?.recent_activity || []).map((session, index) => (
              <div key={`${session.scenario}-${index}`} className="flex items-center justify-between rounded-2xl border p-4">
                <div>
                  <div className="font-medium text-foreground">{session.scenario}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(session.date)}</div>
                </div>
                <Badge className={getStatusClass(session.score)}>{formatScore(session.score)}</Badge>
              </div>
            ))}

            {!loading && !(data?.recent_activity || []).length && (
              <div className="text-sm text-muted-foreground">Your last completed sessions will appear here once new activity is recorded.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-[linear-gradient(135deg,rgba(254,249,195,0.7),rgba(255,237,213,0.95))]">
        <CardHeader>
          <CardTitle>Areas for Improvement</CardTitle>
          <CardDescription>Recommendations based on your lowest database-backed category scores.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.improvement_areas || []).map((area) => (
            <div key={area.category} className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-semibold text-foreground">{area.category}</div>
                  <div className="text-xs text-muted-foreground">
                    Current {formatScore(area.current)} | Target {formatScore(area.target)}
                  </div>
                </div>
                <Badge variant="outline">Recommended focus</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{area.recommendation}</p>
            </div>
          ))}

          {!loading && !(data?.improvement_areas || []).length && (
            <div className="text-sm text-muted-foreground">Improvement suggestions will appear after more evaluated activity records are recorded.</div>
          )}
        </CardContent>
      </Card>
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
