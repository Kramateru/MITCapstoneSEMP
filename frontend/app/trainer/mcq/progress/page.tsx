import { redirect } from 'next/navigation';

export default function TrainerMcqProgressPage() {
  redirect('/trainer/assessments?panel=assigned');
}
