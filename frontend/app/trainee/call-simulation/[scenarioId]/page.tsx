import { redirect } from 'next/navigation'

export default async function TraineeCallSimulationScenarioPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>
}) {
  const { scenarioId } = await params
  redirect(`/trainee/call-simulation?scenarioId=${encodeURIComponent(scenarioId)}`)
}
