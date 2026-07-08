import { redirect } from 'next/navigation';

export default function TrainerMcqAssignPage() {
  redirect('/trainer/assessments?panel=question-set');
}
