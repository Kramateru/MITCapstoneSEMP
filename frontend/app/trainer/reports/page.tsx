'use client';

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
import { trainerSidebarItems } from '@/app/trainer/nav';
import {
    Download,
    Filter,
    LineChart as LineChartIcon,
    Loader2,
    RefreshCw,
    TrendingUp,
    Users
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

type Batch = {
  id: string;
  name: string;
  wave_number?: number;
  users_count?: number;
  description?: string | null;
  lob?: string | null;
};

type TraineeBatchAssignment = {
  id: string;
  name: string;
  wave_number?: number;
  lob?: string | null;
};

type Trainee = {
  id: string;
  full_name: string;
  email: string;
  batch?: TraineeBatchAssignment | null;
  batches?: TraineeBatchAssignment[];
  batch_ids?: string[];
  batch_names?: string[];
};

type TrainerBatchListResponse = {
  count: number;
  batches: Batch[];
};

type TrainerTraineeListResponse = {
  count: number;
  trainees: Trainee[];
};

type ReportScope = 'batch' | 'trainee';
type GraphView = 'overview' | 'progress' | 'categories' | 'errors' | 'rankings' | 'sessions' | 'details';

type SummaryCard = {
  label: string;
  value: string;
  helper?: string;
};

type BatchImprovementCategory = {
  category: string;
  average: number;
  below_threshold_count: number;
  recommendation: string;
};

type TraineeWeakArea = {
  category: string;
  score: number;
  recommendation: string;
};

type BatchImprovementByTrainee = {
  trainee_id: string;
  trainee_name: string;
  weak_areas: TraineeWeakArea[];
  sessions_completed: number;
};

type BatchImprovementResponse = {
  batch_name: string;
  total_trainees: number;
  improvement_categories: BatchImprovementCategory[];
  improvement_by_trainee: BatchImprovementByTrainee[];
};

type CommonError = {
  error_type: string;
  frequency: number;
  examples: string[];
};

type BatchPronunciationResponse = {
  total_sessions: number;
  batch_name: string;
  wave_number?: number;
  common_errors: CommonError[];
  trainee_errors: Record<
    string,
    {
      trainee_id: string;
      sessions_count: number;
      avg_pronunciation: number;
      errors: string[];
    }
  >;
  average_pronunciation_score: number;
  trainees_below_threshold: {
    name: string;
    score: number;
    sessions: number;
  }[];
};

type BatchProgressResponse = {
  batch_name: string;
  weekly_trend: Array<{
    label?: string;
    avg_score?: number;
    attempts?: number;
  }>;
  category_trends: Record<string, Array<{ week: string; score: number }>>;
  trainee_progress: Array<{
    trainee_id: string;
    trainee_name: string;
    scores: Array<{ date: string; score: number }>;
  }>;
};

type MonthlyTraineeReport = {
  trainee_id: string;
  trainee_name: string;
  sessions_count: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  pass_sessions: number;
  category_averages: {
    pronunciation: number;
    pacing: number;
    clarity: number;
    grammar: number;
    soft_skills: number;
  };
};

type BatchMonthlyReportResponse = {
  batch_name: string;
  month: string;
  summary: {
    total_sessions: number;
    total_trainees: number;
    average_score: number;
    pass_rate: number;
    improvement_vs_last_month: number;
  };
  trainee_reports: MonthlyTraineeReport[];
};

type TraineeDetailedReportResponse = {
  trainee_id: string;
  trainee_name: string;
  trainee_email: string;
  report_generated: string;
  report_period?: string;
  assigned_batches?: TraineeBatchAssignment[];
  overall_metrics: {
    total_sessions: number;
    average_score: number;
    highest_score: number;
    lowest_score: number;
    pass_sessions: number;
    fail_sessions: number;
    pass_rate: number;
  };
  category_breakdown: Array<{
    category: string;
    average: number;
    highest: number;
    lowest: number;
  }>;
  progress_trend: string;
  recent_sessions: Array<{
    session_id: string;
    scenario: string;
    score: number;
    date: string;
    status: string;
  }>;
};

type FilterDataResponse = {
  metric_type: string;
  period: string;
  data_points: Array<{
    trainee_id?: string;
    trainee_name?: string;
    score: number;
    date: string;
    scenario: string;
    attempt?: number;
  }>;
  summary: {
    count: number;
    average: number;
  };
};

type CombinedReportData = {
  improvement: BatchImprovementResponse | null;
  pronunciation: BatchPronunciationResponse | null;
  progress: BatchProgressResponse | null;
  monthly: BatchMonthlyReportResponse | null;
  trainee: TraineeDetailedReportResponse | null;
  filterData: FilterDataResponse | null;
};

const BATCH_GRAPH_OPTIONS: Array<{ value: GraphView; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'progress', label: 'Progress Trends' },
  { value: 'categories', label: 'Skill Categories' },
  { value: 'errors', label: 'Pronunciation Errors' },
  { value: 'rankings', label: 'Trainee Rankings' },
];

