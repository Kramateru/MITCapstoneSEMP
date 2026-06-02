'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { 
  MessageSquare, 
  Plus, 
  Search, 
  Filter,
  Calendar,
  Eye,
  CheckCircle,
  Send,
  Save
} from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { toast } from 'sonner';

type CoachingLog = {
  id: string;
  coachingId: string;
  traineeId: string;
  trainerId: string;
  status: 'draft' | 'sent' | 'acknowledged';
  strengths?: string | null;
  opportunities?: string | null;
  actionPlan?: string | null;
  targetDate?: string | null;
  coachingMinutes?: number | null;
  createdAt?: string | null;
  acknowledgedAt?: string | null;
};

type TraineeOption = {
  id: string;
  name: string;
  batchName?: string | null;
};

export default function CoachingLogsManagement() {
  const { token, isAuthenticated, isLoading: isAuthLoading, refreshToken, logout } = useAuth();
  const [coachingLogs, setCoachingLogs] = useState<CoachingLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<CoachingLog | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [trainees, setTrainees] = useState<TraineeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  
  const [formData, setFormData] = useState({
    traineeId: '',
    strengths: '',
    opportunities: '',
    actionPlan: '',
    targetDate: '',
    coachingMinutes: 30,
    status: 'draft' as 'draft' | 'sent'
  });

  const traineeMap = useMemo(() => {
    return new Map(trainees.map((t) => [t.id, t.name]));
  }, [trainees]);

  const fetchWithAuthRetry = async (input: RequestInfo | URL, init?: RequestInit) => {
    const sendRequest = async (authToken: string | null) => {
      const nextHeaders = new Headers(init?.headers || undefined);
      if (authToken || token) {
        nextHeaders.set('Authorization', `Bearer ${authToken || token}`);
      }
      return fetch(input, {
        ...init,
        headers: nextHeaders,
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
  };

  const loadTrainees = async () => {
    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated || !token) {
      setTrainees([]);
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const batchRes = await fetchWithAuthRetry('/api/trainer/batches', { headers });
      if (!batchRes.ok) {
        const payload = await batchRes.json().catch(() => null);
        throw new Error(payload?.detail || 'Failed to load batches');
      }
      const batchData = await batchRes.json();
      const batches = batchData.batches || [];

      const batchDetails = await Promise.all(
        batches.map(async (b: any) => {
          const res = await fetchWithAuthRetry(`/api/trainer/batches/${b.id}`, { headers });
          if (!res.ok) return null;
          return res.json();
        })
      );

      const users = batchDetails.flatMap((detail: any) => detail?.users || []);
      const unique = new Map<string, TraineeOption>();
      users.forEach((u: any) => {
        if (u.role === 'trainee' && !unique.has(u.id)) {
          unique.set(u.id, {
            id: u.id,
            name: u.full_name || u.email || 'Trainee',
            batchName: u.batch_name || null,
          });
        }
      });

      setTrainees(Array.from(unique.values()));
    } catch (error) {
      console.error(error);
      setTrainees([]);
    }
  };

  const loadLogs = async () => {
    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated || !token) {
      setCoachingLogs([]);
      setLoadError('');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setLoadError('');
      const res = await fetchWithAuthRetry('/api/certification/coaching/logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || 'Failed to load coaching logs');
      }
      const data = await res.json();
      const mapped: CoachingLog[] = (data.logs || []).map((log: any) => ({
        id: log.id,
        coachingId: log.coaching_id,
        traineeId: log.trainee_id,
        trainerId: log.trainer_id,
        status: log.status,
        strengths: log.strengths,
        opportunities: log.opportunities,
        actionPlan: log.action_plan,
        targetDate: log.target_date,
        coachingMinutes: log.coaching_minutes,
        createdAt: log.created_at,
        acknowledgedAt: log.acknowledged_at,
      }));
      setCoachingLogs(mapped);
    } catch (error) {
      console.error(error);
      setLoadError('Unable to load coaching logs.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTrainees();
    void loadLogs();
  }, [isAuthLoading, isAuthenticated, token]);

  const handleCreateLog = () => {
    setFormData({
      traineeId: '',
      strengths: '',
      opportunities: '',
      actionPlan: '',
      targetDate: '',
      coachingMinutes: 30,
      status: 'draft'
    });
    setIsCreateDialogOpen(true);
  };

  const handleSaveLog = async (publish: boolean = false) => {
    if (!formData.traineeId || !formData.strengths || !formData.opportunities || !formData.actionPlan || !formData.targetDate) {
      toast.error('Please fill in all mandatory fields');
      return;
    }

    try {
      const res = await fetchWithAuthRetry('/api/certification/coaching/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          trainee_id: formData.traineeId,
          coaching_minutes: formData.coachingMinutes || 30,
          strengths: formData.strengths,
          opportunities: formData.opportunities,
          action_plan: formData.actionPlan,
          target_date: formData.targetDate,
          status: publish ? 'sent' : 'draft',
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || 'Failed to save coaching log');
      }

      toast.success(publish ? 'Coaching log published and sent to trainee' : 'Coaching log saved as draft');
      await loadLogs();
    } catch (error) {
      console.error(error);
      toast.error('Unable to save coaching log.');
      return;
    }

    setIsCreateDialogOpen(false);
    setSelectedLog(null);
    setFormData({
      traineeId: '',
      strengths: '',
      opportunities: '',
      actionPlan: '',
      targetDate: '',
      coachingMinutes: 30,
      status: 'draft'
    });
  };

  const handleViewLog = (log: CoachingLog) => {
    setSelectedLog(log);
    setIsViewDialogOpen(true);
  };

  const filteredLogs = coachingLogs.filter(log => {
    const traineeName = traineeMap.get(log.traineeId) || log.traineeId;
    const matchesSearch = 
      traineeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.coachingId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.strengths || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const normalizedStatus = log.status === 'sent' ? 'published' : log.status;
    const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const normalized = status === 'sent' ? 'published' : status;
    switch (status) {
      case 'acknowledged':
        return <Badge className="bg-green-600">Acknowledged</Badge>;
      case 'sent':
      case 'published':
        return <Badge className="bg-yellow-600">Pending</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      default:
        return <Badge>{normalized}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-5" />
                Coaching Logs Management
              </CardTitle>
              <CardDescription>
                Create, view, and track coaching sessions with your trainees
              </CardDescription>
            </div>
            <Button onClick={() => handleCreateLog()}>
              <Plus className="size-4 mr-2" />
              New Coaching Log
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="size-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by trainee name, coaching ID, or strengths..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="size-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Coaching Logs List */}
          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4>{log.coachingId}</h4>
                    {getStatusBadge(log.status)}
                  </div>
                  <p className="text-sm text-gray-500">
                    Trainee: <span className="text-gray-900 dark:text-gray-100">{traineeMap.get(log.traineeId) || log.traineeId}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    <Calendar className="size-3 inline mr-1" />
                    {log.createdAt ? new Date(log.createdAt).toLocaleDateString() : '—'} - 
                    {log.coachingMinutes || 0} min session
                  </p>
                  {log.status === 'acknowledged' && log.acknowledgedAt && (
                    <p className="text-sm text-green-600 mt-1">
                      <CheckCircle className="size-3 inline mr-1" />
                      Acknowledged on {new Date(log.acknowledgedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleViewLog(log)}>
                    <Eye className="size-4 mr-1" />
                    View
                  </Button>
                </div>
              </div>
            ))}

            {!isLoading && filteredLogs.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="size-12 mx-auto mb-3 opacity-20" />
                <p>No coaching logs found</p>
              </div>
            )}

            {isLoading && (
              <div className="text-center py-8 text-gray-500">Loading coaching logs...</div>
            )}

            {loadError && (
              <div className="text-center py-4 text-red-600">{loadError}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent size="sm" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Coaching Log</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trainee *</Label>
                <Select
                  value={formData.traineeId}
                  onValueChange={(val) => setFormData({ ...formData, traineeId: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select trainee" />
                  </SelectTrigger>
                  <SelectContent>
                    {trainees.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Coaching Duration (minutes)</Label>
                <Input
                  type="number"
                  value={formData.coachingMinutes}
                  onChange={(e) => setFormData({ ...formData, coachingMinutes: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Trainee Context</p>
              <p className="text-sm">
                <strong>Trainee:</strong> {traineeMap.get(formData.traineeId || '') || 'Select trainee'}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Strengths <Badge variant="destructive" className="text-xs">Required</Badge>
              </Label>
              <Textarea
                placeholder="Describe what the trainee did well..."
                value={formData.strengths}
                onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Opportunities for Improvement <Badge variant="destructive" className="text-xs">Required</Badge>
              </Label>
              <Textarea
                placeholder="Identify areas where the trainee can improve..."
                value={formData.opportunities}
                onChange={(e) => setFormData({ ...formData, opportunities: e.target.value })}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Action Plan <Badge variant="destructive" className="text-xs">Required</Badge>
              </Label>
              <Textarea
                placeholder="Provide clear, measurable steps..."
                value={formData.actionPlan}
                onChange={(e) => setFormData({ ...formData, actionPlan: e.target.value })}
                rows={5}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Target Completion Date <Badge variant="destructive" className="text-xs">Required</Badge>
              </Label>
              <Input
                type="date"
                value={formData.targetDate}
                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => handleSaveLog(false)}>
                <Save className="size-4 mr-2" />
                Save as Draft
              </Button>
              <Button onClick={() => handleSaveLog(true)}>
                <Send className="size-4 mr-2" />
                Publish & Send to Trainee
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent size="sm" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Coaching Log: {selectedLog?.coachingId}</span>
              {selectedLog && getStatusBadge(selectedLog.status)}
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <p className="text-sm text-gray-500">Trainee</p>
                  <p className="text-sm">{traineeMap.get(selectedLog.traineeId) || selectedLog.traineeId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Coaching Date</p>
                  <p className="text-sm">{selectedLog.createdAt ? new Date(selectedLog.createdAt).toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Duration</p>
                  <p className="text-sm">{selectedLog.coachingMinutes || 0} minutes</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Target Date</p>
                  <p className="text-sm">{selectedLog.targetDate ? new Date(selectedLog.targetDate).toLocaleDateString() : 'Not set'}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-green-600">Strengths</Label>
                  <p className="text-sm mt-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                    {selectedLog.strengths || 'No strengths recorded.'}
                  </p>
                </div>

                <div>
                  <Label className="text-yellow-600">Opportunities for Improvement</Label>
                  <p className="text-sm mt-2 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                    {selectedLog.opportunities || 'No opportunities recorded.'}
                  </p>
                </div>

                <div>
                  <Label className="text-blue-600">Action Plan</Label>
                  <p className="text-sm mt-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg whitespace-pre-wrap">
                    {selectedLog.actionPlan || 'No action plan recorded.'}
                  </p>
                </div>
              </div>

              {selectedLog.status === 'acknowledged' && (
                <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="size-5" />
                    <span>Acknowledged by Trainee</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    Acknowledged on: {selectedLog.acknowledgedAt ? new Date(selectedLog.acknowledgedAt).toLocaleString() : '—'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 italic mt-1">
                    "I have read and understood the feedback and agree to the action plan provided."
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
