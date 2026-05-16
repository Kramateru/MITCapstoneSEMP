'use client';

import Link from 'next/link';
import {
  Activity,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { adminSidebarItems } from '@/app/admin/nav';
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
    tone: 'blue' as const,
  },
  {
    href: '/admin/analytics',
    label: 'View Analytics',
    description: 'Review trainer-wide performance, trends, and live database signals.',
    icon: Activity,
    tone: 'violet' as const,
  },
  {
    href: '/admin/coaching',
    label: 'Audit Coaching',
    description: 'Inspect coaching activity, acknowledgement flow, and published logs.',
    icon: MessageSquare,
    tone: 'amber' as const,
  },
  {
    href: '/admin/certification-settings',
    label: 'Certification Setup',
    description: 'Update certificate content, issuance rules, and compliance output.',
    icon: ShieldCheck,
    tone: 'green' as const,
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

function statusVariant(status: string) {
  if (status === 'connected' || status === 'configured' || status === 'active') {
    return 'success' as const;
  }
  if (status === 'error') {
    return 'danger' as const;
  }
  if (status === 'fallback_only' || status === 'not_configured') {
    return 'warning' as const;
  }
  return 'neutral' as const;
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
        <DashboardHero
          eyebrow="System Overview"
          title="Administration Dashboard"
          description="Monitor real platform KPIs, trainer and trainee activity, system readiness, and the latest database-backed admin events."
          actions={
            <Button type="button" variant="outline" onClick={() => void loadData('refresh')} disabled={loading || refreshing}>
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <SoftStat label="Total Trainers" value={stats?.total_trainers ?? 0} tone="blue" />
            <SoftStat label="Total Trainees" value={stats?.total_trainees ?? 0} tone="green" />
            <SoftStat label="Audio Coverage" value={`${stats?.system_status?.audio_storage?.utilization?.coverage_percentage ?? 0}%`} tone="amber" />
          </div>
        </DashboardHero>

        {loading ? (
          <NoticeBanner tone="blue">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Loading admin dashboard data...
            </span>
          </NoticeBanner>
        ) : null}

        {loadMessage ? <NoticeBanner tone="amber">{loadMessage}</NoticeBanner> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Total Users"
            value={loading && !stats ? '...' : stats?.total_users ?? 0}
            hint={`${stats?.total_trainees ?? 0} trainees | ${stats?.total_trainers ?? 0} trainers`}
            icon={<Users className="size-5" />}
            tone="blue"
          />
          <MetricCard
            label="Training Scenarios"
            value={loading && !stats ? '...' : stats?.total_scenarios ?? 0}
            hint={`${stats?.total_sessions ?? 0} saved sessions`}
            icon={<FileText className="size-5" />}
            tone="amber"
          />
          <MetricCard
            label="Active Batches"
            value={loading && !stats ? '...' : stats?.active_batches ?? 0}
            hint="Trainer-managed trainee groups"
            icon={<UserCheck className="size-5" />}
            tone="green"
          />
          <MetricCard
            label="Average Completion"
            value={
              loading && !stats
                ? '...'
                : typeof stats?.average_completion === 'number'
                  ? `${stats.average_completion.toFixed(1)}%`
                  : '0.0%'
            }
            hint="Across saved course assignments"
            icon={<Activity className="size-5" />}
            tone="violet"
          />
          <MetricCard
            label="Average Score"
            value={
              loading && !stats
                ? '...'
                : typeof stats?.average_score === 'number'
                  ? stats.average_score.toFixed(1)
                  : '0.0'
            }
            hint="Current practice-session average"
            icon={<Activity className="size-5" />}
            tone="rose"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
          <SectionPanel
            title="Admin control center"
            description="Jump into the core admin workflows for user management, analytics, coaching oversight, and certification setup."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {ADMIN_QUICK_LINKS.map((item) => (
                <ActionCard
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  description={item.description}
                  icon={<item.icon className="size-5" />}
                  tone={item.tone}
                />
              ))}
            </div>
          </SectionPanel>

          <SectionPanel
            title="Platform focus"
            description="Fast admin checks that usually need a decision before deeper review."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <SoftStat
                label="Database"
                value={toDisplayLabel(stats?.system_status?.database?.status || 'unknown')}
                tone="blue"
              />
              <SoftStat
                label="Audio Coverage"
                value={`${stats?.system_status?.audio_storage?.utilization?.coverage_percentage ?? 0}%`}
                tone="amber"
              />
              <SoftStat
                label="Average Completion"
                value={`${typeof stats?.average_completion === 'number' ? stats.average_completion.toFixed(1) : '0.0'}%`}
                tone="green"
              />
              <SoftStat
                label="Average Score"
                value={typeof stats?.average_score === 'number' ? stats.average_score.toFixed(1) : '0.0'}
                tone="violet"
              />
            </div>
          </SectionPanel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
          <SectionPanel
            title="System status"
            description="These checks reflect the currently configured database, ASR, NLP, and Supabase storage paths."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  label: 'ASR Engine',
                  status: stats?.system_status?.asr_engine?.status || 'unknown',
                  detail: stats?.system_status?.asr_engine?.detail || 'No status available.',
                },
                {
                  label: 'NLP Processing',
                  status: stats?.system_status?.nlp_processing?.status || 'unknown',
                  detail: stats?.system_status?.nlp_processing?.detail || 'No status available.',
                },
                {
                  label: 'Database',
                  status: stats?.system_status?.database?.status || 'unknown',
                  detail: stats?.system_status?.database?.detail || 'No status available.',
                },
                {
                  label: 'Audio Storage',
                  status: stats?.system_status?.audio_storage?.status || 'unknown',
                  detail:
                    stats?.system_status?.audio_storage?.utilization
                      ? `${stats?.system_status?.audio_storage?.detail || ''} ${stats?.system_status?.audio_storage?.utilization?.sessions_with_audio ?? 0} recording(s) saved, ${stats?.system_status?.audio_storage?.utilization?.coverage_percentage ?? 0}% session coverage.`
                      : stats?.system_status?.audio_storage?.detail || 'No status available.',
                },
              ].map((item) => (
                <div key={item.label} className="data-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">{item.label}</h3>
                    <Badge variant={statusVariant(item.status)}>{toDisplayLabel(item.status)}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionPanel>

          <SectionPanel
            title="Recent activity"
            description="Admin actions below are loaded from the audit log and reflect database-backed updates only."
          >
            {stats?.recent_activity?.length ? (
              <div className="space-y-3">
                {stats.recent_activity.map((activity) => (
                  <div key={activity.id} className="data-card p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="font-semibold text-foreground">{activity.label}</div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {(activity.entity_type || 'System')} by {activity.actor_name || 'System'}
                        </div>
                      </div>
                      <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {formatTimestamp(activity.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStatePanel
                title="No admin activity has been recorded yet"
                description="Database-backed admin actions will appear here once the platform starts receiving changes."
              />
            )}
          </SectionPanel>
        </div>
      </div>
    </DashboardLayout>
  );
}