const TRAINEE_GRAPH_OPTIONS: Array<{ value: GraphView; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'progress', label: 'Progress Trends' },
  { value: 'categories', label: 'Skill Categories' },
  { value: 'sessions', label: 'Session History' },
  { value: 'details', label: 'Detailed View' },
];

const METRIC_OPTIONS = [
  { value: 'overall', label: 'Overall' },
  { value: 'pronunciation', label: 'Pronunciation' },
  { value: 'grammar', label: 'Grammar' },
  { value: 'pacing', label: 'Pacing' },
  { value: 'clarity', label: 'Clarity' },
  { value: 'soft_skills', label: 'Soft Skills' },
];

const PIE_COLORS = ['#0ea5e9', '#6366f1', '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444'];

const TRAINEE_CATEGORY_RECOMMENDATIONS: Record<string, string> = {
  'Pronunciation (Accuracy)': 'Focus on articulation drills, stress patterns, and keyword enunciation.',
  'Pacing (Fluency)': 'Slow the delivery slightly and aim for smoother phrasing between ideas.',
  Clarity: 'Use shorter verification statements and clearer next-step explanations.',
  'Grammar & Keywords': 'Review grammar patterns and required knowledge keywords before the next session.',
  'Soft Skills': 'Strengthen empathy, ownership statements, and confidence during responses.',
};

function formatScore(value: number | null | undefined, suffix = '') {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return `0${suffix}`;
  }
  return `${value.toFixed(1)}${suffix}`;
}

function monthName(monthValue: string) {
  if (!monthValue) {
    return 'All Months';
  }
  const numericMonth = Number(monthValue);
  if (!numericMonth) {
    return 'All Months';
  }
  return new Date(new Date().getFullYear(), numericMonth - 1).toLocaleString('default', { month: 'long' });
}

function printableScopeLabel(
  reportType: ReportScope,
  selectedBatchName: string,
  selectedTraineeName: string,
  selectedMonth: string,
  selectedYear: string,
) {
  const scopeLabel = reportType === 'batch' ? selectedBatchName || 'Batch' : selectedTraineeName || 'Trainee';
  return `${scopeLabel} • ${monthName(selectedMonth)} ${selectedYear}`;
}

