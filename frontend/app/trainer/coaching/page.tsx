'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import TrainerCoachingHub from '@/app/components/trainer/coaching-hub';
import { trainerSidebarItems } from '@/app/trainer/nav';

export default function TrainerCoachingPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <TrainerCoachingHub defaultTab="hub" />
    </DashboardLayout>
  );
}
