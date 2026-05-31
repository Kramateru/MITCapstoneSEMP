'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { ProfilePageContent } from '@/app/components/shared/profile-page';
import { trainerSidebarItems } from '@/app/trainer/nav';

export default function TrainerProfilePage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <ProfilePageContent roleLabel="trainer" />
    </DashboardLayout>
  );
}
