'use client';

import type { UserRole } from '@/app/types/user';

export type SidebarState = 'default' | 'locked' | 'minified' | 'hidden';
export type ThemeMode = 'default' | 'light' | 'dark';
export type FontSizeOption = 'SM' | 'MD' | 'LG' | 'XL';

export interface SystemSettingsPayload {
  primary_color?: string;
  default_theme?: string;
  sidebar_default_state?: SidebarState;
  default_layout?: string;
  system_wide_font_scale?: number;
  default_high_contrast?: boolean;
  enable_daltonism_mode?: boolean;
  company_name?: string | null;
}

export interface UserPreferencesPayload {
  theme?: string;
  layout?: string;
  big_font?: boolean;
  big_font_scale?: number;
  high_contrast?: boolean;
  daltonism_mode?: string;
  sidebar_state?: SidebarState;
  fixed_header?: boolean;
  sidebar_position?: string;
  compact_mode?: boolean;
  top_navigation?: boolean;
  boxed_layout?: boolean;
  theme_colors?: {
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
  };
}

export interface UserDashboardSettings {
  fixedHeader: boolean;
  fixedNavigation: boolean;
  minifyNavigation: boolean;
  hideNavigation: boolean;
  topNavigation: boolean;
  boxedLayout: boolean;
  biggerContentFont: boolean;
  highContrastText: boolean;
  daltonismMode: boolean;
  fontScale: number;
  fontSize: FontSizeOption;
  themeMode: ThemeMode;
  primaryColor: string;
}

export interface LoadedUserSettings {
  systemSettings: SystemSettingsPayload;
  userSettings: UserDashboardSettings;
}

export const USER_SETTINGS_EVENT = 'user-settings-updated';
const USER_SETTINGS_STORAGE_KEY = 'user-dashboard-settings';

export const FONT_SIZE_SCALE_MAP: Record<FontSizeOption, number> = {
  SM: 1.0,
  MD: 1.125,
  LG: 1.25,
  XL: 1.4,
};

export const THEME_COLOR_SWATCHES = [
  '#8b5cf6',
  '#ec4899',
  '#a3e635',
  '#3b82f6',
  '#0ea5e9',
  '#14b8a6',
  '#f43f5e',
  '#6b7280',
  '#818cf8',
  '#fb923c',
  '#64748b',
  '#84cc16',
  '#7c3aed',
  '#22c55e',
  '#facc15',
  '#1d4ed8',
];

const FALLBACK_SYSTEM_SETTINGS: SystemSettingsPayload = {
  primary_color: '#1e3a8a',
  default_theme: 'default',
  sidebar_default_state: 'default',
  default_layout: 'default',
  system_wide_font_scale: 1.0,
  default_high_contrast: false,
  enable_daltonism_mode: false,
  company_name: 'Speech-Enabled BPO Platform',
};

function clampFontScale(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 1.0;
  }

  return Math.max(1.0, Math.min(1.5, Number(value.toFixed(2))));
}

function normalizeThemeMode(value?: string | null): ThemeMode {
  if (value === 'light' || value === 'dark' || value === 'default') {
    return value;
  }

  return 'default';
}

function normalizeSidebarState(value?: string | null): SidebarState {
  if (value === 'locked' || value === 'minified' || value === 'hidden' || value === 'default') {
    return value;
  }

  return 'default';
}

function normalizeColor(value?: string | null) {
  return /^#[0-9A-Fa-f]{6}$/.test(value ?? '') ? value!.toUpperCase() : '#1E3A8A';
}

function fontSizeFromScale(scale: number): FontSizeOption {
  if (scale >= 1.34) {
    return 'XL';
  }
  if (scale >= 1.22) {
    return 'LG';
  }
  if (scale >= 1.08) {
    return 'MD';
  }
  return 'SM';
}

function getContrastColor(hex: string) {
  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 160 ? '#0F172A' : '#FFFFFF';
}

export function buildDefaultUserSettings(systemSettings: SystemSettingsPayload = FALLBACK_SYSTEM_SETTINGS): UserDashboardSettings {
  const sidebarState = normalizeSidebarState(systemSettings.sidebar_default_state);
  const fontScale = clampFontScale(systemSettings.system_wide_font_scale);
  const defaultLayout = systemSettings.default_layout ?? 'default';

  return {
    fixedHeader: false,
    fixedNavigation: sidebarState === 'locked',
    minifyNavigation: sidebarState === 'minified',
    hideNavigation: sidebarState === 'hidden',
    topNavigation: defaultLayout === 'top-navigation',
    boxedLayout: defaultLayout === 'boxed',
    biggerContentFont: fontScale > 1.0,
    highContrastText: Boolean(systemSettings.default_high_contrast),
    daltonismMode: Boolean(systemSettings.enable_daltonism_mode),
    fontScale,
    fontSize: fontSizeFromScale(fontScale),
    themeMode: normalizeThemeMode(systemSettings.default_theme),
    primaryColor: normalizeColor(systemSettings.primary_color),
  };
}

