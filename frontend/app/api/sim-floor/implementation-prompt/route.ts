import { NextResponse } from 'next/server'

import { getSimFloorImplementationPrompt } from '@/app/lib/assessment/sim-floor-implementation-prompt'

export async function GET() {
  return NextResponse.json({
    title: 'Sim Floor Full Stack Implementation Prompt',
    source: 'frontend/app/lib/assessment/sim-floor-implementation-prompt.ts',
    prompt: getSimFloorImplementationPrompt(),
    notes: [
      'Use the trainer upload structure with Actor, Script, Score, and optional Branching Logic rows.',
      'Supabase is the system of record for scenario CRUD, session logs, audio storage, reports, and certificate linkage.',
      'The trainee must click the mic icon for each CSR turn, then pause while the Member script plays before continuing.',
      'Google Cloud Speech-to-Text is the ASR provider for CSR speech capture and turn transcription.',
      'Trainer verdicts must support Competent, Not Competent, and retake-driven attempt history until competency is reached.',
    ],
  })
}
