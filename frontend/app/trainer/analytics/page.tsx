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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { trainerSidebarItems } from '@/app/trainer/nav';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    Download,
    RefreshCw,
    TrendingUp,
    Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart as RechartsPieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface Batch {
  id: string;
  name: string;
  wave_number?: number;
}

interface LiveAnalytics {
  active_simulations: number;
  completed_today: number;
  pass_rate: number;
  total_passed: number;
  total_failed: number;
  coaching_summary: {
    total_logs: number;
    pending_acknowledgement: number;
    acknowledged: number;
    draft_logs: number;
    competent: number;
    not_competent: number;
  };
  pass_fail_by_batch: {
    batch_id: string;
    batch_name: string;
    passed: number;
    failed: number;
    pass_rate: number;
  }[];
  top_failed_kpis: Record<string, number>;
}

interface BatchAnalytics {
  batch_id: string;
  batch_name: string;
  total_sessions: number;
  avg_score: number;
  pass_rate: number;
  retakes: number;
  total_attempts: number;
  coaching_summary: {
    total_logs: number;
    pending_acknowledgement: number;
    acknowledged: number;
    draft_logs: number;
    competent: number;
    not_competent: number;
  };
  top_failed_kpis: Record<string, number>;
  score_trends: BatchTrend[];
  ai_feedback_trends: BatchFeedbackTrend[];
  attempts_by_trainee: TraineeAttemptSummary[];
}

interface BatchTrend {
  date: string;
  avg_score: number;
  sessions: number;
}

interface BatchFeedbackTrend {
  date: string;
  grammar: number;
  pronunciation: number;
  pacing: number;
}

interface TraineeAttemptSummary {
  trainee_id: string;
  trainee_name: string;
  total_sessions: number;
  total_attempts: number;
  avg_score: number;
  latest_score: number;
  latest_pass_fail: boolean;
}

const COLORS = ['#10B981', '#EF4444', '#F59E0B', '#3B82F6'];

