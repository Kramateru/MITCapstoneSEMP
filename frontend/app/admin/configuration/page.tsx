'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { SettingsWorkspace } from '@/app/components/shared/settings-panel';
import { adminSidebarItems } from '@/app/admin/nav';

export default function AdminConfigurationPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <SettingsWorkspace userRole="admin" />
    </DashboardLayout>
  );
}
