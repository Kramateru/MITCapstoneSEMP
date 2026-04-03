'use client';

import TraineeDashboardPage from '@/app/trainee/dashboard/page';

export default function TraineeDashboard({ initialTab }: { initialTab?: string } = {}) {
  void initialTab;
  return <TraineeDashboardPage />;
}
