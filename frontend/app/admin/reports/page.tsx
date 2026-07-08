'use client';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { AdminLearningReportWorkspace } from '@/app/components/admin/admin-learning-report-workspace';

export default function AdminReportsPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <AdminLearningReportWorkspace />
    </DashboardLayout>
  );
}
