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

const COACHING_QUEUE_CUTOFF_DATE = '2026-04-20';

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

function isOnOrAfterCoachingQueueCutoff(value?: string | null) {
  if (!value) {
    return false;
  }

  const normalizedDate = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return normalizedDate >= COACHING_QUEUE_CUTOFF_DATE;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed >= new Date(`${COACHING_QUEUE_CUTOFF_DATE}T00:00:00`);
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
      const [statsRes, sessionsRes, coachingRes, batchesRes] = await Promise.all([
        fetch('/api/trainer/stats', { headers: authHeaders, cache: 'no-store' }),
        fetch('/api/trainer/interaction-history?limit=12', { headers: authHeaders, cache: 'no-store' }),
        fetch('/api/certification/coaching/compliance', { headers: authHeaders, cache: 'no-store' }),
        fetch('/api/trainer/batches', { headers: authHeaders, cache: 'no-store' }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        const nextSessions: TrainingSession[] = (sessionsData.sessions || [])
          .filter((session: any) => isOnOrAfterCoachingQueueCutoff(session.created_at))
          .map((session: any) => ({
            id: session.id,
            user_name: session.user_name || 'Trainee',
            scenario_title: session.scenario_title || 'Scenario',
            overall_score: Number(session.overall_score || 0),
            accuracy: Number(session.accuracy || 0),
            fluency: Number(session.fluency || 0),
            is_verified: Boolean(session.is_verified),
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
        };

        if (message.type === 'practice_session_completed') {
          setLiveStatus(
            `${message.session?.user_name || 'A trainee'} completed ${message.session?.scenario_title || 'a scenario'}.`,
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
          if (left.is_verified !== right.is_verified) {
            return Number(left.is_verified) - Number(right.is_verified);
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

  const sidebarItems = trainerSidebarItems(stats?.pending_reviews);

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
            <SoftStat label="Pending Reviews" value={stats?.pending_reviews ?? 0} tone="amber" />
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
            value={stats?.pending_reviews ?? 0}
            hint="Sessions still waiting for trainer review"
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
            description="Recent trainee interactions sorted so unverified and lower-scoring attempts appear first."
            action={
              <Button asChild variant="outline">
                <Link href="/trainer/coaching">Open Coaching</Link>
              </Button>
            }
          >
            {loading && !coachingQueue.length ? (
              <EmptyStatePanel
                title="Loading coaching queue..."
                description="Fetching the latest trainee attempts and verification status."
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
                          <Badge variant={session.is_verified ? 'success' : 'warning'}>
                            {session.is_verified ? 'Verified' : 'Needs coaching'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{formatDateTime(session.created_at)}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant={scoreVariant(session.overall_score)}>
                          {session.overall_score.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <SoftStat label="Accuracy" value={`${session.accuracy.toFixed(1)}%`} tone="blue" />
                      <SoftStat label="Fluency" value={`${session.fluency.toFixed(1)}%`} tone="green" />
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
                title="No trainee interactions are available yet"
                description="Once trainees start completing work, their latest attempts will appear here for review."
              />
            )}
          </SectionPanel>
        </div>
      </div>
    </DashboardLayout>
  );
}
