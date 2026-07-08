import { redirect } from 'next/navigation'

export default function TrainerAssessmentHubLegacyPage() {
  redirect('/trainer/assessments?section=overview')
}
