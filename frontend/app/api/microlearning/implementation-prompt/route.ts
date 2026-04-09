import { NextResponse } from 'next/server'

import { getMicrolearningImplementationPrompt } from '@/app/lib/assessment/microlearning-implementation-prompt'

export async function GET() {
  return NextResponse.json({
    title: 'Microlearning Full Stack Implementation Prompt',
    source: 'frontend/app/lib/assessment/microlearning-implementation-prompt.ts',
    prompt: getMicrolearningImplementationPrompt(),
    notes: [
      'Supabase is the system of record for microlearning category CRUD, module authoring, assignments, progress, reports, analytics, certificates, and uploaded assets.',
      'The default seed pack must include at least 10 BPO-focused modules with answers covering language, grammar, tone, empathy, pronunciation, escalation, billing, and product knowledge.',
      'Trainers must be able to assign one or more selected microlearning topics to a batch or a specific trainee.',
      'Passing microlearning completions must automatically appear in trainee certificate navigation, trainee reports, trainee analytics, and trainer-facing reports.',
      'Trainer reporting must expose progress per batch and per trainee.',
    ],
  })
}
