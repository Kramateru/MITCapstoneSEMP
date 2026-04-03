'use client';

import { useEffect, useState } from 'react';
import { Loader2, Palette, RefreshCw, Save, Settings, Type, Layout, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';
import type { UserRole } from '@/app/types/user';
import {
  FONT_SIZE_SCALE_MAP,
  THEME_COLOR_SWATCHES,
  buildDefaultUserSettings,
  createSettingsPageIntro,
  fetchUserSettingsBundle,
  saveUserSettings,
  type FontSizeOption,
  type SystemSettingsPayload,
  type UserDashboardSettings,
} from '@/app/utils/user-settings';

interface SettingsWorkspaceProps {
  userRole?: UserRole;
  showTitle?: boolean;
  onSettingsChange?: (settings: UserDashboardSettings) => void;
}

interface SettingsPanelProps extends SettingsWorkspaceProps {
  triggerLabel?: string;
}

function SettingToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card/90 px-4 py-4 shadow-sm">
      <div className="space-y-1">
        <Label className="text-sm font-semibold text-foreground">{title}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ChoiceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted'
      }`}
    >
      {label}
    </button>
  );
}

function ThemeModeCard({
  active,
  label,
  description,
  previewClassName,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  previewClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        active
          ? 'border-primary bg-primary/10 shadow-sm'
          : 'border-border bg-card/80 hover:border-primary/40 hover:bg-muted/50'
      }`}
    >
      <div className={`mb-3 h-20 rounded-xl border ${previewClassName}`} />
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </button>
  );
}

