'use client'

import { useEffect } from 'react'

import {
  attemptRecoverFromRuntimeAssetError,
  markRuntimeAssetLoadSuccessful,
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

    const getRuntimeAssetErrorSource = (event: ErrorEvent) => {
      const resourceTarget = event.target
      if (resourceTarget instanceof HTMLScriptElement && resourceTarget.src) {
        return resourceTarget.src
      }
      if (resourceTarget instanceof HTMLLinkElement && resourceTarget.href) {
        return resourceTarget.href
      }
      return event.error || event.message || event.filename
    }

    const handleError = (event: ErrorEvent) => {
      if (attemptRecoverFromRuntimeAssetError(getRuntimeAssetErrorSource(event))) {
        event.preventDefault()
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (attemptRecoverFromRuntimeAssetError(event.reason)) {
        event.preventDefault()
      }
    }

    const handleLoad = () => {
      markRuntimeAssetLoadSuccessful()
    }

    if (document.readyState === 'complete') {
      window.setTimeout(handleLoad, 0)
    } else {
      window.addEventListener('load', handleLoad, { once: true })
    }

    window.addEventListener('error', handleError, true)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError, true)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('load', handleLoad)

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
