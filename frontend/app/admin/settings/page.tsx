'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { SettingsWorkspace } from '@/app/components/shared/settings-panel';
import { adminSidebarItems } from '@/app/admin/nav';

export default function AdminSettingsPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Manage your admin workspace preferences and keep the same settings applied across the full admin portal.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="mb-4 text-xl font-semibold text-foreground">System Preferences</h2>
            <SettingsWorkspace userRole="admin" showTitle={false} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
