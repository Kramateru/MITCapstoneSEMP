'use client';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/app/components/ui/select';
import {
    Download,
    FileBarChart,
    Filter,
    LineChart as LineChartIcon,
    Loader2,
    RefreshCw,
    UserCheck,
    Users
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';

type Batch = {
  id: string;
  name: string;
  wave_number?: number;
  users_count?: number;
  description?: string | null;
  lob?: string | null;
};

type Trainer = {
  id: string;
  full_name: string;
  email: string;
  batches_count?: number;
  trainees_count?: number;
};

type ReportScope = 'trainer' | 'batch';
type GraphView = 'overview' | 'progress' | 'categories' | 'performance' | 'rankings';

type SummaryCard = {
  label: string;
  value: string;
  helper?: string;
};

type TrainerPerformanceSummary = {
  trainer_id: string;
  trainer_name: string;
  total_batches: number;
  total_trainees: number;
  avg_batch_performance: number;
  total_sessions: number;
  pass_rate: number;
  top_performing_batch?: {
    batch_name: string;
    avg_score: number;
  };
  needs_attention_batches: number;
};

type BatchPerformanceSummary = {
  batch_id: string;
  batch_name: string;
  trainer_name: string;
  total_trainees: number;
  avg_performance: number;
  pass_rate: number;
  total_sessions: number;
  completion_rate: number;
  top_performers: number;
  needs_improvement: number;
};

type PerformanceTrend = {
  period: string;
  avg_score: number;
  sessions: number;
  pass_rate: number;
};

type CategoryPerformance = {
  category: string;
  average_score: number;
  improvement_trend: number;
};

type TrainerReportResponse = {
  trainer: Trainer;
  batches: BatchPerformanceSummary[];
  summary: TrainerPerformanceSummary;
  trends: PerformanceTrend[];
  category_performance: CategoryPerformance[];
};

type BatchReportResponse = {
  batch: Batch;
  trainer: Trainer;
  summary: BatchPerformanceSummary;
  trends: PerformanceTrend[];
  category_performance: CategoryPerformance[];
  trainee_performance: Array<{
    trainee_id: string;
    trainee_name: string;
    sessions_completed: number;
    avg_score: number;
    pass_rate: number;
    latest_session: string;
  }>;
};

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

async function extractErrorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return payload?.detail || payload?.message || fallback;
  } catch {
    return fallback;
  }
}

