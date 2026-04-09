'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

interface User {
  user_id: string
  user_role: 'admin' | 'trainer' | 'trainee'
  user_name: string
  email: string
  profile_image_url?: string | null
  must_change_password?: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshToken: () => Promise<string | null>
  updateUser: (updates: Partial<User>) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function isUserRole(value: unknown): value is User['user_role'] {
  return value === 'admin' || value === 'trainer' || value === 'trainee'
}

function normalizeStoredUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const candidate = raw as Partial<User> & {
    id?: unknown
    role?: unknown
    name?: unknown
    full_name?: unknown
  }

  const userId =
    typeof candidate.user_id === 'string'
      ? candidate.user_id
      : typeof candidate.id === 'string'
        ? candidate.id
        : null
  const userRole = isUserRole(candidate.user_role)
    ? candidate.user_role
    : isUserRole(candidate.role)
      ? candidate.role
      : null
  const userName =
    typeof candidate.user_name === 'string'
      ? candidate.user_name
      : typeof candidate.name === 'string'
        ? candidate.name
        : typeof candidate.full_name === 'string'
          ? candidate.full_name
          : null
  const email = typeof candidate.email === 'string' ? candidate.email : null
  const profileImageUrl =
    typeof candidate.profile_image_url === 'string' ? candidate.profile_image_url : null

  if (!userId || !userRole || !userName || !email) {
    return null
  }

  return {
    user_id: userId,
    user_role: userRole,
    user_name: userName,
    email,
    profile_image_url: profileImageUrl,
    must_change_password: Boolean(candidate.must_change_password),
  }
}

function clearStoredAuthState() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem('token')
    window.localStorage.removeItem('refresh_token')
    window.localStorage.removeItem('user')
  } catch (storageError) {
    console.warn('Unable to clear cached auth state:', storageError)
  }
}

function readStoredAuthState() {
  if (typeof window === 'undefined') {
    return {
      token: null,
      refreshToken: null,
      user: null,
    }
  }

  try {
    const savedToken = window.localStorage.getItem('token')
    const savedRefreshToken = window.localStorage.getItem('refresh_token')
    const savedUser = window.localStorage.getItem('user')

    if (!savedToken || !savedUser) {
      return {
        token: savedToken,
        refreshToken: savedRefreshToken,
        user: null,
      }
    }

    const parsedUser = normalizeStoredUser(JSON.parse(savedUser))
    if (!parsedUser) {
      clearStoredAuthState()
      return {
        token: null,
        refreshToken: null,
        user: null,
      }
    }

    return {
      token: savedToken,
      refreshToken: savedRefreshToken,
      user: parsedUser,
    }
  } catch (storageError) {
    console.warn('Ignoring invalid cached auth state:', storageError)
    clearStoredAuthState()
    return {
      token: null,
      refreshToken: null,
      user: null,
    }
  }
}

async function getApiErrorMessage(response: Response, fallback: string) {
  try {
    const errorData = await response.json()
    if (typeof errorData?.detail === 'string' && errorData.detail.trim()) {
      return errorData.detail
    }
  } catch {
    // Fall back to plain text or the supplied fallback when JSON isn't available.
  }

  try {
    const errorText = (await response.text()).trim()
    if (errorText) {
      return response.status >= 500
        ? 'Unable to reach the backend service. Start the backend server and try again.'
        : errorText
    }
  } catch {
    // Ignore text parsing errors and keep the fallback.
  }

  if (response.status >= 500) {
    return 'Unable to reach the backend service. Start the backend server and try again.'
  }

  return fallback
}

function buildUserFromResponse(data: {
  user: {
    id: string
    role: 'admin' | 'trainer' | 'trainee'
    full_name: string
    email: string
    profile_image_url?: string | null
  }
  must_change_password?: boolean
}): User {
  return {
    user_id: data.user.id,
    user_role: data.user.role,
    user_name: data.user.full_name,
    email: data.user.email,
    profile_image_url: data.user.profile_image_url ?? null,
    must_change_password: !!data.must_change_password,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [refreshTokenValue, setRefreshTokenValue] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize auth state from localStorage
  useEffect(() => {
    const storedAuth = readStoredAuthState()

    if (storedAuth.token && storedAuth.user) {
      setToken(storedAuth.token)
      setRefreshTokenValue(storedAuth.refreshToken)
      setUser(storedAuth.user)
    }

    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const trimmedEmail = email.trim().toLowerCase()
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password })
      })

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Login failed'))
      }

      const data = await response.json()
      
      // Validate response has required fields
      if (!data.access_token) {
        throw new Error('Invalid login response: missing access token')
      }
      if (!data.user) {
        throw new Error('Invalid login response: missing user data')
      }
      
      const userData = buildUserFromResponse(data)
      if (!userData) {
        throw new Error('Failed to process user data from login response')
      }
      
      setToken(data.access_token)
      setRefreshTokenValue(data.refresh_token || null)
      setUser(userData)

      try {
        localStorage.setItem('token', data.access_token)
        if (data.refresh_token) {
          localStorage.setItem('refresh_token', data.refresh_token)
        }
        localStorage.setItem('user', JSON.stringify(userData))
      } catch (storageError) {
        console.warn('Unable to cache auth state:', storageError)
      }
    } catch (error) {
      console.error('Login error:', error)
      if (error instanceof TypeError) {
        throw new Error('Unable to reach the backend service. Start the backend server and try again.')
      }
      throw error
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    setRefreshTokenValue(null)
    clearStoredAuthState()
  }

  const updateUser = (updates: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...updates }
      try {
        localStorage.setItem('user', JSON.stringify(next))
      } catch (storageError) {
        console.warn('Unable to update cached user:', storageError)
      }
      return next
    })
  }

  const refreshToken = async () => {
    try {
      const tokenForRefresh = refreshTokenValue || token
      if (!tokenForRefresh) return null

      const response = await fetch('/api/auth/refresh-token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenForRefresh}` }
      })

      if (!response.ok) {
        logout()
        throw new Error('Session expired. Please sign in again.')
      }

      const data = await response.json()
      setToken(data.access_token)
      setRefreshTokenValue(data.refresh_token || tokenForRefresh)
      if (data.user) {
        const nextUser = buildUserFromResponse(data)
        setUser(nextUser)
        try {
          localStorage.setItem('user', JSON.stringify(nextUser))
        } catch (storageError) {
          console.warn('Unable to update cached user after refresh:', storageError)
        }
      }
      try {
        localStorage.setItem('token', data.access_token)
        if (data.refresh_token) {
          localStorage.setItem('refresh_token', data.refresh_token)
        }
      } catch (storageError) {
        console.warn('Unable to cache refreshed auth state:', storageError)
      }
      return data.access_token as string
    } catch (error) {
      console.error('Token refresh error:', error)
      logout()
      return null
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshToken,
        updateUser
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
