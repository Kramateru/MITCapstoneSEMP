'use client';

import { Activity, FileText, Plus, Search, UserCheck, Users } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Button } from '@/app/components/ui/button';
import { useLobCatalog } from '@/app/hooks/useLobCatalog';

type Scenario = {
  id: string;
  title: string;
  difficulty: string;
  purpose: string;
  created_at: string;
  is_published: boolean;
};

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

const INITIAL_SCENARIO = {
  title: '',
  description: '',
  difficulty: 'basic',
  purpose: 'practice',
  lob: '',
  opening_prompt: '',
  expected_keywords: 'verify, empathy, next steps',
  estimated_duration: '300',
};

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

async function extractErrorMessage(response: Response) {
  try {
    const payload = await response.json();
    return payload?.detail || payload?.message || 'Request failed.';
  } catch {
    return 'Request failed.';
  }
}

export default function AdminDashboardPage() {
  const { lobs, isLoading: isLoadingLobs } = useLobCatalog();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [newScenario, setNewScenario] = useState(INITIAL_SCENARIO);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const loadData = useCallback(async () => {
    try {
      const [statsResponse, scenariosResponse] = await Promise.all([
        fetch('/api/admin/dashboard', { headers: authHeaders(), cache: 'no-store' }),
        fetch('/api/admin/scenarios', { headers: authHeaders(), cache: 'no-store' }),
      ]);

      if (statsResponse.ok) {
        setStats(await statsResponse.json());
      } else {
        setStats(null);
      }

      if (scenariosResponse.ok) {
        const payload = await scenariosResponse.json();
        setScenarios(payload.scenarios || []);
      } else {
        setScenarios([]);
      }
    } catch (error) {
      console.error(error);
      setStats(null);
      setScenarios([]);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredScenarios = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return scenarios;
    }
    return scenarios.filter((scenario) => {
      const haystack = `${scenario.title} ${scenario.difficulty} ${scenario.purpose}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [scenarios, searchTerm]);

  const handleCreateScenario = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('');
    setIsSaving(true);

    try {
      const response = await fetch('/api/admin/scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeaders() || {}),
        },
        body: JSON.stringify({
          title: newScenario.title.trim(),
          description: newScenario.description.trim() || undefined,
          difficulty: newScenario.difficulty,
          purpose: newScenario.purpose,
          lob: newScenario.lob || undefined,
          opening_prompt: newScenario.opening_prompt.trim(),
          expected_keywords: newScenario.expected_keywords
            .split(',')
            .map((keyword) => keyword.trim())
            .filter(Boolean),
          estimated_duration: Number(newScenario.estimated_duration) || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      setStatus('Scenario saved to the active database.');
      setNewScenario(INITIAL_SCENARIO);
      setShowForm(false);
      await loadData();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save the scenario right now.');
    } finally {
      setIsSaving(false);
    }
  };

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

          <Button type="button" onClick={() => setShowForm((current) => !current)}>
            <Plus className="size-4" />
            {showForm ? 'Hide Scenario Form' : 'Create Scenario'}
          </Button>
        </div>

        {status && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            {status}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total Users"
            value={stats?.total_users ?? 0}
            caption={`${stats?.total_trainees ?? 0} trainees | ${stats?.total_trainers ?? 0} trainers`}
            icon={<Users className="size-5 text-sky-600" />}
          />
          <StatCard
            label="Training Scenarios"
            value={stats?.total_scenarios ?? 0}
            caption={`${stats?.total_sessions ?? 0} saved sessions`}
            icon={<FileText className="size-5 text-amber-600" />}
          />
          <StatCard
            label="Active Batches"
            value={stats?.active_batches ?? 0}
            caption="Trainer-managed trainee groups"
            icon={<UserCheck className="size-5 text-emerald-600" />}
          />
          <StatCard
            label="Average Completion"
            value={typeof stats?.average_completion === 'number' ? `${stats.average_completion.toFixed(1)}%` : '0.0%'}
            caption="Across saved course assignments"
            icon={<Activity className="size-5 text-violet-600" />}
          />
          <StatCard
            label="Average Score"
            value={typeof stats?.average_score === 'number' ? stats.average_score.toFixed(1) : '0.0'}
            caption="Current practice-session average"
            icon={<Activity className="size-5 text-rose-600" />}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
          <section className="rounded-3xl border bg-card p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-foreground">System Status</h3>
              <p className="text-sm text-muted-foreground">
                These checks reflect the currently configured database, ASR, NLP, and Supabase storage paths.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
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

          <section className="rounded-3xl border bg-card p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
              <p className="text-sm text-muted-foreground">
                Admin actions below are loaded from the audit log and reflect database-backed updates only.
              </p>
            </div>

            <div className="space-y-3">
              {(stats?.recent_activity || []).map((activity) => (
                <div key={activity.id} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="font-semibold text-foreground">{activity.label}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {activity.entity_type || 'System'} by {activity.actor_name || 'System'}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTimestamp(activity.created_at)}
                    </div>
                  </div>
                </div>
              ))}

              {!stats?.recent_activity?.length && (
                <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                  No admin activity has been recorded yet.
                </div>
              )}
            </div>
          </section>
        </div>

        {showForm && (
          <form onSubmit={handleCreateScenario} className="rounded-3xl border bg-card p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-foreground">Create Scenario</h3>
              <p className="text-sm text-muted-foreground">
                New scenarios are written directly to the active database.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="rounded-lg border px-3 py-2"
                placeholder="Scenario title"
                value={newScenario.title}
                onChange={(event) => setNewScenario((current) => ({ ...current, title: event.target.value }))}
              />
              <select
                className="rounded-lg border px-3 py-2"
                value={newScenario.purpose}
                onChange={(event) => setNewScenario((current) => ({ ...current, purpose: event.target.value }))}
              >
                <option value="practice">Practice</option>
                <option value="assessment">Assessment</option>
                <option value="certification">Certification</option>
              </select>
              <textarea
                className="min-h-24 rounded-lg border px-3 py-2 md:col-span-2"
                placeholder="Scenario description"
                value={newScenario.description}
                onChange={(event) => setNewScenario((current) => ({ ...current, description: event.target.value }))}
              />
              <select
                className="rounded-lg border px-3 py-2"
                value={newScenario.difficulty}
                onChange={(event) => setNewScenario((current) => ({ ...current, difficulty: event.target.value }))}
              >
                <option value="basic">Basic</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <select
                className="rounded-lg border px-3 py-2"
                value={newScenario.lob}
                disabled={isLoadingLobs}
                onChange={(event) => setNewScenario((current) => ({ ...current, lob: event.target.value }))}
              >
                <option value="">{isLoadingLobs ? 'Loading LOBs...' : 'Select LOB'}</option>
                {lobs.map((lob) => (
                  <option key={lob.id} value={lob.name}>
                    {lob.name}
                  </option>
                ))}
              </select>
              <textarea
                className="min-h-24 rounded-lg border px-3 py-2 md:col-span-2"
                placeholder="Opening customer prompt"
                value={newScenario.opening_prompt}
                onChange={(event) => setNewScenario((current) => ({ ...current, opening_prompt: event.target.value }))}
              />
              <input
                className="rounded-lg border px-3 py-2 md:col-span-2"
                placeholder="Expected keywords (comma separated)"
                value={newScenario.expected_keywords}
                onChange={(event) => setNewScenario((current) => ({ ...current, expected_keywords: event.target.value }))}
              />
              <input
                type="number"
                className="rounded-lg border px-3 py-2"
                placeholder="Estimated duration in seconds"
                value={newScenario.estimated_duration}
                onChange={(event) => setNewScenario((current) => ({ ...current, estimated_duration: event.target.value }))}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Scenario'}
              </Button>
            </div>
          </form>
        )}

        <div className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Saved Scenarios</h3>
              <p className="text-sm text-muted-foreground">
                Every item below is loaded from the database.
              </p>
            </div>

            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full rounded-lg border px-3 py-2 pl-9"
                placeholder="Search scenarios..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3">
            {filteredScenarios.map((scenario) => (
              <div key={scenario.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="font-semibold text-foreground">{scenario.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {toDisplayLabel(scenario.difficulty)} | {toDisplayLabel(scenario.purpose)}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {scenario.is_published ? 'Published' : 'Draft'}
                  </div>
                </div>
              </div>
            ))}

            {!filteredScenarios.length && (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No database scenarios match the current search.
              </div>
            )}
          </div>
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
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{value}</div>
          {caption ? <div className="mt-2 text-xs text-muted-foreground">{caption}</div> : null}
        </div>
        <div className="rounded-full bg-muted p-3">{icon}</div>
      </div>
    </div>
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
  const tone =
    status === 'connected' || status === 'configured' || status === 'active'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
      : status === 'fallback_only' || status === 'not_configured'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold">{label}</div>
        <div className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
          {status.replace(/_/g, ' ')}
        </div>
      </div>
      <div className="mt-3 text-sm leading-6">{detail}</div>
    </div>
  );
}
