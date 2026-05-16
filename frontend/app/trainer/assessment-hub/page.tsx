'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import { TrainerAssessmentStudio } from '@/app/components/assessment/trainer/trainer-assessment-studio'
import { trainerSidebarItems } from '@/app/trainer/nav'

export default function TrainerAssessmentHubPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <TrainerAssessmentStudio role="trainer" />
    </DashboardLayout>
  )
}
