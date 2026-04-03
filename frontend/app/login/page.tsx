'use client'

import React, { useState } from 'react'
import { Eye, EyeOff, LogIn } from 'lucide-react'

import { useAuth } from '@/app/context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(email, password)
      window.location.href = '/dashboard'
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 text-white">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      >
        <source src="/loginbg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-slate-950/45" />
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/55 via-slate-950/30 to-black/60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.28),transparent_52%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(251,191,36,0.14),transparent_42%)]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-[28px] border border-white/20 bg-slate-950/48 p-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:p-10">
          <div className="mb-8 text-center">
            <div className="mb-5 flex items-center justify-center gap-3">
              <div className="h-14 w-14 rounded-full bg-white/92 p-2 ring-2 ring-yellow-300/80 shadow-lg">
                <img
                  src="/st-peter-seal.png"
                  alt="St. Peter Velle Technical Training Center"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="text-left">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Language Assessment
                </h1>
                <p className="text-xs uppercase tracking-[0.24em] text-blue-100/80">
                  Microlearning Platform
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold text-white/95">
              St. Peter Velle Technical Training Center, Inc.
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-200/90">
              #92 Mc Arthur Highway Marulas, Valenzuela, Philippines, 1440
            </p>
            <p className="text-xs text-slate-200/90">
              0960 545 6293 | stpetervelle2003@yahoo.com.ph
            </p>
          </div>

          <div className="rounded-2xl border border-white/12 bg-white/10 p-6 shadow-2xl backdrop-blur-md">
            <h2 className="mb-2 text-center text-2xl font-bold text-white">
              Welcome Back
            </h2>
            <p className="mb-6 text-center text-sm text-slate-200/85">
              Sign in to continue to your training workspace.
            </p>

            {error && (
              <div className="mb-6 rounded-lg border border-red-300/35 bg-red-500/15 px-4 py-3 text-sm text-red-100 backdrop-blur-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-100">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@company.com"
                  className="w-full rounded-lg border border-white/16 bg-white/14 px-4 py-3 text-white placeholder:text-slate-300/70 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-100">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="********"
                    className="w-full rounded-lg border border-white/16 bg-white/14 px-4 py-3 pr-12 text-white placeholder:text-slate-300/70 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-200/85 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-medium text-white ring-1 ring-yellow-300/60 transition hover:bg-blue-800 hover:shadow-lg disabled:opacity-50"
              >
                <LogIn size={18} />
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-slate-200/85">
            (c) 2026 Speech-Enabled Microlearning Platform. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
