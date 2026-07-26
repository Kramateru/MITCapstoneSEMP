'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import { RouteLoadingState } from '@/app/components/ui/route-loading-state'
import { traineeSidebarItems } from '@/app/trainee/nav'
import dynamic from 'next/dynamic'

const TraineeAssessmentWorkspace = dynamic(
  () => import('@/app/components/assessment/trainee/trainee-assessment-workspace').then((mod) => mod.TraineeAssessmentWorkspace),
  {
    ssr: false,
    loading: () => <RouteLoadingState label="Loading assessments..." />,
  },
)

export default function Page() {
  return (
    <DashboardLayout sidebarItems={traineeSidebarItems} userRole="trainee">
      <TraineeAssessmentWorkspace />
    </DashboardLayout>
  )
}
