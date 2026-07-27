'use client';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import AdminCertificationSettings from '@/app/components/admin/admin-certification-settings';

export default function AdminCertificationSettingsPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-4">
        <AdminCertificationSettings />
      </div>
    </DashboardLayout>
  );
}
