'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { adminSidebarItems } from '@/app/admin/nav';
import { Button } from '@/app/components/ui/button';

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
      const [templateRes, complianceRes, logsRes] = await Promise.all([
        fetch('/api/certification/coaching/template', { headers: headers() }),
        fetch('/api/certification/coaching/compliance', { headers: headers() }),
        fetch('/api/certification/coaching/logs', { headers: headers() }),
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
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Coaching Configuration</h2>
          <p className="mt-2 text-sm text-gray-600">
            Maintain the coaching template and monitor real acknowledgments from the
            shared certification tables.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Total Logs" value={compliance.total_logs} />
          <StatCard label="Acknowledged" value={compliance.acknowledged_logs} />
          <StatCard label="Pending" value={compliance.pending_logs} />
          <StatCard label="Ack Rate" value={`${compliance.acknowledgment_rate}%`} />
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">Active Coaching Template</h3>
              <p className="text-sm text-gray-500">
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
            <input
              className="rounded-md border px-3 py-2"
              placeholder="Template name"
              value={template.name}
              onChange={(event) =>
                setTemplate((current) => ({ ...current, name: event.target.value }))
              }
            />
            <input
              className="rounded-md border px-3 py-2"
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

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {AVAILABLE_FIELDS.map((field) => {
              const isChecked = template.mandatory_fields.includes(field.id);
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => toggleField(field.id)}
                  className={`rounded-lg border p-4 text-left transition ${
                    isChecked
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-gray-900">{field.label}</span>
                    {isChecked ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : (
                      <span className="size-4 rounded-full border border-gray-300" />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {isChecked ? 'Required in coaching logs' : 'Optional field'}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4">
            <h3 className="font-semibold text-gray-900">Recent Coaching Logs</h3>
            <p className="text-sm text-gray-500">
              Latest records pulled from the database for admin monitoring.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-14 text-sm text-gray-500">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading coaching records...
            </div>
          ) : logs.length ? (
            <div className="space-y-3">
              {logs.slice(0, 8).map((log) => (
                <div key={log.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-gray-900">{log.coaching_id}</h4>
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {log.status}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
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
                    <div className="text-xs text-gray-500">
                      <div>Created: {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}</div>
                      <div>Acknowledged: {log.acknowledged_at ? new Date(log.acknowledged_at).toLocaleString() : 'Pending'}</div>
                      <div>Target Date: {log.target_date ? new Date(log.target_date).toLocaleDateString() : 'N/A'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-sm text-gray-500">
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
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}
