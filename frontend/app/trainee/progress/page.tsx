'use client'

import { TraineeAssessmentWorkspace } from '@/app/components/assessment/trainee/trainee-assessment-workspace'
import { DashboardLayout } from '@/app/components/DashboardLayout'
import { traineeSidebarItems } from '@/app/trainee/nav'

export default function TraineeProgressPage() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <TraineeAssessmentWorkspace initialTab="progress" />
    </DashboardLayout>
  )
}
