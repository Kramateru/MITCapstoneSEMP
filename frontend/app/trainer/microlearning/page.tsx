'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import TrainerMicrolearningStudio from '@/app/components/trainer/microlearning-studio';
import { trainerSidebarItems } from '@/app/trainer/nav';

export default function MicrolearningManagementPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <TrainerMicrolearningStudio />
    </DashboardLayout>
  );
}
