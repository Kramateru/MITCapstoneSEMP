'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import AssessmentDashboard from '@/app/components/assessment/AssessmentDashboard'
import { trainerSidebarItems } from '@/app/trainer/nav'

export default function AssessmentDashboardPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <AssessmentDashboard />
    </DashboardLayout>
  )
}
