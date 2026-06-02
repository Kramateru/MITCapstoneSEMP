'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import {
  ActionCard,
  DashboardHero,
  EmptyStatePanel,
  MetricCard,
  NoticeBanner,
  SectionPanel,
  SoftStat,
} from '@/app/components/ui/dashboard-kit';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { useLiveRefresh } from '@/app/hooks/useLiveRefresh';
import { useAuth } from '@/app/context/AuthContext';
import { traineeSidebarItems } from '@/app/trainee/nav';
import {
  BookOpen,
  ClipboardList,
  Clock,
  GraduationCap,
  Medal,
  MessageSquare,
  Mic,
  Play,
  Target,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

interface PracticeSession {
  id: string;
  scenario_title: string;
  overall_score: number;
  accuracy: number;
  fluency: number;
  created_at: string;
  duration: number;
}

interface TraineeStats {
  total_sessions: number;
  average_score: number;
  highest_score: number;
  total_practice_time: number;
  completed_today: number;
  completed_scenarios: number;
  certifications: number;
}

interface CoachingLogSummary {
  id: string;
  coaching_id: string;
  scenario_title?: string | null;
  status: 'sent' | 'acknowledged';
  competency_status: 'pending' | 'competent' | 'not_competent';
  created_at?: string | null;
}

interface SimFloorDashboardReport {
  summary: {
    total_sessions: number;
    average_score: number;
    pass_rate: number;
    retakes: number;
    latest_score: number;
    passing_score: number;
  };
  recent_sessions: Array<{
    session_id: string;
    scenario_title: string;
    score: number;
    attempt_number: number;
    trainer_verdict_status?: string;
    certificate_id?: string | null;
    created_at?: string | null;
  }>;
  certificates: Array<{
    certificate_id: string;
    certificate_no: string;
  }>;
}

interface SimFloorAssignedScenario {
  id: string;
  title: string;
  description?: string | null;
  assigned_at?: string | null;
  attempt_count: number;
  retake_required: boolean;
  competent: boolean;
}

const AUTO_REFRESH_MS = 20_000;

function verdictLabel(status?: string) {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'competent') return 'Competent';
  if (normalized === 'retake') return 'Retake';
  return 'Pending';
}

function verdictVariant(status?: string) {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'competent') return 'success' as const;
  if (normalized === 'retake') return 'warning' as const;
  return 'neutral' as const;
}

