import { redirect } from 'next/navigation';

export default function TrainerMcqManagerPage() {
  redirect('/trainer/assessments?panel=builder');
}
