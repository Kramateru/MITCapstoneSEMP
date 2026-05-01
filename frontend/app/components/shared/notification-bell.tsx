'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useAuth } from '@/app/context/AuthContext';
import { Bell, CheckCircle2, ExternalLink, Info, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  href: string;
  level: 'critical' | 'warning' | 'info' | 'success';
  action_label: string;
  created_at: string | null;
  status: 'unread' | 'read';
  is_cleared: boolean;
};

type NotificationsPayload = {
  count: number;
  notifications: NotificationItem[];
  role: string;
  generated_at: string;
};

function relativeTimeLabel(value: string | null) {
  if (!value) {
    return 'Just now';
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Just now';
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) {
    return 'Just now';
  }
  if (deltaSeconds < 3600) {
    const minutes = Math.floor(deltaSeconds / 60);
    return `${minutes} min ago`;
  }
  if (deltaSeconds < 86400) {
    const hours = Math.floor(deltaSeconds / 3600);
    return `${hours} hr ago`;
  }
  const days = Math.floor(deltaSeconds / 86400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function iconForLevel(level: NotificationItem['level']) {
  if (level === 'critical' || level === 'warning') {
    return <TriangleAlert className="size-4 text-amber-600" />;
  }
  if (level === 'success') {
    return <CheckCircle2 className="size-4 text-emerald-600" />;
  }
  return <Info className="size-4 text-sky-600" />;
}

function borderClassForLevel(level: NotificationItem['level']) {
  if (level === 'critical') {
    return 'border-rose-200 bg-rose-50/80';
  }
  if (level === 'warning') {
    return 'border-amber-200 bg-amber-50/80';
  }
  if (level === 'success') {
    return 'border-emerald-200 bg-emerald-50/80';
  }
  return 'border-slate-200 bg-slate-50/80';
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // Keep falling back when JSON is unavailable.
  }

  try {
    const text = (await response.text()).trim();
    if (text) {
      return text;
    }
  } catch {
    // Ignore parse failures and keep the fallback.
  }

  return fallback;
}

export default function NotificationBell() {
  const router = useRouter();
  const { token, isAuthenticated, isLoading, refreshToken, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<NotificationsPayload>({
    count: 0,
    notifications: [],
    role: '',
    generated_at: new Date().toISOString(),
  });

  const fetchWithAuthRetry = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const sendRequest = async (authToken: string | null) => {
        const headers = new Headers(init?.headers || undefined);
        if (authToken || token) {
          headers.set('Authorization', `Bearer ${authToken || token}`);
        }
        return fetch(input, {
          ...init,
          headers,
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

  const loadNotifications = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (isLoading) {
        return;
      }

      if (!isAuthenticated || !token) {
        setPayload({
          count: 0,
          notifications: [],
          role: '',
          generated_at: new Date().toISOString(),
        });
        setError('');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (mode === 'initial') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError('');

      try {
        const response = await fetchWithAuthRetry('/api/notifications');
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Unable to load notifications right now.'));
        }
        const nextPayload = (await response.json()) as NotificationsPayload;
        setPayload(nextPayload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load notifications right now.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchWithAuthRetry, isAuthenticated, isLoading, token],
  );

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void loadNotifications('refresh');
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [isAuthenticated, loadNotifications, token]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadNotifications('refresh');
  }, [loadNotifications, open]);

  const handleReadNotification = useCallback(async (notificationId: string, href?: string) => {
    const normalizedHref = (href || '').trim();

    // Immediate UI update
    setPayload((prevPayload) => {
      const filtered = prevPayload.notifications.filter((item) => {
        if (item.id === notificationId) {
          return false;
        }
        if (normalizedHref && item.href === normalizedHref) {
          return false;
        }
        return true;
      });
      return {
        ...prevPayload,
        notifications: filtered,
        count: filtered.length,
      };
    });

    try {
      const response = await fetchWithAuthRetry('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_id: notificationId,
          href: normalizedHref,
        }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unable to update the notification right now.'));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      setError(error instanceof Error ? error.message : 'Unable to update the notification right now.');
    } finally {
      void loadNotifications('refresh');
    }
  }, [fetchWithAuthRetry, loadNotifications]);

  const handleOpenNotification = useCallback(
    async (notification: NotificationItem) => {
      setOpen(false);
      await handleReadNotification(notification.id, notification.href);
      router.push(notification.href);
    },
    [handleReadNotification, router],
  );

  const badgeLabel = useMemo(() => {
    if (!payload.count) {
      return '';
    }
    return payload.count > 9 ? '9+' : String(payload.count);
  }, [payload.count]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open notifications"
          title="Notifications"
          className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell size={20} />
          {payload.count > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
              {badgeLabel}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Notifications</div>
              <div className="text-xs text-muted-foreground">
                Role-based alerts for tasks and updates you need to know.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadNotifications('refresh')}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Refresh notifications"
              title="Refresh notifications"
            >
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </button>
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading notifications...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {!loading && !error && !payload.notifications.length ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No new notifications.
            </div>
          ) : null}

          {!loading && !error ? (
            <div className="space-y-3">
              {payload.notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    void handleOpenNotification(notification);
                  }}
                  className={`block w-full rounded-2xl border px-4 py-3 text-left transition-colors hover:bg-muted/70 ${borderClassForLevel(notification.level)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5">{iconForLevel(notification.level)}</span>
                      <div>
                        <div className="text-sm font-semibold text-foreground">{notification.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{notification.message}</div>
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {relativeTimeLabel(notification.created_at)}
                    </span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-primary">
                    {notification.action_label}
                    <ExternalLink className="size-3.5" />
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
