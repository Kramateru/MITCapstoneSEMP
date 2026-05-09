'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import { TraineeAssessmentWorkspace } from '@/app/components/assessment/trainee/trainee-assessment-workspace'
import { traineeSidebarItems } from '@/app/trainee/nav'

export default function TraineeAssessmentPage() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <TraineeAssessmentWorkspace />
    </DashboardLayout>
  )
}
