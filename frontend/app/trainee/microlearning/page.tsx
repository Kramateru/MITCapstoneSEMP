'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { RouteLoadingState } from '@/app/components/ui/route-loading-state';
import { traineeSidebarItems } from '@/app/trainee/nav';
import dynamic from 'next/dynamic';

const MicrolearningHub = dynamic(
  () => import('@/app/components/trainee/microlearning-hub'),
  {
    ssr: false,
    loading: () => <RouteLoadingState label="Loading learning workspace..." />,
  },
);

export default function TraineeMicrolearningPage() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <MicrolearningHub />
    </DashboardLayout>
  );
}