export default function AdminReportsPage() {
  const [reportScope, setReportScope] = useState<ReportScope>('trainer');
  const [selectedTrainer, setSelectedTrainer] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [graphView, setGraphView] = useState<GraphView>('overview');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [trainerReport, setTrainerReport] = useState<TrainerReportResponse | null>(null);
  const [batchReport, setBatchReport] = useState<BatchReportResponse | null>(null);

  // Load trainers and batches
  const loadData = useCallback(async () => {
    try {
      setStatus('');
      const [trainersRes, batchesRes] = await Promise.all([
        fetch('/api/admin/trainers', { headers: authHeaders(), cache: 'no-store' }),
        fetch('/api/admin/batches', { headers: authHeaders(), cache: 'no-store' })
      ]);
      const [trainersData, batchesData] = await Promise.all([
        trainersRes.json().catch(() => null),
        batchesRes.json().catch(() => null),
      ]);

      if (trainersRes.ok) {
        setTrainers(trainersData?.trainers || []);
      } else {
        setTrainers([]);
      }

      if (batchesRes.ok) {
        setBatches(batchesData?.batches || []);
      } else {
        setBatches([]);
      }

      if (!trainersRes.ok || !batchesRes.ok) {
        const trainerMessage =
          !trainersRes.ok
            ? trainersData?.detail || trainersData?.message || 'Unable to load trainer list.'
            : '';
        const batchMessage =
          !batchesRes.ok
            ? batchesData?.detail || batchesData?.message || 'Unable to load batch list.'
            : '';
        throw new Error([trainerMessage, batchMessage].filter(Boolean).join(' '));
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load report filters.';
      setStatus(message);
      console.error('Failed to load data:', error);
    }
  }, []);

  // Load report data based on scope
  const loadReport = useCallback(async () => {
    if ((reportScope === 'trainer' && !selectedTrainer) ||
        (reportScope === 'batch' && !selectedBatch)) {
      return;
    }

    setLoading(true);
    try {
      setStatus('');
      let url = '';
      if (reportScope === 'trainer') {
        url = `/api/admin/reports/trainer/${selectedTrainer}`;
      } else {
        url = `/api/admin/reports/batch/${selectedBatch}`;
      }

      const response = await fetch(url, {
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(
          await extractErrorMessage(response, 'Unable to load the selected report.'),
        );
      }

      const data = await response.json();
      if (reportScope === 'trainer') {
        setTrainerReport(data);
        setBatchReport(null);
      } else {
        setBatchReport(data);
        setTrainerReport(null);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load report.';
      setStatus(message);
      setTrainerReport(null);
      setBatchReport(null);
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  }, [reportScope, selectedTrainer, selectedBatch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedTrainer || selectedBatch) {
      loadReport();
    }
  }, [loadReport]);

  const summaryCards: SummaryCard[] = useMemo(() => {
    if (reportScope === 'trainer' && trainerReport) {
      return [
        {
          label: 'Total Batches',
          value: trainerReport.summary.total_batches.toString(),
          helper: 'Batches managed by this trainer'
        },
        {
          label: 'Total Trainees',
          value: trainerReport.summary.total_trainees.toString(),
          helper: 'Trainees across all batches'
        },
        {
          label: 'Avg Performance',
          value: `${trainerReport.summary.avg_batch_performance.toFixed(1)}%`,
          helper: 'Average score across all batches'
        },
        {
          label: 'Pass Rate',
          value: `${trainerReport.summary.pass_rate.toFixed(1)}%`,
          helper: 'Overall pass rate for trainees'
        }
      ];
    } else if (reportScope === 'batch' && batchReport) {
      return [
        {
          label: 'Total Trainees',
          value: batchReport.summary.total_trainees.toString(),
          helper: 'Trainees in this batch'
        },
        {
          label: 'Avg Performance',
          value: `${batchReport.summary.avg_performance.toFixed(1)}%`,
          helper: 'Average score for the batch'
        },
        {
          label: 'Pass Rate',
          value: `${batchReport.summary.pass_rate.toFixed(1)}%`,
          helper: 'Percentage of passed sessions'
        },
        {
          label: 'Completion Rate',
          value: `${batchReport.summary.completion_rate.toFixed(1)}%`,
          helper: 'Sessions completed vs assigned'
        }
      ];
    }
    return [];
  }, [reportScope, trainerReport, batchReport]);

  const handleDownloadPDF = async () => {
    try {
      setStatus('');
      let url = '';
      const params = new URLSearchParams();

      if (reportScope === 'trainer' && selectedTrainer) {
        url = `/api/admin/reports/trainer/${selectedTrainer}/pdf`;
        params.set('trainer_id', selectedTrainer);
      } else if (reportScope === 'batch' && selectedBatch) {
        url = `/api/admin/reports/batch/${selectedBatch}/pdf`;
        params.set('batch_id', selectedBatch);
      }

      const response = await fetch(`${url}?${params}`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error(
          await extractErrorMessage(response, 'Unable to download the selected PDF report.'),
        );
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${reportScope}_report_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to download PDF.';
      setStatus(message);
      console.error('Failed to download PDF:', error);
    }
  };

  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="text-muted-foreground">
              Performance reports by trainer or batch
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={loadReport}
              disabled={loading || (!selectedTrainer && !selectedBatch)}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button
              onClick={handleDownloadPDF}
              disabled={!trainerReport && !batchReport}
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>

        {status && (
          <Card className="border-rose-200 bg-rose-50">
            <CardContent className="p-4 text-sm text-rose-700">
              {status}
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Report Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Report Scope</label>
                <Select value={reportScope} onValueChange={(value: ReportScope) => {
                  setReportScope(value);
                  setSelectedTrainer('');
                  setSelectedBatch('');
                  setTrainerReport(null);
                  setBatchReport(null);
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trainer">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4" />
                        By Trainer
                      </div>
                    </SelectItem>
                    <SelectItem value="batch">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        By Batch
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {reportScope === 'trainer' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Trainer</label>
                  <Select value={selectedTrainer} onValueChange={setSelectedTrainer}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a trainer" />
                    </SelectTrigger>
                    <SelectContent>
                      {trainers.map((trainer) => (
                        <SelectItem key={trainer.id} value={trainer.id}>
                          {trainer.full_name} ({trainer.batches_count || 0} batches)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {reportScope === 'batch' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Batch</label>
                  <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a batch" />
                    </SelectTrigger>
                    <SelectContent>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.name} ({batch.users_count || 0} trainees)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {(trainerReport || batchReport) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryCards.map((card, index) => (
              <Card key={index}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {card.label}
                      </p>
                      <p className="text-2xl font-bold">{card.value}</p>
                      {card.helper && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {card.helper}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Report Content */}
        {loading && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">Loading report...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && (trainerReport || batchReport) && (
          <div className="space-y-6">
            {/* Graph View Selector */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChartIcon className="h-5 w-5" />
                  View Options
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {(['overview', 'progress', 'categories', 'performance', 'rankings'] as GraphView[]).map((view) => (
                    <Button
                      key={view}
                      variant={graphView === view ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setGraphView(view)}
                    >
                      {view.charAt(0).toUpperCase() + view.slice(1)}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Performance Trend */}
              {graphView === 'overview' && (trainerReport?.trends || batchReport?.trends) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Trend</CardTitle>
                    <CardDescription>
                      Score trends over time
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={trainerReport?.trends || batchReport?.trends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="avg_score"
                          stroke="#8884d8"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Category Performance */}
              {graphView === 'categories' && (trainerReport?.category_performance || batchReport?.category_performance) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Category Performance</CardTitle>
                    <CardDescription>
                      Average scores by assessment category
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={trainerReport?.category_performance || batchReport?.category_performance}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="category" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="average_score" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Batch Performance (for trainer reports) */}
              {graphView === 'performance' && trainerReport && (
                <Card>
                  <CardHeader>
                    <CardTitle>Batch Performance</CardTitle>
                    <CardDescription>
                      Performance across all batches managed by this trainer
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={trainerReport.batches}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="batch_name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="avg_performance" fill="#82ca9d" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Trainee Performance (for batch reports) */}
              {graphView === 'rankings' && batchReport && (
                <Card>
                  <CardHeader>
                    <CardTitle>Trainee Rankings</CardTitle>
                    <CardDescription>
                      Top performers in this batch
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {batchReport.trainee_performance
                        .slice()
                        .sort((a, b) => b.avg_score - a.avg_score)
                        .slice(0, 10)
                        .map((trainee, index) => (
                        <div key={trainee.trainee_id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant={index < 3 ? 'default' : 'secondary'}>
                              #{index + 1}
                            </Badge>
                            <div>
                              <p className="font-medium">{trainee.trainee_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {trainee.sessions_completed} sessions
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{trainee.avg_score.toFixed(1)}%</p>
                            <p className="text-sm text-muted-foreground">
                              {trainee.pass_rate.toFixed(1)}% pass rate
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !trainerReport && !batchReport && (
          <Card>
            <CardContent className="p-12">
              <div className="text-center">
                <FileBarChart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Report Selected</h3>
                <p className="text-muted-foreground">
                  Choose a trainer or batch to view performance reports
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
