'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import { RouteLoadingState } from '@/app/components/ui/route-loading-state'
import { trainerSidebarItems } from '@/app/trainer/nav'
import dynamic from 'next/dynamic'

const TrainerAssessmentStudio = dynamic(
  () => import('@/app/components/assessment/trainer/trainer-assessment-studio').then((mod) => mod.TrainerAssessmentStudio),
  {
    ssr: false,
    loading: () => <RouteLoadingState label="Loading assessment studio..." />,
  },
)

export default function TrainerAssessmentPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <TrainerAssessmentStudio role="trainer" />
    </DashboardLayout>
  )
}
