'use client'

import { useAuth } from '@/app/context/AuthContext'
import { navigateToPath } from '@/app/utils/auth-navigation'
import { useEffect } from 'react'

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        navigateToPath('/dashboard')
      } else {
        navigateToPath('/login')
      }
    }
  }, [isLoading, isAuthenticated])

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_28%),linear-gradient(180deg,#0d1f37_0%,#132846_42%,#edf3f9_220%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent_36%)]" />

      <div className="relative w-full max-w-3xl rounded-[2rem] border border-white/12 bg-white/10 p-8 text-center shadow-[0_40px_120px_-52px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-10">
        <div className="space-y-3">
          <span className="inline-flex rounded-full border border-white/14 bg-white/8 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-sky-100">
            Speech-Enabled Microlearning Platform
          </span>
          <h1 className="text-balance text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
            Preparing trainees for real customer conversations
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
            Loading your workspace with microlearning, assessments, mock calls, and coaching progress.
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/18 border-t-sky-300" />
          <p className="text-sm font-medium text-slate-200">Redirecting to your dashboard...</p>
        </div>
      </div>
    </div>
  )
}