export default function TrainerAnalyticsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [liveAnalytics, setLiveAnalytics] = useState<LiveAnalytics | null>(null);
  const [batchAnalytics, setBatchAnalytics] = useState<BatchAnalytics | null>(null);
  const [batchTrends, setBatchTrends] = useState<BatchTrend[]>([]);
  const [feedbackTrends, setFeedbackTrends] = useState<BatchFeedbackTrend[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBatches = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/trainer/batches', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
        if (data.batches?.length > 0 && !selectedBatch) {
          setSelectedBatch(data.batches[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching batches:', error);
    }
  }, [selectedBatch]);

  const fetchLiveAnalytics = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/call-simulation/analytics/live', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLiveAnalytics(data);
      }
    } catch (error) {
      console.error('Error fetching live analytics:', error);
    }
  }, []);

  const fetchBatchAnalytics = useCallback(async (batchId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/call-simulation/analytics/batch/${batchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBatchAnalytics(data);
        setBatchTrends(data.score_trends || []);
        setFeedbackTrends(data.ai_feedback_trends || []);
      }
    } catch (error) {
      console.error('Error fetching batch analytics:', error);
    }
  }, []);

  const refreshData = async () => {
    setRefreshing(true);
    await Promise.all([fetchLiveAnalytics(), fetchBatches()]);
    setRefreshing(false);
  };

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchLiveAnalytics(), fetchBatches()]);
    };
    void loadData();
  }, [fetchBatches, fetchLiveAnalytics]);

  useEffect(() => {
    if (selectedBatch) {
      void fetchBatchAnalytics(selectedBatch);
    }
  }, [fetchBatchAnalytics, selectedBatch]);

  const passFailData = liveAnalytics ? [
    { name: 'Passed', value: liveAnalytics.total_passed },
    { name: 'Failed', value: liveAnalytics.total_failed },
  ] : [];

  const passFailByBatchData = liveAnalytics?.pass_fail_by_batch || [];

  const kpiFailureData = batchAnalytics ? [
    { name: 'Grammar', value: batchAnalytics.top_failed_kpis.grammar || 0 },
    { name: 'Pronunciation', value: batchAnalytics.top_failed_kpis.pronunciation || 0 },
    { name: 'Pacing', value: batchAnalytics.top_failed_kpis.pacing || 0 },
    { name: 'AHT', value: batchAnalytics.top_failed_kpis.aht || 0 },
  ] : [];

  const sidebarItems = trainerSidebarItems();

  return (
    <DashboardLayout sidebarItems={sidebarItems} userRole="trainer">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Analytics</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Track simulation performance and identify areas for improvement
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshData} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <Tabs defaultValue="live" className="space-y-4">
          <TabsList>
            <TabsTrigger value="live">Live Analytics</TabsTrigger>
            <TabsTrigger value="batch">Batch Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    Active Simulations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{liveAnalytics?.active_simulations ?? 0}</p>
                  <p className="text-xs text-muted-foreground">trainees in session</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Completed Today
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{liveAnalytics?.completed_today ?? 0}</p>
                  <p className="text-xs text-muted-foreground">sessions completed</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    Pass Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{liveAnalytics?.pass_rate ?? 0}%</p>
                  <p className="text-xs text-muted-foreground">overall</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <AlertTriangle className="h-4 w-4" />
                    Failed Sessions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{liveAnalytics?.total_failed ?? 0}</p>
                  <p className="text-xs text-muted-foreground">need coaching</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Pending Ack
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{liveAnalytics?.coaching_summary?.pending_acknowledgement ?? 0}</p>
                  <p className="text-xs text-muted-foreground">trainer coaching awaiting trainee acknowledgement</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Pass/Fail Distribution</CardTitle>
                  <CardDescription>Today's simulation results</CardDescription>
                </CardHeader>
                <CardContent>
                  {liveAnalytics && (liveAnalytics.total_passed + liveAnalytics.total_failed) > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <RechartsPieChart>
                        <Pie
                          data={passFailData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {passFailData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                      No data available yet
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Failed KPIs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Grammar</span>
                      <Badge variant="outline">
                        {liveAnalytics?.top_failed_kpis?.grammar ?? 0}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Pronunciation</span>
                      <Badge variant="outline">
                        {liveAnalytics?.top_failed_kpis?.pronunciation ?? 0}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Pacing</span>
                      <Badge variant="outline">
                        {liveAnalytics?.top_failed_kpis?.pacing ?? 0}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">AHT</span>
                      <Badge variant="outline">
                        {liveAnalytics?.top_failed_kpis?.aht ?? 0}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Pass/Fail by Batch</CardTitle>
                <CardDescription>Current trainer-visible performance by batch</CardDescription>
              </CardHeader>
              <CardContent>
                {passFailByBatchData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={passFailByBatchData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="batch_name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="passed" stackId="results" fill="#10B981" name="Passed" />
                      <Bar dataKey="failed" stackId="results" fill="#EF4444" name="Failed" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[320px] items-center justify-center text-muted-foreground">
                    No batch data available yet
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="batch" className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-64">
                <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.name} {batch.wave_number ? `(Wave ${batch.wave_number})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedBatch && batchAnalytics && (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Sessions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{batchAnalytics.total_sessions}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Average Score
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{batchAnalytics.avg_score}%</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Pending Coaching Ack
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{batchAnalytics.coaching_summary?.pending_acknowledgement ?? 0}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Pass Rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{batchAnalytics.pass_rate}%</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Attempts
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{batchAnalytics.total_attempts}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Score Trends</CardTitle>
                      <CardDescription>Average scores over the last 7 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={batchTrends}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis domain={[0, 100]} />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="avg_score"
                            stroke="#3B82F6"
                            strokeWidth={2}
                            name="Avg Score"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>AI Feedback Trends</CardTitle>
                      <CardDescription>Grammar, pronunciation, and pacing averages over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {feedbackTrends.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={feedbackTrends}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis domain={[0, 100]} />
                            <Tooltip />
                            <Line type="monotone" dataKey="grammar" stroke="#2563EB" strokeWidth={2} />
                            <Line type="monotone" dataKey="pronunciation" stroke="#10B981" strokeWidth={2} />
                            <Line type="monotone" dataKey="pacing" stroke="#F59E0B" strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                          No AI trend data yet
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Failed KPIs</CardTitle>
                      <CardDescription>KPI areas needing the most improvement</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(batchAnalytics.top_failed_kpis.grammar || 0) > 0 ||
                      (batchAnalytics.top_failed_kpis.pronunciation || 0) > 0 ||
                      (batchAnalytics.top_failed_kpis.pacing || 0) > 0 ||
                      (batchAnalytics.top_failed_kpis.aht || 0) > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={kpiFailureData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" fill="#EF4444" name="Failures" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                          No failures recorded
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Trainee Attempts</CardTitle>
                      <CardDescription>Retakes and latest scores by trainee</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {batchAnalytics.attempts_by_trainee.length > 0 ? (
                          batchAnalytics.attempts_by_trainee.map((item) => (
                            <div key={item.trainee_id} className="flex items-center justify-between rounded-lg border p-3">
                              <div>
                                <p className="font-medium">{item.trainee_name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {item.total_attempts} attempts across {item.total_sessions} sessions
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold">{item.latest_score}%</p>
                                <Badge variant={item.latest_pass_fail ? 'default' : 'destructive'}>
                                  {item.latest_pass_fail ? 'Passed' : 'Needs Retake'}
                                </Badge>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground">No trainee attempts recorded yet</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {!selectedBatch && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BarChart3 className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-lg font-medium">Select a batch to view reports</p>
                  <p className="text-sm text-muted-foreground">
                    Choose a batch from the dropdown above to see detailed analytics
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
