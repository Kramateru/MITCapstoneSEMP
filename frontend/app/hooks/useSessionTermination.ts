'use client'

import { useEffect } from 'react'

/**
 * Keeps authentication scoped to the browser tab/window lifetime.
 */
export function useSessionTermination(
  token: string | null,
  _onLogout: (notice?: string) => void,
) {
  useEffect(() => {
    if (!token) {
      return
    }

    try {
      window.localStorage.removeItem('token')
      window.localStorage.removeItem('refresh_token')
      window.localStorage.removeItem('supabase_access_token')
      window.localStorage.removeItem('supabase_refresh_token')
      window.localStorage.removeItem('active_session_id')
      window.localStorage.removeItem('strict_single_session')
      window.localStorage.removeItem('user')
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('Unable to clear legacy auth tokens:', error)
      }
    }
  }, [token, _onLogout])
}
