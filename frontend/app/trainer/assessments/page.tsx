'use client'

import { TrainerAssessmentStudio } from '@/app/components/assessment/trainer/trainer-assessment-studio'
import { DashboardLayout } from '@/app/components/DashboardLayout'
import { trainerSidebarItems } from '@/app/trainer/nav'

export default function TrainerAssessmentPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <TrainerAssessmentStudio />
    </DashboardLayout>
  )
}
