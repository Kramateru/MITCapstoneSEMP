'use client';

import { Activity, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface AccountStatus {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function TraineeAccountStatus() {
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccountStatus = async () => {
      try {
        setIsLoading(true);
        const token = window.sessionStorage.getItem('token');
        if (!token) {
          setError('Authentication required');
          return;
        }

        const response = await fetch('/api/trainee/account-status', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = await response.json();
        setAccountStatus(data);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load account status';
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchAccountStatus();
  }, []);

  const handleStatusToggle = async (newStatus: boolean) => {
    if (!accountStatus) return;

    if (newStatus && !accountStatus.is_active) {
      toast.error('You cannot reactivate your account. Please contact your trainer.');
      return;
    }

    try {
      setIsUpdating(true);
      setError(null);

      const token = window.sessionStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/trainee/account-status', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: newStatus }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message);
      }

      const data = await response.json();
      setAccountStatus(data.trainee);
      toast.success(data.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update account status';
      setError(message);
      toast.error(message);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading account status...
        </CardContent>
      </Card>
    );
  }

  if (!accountStatus) {
    return (
      <Card className="border-rose-200 bg-rose-50/50">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-rose-700">
          <AlertCircle className="size-4 flex-shrink-0" />
          {error || 'Unable to load account status'}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <div>
            <CardTitle>Account Status</CardTitle>
            <CardDescription>Manage your training account activation status</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-lg border border-border/50 bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Current Status</p>
              <p className="text-xs text-muted-foreground">
                Your account is currently{' '}
                <span className="font-medium">{accountStatus.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {accountStatus.is_active ? (
                <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1">
                  <CheckCircle className="size-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700">Active</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1">
                  <AlertCircle className="size-4 text-slate-600" />
                  <span className="text-xs font-semibold text-slate-700">Inactive</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</p>
            <p className="mt-1 text-sm font-medium text-foreground">{accountStatus.full_name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Email</p>
            <p className="mt-1 text-sm font-medium text-foreground">{accountStatus.email}</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">Deactivate Account</p>
          <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50/50 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Account Status Toggle</p>
              <p className="text-xs text-muted-foreground">
                {accountStatus.is_active
                  ? 'Deactivate your account to skip training temporarily'
                  : 'Contact your trainer to reactivate your account'}
              </p>
            </div>
            <div>
              {accountStatus.is_active ? (
                <Button variant="outline" size="sm" onClick={() => handleStatusToggle(false)} disabled={isUpdating}>
                  {isUpdating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Deactivate
                </Button>
              ) : (
                <div className="rounded bg-slate-100 px-3 py-1.5">
                  <span className="text-xs font-semibold text-slate-600">Deactivated</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-900">Information</p>
          <ul className="space-y-1 text-xs text-blue-800">
            <li>- When deactivated, you will be removed from all batch assignments</li>
            <li>- Only your trainer can reactivate your account</li>
            <li>- Your training progress will be preserved</li>
            <li>- You can request reactivation from your trainer at any time</li>
          </ul>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
            <p className="text-xs text-rose-800">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
