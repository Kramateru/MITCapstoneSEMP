'use client';

import { adminSidebarItems } from '@/app/admin/nav';
import { DashboardLayout } from '@/app/components/DashboardLayout';
import { RouteLoadingState } from '@/app/components/ui/route-loading-state';
import dynamic from 'next/dynamic';

const AdminLearningReportWorkspace = dynamic(
  () => import('@/app/components/admin/admin-learning-report-workspace').then((mod) => mod.AdminLearningReportWorkspace),
  {
    ssr: false,
    loading: () => <RouteLoadingState label="Loading reports..." />,
  },
);

export default function AdminReportsPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <AdminLearningReportWorkspace />
    </DashboardLayout>
  );
}
