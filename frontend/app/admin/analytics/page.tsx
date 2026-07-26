'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import { RouteLoadingState } from '@/app/components/ui/route-loading-state';
import { adminSidebarItems } from '@/app/admin/nav';
import dynamic from 'next/dynamic';

const AnalyticsDashboard = dynamic(
  () => import('@/app/components/admin/analytics-dashboard'),
  {
    ssr: false,
    loading: () => <RouteLoadingState label="Loading analytics..." />,
  },
);

export default function AdminAnalyticsPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <AnalyticsDashboard />
    </DashboardLayout>
  );
}