export function normalizeUserSettings(
  systemSettings: SystemSettingsPayload,
  userPreferences?: UserPreferencesPayload | null,
): UserDashboardSettings {
  const defaults = buildDefaultUserSettings(systemSettings);
  const sidebarState = normalizeSidebarState(userPreferences?.sidebar_state ?? systemSettings.sidebar_default_state);
  const fontScale = clampFontScale(
    userPreferences?.big_font_scale ??
      (userPreferences?.big_font ? 1.2 : systemSettings.system_wide_font_scale),
  );
  const layoutValue = userPreferences?.layout ?? systemSettings.default_layout ?? 'default';
  const topNavigation =
    typeof userPreferences?.top_navigation === 'boolean'
      ? userPreferences.top_navigation
      : layoutValue === 'top-navigation' || defaults.topNavigation;
  const boxedLayout =
    typeof userPreferences?.boxed_layout === 'boolean'
      ? userPreferences.boxed_layout
      : layoutValue === 'boxed' || defaults.boxedLayout;

  return {
    fixedHeader: Boolean(userPreferences?.fixed_header ?? defaults.fixedHeader),
    fixedNavigation: sidebarState === 'locked',
    minifyNavigation: sidebarState === 'minified',
    hideNavigation: sidebarState === 'hidden',
    topNavigation: Boolean(topNavigation),
    boxedLayout: Boolean(boxedLayout),
    biggerContentFont: Boolean(userPreferences?.big_font ?? fontScale > 1.0),
    highContrastText: Boolean(userPreferences?.high_contrast ?? defaults.highContrastText),
    daltonismMode: Boolean(
      userPreferences?.daltonism_mode
        ? userPreferences.daltonism_mode !== 'none'
        : defaults.daltonismMode,
    ),
    fontScale,
    fontSize: fontSizeFromScale(fontScale),
    themeMode: normalizeThemeMode(userPreferences?.theme ?? systemSettings.default_theme),
    primaryColor: normalizeColor(
      userPreferences?.theme_colors?.primary_color ?? systemSettings.primary_color,
    ),
  };
}

export function readCachedUserSettings() {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as UserDashboardSettings;
  } catch {
    return null;
  }
}

export function cacheUserSettings(settings: UserDashboardSettings) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function broadcastUserSettings(settings: UserDashboardSettings) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<UserDashboardSettings>(USER_SETTINGS_EVENT, { detail: settings }));
}

export function applyUserSettingsToDocument(settings: UserDashboardSettings) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = settings.themeMode === 'dark' || (settings.themeMode === 'default' && prefersDark);
  const primaryForeground = getContrastColor(settings.primaryColor);
  const computedFontSize = `${Math.round(16 * settings.fontScale)}px`;

  root.classList.toggle('dark', isDark);
  root.classList.toggle('high-contrast', settings.highContrastText);
  root.classList.toggle('daltonism-mode', settings.daltonismMode);

  root.style.fontSize = computedFontSize;
  root.style.setProperty('--font-size', computedFontSize);
  root.style.setProperty('--primary', settings.primaryColor);
  root.style.setProperty('--primary-foreground', primaryForeground);
  root.style.setProperty('--sidebar-primary', settings.primaryColor);
  root.style.setProperty('--sidebar-primary-foreground', primaryForeground);
  root.style.setProperty('--ring', settings.primaryColor);

  root.dataset.sidebarState = deriveSidebarState(settings);
  root.dataset.layoutMode = deriveLayoutValue(settings);
  root.dataset.fixedHeader = settings.fixedHeader ? 'true' : 'false';
}

function createAuthHeaders() {
  if (typeof window === 'undefined') {
    return {
      'Content-Type': 'application/json',
    };
  }

  const token = window.localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readResponseMessage(response: Response) {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === 'string') {
      return payload.detail;
    }
    if (typeof payload?.message === 'string') {
      return payload.message;
    }
  } catch {
    // Ignore JSON parsing failures and fall back to response status text.
  }

  return response.statusText || 'Request failed';
}