function SummarySection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">{title}</h4>
      <ul className="space-y-2 pl-5 text-sm text-foreground">
        {items.map((item) => (
          <li key={`${title}-${item}`} className="list-disc">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsWorkspace({
  userRole = 'trainee',
  showTitle = true,
  onSettingsChange,
}: SettingsWorkspaceProps) {
  const [systemSettings, setSystemSettings] = useState<SystemSettingsPayload | null>(null);
  const [settings, setSettings] = useState<UserDashboardSettings>(() => buildDefaultUserSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const bundle = await fetchUserSettingsBundle();
        if (!isMounted) {
          return;
        }

        setSystemSettings(bundle.systemSettings);
        setSettings(bundle.userSettings);
        onSettingsChange?.(bundle.userSettings);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load settings';
        toast.error(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [onSettingsChange]);

  const updateSettings = (updater: (current: UserDashboardSettings) => UserDashboardSettings) => {
    setSettings((current) => updater(current));
  };

  const handleNavigationToggle = (mode: 'fixedNavigation' | 'minifyNavigation' | 'hideNavigation') => {
    updateSettings((current) => {
      const nextValue = !current[mode];
      return {
        ...current,
        fixedNavigation: mode === 'fixedNavigation' ? nextValue : false,
        minifyNavigation: mode === 'minifyNavigation' ? nextValue : false,
        hideNavigation: mode === 'hideNavigation' ? nextValue : false,
      };
    });
  };

  const handleFontSizeChange = (fontSize: FontSizeOption) => {
    updateSettings((current) => ({
      ...current,
      fontSize,
      fontScale: FONT_SIZE_SCALE_MAP[fontSize],
      biggerContentFont: fontSize !== 'SM',
    }));
  };

  const handleReset = () => {
    const resetSettings = buildDefaultUserSettings(systemSettings ?? undefined);
    setSettings(resetSettings);
    toast.success('Settings reset to the current system defaults. Save to apply the reset.');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const savedSettings = await saveUserSettings(settings);
      setSettings(savedSettings);
      onSettingsChange?.(savedSettings);
      toast.success('Settings saved to the database.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save settings';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const layoutItems = [
    settings.fixedHeader ? 'Fixed Header' : 'Standard Header',
    settings.fixedNavigation ? 'Fixed Navigation' : null,
    settings.minifyNavigation ? 'Minify Navigation' : null,
    settings.hideNavigation ? 'Hide Navigation' : null,
    settings.topNavigation ? 'Top Navigation' : null,
    settings.boxedLayout ? 'Boxed Layout' : null,
  ].filter(Boolean) as string[];

  const accessibilityItems = [
    settings.biggerContentFont ? 'Bigger Content Font' : null,
    settings.highContrastText ? 'High Contrast Text (WCAG 2 AA)' : null,
    settings.daltonismMode ? 'Daltonism Mode' : null,
    !settings.biggerContentFont && !settings.highContrastText && !settings.daltonismMode
      ? 'Standard readability profile'
      : null,
  ].filter(Boolean) as string[];

  const themeItems = [
    `Global Font Size: ${settings.fontSize}`,
    `Theme Color: ${settings.primaryColor}`,
    `Theme Mode: ${settings.themeMode === 'default' ? 'Default' : settings.themeMode === 'light' ? 'Light' : 'Dark'}`,
  ];

  return (
    <div className="space-y-6">
      {showTitle ? (
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Settings</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {createSettingsPageIntro(userRole)}
          </p>
        </div>
      ) : null}

      {loading ? (
        <Card className="border-border/70 bg-card/80">
          <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading saved settings from the database...
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_320px]">
          <div className="space-y-6">
            <Card className="border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layout className="size-5 text-primary" />
                  Layout Settings
                </CardTitle>
                <CardDescription>Change how the navigation and shell behave across your portal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SettingToggleRow
                  title="Fixed Header"
                  description="Keep the top header visible while you scroll through large pages."
                  checked={settings.fixedHeader}
                  onCheckedChange={(checked) => updateSettings((current) => ({ ...current, fixedHeader: checked }))}
                />
                <SettingToggleRow
                  title="Fixed Navigation"
                  description="Pin the left navigation in place for constant access."
                  checked={settings.fixedNavigation}
                  onCheckedChange={(checked) => {
                    void checked;
                    handleNavigationToggle('fixedNavigation');
                  }}
                />
                <SettingToggleRow
                  title="Minify Navigation"
                  description="Collapse the desktop sidebar to icons only and recover more working space."
                  checked={settings.minifyNavigation}
                  onCheckedChange={(checked) => {
                    void checked;
                    handleNavigationToggle('minifyNavigation');
                  }}
                />
                <SettingToggleRow
                  title="Hide Navigation"
                  description="Hide the sidebar by default and open it only when you need it."
                  checked={settings.hideNavigation}
                  onCheckedChange={(checked) => {
                    void checked;
                    handleNavigationToggle('hideNavigation');
                  }}
                />
                <SettingToggleRow
                  title="Top Navigation"
                  description="Move the desktop navigation from the left rail to a top navigation bar."
                  checked={settings.topNavigation}
                  onCheckedChange={(checked) => updateSettings((current) => ({ ...current, topNavigation: checked }))}
                />
                <SettingToggleRow
                  title="Boxed Layout"
                  description="Wrap page content in a narrower centered container for easier reading on wide screens."
                  checked={settings.boxedLayout}
                  onCheckedChange={(checked) => updateSettings((current) => ({ ...current, boxedLayout: checked }))}
                />
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="size-5 text-primary" />
                  Accessibility
                </CardTitle>
                <CardDescription>Save visual accessibility preferences directly to your account.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SettingToggleRow
                  title="Bigger Content Font"
                  description="Increase the overall base text scale for improved readability."
                  checked={settings.biggerContentFont}
                  onCheckedChange={(checked) =>
                    updateSettings((current) => ({
                      ...current,
                      biggerContentFont: checked,
                      fontSize: checked ? (current.fontSize === 'SM' ? 'MD' : current.fontSize) : 'SM',
                      fontScale: checked
                        ? current.fontSize === 'SM'
                          ? FONT_SIZE_SCALE_MAP.MD
                          : current.fontScale
                        : FONT_SIZE_SCALE_MAP.SM,
                    }))
                  }
                />
                <SettingToggleRow
                  title="High Contrast Text"
                  description="Strengthen the contrast between text and background using a WCAG 2 AA-friendly profile."
                  checked={settings.highContrastText}
                  onCheckedChange={(checked) => updateSettings((current) => ({ ...current, highContrastText: checked }))}
                />
                <SettingToggleRow
                  title="Daltonism"
                  description="Use a more color-safe palette to make statuses easier to distinguish."
                  checked={settings.daltonismMode}
                  onCheckedChange={(checked) => updateSettings((current) => ({ ...current, daltonismMode: checked }))}
                />
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="size-5 text-primary" />
                  Theme & Typography
                </CardTitle>
                <CardDescription>Choose the global font size, color accent, and overall theme mode.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Type className="size-4 text-primary" />
                    Global Font Size
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['SM', 'MD', 'LG', 'XL'] as FontSizeOption[]).map((fontSize) => (
                      <ChoiceButton
                        key={fontSize}
                        active={settings.fontSize === fontSize}
                        label={fontSize}
                        onClick={() => handleFontSizeChange(fontSize)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">Theme Colors</div>
                  <div className="flex flex-wrap gap-3">
                    {THEME_COLOR_SWATCHES.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Select theme color ${color}`}
                        onClick={() => updateSettings((current) => ({ ...current, primaryColor: color }))}
                        className={`size-10 rounded-full border-2 transition ${
                          settings.primaryColor === color
                            ? 'border-foreground scale-105 shadow-sm'
                            : 'border-transparent hover:border-primary/40'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Selected color: <span className="font-semibold text-foreground">{settings.primaryColor}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">Theme Modes</div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <ThemeModeCard
                      active={settings.themeMode === 'default'}
                      label="Default"
                      description="Follow the platform default theme behavior."
                      previewClassName="bg-gradient-to-r from-white via-slate-100 to-slate-900"
                      onClick={() => updateSettings((current) => ({ ...current, themeMode: 'default' }))}
                    />
                    <ThemeModeCard
                      active={settings.themeMode === 'light'}
                      label="Light"
                      description="Use a bright workspace with strong legibility."
                      previewClassName="bg-white"
                      onClick={() => updateSettings((current) => ({ ...current, themeMode: 'light' }))}
                    />
                    <ThemeModeCard
                      active={settings.themeMode === 'dark'}
                      label="Dark"
                      description="Use a darker shell for low-light environments."
                      previewClassName="bg-slate-900"
                      onClick={() => updateSettings((current) => ({ ...current, themeMode: 'dark' }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit border-border/70 bg-card/95 shadow-sm xl:sticky xl:top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="size-5 text-primary" />
                Settings Overview
              </CardTitle>
              <CardDescription>
                Review the exact options that will be saved to your database profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SummarySection
                title="Layout Settings"
                items={layoutItems.length > 0 ? layoutItems : ['Default application shell']}
              />
              <SummarySection title="Accessibility" items={accessibilityItems} />
              <SummarySection title="Appearance" items={themeItems} />

              <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                These preferences apply to your <span className="font-semibold text-foreground capitalize">{userRole}</span> account and stay available after refresh or sign-in.
              </div>

              <div className="flex flex-col gap-3">
                <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>
                  <RefreshCw className="mr-2 size-4" />
                  Reset Settings
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function SettingsPanel({
  userRole = 'trainee',
  showTitle = false,
  onSettingsChange,
  triggerLabel = 'Settings',
}: SettingsPanelProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl overflow-hidden p-0">
        <div className="max-h-[88vh] overflow-y-auto px-6 py-6">
          <DialogHeader className="mb-6">
            <DialogTitle>Layout Settings</DialogTitle>
            <DialogDescription>
              Update the same saved layout, accessibility, font, and theme preferences used throughout the platform.
            </DialogDescription>
          </DialogHeader>
          <SettingsWorkspace
            userRole={userRole}
            showTitle={showTitle}
            onSettingsChange={onSettingsChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
