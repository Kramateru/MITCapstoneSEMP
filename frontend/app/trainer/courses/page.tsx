'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import AssignContent from '@/app/components/trainer/assign-content';
import { trainerSidebarItems } from '@/app/trainer/nav';

export default function TrainerCoursesPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <AssignContent />
    </DashboardLayout>
  );
}
