'use client';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { ProfilePageContent } from '@/app/components/shared/profile-page';

export default function AdminProfilePage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <ProfilePageContent roleLabel="admin" />
    </DashboardLayout>
  );
}
