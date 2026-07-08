'use client';

import TrainerDashboardPage from '@/app/trainer/dashboard/page';

export default function TrainerDashboard({ initialTab }: { initialTab?: string } = {}) {
  void initialTab;
  return <TrainerDashboardPage />;
}
