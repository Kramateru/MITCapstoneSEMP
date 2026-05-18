'use client';

import NotificationBell from '@/app/components/shared/notification-bell';
import ProfileManagementDialog from '@/app/components/shared/profile-management-dialog';
import { Badge } from '@/app/components/ui/badge';
import { Toaster } from '@/app/components/ui/sonner';
import { useAuth } from '@/app/context/AuthContext';
import { openCallSimulationRealtimeStream } from '@/app/lib/assessment/call-simulation-client';
import { getRoleHomePath, navigateToPath } from '@/app/utils/auth-navigation';
import {
    applyUserSettingsToDocument,
    buildDefaultUserSettings,
    loadUserSettings,
    readCachedUserSettings,
    USER_SETTINGS_EVENT,
    type UserDashboardSettings,
} from '@/app/utils/user-settings';
import { LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface SidebarItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
  section?: string;
}

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
  const roleLabelMap = {
    trainee: 'Trainee Workspace',
    trainer: 'Trainer Workspace',
    admin: 'Admin Console',
  } as const;
  const roleDescriptionMap = {
    trainee: 'Assigned lessons, assessments, call practice, and coaching in one place.',
    trainer: 'Monitor trainee performance, batch health, and coaching follow-through.',
    admin: 'Oversee platform activity, training operations, and system readiness.',
  } as const;
  const roleWorkspaceHintMap = {
    trainee: 'Stay on top of your modules, mock calls, and coaching tasks.',
    trainer: 'Manage learning flow, reviews, and follow-up across your trainees.',
    admin: 'Track system readiness, learning delivery, and organization-wide signals.',
  } as const;
  const contentWidthClass = dashboardSettings.boxedLayout ? 'max-w-[1680px] 2xl:max-w-[1820px]' : 'max-w-none';
  const contentOuterSpacingClass = dashboardSettings.boxedLayout
    ? 'px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-7 xl:px-10 xl:py-8'
    : 'px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6 xl:px-7 xl:py-7';
  const contentInnerSpacingClass = dashboardSettings.boxedLayout ? 'p-5 sm:p-7 lg:p-9 xl:p-10' : 'p-5 sm:p-6 lg:p-8 xl:p-9';

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
      navigateToPath('/login');
      return;
    }

    if (user.user_role !== resolvedUserRole) {
      navigateToPath(getRoleHomePath(user.user_role));
    }
  }, [isLoading, resolvedUserRole, user]);

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
        const callSimulationBadge = notifications.filter((item) => (item.href || '').startsWith('/trainee/call-simulation')).length;
        setSidebarBadgeMap({
          '/trainee/certificates': certificateBadge,
          '/trainee/call-simulation': callSimulationBadge,
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
      stream = openCallSimulationRealtimeStream();
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
  const groupedSidebarItems = useMemo(() => {
    const groups = new Map<string, typeof resolvedSidebarItems>();

    resolvedSidebarItems.forEach((item) => {
      const section = item.section || 'Workspace';
      const items = groups.get(section);
      if (items) {
        items.push(item);
      } else {
        groups.set(section, [item]);
      }
    });

    return Array.from(groups.entries()).map(([section, items]) => ({ section, items }));
  }, [resolvedSidebarItems]);
  const isActivePath = useMemo(
    () => (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname],
  );
  const currentPageLabel = useMemo(() => {
    const bestMatch = [...resolvedSidebarItems]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => isActivePath(item.href));

    return bestMatch?.label || 'Workspace';
  }, [isActivePath, resolvedSidebarItems]);

  const handleLogout = () => {
    logout();
    navigateToPath('/login');
  };

  const handleSidebarLinkClick = () => {
    if (typeof window !== 'undefined' && (window.innerWidth < 1024 || isHiddenSidebar)) {
      setSidebarOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (!user || user.user_role !== resolvedUserRole) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Redirecting to your workspace...</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at top right, rgba(29,86,216,0.11), transparent 26%), radial-gradient(circle at bottom left, rgba(17,144,111,0.07), transparent 24%), linear-gradient(180deg, #fbfdff 0%, var(--background) 36%, #eef3f9 100%)',
        }}
      />
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
        className={`fixed inset-y-0 left-0 z-50 w-[19rem] max-w-[90vw] border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur transition-transform duration-300 transform ${isMinifiedSidebar ? 'lg:w-20' : 'lg:w-[19rem]'} lg:max-w-none ${desktopSidebarStateClass} ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)), radial-gradient(circle at top, rgba(59,130,246,0.18), transparent 22%)',
        }}
      >
        <div className="h-full flex flex-col">
          {/* Logo Section */}
          <div className="border-b border-sidebar-border px-5 py-5 sm:px-6 sm:py-6">
            <div className={`flex items-center gap-3 ${isMinifiedSidebar ? 'lg:justify-center' : ''}`}>
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white/92 ring-1 ring-white/15 shadow-sm">
                <img
                  src="/st-peter-seal.png"
                  alt="St. Peter Velle Technical Training Center"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className={isMinifiedSidebar ? 'lg:hidden' : ''}>
                <h1 className="text-[1.02rem] font-bold tracking-[-0.015em] text-white">Speech-Enabled BPO Platform</h1>
                <p className="mt-1 text-[0.8rem] leading-6 text-sidebar-foreground/74">St. Peter Velle Technical Training Center</p>
                <div className="mt-3 inline-flex rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/88">
                  {roleLabelMap[resolvedUserRole]}
                </div>
                <p className="mt-3 max-w-[16.5rem] text-[0.82rem] leading-6 text-sidebar-foreground/70">
                  {roleWorkspaceHintMap[resolvedUserRole]}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5 sm:px-4 sm:py-6">
            {groupedSidebarItems.map((group) => (
              <div key={group.section} className="space-y-2.5">
                {!isMinifiedSidebar ? (
                  <div className="px-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/54">
                    {group.section}
                  </div>
                ) : null}
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    onClick={handleSidebarLinkClick}
                    className={`group relative flex items-center gap-3.5 rounded-2xl px-4 py-3.5 transition-[background-color,color,transform,box-shadow,border-color] duration-200 hover:-translate-y-px ${isMinifiedSidebar ? 'lg:justify-center lg:px-3' : ''} ${
                      isActivePath(item.href)
                        ? 'border border-white/10 bg-white/11 text-white font-medium shadow-[0_18px_34px_-24px_rgba(0,0,0,0.55)] ring-1 ring-white/10'
                        : 'border border-transparent text-sidebar-foreground/82 hover:border-white/6 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}
                  >
                    {isActivePath(item.href) ? (
                      <span className="absolute left-1 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-white/80" />
                    ) : null}
                    <span className={isActivePath(item.href) ? 'text-white' : 'text-sidebar-foreground/82'}>
                      {item.icon}
                    </span>
                    <span className={`flex-1 text-[0.98rem] leading-6 ${isMinifiedSidebar ? 'lg:hidden' : ''}`}>{item.label}</span>
                    {item.badge && !isMinifiedSidebar ? (
                      <Badge variant="danger" className="min-w-6 justify-center px-2.5 py-1 text-[0.7rem]">
                        {item.badge}
                      </Badge>
                    ) : null}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          {/* Logout Button */}
          <div className="border-t border-sidebar-border p-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/6 bg-white/5 px-4 py-3.5 text-[0.98rem] text-sidebar-foreground/82 transition-[background-color,color,border-color] hover:border-white/10 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
        <header className={`workspace-topbar flex items-center justify-between gap-4 border-b border-border/80 px-4 py-3.5 shadow-sm sm:px-6 sm:py-4 lg:px-7 ${
          dashboardSettings.fixedHeader ? 'sticky top-0 z-30' : ''
        }`}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center rounded-xl border border-border bg-background p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
                desktopMenuEnabled ? 'lg:inline-flex' : 'lg:hidden'
              }`}
              aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              title={sidebarOpen ? 'Close menu' : 'Open menu'}
            >
              {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            <div className="min-w-0">
              <div className="hidden items-center gap-2 md:flex">
                <span className="rounded-full border border-primary/12 bg-primary/6 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary">
                  {roleLabelMap[resolvedUserRole]}
                </span>
                <Badge variant="info" className="text-[0.7rem]">
                  Live Workspace
                </Badge>
              </div>
              <h1 className="truncate text-[1.08rem] font-bold tracking-[-0.02em] text-foreground sm:text-[1.2rem] lg:text-[1.35rem] xl:text-[1.55rem]">
                {currentPageLabel}
              </h1>
              <p className="hidden text-sm leading-6 text-muted-foreground md:block">
                {roleDescriptionMap[resolvedUserRole]}
              </p>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-white/80 px-3.5 py-2.5 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.32)] sm:gap-4 lg:gap-5">
            <NotificationBell />
            <ProfileManagementDialog />
          </div>
        </header>

        {isTopNavigation ? (
          <div className="hidden border-b border-border bg-background/88 backdrop-blur lg:block">
            <div className={`mx-auto w-full px-4 sm:px-5 lg:px-6 ${contentWidthClass}`}>
              <nav className="overflow-x-auto py-3.5">
                <div className="flex min-w-max items-center gap-2.5">
                  {resolvedSidebarItems.map((item) => (
                    <Link
                      key={`top-${item.href}`}
                      href={item.href}
                      className={`inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-[0.96rem] font-medium transition-colors ${
                        isActivePath(item.href)
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
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
          <div className={`dashboard-page mx-auto w-full ${contentOuterSpacingClass} ${contentWidthClass}`}>
            <div
              className={`workspace-shell rounded-[1.25rem] sm:rounded-[1.45rem] lg:rounded-[1.55rem] text-card-foreground ${contentInnerSpacingClass}`}
            >
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
