'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import MicrolearningHub from '@/app/components/trainee/microlearning-hub';
import { traineeSidebarItems } from '@/app/trainee/nav';

export default function TraineeMicrolearningPage() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <MicrolearningHub />
    </DashboardLayout>
  );
}
