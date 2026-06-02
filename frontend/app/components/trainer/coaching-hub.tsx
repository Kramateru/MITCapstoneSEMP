'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  Clock3,
  FileText,
  MessageSquare,
  RefreshCw,
  Save,
  Send,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/app/context/AuthContext';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';

type CoachingTab = 'hub' | 'logs';
type DeliveryStatus = 'draft' | 'sent' | 'acknowledged';
type CompetencyStatus = 'pending' | 'competent' | 'not_competent';

type HubSummary = {
  completed_categories: number;
  ready_for_coaching: number;
  pending_acknowledgement: number;
  acknowledged: number;
  competent: number;
  not_competent: number;
};

type HubBatch = {
  id: string;
  name: string;
  wave_number?: number | null;
  lob?: string | null;
};

type HubTrainee = {
  id: string;
  full_name: string;
  email: string;
  batch_id?: string | null;
  batch_name?: string | null;
  wave_number?: number | null;
};

type CoachingScores = {
  accuracy?: number | null;
  fluency?: number | null;
  clarity?: number | null;
  keyword_adherence?: number | null;
  soft_skills?: number | null;
};

type CoachingLogRecord = {
  id: string;
  coaching_id: string;
  practice_session_id?: string | null;
  sim_session_id?: string | null;
  source_type?: string | null;
  scenario_id?: string | null;
  scenario_title?: string | null;
  trainer_id: string;
  trainer_name?: string | null;
  trainee_id: string;
  trainee_name?: string | null;
  trainee_email?: string | null;
  batch_name?: string | null;
  lob?: string | null;
  coaching_minutes?: number | null;
  strengths?: string | null;
  opportunities?: string | null;
  action_plan?: string | null;
  target_date?: string | null;
  status: DeliveryStatus;
  competency_status: CompetencyStatus;
  trainer_remarks?: string | null;
  acknowledged_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  audio_file_url?: string | null;
  transcription?: string | null;
  transcription_confidence?: number | null;
  attempt_number?: number | null;
  overall_score?: number | null;
  response_duration?: number | null;
  scores?: CoachingScores;
  requires_retake?: boolean;
  is_competent?: boolean;
};

type TrainingState = {
  code: string;
  label: string;
  summary: string;
  can_practice: boolean;
  is_locked: boolean;
  requires_acknowledgement: boolean;
};

type CompletedCategory = {
  trainee_id: string;
  trainee_name?: string | null;
  trainee_email?: string | null;
  batch_id?: string | null;
  batch_name?: string | null;
  wave_number?: number | null;
  scenario_id: string;
  scenario_title?: string | null;
  practice_session_id?: string | null;
  sim_session_id?: string | null;
  audio_file_url?: string | null;
  transcription?: string | null;
  transcription_confidence?: number | null;
  overall_score?: number | null;
  scores?: CoachingScores;
  attempt_number?: number | null;
  created_at?: string | null;
  status?: string | null;
  is_verified?: boolean;
  latest_coaching_log?: CoachingLogRecord | null;
  training_state: TrainingState;
};

type CoachingHubResponse = {
  summary?: HubSummary;
  batches: HubBatch[];
  trainees: HubTrainee[];
  completed_categories: CompletedCategory[];
  recent_logs?: CoachingLogRecord[];
};

type CoachingLogsResponse = {
  logs: CoachingLogRecord[];
};

type CoachingFormState = {
  strengths: string;
  opportunities: string;
  actionPlan: string;
  targetDate: string;
  coachingMinutes: number;
  trainerRemarks: string;
  competencyStatus: CompetencyStatus;
};

function buildDefaultFormState(): CoachingFormState {
  const target = new Date();
  target.setDate(target.getDate() + 2);
  return {
    strengths: '',
    opportunities: '',
    actionPlan: '',
    targetDate: target.toISOString().slice(0, 10),
    coachingMinutes: 30,
    trainerRemarks: '',
    competencyStatus: 'pending',
  };
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not set';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return 'Not set';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function formatPercent(value?: number | null) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : 'Not available';
}

