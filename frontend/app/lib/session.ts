'use client'

import { useAuth } from '@/app/context/AuthContext'

export function useSession() {
  const auth = useAuth()

  return {
    user: auth.user ? {
      id: auth.user.user_id,
      name: auth.user.user_name,
      email: auth.user.email,
      role: auth.user.user_role,
    } : null,
    token: auth.token,
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
  }
}
