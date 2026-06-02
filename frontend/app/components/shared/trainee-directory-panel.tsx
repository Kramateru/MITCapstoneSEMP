'use client';

import { AlertCircle, CheckCircle, Loader2, Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';

interface RegisteredTrainee {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  department?: string | null;
  created_at: string;
}

interface TraineeListResponse {
  count: number;
  trainees: RegisteredTrainee[];
}

export function TraineeDirectoryPanel() {
  const [trainees, setTrainees] = useState<RegisteredTrainee[]>([]);
  const [filteredTrainees, setFilteredTrainees] = useState<RegisteredTrainee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all registered trainees
  useEffect(() => {
    const fetchTrainees = async () => {
      try {
        setIsLoading(true);
        const token = window.sessionStorage.getItem('token');
        if (!token) {
          setError('Authentication required');
          return;
        }

        const response = await fetch('/api/trainee/registered-trainees', {
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
        const message = err instanceof Error ? err.message : 'Failed to load registered trainees';
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchTrainees();
  }, []);

  // Apply search filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTrainees(trainees);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredTrainees(
        trainees.filter(
          (t) =>
            t.full_name.toLowerCase().includes(query) ||
            t.email.toLowerCase().includes(query),
        ),
      );
    }
  }, [trainees, searchQuery]);

  const activeCount = trainees.filter((t) => t.is_active).length;
  const inactiveCount = trainees.filter((t) => !t.is_active).length;

  if (isLoading) {
    return (
      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading registered trainees...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50/50">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-rose-700">
          <AlertCircle className="size-4 flex-shrink-0" />
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <div>
              <CardTitle>Trainee Directory</CardTitle>
              <CardDescription>View all registered trainees in the system</CardDescription>
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

      {/* Search */}
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

      {/* Trainees List */}
      {filteredTrainees.length === 0 ? (
        <Card className="border-border/70 bg-card/90">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-3 size-8 opacity-30" />
            {trainees.length === 0 ? 'No trainees registered' : 'No trainees match your search'}
          </CardContent>
        </Card>
      ) : (
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
                  {trainee.department && (
                    <p className="text-xs text-muted-foreground">
                      Department: <span className="font-medium">{trainee.department}</span>
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
