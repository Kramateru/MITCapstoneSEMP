'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { adminSidebarItems } from '@/app/admin/nav';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';

type CoachingTemplate = {
  id?: string;
  name: string;
  mandatory_fields: string[];
  acknowledgment_window_hours: number;
};

type CoachingCompliance = {
  total_logs: number;
  acknowledged_logs: number;
  pending_logs: number;
  acknowledgment_rate: number;
};

type CoachingLog = {
  id: string;
  coaching_id: string;
  trainee_id: string;
  trainer_id: string;
  trainee_name?: string | null;
  trainer_name?: string | null;
  scenario_title?: string | null;
  competency_status?: string | null;
  batch_name?: string | null;
  status: string;
  strengths?: string | null;
  opportunities?: string | null;
  action_plan?: string | null;
  target_date?: string | null;
  acknowledged_at?: string | null;
  created_at?: string | null;
};

const AVAILABLE_FIELDS = [
  { id: 'strengths', label: 'Strengths' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'action_plan', label: 'Action Plan' },
  { id: 'target_date', label: 'Target Date' },
  { id: 'coaching_minutes', label: 'Coaching Minutes' },
  { id: 'trainer_remarks', label: 'Trainer Remarks' },
];

function headers() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function statusVariant(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'acknowledged') {
    return 'success' as const;
  }
  if (normalized === 'sent') {
    return 'warning' as const;
  }
  return 'info' as const;
}

export default function AdminCoachingPage() {
  const [template, setTemplate] = useState<CoachingTemplate>({
    name: 'Default Coaching Template',
    mandatory_fields: ['strengths', 'opportunities', 'action_plan', 'target_date'],
    acknowledgment_window_hours: 48,
  });
  const [compliance, setCompliance] = useState<CoachingCompliance>({
    total_logs: 0,
    acknowledged_logs: 0,
    pending_logs: 0,
    acknowledgment_rate: 0,
  });
  const [logs, setLogs] = useState<CoachingLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const requestHeaders = headers();
      const [templateRes, complianceRes, logsRes] = await Promise.all([
        fetch('/api/certification/coaching/template', {
          headers: requestHeaders,
          cache: 'no-store',
        }),
        fetch('/api/certification/coaching/compliance', {
          headers: requestHeaders,
          cache: 'no-store',
        }),
        fetch('/api/certification/coaching/logs', {
          headers: requestHeaders,
          cache: 'no-store',
        }),
      ]);

      const [templateData, complianceData, logsData] = await Promise.all([
        templateRes.json().catch(() => null),
        complianceRes.json().catch(() => null),
        logsRes.json().catch(() => null),
      ]);

      if (!templateRes.ok) {
        throw new Error(templateData?.detail || 'Unable to load coaching template.');
      }
      if (!complianceRes.ok) {
        throw new Error(complianceData?.detail || 'Unable to load coaching compliance.');
      }
      if (!logsRes.ok) {
        throw new Error(logsData?.detail || 'Unable to load coaching logs.');
      }

      setTemplate((current) => ({ ...current, ...templateData }));
      setCompliance(complianceData);
      setLogs(logsData?.logs || []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to load coaching data.',
      );
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleField = (field: string) => {
    setTemplate((current) => ({
      ...current,
      mandatory_fields: current.mandatory_fields.includes(field)
        ? current.mandatory_fields.filter((item) => item !== field)
        : [...current.mandatory_fields, field],
    }));
  };

  const saveTemplate = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/certification/coaching/template', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(template),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || 'Unable to save coaching configuration.');
      }

      toast.success('Coaching configuration saved to the active database.');
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to save coaching configuration.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-border bg-card/95 p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex rounded-full border border-primary/12 bg-primary/6 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-primary">
                Admin Coaching Oversight
              </div>
              <div>
                <h2 className="text-[clamp(1.85rem,1.25rem+1vw,2.8rem)] font-bold tracking-[-0.03em] text-foreground">
                  Coaching Configuration
                </h2>
                <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground sm:text-[1.02rem]">
                  Maintain the live coaching template, monitor acknowledgment health, and review trainer-to-trainee coaching records saved in the shared Supabase-backed certification flow.
                </p>
              </div>
            </div>

            <Button type="button" variant="outline" onClick={() => void load()} disabled={isLoading}>
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh Coaching Data
            </Button>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Total Logs" value={compliance.total_logs} />
          <StatCard label="Acknowledged" value={compliance.acknowledged_logs} />
          <StatCard label="Pending" value={compliance.pending_logs} />
          <StatCard label="Ack Rate" value={`${compliance.acknowledgment_rate}%`} />
        </div>

        <section className="rounded-[1.75rem] border border-border bg-card/95 p-6 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Active Coaching Template</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Trainers and admins use this live configuration from the shared database.
              </p>
            </div>
            <Button type="button" onClick={() => void saveTemplate()} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Save Template
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              className="h-12"
              placeholder="Template name"
              value={template.name}
              onChange={(event) =>
                setTemplate((current) => ({ ...current, name: event.target.value }))
              }
            />
            <Input
              className="h-12"
              type="number"
              min={1}
              value={template.acknowledgment_window_hours}
              onChange={(event) =>
                setTemplate((current) => ({
                  ...current,
                  acknowledgment_window_hours: Number(event.target.value) || 1,
                }))
              }
            />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {AVAILABLE_FIELDS.map((field) => {
              const isChecked = template.mandatory_fields.includes(field.id);
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => toggleField(field.id)}
                  className={`rounded-2xl border p-5 text-left transition ${
                    isChecked
                      ? 'border-emerald-300 bg-emerald-50 shadow-[0_18px_40px_-34px_rgba(16,185,129,0.45)]'
                      : 'border-border bg-card hover:border-primary/24 hover:bg-muted/18'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[0.98rem] font-medium text-foreground">{field.label}</span>
                    {isChecked ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : (
                      <span className="size-4 rounded-full border border-border" />
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {isChecked ? 'Required in coaching logs' : 'Optional field'}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-border bg-card/95 p-6 shadow-sm sm:p-7">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-foreground">Recent Coaching Logs</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Latest records pulled from the database for admin monitoring.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading coaching records...
            </div>
          ) : logs.length ? (
            <div className="space-y-3">
              {logs.slice(0, 8).map((log) => (
                <div key={log.id} className="rounded-2xl border border-border p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-[1rem] font-semibold text-foreground">{log.coaching_id}</h4>
                        <Badge variant={statusVariant(log.status)}>{log.status}</Badge>
                      </div>
                      <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                        <p>
                          Trainee: {log.trainee_name || log.trainee_id} | Trainer:{' '}
                          {log.trainer_name || log.trainer_id}
                        </p>
                        <p>
                          Category: {log.scenario_title || 'General coaching'} | Batch:{' '}
                          {log.batch_name || 'No batch'} | Verdict:{' '}
                          {log.competency_status || 'pending'}
                        </p>
                        <p>Strengths: {log.strengths || 'Not provided yet.'}</p>
                        <p>Opportunities: {log.opportunities || 'Not provided yet.'}</p>
                        <p>Action Plan: {log.action_plan || 'Not provided yet.'}</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm leading-6 text-muted-foreground md:max-w-[18rem]">
                      <div>Created: {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}</div>
                      <div>Acknowledged: {log.acknowledged_at ? new Date(log.acknowledged_at).toLocaleString() : 'Pending'}</div>
                      <div>Target Date: {log.target_date ? new Date(log.target_date).toLocaleDateString() : 'N/A'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-10 text-sm leading-6 text-muted-foreground">
              No coaching logs are stored in the database yet.
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[1.5rem] border border-border bg-card/95 p-5 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
