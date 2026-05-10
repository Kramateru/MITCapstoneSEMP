'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import TrainerMcqWorkspace from '@/app/components/trainer/trainer-mcq-workspace'
import { trainerSidebarItems } from '@/app/trainer/nav'

export default function TrainerAssessmentPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <TrainerMcqWorkspace />
    </DashboardLayout>
  )
}
