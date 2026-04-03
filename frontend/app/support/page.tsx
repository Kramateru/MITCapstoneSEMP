'use client'

import Link from 'next/link'
import { ArrowRight, Bot, ShieldCheck, Sparkles } from 'lucide-react'

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_54%),linear-gradient(180deg,#f9fbff_0%,#edf4ff_100%)] p-6 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">
                <Sparkles size={14} />
                St Peter Buddy
              </div>
              <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900">
                Role-aware AI support for the platform
              </h1>
              <p className="mt-4 text-base leading-8 text-slate-600">
                St Peter Buddy is the shared AI support assistant for trainees,
                trainers, and admins. It gives role-specific guidance for system
                workflows, speech activities, grading, configuration, and
                reporting, and it can accept typed or spoken support questions.
              </p>
            </div>

            <Link
              href="/support/chat"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-6 py-4 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-800"
            >
              Open St Peter Buddy
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg">
            <Bot className="text-blue-700" size={22} />
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Role-specific answers</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Trainees, trainers, and admins each receive answers aligned to
              their permitted system responsibilities.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg">
            <ShieldCheck className="text-blue-700" size={22} />
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Access-aware support</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              The assistant respects role boundaries so users are guided without
              exposing information meant for other levels.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-lg">
            <Sparkles className="text-blue-700" size={22} />
            <h2 className="mt-4 text-lg font-semibold text-slate-900">BPO-focused help</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              The assistant is tailored for speech-enabled training, simulated
              floor work, grading, coaching, and admin operations.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
