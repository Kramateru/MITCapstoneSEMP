'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import AnalyticsDashboard from '@/app/components/admin/analytics-dashboard';
import { adminSidebarItems } from '@/app/admin/nav';

export default function AdminAnalyticsPage() {
  return (
    <DashboardLayout sidebarItems={adminSidebarItems} userRole="admin">
      <AnalyticsDashboard />
    </DashboardLayout>
  );
}
