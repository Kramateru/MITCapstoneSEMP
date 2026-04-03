import { redirect } from 'next/navigation';

export default function TrainerMcqProgressPage() {
  redirect('/trainer/mcq?panel=progress');
}
