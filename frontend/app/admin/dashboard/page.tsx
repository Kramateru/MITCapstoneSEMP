'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BarChart3,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Button } from '@/app/components/ui/button';

type DashboardStats = {
  total_users: number;
  total_trainees: number;
  total_trainers: number;
  total_scenarios: number;
  total_sessions: number;
  average_score: number;
  active_batches: number;
  average_completion: number;
  system_status?: {
    asr_engine?: { status: string; detail: string };
    nlp_processing?: { status: string; detail: string };
    database?: { status: string; detail: string };
    audio_storage?: {
      status: string;
      detail: string;
      provider?: string;
      utilization?: {
        sessions_with_audio: number;
        coverage_percentage: number;
      };
    };
  };
  recent_activity?: Array<{
    id: string;
    label: string;
    entity_type?: string;
    actor_name?: string;
    created_at?: string;
  }>;
};

const ADMIN_QUICK_LINKS = [
  {
    href: '/admin/users',
    label: 'Manage Users',
    description: 'Create and maintain admin, trainer, and trainee accounts.',
    icon: Users,
  },
  {
    href: '/admin/analytics',
    label: 'View Analytics',
    description: 'Review trainer-wide performance, trends, and live database signals.',
    icon: BarChart3,
  },
  {
    href: '/admin/coaching',
    label: 'Audit Coaching',
    description: 'Inspect coaching activity, acknowledgement flow, and published logs.',
    icon: MessageSquare,
  },
  {
    href: '/admin/certification-settings',
    label: 'Certification Setup',
    description: 'Update certificate content, issuance rules, and compliance output.',
    icon: ShieldCheck,
  },
] as const;

const DASHBOARD_REQUEST_TIMEOUT_MS = 20000;
const DASHBOARD_REQUEST_RETRIES = 0;
const DASHBOARD_RETRY_DELAY_MS = 400;

function toDisplayLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(value?: string) {
  if (!value) {
    return 'Date unavailable';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(parsed);
}

function getLoadErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DASHBOARD_REQUEST_TIMEOUT_MS,
  retries = DASHBOARD_REQUEST_RETRIES,
): Promise<T> {
  let lastError: unknown = new Error('Request failed.');

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        cache: 'no-store',
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          (payload as { detail?: string; message?: string } | null)?.detail ||
            (payload as { detail?: string; message?: string } | null)?.message ||
            'Request failed.',
        );
      }

      return payload as T;
    } catch (error) {
      lastError =
        error instanceof DOMException && error.name === 'AbortError'
          ? new Error('The request took too long to load.')
          : error;

      if (attempt === retries) {
        throw lastError;
      }

      await new Promise((resolve) =>
        window.setTimeout(resolve, DASHBOARD_RETRY_DELAY_MS * (attempt + 1)),
      );
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed.');
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadMessage, setLoadMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const loadData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const data = await fetchJsonWithTimeout<DashboardStats>('/api/admin/dashboard', { headers: authHeaders() });
      setStats(data);
      setLoadMessage('');
    } catch (error) {
      if (mode === 'initial') {
        setStats(null);
        setLoadMessage(
          `Dashboard overview is temporarily unavailable. ${getLoadErrorMessage(error, 'Please refresh in a moment.')}`,
        );
      } else {
        setLoadMessage(
          `Dashboard overview could not be refreshed. ${getLoadErrorMessage(error, 'Please try again.')}`,
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Administration Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Monitor real platform KPIs, system readiness, and recently saved admin activity.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void loadData('refresh')} disabled={loading || refreshing}>
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Loading admin dashboard data...
            </div>
          </div>
        ) : null}

        {loadMessage && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {loadMessage}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total Users"
            value={loading && !stats ? '...' : stats?.total_users ?? 0}
            caption={`${stats?.total_trainees ?? 0} trainees | ${stats?.total_trainers ?? 0} trainers`}
            icon={<Users className="size-5 text-sky-600" />}
          />
          <StatCard
            label="Training Scenarios"
            value={loading && !stats ? '...' : stats?.total_scenarios ?? 0}
            caption={`${stats?.total_sessions ?? 0} saved sessions`}
            icon={<FileText className="size-5 text-amber-600" />}
          />
          <StatCard
            label="Active Batches"
            value={loading && !stats ? '...' : stats?.active_batches ?? 0}
            caption="Trainer-managed trainee groups"
            icon={<UserCheck className="size-5 text-emerald-600" />}
          />
          <StatCard
            label="Average Completion"
            value={loading && !stats ? '...' : typeof stats?.average_completion === 'number' ? `${stats.average_completion.toFixed(1)}%` : '0.0%'}
            caption="Across saved course assignments"
            icon={<Activity className="size-5 text-violet-600" />}
          />
          <StatCard
            label="Average Score"
            value={loading && !stats ? '...' : typeof stats?.average_score === 'number' ? stats.average_score.toFixed(1) : '0.0'}
            caption="Current practice-session average"
            icon={<Activity className="size-5 text-rose-600" />}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <section className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-8 shadow-xl transition-all duration-300 hover:shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative mb-6">
              <h3 className="text-xl font-bold text-slate-900">Admin Control Center</h3>
              <p className="text-sm text-slate-600 mt-2">
                Jump straight into the core admin workflows for user management, analytics, coaching oversight, and certification setup.
              </p>
            </div>

            <div className="relative grid gap-4 md:grid-cols-2">
              {ADMIN_QUICK_LINKS.map((item) => (
                <QuickLinkCard
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  description={item.description}
                  icon={<item.icon className="size-5" />}
                />
              ))}
            </div>
          </section>

          <section className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-8 shadow-xl transition-all duration-300 hover:shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative mb-6">
              <h3 className="text-xl font-bold text-slate-900">Platform Focus</h3>
              <p className="text-sm text-slate-600 mt-2">
                Snapshot of the admin checks that usually need a fast decision before deeper review.
              </p>
            </div>

            <div className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <FocusTile
                label="Database"
                value={toDisplayLabel(stats?.system_status?.database?.status || 'unknown')}
                hint={stats?.system_status?.database?.detail || 'No database status available yet.'}
              />
              <FocusTile
                label="Audio Coverage"
                value={`${stats?.system_status?.audio_storage?.utilization?.coverage_percentage ?? 0}%`}
                hint={`${stats?.system_status?.audio_storage?.utilization?.sessions_with_audio ?? 0} sessions currently have saved audio.`}
              />
              <FocusTile
                label="Average Completion"
                value={`${typeof stats?.average_completion === 'number' ? stats.average_completion.toFixed(1) : '0.0'}%`}
                hint="Across trainer-managed course assignments."
              />
              <FocusTile
                label="Average Score"
                value={typeof stats?.average_score === 'number' ? stats.average_score.toFixed(1) : '0.0'}
                hint="Current practice-session average across the active database."
              />
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
          <section className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-8 shadow-xl transition-all duration-300 hover:shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative mb-6">
              <h3 className="text-xl font-bold text-slate-900">System Status</h3>
              <p className="text-sm text-slate-600 mt-2">
                These checks reflect the currently configured database, ASR, NLP, and Supabase storage paths.
              </p>
            </div>

            <div className="relative grid gap-4 md:grid-cols-2">
              <StatusCard
                label="ASR Engine"
                status={stats?.system_status?.asr_engine?.status || 'unknown'}
                detail={stats?.system_status?.asr_engine?.detail || 'No status available.'}
              />
              <StatusCard
                label="NLP Processing"
                status={stats?.system_status?.nlp_processing?.status || 'unknown'}
                detail={stats?.system_status?.nlp_processing?.detail || 'No status available.'}
              />
              <StatusCard
                label="Database"
                status={stats?.system_status?.database?.status || 'unknown'}
                detail={stats?.system_status?.database?.detail || 'No status available.'}
              />
              <StatusCard
                label="Audio Storage"
                status={stats?.system_status?.audio_storage?.status || 'unknown'}
                detail={
                  stats?.system_status?.audio_storage?.utilization
                    ? `${stats?.system_status?.audio_storage?.detail || ''} ${stats?.system_status?.audio_storage?.utilization?.sessions_with_audio ?? 0} recording(s) saved, ${stats?.system_status?.audio_storage?.utilization?.coverage_percentage ?? 0}% session coverage.`
                    : stats?.system_status?.audio_storage?.detail || 'No status available.'
                }
              />
            </div>
          </section>

          <section className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-8 shadow-xl transition-all duration-300 hover:shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative mb-6">
              <h3 className="text-xl font-bold text-slate-900">Recent Activity</h3>
              <p className="text-sm text-slate-600 mt-2">
                Admin actions below are loaded from the audit log and reflect database-backed updates only.
              </p>
            </div>

            <div className="relative space-y-4">
              {(stats?.recent_activity || []).map((activity) => (
                <div key={activity.id} className="group/item rounded-3xl border bg-gradient-to-r from-white to-slate-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="font-bold text-slate-900">{activity.label}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        {activity.entity_type || 'System'} by {activity.actor_name || 'System'}
                      </div>
                    </div>
                    <div className="text-xs font-medium text-slate-500">
                      {formatTimestamp(activity.created_at)}
                    </div>
                  </div>
                </div>
              ))}

              {!stats?.recent_activity?.length && (
                <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-gray-50 p-8 text-center">
                  <div className="text-sm font-medium text-slate-500">No admin activity has been recorded yet.</div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({
  label,
  value,
  caption,
  icon,
}: {
  label: string;
  value: number | string;
  caption?: string;
  icon: ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-6 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-600">{label}</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
          {caption ? <div className="mt-2 text-xs text-slate-500">{caption}</div> : null}
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-teal-500 p-4 text-white shadow-lg transition-transform group-hover:scale-110">
          {icon}
        </div>
      </div>
    </div>
  );
}

function FocusTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
        <div className="mt-3 text-xs text-slate-600">{hint}</div>
      </div>
    </div>
  );
}

function QuickLinkCard({
  href,
  label,
  description,
  icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-3xl border bg-gradient-to-br from-white to-slate-50 p-6 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-blue-200"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-teal-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-teal-500 p-4 text-white shadow-lg transition-transform group-hover:scale-110">
          {icon}
        </div>
        <ArrowRight className="size-5 text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-blue-500" />
      </div>
      <div className="relative mt-4 font-bold text-slate-900">{label}</div>
      <div className="relative mt-2 text-sm text-slate-600">{description}</div>
    </Link>
  );
}

function StatusCard({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail: string;
}) {
  const getStatusStyle = (status: string) => {
    if (status === 'connected' || status === 'configured' || status === 'active') {
      return 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 text-emerald-800 shadow-emerald-100';
    }
    if (status === 'error') {
      return 'border-rose-200 bg-gradient-to-br from-rose-50 to-red-50 text-rose-800 shadow-rose-100';
    }
    if (status === 'fallback_only' || status === 'not_configured') {
      return 'border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 text-amber-800 shadow-amber-100';
    }
    return 'border-slate-200 bg-gradient-to-br from-slate-50 to-gray-50 text-slate-700 shadow-slate-100';
  };

  return (
    <div className={`group relative overflow-hidden rounded-3xl border p-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${getStatusStyle(status)}`}>
      <div className="relative flex items-center justify-between gap-3">
        <div className="font-bold">{label}</div>
        <div className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] shadow-sm">
          {status.replace(/_/g, ' ')}
        </div>
      </div>
      <div className="relative mt-4 text-sm leading-6">{detail}</div>
    </div>
  );
}
