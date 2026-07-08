'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { ProfilePageContent } from '@/app/components/shared/profile-page';
import { traineeSidebarItems } from '@/app/trainee/nav';

export default function TraineeProfilePage() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <ProfilePageContent roleLabel="trainee" />
    </DashboardLayout>
  );
}
