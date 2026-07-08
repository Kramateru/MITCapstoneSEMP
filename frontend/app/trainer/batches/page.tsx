'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import BatchManagement from '@/app/components/trainer/batch-management';
import { trainerSidebarItems } from '@/app/trainer/nav';

export default function TrainerBatchesPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <BatchManagement />
    </DashboardLayout>
  );
}
