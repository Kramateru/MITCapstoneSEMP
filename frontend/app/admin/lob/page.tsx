'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import LOBManagement from '@/app/components/admin/lob-management';
import { adminSidebarItems } from '@/app/admin/nav';

export default function AdminLobPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <LOBManagement />
    </DashboardLayout>
  );
}