async function readJsonPayload<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  return (await response.json().catch(() => null)) as T | null;
}

export async function fetchUserSettingsBundle(): Promise<LoadedUserSettings> {
  const headers = createAuthHeaders();
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;

  const systemPromise = fetch('/api/settings/system', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const preferencesPromise = fetch('/api/settings/user/preferences', { headers });

  const [systemResponse, preferencesResponse] = await Promise.all([systemPromise, preferencesPromise]);

  let systemSettings = FALLBACK_SYSTEM_SETTINGS;
  if (systemResponse.ok) {
    const systemPayload = await readJsonPayload<SystemSettingsPayload>(systemResponse);
    systemSettings = {
      ...FALLBACK_SYSTEM_SETTINGS,
      ...(systemPayload || {}),
    };
  }

  if (!preferencesResponse.ok) {
    const fallbackSettings = buildDefaultUserSettings(systemSettings);
    cacheUserSettings(fallbackSettings);
    applyUserSettingsToDocument(fallbackSettings);
    broadcastUserSettings(fallbackSettings);
    return {
      systemSettings,
      userSettings: fallbackSettings,
    };
  }

  const userPreferences = (await readJsonPayload<UserPreferencesPayload>(preferencesResponse)) || {};
  const userSettings = normalizeUserSettings(systemSettings, userPreferences);

  cacheUserSettings(userSettings);
  applyUserSettingsToDocument(userSettings);
  broadcastUserSettings(userSettings);

  return {
    systemSettings,
    userSettings,
  };
}

export async function loadUserSettings() {
  const { userSettings } = await fetchUserSettingsBundle();
  return userSettings;
}

export function deriveSidebarState(settings: UserDashboardSettings): SidebarState {
  if (settings.hideNavigation) {
    return 'hidden';
  }
  if (settings.minifyNavigation) {
    return 'minified';
  }
  if (settings.fixedNavigation) {
    return 'locked';
  }
  return 'default';
}

export function deriveLayoutValue(settings: UserDashboardSettings) {
  if (settings.topNavigation) {
    return 'top-navigation';
  }
  if (settings.boxedLayout) {
    return 'boxed';
  }
  return 'default';
}

export async function saveUserSettings(settings: UserDashboardSettings) {
  const headers = createAuthHeaders();
  const sidebarState = deriveSidebarState(settings);
  const layoutValue = deriveLayoutValue(settings);
  const fontScale = clampFontScale(settings.fontScale);

  const responses = await Promise.all([
    fetch('/api/settings/sidebar-state', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        state: sidebarState,
        persist: true,
      }),
    }),
    fetch('/api/settings/layout-preferences', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        layout: layoutValue,
        sidebar_position: 'left',
        compact_mode: settings.minifyNavigation,
        fixed_header: settings.fixedHeader,
        top_navigation: settings.topNavigation,
        boxed_layout: settings.boxedLayout,
      }),
    }),
    fetch('/api/settings/accessibility', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        big_font: settings.biggerContentFont,
        big_font_scale: fontScale,
        high_contrast: settings.highContrastText,
        daltonism_mode: settings.daltonismMode ? 'deuteranopia' : 'none',
        focus_indicators: true,
        reduce_motion: false,
      }),
    }),
    fetch('/api/settings/theme', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        mode: settings.themeMode,
        primary_color: normalizeColor(settings.primaryColor),
      }),
    }),
  ]);

  for (const response of responses) {
    if (!response.ok) {
      throw new Error(await readResponseMessage(response));
    }
  }

  const normalizedSettings: UserDashboardSettings = {
    ...settings,
    fontScale,
    fontSize: fontSizeFromScale(fontScale),
    primaryColor: normalizeColor(settings.primaryColor),
  };

  cacheUserSettings(normalizedSettings);
  applyUserSettingsToDocument(normalizedSettings);
  broadcastUserSettings(normalizedSettings);

  return normalizedSettings;
}

export function createSettingsPageIntro(userRole: UserRole) {
  if (userRole === 'admin') {
    return 'Adjust your workspace layout, accessibility, and theme settings and keep those preferences saved to your account.';
  }
  if (userRole === 'trainer') {
    return 'Tune the training workspace layout, accessibility, and theme settings, then reuse the same saved preferences across trainer tools.';
  }
  return 'Adjust the learning workspace layout, accessibility, and theme settings and keep those preferences synced to your account.';
}
