'use client'

import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import { useAuth } from '@/app/context/AuthContext'

export default function LoginPage() {
  const router = useRouter()
  const { login, user, isAuthenticated } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.must_change_password) {
        router.push('/trainee/settings')
      } else {
        const dashboardMap: Record<string, string> = {
          'admin': '/admin/dashboard',
          'trainer': '/trainer/dashboard',
          'trainee': '/trainee/dashboard',
        }
        const path = dashboardMap[user.user_role || 'trainee'] || '/dashboard'
        router.push(path)
      }
    }
  }, [isAuthenticated, user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    
    if (!password) {
      setError('Password is required')
      return
    }

    setIsLoading(true)

    try {
      await login(email, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message)
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-screen overflow-x-hidden">
      {/* Background Video */}
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

      {/* Overlay Gradients */}
      <div className="absolute inset-0 bg-slate-950/50" />
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/40 via-slate-950/40 to-black/60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.2),transparent_50%)]" />

      {/* Centered Login Container */}
      <div className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-2 py-4 sm:px-6 sm:py-8">
        {/* Main Card */}
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl sm:max-w-lg sm:p-8 md:max-w-lg">
          {/* Header Section */}
          <div className="mb-6 flex flex-col items-center space-y-3 text-center sm:mb-8 sm:space-y-4">
            {/* Logo */}
            <div className="flex items-center justify-center">
              <div className="relative h-16 w-16 flex-shrink-0 sm:h-20 sm:w-20">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-400 opacity-20 blur-lg" />
                <div className="relative h-full w-full rounded-full border-2 border-white bg-white/95 p-2 shadow-lg">
                  <img
                    src="/st-peter-seal.png"
                    alt="St. Peter Velle Technical Training Center"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            </div>

            {/* Institution Name and Title */}
            <div className="space-y-1 sm:space-y-2">
              <h1 className="text-2xl font-bold text-white sm:text-2xl md:text-3xl">
                Language Assessment
              </h1>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">
                Microlearning Platform
              </p>
              <p className="text-xs font-medium text-white/90 sm:text-sm md:text-sm">
                St. Peter Velle Technical Training Center, Inc.
              </p>
            </div>

            {/* Contact Info */}
            <div className="w-full space-y-1 border-t border-white/10 pt-3 sm:pt-4">
              <p className="text-xs text-slate-200 leading-relaxed sm:text-xs">
                #92 Mc Arthur Highway, Marulas, Valenzuela, Philippines 1440
              </p>
              <p className="text-xs text-slate-300 leading-relaxed sm:text-xs">
                Phone: 0960 545 6293 | Email: stpetervelle2003@yahoo.com.ph
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="mb-4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent sm:mb-6" />

          {/* Form Section */}
          <div className="mb-4 space-y-1 text-center sm:mb-6">
            <h2 className="text-xl font-bold text-white sm:text-xl md:text-2xl">Welcome Back</h2>
            <p className="text-sm text-slate-300 sm:text-sm">
              Sign in to your training account
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 backdrop-blur-sm">
              <div className="h-5 w-5 flex-shrink-0 rounded-full bg-red-500" />
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5 sm:space-y-2">
              <label htmlFor="email" className="block text-sm font-semibold text-slate-100 sm:text-sm">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@company.com"
                className="w-full rounded-lg border border-white/20 bg-white/8 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 transition sm:py-3 sm:px-4 focus:border-blue-400 focus:bg-white/12 focus:outline-none focus:ring-2 focus:ring-blue-400/50 disabled:opacity-50"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-1.5 sm:space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold text-slate-100 sm:text-sm">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={isLoading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  className="w-full rounded-lg border border-white/20 bg-white/8 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-slate-400 transition sm:py-3 sm:px-4 sm:pr-12 focus:border-blue-400 focus:bg-white/12 focus:outline-none focus:ring-2 focus:ring-blue-400/50 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 sm:right-3"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full overflow-hidden rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 font-semibold text-white shadow-lg transition hover:from-blue-700 hover:to-blue-800 hover:shadow-blue-500/20 disabled:from-slate-700 disabled:to-slate-700 disabled:opacity-60 sm:py-3"
            >
              <div className="flex items-center justify-center gap-2">
                <LogIn size={18} />
                <span className="text-sm sm:text-base">{isLoading ? 'Signing In...' : 'Sign In'}</span>
              </div>
              {isLoading && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-4 border-t border-white/10 pt-3 text-center text-xs text-slate-400 sm:mt-6 sm:pt-4">
            <p>Copyright 2026 Speech-Enabled Microlearning Platform</p>
            <p>All rights reserved</p>
          </div>
        </div>
      </div>
    </div>
  )
}
