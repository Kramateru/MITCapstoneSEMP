'use client';

import NotificationBell from '@/app/components/shared/notification-bell';
import ProfileManagementDialog from '@/app/components/shared/profile-management-dialog';
import { StPeterBuddyChat } from '@/app/components/shared/st-peter-buddy-chat';
import { Toaster } from '@/app/components/ui/sonner';
import { useAuth } from '@/app/context/AuthContext';
import { openSimFloorRealtimeStream } from '@/app/lib/assessment/sim-floor-client';
import {
    applyUserSettingsToDocument,
    buildDefaultUserSettings,
    loadUserSettings,
    readCachedUserSettings,
    USER_SETTINGS_EVENT,
    type UserDashboardSettings,
} from '@/app/utils/user-settings';
import { Bot, LogOut, Menu, MessageCircle, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

interface SidebarItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
}

const ROLE_HOME = {
  admin: '/admin/dashboard',
  trainer: '/trainer/dashboard',
  trainee: '/trainee/dashboard',
} as const;

export function DashboardLayout({
  children,
  sidebarItems,
  userRole = 'trainee',
}: {
  children: React.ReactNode;
  sidebarItems: SidebarItem[];
  userRole?: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [buddyOpen, setBuddyOpen] = useState(false);
  const [dashboardSettings, setDashboardSettings] = useState<UserDashboardSettings>(
    () => readCachedUserSettings() ?? buildDefaultUserSettings(),
  );
  const [sidebarBadgeMap, setSidebarBadgeMap] = useState<Record<string, number>>({});
  const { user, token, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const resolvedUserRole = userRole === 'admin' || userRole === 'trainer' || userRole === 'trainee'
    ? userRole
    : 'trainee';
  const isTopNavigation = dashboardSettings.topNavigation;
  const isMinifiedSidebar = dashboardSettings.minifyNavigation && !isTopNavigation;
  const isHiddenSidebar = dashboardSettings.hideNavigation && !isTopNavigation;
  const desktopMenuEnabled = isHiddenSidebar;
  const contentWidthClass = dashboardSettings.boxedLayout ? 'max-w-5xl' : 'max-w-7xl';

  let desktopSidebarStateClass = 'lg:translate-x-0 lg:relative';
  if (isTopNavigation) {
    desktopSidebarStateClass = 'lg:hidden';
  } else if (isHiddenSidebar) {
    desktopSidebarStateClass = sidebarOpen ? 'lg:translate-x-0 lg:fixed' : 'lg:-translate-x-full lg:fixed';
  }

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      (window.innerWidth < 1024 || dashboardSettings.hideNavigation || dashboardSettings.topNavigation)
    ) {
      setSidebarOpen(false);
    }
  }, [dashboardSettings.hideNavigation, dashboardSettings.topNavigation, pathname]);

  useEffect(() => {
    applyUserSettingsToDocument(dashboardSettings);
  }, [dashboardSettings]);

  useEffect(() => {
    const cachedSettings = readCachedUserSettings();
    if (cachedSettings) {
      setDashboardSettings(cachedSettings);
      applyUserSettingsToDocument(cachedSettings);
    }

    let isMounted = true;
    const handleSettingsUpdate = (event: Event) => {
      const nextSettings = (event as CustomEvent<UserDashboardSettings>).detail;
      if (nextSettings) {
        setDashboardSettings(nextSettings);
      }
    };

    window.addEventListener(USER_SETTINGS_EVENT, handleSettingsUpdate as EventListener);

    void loadUserSettings()
      .then((loadedSettings) => {
        if (isMounted) {
          setDashboardSettings(loadedSettings);
        }
      })
      .catch(() => {
        // Keep cached or default settings when the database read is unavailable.
      });

    return () => {
      isMounted = false;
      window.removeEventListener(USER_SETTINGS_EVENT, handleSettingsUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!user) {
      router.replace('/login');
      return;
    }

    if (user.user_role !== resolvedUserRole) {
      router.replace(ROLE_HOME[user.user_role] ?? '/dashboard');
    }
  }, [isLoading, resolvedUserRole, router, user]);

  useEffect(() => {
    sidebarItems.forEach((item) => {
      void router.prefetch(item.href);
    });
  }, [router, sidebarItems]);

  useEffect(() => {
    if (resolvedUserRole !== 'trainee' || !token) {
      setSidebarBadgeMap({});
      return;
    }

    let isMounted = true;

    const loadSidebarBadges = async () => {
      try {
        const response = await fetch('/api/notifications?limit=20', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json().catch(() => null)) as
          | { notifications?: Array<{ href?: string | null }> }
          | null;
        if (!isMounted) {
          return;
        }
        const notifications = payload?.notifications || [];
        const certificateBadge = notifications.filter((item) => {
          const href = item.href || '';
          return href.startsWith('/trainee/certificates') || href.startsWith('/trainee/reports?tab=certificates');
        }).length;
        const simFloorBadge = notifications.filter((item) => (item.href || '').startsWith('/trainee/sim-floor')).length;
        setSidebarBadgeMap({
          '/trainee/certificates': certificateBadge,
          '/trainee/sim-floor': simFloorBadge,
        });
      } catch {
        // Keep the rest of the workspace responsive when notifications are temporarily unavailable.
      }
    };

    void loadSidebarBadges();
    const intervalId = window.setInterval(() => {
      void loadSidebarBadges();
    }, 60000);

    let stream: EventSource | null = null;
    try {
      stream = openSimFloorRealtimeStream();
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (payload.type === 'session_changed' || payload.type === 'certificate_changed') {
            void loadSidebarBadges();
          }
        } catch {
          // Ignore malformed realtime payloads.
        }
      };
    } catch {
      // Realtime badges are optional; polling keeps this functional.
    }

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      stream?.close();
    };
  }, [resolvedUserRole, token]);

  const resolvedSidebarItems = sidebarItems.map((item) => ({
    ...item,
    badge: sidebarBadgeMap[item.href] ?? item.badge,
  }));

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const handleSidebarLinkClick = () => {
    if (typeof window !== 'undefined' && (window.innerWidth < 1024 || isHiddenSidebar)) {
      setSidebarOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (!user || user.user_role !== resolvedUserRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Redirecting to your workspace...</div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white_8%),var(--background))]" />
      <div className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_58%)]" />
      <Toaster position="top-right" richColors />
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setSidebarOpen(false)}
          className={`fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px] ${isHiddenSidebar ? '' : 'lg:hidden'}`}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground shadow-2xl backdrop-blur transition-transform duration-300 transform ${isMinifiedSidebar ? 'lg:w-20' : 'lg:w-64'} lg:max-w-none ${desktopSidebarStateClass} ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Logo Section */}
          <div className="px-6 py-6 border-b border-sidebar-border">
            <div className={`flex items-center gap-3 ${isMinifiedSidebar ? 'lg:justify-center' : ''}`}>
              <div className="w-10 h-10 rounded-lg bg-card ring-1 ring-border flex items-center justify-center overflow-hidden shadow-sm">
                <img
                  src="/st-peter-seal.png"
                  alt="St. Peter Velle Technical Training Center"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className={isMinifiedSidebar ? 'lg:hidden' : ''}>
                <h1 className="text-sm font-bold text-sidebar-foreground">Speech-Enabled BPO Platform</h1>
                <p className="text-xs text-muted-foreground capitalize">St. Peter Velle - {resolvedUserRole}</p>
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {resolvedSidebarItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={handleSidebarLinkClick}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isMinifiedSidebar ? 'lg:justify-center lg:px-3' : ''} ${
                  pathname === item.href
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm'
                    : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                {item.icon}
                <span className={`flex-1 ${isMinifiedSidebar ? 'lg:hidden' : ''}`}>{item.label}</span>
                  {item.badge && !isMinifiedSidebar ? (
                    <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                      {item.badge}
                    </span>
                  ) : null}
              </Link>
            ))}
          </nav>

          {/* Logout Button */}
          <div className="p-4 border-t border-sidebar-border">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg transition-colors"
            >
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className={`bg-background/88 backdrop-blur border-b border-border px-6 py-4 flex items-center justify-between shadow-sm ${
          dashboardSettings.fixedHeader ? 'sticky top-0 z-30' : ''
        }`}>
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className={`inline-flex items-center justify-center rounded-lg border border-border bg-background p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
              desktopMenuEnabled ? 'lg:inline-flex' : 'lg:hidden'
            }`}
            aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
            title={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <h1 className="text-xl font-bold text-foreground hidden lg:block">
            Dashboard
          </h1>

          {/* Right Section */}
          <div className="flex items-center gap-6">
            <NotificationBell />
            <ProfileManagementDialog />
          </div>
        </header>

        {isTopNavigation ? (
          <div className="hidden border-b border-border bg-background/88 backdrop-blur lg:block">
            <div className={`mx-auto w-full px-6 ${contentWidthClass}`}>
              <nav className="overflow-x-auto py-3">
                <div className="flex min-w-max items-center gap-2">
                  {resolvedSidebarItems.map((item) => (
                    <Link
                      key={`top-${item.href}`}
                      href={item.href}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                        pathname === item.href
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </nav>
            </div>
          </div>
        ) : null}

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className={`mx-auto w-full p-6 ${contentWidthClass}`}>
            <div className="rounded-2xl border border-border bg-card/98 shadow-xl p-6 text-card-foreground">
              {children}
            </div>
          </div>
        </main>
      </div>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {buddyOpen && (
          <StPeterBuddyChat
            variant="widget"
            onClose={() => setBuddyOpen(false)}
          />
        )}

        <button
          type="button"
          onClick={() => setBuddyOpen((prev) => !prev)}
          className="group inline-flex items-center gap-3 rounded-full border border-blue-200 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-900 shadow-2xl backdrop-blur transition hover:border-blue-300 hover:bg-white"
          aria-label="Toggle St Peter Buddy"
          title="Open St Peter Buddy"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg transition group-hover:bg-blue-800">
            {buddyOpen ? <X size={18} /> : <MessageCircle size={18} />}
          </span>
          <span className="hidden sm:inline">St Peter Buddy</span>
          <Bot size={16} className="hidden text-blue-700 sm:inline" />
        </button>
      </div>
    </div>
  );
}
