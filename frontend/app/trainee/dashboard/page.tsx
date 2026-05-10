'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { useAuth } from '@/app/context/AuthContext';
import { traineeSidebarItems } from '@/app/trainee/nav';
import {
    BookOpen,
    ClipboardList,
    Clock,
    GraduationCap,
    Medal,
    MessageSquare,
    Play,
    Target,
    TrendingUp
} from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

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

function verdictLabel(status?: string) {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'competent') return 'Competent';
  if (normalized === 'retake') return 'Retake';
  return 'Pending';
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

  async function fetchTraineeData() {
    try {
      const token = localStorage.getItem('token');
      const [statsRes, sessionsRes, coachingRes] = await Promise.all([
        fetch('/api/trainee/stats', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/trainee/sessions', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/certification/coaching/logs', {
          headers: { Authorization: `Bearer ${token}` },
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
  }

  async function loadSimFloorWorkspace() {
    try {
      if (!user?.user_id) return;
      const token = localStorage.getItem('token');
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
        const payload = await reportResponse.json() as SimFloorDashboardReport;
        setSimFloorReport(payload);
      }

      if (availableResponse.ok) {
        const payload = await availableResponse.json() as { scenarios?: SimFloorAssignedScenario[] };
        setAssignedSimFloorScenarios(payload.scenarios || []);
      }
    } catch (error) {
      console.error('Error loading Call Simulation report:', error);
    }
  }

  useEffect(() => {
    void fetchTraineeData();
    void loadSimFloorWorkspace();
  }, []);

  useEffect(() => {
    if (!user?.user_id) return;
    void loadSimFloorWorkspace();
  }, [user?.user_id]);

  useEffect(() => {
    setMustChangePassword(!!user?.must_change_password);
  }, [user]);

  const sidebarItems = traineeSidebarItems;

  const coachingSummary = {
    pending: coachingLogs.filter((log) => log.status === 'sent').length,
    acknowledged: coachingLogs.filter((log) => log.status === 'acknowledged').length,
    retake: coachingLogs.filter((log) => log.competency_status === 'not_competent').length,
  };

  const prioritizedSimFloorScenario = assignedSimFloorScenarios
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
      ? `Retake "${prioritizedSimFloorScenario.title}" and clear your trainer's latest Call Simulation verdict.`
      : `Open "${prioritizedSimFloorScenario.title}" and launch your assigned mock call right away.`
    : simFloorReport?.summary.retakes
      ? `${simFloorReport.summary.retakes} retake${simFloorReport.summary.retakes === 1 ? '' : 's'} still need completion.`
      : 'Resume mock calls, record your CSR turns, and view trainer coaching results.';

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
    <DashboardLayout sidebarItems={sidebarItems} userRole="trainee">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-foreground mb-2">
          Welcome{user?.user_name ? `, ${user.user_name}` : ''} to Your Training Portal
        </h2>
        <p className="text-muted-foreground">
          Review assigned learning, coaching updates, and your saved performance records.
        </p>
      </div>

      {/* Password Change Prompt */}
      {mustChangePassword && (
        <div className="mb-8 rounded-xl border border-yellow-200 bg-yellow-50 p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-yellow-900">
              Update your password
            </h3>
            <p className="text-sm text-yellow-800">
              You are currently using the default trainee password. Please set a new password.
            </p>
          </div>

          <form
            className="grid gap-3 md:grid-cols-3"
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

              const token = localStorage.getItem('token');
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
            <div>
              <label className="block text-xs font-semibold text-yellow-900 mb-1">
                Current password
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Current password"
                className="w-full rounded-lg border border-yellow-200 bg-white px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-yellow-900 mb-1">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setStrengthTouched(true);
                }}
                placeholder="New password"
                className="w-full rounded-lg border border-yellow-200 bg-white px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
              />
              {strengthTouched && (
                <div className="mt-2 space-y-1 text-xs text-yellow-900">
                  <div className="font-semibold">Strength: {strengthLabel()}</div>
                  <div className="flex flex-wrap gap-2 text-yellow-800">
                    <span className={strengthChecks.length ? 'text-green-700' : 'text-yellow-800'}>
                      {strengthChecks.length ? 'OK' : '-'} 8+ chars
                    </span>
                    <span className={strengthChecks.number ? 'text-green-700' : 'text-yellow-800'}>
                      {strengthChecks.number ? 'OK' : '-'} number
                    </span>
                    <span className={strengthChecks.symbol ? 'text-green-700' : 'text-yellow-800'}>
                      {strengthChecks.symbol ? 'OK' : '-'} symbol
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-yellow-900 mb-1">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-lg border border-yellow-200 bg-white px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
              />
            </div>

            <div className="md:col-span-3 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={
                  isChanging ||
                  !strengthChecks.length ||
                  !strengthChecks.number ||
                  !strengthChecks.symbol
                }
                className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-700 disabled:opacity-60"
              >
                {isChanging ? 'Updating...' : 'Update Password'}
              </button>
              {changeError && (
                <span className="text-sm text-red-700">{changeError}</span>
              )}
              {changeSuccess && (
                <span className="text-sm text-green-700">{changeSuccess}</span>
              )}
            </div>
          </form>
        </div>
      )}

      <div className={mustChangePassword ? 'pointer-events-none opacity-60' : ''}>
        {/* Stats Cards */}
        {stats && (
          <div className="mb-8 rounded-2xl border border-blue-200 bg-[linear-gradient(135deg,rgba(219,234,254,0.85),rgba(240,249,255,0.98))] p-6">
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
                  Training Snapshot
                </div>
                <div className="mt-2 text-3xl font-bold text-slate-900">{stats.total_sessions}</div>
                <div className="mt-2 text-sm text-slate-700">
                  Recorded activity sessions saved in the database
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-blue-200 bg-white/80 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                  Completed Today
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{stats.completed_today}</div>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white/80 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                  Coaching Pending
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{coachingSummary.pending}</div>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white/80 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                  Certificates
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{stats.certifications}</div>
              </div>
            </div>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5 mb-8">
            <StatCard
              label="Activity Sessions"
              value={stats.total_sessions}
              icon={<Play size={24} />}
              color="blue"
            />
            <StatCard
              label="Average Score"
              value={stats.average_score.toFixed(1) + '%'}
              icon={<Target size={24} />}
              color="green"
            />
            <StatCard
              label="Completed Scenarios"
              value={stats.completed_scenarios}
              icon={<Medal size={24} />}
              color="purple"
            />
            <StatCard
              label="Recorded Hours"
              value={formatDuration(stats.total_practice_time)}
              icon={<Clock size={24} />}
              color="orange"
            />
            <StatCard
              label="Certifications"
              value={stats.certifications}
              icon={<GraduationCap size={24} />}
              color="green"
            />
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - Assigned Learning */}
          <div className="lg:col-span-2">
            <div className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-8 shadow-xl transition-all duration-300 hover:shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <h3 className="text-xl font-bold text-slate-900 mb-6">
                  Assigned Learning
                </h3>

                <div className="relative grid gap-4 md:grid-cols-2">
                  <QuickLinkCard
                    title="Microlearning"
                    description="Continue your assigned learning modules and save exercise progress."
                    href="/trainee/microlearning"
                    icon={<BookOpen size={20} />}
                    accent="sky"
                  />
                  <QuickLinkCard
                    title="Assessment Hub"
                    description="Start assigned tests, unlock certificates, and retake failed assessments right away."
                    href="/trainee/assessment"
                    icon={<ClipboardList size={20} />}
                    accent="emerald"
                  />
                  <QuickLinkCard
                    title="My Progress"
                    description="Review score history, coaching notes, and category-level performance trends."
                    href="/trainee/progress"
                    icon={<TrendingUp size={20} />}
                    accent="emerald"
                  />
                  <QuickLinkCard
                    title="My Coaching"
                    description={
                      coachingSummary.pending
                        ? `${coachingSummary.pending} coaching item${coachingSummary.pending === 1 ? '' : 's'} still need acknowledgement.`
                        : 'Review your latest coaching guidance and competency updates.'
                    }
                    href="/trainee/coaching"
                    icon={<MessageSquare size={20} />}
                    accent="amber"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar - Coaching and Recent Sessions */}
          <div className="space-y-6">
            <div className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-8 shadow-xl transition-all duration-300 hover:shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <h3 className="text-xl font-bold text-slate-900 mb-6">Coaching Snapshot</h3>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="group/item rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Pending Ack</div>
                    <div className="mt-3 text-2xl font-bold text-amber-900">{coachingSummary.pending}</div>
                  </div>
                  <div className="group/item rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Acknowledged</div>
                    <div className="mt-3 text-2xl font-bold text-emerald-900">{coachingSummary.acknowledged}</div>
                  </div>
                  <div className="group/item rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 to-red-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-rose-700">Retake</div>
                    <div className="mt-3 text-2xl font-bold text-rose-900">{coachingSummary.retake}</div>
                  </div>
                </div>

                {coachingLogs.slice(0, 2).map((log) => (
                  <div key={log.id} className="group/item rounded-3xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 mb-4 last:mb-0">
                    <div className="font-bold text-slate-900 text-sm">{log.coaching_id}</div>
                    <div className="text-xs text-slate-600 mt-2">
                      {log.scenario_title || 'General coaching'}
                    </div>
                    <div className="text-xs text-slate-600 mt-3">
                      {log.status === 'sent' ? 'Needs acknowledgement' : 'Acknowledged'} | {log.competency_status.replace('_', ' ')}
                    </div>
                  </div>
                ))}

                {!coachingLogs.length && (
                  <div className="text-sm text-slate-500 font-medium">No coaching logs yet.</div>
                )}
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-8 shadow-xl transition-all duration-300 hover:shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <h3 className="text-xl font-bold text-slate-900 mb-6">
                  Recent Activity
                </h3>

                {sessions.length > 0 ? (
                  <div className="space-y-4">
                    {sessions.slice(0, 5).map((session) => (
                      <div
                        key={session.id}
                        className="group/item relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
                        <div className="relative flex justify-between items-start mb-3">
                          <h4 className="font-bold text-slate-900 text-sm">
                            {session.scenario_title}
                          </h4>
                          <span
                            className={`text-sm font-bold px-3 py-1 rounded-full ${
                              session.overall_score >= 80
                                ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800'
                                : session.overall_score >= 60
                                  ? 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800'
                                  : 'bg-gradient-to-r from-red-100 to-rose-100 text-red-800'
                            }`}
                          >
                            {session.overall_score.toFixed(0)}%
                          </span>
                        </div>
                        <div className="relative text-xs text-slate-600 space-y-2">
                          <div className="flex justify-between">
                            <span>Accuracy:</span>
                            <span className="font-medium">{session.accuracy.toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Fluency:</span>
                            <span className="font-medium">{session.fluency.toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Date:</span>
                            <span className="font-medium">{new Date(session.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-500 text-sm font-medium">
                      No recorded activity yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  const colorMap: Record<
    string,
    { bg: string; border: string; text: string; iconBg: string; iconColor: string }
  > = {
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-slate-50',
      border: 'border-blue-200',
      text: 'text-blue-900',
      iconBg: 'bg-gradient-to-br from-blue-500 to-teal-500',
      iconColor: 'text-white',
    },
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      border: 'border-green-200',
      text: 'text-green-900',
      iconBg: 'bg-gradient-to-br from-green-500 to-emerald-500',
      iconColor: 'text-white',
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-50 to-violet-50',
      border: 'border-purple-200',
      text: 'text-purple-900',
      iconBg: 'bg-gradient-to-br from-purple-500 to-violet-500',
      iconColor: 'text-white',
    },
    orange: {
      bg: 'bg-gradient-to-br from-orange-50 to-amber-50',
      border: 'border-orange-200',
      text: 'text-orange-900',
      iconBg: 'bg-gradient-to-br from-orange-500 to-amber-500',
      iconColor: 'text-white',
    },
  };

  const styles = colorMap[color];

  return (
    <div className={`group relative overflow-hidden rounded-3xl border ${styles.border} ${styles.bg} p-6 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1`}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-slate-600 mb-3 uppercase tracking-[0.14em]">{label}</p>
          <p className={`text-3xl font-bold ${styles.text}`}>{value}</p>
        </div>
        <div className={`rounded-2xl ${styles.iconBg} p-3 shadow-lg transition-transform group-hover:scale-110`}>
          <div className={styles.iconColor}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.round((totalSeconds || 0) / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function QuickLinkCard({
  title,
  description,
  href,
  icon,
  accent,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  accent: 'sky' | 'amber' | 'emerald' | 'violet';
}) {
  const accentStyles: Record<string, { bg: string; text: string; iconBg: string }> = {
    sky: {
      bg: 'bg-gradient-to-br from-sky-50 to-blue-50',
      text: 'text-sky-900',
      iconBg: 'bg-gradient-to-br from-sky-500 to-blue-500',
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-50 to-orange-50',
      text: 'text-amber-900',
      iconBg: 'bg-gradient-to-br from-amber-500 to-orange-500',
    },
    emerald: {
      bg: 'bg-gradient-to-br from-emerald-50 to-green-50',
      text: 'text-emerald-900',
      iconBg: 'bg-gradient-to-br from-emerald-500 to-green-500',
    },
    violet: {
      bg: 'bg-gradient-to-br from-violet-50 to-purple-50',
      text: 'text-violet-900',
      iconBg: 'bg-gradient-to-br from-violet-500 to-purple-500',
    },
  };

  const styles = accentStyles[accent];

  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-3xl border border-slate-200 ${styles.bg} p-6 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-blue-300`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <div className={`inline-flex rounded-2xl ${styles.iconBg} p-3 shadow-lg transition-transform group-hover:scale-110`}>
          <div className="text-white">{icon}</div>
        </div>
        <div className="mt-4 text-lg font-bold text-slate-900">{title}</div>
        <div className="mt-2 text-sm text-slate-600">{description}</div>
      </div>
    </Link>
  );
}
