'use client';

import AdminDashboardPage from '@/app/admin/dashboard/page';

export default function AdminDashboard({ initialTab }: { initialTab?: string } = {}) {
  void initialTab;
  return <AdminDashboardPage />;
}
