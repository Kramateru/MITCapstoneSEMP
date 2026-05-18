'use client';

import {
  AlertCircle,
  ArrowRight,
  FileText,
  Layers3,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import {
  DashboardHero,
  EmptyStatePanel,
  MetricCard,
  NoticeBanner,
  SectionPanel,
  SoftStat,
} from '@/app/components/ui/dashboard-kit';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Progress } from '@/app/components/ui/progress';
import { trainerSidebarItems } from '@/app/trainer/nav';
import { getBackendWebSocketUrl } from '@/app/utils/ws';

interface TrainingSession {
  id: string;
  user_name: string;
  scenario_title: string;
  overall_score: number;
  accuracy: number;
  fluency: number;
  is_verified: boolean;
  training_state_code: string;
  training_state_label: string;
  training_state_summary: string;
  attempt_number: number;
  created_at?: string | null;
}

interface TrainerStats {
  total_trainees: number;
  total_batches: number;
  total_sessions: number;
  average_score: number;
  pending_reviews: number;
}

interface CoachingCompliance {
  total_logs: number;
  acknowledged_logs: number;
  pending_logs: number;
  draft_logs: number;
  competent_logs: number;
  not_competent_logs: number;
}

interface CoachingHubSummary {
  completed_categories: number;
  ready_for_coaching: number;
  pending_acknowledgement: number;
  acknowledged: number;
  competent: number;
  not_competent: number;
}

interface CoachingHubCategory {
  sim_session_id?: string | null;
  trainee_name?: string | null;
  scenario_title?: string | null;
  overall_score?: number | null;
  scores?: {
    accuracy?: number | null;
    fluency?: number | null;
  } | null;
  is_verified?: boolean;
  training_state?: {
    code?: string | null;
    label?: string | null;
    summary?: string | null;
  } | null;
  attempt_number?: number | null;
  created_at?: string | null;
}

interface CoachingHubResponse {
  summary?: CoachingHubSummary | null;
  completed_categories?: CoachingHubCategory[];
}

interface BatchItem {
  id: string;
  name: string;
  description?: string | null;
  wave_number?: number | null;
  users_count: number;
}

