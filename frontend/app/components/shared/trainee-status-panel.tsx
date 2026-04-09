'use client';

import { AlertCircle, Loader2, Search, ToggleRight, User, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
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

interface CurrentUser {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
}

export function TraineeStatusPanel() {
  const [trainees, setTrainees] = useState<RegisteredTrainee[]>([]);
  const [filteredTrainees, setFilteredTrainees] = useState<RegisteredTrainee[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch current user info and all registered trainees
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const token = window.localStorage.getItem('token');
        if (!token) {
          setError('Authentication required');
          return;
        }

        // Fetch current user info
        const userResponse = await fetch('/api/trainee/account-status', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setCurrentUser({
            id: userData.id,
            full_name: userData.full_name,
            email: userData.email,
            is_active: userData.is_active,
          });
        }

        // Fetch all registered trainees
        const traineesResponse = await fetch('/api/trainee/registered-trainees', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!traineesResponse.ok) {
          throw new Error(await traineesResponse.text());
        }

        const data: TraineeListResponse = await traineesResponse.json();
        setTrainees(data.trainees || []);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load data';
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
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

  const handleStatusToggle = async () => {
    if (!currentUser) return;

    // Only allow deactivation, not reactivation
    if (!currentUser.is_active) {
      toast.error('You cannot reactivate your account. Please contact your trainer.');
      return;
    }

    try {
      setIsUpdating(true);
      setError(null);

      const token = window.localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/trainee/account-status', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: false }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message);
      }

      const data = await response.json();

      // Update current user status
      setCurrentUser(prev => prev ? { ...prev, is_active: false } : null);

      // Update in trainees list
      setTrainees(prev =>
        prev.map(t =>
          t.id === currentUser.id ? { ...t, is_active: false } : t
        )
      );

      toast.success(data.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update account status';
      setError(message);
      toast.error(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const activeCount = trainees.filter((t) => t.is_active).length;
  const inactiveCount = trainees.filter((t) => !t.is_active).length;

  if (isLoading) {
    return (
      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading trainee status information...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50/50">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-rose-700">
          <AlertCircle className="size-4" />
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
            <ToggleRight className="size-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Trainee Status Overview</CardTitle>
              <CardDescription>
                Total registered: {trainees.length} • Active: {activeCount} • Inactive: {inactiveCount}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Current User Status Card */}
      {currentUser && (
        <Card className="border-border/70 bg-card/90 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="size-5 text-primary" />
              <CardTitle className="text-lg">Your Account Status</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`size-3 rounded-full ${currentUser.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                <div>
                  <p className="font-medium">{currentUser.full_name}</p>
                  <p className="text-sm text-muted-foreground">{currentUser.email}</p>
                </div>
                <Badge variant={currentUser.is_active ? 'default' : 'secondary'}>
                  {currentUser.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {currentUser.is_active && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStatusToggle}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Deactivating...
                    </>
                  ) : (
                    'Deactivate Account'
                  )}
                </Button>
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {currentUser.is_active
                ? 'You can deactivate your account if you need to temporarily stop training activities.'
                : 'Your account is inactive. Contact your trainer to reactivate it.'
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* Trainee Directory */}
      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="size-5 text-primary" />
              <div>
                <CardTitle className="text-lg">All Registered Trainees</CardTitle>
                <CardDescription>
                  View all trainees registered in the system
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search trainees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredTrainees.map((trainee) => (
              <div
                key={trainee.id}
                className={`flex items-center justify-between rounded-lg border p-4 ${
                  trainee.id === currentUser?.id ? 'border-primary/50 bg-primary/5' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`size-3 rounded-full ${trainee.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div>
                    <p className="font-medium">
                      {trainee.full_name}
                      {trainee.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-primary font-normal">(You)</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{trainee.email}</p>
                    {trainee.department && (
                      <p className="text-xs text-muted-foreground">{trainee.department}</p>
                    )}
                  </div>
                </div>
                <Badge variant={trainee.is_active ? 'default' : 'secondary'}>
                  {trainee.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))}
            {filteredTrainees.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                {searchQuery ? 'No trainees found matching your search.' : 'No trainees registered yet.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}