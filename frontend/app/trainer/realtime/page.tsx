'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import TrainerAnalytics from '@/app/components/trainer/trainer-analytics';
import { trainerSidebarItems } from '@/app/trainer/nav';

export default function TrainerRealtimePage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <TrainerAnalytics />
    </DashboardLayout>
  );
}
