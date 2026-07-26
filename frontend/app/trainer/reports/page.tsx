'use client'

import { RouteLoadingState } from '@/app/components/ui/route-loading-state'
import dynamic from 'next/dynamic'

const TrainerReportsPageContent = dynamic(
  () => import('@/app/components/trainer/trainer-reports-page-content'),
  {
    ssr: false,
    loading: () => <RouteLoadingState label="Loading reports..." />,
  },
)

export default function ReportsPage() {
  return <TrainerReportsPageContent />
}
