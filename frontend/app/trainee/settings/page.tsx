'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { SettingsWorkspace } from '@/app/components/shared/settings-panel';
import { traineeSidebarItems } from '@/app/trainee/nav';

export default function TraineeSettingsPage() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <SettingsWorkspace userRole="trainee" />
    </DashboardLayout>
  );
}
