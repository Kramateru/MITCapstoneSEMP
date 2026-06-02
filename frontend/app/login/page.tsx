'use client'

import {
    AlertTriangle,
    Eye,
    EyeOff,
    LoaderCircle,
    LockKeyhole,
    LogIn,
    Mail,
    MapPin,
    Phone,
    ShieldCheck,
} from 'lucide-react'
import Image from 'next/image'
import { useEffect, useState, type FormEvent } from 'react'

import { readAndClearAuthNotice, useAuth } from '@/app/context/AuthContext'
import { getPostLoginPath, navigateToPath } from '@/app/utils/auth-navigation'
import {
    getHttpErrorMessage,
    getUnexpectedJsonResponseMessage,
    readHttpResponse,
} from '@/app/utils/http-response'

type AuthProviderStatus = {
  provider: 'supabase' | 'local'
  uses_supabase: boolean
  available: boolean
  credential_source: string
  message: string
}

const fieldBaseClassName =
  'h-14 w-full rounded-[20px] border border-slate-200 bg-slate-50/92 px-14 py-3.5 text-[0.98rem] text-slate-900 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.16)] transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300/40 disabled:cursor-not-allowed disabled:opacity-70 sm:h-15 sm:text-[1.02rem]'

export default function LoginPage() {
  const { login, user, isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasHydrated, setHasHydrated] = useState(false)
  const [providerStatus, setProviderStatus] = useState<AuthProviderStatus | null>(null)

  useEffect(() => {
    setHasHydrated(true)
    // Only show auth notice if there's a specific message about logout or forced action
    // Don't show generic session expired messages since they're often stale
    const authNotice = readAndClearAuthNotice()
    const normalizedAuthNotice = authNotice.toLowerCase()
    if (authNotice && normalizedAuthNotice.includes('logged out')) {
      setError(authNotice)
    } else if (
      authNotice &&
      (normalizedAuthNotice.includes('session has ended') ||
        normalizedAuthNotice.includes('session has expired') ||
        normalizedAuthNotice.includes('terminated'))
    ) {
      setError(authNotice)
    }
    // Silently discard other session messages - they're likely stale tokens
  }, [])

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && user) {
      navigateToPath(getPostLoginPath(user))
    }
  }, [isAuthLoading, isAuthenticated, user])

  useEffect(() => {
    const controller = new AbortController()

    async function loadProviderStatus() {
      try {
        const response = await fetch('/api/auth/provider-status', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = await readHttpResponse<AuthProviderStatus>(response)

        if (!response.ok) {
          throw new Error(
            getHttpErrorMessage(
              response,
              payload,
              'Unable to verify the credential source right now.',
            ),
          )
        }

        if (!payload.data) {
          throw new Error(
            getUnexpectedJsonResponseMessage(
              response,
              payload,
              'Unable to verify the credential source right now.',
            ),
          )
        }

        setProviderStatus(payload.data)
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return
        }

        setProviderStatus({
          provider: 'local',
          uses_supabase: false,
          available: false,
          credential_source: 'unknown',
          message:
            fetchError instanceof Error
              ? fetchError.message
              : 'Unable to verify the credential source right now.',
        })
      }
    }

    void loadProviderStatus()

    return () => controller.abort()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail) {
      setError('Email is required')
      return
    }

    if (!password) {
      setError('Password is required')
      return
    }

    setIsSubmitting(true)

    try {
      const signedInUser = await login(normalizedEmail, password)
      const redirectPath = getPostLoginPath(signedInUser)
      console.info('Login redirect destination:', {
        email: signedInUser.email,
        role: signedInUser.user_role,
        redirectPath,
      })
      if (!navigateToPath(redirectPath)) {
        setIsSubmitting(false)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message)
      setIsSubmitting(false)
    }
  }

  const isSessionChecking = hasHydrated && isAuthLoading
  const showProviderWarning =
    providerStatus !== null &&
    (providerStatus.provider !== 'supabase' || !providerStatus.available)
  const providerIsReady =
    providerStatus !== null &&
    providerStatus.provider === 'supabase' &&
    providerStatus.available

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
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

      <div className="absolute inset-0 bg-slate-950/62" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(30,41,59,0.4),rgba(15,23,42,0.72))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_38%)]" />

      <div className="relative z-10 flex min-h-screen items-start justify-center px-4 py-4 sm:px-6 sm:py-6 lg:items-center lg:px-8 lg:py-5">
        <div className="mx-auto grid w-full max-w-[74rem] overflow-hidden rounded-[30px] border border-white/16 bg-white/8 shadow-[0_42px_120px_-50px_rgba(0,0,0,0.96)] backdrop-blur-lg lg:h-[min(42rem,calc(100dvh-2.5rem))] lg:grid-cols-[1fr_0.94fr]">
          <section className="relative overflow-hidden bg-[linear-gradient(180deg,rgba(16,50,68,0.78),rgba(13,36,53,0.84))] px-6 py-6 sm:px-8 sm:py-7 lg:px-8 lg:py-7">
            <div aria-hidden="true" className="absolute inset-0">
              <div className="absolute left-[9%] top-[7%] h-16 w-16 rounded-[22px] bg-amber-100/18 blur-[1px]" />
              <div className="absolute right-[18%] top-[8%] h-36 w-5 rounded-full bg-white/4" />
              <div className="absolute left-[15%] top-[46%] h-64 w-64 rounded-full border border-white/4" />
              <div className="absolute right-[12%] top-[22%] h-34 w-4 rotate-45 rounded-full bg-white/4" />
              <div className="absolute left-[39%] bottom-[7%] h-32 w-5 rounded-full bg-white/4" />
            </div>

            <div className="relative flex h-full flex-col justify-between">
              <div className="relative mx-auto flex w-full max-w-[31rem] flex-col items-center text-center">
                <div className="relative mb-5 h-36 w-36 sm:h-44 sm:w-44 lg:h-52 lg:w-52">
                  <div className="absolute inset-0 rounded-full bg-white/14 blur-2xl" />
                  <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/16 bg-white/8 p-3 shadow-[0_30px_70px_-36px_rgba(15,23,42,0.95)] backdrop-blur-md">
                    <Image
                      src="/spvlogo.png"
                      alt="St. Peter Velle Technical Training Center logo"
                      width={220}
                      height={220}
                      priority
                      className="h-full w-full scale-[1.03] rounded-full object-cover"
                    />
                  </div>
                </div>
                <h1 className="mx-auto max-w-[28rem] text-balance text-[clamp(2rem,3.18vw,3.15rem)] leading-[0.94] font-bold tracking-[-0.05em] text-white">
                  <span className="block">Speech-Enabled</span>
                  <span className="mt-1.5 block text-[0.64em] tracking-[0.07em]">Microlearning Platform</span>
                </h1>
                <div className="mt-4 flex flex-col items-center gap-2.5">
                  <span className="h-1 w-18 rounded-full bg-amber-400" />
                </div>
              </div>

              <div className="relative mt-4 rounded-[26px] border border-white/12 bg-white/12 p-5 backdrop-blur-md sm:p-6 lg:mt-6">
                <div className="grid gap-3 text-slate-100">
                  <div className="flex items-start gap-4">
                    <MapPin className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
                    <p className="text-[1rem] font-medium leading-6 text-slate-100/96">
                      #92 Mc Arthur Highway, Marulas, Valenzuela, Philippines 1440
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Phone className="h-5 w-5 shrink-0 text-amber-300" />
                    <p className="text-[1rem] font-medium text-slate-100/94">0960 545 6293</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Mail className="h-5 w-5 shrink-0 text-amber-300" />
                    <p className="break-words text-[1rem] font-medium text-slate-100/94">
                      stpetervelle2003@yahoo.com.ph
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,251,255,0.82))] px-6 py-6 text-slate-900 backdrop-blur-xl sm:px-8 sm:py-7 lg:px-8 lg:py-7">
            <div className="mx-auto flex h-full w-full max-w-[31rem] flex-col justify-center">
              <div>
                <div
                  aria-label={providerIsReady ? 'Supabase connected' : 'Credential source check'}
                  title={providerIsReady ? 'Supabase connected' : 'Credential source check'}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
                    providerIsReady
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                      : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                  }`}
                >
                  {providerIsReady ? (
                    <ShieldCheck className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                </div>

                <h2 className="mt-4 text-[clamp(2.15rem,3.35vw,3rem)] font-bold tracking-[-0.04em] text-slate-900">
                  Welcome back
                </h2>
              </div>

              {showProviderWarning ? (
                <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="leading-6">
                      {providerStatus?.message || 'Unable to verify the credential source right now.'}
                    </p>
                  </div>
                </div>
              ) : null}

              {error ? (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mt-5 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                >
                  {error}
                </div>
              ) : null}

              {isSessionChecking ? (
                <div className="mt-5 rounded-[22px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  <div className="flex items-center gap-3">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span>Checking your saved session...</span>
                  </div>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="block text-sm font-bold uppercase tracking-[0.16em] text-slate-800"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      required
                      disabled={isSubmitting}
                      value={email}
                      onChange={(event) => {
                        if (error) {
                          setError('')
                        }
                        setEmail(event.target.value)
                      }}
                      placeholder="admin@stpetervelle.edu.ph"
                      className={fieldBaseClassName}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="block text-sm font-bold uppercase tracking-[0.16em] text-slate-800"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      disabled={isSubmitting}
                      value={password}
                      onChange={(event) => {
                        if (error) {
                          setError('')
                        }
                        setPassword(event.target.value)
                      }}
                      placeholder="Enter your password"
                      className={`${fieldBaseClassName} pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      disabled={isSubmitting}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300/35"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-amber-400 via-orange-400 to-orange-500 px-4 text-[1.06rem] font-semibold text-white shadow-[0_24px_55px_-28px_rgba(249,115,22,0.72)] transition hover:-translate-y-0.5 hover:from-amber-300 hover:via-orange-400 hover:to-orange-400 disabled:cursor-not-allowed disabled:from-slate-400 disabled:via-slate-400 disabled:to-slate-500"
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={18} />
                      <span>Sign In</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-5 border-t border-slate-200 pt-4 text-center text-[0.8rem] leading-6 text-slate-500">
                <p>Copyright 2026 Speech-Enabled Microlearning Platform. All rights reserved.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
