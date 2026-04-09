'use client';

import { AlertCircle, CheckCircle, Loader2, Search, ToggleRight, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';

interface Trainee {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  department?: string | null;
  batch?: {
    id: string;
    name: string;
  } | null;
}

interface TraineeListResponse {
  count: number;
  trainees: Trainee[];
}

export function TrainerTraineeStatusPanel() {
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [filteredTrainees, setFilteredTrainees] = useState<Trainee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Fetch trainee list
  useEffect(() => {
    const fetchTrainees = async () => {
      try {
        setIsLoading(true);
        const token = window.localStorage.getItem('token');
        if (!token) {
          setError('Authentication required');
          return;
        }

        const response = await fetch('/api/trainer/all-trainees', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data: TraineeListResponse = await response.json();
        setTrainees(data.trainees || []);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load trainees';
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchTrainees();
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = trainees;

    // Status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter((t) => t.is_active);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter((t) => !t.is_active);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.full_name.toLowerCase().includes(query) || t.email.toLowerCase().includes(query),
      );
    }

    setFilteredTrainees(filtered);
  }, [trainees, statusFilter, searchQuery]);

  const handleStatusToggle = async (traineeId: string, newStatus: boolean) => {
    try {
      setIsUpdating(traineeId);
      const token = window.localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`/api/trainer/trainees/${traineeId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: newStatus }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      // Update local state
      setTrainees((prev) =>
        prev.map((t) =>
          t.id === traineeId ? { ...t, is_active: newStatus } : t,
        ),
      );

      toast.success(`Trainee ${newStatus ? 'activated' : 'deactivated'} successfully`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update trainee status';
      toast.error(message);
    } finally {
      setIsUpdating(null);
    }
  };

  const activeCount = trainees.filter((t) => t.is_active).length;
  const inactiveCount = trainees.filter((t) => !t.is_active).length;

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ToggleRight className="size-5 text-primary" />
            <div>
              <CardTitle>Trainee Status Management</CardTitle>
              <CardDescription>Activate or deactivate any trainee account in the system</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Trainees</p>
              <p className="mt-1 text-lg font-bold text-foreground">{trainees.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">Active</p>
              <p className="mt-1 text-lg font-bold text-emerald-900">{activeCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-700">Inactive</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{inactiveCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <Card className="border-border/70 bg-card/90">
          <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading trainees...
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="flex items-center gap-3 py-6 text-sm text-rose-700">
            <AlertCircle className="size-4 flex-shrink-0" />
            {error}
          </CardContent>
        </Card>
      ) : filteredTrainees.length === 0 ? (
        <Card className="border-border/70 bg-card/90">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-3 size-8 opacity-30" />
            {trainees.length === 0
              ? 'No trainees registered in the system'
              : 'No trainees match your search criteria'}
          </CardContent>
        </Card>
      ) : (
        /* Trainees List */
        <div className="space-y-2">
          {filteredTrainees.map((trainee) => (
            <Card key={trainee.id} className="border-border/70 bg-card/90 shadow-sm">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{trainee.full_name}</p>
                    <Badge variant={trainee.is_active ? 'default' : 'secondary'}>
                      {trainee.is_active ? (
                        <>
                          <CheckCircle className="mr-1 size-3" />
                          Active
                        </>
                      ) : (
                        <>
                          <AlertCircle className="mr-1 size-3" />
                          Inactive
                        </>
                      )}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{trainee.email}</p>
                  {trainee.batch && (
                    <p className="text-xs text-muted-foreground">
                      Batch: <span className="font-medium">{trainee.batch.name}</span>
                    </p>
                  )}
                </div>
                <Button
                  variant={trainee.is_active ? 'destructive' : 'default'}
                  size="sm"
                  onClick={() => handleStatusToggle(trainee.id, !trainee.is_active)}
                  disabled={isUpdating === trainee.id}
                >
                  {isUpdating === trainee.id ? (
                    <Loader2 className="mr-2 size-3 animate-spin" />
                  ) : trainee.is_active ? (
                    'Deactivate'
                  ) : (
                    'Activate'
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
