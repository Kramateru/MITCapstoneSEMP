'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { StPeterBuddyChat } from '@/app/components/shared/st-peter-buddy-chat'

export default function SupportChatPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_52%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-6 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white"
          >
            <ChevronLeft size={16} />
            Back to Dashboard
          </Link>
          <span className="rounded-full bg-blue-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-800">
            AI Support
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <StPeterBuddyChat variant="page" />

          <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              St Peter Buddy
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              A role-aware AI assistant for St. Peter Life Plan and Chapels inside the
              Speech-Enabled BPO Platform. It adjusts answers for trainee, trainer, and
              admin users, keeps replies concise for text to speech, and flags the right
              department for claims, sales, customer accounts, or IT issues.
            </p>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold text-slate-900">What it handles</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Give users one assistant for basic plan FAQs, training support,
                  role-aware guidance, and department routing inside the platform.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold text-slate-900">Role support</h2>
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  <li>Trainee: learning modules, basic plan FAQs, navigation</li>
                  <li>Trainer: teaching guidance, routing procedures, performance metrics</li>
                  <li>Admin: system health, routing oversight, sensitive summaries</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <h2 className="text-sm font-semibold text-blue-900">Routing Behavior</h2>
                <p className="mt-2 text-sm text-blue-800">
                  Tags urgent death claims to Claims, new plan and pricing questions to
                  Sales, payment or account updates to Customer Accounts, and platform
                  bugs to IT Support.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
