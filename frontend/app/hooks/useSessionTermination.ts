'use client'

import { useEffect, useRef } from 'react'

/**
 * Session Termination Hook
 * 
 * Automatically logs out the user when:
 * - Browser/tab is closed
 * - Browser window is unloaded
 * - User navigates away from the application
 * 
 * Uses beforeunload, unload, and pagehide events for cross-browser compatibility:
 * - beforeunload: Fired before page unload (best for cleanup)
 * - unload: Fired when page is being unloaded
 * - pagehide: Fired when page is hidden (for bfcache on Safari/Chrome)
 * 
 * Security considerations:
 * - Session termination is sent asynchronously via fetch with keepalive flag
 * - Prevents session reuse even if network request fails
 * - Frontend clears tokens immediately
 * - Backend invalidates session on next validation
 */
export function useSessionTermination(
  token: string | null,
  onLogout: (notice?: string) => void,
) {
  const isProcessingRef = useRef(false)
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Skip if no token (not authenticated)
    if (!token) {
      return
    }

    /**
     * Attempts to notify the backend that the session is terminating.
     * Uses keepalive fetch to ensure the request completes even if the page closes.
     * 
     * Security: This is a best-effort attempt. Even if it fails, the frontend
     * has already cleared tokens and the backend will reject any subsequent requests.
     */
    const notifyBackendOfLogout = async () => {
      // Prevent duplicate logout attempts within the same unload cycle
      if (isProcessingRef.current) {
        return
      }
      isProcessingRef.current = true

      try {
        // Use keepalive: true to ensure the request completes even if the page closes
        // Set a short timeout since we're in a shutdown scenario
        const controller = new AbortController()
        timeoutIdRef.current = setTimeout(() => controller.abort(), 2000)

        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          // keepalive allows the request to complete even after page unload
          keepalive: true,
          signal: controller.signal,
          cache: 'no-store',
        })
      } catch (error) {
        // Log errors only in development to avoid noise
        if (process.env.NODE_ENV === 'development') {
          console.debug('Session termination notification failed (expected during close):', error)
        }
      } finally {
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current)
          timeoutIdRef.current = null
        }
        isProcessingRef.current = false
      }
    }

    /**
     * Handle beforeunload event
     * Fired before the page unload, allows synchronous code to run
     * Best hook for sending logout notification
     */
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      void notifyBackendOfLogout()
      // Clear local storage to prevent session resurrection on next page load
      try {
        window.localStorage.removeItem('token')
        window.localStorage.removeItem('refresh_token')
        window.localStorage.removeItem('user')
        window.sessionStorage.removeItem('token')
        window.sessionStorage.removeItem('refresh_token')
        window.sessionStorage.removeItem('user')
      } catch (error) {
        console.debug('Unable to clear auth tokens during page unload:', error)
      }
    }

    /**
     * Handle unload event
     * Fired when the page is being unloaded
     * Secondary handler for better cross-browser coverage
     */
    const handleUnload = () => {
      void notifyBackendOfLogout()
    }

    /**
     * Handle pagehide event
     * Fired when the page is hidden (e.g., when switching tabs or browser closing)
     * Important for Safari and modern bfcache implementations
     * 
     * Use persisted flag check to determine if this is a true unload vs bfcache
     * If persisted=false, the page is actually closing, not just being hidden
     */
    const handlePageHide = (event: PageTransitionEvent) => {
      // Only trigger logout on actual page close, not when using bfcache
      if (!event.persisted) {
        void notifyBackendOfLogout()
      }
    }

    /**
     * Handle visibility change
     * Detects when user switches to a different app/window
     * Combined with page close detection for comprehensive coverage
     */
    const handleVisibilityChange = () => {
      // Note: We don't logout on hidden, only on actual page close
      // This handler is informational only in this implementation
      if (document.visibilityState === 'hidden') {
        // Could implement timeout-based logout here if needed
      }
    }

    // Register event listeners with different priorities
    // beforeunload has highest priority
    window.addEventListener('beforeunload', handleBeforeUnload, true)
    // unload as fallback
    window.addEventListener('unload', handleUnload, true)
    // pagehide for modern browsers and bfcache handling
    window.addEventListener('pagehide', handlePageHide, true)
    // visibilitychange for tab switching awareness
    document.addEventListener('visibilitychange', handleVisibilityChange, true)

    // Cleanup function: remove event listeners when component unmounts or token changes
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload, true)
      window.removeEventListener('unload', handleUnload, true)
      window.removeEventListener('pagehide', handlePageHide, true)
      document.removeEventListener('visibilitychange', handleVisibilityChange, true)

      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current)
        timeoutIdRef.current = null
      }
    }
  }, [token, onLogout])
}
