'use client'

import { DashboardLayout } from '@/app/components/DashboardLayout'
import { RouteLoadingState } from '@/app/components/ui/route-loading-state'
import { trainerSidebarItems } from '@/app/trainer/nav'
import dynamic from 'next/dynamic'

const TrainerAnalytics = dynamic(
  () => import('@/app/components/trainer/trainer-analytics'),
  {
    ssr: false,
    loading: () => <RouteLoadingState label="Loading analytics..." />,
  },
)

export default function TrainerAnalyticsPage() {
  return (
    <DashboardLayout sidebarItems={trainerSidebarItems()} userRole="trainer">
      <TrainerAnalytics />
    </DashboardLayout>
  )
}
