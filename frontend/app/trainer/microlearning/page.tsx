'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { RouteLoadingState } from '@/app/components/ui/route-loading-state';
import { trainerSidebarItems } from '@/app/trainer/nav';
import dynamic from 'next/dynamic';

const TrainerMicrolearningStudio = dynamic(
  () => import('@/app/components/trainer/microlearning-studio'),
  {
    ssr: false,
    loading: () => <RouteLoadingState label="Loading microlearning studio..." />,
  },
);

export default function MicrolearningManagementPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <TrainerMicrolearningStudio />
    </DashboardLayout>
  );
}
