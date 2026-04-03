'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import AdminCertificationSettings from '@/app/components/admin/admin-certification-settings';
import { adminSidebarItems } from '@/app/admin/nav';

export default function AdminCertificationSettingsPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <div className="space-y-6">
        <AdminCertificationSettings />
      </div>
    </DashboardLayout>
  );
}
