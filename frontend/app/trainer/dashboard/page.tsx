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
import React, { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Badge } from '@/app/components/ui/badge';
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

function scoreClassName(score: number) {
  if (score >= 85) {
    return 'text-emerald-600';
  }
  if (score >= 70) {
    return 'text-amber-600';
  }
  return 'text-rose-600';
}

function scoreBadgeClassName(score: number) {
  if (score >= 85) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (score >= 70) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function batchHealth(batch: BatchSnapshot) {
  if (batch.total_sessions === 0) {
    return {
      label: 'No activity',
      className: 'border-slate-200 bg-slate-50 text-slate-700',
    };
  }

  if (batch.average_score < 70 || batch.progress < 50) {
    return {
      label: 'Needs attention',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    label: 'On track',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
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
        <section className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-8 shadow-xl transition-all duration-300 hover:shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="relative">
            <h2 className="text-3xl font-bold text-slate-900">Trainer Dashboard</h2>
            <p className="mt-3 max-w-3xl text-sm text-slate-600">
              Focus on the batches that need attention, the trainees waiting for coaching, and the outcomes that
              matter most right now.
            </p>
          </div>
        </section>

        {liveStatus ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {liveStatus}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <SummaryCard
            label="Active Trainees"
            value={stats?.total_trainees ?? 0}
            hint="Across your current batch assignments"
            icon={<Users className="size-4 text-blue-600" />}
          />
          <SummaryCard
            label="Active Batches"
            value={stats?.total_batches ?? 0}
            hint="Trainer-owned cohorts ready for action"
            icon={<Layers3 className="size-4 text-indigo-600" />}
          />
          <SummaryCard
            label="Session Volume"
            value={stats?.total_sessions ?? 0}
            hint="Recorded trainee practice sessions"
            icon={<TrendingUp className="size-4 text-emerald-600" />}
          />
          <SummaryCard
            label="Average Score"
            value={`${(stats?.average_score ?? 0).toFixed(1)}%`}
            hint="Overall result across saved sessions"
            icon={<FileText className="size-4 text-sky-600" />}
          />
          <SummaryCard
            label="Needs Coaching"
            value={stats?.pending_reviews ?? 0}
            hint="Sessions still waiting for trainer review"
            icon={<AlertCircle className="size-4 text-amber-600" />}
          />
          <SummaryCard
            label="Retake Required"
            value={coachingStats?.not_competent_logs ?? 0}
            hint={`${coachingStats?.pending_logs ?? 0} coaching log(s) still awaiting acknowledgement`}
            icon={<AlertCircle className="size-4 text-rose-600" />}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-8 shadow-xl transition-all duration-300 hover:shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Priority Batches</h3>
                  <p className="text-sm text-slate-600 mt-2">
                    The most important batch snapshots live here, ranked by coaching risk and activity level.
                  </p>
                </div>
                <Link
                  href="/trainer/batches"
                  className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Open Batches
                  <ArrowRight className="size-4" />
                </Link>
              </div>

              {loading && !highlightedBatches.length ? (
                <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-gray-50 p-10 text-center">
                  <div className="text-sm font-medium text-slate-500">Loading batch snapshots...</div>
                </div>
              ) : highlightedBatches.length ? (
                <div className="space-y-4">
                  {highlightedBatches.map((batch) => {
                    const health = batchHealth(batch);

                    return (
                      <div key={batch.id} className="group/item relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-6 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
                        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="font-bold text-slate-900">{formatBatchLabel(batch)}</h3>
                              <Badge className={`${health.className} font-bold`}>{health.label}</Badge>
                            </div>
                            <p className="mt-2 text-sm text-slate-600">
                              {batch.description || 'No batch description provided.'}
                            </p>
                          </div>

                          <Link
                            href="/trainer/batches"
                            className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            Manage
                            <ArrowRight className="size-4" />
                          </Link>
                        </div>

                        <div className="relative mt-6 grid gap-4 sm:grid-cols-3">
                          <MiniMetric label="Trainees" value={batch.users_count} />
                          <MiniMetric label="Sessions" value={batch.total_sessions} />
                          <MiniMetric
                            label="Avg Score"
                            value={`${batch.average_score.toFixed(1)}%`}
                            tone={scoreClassName(batch.average_score)}
                          />
                        </div>

                        <div className="relative mt-6 space-y-3">
                          <div className="flex items-center justify-between text-sm text-slate-600">
                            <span className="font-medium">Engagement</span>
                            <span className="font-bold">{batch.progress}%</span>
                          </div>
                          <Progress value={batch.progress} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-gray-50 p-10 text-center">
                  <div className="text-sm font-medium text-slate-500">
                    No batch data is available yet. Create a batch and start assigning trainees to surface cohort health
                    here.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-8 shadow-xl transition-all duration-300 hover:shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Coaching Queue</h3>
                  <p className="text-sm text-slate-600 mt-2">
                    Recent trainee interactions sorted so unverified and lower-scoring attempts appear first.
                  </p>
                </div>
                <Link
                  href="/trainer/coaching"
                  className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Open Coaching
                  <ArrowRight className="size-4" />
                </Link>
              </div>

              {loading && !coachingQueue.length ? (
                <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-gray-50 p-10 text-center">
                  <div className="text-sm font-medium text-slate-500">Loading coaching queue...</div>
                </div>
              ) : coachingQueue.length ? (
                <div className="space-y-4">
                  {coachingQueue.map((session) => (
                    <div key={session.id} className="group/item relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-6 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="font-bold text-slate-900">{session.user_name}</h3>
                            <Badge variant="outline" className="font-medium">{session.scenario_title}</Badge>
                            <Badge
                              className={
                                session.is_verified
                                  ? 'border-emerald-200 bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 font-bold'
                                  : 'border-amber-200 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 font-bold'
                              }
                            >
                              {session.is_verified ? 'Verified' : 'Needs coaching'}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{formatDateTime(session.created_at)}</p>
                        </div>

                        <div className="text-right">
                          <div
                            className={`inline-flex rounded-full border px-4 py-2 text-sm font-bold ${scoreBadgeClassName(
                              session.overall_score,
                            )}`}
                          >
                            {session.overall_score.toFixed(1)}%
                          </div>
                          <p className="mt-2 text-xs text-slate-500 font-medium">Overall score</p>
                        </div>
                      </div>

                      <div className="relative mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                          <span className="font-medium">Accuracy: {session.accuracy.toFixed(1)}%</span>
                          <span className="font-medium">Fluency: {session.fluency.toFixed(1)}%</span>
                        </div>

                        <Link
                          href="/trainer/coaching"
                          className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          Review in Coaching
                          <ArrowRight className="size-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-gray-50 p-10 text-center">
                  <div className="text-sm font-medium text-slate-500">
                    No trainee interactions are available yet.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-6 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-teal-500 p-3 shadow-lg transition-transform group-hover:scale-110">
            <div className="text-white">{icon}</div>
          </div>
          <div className="text-sm font-bold uppercase tracking-[0.14em] text-slate-600">{label}</div>
        </div>
        <p className="text-3xl font-bold text-slate-900">{value}</p>
        <p className="mt-2 text-sm text-slate-600">{hint}</p>
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <div className="group rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-3 text-lg font-bold ${tone || 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
