'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import MyCoaching from '@/app/components/trainee/my-coaching';
import { traineeSidebarItems } from '@/app/trainee/nav';

export default function TraineeCoachingPage() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <MyCoaching />
    </DashboardLayout>
  );
}
