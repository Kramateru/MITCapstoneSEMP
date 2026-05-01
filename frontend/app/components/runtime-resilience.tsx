'use client'

import { useEffect } from 'react'

import {
  attemptRecoverFromRuntimeAssetError,
  normalizeConnectivityError,
} from '@/app/utils/runtime-errors'

type RuntimeWindow = Window & typeof globalThis & {
  __speechEnablerOriginalFetch?: typeof window.fetch
  __speechEnablerFetchConsumers?: number
}

export function RuntimeResilience() {
  useEffect(() => {
    const runtimeWindow = window as RuntimeWindow
    const originalFetch = runtimeWindow.__speechEnablerOriginalFetch || window.fetch.bind(window)

    runtimeWindow.__speechEnablerOriginalFetch = originalFetch
    runtimeWindow.__speechEnablerFetchConsumers = (runtimeWindow.__speechEnablerFetchConsumers || 0) + 1

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        return await originalFetch(input, init)
      } catch (error) {
        throw normalizeConnectivityError(error)
      }
    }) as typeof window.fetch

    const handleError = (event: ErrorEvent) => {
      if (attemptRecoverFromRuntimeAssetError(event.error || event.message || event.filename)) {
        event.preventDefault()
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (attemptRecoverFromRuntimeAssetError(event.reason)) {
        event.preventDefault()
      }
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)

      runtimeWindow.__speechEnablerFetchConsumers = Math.max(
        0,
        (runtimeWindow.__speechEnablerFetchConsumers || 1) - 1,
      )

      if (runtimeWindow.__speechEnablerFetchConsumers === 0 && runtimeWindow.__speechEnablerOriginalFetch) {
        window.fetch = runtimeWindow.__speechEnablerOriginalFetch
      }
    }
  }, [])

  return null
}
