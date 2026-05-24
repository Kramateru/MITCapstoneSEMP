import { redirect } from 'next/navigation'

export default function TrainerAssessmentDashboardLegacyPage() {
  redirect('/trainer/assessments?section=overview')
}
