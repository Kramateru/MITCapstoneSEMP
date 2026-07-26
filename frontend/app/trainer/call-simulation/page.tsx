'use client'

import { RouteLoadingState } from '@/app/components/ui/route-loading-state'
import dynamic from 'next/dynamic'

const TrainerCallSimulationPageContent = dynamic(
  () => import('@/app/components/trainer/trainer-call-simulation-page-content'),
  {
    ssr: false,
    loading: () => <RouteLoadingState label="Loading Call Simulation..." />,
  },
)

export default function TrainerCallSimulationPage() {
  return <TrainerCallSimulationPageContent />
}
