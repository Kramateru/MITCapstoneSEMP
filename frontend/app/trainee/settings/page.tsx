'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { SettingsWorkspace } from '@/app/components/shared/settings-panel';
import { traineeSidebarItems } from '@/app/trainee/nav';

export default function TraineeSettingsPage() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Manage your training preferences and save your workspace settings for your trainee account.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="mb-4 text-xl font-semibold text-foreground">System Preferences</h2>
            <SettingsWorkspace userRole="trainee" showTitle={false} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
