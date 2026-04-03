'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import InteractionReview from '@/app/components/trainer/interaction-review';
import { trainerSidebarItems } from '@/app/trainer/nav';

export default function TrainerGradingPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <InteractionReview />
    </DashboardLayout>
  );
}
