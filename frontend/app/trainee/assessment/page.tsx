'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import MCQAssessment from '@/app/components/trainee/mcq-assessment'
import { traineeSidebarItems } from '@/app/trainee/nav'

export default function TraineeAssessmentPage() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <MCQAssessment />
    </DashboardLayout>
  )
}