function trainingStateTone(code: string) {
  if (code === 'competent') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (code === 'needs_retake') return 'bg-rose-100 text-rose-800 border-rose-200';
  if (code === 'pending_acknowledgement')
    return 'bg-amber-100 text-amber-800 border-amber-200';
  if (code === 'acknowledged') return 'bg-sky-100 text-sky-800 border-sky-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function deliveryBadgeTone(status: DeliveryStatus) {
  if (status === 'acknowledged') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'sent') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function competencyBadgeTone(status: CompetencyStatus) {
  if (status === 'competent') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'not_competent') return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function verdictLabel(status: CompetencyStatus) {
  if (status === 'not_competent') {
    return 'Not Competent';
  }
  if (status === 'competent') {
    return 'Competent';
  }
  return 'Pending';
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{value}</div>
        </div>
        <div className="rounded-full bg-muted p-3 text-primary">{icon}</div>
      </CardContent>
    </Card>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function DetailBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone || ''}`}>
      <div className="mb-2 text-sm font-semibold text-foreground">{label}</div>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{value}</p>
    </div>
  );
}

function getCategorySessionId(category: CompletedCategory) {
  return category.sim_session_id || category.practice_session_id || '';
}

export default function TrainerCoachingHub({
  defaultTab = 'hub',
}: {
  defaultTab?: CoachingTab;
}) {
  const { token, isLoading: isAuthLoading, isAuthenticated, refreshToken, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<CoachingTab>(defaultTab);
  const [hubData, setHubData] = useState<CoachingHubResponse>({
    summary: {
      completed_categories: 0,
      ready_for_coaching: 0,
      pending_acknowledgement: 0,
      acknowledged: 0,
      competent: 0,
      not_competent: 0,
    },
    batches: [],
    trainees: [],
    completed_categories: [],
    recent_logs: [],
  });
  const [logs, setLogs] = useState<CoachingLogRecord[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('all');
  const [selectedTraineeId, setSelectedTraineeId] = useState('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedLog, setSelectedLog] = useState<CoachingLogRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [competencyFilter, setCompetencyFilter] = useState('all');
  const [formState, setFormState] = useState<CoachingFormState>(() => buildDefaultFormState());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');

  const fetchWithAuthRetry = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const sendRequest = async (authToken: string | null) => {
        const nextHeaders = new Headers(init?.headers || undefined);
        if (authToken || token) {
          nextHeaders.set('Authorization', `Bearer ${authToken || token}`);
        }
        return fetch(input, {
          ...init,
          headers: nextHeaders,
          cache: 'no-store',
        });
      };

      let response = await sendRequest(token);
      if (response.status !== 401) {
        return response;
      }

      const nextToken = await refreshToken();
      if (!nextToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      response = await sendRequest(nextToken);
      if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please sign in again.');
      }

      return response;
    },
    [logout, refreshToken, token],
  );

  const loadData = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (isAuthLoading) {
        return;
      }

      if (!isAuthenticated || !token) {
        setHubData({
          summary: {
            completed_categories: 0,
            ready_for_coaching: 0,
            pending_acknowledgement: 0,
            acknowledged: 0,
            competent: 0,
            not_competent: 0,
          },
          batches: [],
          trainees: [],
          completed_categories: [],
          recent_logs: [],
        });
        setLogs([]);
        setLoadError('');
        setIsLoading(false);
        return;
      }

      if (mode === 'initial') {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setLoadError('');

      try {
        const [hubRes, logsRes] = await Promise.all([
          fetchWithAuthRetry('/api/certification/coaching/hub'),
          fetchWithAuthRetry('/api/certification/coaching/logs'),
        ]);

        const [hubPayload, logsPayload] = await Promise.all([
          hubRes.json().catch(() => null) as Promise<CoachingHubResponse | null>,
          logsRes.json().catch(() => null) as Promise<CoachingLogsResponse | null>,
        ]);

        if (!hubRes.ok) {
          throw new Error(
            (hubPayload as { detail?: string } | null)?.detail ||
              'Unable to load the coaching hub.',
          );
        }
        if (!logsRes.ok) {
          throw new Error(
            (logsPayload as { detail?: string } | null)?.detail ||
              'Unable to load coaching logs.',
          );
        }

        setHubData({
          summary: hubPayload?.summary || {
            completed_categories: 0,
            ready_for_coaching: 0,
            pending_acknowledgement: 0,
            acknowledged: 0,
            competent: 0,
            not_competent: 0,
          },
          batches: hubPayload?.batches || [],
          trainees: hubPayload?.trainees || [],
          completed_categories: hubPayload?.completed_categories || [],
          recent_logs: hubPayload?.recent_logs || [],
        });
        setLogs(logsPayload?.logs || []);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load coaching data.';
        setLoadError(message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [fetchWithAuthRetry, isAuthLoading, isAuthenticated, token],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredTrainees = useMemo(() => {
    if (selectedBatchId === 'all') {
      return hubData.trainees;
    }
    return hubData.trainees.filter((trainee) => trainee.batch_id === selectedBatchId);
  }, [hubData.trainees, selectedBatchId]);

  useEffect(() => {
    if (
      selectedTraineeId !== 'all' &&
      !filteredTrainees.some((trainee) => trainee.id === selectedTraineeId)
    ) {
      setSelectedTraineeId('all');
    }
  }, [filteredTrainees, selectedTraineeId]);

  const selectedBatchName = useMemo(
    () => hubData.batches.find((batch) => batch.id === selectedBatchId)?.name || '',
    [hubData.batches, selectedBatchId],
  );

  const filteredCategories = useMemo(() => {
    return hubData.completed_categories.filter((category) => {
      if (selectedBatchId !== 'all' && category.batch_id !== selectedBatchId) {
        return false;
      }
      if (selectedTraineeId !== 'all' && category.trainee_id !== selectedTraineeId) {
        return false;
      }
      return true;
    });
  }, [hubData.completed_categories, selectedBatchId, selectedTraineeId]);

  useEffect(() => {
    if (!filteredCategories.length) {
      setSelectedCategoryId('');
      return;
    }

    if (!filteredCategories.some((item) => getCategorySessionId(item) === selectedCategoryId)) {
      setSelectedCategoryId(getCategorySessionId(filteredCategories[0]));
    }
  }, [filteredCategories, selectedCategoryId]);

  const selectedCategory = useMemo(
    () =>
      filteredCategories.find((item) => getCategorySessionId(item) === selectedCategoryId) || null,
    [filteredCategories, selectedCategoryId],
  );

  useEffect(() => {
    setFormState(buildDefaultFormState());
  }, [selectedCategoryId]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedBatchId !== 'all' && log.batch_name !== selectedBatchName) {
        return false;
      }
      if (selectedTraineeId !== 'all' && log.trainee_id !== selectedTraineeId) {
        return false;
      }

      const haystack = [
        log.coaching_id,
        log.trainee_name || '',
        log.trainee_email || '',
        log.scenario_title || '',
        log.strengths || '',
      ]
        .join(' ')
        .toLowerCase();

      return (
        haystack.includes(searchTerm.toLowerCase()) &&
        (statusFilter === 'all' || log.status === statusFilter) &&
        (competencyFilter === 'all' || log.competency_status === competencyFilter)
      );
    });
  }, [
    competencyFilter,
    logs,
    searchTerm,
    selectedBatchId,
    selectedBatchName,
    selectedTraineeId,
    statusFilter,
  ]);

  const relatedLogs = useMemo(() => {
    if (!selectedCategory) {
      return [];
    }
    return logs
      .filter(
        (log) =>
          log.trainee_id === selectedCategory.trainee_id &&
          log.scenario_id === selectedCategory.scenario_id,
      )
      .sort(
        (left, right) =>
          new Date(right.created_at || '').getTime() -
          new Date(left.created_at || '').getTime(),
      );
  }, [logs, selectedCategory]);

  const summary = useMemo(() => {
    return {
      completedCategories: filteredCategories.length,
      readyForCoaching: filteredCategories.filter(
        (category) => category.training_state.code === 'awaiting_coaching',
      ).length,
      pendingAcknowledgement: filteredLogs.filter((log) => log.status === 'sent').length,
      acknowledged: filteredLogs.filter((log) => log.status === 'acknowledged').length,
      competent: filteredLogs.filter((log) => log.competency_status === 'competent').length,
      notCompetent: filteredLogs.filter((log) => log.competency_status === 'not_competent')
        .length,
    };
  }, [filteredCategories, filteredLogs]);

  const selectedCategoryIsLocked = !!selectedCategory?.training_state.is_locked;

  const submitCoachingLog = async (publish: boolean) => {
    if (!selectedCategory) {
      toast.error('Choose a finished mock call before creating a coaching log.');
      return;
    }

    if (publish && formState.competencyStatus === 'pending') {
      toast.error('Choose whether the trainee is competent or not competent.');
      return;
    }

    if (
      publish &&
      (!formState.strengths ||
        !formState.opportunities ||
        !formState.actionPlan ||
        !formState.targetDate)
    ) {
      toast.error('Complete the required coaching fields before sending the log.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetchWithAuthRetry('/api/certification/coaching/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practice_session_id: selectedCategory.practice_session_id || undefined,
          sim_session_id: selectedCategory.sim_session_id || undefined,
          trainee_id: selectedCategory.trainee_id,
          coaching_minutes: formState.coachingMinutes,
          strengths: formState.strengths,
          opportunities: formState.opportunities,
          action_plan: formState.actionPlan,
          target_date: formState.targetDate,
          trainer_remarks: formState.trainerRemarks,
          status: publish ? 'sent' : 'draft',
          competency_status: formState.competencyStatus,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Unable to save the coaching log.');
      }

      toast.success(
        publish
          ? 'Coaching log sent to the trainee and saved to the database.'
          : 'Draft coaching log saved to the database.',
      );
      setFormState(buildDefaultFormState());
      await loadData('refresh');
      if (publish) {
        setActiveTab('logs');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save the coaching log.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Coaching Hub</h2>
          <p className="text-sm text-muted-foreground">
            Create, review, and track coaching sessions from one trainer workspace.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadData('refresh')}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Coaching Data
        </Button>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Finished Mock Calls" value={summary.completedCategories} icon={<FileText className="size-5" />} />
        <SummaryCard label="Ready for Coaching" value={summary.readyForCoaching} icon={<MessageSquare className="size-5" />} />
        <SummaryCard label="Pending Ack" value={summary.pendingAcknowledgement} icon={<Clock3 className="size-5" />} />
        <SummaryCard label="Acknowledged" value={summary.acknowledged} icon={<CheckCircle2 className="size-5" />} />
        <SummaryCard label="Competent" value={summary.competent} icon={<UserCheck className="size-5" />} />
        <SummaryCard label="Retake Required" value={summary.notCompetent} icon={<AlertTriangle className="size-5" />} />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CoachingTab)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="hub">Finished Mock Calls</TabsTrigger>
          <TabsTrigger value="logs">Coaching Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="hub" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Batch and Trainee Selection</CardTitle>
              <CardDescription>
                Filter finished trainee categories by batch or by specific trainee.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Batch / Wave</Label>
                <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All batches</SelectItem>
                    {hubData.batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Trainee</Label>
                <Select value={selectedTraineeId} onValueChange={setSelectedTraineeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a trainee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All trainees</SelectItem>
                    {filteredTrainees.map((trainee) => (
                      <SelectItem key={trainee.id} value={trainee.id}>
                        {trainee.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Finished Mock Calls</CardTitle>
                <CardDescription>
                  The latest Call Simulation trainee attempts saved in the database.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredCategories.map((category) => (
                  <button
                    key={getCategorySessionId(category)}
                    type="button"
                    onClick={() => setSelectedCategoryId(getCategorySessionId(category))}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedCategoryId === getCategorySessionId(category)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/35'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-foreground">{category.scenario_title || 'Untitled category'}</div>
                      <Badge className={trainingStateTone(category.training_state.code)}>
                        {category.training_state.label}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {category.trainee_name || 'Trainee'} | {category.batch_name || 'No batch'}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Score {formatPercent(category.overall_score)}</span>
                      <span>Attempt {category.attempt_number || 1}</span>
                      <span>{formatDate(category.created_at)}</span>
                    </div>
                  </button>
                ))}

                {!isLoading && !filteredCategories.length && (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No finished mock calls are available for the selected filters yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Interaction Review</CardTitle>
                  <CardDescription>
                    Review the recording, transcript, and scores before coaching.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedCategory ? (
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <InfoTile label="Trainee" value={selectedCategory.trainee_name || 'Trainee'} />
                        <InfoTile label="Batch / Wave" value={selectedCategory.batch_name || 'No batch'} />
                        <InfoTile label="Score" value={formatPercent(selectedCategory.overall_score)} />
                        <InfoTile label="Attempt" value={String(selectedCategory.attempt_number || 1)} />
                      </div>

                      <div className="rounded-2xl border p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                          <AudioLines className="size-4" />
                          Interaction Recording
                        </div>
                        {selectedCategory.audio_file_url ? (
                          <audio controls preload="metadata" className="w-full" src={selectedCategory.audio_file_url} />
                        ) : (
                          <p className="text-sm text-muted-foreground">No recording URL was stored for this attempt yet.</p>
                        )}
                      </div>

                      <DetailBlock label="Transcript" value={selectedCategory.transcription || 'No transcript available for this attempt.'} />

                      <div className="grid gap-4 md:grid-cols-5">
                        <InfoTile label="Accuracy" value={formatPercent(selectedCategory.scores?.accuracy)} />
                        <InfoTile label="Fluency" value={formatPercent(selectedCategory.scores?.fluency)} />
                        <InfoTile label="Clarity" value={formatPercent(selectedCategory.scores?.clarity)} />
                        <InfoTile label="Keyword" value={formatPercent(selectedCategory.scores?.keyword_adherence)} />
                        <InfoTile label="Soft Skills" value={formatPercent(selectedCategory.scores?.soft_skills)} />
                      </div>

                      <div className="rounded-2xl border p-4">
                        <div className="mb-2 text-sm font-semibold text-foreground">Current Coaching State</div>
                        <Badge className={trainingStateTone(selectedCategory.training_state.code)}>
                          {selectedCategory.training_state.label}
                        </Badge>
                        <p className="mt-3 text-sm text-muted-foreground">
                          {selectedCategory.training_state.summary}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                    Select a finished mock call to review the interaction recording and transcript.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Create Coaching Log</CardTitle>
                  <CardDescription>
                    Save the coaching notes to the database and send them to the trainee.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedCategoryIsLocked && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      This mock call is already marked competent. The trainee button in the training hub stays disabled.
                    </div>
                  )}

                  {selectedCategory?.training_state.requires_acknowledgement && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      The latest coaching log is still waiting for trainee acknowledgement.
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Strengths</Label>
                    <Textarea value={formState.strengths} onChange={(event) => setFormState((current) => ({ ...current, strengths: event.target.value }))} rows={4} />
                  </div>
                  <div className="space-y-2">
                    <Label>Opportunities</Label>
                    <Textarea value={formState.opportunities} onChange={(event) => setFormState((current) => ({ ...current, opportunities: event.target.value }))} rows={4} />
                  </div>
                  <div className="space-y-2">
                    <Label>Action Plan</Label>
                    <Textarea value={formState.actionPlan} onChange={(event) => setFormState((current) => ({ ...current, actionPlan: event.target.value }))} rows={4} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Target Date</Label>
                      <Input type="date" value={formState.targetDate} onChange={(event) => setFormState((current) => ({ ...current, targetDate: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Coaching Minutes</Label>
                      <Input type="number" min={1} value={formState.coachingMinutes} onChange={(event) => setFormState((current) => ({ ...current, coachingMinutes: Number(event.target.value) || 0 }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Verdict</Label>
                      <Select value={formState.competencyStatus} onValueChange={(value) => setFormState((current) => ({ ...current, competencyStatus: value as CompetencyStatus }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a verdict" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="competent">Competent</SelectItem>
                          <SelectItem value="not_competent">Not Competent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Trainer Remarks</Label>
                    <Textarea value={formState.trainerRemarks} onChange={(event) => setFormState((current) => ({ ...current, trainerRemarks: event.target.value }))} rows={3} />
                  </div>
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => void submitCoachingLog(false)} disabled={!selectedCategory || selectedCategoryIsLocked || isSubmitting}>
                      <Save className="size-4" />
                      Save Draft
                    </Button>
                    <Button type="button" onClick={() => void submitCoachingLog(true)} disabled={!selectedCategory || selectedCategoryIsLocked || isSubmitting}>
                      <Send className="size-4" />
                      {isSubmitting ? 'Sending...' : 'Send to Trainee'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Coaching History for this Category</CardTitle>
                  <CardDescription>
                    Every coaching log for the selected trainee and mock call stays visible in the database history.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {relatedLogs.map((log) => (
                    <button key={log.id} type="button" onClick={() => setSelectedLog(log)} className="w-full rounded-2xl border p-4 text-left transition hover:border-primary/35">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-foreground">{log.coaching_id}</div>
                        <Badge className={deliveryBadgeTone(log.status)}>{log.status}</Badge>
                        <Badge className={competencyBadgeTone(log.competency_status)}>{verdictLabel(log.competency_status)}</Badge>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {log.trainer_name || 'Trainer'} | {formatDate(log.created_at)}
                      </div>
                    </button>
                  ))}
                  {!relatedLogs.length && (
                    <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                      No coaching logs have been saved for this trainee and mock call yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Coaching Log Tracking</CardTitle>
              <CardDescription>
                Track delivery, acknowledgement, competency, and retake outcomes in one tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search trainee, mock call, or coaching ID" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="Delivery status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All delivery statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Pending acknowledgement</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={competencyFilter} onValueChange={setCompetencyFilter}>
                  <SelectTrigger><SelectValue placeholder="Competency status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All verdicts</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="competent">Competent</SelectItem>
                    <SelectItem value="not_competent">Not Competent</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => void loadData('refresh')}>
                  <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh Logs
                </Button>
              </div>

              <div className="space-y-3">
                {filteredLogs.map((log) => (
                  <button key={log.id} type="button" onClick={() => setSelectedLog(log)} className="w-full rounded-2xl border p-4 text-left transition hover:border-primary/35">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-foreground">{log.coaching_id}</div>
                          <Badge className={deliveryBadgeTone(log.status)}>{log.status}</Badge>
                          <Badge className={competencyBadgeTone(log.competency_status)}>{verdictLabel(log.competency_status)}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {log.trainee_name || 'Trainee'} | {log.trainer_name || 'Trainer'} | {log.scenario_title || 'General coaching'} | {log.batch_name || 'No batch'}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>{formatDate(log.created_at)}</span>
                          <span>{log.coaching_minutes || 0} minutes</span>
                          {log.acknowledged_at ? <span>Acknowledged {formatDate(log.acknowledged_at)}</span> : null}
                        </div>
                      </div>
                      <div className="max-w-xl text-sm text-muted-foreground">
                        {log.action_plan || 'No action plan saved on this log yet.'}
                      </div>
                    </div>
                  </button>
                ))}
                {!isLoading && !filteredLogs.length && (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No coaching logs match the current filters.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent size="md" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>{selectedLog?.coaching_id}</span>
              {selectedLog ? (
                <>
                  <Badge className={deliveryBadgeTone(selectedLog.status)}>{selectedLog.status}</Badge>
                  <Badge className={competencyBadgeTone(selectedLog.competency_status)}>{verdictLabel(selectedLog.competency_status)}</Badge>
                </>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          {selectedLog ? (
            <div className="space-y-4 py-2">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="Trainee" value={selectedLog.trainee_name || 'Trainee'} />
                <InfoTile label="Trainer" value={selectedLog.trainer_name || 'Trainer'} />
                <InfoTile label="Scenario" value={selectedLog.scenario_title || 'General coaching'} />
                <InfoTile label="Batch" value={selectedLog.batch_name || 'No batch'} />
                <InfoTile label="Target Date" value={formatDateOnly(selectedLog.target_date)} />
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="Created" value={formatDate(selectedLog.created_at)} />
                <InfoTile label="Acknowledged" value={selectedLog.acknowledged_at ? formatDate(selectedLog.acknowledged_at) : 'Pending'} />
                <InfoTile label="Coaching Minutes" value={String(selectedLog.coaching_minutes || 0)} />
                <InfoTile label="Attempt" value={String(selectedLog.attempt_number || 1)} />
              </div>
              {selectedLog.audio_file_url ? (
                <div className="rounded-2xl border p-4">
                  <div className="mb-2 text-sm font-semibold text-foreground">Interaction Recording</div>
                  <audio controls preload="metadata" className="w-full" src={selectedLog.audio_file_url} />
                </div>
              ) : null}
              <DetailBlock label="Transcript" value={selectedLog.transcription || 'No transcript available.'} />
              <DetailBlock label="Strengths" value={selectedLog.strengths || 'No strengths recorded.'} tone="bg-emerald-50" />
              <DetailBlock label="Opportunities" value={selectedLog.opportunities || 'No opportunities recorded.'} tone="bg-amber-50" />
              <DetailBlock label="Action Plan" value={selectedLog.action_plan || 'No action plan recorded.'} tone="bg-sky-50" />
              <DetailBlock label="Trainer Remarks" value={selectedLog.trainer_remarks || 'No trainer remarks recorded.'} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