function scoreVariant(score: number) {
  if (score >= 80) return 'success' as const;
  if (score >= 60) return 'warning' as const;
  return 'danger' as const;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.round((totalSeconds || 0) / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

export default function TraineeDashboard() {
  const { user, updateUser } = useAuth();
  const [stats, setStats] = useState<TraineeStats | null>(null);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [coachingLogs, setCoachingLogs] = useState<CoachingLogSummary[]>([]);
  const [simFloorReport, setSimFloorReport] = useState<SimFloorDashboardReport | null>(null);
  const [assignedSimFloorScenarios, setAssignedSimFloorScenarios] = useState<SimFloorAssignedScenario[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeSuccess, setChangeSuccess] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [strengthTouched, setStrengthTouched] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const hasLoadedWorkspace = useRef(false);

  const fetchTraineeData = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('token');
      const [statsRes, sessionsRes, coachingRes] = await Promise.all([
        fetch('/api/trainee/stats', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch('/api/trainee/sessions', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch('/api/certification/coaching/logs', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setSessions(sessionsData.sessions || []);
      }

      if (coachingRes.ok) {
        const coachingData = await coachingRes.json();
        setCoachingLogs(coachingData.logs || []);
      }
    } catch (error) {
      console.error('Error fetching trainee data:', error);
    }
  }, []);

  const loadSimFloorWorkspace = useCallback(async () => {
    try {
      if (!user?.user_id) return;
      const token = sessionStorage.getItem('token');
      const [reportResponse, availableResponse] = await Promise.all([
        fetch(`/api/call-simulation/reports/trainee/${user.user_id}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch('/api/call-simulation/available', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ]);

      if (reportResponse.ok) {
        const payload = (await reportResponse.json()) as SimFloorDashboardReport;
        setSimFloorReport(payload);
      }

      if (availableResponse.ok) {
        const payload = (await availableResponse.json()) as { scenarios?: SimFloorAssignedScenario[] };
        setAssignedSimFloorScenarios(payload.scenarios || []);
      }
    } catch (error) {
      console.error('Error loading Call Simulation report:', error);
    }
  }, [user?.user_id]);

  const refreshDashboard = useCallback(async () => {
    if (!hasLoadedWorkspace.current) {
      setLoadingWorkspace(true);
    }

    try {
      await Promise.all([fetchTraineeData(), loadSimFloorWorkspace()]);
    } finally {
      setLoadingWorkspace(false);
      hasLoadedWorkspace.current = true;
    }
  }, [fetchTraineeData, loadSimFloorWorkspace]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useLiveRefresh({
    enabled: true,
    intervalMs: AUTO_REFRESH_MS,
    onRefresh: refreshDashboard,
  });

  useEffect(() => {
    setMustChangePassword(!!user?.must_change_password);
  }, [user]);

  const coachingSummary = {
    pending: coachingLogs.filter((log) => log.status === 'sent').length,
    acknowledged: coachingLogs.filter((log) => log.status === 'acknowledged').length,
    retake: coachingLogs.filter((log) => log.competency_status === 'not_competent').length,
  };

  const prioritizedSimFloorScenario =
    assignedSimFloorScenarios
      .sort((left, right) => {
        const leftPriority = left.retake_required ? 0 : left.attempt_count === 0 ? 1 : left.competent ? 3 : 2;
        const rightPriority = right.retake_required ? 0 : right.attempt_count === 0 ? 1 : right.competent ? 3 : 2;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        const leftAssignedAt = left.assigned_at ? new Date(left.assigned_at).getTime() : 0;
        const rightAssignedAt = right.assigned_at ? new Date(right.assigned_at).getTime() : 0;
        if (leftAssignedAt !== rightAssignedAt) {
          return rightAssignedAt - leftAssignedAt;
        }
        return left.title.localeCompare(right.title);
      })[0] || null;

  const simFloorHref = prioritizedSimFloorScenario
    ? `/trainee/call-simulation/${encodeURIComponent(prioritizedSimFloorScenario.id)}`
    : '/trainee/call-simulation';
  const simFloorDescription = prioritizedSimFloorScenario
    ? prioritizedSimFloorScenario.retake_required
      ? `Retake "${prioritizedSimFloorScenario.title}" and clear your trainer's latest verdict.`
      : `Open "${prioritizedSimFloorScenario.title}" and start your assigned mock call.`
    : simFloorReport?.summary.retakes
      ? `${simFloorReport.summary.retakes} call simulation retake${simFloorReport.summary.retakes === 1 ? '' : 's'} are still pending.`
      : 'Resume assigned call scenarios, record your CSR responses, and review saved results.';

  const strengthChecks = {
    length: newPassword.length >= 8,
    number: /\d/.test(newPassword),
    symbol: /[^A-Za-z0-9]/.test(newPassword),
  };

  const strengthLabel = () => {
    const score = Object.values(strengthChecks).filter(Boolean).length;
    if (score === 3) return 'Strong';
    if (score === 2) return 'Medium';
    if (score === 1) return 'Weak';
    return 'Very weak';
  };

  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <div className="space-y-6">
        <DashboardHero
          eyebrow="Learning Overview"
          title={`Welcome${user?.user_name ? `, ${user.user_name}` : ''}`}
          description="Review your assigned learning, continue mock calls, and keep up with the latest coaching and progress updates."
        >
          {stats ? (
            <div className="dashboard-compact-grid">
              <SoftStat label="Completed Today" value={stats.completed_today} tone="blue" />
              <SoftStat label="Coaching Pending" value={coachingSummary.pending} tone="amber" />
              <SoftStat label="Certificates" value={stats.certifications} tone="green" />
            </div>
          ) : null}
        </DashboardHero>

        {loadingWorkspace ? (
          <NoticeBanner tone="blue">Loading your trainee dashboard...</NoticeBanner>
        ) : null}

        {mustChangePassword ? (
          <SectionPanel
            title="Update your password"
            description="You are still using the default trainee password. Set a new one before continuing with the rest of your workspace."
          >
            <div className="space-y-4">
              <NoticeBanner tone="amber">
                Use at least 8 characters and include both a number and a symbol.
              </NoticeBanner>

              <form
                className="dashboard-actions-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setChangeError('');
                  setChangeSuccess('');

                  if (!oldPassword || !newPassword || !confirmPassword) {
                    setChangeError('Please fill in all password fields.');
                    return;
                  }
                  if (newPassword !== confirmPassword) {
                    setChangeError('New password and confirmation do not match.');
                    return;
                  }
                  if (newPassword.length < 8) {
                    setChangeError('New password must be at least 8 characters.');
                    return;
                  }
                  if (oldPassword === newPassword) {
                    setChangeError('New password must be different from the old password.');
                    return;
                  }

                  const token = sessionStorage.getItem('token');
                  if (!token) {
                    setChangeError('Missing session. Please log in again.');
                    return;
                  }

                  setIsChanging(true);
                  try {
                    const res = await fetch('/api/users/change-password', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        old_password: oldPassword,
                        new_password: newPassword,
                      }),
                    });

                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data?.detail || 'Password change failed.');
                    }

                    setChangeSuccess('Password updated successfully.');
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setMustChangePassword(false);
                    updateUser({ must_change_password: false });
                  } catch (err) {
                    const message = err instanceof Error ? err.message : 'Password change failed.';
                    setChangeError(message);
                  } finally {
                    setIsChanging(false);
                  }
                }}
              >
                <div className="space-y-2">
                  <label htmlFor="current-password">Current password</label>
                  <Input
                    id="current-password"
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="new-password">New password</label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setStrengthTouched(true);
                    }}
                    placeholder="Create a new password"
                  />
                  {strengthTouched ? (
                    <div className="soft-panel space-y-2 px-3 py-3 text-xs text-muted-foreground">
                      <div className="font-semibold text-foreground">Strength: {strengthLabel()}</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={strengthChecks.length ? 'success' : 'neutral'}>8+ chars</Badge>
                        <Badge variant={strengthChecks.number ? 'success' : 'neutral'}>Number</Badge>
                        <Badge variant={strengthChecks.symbol ? 'success' : 'neutral'}>Symbol</Badge>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirm-password">Confirm new password</label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>

                <div className="md:col-span-3 flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    disabled={
                      isChanging ||
                      !strengthChecks.length ||
                      !strengthChecks.number ||
                      !strengthChecks.symbol
                    }
                  >
                    {isChanging ? 'Updating...' : 'Update Password'}
                  </Button>
                  {changeError ? <span className="text-sm text-rose-700">{changeError}</span> : null}
                  {changeSuccess ? <span className="text-sm text-emerald-700">{changeSuccess}</span> : null}
                </div>
              </form>
            </div>
          </SectionPanel>
        ) : null}

        <div className={mustChangePassword ? 'pointer-events-none opacity-60' : 'space-y-6'}>
          {stats ? (
            <div className="dashboard-metrics-grid">
              <MetricCard
                label="Activity Sessions"
                value={stats.total_sessions}
                hint="Saved speech and practice records"
                icon={<Play className="size-5" />}
                tone="blue"
              />
              <MetricCard
                label="Average Score"
                value={`${stats.average_score.toFixed(1)}%`}
                hint="Across completed trainee activity"
                icon={<Target className="size-5" />}
                tone="green"
              />
              <MetricCard
                label="Completed Scenarios"
                value={stats.completed_scenarios}
                hint="Finished practice or assessment items"
                icon={<Medal className="size-5" />}
                tone="violet"
              />
              <MetricCard
                label="Recorded Time"
                value={formatDuration(stats.total_practice_time)}
                hint="Total guided speaking time"
                icon={<Clock className="size-5" />}
                tone="amber"
              />
              <MetricCard
                label="Certificates"
                value={stats.certifications}
                hint="Issued training completions"
                icon={<GraduationCap className="size-5" />}
                tone="green"
              />
            </div>
          ) : null}

          <div className="dashboard-balanced-grid">
            <div className="space-y-6">
              <SectionPanel
                title="Assigned learning"
                description="Continue only the items your trainer has assigned and keep your progress moving."
              >
                <div className="dashboard-actions-grid">
                  <ActionCard
                    href="/trainee/microlearning"
                    title="Microlearning Hub"
                    description="Continue assigned learning modules and save your exercise progress."
                    icon={<BookOpen className="size-5" />}
                    tone="blue"
                  />
                  <ActionCard
                    href="/trainee/assessment"
                    title="Assessments"
                    description="Take saved trainer assignments one question at a time and review your latest results."
                    icon={<ClipboardList className="size-5" />}
                    tone="green"
                  />
                  <ActionCard
                    href={simFloorHref}
                    title="Call Simulation"
                    description={simFloorDescription}
                    icon={<Mic className="size-5" />}
                    tone="amber"
                  />
                  <ActionCard
                    href="/trainee/coaching"
                    title="My Coaching"
                    description={
                      coachingSummary.pending
                        ? `${coachingSummary.pending} coaching item${coachingSummary.pending === 1 ? '' : 's'} still need acknowledgement.`
                        : 'Review your latest coaching guidance and competency updates.'
                    }
                    icon={<MessageSquare className="size-5" />}
                    tone="amber"
                  />
                  <ActionCard
                    href="/trainee/progress"
                    title="My Progress"
                    description="Check completed work, current performance, and what to focus on next."
                    icon={<TrendingUp className="size-5" />}
                    tone="violet"
                    className="xl:col-span-2"
                  />
                </div>
              </SectionPanel>

              <SectionPanel
                title="Call simulation progress"
                description="Track your latest mock call outcomes and the scenario your trainer wants you to tackle next."
                action={
                  <Button asChild variant="outline">
                    <Link href="/trainee/call-simulation">Open Call Simulation</Link>
                  </Button>
                }
              >
                <div className="space-y-4">
                  <div className="dashboard-compact-grid">
                    <SoftStat
                      label="Call Sessions"
                      value={simFloorReport?.summary.total_sessions ?? 0}
                      tone="blue"
                    />
                    <SoftStat
                      label="Average Score"
                      value={`${(simFloorReport?.summary.average_score ?? 0).toFixed(1)}%`}
                      tone="green"
                    />
                    <SoftStat
                      label="Retakes Pending"
                      value={simFloorReport?.summary.retakes ?? 0}
                      tone="amber"
                    />
                  </div>

                  {prioritizedSimFloorScenario ? (
                    <div className="data-card p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={prioritizedSimFloorScenario.retake_required ? 'warning' : 'info'}>
                              {prioritizedSimFloorScenario.retake_required ? 'Needs retake' : 'Assigned next'}
                            </Badge>
                            {prioritizedSimFloorScenario.competent ? (
                              <Badge variant="success">Passed</Badge>
                            ) : null}
                          </div>
                          <h3 className="text-base font-semibold text-foreground">
                            {prioritizedSimFloorScenario.title}
                          </h3>
                          <p className="text-sm leading-6 text-muted-foreground">
                            {prioritizedSimFloorScenario.description || simFloorDescription}
                          </p>
                        </div>
                        <Button asChild>
                          <Link href={simFloorHref}>
                            {prioritizedSimFloorScenario.retake_required ? 'Resume Retake' : 'Start Call'}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <EmptyStatePanel
                      title="No assigned call simulation yet"
                      description="Once your trainer assigns a mock call scenario, it will appear here with a direct start button."
                    />
                  )}

                  {simFloorReport?.recent_sessions?.length ? (
                    <div className="dashboard-list-stack">
                      {simFloorReport.recent_sessions.slice(0, 3).map((session) => (
                        <div key={session.session_id} className="data-card p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-semibold text-foreground">{session.scenario_title}</h4>
                                <Badge variant={verdictVariant(session.trainer_verdict_status)}>
                                  {verdictLabel(session.trainer_verdict_status)}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Attempt {session.attempt_number} - {formatDate(session.created_at)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={scoreVariant(session.score)}>{session.score.toFixed(1)}%</Badge>
                              {session.certificate_id ? <Badge variant="success">Certified</Badge> : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </SectionPanel>
            </div>

            <div className="space-y-6">
              <SectionPanel
                title="Coaching snapshot"
                description="Stay on top of the feedback items that still need your attention."
                action={
                  <Button asChild variant="outline">
                    <Link href="/trainee/coaching">View Coaching</Link>
                  </Button>
                }
              >
                <div className="space-y-4">
                  <div className="dashboard-compact-grid">
                    <SoftStat label="Pending" value={coachingSummary.pending} tone="amber" />
                    <SoftStat label="Acknowledged" value={coachingSummary.acknowledged} tone="green" />
                    <SoftStat label="Retake" value={coachingSummary.retake} tone="rose" />
                  </div>

                  {coachingLogs.length ? (
                    <div className="dashboard-list-stack">
                      {coachingLogs.slice(0, 3).map((log) => (
                        <div key={log.id} className="data-card p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={log.status === 'sent' ? 'warning' : 'success'}>
                              {log.status === 'sent' ? 'Needs acknowledgement' : 'Acknowledged'}
                            </Badge>
                            <Badge variant={log.competency_status === 'not_competent' ? 'danger' : log.competency_status === 'competent' ? 'success' : 'neutral'}>
                              {log.competency_status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <h4 className="mt-3 text-sm font-semibold text-foreground">{log.coaching_id}</h4>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {log.scenario_title || 'General coaching'} - {formatDate(log.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyStatePanel
                      title="No coaching logs yet"
                      description="Trainer coaching notes and acknowledgements will appear here once they are published."
                    />
                  )}
                </div>
              </SectionPanel>

              <SectionPanel
                title="Recent activity"
                description="Your most recent saved practice sessions and scores."
              >
                {sessions.length ? (
                  <div className="dashboard-list-stack">
                    {sessions.slice(0, 5).map((session) => (
                      <div key={session.id} className="data-card p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground">{session.scenario_title}</h4>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatDate(session.created_at)} - {formatDuration(session.duration)}
                            </p>
                          </div>
                          <Badge variant={scoreVariant(session.overall_score)}>
                            {session.overall_score.toFixed(0)}%
                          </Badge>
                        </div>
                        <div className="dashboard-detail-grid mt-4">
                          <SoftStat label="Accuracy" value={`${session.accuracy.toFixed(0)}%`} tone="blue" />
                          <SoftStat label="Fluency" value={`${session.fluency.toFixed(0)}%`} tone="green" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyStatePanel
                    title="No recorded activity yet"
                    description="When you complete practice or speaking activities, your latest saved results will show up here."
                  />
                )}
              </SectionPanel>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
