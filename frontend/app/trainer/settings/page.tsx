'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { SettingsWorkspace } from '@/app/components/shared/settings-panel';
import { trainerSidebarItems } from '@/app/trainer/nav';

export default function TrainerSettingsPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <SettingsWorkspace userRole="trainer" />
    </DashboardLayout>
  );
}
