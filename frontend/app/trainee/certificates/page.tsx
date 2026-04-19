'use client';

import { DashboardLayout } from '@/app/components/DashboardLayout';
import TraineeCertificatesWorkspace from '@/app/components/trainee/trainee-certificates-workspace';
import { traineeSidebarItems } from '@/app/trainee/nav';

export default function TraineeCertificatesPage() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <TraineeCertificatesWorkspace />
    </DashboardLayout>
  );
}