function scopeHeaderLabel(
  reportType: ReportScope,
  selectedBatchName: string,
  selectedTraineeName: string,
  selectedMonth: string,
  selectedYear: string,
) {
  return printableScopeLabel(
    reportType,
    selectedBatchName,
    selectedTraineeName,
    selectedMonth,
    selectedYear,
  ).replace('â€¢', '|');
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportScope>('batch');
  const [graphView, setGraphView] = useState<GraphView>('overview');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedTraineeId, setSelectedTraineeId] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('overall');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [reportData, setReportData] = useState<CombinedReportData>({
    improvement: null,
    pronunciation: null,
    progress: null,
    monthly: null,
    trainee: null,
    filterData: null,
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) || null,
    [batches, selectedBatchId],
  );
  const selectedTrainee = useMemo(
    () => trainees.find((trainee) => trainee.id === selectedTraineeId) || null,
    [trainees, selectedTraineeId],
  );
  const visibleGraphOptions = useMemo(
    () => (reportType === 'batch' ? BATCH_GRAPH_OPTIONS : TRAINEE_GRAPH_OPTIONS),
    [reportType],
  );
  const selectedBatchTrainees = useMemo(
    () =>
      trainees.filter((trainee) =>
        trainee.batch_ids?.includes(selectedBatchId) || trainee.batch?.id === selectedBatchId,
      ),
    [selectedBatchId, trainees],
  );
  const selectedTraineeBatchNames = useMemo(() => {
    const reportAssignedBatches = reportData.trainee?.assigned_batches?.length
      ? reportData.trainee.assigned_batches
      : null;
    const assignedBatches = reportAssignedBatches
      ? reportAssignedBatches
      : selectedTrainee?.batches?.length
        ? selectedTrainee.batches
        : selectedTrainee?.batch
        ? [selectedTrainee.batch]
        : [];

    return assignedBatches.map((batch) =>
      batch.wave_number ? `${batch.name} (Wave ${batch.wave_number})` : batch.name,
    );
  }, [reportData.trainee, selectedTrainee]);

  const fetchJson = useCallback(async <T,>(url: string): Promise<T> => {
    const token = window.localStorage.getItem('token');
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed for ${url}`);
    }

    return response.json() as Promise<T>;
  }, []);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        setInitialLoading(true);
        setError(null);

        const [batchData, traineeData] = await Promise.all([
          fetchJson<TrainerBatchListResponse>('/api/trainer/batches'),
          fetchJson<TrainerTraineeListResponse>('/api/trainer/trainees'),
        ]);

        const nextBatches = Array.isArray(batchData?.batches) ? batchData.batches : [];
        const nextTrainees = Array.isArray(traineeData?.trainees) ? traineeData.trainees : [];

        setBatches(nextBatches);
        setTrainees(nextTrainees);
        setSelectedBatchId((current) =>
          nextBatches.some((batch) => batch.id === current) ? current : nextBatches[0]?.id || '',
        );
        setSelectedTraineeId((current) =>
          nextTrainees.some((trainee) => trainee.id === current) ? current : nextTrainees[0]?.id || '',
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load report filters.');
      } finally {
        setInitialLoading(false);
      }
    };

    void loadFilters();
  }, [fetchJson]);

  useEffect(() => {
    if (visibleGraphOptions.some((option) => option.value === graphView)) {
      return;
    }
    setGraphView('overview');
  }, [graphView, visibleGraphOptions]);

  const generateReport = useCallback(async () => {
    try {
      setLoadingReport(true);
      setError(null);

      if (reportType === 'batch') {
        if (!selectedBatchId) {
          throw new Error('Select a batch first.');
        }

        const batchQuery = new URLSearchParams();
        if (selectedMonth && selectedMonth !== 'all') {
          batchQuery.set('month', selectedMonth);
        }
        if (selectedYear) {
          batchQuery.set('year', selectedYear);
        }

        const filterQuery = new URLSearchParams({
          report_type: 'batch',
          batch_id: selectedBatchId,
          metric_type: selectedMetric,
        });
        if (selectedMonth && selectedMonth !== 'all') {
          filterQuery.set('month', selectedMonth);
        }
        if (selectedYear) {
          filterQuery.set('year', selectedYear);
        }

        const [improvement, pronunciation, progress, monthly, filterData] = await Promise.all([
          fetchJson<BatchImprovementResponse>(
            `/api/analytics/reports/batch/${selectedBatchId}/improvement-areas`,
          ),
          fetchJson<BatchPronunciationResponse>(
            `/api/analytics/reports/batch/${selectedBatchId}/pronunciation-errors`,
          ),
          fetchJson<BatchProgressResponse>(`/api/analytics/reports/batch/${selectedBatchId}/progress-graphs`),
          fetchJson<BatchMonthlyReportResponse>(
            `/api/analytics/reports/batch/${selectedBatchId}/monthly-report${
              batchQuery.toString() ? `?${batchQuery.toString()}` : ''
            }`,
          ),
          fetchJson<FilterDataResponse>(`/api/analytics/reports/filter-data?${filterQuery.toString()}`),
        ]);

        setReportData({
          improvement,
          pronunciation,
          progress,
          monthly,
          trainee: null,
          filterData,
        });
        return;
      }

      if (!selectedTraineeId) {
        throw new Error('Select a trainee first.');
      }

      const filterQuery = new URLSearchParams({
        report_type: 'trainee',
        trainee_id: selectedTraineeId,
        metric_type: selectedMetric,
      });
      if (selectedMonth && selectedMonth !== 'all') {
        filterQuery.set('month', selectedMonth);
      }
      if (selectedYear) {
        filterQuery.set('year', selectedYear);
      }

      const traineeQuery = new URLSearchParams();
      if (selectedMonth && selectedMonth !== 'all') {
        traineeQuery.set('month', selectedMonth);
      }
      if (selectedYear) {
        traineeQuery.set('year', selectedYear);
      }

      const [trainee, filterData] = await Promise.all([
        fetchJson<TraineeDetailedReportResponse>(
          `/api/analytics/reports/trainee/${selectedTraineeId}/detailed-report${
            traineeQuery.toString() ? `?${traineeQuery.toString()}` : ''
          }`,
        ),
        fetchJson<FilterDataResponse>(`/api/analytics/reports/filter-data?${filterQuery.toString()}`),
      ]);

      setReportData({
        improvement: null,
        pronunciation: null,
        progress: null,
        monthly: null,
        trainee,
        filterData,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to generate report.');
    } finally {
      setLoadingReport(false);
    }
  }, [fetchJson, reportType, selectedBatchId, selectedMetric, selectedMonth, selectedTraineeId, selectedYear]);

  useEffect(() => {
    if (initialLoading) {
      return;
    }
    if (reportType === 'batch' && !selectedBatchId) {
      return;
    }
    if (reportType === 'trainee' && !selectedTraineeId) {
      return;
    }
    void generateReport();
  }, [generateReport, initialLoading, reportType, selectedBatchId, selectedTraineeId]);

  const summaryCards = useMemo<SummaryCard[]>(() => {
    if (reportType === 'batch') {
      const monthly = reportData.monthly;
      const pronunciation = reportData.pronunciation;
      if (!monthly || !pronunciation) {
        return [];
      }

      return [
        {
          label: 'Total Sessions',
          value: String(monthly.summary.total_sessions || 0),
          helper: `${monthly.summary.total_trainees || 0} trainees in scope`,
        },
        {
          label: 'Average Score',
          value: formatScore(monthly.summary.average_score),
          helper: `${formatScore(monthly.summary.pass_rate, '%')} pass rate`,
        },
        {
          label: 'Pronunciation',
          value: formatScore(pronunciation.average_pronunciation_score),
          helper: `${pronunciation.trainees_below_threshold.length} trainees below threshold`,
        },
        {
          label: 'Common Errors',
          value: String(pronunciation.common_errors.length || 0),
          helper: 'Auto-generated from recorded practice sessions',
        },
      ];
    }

    const trainee = reportData.trainee;
    const filterData = reportData.filterData;
    if (!trainee || !filterData) {
      return [];
    }

    return [
      {
        label: 'Total Sessions',
        value: String(trainee.overall_metrics.total_sessions || 0),
        helper: `${formatScore(trainee.overall_metrics.pass_rate, '%')} pass rate`,
      },
      {
        label: 'Average Score',
        value: formatScore(trainee.overall_metrics.average_score),
        helper: `Highest ${formatScore(trainee.overall_metrics.highest_score)}`,
      },
      {
        label: 'Trend',
        value: trainee.progress_trend || 'stable',
        helper: `Metric avg ${formatScore(filterData.summary.average)}`,
      },
      {
        label: 'Failures',
        value: String(trainee.overall_metrics.fail_sessions || 0),
        helper: `${filterData.summary.count || 0} filtered data points`,
      },
    ];
  }, [reportData.filterData, reportData.monthly, reportData.pronunciation, reportData.trainee, reportType]);

  const skillCategoryChart = useMemo(() => {
    if (reportType === 'batch' && reportData.improvement) {
      return reportData.improvement.improvement_categories.map((category) => ({
        name: category.category,
        score: category.average,
        traineesBelow: category.below_threshold_count,
      }));
    }

    if (reportType === 'trainee' && reportData.trainee) {
      return reportData.trainee.category_breakdown.map((category) => ({
        name: category.category,
        score: category.average,
        high: category.highest,
        low: category.lowest,
      }));
    }

    return [];
  }, [reportData.improvement, reportData.trainee, reportType]);

  const progressChartData = useMemo(() => {
    if (reportType === 'batch' && reportData.progress) {
      return reportData.progress.weekly_trend.map((item) => ({
        label: item.label || '',
        avg_score: item.avg_score || 0,
        attempts: item.attempts || 0,
      }));
    }

    if (reportType === 'trainee' && reportData.filterData) {
      return reportData.filterData.data_points.map((point, index) => ({
        label: point.date ? new Date(point.date).toLocaleDateString() : `Point ${index + 1}`,
        score: point.score || 0,
      }));
    }

    return [];
  }, [reportData.filterData, reportData.progress, reportType]);

  const pronunciationErrorChart = useMemo(() => {
    if (!reportData.pronunciation) {
      return [];
    }

    return reportData.pronunciation.common_errors.slice(0, 6).map((item) => ({
      name: item.error_type,
      value: item.frequency,
    }));
  }, [reportData.pronunciation]);

  const rankingRows = useMemo(() => {
    if (reportType === 'batch' && reportData.monthly) {
      return reportData.monthly.trainee_reports;
    }
    return [];
  }, [reportData.monthly, reportType]);

  const traineeWeakAreas = useMemo(() => {
    if (!reportData.trainee) {
      return [];
    }

    return reportData.trainee.category_breakdown
      .filter((category) => category.average < 70)
      .map((category) => ({
        category: category.category,
        score: category.average,
        recommendation:
          TRAINEE_CATEGORY_RECOMMENDATIONS[category.category] ||
          'Continue targeted practice sessions and review trainer coaching notes.',
      }))
      .sort((left, right) => left.score - right.score);
  }, [reportData.trainee]);

  const activeGraphLabel = useMemo(
    () => visibleGraphOptions.find((item) => item.value === graphView)?.label || graphView,
    [graphView, visibleGraphOptions],
  );

  const hasReportContent = useMemo(() => {
    return Boolean(
      reportData.improvement ||
        reportData.pronunciation ||
        reportData.progress ||
        reportData.monthly ||
        reportData.trainee ||
        reportData.filterData,
    );
  }, [reportData]);

  const handleDownloadPdf = useCallback(async () => {
    if (!hasReportContent) {
      return;
    }

    try {
      setDownloadingPdf(true);
      setError(null);

      const token = window.localStorage.getItem('token');
      const query = new URLSearchParams({
        scope: reportType,
        metric_type: selectedMetric,
      });

      if (reportType === 'batch') {
        if (!selectedBatchId) {
          throw new Error('Select a batch first.');
        }
        query.set('batch_id', selectedBatchId);
      } else {
        if (!selectedTraineeId) {
          throw new Error('Select a trainee first.');
        }
        query.set('trainee_id', selectedTraineeId);
      }

      if (selectedMonth && selectedMonth !== 'all') {
        query.set('month', selectedMonth);
      }
      if (selectedYear) {
        query.set('year', selectedYear);
      }

      const response = await fetch(`/api/export/trainer-report-pdf?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Unable to download the PDF report.');
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      const fallbackFilename =
        reportType === 'batch'
          ? `Progress Report (Batch - ${selectedBatch?.name || 'Batch'}).pdf`
          : `Progress Report (Specific Trainee - ${selectedTrainee?.full_name || 'Trainee'}).pdf`;
      anchor.href = objectUrl;
      anchor.download = filenameMatch?.[1] || fallbackFilename;
      anchor.click();
      window.URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to download the PDF report.');
    } finally {
      setDownloadingPdf(false);
    }
  }, [hasReportContent, reportType, selectedBatch?.name, selectedBatchId, selectedMetric, selectedMonth, selectedTrainee?.full_name, selectedTraineeId, selectedYear]);

  return (
    <DashboardLayout sidebarItems={trainerSidebarItems(0)} userRole="trainer">
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          #trainer-report-print {
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="space-y-8" id="trainer-report-print">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-gradient-to-r from-sky-50 to-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700">
              <TrendingUp className="size-4" />
              Trainer Report Center
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Report</h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Generate instant pronunciation summaries, improvement plans, progress graphs, monthly performance
              reports, and print-ready analytics for each trainee or batch/wave. Data is sourced from the backend
              analytics APIs and your configured database connection.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{card.value}</div>
                <div className="mt-1 text-xs text-slate-500">{card.helper}</div>
              </div>
            ))}
          </div>
        </div>

        <Card className="no-print">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="size-5" />
              Analytics Filters
            </CardTitle>
            <CardDescription>
              Filter the trainer analytics view to show the exact graph or report data you need.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Scope</label>
                <Select value={reportType} onValueChange={(value: ReportScope) => setReportType(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="batch">Batch / Wave</SelectItem>
                    <SelectItem value="trainee">Per Trainee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {reportType === 'batch' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Batch / Wave</label>
                  <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select batch" />
                    </SelectTrigger>
                    <SelectContent>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.name}
                          {batch.wave_number ? ` (Wave ${batch.wave_number})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Trainee</label>
                  <Select value={selectedTraineeId} onValueChange={setSelectedTraineeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select trainee" />
                    </SelectTrigger>
                    <SelectContent>
                      {trainees.map((trainee) => (
                        <SelectItem key={trainee.id} value={trainee.id}>
                          {trainee.full_name}
                          {trainee.batch_names?.length ? ` - ${trainee.batch_names.join(', ')}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Graph / Data View</label>
                <Select value={graphView} onValueChange={(value: GraphView) => setGraphView(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select graph" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleGraphOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Metric</label>
                <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {METRIC_OPTIONS.map((metric) => (
                      <SelectItem key={metric.value} value={metric.value}>
                        {metric.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Month</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Months" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                      <SelectItem key={month} value={String(month)}>
                        {new Date(2025, month - 1).toLocaleString('default', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Year</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, index) => String(new Date().getFullYear() - index)).map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void generateReport()} disabled={loadingReport || initialLoading}>
                {loadingReport ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                Refresh Report
              </Button>
              <Button variant="outline" onClick={() => void handleDownloadPdf()} disabled={!hasReportContent || downloadingPdf}>
                {downloadingPdf ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
                Download PDF
              </Button>
            </div>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          </CardContent>
        </Card>

        {initialLoading ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-10 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading trainer report configuration...
            </CardContent>
          </Card>
        ) : null}

        {hasReportContent ? (
          <div className="space-y-6">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-5 text-sky-600" />
                  Active Scope
                </CardTitle>
                <CardDescription>
                  {scopeHeaderLabel(
                    reportType,
                    selectedBatch?.name || 'Batch',
                    selectedTrainee?.full_name || 'Trainee',
                    selectedMonth === 'all' ? '' : selectedMonth,
                    selectedYear,
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="secondary">{reportType === 'batch' ? 'Batch / Wave' : 'Per Trainee'}</Badge>
                <Badge variant="outline">{activeGraphLabel}</Badge>
                <Badge variant="outline">{METRIC_OPTIONS.find((item) => item.value === selectedMetric)?.label || selectedMetric}</Badge>
                <Badge variant="outline">
                  {selectedMonth === 'all' || !selectedMonth ? 'All Months' : monthName(selectedMonth)} {selectedYear}
                </Badge>
                {reportType === 'batch' ? (
                  <Badge variant="outline">{selectedBatchTrainees.length} assigned trainee{selectedBatchTrainees.length === 1 ? '' : 's'}</Badge>
                ) : (
                  <Badge variant="outline">
                    {selectedTraineeBatchNames.length
                      ? `${selectedTraineeBatchNames.length} assigned batch/wave${selectedTraineeBatchNames.length === 1 ? '' : 's'}`
                      : 'No assigned batch / wave'}
                  </Badge>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{reportType === 'batch' ? 'Assigned Trainees' : 'Assigned Batch / Wave'}</CardTitle>
                <CardDescription>
                  {reportType === 'batch'
                    ? 'Only trainees assigned to your selected batch / wave are included in this report.'
                    : 'This trainee report is limited to the batch / wave assignments under your trainer account.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportType === 'batch' ? (
                  selectedBatchTrainees.length ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {selectedBatchTrainees.map((trainee) => (
                        <div key={trainee.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="font-semibold text-slate-900">{trainee.full_name}</div>
                          <div className="mt-1 text-sm text-slate-600">{trainee.email}</div>
                          <div className="mt-2 text-xs text-slate-500">
                            {trainee.batch_names?.length ? trainee.batch_names.join(', ') : 'Assigned to this trainer'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                      No trainees are currently assigned to this batch / wave under your trainer account.
                    </div>
                  )
                ) : selectedTrainee ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="font-semibold text-slate-900">{selectedTrainee.full_name}</div>
                      <div className="mt-1 text-sm text-slate-600">{selectedTrainee.email}</div>
                    </div>
                    {selectedTraineeBatchNames.length ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedTraineeBatchNames.map((batchName) => (
                          <Badge key={batchName} variant="outline">
                            {batchName}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                        This trainee does not have an assigned batch / wave in your trainer roster yet.
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {(graphView === 'overview' || graphView === 'progress') && progressChartData.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LineChartIcon className="size-5 text-sky-600" />
                    {reportType === 'batch' ? 'Batch Improvement Trend' : 'Trainee Progress Trend'}
                  </CardTitle>
                  <CardDescription>
                    Progress graphs make it easy to track trainee improvement trends over time.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      {reportType === 'batch' ? (
                        <AreaChart data={progressChartData}>
                          <defs>
                            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Area type="monotone" dataKey="avg_score" stroke="#0ea5e9" fill="url(#scoreFill)" name="Average Score" />
                          <Line type="monotone" dataKey="attempts" stroke="#6366f1" name="Attempts" />
                        </AreaChart>
                      ) : (
                        <LineChart data={progressChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" minTickGap={20} />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="score" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4 }} name="Score" />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {(graphView === 'overview' || graphView === 'categories') && skillCategoryChart.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Skill Category Performance</CardTitle>
                  <CardDescription>
                    Improvement needs for grammar, pronunciation, pacing, clarity, and other key communication skills.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={skillCategoryChart}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-10} textAnchor="end" height={70} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="score" fill="#0ea5e9" radius={[8, 8, 0, 0]} name="Average Score" />
                        {reportType === 'batch' ? (
                          <Bar dataKey="traineesBelow" fill="#f59e0b" radius={[8, 8, 0, 0]} name="Below Threshold" />
                        ) : null}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {reportType === 'batch' && (graphView === 'overview' || graphView === 'errors') && pronunciationErrorChart.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Common Pronunciation Errors</CardTitle>
                  <CardDescription>
                    Instant batch-level summary of pronunciation errors with no manual tallying required.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pronunciationErrorChart} dataKey="value" nameKey="name" outerRadius={110} label>
                          {pronunciationErrorChart.map((entry, index) => (
                            <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {reportData.pronunciation?.common_errors.slice(0, 6).map((errorItem) => (
                      <div key={errorItem.error_type} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-900">{errorItem.error_type}</div>
                          <Badge variant="secondary">{errorItem.frequency} hits</Badge>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">
                          Examples: {errorItem.examples.length ? errorItem.examples.join(', ') : 'No sample words'}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {reportType === 'batch' && (graphView === 'overview' || graphView === 'rankings') && rankingRows.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Performance by Trainee</CardTitle>
                  <CardDescription>
                    Monthly performance reports per trainee or batch/wave, ready for review and printing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Trainee</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Sessions</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Average</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Highest</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Passed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {rankingRows.map((row) => (
                          <tr key={row.trainee_id}>
                            <td className="px-4 py-3 font-medium text-slate-900">{row.trainee_name}</td>
                            <td className="px-4 py-3 text-center">{row.sessions_count}</td>
                            <td className="px-4 py-3 text-center">{formatScore(row.average_score)}</td>
                            <td className="px-4 py-3 text-center">{formatScore(row.highest_score)}</td>
                            <td className="px-4 py-3 text-center">{row.pass_sessions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {reportData.improvement?.improvement_by_trainee?.length ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {reportData.improvement.improvement_by_trainee.slice(0, 6).map((traineeItem) => (
                        <div key={traineeItem.trainee_id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">{traineeItem.trainee_name}</div>
                              <div className="text-xs text-slate-500">
                                {traineeItem.sessions_completed} completed sessions
                              </div>
                            </div>
                            <Badge variant="outline">
                              {traineeItem.weak_areas.length} need{traineeItem.weak_areas.length === 1 ? '' : 's'}
                            </Badge>
                          </div>

                          <div className="mt-3 space-y-2">
                            {traineeItem.weak_areas.length ? (
                              traineeItem.weak_areas.map((weakArea) => (
                                <div key={`${traineeItem.trainee_id}-${weakArea.category}`} className="rounded-xl bg-slate-50 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium text-slate-900">{weakArea.category}</div>
                                    <div className="text-sm font-semibold text-amber-600">{formatScore(weakArea.score)}</div>
                                  </div>
                                  <div className="mt-1 text-xs text-slate-600">{weakArea.recommendation}</div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                                No weak areas detected for the selected period.
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {reportType === 'trainee' && reportData.trainee && (graphView === 'overview' || graphView === 'details') ? (
              <Card>
                <CardHeader>
                  <CardTitle>Per-Trainee Detailed Report</CardTitle>
                  <CardDescription>
                    Individual improvement needs, score ranges, and the report period currently selected by the trainer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-sm font-medium text-slate-700">Total Sessions</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">
                        {reportData.trainee.overall_metrics.total_sessions}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-sm font-medium text-slate-700">Passed Sessions</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">
                        {reportData.trainee.overall_metrics.pass_sessions}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-sm font-medium text-slate-700">Failed Sessions</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">
                        {reportData.trainee.overall_metrics.fail_sessions}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-sm font-medium text-slate-700">Highest Score</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">
                        {formatScore(reportData.trainee.overall_metrics.highest_score)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-sm font-medium text-slate-700">Lowest Score</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">
                        {formatScore(reportData.trainee.overall_metrics.lowest_score)}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {reportData.trainee.category_breakdown.map((category) => (
                        <div key={category.category} className="rounded-2xl border border-slate-200 p-4">
                          <div className="text-sm font-medium text-slate-700">{category.category}</div>
                          <div className="mt-2 text-2xl font-bold text-slate-900">{formatScore(category.average)}</div>
                          <div className="mt-2 text-xs text-slate-500">
                            High {formatScore(category.highest)} | Low {formatScore(category.lowest)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-medium text-slate-700">Report Period</div>
                        <div className="mt-1 text-sm text-slate-900">
                          {reportData.trainee.report_period || `${monthName(selectedMonth === 'all' ? '' : selectedMonth)} ${selectedYear}`}
                        </div>
                      </div>

                      {traineeWeakAreas.length ? (
                        traineeWeakAreas.map((weakArea) => (
                          <div key={weakArea.category} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-slate-900">{weakArea.category}</div>
                              <div className="text-sm font-semibold text-amber-700">{formatScore(weakArea.score)}</div>
                            </div>
                            <div className="mt-2 text-sm text-slate-600">{weakArea.recommendation}</div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                          No weak areas are below the current coaching threshold for the selected period.
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {reportType === 'trainee' && reportData.trainee && (graphView === 'overview' || graphView === 'sessions' || graphView === 'details') ? (
              <Card>
                <CardHeader>
                  <CardTitle>Recent Sessions</CardTitle>
                  <CardDescription>
                    Recent trainee attempts captured from the current database-backed reporting period.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {reportData.trainee.recent_sessions.length ? (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Scenario</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Score</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Date</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {reportData.trainee.recent_sessions.map((session) => (
                            <tr key={session.session_id}>
                              <td className="px-4 py-3 font-medium text-slate-900">{session.scenario}</td>
                              <td className="px-4 py-3 text-center">{formatScore(session.score)}</td>
                              <td className="px-4 py-3 text-center">
                                {session.date ? new Date(session.date).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge variant={session.status === 'Passed' ? 'default' : 'destructive'}>
                                  {session.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                      No saved sessions were found for this trainee in the selected period.
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {false && reportType === 'trainee' && reportData.trainee ? (
              <Card>
                <CardHeader>
                  <CardTitle>Per-Trainee Detailed Report</CardTitle>
                  <CardDescription>
                    Individual improvement needs, category breakdowns, and recent session performance.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    {reportData.trainee!.category_breakdown.map((category) => (
                      <div key={category.category} className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-sm font-medium text-slate-700">{category.category}</div>
                        <div className="mt-2 text-2xl font-bold text-slate-900">{formatScore(category.average)}</div>
                        <div className="mt-2 text-xs text-slate-500">
                          High {formatScore(category.highest)} • Low {formatScore(category.lowest)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Scenario</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Score</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Date</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {reportData.trainee!.recent_sessions.map((session) => (
                          <tr key={session.session_id}>
                            <td className="px-4 py-3 font-medium text-slate-900">{session.scenario}</td>
                            <td className="px-4 py-3 text-center">{formatScore(session.score)}</td>
                            <td className="px-4 py-3 text-center">
                              {session.date ? new Date(session.date).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant={session.status === 'Passed' ? 'default' : 'destructive'}>
                                {session.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {reportData.filterData?.data_points?.length &&
            (graphView === 'overview' || graphView === 'progress' || graphView === 'sessions' || graphView === 'details') ? (
              <Card>
                <CardHeader>
                  <CardTitle>Filtered Analytics Data</CardTitle>
                  <CardDescription>
                    Specific graph/data display filtered by scope, month, year, and selected skill metric.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                          {reportType === 'batch' ? (
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Trainee</th>
                          ) : null}
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Scenario</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {reportData.filterData.data_points.slice(0, 20).map((point, index) => (
                          <tr key={`${point.date}-${index}`}>
                            <td className="px-4 py-3">{point.date ? new Date(point.date).toLocaleDateString() : '—'}</td>
                            {reportType === 'batch' ? (
                              <td className="px-4 py-3">{point.trainee_name || 'Unknown trainee'}</td>
                            ) : null}
                            <td className="px-4 py-3">{point.scenario || 'Unknown scenario'}</td>
                            <td className="px-4 py-3 text-center font-semibold text-slate-900">{formatScore(point.score)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
