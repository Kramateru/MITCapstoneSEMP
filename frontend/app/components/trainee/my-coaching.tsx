'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, FileText, MessageSquare, Target } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Separator } from '../ui/separator';

type CoachingLog = {
  id: string;
  coaching_id: string;
  scenario_title?: string | null;
  trainer_name?: string | null;
  coaching_minutes?: number | null;
  target_date?: string | null;
  status: 'sent' | 'acknowledged';
  competency_status: 'pending' | 'competent' | 'not_competent';
  strengths?: string | null;
  opportunities?: string | null;
  action_plan?: string | null;
  trainer_remarks?: string | null;
  transcription?: string | null;
  audio_file_url?: string | null;
  created_at?: string | null;
  acknowledged_at?: string | null;
};

function verdictLabel(status: CoachingLog['competency_status']) {
  if (status === 'competent') return 'Competent';
  if (status === 'not_competent') return 'Not Competent';
  return 'Pending';
}

function verdictTone(status: CoachingLog['competency_status']) {
  if (status === 'competent') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'not_competent') return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function statusTone(status: CoachingLog['status']) {
  if (status === 'acknowledged') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

export default function MyCoaching() {
  const [coachingLogs, setCoachingLogs] = useState<CoachingLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<CoachingLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      setLoadError('');
      const token = localStorage.getItem('token');
      const res = await fetch('/api/certification/coaching/logs', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('Failed to load coaching logs');
      }
      const data = await res.json();
      setCoachingLogs(data.logs || []);
    } catch (error) {
      console.error(error);
      setLoadError('Unable to load coaching logs.');
      setCoachingLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  const handleAcknowledge = async (logId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/certification/coaching/logs/${logId}/acknowledge`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        throw new Error('Failed to acknowledge coaching log');
      }
      toast.success('Coaching log acknowledged successfully.');
      setSelectedLog(null);
      await loadLogs();
    } catch (error) {
      console.error(error);
      toast.error('Unable to acknowledge coaching log.');
    }
  };

  const summary = useMemo(() => {
    return {
      total: coachingLogs.length,
      pending: coachingLogs.filter((log) => log.status === 'sent').length,
      acknowledged: coachingLogs.filter((log) => log.status === 'acknowledged').length,
      retake: coachingLogs.filter((log) => log.competency_status === 'not_competent').length,
    };
  }, [coachingLogs]);

  return (
    <div className="space-y-6">
      {summary.pending > 0 && (
        <Alert className="border-amber-500 bg-amber-50">
          <AlertCircle className="size-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            You have {summary.pending} coaching log{summary.pending > 1 ? 's' : ''} waiting
            for acknowledgement.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Coaching Logs</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{summary.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending Ack</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-amber-700">{summary.pending}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Acknowledged</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-emerald-700">{summary.acknowledged}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Retake Required</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-rose-700">{summary.retake}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            My Coaching
          </CardTitle>
          <CardDescription>
            Review all coaching logs, open the transcript and recording, and acknowledge the
            ones your trainer sent to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {coachingLogs.map((log) => (
            <button
              key={log.id}
              type="button"
              onClick={() => setSelectedLog(log)}
              className={`w-full rounded-2xl border p-4 text-left transition hover:border-primary/35 ${
                log.status === 'sent' ? 'border-amber-300 bg-amber-50/60' : ''
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-foreground">{log.coaching_id}</div>
                    <Badge className={statusTone(log.status)}>
                      {log.status === 'sent' ? 'Needs Acknowledgement' : 'Acknowledged'}
                    </Badge>
                    <Badge className={verdictTone(log.competency_status)}>
                      {verdictLabel(log.competency_status)}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {log.scenario_title || 'General coaching'} | Trainer:{' '}
                    {log.trainer_name || 'Trainer'}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>{log.created_at ? new Date(log.created_at).toLocaleString() : 'Not set'}</span>
                    <span>{log.coaching_minutes || 0} minutes</span>
                    <span>Target: {log.target_date ? new Date(log.target_date).toLocaleDateString() : 'Not set'}</span>
                  </div>
                </div>
                <div className="max-w-xl text-sm text-muted-foreground">
                  {log.action_plan || 'No action plan recorded yet.'}
                </div>
              </div>
            </button>
          ))}

          {!isLoading && !coachingLogs.length && (
            <div className="py-10 text-center text-sm text-gray-500">
              No coaching logs yet.
            </div>
          )}

          {isLoading && <div className="text-sm text-gray-500">Loading coaching logs...</div>}
          {loadError && <div className="text-sm text-red-600">{loadError}</div>}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>{selectedLog?.coaching_id}</span>
              {selectedLog ? (
                <>
                  <Badge className={statusTone(selectedLog.status)}>
                    {selectedLog.status === 'sent' ? 'Needs Acknowledgement' : 'Acknowledged'}
                  </Badge>
                  <Badge className={verdictTone(selectedLog.competency_status)}>
                    {verdictLabel(selectedLog.competency_status)}
                  </Badge>
                </>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {selectedLog ? (
            <div className="space-y-4 py-2">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Category</div>
                  <div className="mt-2 text-sm font-medium">{selectedLog.scenario_title || 'General coaching'}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Trainer</div>
                  <div className="mt-2 text-sm font-medium">{selectedLog.trainer_name || 'Trainer'}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Coaching Minutes</div>
                  <div className="mt-2 text-sm font-medium">{selectedLog.coaching_minutes || 0}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Target Date</div>
                  <div className="mt-2 text-sm font-medium">{selectedLog.target_date ? new Date(selectedLog.target_date).toLocaleDateString() : 'Not set'}</div>
                </div>
              </div>

              {selectedLog.audio_file_url ? (
                <div className="rounded-2xl border p-4">
                  <div className="mb-2 text-sm font-semibold text-foreground">Interaction Recording</div>
                  <audio controls preload="metadata" className="w-full" src={selectedLog.audio_file_url} />
                </div>
              ) : null}

              <div className="rounded-2xl border p-4">
                <div className="mb-2 text-sm font-semibold text-foreground">Transcript</div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {selectedLog.transcription || 'No transcript available.'}
                </p>
              </div>

              <div className="rounded-2xl border bg-emerald-50 p-4">
                <div className="mb-2 text-sm font-semibold text-emerald-700">Strengths</div>
                <p className="whitespace-pre-wrap text-sm text-emerald-900">
                  {selectedLog.strengths || 'No strengths recorded.'}
                </p>
              </div>

              <div className="rounded-2xl border bg-amber-50 p-4">
                <div className="mb-2 text-sm font-semibold text-amber-700">Opportunities</div>
                <p className="whitespace-pre-wrap text-sm text-amber-900">
                  {selectedLog.opportunities || 'No opportunities recorded.'}
                </p>
              </div>

              <div className="rounded-2xl border bg-sky-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-700">
                  <Target className="size-4" />
                  Action Plan
                </div>
                <p className="whitespace-pre-wrap text-sm text-sky-900">
                  {selectedLog.action_plan || 'No action plan recorded.'}
                </p>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText className="size-4" />
                  Trainer Remarks
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {selectedLog.trainer_remarks || 'No remarks recorded.'}
                </p>
              </div>

              <Separator />

              {selectedLog.status === 'sent' ? (
                <div className="space-y-4">
                  <Alert className="border-blue-500 bg-blue-50">
                    <AlertDescription className="text-blue-800">
                      Acknowledge this coaching log after reviewing the recording, transcript,
                      strengths, opportunities, and action plan.
                    </AlertDescription>
                  </Alert>
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setSelectedLog(null)}>
                      Review Later
                    </Button>
                    <Button onClick={() => void handleAcknowledge(selectedLog.id)}>
                      <CheckCircle2 className="mr-2 size-4" />
                      Acknowledge Coaching
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="size-4" />
                    Coaching acknowledged
                  </div>
                  <div className="mt-2">
                    {selectedLog.acknowledged_at
                      ? `Acknowledged on ${new Date(selectedLog.acknowledged_at).toLocaleString()}`
                      : 'Acknowledged'}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