interface BatchSnapshot extends BatchItem {
  progress: number;
  total_sessions: number;
  average_score: number;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'No activity yet';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatBatchLabel(batch: Pick<BatchItem, 'name' | 'wave_number'>) {
  if (batch.wave_number !== null && batch.wave_number !== undefined) {
    return `${batch.name} | Wave ${batch.wave_number}`;
  }

  return batch.name;
}

function scoreVariant(score: number) {
  if (score >= 85) {
    return 'success' as const;
  }
  if (score >= 70) {
    return 'warning' as const;
  }
  return 'danger' as const;
}

function trainingStateVariant(code: string) {
  if (code === 'competent') {
    return 'success' as const;
  }
  if (code === 'needs_retake') {
    return 'danger' as const;
  }
  if (code === 'pending_acknowledgement' || code === 'awaiting_coaching') {
    return 'warning' as const;
  }
  if (code === 'acknowledged') {
    return 'info' as const;
  }
  return 'neutral' as const;
}

function coachingQueuePriority(session: TrainingSession) {
  switch (session.training_state_code) {
    case 'awaiting_coaching':
      return 0;
    case 'needs_retake':
      return 1;
    case 'pending_acknowledgement':
      return 2;
    case 'acknowledged':
      return 3;
    case 'competent':
      return 4;
    default:
      return 5;
  }
}

function batchHealth(batch: BatchSnapshot) {
  if (batch.total_sessions === 0) {
    return {
      label: 'No activity',
      variant: 'neutral' as const,
    };
  }

  if (batch.average_score < 70 || batch.progress < 50) {
    return {
      label: 'Needs attention',
      variant: 'warning' as const,
    };
  }

  return {
    label: 'On track',
    variant: 'success' as const,
  };
}

function batchPriority(batch: BatchSnapshot) {
  let priority = batch.users_count * 5;

  if (batch.total_sessions === 0) {
    priority += 90;
  }
  if (batch.average_score < 70) {
    priority += 80;
  }
  if (batch.progress < 50) {
    priority += 60;
  }

  return priority;
}

export default function TrainerDashboardPage() {
  const [stats, setStats] = useState<TrainerStats | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [coachingStats, setCoachingStats] = useState<CoachingCompliance | null>(null);
  const [coachingSummary, setCoachingSummary] = useState<CoachingHubSummary | null>(null);
  const [batches, setBatches] = useState<BatchSnapshot[]>([]);
  const [liveStatus, setLiveStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTrainerData = useEffectEvent(async () => {
    try {
      if (!stats && !sessions.length) {
        setLoading(true);
      }
      setError('');

      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const authHeaders = { Authorization: `Bearer ${token}` };
      const [statsRes, coachingHubRes, coachingRes, batchesRes] = await Promise.all([
        fetch('/api/trainer/stats', { headers: authHeaders, cache: 'no-store' }),
        fetch('/api/certification/coaching/hub', { headers: authHeaders, cache: 'no-store' }),
        fetch('/api/certification/coaching/compliance', { headers: authHeaders, cache: 'no-store' }),
        fetch('/api/trainer/batches', { headers: authHeaders, cache: 'no-store' }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (coachingHubRes.ok) {
        const coachingHubData: CoachingHubResponse = await coachingHubRes.json();
        setCoachingSummary(coachingHubData.summary || null);
        const nextSessions: TrainingSession[] = (coachingHubData.completed_categories || []).map((session) => ({
          id: session.sim_session_id || `${session.trainee_name || 'trainee'}-${session.scenario_title || 'scenario'}`,
          user_name: session.trainee_name || 'Trainee',
          scenario_title: session.scenario_title || 'Scenario',
          overall_score: Number(session.overall_score || 0),
          accuracy: Number(session.scores?.accuracy || 0),
          fluency: Number(session.scores?.fluency || 0),
          is_verified: Boolean(session.is_verified),
          training_state_code: session.training_state?.code || 'pending',
          training_state_label: session.training_state?.label || 'Pending',
          training_state_summary: session.training_state?.summary || 'Waiting for trainer review.',
          attempt_number: Number(session.attempt_number || 1),
          created_at: session.created_at,
        }));
        setSessions(nextSessions);
      }

      if (coachingRes.ok) {
        const coachingData = await coachingRes.json();
        setCoachingStats(coachingData);
      }

      if (batchesRes.ok) {
        const batchesData = await batchesRes.json();
        const nextBatches: BatchItem[] = batchesData.batches || [];
        const priorityBatches = [...nextBatches]
          .sort((left, right) => (right.users_count || 0) - (left.users_count || 0))
          .slice(0, 6);

        const hydratedBatches = await Promise.all(
          priorityBatches.map(async (batch) => {
            try {
              const performanceRes = await fetch(`/api/trainer/batch-performance/${batch.id}`, {
                headers: authHeaders,
                cache: 'no-store',
              });

              if (!performanceRes.ok) {
                return {
                  ...batch,
                  progress: 0,
                  total_sessions: 0,
                  average_score: 0,
                } satisfies BatchSnapshot;
              }

              const performanceData = await performanceRes.json();
              const userPerformance = performanceData.user_performance || [];
              const activeUsers = userPerformance.filter(
                (row: { session_count?: number }) => (row.session_count || 0) > 0,
              ).length;
              const averageScore = userPerformance.length
                ? userPerformance.reduce(
                    (total: number, row: { avg_score?: number }) => total + Number(row.avg_score || 0),
                    0,
                  ) / userPerformance.length
                : 0;

              return {
                ...batch,
                progress: batch.users_count ? Math.round((activeUsers / batch.users_count) * 100) : 0,
                total_sessions: performanceData.total_sessions || 0,
                average_score: Number(averageScore.toFixed(1)),
              } satisfies BatchSnapshot;
            } catch {
              return {
                ...batch,
                progress: 0,
                total_sessions: 0,
                average_score: 0,
              } satisfies BatchSnapshot;
            }
          }),
        );

        setBatches(hydratedBatches);
      }
    } catch (fetchError) {
      console.error('Error fetching trainer dashboard data:', fetchError);
      setError('Unable to refresh trainer dashboard data right now.');
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    void fetchTrainerData();

    const token = localStorage.getItem('token');
    if (!token) {
      return undefined;
    }

    const socket = new WebSocket(
      getBackendWebSocketUrl(`/api/trainer/live-updates?token=${encodeURIComponent(token)}`),
    );

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          session?: { user_name?: string; scenario_title?: string };
          details?: { trainee_name?: string; scenario_title?: string };
        };

        if (
          message.type === 'practice_session_completed'
          || message.type === 'call_simulation_completed'
        ) {
          setLiveStatus(
            `${message.session?.user_name || message.details?.trainee_name || 'A trainee'} completed ${message.session?.scenario_title || message.details?.scenario_title || 'a scenario'}.`,
          );
          void fetchTrainerData();
        }
      } catch (parseError) {
        console.error('Live update parse error:', parseError);
      }
    };

    socket.onopen = () => {
      setLiveStatus('Live trainer updates connected.');
    };

    socket.onclose = () => {
      setLiveStatus('Live trainer updates disconnected.');
    };

    return () => {
      socket.close();
    };
  }, []);

  const highlightedBatches = useMemo(
    () =>
      [...batches]
        .sort((left, right) => batchPriority(right) - batchPriority(left))
        .slice(0, 4),
    [batches],
  );

  const coachingQueue = useMemo(
    () =>
      [...sessions]
        .sort((left, right) => {
          const priorityDiff = coachingQueuePriority(left) - coachingQueuePriority(right);
          if (priorityDiff !== 0) {
            return priorityDiff;
          }

          if (left.overall_score !== right.overall_score) {
            return left.overall_score - right.overall_score;
          }

          const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
          const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
          return rightTime - leftTime;
        })
        .slice(0, 6),
    [sessions],
  );

  const pendingReviewCount = coachingSummary?.ready_for_coaching ?? stats?.pending_reviews ?? 0;
  const sidebarItems = trainerSidebarItems(pendingReviewCount);

  return (
    <DashboardLayout sidebarItems={sidebarItems} userRole="trainer">
      <div className="space-y-6">
        <DashboardHero
          eyebrow="Training Operations"
          title="Trainer Dashboard"
          description="Focus on the batches that need attention, the trainees waiting for coaching, and the results that matter most right now."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/trainer/realtime">Open Live Analytics</Link>
              </Button>
              <Button asChild>
                <Link href="/trainer/coaching">Review Coaching Queue</Link>
              </Button>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <SoftStat label="Pending Reviews" value={pendingReviewCount} tone="amber" />
            <SoftStat label="Coaching Acknowledged" value={coachingStats?.acknowledged_logs ?? 0} tone="green" />
            <SoftStat label="Retake Required" value={coachingStats?.not_competent_logs ?? 0} tone="rose" />
          </div>
        </DashboardHero>

        {liveStatus ? <NoticeBanner tone="blue">{liveStatus}</NoticeBanner> : null}
        {error ? <NoticeBanner tone="rose">{error}</NoticeBanner> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            label="Active Trainees"
            value={stats?.total_trainees ?? 0}
            hint="Across your current batch assignments"
            icon={<Users className="size-5" />}
            tone="blue"
          />
          <MetricCard
            label="Active Batches"
            value={stats?.total_batches ?? 0}
            hint="Trainer-owned cohorts ready for action"
            icon={<Layers3 className="size-5" />}
            tone="violet"
          />
          <MetricCard
            label="Session Volume"
            value={stats?.total_sessions ?? 0}
            hint="Recorded trainee activity sessions"
            icon={<TrendingUp className="size-5" />}
            tone="green"
          />
          <MetricCard
            label="Average Score"
            value={`${(stats?.average_score ?? 0).toFixed(1)}%`}
            hint="Across saved trainee outcomes"
            icon={<FileText className="size-5" />}
            tone="blue"
          />
          <MetricCard
            label="Needs Coaching"
            value={pendingReviewCount}
            hint="Completed mock calls still waiting for trainer review"
            icon={<AlertCircle className="size-5" />}
            tone="amber"
          />
          <MetricCard
            label="Retake Required"
            value={coachingStats?.not_competent_logs ?? 0}
            hint={`${coachingStats?.pending_logs ?? 0} coaching log(s) still awaiting acknowledgement`}
            icon={<AlertCircle className="size-5" />}
            tone="rose"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <SectionPanel
            title="Priority batches"
            description="The cohorts below are ranked by activity risk, score trend, and coaching urgency."
            action={
              <Button asChild variant="outline">
                <Link href="/trainer/batches">Open Batches</Link>
              </Button>
            }
          >
            {loading && !highlightedBatches.length ? (
              <EmptyStatePanel
                title="Loading batch snapshots..."
                description="Fetching real-time batch activity and performance details."
              />
            ) : highlightedBatches.length ? (
              <div className="space-y-4">
                {highlightedBatches.map((batch) => {
                  const health = batchHealth(batch);

                  return (
                    <div key={batch.id} className="data-card p-5 sm:p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-foreground">{formatBatchLabel(batch)}</h3>
                            <Badge variant={health.variant}>{health.label}</Badge>
                          </div>
                          <p className="text-sm leading-6 text-muted-foreground">
                            {batch.description || 'No batch description provided.'}
                          </p>
                        </div>

                        <Button asChild variant="outline">
                          <Link href="/trainer/batches">Manage Batch</Link>
                        </Button>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <SoftStat label="Trainees" value={batch.users_count} tone="blue" />
                        <SoftStat label="Sessions" value={batch.total_sessions} tone="violet" />
                        <SoftStat label="Avg Score" value={`${batch.average_score.toFixed(1)}%`} tone="green" />
                      </div>

                      <div className="mt-5 space-y-3">
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span className="font-medium">Engagement</span>
                          <span className="font-semibold text-foreground">{batch.progress}%</span>
                        </div>
                        <Progress value={batch.progress} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyStatePanel
                title="No batch data is available yet"
                description="Create a batch and start assigning trainees to surface cohort health and completion signals here."
              />
            )}
          </SectionPanel>

          <SectionPanel
            title="Coaching queue"
            description="Latest finished mock calls, prioritized by coaching state and score, all loaded from the live call-simulation review hub."
            action={
              <Button asChild variant="outline">
                <Link href="/trainer/coaching">Open Coaching</Link>
              </Button>
            }
          >
            {loading && !coachingQueue.length ? (
              <EmptyStatePanel
                title="Loading coaching queue..."
                description="Fetching the latest completed mock calls and coaching states."
              />
            ) : coachingQueue.length ? (
              <div className="space-y-4">
                {coachingQueue.map((session) => (
                  <div key={session.id} className="data-card p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">{session.user_name}</h3>
                          <Badge variant="outline">{session.scenario_title}</Badge>
                          <Badge variant={trainingStateVariant(session.training_state_code)}>
                            {session.training_state_label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{formatDateTime(session.created_at)}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{session.training_state_summary}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant={scoreVariant(session.overall_score)}>
                          {session.overall_score.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <SoftStat label="Accuracy" value={`${session.accuracy.toFixed(1)}%`} tone="blue" />
                      <SoftStat label="Attempt / Fluency" value={`#${session.attempt_number} | ${session.fluency.toFixed(1)}%`} tone="green" />
                    </div>

                    <div className="mt-5 flex justify-end">
                      <Button asChild variant="outline">
                        <Link href="/trainer/coaching">
                          Review in Coaching
                          <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStatePanel
                title="No finished mock calls are available yet"
                description="Once trainees complete assigned call simulations, their latest attempts will appear here for trainer review."
              />
            )}
          </SectionPanel>
        </div>
      </div>
    </DashboardLayout>
  );
}
