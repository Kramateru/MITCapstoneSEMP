'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { apiFetch, downloadApiFile } from '@/app/utils/api';

type AuditLog = {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  role?: string | null;
  action_type: string;
  module_name?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  description?: string | null;
  old_data?: Record<string, unknown>;
  new_data?: Record<string, unknown>;
  changed_fields?: string[];
  status: string;
  severity: string;
  ip_address?: string | null;
  browser_info?: string | null;
  device_type?: string | null;
  batch_id?: string | null;
  trainee_id?: string | null;
  trainer_id?: string | null;
  session_id?: string | null;
  request_id?: string | null;
  endpoint?: string | null;
  http_method?: string | null;
  http_status?: number | null;
  metadata?: Record<string, unknown>;
  timestamp?: string | null;
};

type LogsResponse = {
  logs: AuditLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

type AuditSummary = {
  total_logs: number;
  logs_today: number;
  failed_actions: number;
  login_attempts: number;
  active_users_today: number;
  recent_critical: AuditLog[];
  activity_by_module: Array<{ module: string; count: number }>;
  activity_by_role: Array<{ role: string; count: number }>;
  most_active_users: Array<{ user: string; email?: string | null; count: number }>;
  activity_trend: Array<{ date: string; count: number }>;
  login_trend: Array<{ date: string; count: number }>;
  activity_totals: Record<string, number>;
};

type FilterOptions = {
  roles: string[];
  modules: string[];
  actions: string[];
  severities: string[];
  statuses: string[];
};

type AuditFilters = {
  search: string;
  role: string;
  module: string;
  action_type: string;
  severity: string;
  status: string;
  start_date: string;
  end_date: string;
  sort: 'newest' | 'oldest';
  page: number;
  page_size: number;
};

const DEFAULT_FILTERS: AuditFilters = {
  search: '',
  role: '',
  module: '',
  action_type: '',
  severity: '',
  status: '',
  start_date: '',
  end_date: '',
  sort: 'newest',
  page: 1,
  page_size: 25,
};

const CHART_COLORS = ['#1d56d8', '#11906f', '#c77c12', '#7c3aed', '#dc2626', '#0f766e'];

function labelize(value?: string | null) {
  if (!value) {
    return 'System';
  }
  return value
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Unavailable';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unavailable';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function compactDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

function statusVariant(status: string) {
  if (status === 'success') {
    return 'success' as const;
  }
  if (status === 'failed') {
    return 'danger' as const;
  }
  return 'neutral' as const;
}

function severityVariant(severity: string) {
  if (severity === 'critical') {
    return 'danger' as const;
  }
  if (severity === 'warning') {
    return 'warning' as const;
  }
  return 'info' as const;
}

function buildQuery(filters: AuditFilters, includePagination = true) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (!includePagination && ['page', 'page_size'].includes(key)) {
      return;
    }
    if (value !== '' && value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

function JsonBlock({ value }: { value: unknown }) {
  const content = JSON.stringify(value ?? {}, null, 2);
  return (
    <pre className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
      {content}
    </pre>
  );
}

function MetricTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="data-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-normal text-foreground">{value}</p>
        </div>
        <div className="inline-flex size-11 items-center justify-center rounded-xl border border-primary/12 bg-primary/8 text-primary">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function AdminAuditTrailPage() {
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_FILTERS);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [options, setOptions] = useState<FilterOptions>({
    roles: [],
    modules: [],
    actions: [],
    severities: [],
    statuses: [],
  });
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState('');
  const [loadMessage, setLoadMessage] = useState('');

  const loadAuditData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [logsPayload, summaryPayload, optionsPayload] = await Promise.all([
        apiFetch<LogsResponse>(`/api/audit/logs?${buildQuery(filters)}`),
        apiFetch<AuditSummary>('/api/audit/summary'),
        apiFetch<FilterOptions>('/api/audit/filter-options'),
      ]);
      setLogs(logsPayload.logs);
      setTotal(logsPayload.total);
      setTotalPages(Math.max(logsPayload.total_pages || 1, 1));
      setSummary(summaryPayload);
      setOptions(optionsPayload);
      setLoadMessage('');
    } catch (error) {
      setLoadMessage(error instanceof Error ? error.message : 'Audit trail data could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadAuditData();
  }, [loadAuditData]);

  const updateFilter = (key: keyof AuditFilters, value: string | number) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === 'page' ? Number(value) : 1,
    }));
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const exportLogs = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      const exportQuery = buildQuery(filters, false);
      await downloadApiFile(
        `/api/audit/export?format=${format}${exportQuery ? `&${exportQuery}` : ''}`,
        `audit-trail.${format}`,
      );
    } finally {
      setExporting('');
    }
  };

  const moduleChart = summary?.activity_by_module || [];
  const roleChart = summary?.activity_by_role || [];
  const trendChart = summary?.activity_trend.map((item) => ({
    ...item,
    label: compactDate(item.date),
  })) || [];

  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-xl border border-border/80 bg-white/92 p-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.28)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/12 bg-primary/6 px-3 py-1 text-xs font-semibold uppercase tracking-normal text-primary">
              <ShieldCheck className="size-4" />
              Admin Accountability
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-normal text-foreground">Audit Trail</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Centralized activity monitoring for authentication, database changes, learning modules, assessments, call simulations, coaching, analytics, and reports.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void loadAuditData('refresh')} disabled={refreshing || loading}>
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh
            </Button>
            <Button type="button" variant="outline" onClick={() => void exportLogs('csv')} disabled={Boolean(exporting)}>
              {exporting === 'csv' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              CSV
            </Button>
            <Button type="button" variant="outline" onClick={() => void exportLogs('xlsx')} disabled={Boolean(exporting)}>
              {exporting === 'xlsx' ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
              Excel
            </Button>
            <Button type="button" variant="outline" onClick={() => void exportLogs('pdf')} disabled={Boolean(exporting)}>
              {exporting === 'pdf' ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              PDF
            </Button>
          </div>
        </div>

        {loadMessage ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadMessage}</div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile label="Total Logs" value={summary?.total_logs ?? 0} hint="All persisted audit events" icon={<Activity className="size-5" />} />
          <MetricTile label="Logs Today" value={summary?.logs_today ?? 0} hint="Events since midnight UTC" icon={<RefreshCw className="size-5" />} />
          <MetricTile label="Failed Actions" value={summary?.failed_actions ?? 0} hint="Failed or rejected activity" icon={<AlertTriangle className="size-5" />} />
          <MetricTile label="Login Attempts" value={summary?.login_attempts ?? 0} hint="Successful and failed logins" icon={<ShieldCheck className="size-5" />} />
          <MetricTile label="Active Users Today" value={summary?.active_users_today ?? 0} hint="Distinct actors with logs" icon={<UserCheck className="size-5" />} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="data-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">User Activity Trend</h3>
                <p className="mt-1 text-sm text-muted-foreground">Daily platform activity volume.</p>
              </div>
              <Badge variant="info">Timeline</Badge>
            </div>
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#1d56d8" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="data-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Activity By Role</h3>
                <p className="mt-1 text-sm text-muted-foreground">Actor mix across Admin, Trainer, and Trainee.</p>
              </div>
              <Badge variant="neutral">Roles</Badge>
            </div>
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={roleChart} dataKey="count" nameKey="role" innerRadius={58} outerRadius={92} paddingAngle={3}>
                    {roleChart.map((entry, index) => (
                      <Cell key={entry.role} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, labelize(String(name))]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="data-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Activity By Module</h3>
                <p className="mt-1 text-sm text-muted-foreground">Most active platform areas.</p>
              </div>
              <Badge variant="success">Modules</Badge>
            </div>
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moduleChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="module" stroke="#64748b" fontSize={11} interval={0} angle={-18} textAnchor="end" height={70} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#11906f" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="data-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Recent Critical Actions</h3>
                <p className="mt-1 text-sm text-muted-foreground">Warnings and critical events for investigation.</p>
              </div>
              <Badge variant="warning">Watchlist</Badge>
            </div>
            <div className="mt-5 space-y-3">
              {summary?.recent_critical.length ? summary.recent_critical.map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedLog(log)}
                  className="w-full rounded-xl border border-border/80 bg-white px-4 py-3 text-left transition hover:border-primary/20 hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{labelize(log.action_type)}</span>
                    <Badge variant={severityVariant(log.severity)}>{labelize(log.severity)}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{log.description || log.endpoint}</p>
                </button>
              )) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No warning or critical audit events yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="data-card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Activity Logs</h3>
              <p className="mt-1 text-sm text-muted-foreground">{total.toLocaleString()} log entries match the current filters.</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm text-muted-foreground">
              <Search className="size-4" />
              <input
                value={filters.search}
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="Search user, module, action, entity"
                className="min-h-9 w-72 max-w-[60vw] bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select value={filters.role} onChange={(event) => updateFilter('role', event.target.value)} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm">
              <option value="">All roles</option>
              {options.roles.map((role) => <option key={role} value={role}>{labelize(role)}</option>)}
            </select>
            <select value={filters.module} onChange={(event) => updateFilter('module', event.target.value)} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm">
              <option value="">All modules</option>
              {options.modules.map((module) => <option key={module} value={module}>{module}</option>)}
            </select>
            <select value={filters.action_type} onChange={(event) => updateFilter('action_type', event.target.value)} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm">
              <option value="">All actions</option>
              {options.actions.map((action) => <option key={action} value={action}>{labelize(action)}</option>)}
            </select>
            <select value={filters.severity} onChange={(event) => updateFilter('severity', event.target.value)} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm">
              <option value="">All severities</option>
              {options.severities.map((severity) => <option key={severity} value={severity}>{labelize(severity)}</option>)}
            </select>
            <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm">
              <option value="">All statuses</option>
              {options.statuses.map((statusValue) => <option key={statusValue} value={statusValue}>{labelize(statusValue)}</option>)}
            </select>
            <input type="date" value={filters.start_date} onChange={(event) => updateFilter('start_date', event.target.value)} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm" />
            <input type="date" value={filters.end_date} onChange={(event) => updateFilter('end_date', event.target.value)} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm" />
            <select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value as AuditFilters['sort'])} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <select value={filters.page_size} onChange={(event) => updateFilter('page_size', Number(event.target.value))} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm">
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
            <Button type="button" variant="outline" onClick={clearFilters}>Clear Filters</Button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="min-w-[1120px] w-full bg-white text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading audit logs...</span>
                    </td>
                  </tr>
                ) : logs.length ? logs.map((log) => (
                  <tr key={log.id} className="border-t border-border/70">
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(log.timestamp)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{log.user_name || 'System'}</div>
                      <div className="text-xs text-muted-foreground">{log.user_email || log.ip_address || 'No actor email'}</div>
                    </td>
                    <td className="px-4 py-3"><Badge variant="neutral">{labelize(log.role)}</Badge></td>
                    <td className="px-4 py-3 font-medium text-foreground">{labelize(log.action_type)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{log.module_name || 'System'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{log.entity_type || 'Record'}{log.entity_id ? ` / ${log.entity_id.slice(0, 8)}` : ''}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(log.status)}>{labelize(log.status)}</Badge></td>
                    <td className="px-4 py-3"><Badge variant={severityVariant(log.severity)}>{labelize(log.severity)}</Badge></td>
                    <td className="px-4 py-3">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                        <Eye className="size-4" />
                        Open
                      </Button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No audit logs match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Page {filters.page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)}>Previous</Button>
              <Button type="button" variant="outline" disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)}>Next</Button>
            </div>
          </div>
        </div>

        <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>{selectedLog ? labelize(selectedLog.action_type) : 'Audit Log Details'}</DialogTitle>
              <DialogDescription>{selectedLog?.description || 'Structured audit event details.'}</DialogDescription>
            </DialogHeader>
            {selectedLog ? (
              <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-3">
                  {[
                    ['User', selectedLog.user_name || 'System'],
                    ['Email', selectedLog.user_email || 'Unavailable'],
                    ['Role', labelize(selectedLog.role)],
                    ['Timestamp', formatDate(selectedLog.timestamp)],
                    ['Module', selectedLog.module_name || 'System'],
                    ['Entity', `${selectedLog.entity_type || 'Record'}${selectedLog.entity_id ? ` / ${selectedLog.entity_id}` : ''}`],
                    ['IP Address', selectedLog.ip_address || 'Unavailable'],
                    ['Device', selectedLog.device_type || 'Unavailable'],
                    ['Endpoint', selectedLog.endpoint || 'Unavailable'],
                    ['Request ID', selectedLog.request_id || 'Unavailable'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-border bg-slate-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</div>
                      <div className="mt-1 break-words text-sm font-medium text-foreground">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-foreground">Changed Fields</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedLog.changed_fields?.length ? selectedLog.changed_fields.map((field) => (
                        <Badge key={field} variant="info">{labelize(field)}</Badge>
                      )) : <Badge variant="neutral">No field diff captured</Badge>}
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-foreground">Old Value</h4>
                    <JsonBlock value={selectedLog.old_data} />
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-foreground">New Value</h4>
                    <JsonBlock value={selectedLog.new_data} />
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-foreground">Metadata</h4>
                    <JsonBlock value={{ ...selectedLog.metadata, browser_info: selectedLog.browser_info }} />
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
